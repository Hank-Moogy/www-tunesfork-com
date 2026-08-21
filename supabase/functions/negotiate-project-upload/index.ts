import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const BodySchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  files: z.array(z.object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().nonnegative().max(5 * 1024 * 1024 * 1024),
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
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256Hex(token);
    const { data: tokenRow } = await admin.from("device_tokens")
      .select("id,user_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
    if (!tokenRow) return json({ error: "Invalid or revoked token" }, 401);

    if (parsed.data.project_id) {
      const { data: project } = await admin.from("projects")
        .select("id,owner_id").eq("id", parsed.data.project_id).maybeSingle();
      if (!project) return json({ error: "Project not found" }, 404);
      if (project.owner_id !== tokenRow.user_id) {
        const { data: collaborator } = await admin.from("collaborators")
          .select("permission_level")
          .eq("project_id", project.id).eq("user_id", tokenRow.user_id).maybeSingle();
        if (collaborator?.permission_level !== "contributor") {
          return json({ error: "Not allowed to upload to this project" }, 403);
        }
      }
    }

    const unique = new Map(parsed.data.files.map((file) => [file.sha256, file]));
    const known = new Set<string>();
    const hashes = [...unique.keys()];
    for (let offset = 0; offset < hashes.length; offset += 100) {
      const { data, error } = await admin.from("project_blobs")
        .select("sha256,size_bytes")
        .eq("user_id", tokenRow.user_id)
        .in("sha256", hashes.slice(offset, offset + 100));
      if (error) throw error;
      for (const blob of data ?? []) {
        const requested = unique.get(blob.sha256);
        if (requested && Number(blob.size_bytes) === requested.size) known.add(blob.sha256);
      }
    }

    const missing = [];
    for (const [sha256] of unique) {
      if (known.has(sha256)) continue;
      const objectPath = `${tokenRow.user_id}/${sha256}`;
      const { data, error } = await admin.storage.from("project-blobs")
        .createSignedUploadUrl(objectPath, { upsert: false });
      if (error || !data?.signedUrl) throw new Error(error?.message ?? `Could not authorize ${sha256}`);
      missing.push({ sha256, object_path: objectPath, signed_url: data.signedUrl, token: data.token });
    }

    await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
    return json({ missing, reused: unique.size - missing.length });
  } catch (error) {
    console.error("[negotiate-project-upload]", error);
    return json({ error: (error as Error).message }, 500);
  }
});
