import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const BodySchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  logical_size: z.number().int().nonnegative().optional(),
  files: z.array(z.object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().nonnegative().max(5 * 1024 * 1024 * 1024),
    // Optional delta proposal. The client cannot know whether the server still
    // holds the base it cached, so an unusable one is downgraded to a whole
    // upload by reserve_project_upload rather than failing the sync.
    encoding: z.enum(["raw", "als_xml_delta"]).optional(),
    base_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    stored_bytes: z.number().int().positive().max(5 * 1024 * 1024 * 1024).optional(),
  })).max(20_000),
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing device token" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({
        code: "MANIFEST_INVALID",
        error: "Upload manifest negotiation payload is invalid",
        detail: parsed.error.flatten(),
      }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256Hex(token);
    const { data: tokenRow } = await admin.from("device_tokens")
      .select("id,user_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
    if (!tokenRow) return json({ error: "Invalid or revoked token" }, 401);

    const unique = new Map(parsed.data.files.map((file) => [file.sha256, file]));
    const { data: reservation, error: reserveError } = await admin.rpc("reserve_project_upload", {
      _uploader_id: tokenRow.user_id,
      _project_id: parsed.data.project_id ?? null,
      _files: [...unique.values()].map((file) => ({
        sha256: file.sha256,
        size_bytes: file.size,
        encoding: file.encoding ?? "raw",
        base_sha256: file.encoding === "als_xml_delta" ? file.base_sha256 ?? null : null,
        stored_bytes: file.encoding === "als_xml_delta" ? file.stored_bytes ?? null : file.size,
      })),
    });
    if (reserveError || !reservation?.reservation_id) {
      const message = reserveError?.message ?? "UPLOAD_RESERVATION_FAILED";
      const code = message.includes("QUOTA_EXCEEDED")
        ? "QUOTA_EXCEEDED"
        : message.includes("UPLOAD_CONFLICT")
        ? "UPLOAD_CONFLICT"
        : message.includes("BLOB_SIZE_MISMATCH")
        ? "BLOB_SIZE_MISMATCH"
        : message.includes("PROJECT_LIMIT_REACHED")
        ? "PROJECT_LIMIT_REACHED"
        : message.includes("PROJECT_UPLOAD_FORBIDDEN")
        ? "PROJECT_UPLOAD_FORBIDDEN"
        : message.includes("PROJECT_NOT_FOUND")
        ? "PROJECT_NOT_FOUND"
        : "UPLOAD_RESERVATION_FAILED";
      const status = code === "QUOTA_EXCEEDED" ? 413
        : code === "UPLOAD_CONFLICT" ? 409
        : code === "BLOB_SIZE_MISMATCH" ? 409
        : code === "PROJECT_LIMIT_REACHED" ? 409
        : code === "PROJECT_UPLOAD_FORBIDDEN" ? 403
        : code === "PROJECT_NOT_FOUND" ? 404
        : 400;
      return json({ code, error: message, detail: reserveError?.details ?? null }, status);
    }

    const missing = [];
    try {
      for (const target of reservation.missing ?? []) {
        const { data, error } = await admin.storage.from("project-blobs")
          .createSignedUploadUrl(target.object_path, { upsert: false });
        if (error || !data?.signedUrl) {
          throw new Error(error?.message ?? `Could not authorize ${target.sha256}`);
        }
        missing.push({
          sha256: target.sha256,
          size: target.size,
          object_path: target.object_path,
          signed_url: data.signedUrl,
          token: data.token,
          // What the server actually accepted, which may be a downgrade to raw.
          encoding: target.encoding ?? "raw",
          base_sha256: target.base_sha256 ?? null,
          stored_bytes: Number(target.stored_bytes ?? target.size),
        });
      }
    } catch (error) {
      await admin.rpc("cancel_upload_reservation", {
        _reservation_id: reservation.reservation_id,
        _uploader_id: tokenRow.user_id,
      });
      throw error;
    }

    await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
    const missingBytes = missing.reduce((sum, blob) => sum + Number(blob.stored_bytes || 0), 0);
    return json({
      reservation_id: reservation.reservation_id,
      expires_at: reservation.expires_at,
      missing,
      reused: unique.size - missing.length,
      reused_bytes: parsed.data.logical_size == null
        ? reservation.reused_bytes ?? 0
        : Math.max(0, parsed.data.logical_size - missingBytes),
      usage: reservation.usage,
    });
  } catch (error) {
    console.error("[negotiate-project-upload]", error);
    return json({ code: "UPLOAD_RESERVATION_FAILED", error: (error as Error).message }, 500);
  }
});
