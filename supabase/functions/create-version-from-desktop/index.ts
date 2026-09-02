// Desktop app calls this with a device token to register a legacy ZIP or an
// incremental, content-addressed manifest version.
// Body: { project_id?: string, project_name?: string, bpm?: number, change_note?: string,
//          zip_storage_path: string, file_size_bytes: number, plugin_list?: any, track_list?: any }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ManifestFile = {
  path: string;
  sha256: string;
  logical_sha256?: string;
  size: number;
  mtime_ms: number;
};

type SampleCheck = {
  verified: boolean;
  included: number;
  missing: number;
  external: number;
  missing_paths: string[];
  external_paths: string[];
};

function parseSampleCheck(value: unknown): SampleCheck {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A sample completeness check is required");
  }
  const input = value as Record<string, unknown>;
  const counts = [input.included, input.missing, input.external];
  if (!counts.every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) {
    throw new Error("Invalid sample completeness check");
  }
  const [included, missing, external] = counts as number[];
  return {
    verified: input.verified !== false,
    included,
    missing,
    external,
    missing_paths: Array.isArray(input.missing_paths)
      ? input.missing_paths.slice(0, 10).map(String)
      : [],
    external_paths: Array.isArray(input.external_paths)
      ? input.external_paths.slice(0, 10).map(String)
      : [],
  };
}

function parseManifest(value: unknown): { schema_version: 1; files: ManifestFile[] } | null {
  if (value == null) return null;
  const input = value as { schema_version?: unknown; files?: unknown };
  if (input.schema_version !== 1 || !Array.isArray(input.files) || input.files.length > 20_000) {
    throw new Error("Invalid manifest schema");
  }
  const seenPaths = new Set<string>();
  let hasAbletonSet = false;
  const files = input.files.map((raw) => {
    const file = raw as Record<string, unknown>;
    const filePath = String(file.path ?? "").normalize("NFC");
    const sha256 = String(file.sha256 ?? "");
    const logical = file.logical_sha256 == null ? undefined : String(file.logical_sha256);
    const size = Number(file.size);
    const mtimeMs = Number(file.mtime_ms);
    if (!filePath || filePath.length > 1024 || filePath.startsWith("/") || filePath.includes("\\")) {
      throw new Error("Manifest contains an invalid path");
    }
    const segments = filePath.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("Manifest path traversal is not allowed");
    }
    const collisionKey = filePath.toLocaleLowerCase("en-US");
    if (seenPaths.has(collisionKey)) throw new Error("Manifest contains duplicate or colliding paths");
    seenPaths.add(collisionKey);
    if (!/^[0-9a-f]{64}$/.test(sha256) || (logical && !/^[0-9a-f]{64}$/.test(logical))) {
      throw new Error("Manifest contains an invalid SHA-256");
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > 5 * 1024 * 1024 * 1024) {
      throw new Error("Manifest contains an invalid file size");
    }
    if (!Number.isFinite(mtimeMs) || mtimeMs < 0) throw new Error("Manifest contains an invalid mtime");
    if (filePath.toLowerCase().endsWith(".als")) hasAbletonSet = true;
    return { path: filePath, sha256, logical_sha256: logical, size, mtime_ms: mtimeMs };
  });
  if (!hasAbletonSet) throw new Error("Manifest does not contain an Ableton .als file");
  return { schema_version: 1, files };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing device token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = auth.slice(7).trim();
    const tokenHash = await sha256Hex(token);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRow } = await admin
      .from("device_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "Invalid or revoked token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = tokenRow.user_id;
    const body = await req.json();

    let sampleCheck: SampleCheck;
    try {
      sampleCheck = parseSampleCheck(body.sample_check);
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const shareReady = sampleCheck.verified && sampleCheck.missing === 0 && sampleCheck.external === 0;

    if (body.metadata_only === true) {
      const versionId = String(body.version_id ?? "");
      if (!versionId) {
        return new Response(JSON.stringify({ error: "version_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: version } = await admin
        .from("project_versions")
        .select("id, project_id")
        .eq("id", versionId)
        .maybeSingle();
      const { data: ownedProject } = version
        ? await admin.from("projects").select("id").eq("id", version.project_id).eq("owner_id", userId).maybeSingle()
        : { data: null };
      if (!version || !ownedProject) {
        return new Response(JSON.stringify({ error: "version not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: updateError } = await admin
        .from("project_versions")
        .update({ sample_check: sampleCheck })
        .eq("id", versionId);
      if (updateError) throw updateError;
      await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
      return new Response(JSON.stringify({
        project_id: version.project_id,
        version_id: version.id,
        share_ready: shareReady,
        sample_check: sampleCheck,
        metadata_only: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const zipPath = String(body.zip_storage_path ?? "");
    const manifest = parseManifest(body.manifest);
    const fileSize = Number(body.file_size_bytes ?? 0);
    if ((!zipPath && !manifest) || !Number.isSafeInteger(fileSize) || fileSize < 0) {
      return new Response(JSON.stringify({ error: "A ZIP path or manifest and a valid file_size_bytes value are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (manifest) {
      const reservationId = String(body.reservation_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(reservationId)) {
        return new Response(JSON.stringify({
          code: "RESERVATION_REQUIRED",
          error: "A valid upload reservation is required",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: reservation } = await admin.from("upload_reservations")
        .select("id,storage_owner_id,uploader_id,status,expires_at")
        .eq("id", reservationId).eq("uploader_id", userId).maybeSingle();
      if (!reservation) {
        return new Response(JSON.stringify({ code: "RESERVATION_NOT_FOUND", error: "Upload reservation not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (reservation.status !== "active" || new Date(reservation.expires_at).getTime() <= Date.now()) {
        return new Response(JSON.stringify({ code: "RESERVATION_EXPIRED", error: "Upload reservation expired" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: reservedBlobs, error: reservedError } = await admin
        .from("upload_reservation_blobs")
        .select("sha256,size_bytes,object_path")
        .eq("reservation_id", reservationId);
      if (reservedError) throw reservedError;

      const expected = new Map((reservedBlobs ?? []).map((blob) => [blob.sha256, blob]));
      const found = new Map<string, number>();
      for (let offset = 0; expected.size && offset < 100_000; offset += 1000) {
        const { data: objects, error: listError } = await admin.storage.from("project-blobs")
          .list(reservation.storage_owner_id, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (listError) throw listError;
        for (const object of objects ?? []) {
          if (expected.has(object.name)) found.set(object.name, Number(object.metadata?.size ?? 0));
        }
        if (!objects || objects.length < 1000 || found.size === expected.size) break;
      }

      const readyBlobs = [];
      for (const [sha256, expectedBlob] of expected) {
        const actualSize = found.get(sha256);
        if (actualSize == null) {
          return new Response(JSON.stringify({ code: "BLOB_MISSING", error: `Missing content blob ${sha256}` }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (actualSize !== Number(expectedBlob.size_bytes)) {
          return new Response(JSON.stringify({ code: "BLOB_SIZE_MISMATCH", error: `Invalid content blob ${sha256}` }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        readyBlobs.push({ sha256, size: actualSize });
      }

      const { data: result, error: finalizeError } = await admin.rpc("finalize_manifest_project_version", {
        _reservation_id: reservationId,
        _uploader_id: userId,
        _project_name: String(body.project_name ?? "Untitled"),
        _manifest: manifest,
        _logical_size: fileSize,
        _change_note: body.change_note ?? "Auto-saved from desktop",
        _bpm: body.bpm ?? null,
        _plugin_list: body.plugin_list ?? null,
        _track_list: body.track_list ?? null,
        _ableton_version: body.ableton_version ?? null,
        _sample_check: sampleCheck,
        _ready_blobs: readyBlobs,
        _uploaded_bytes: Number(body.bytes_uploaded ?? 0),
        _reused_bytes: Math.max(0, fileSize - Number(body.bytes_uploaded ?? 0)),
      });
      if (finalizeError || !result?.version_id) {
        const message = finalizeError?.message ?? "VERSION_FINALIZATION_FAILED";
        const code = ["RESERVATION_EXPIRED", "BLOB_MISSING", "PROJECT_LIMIT_REACHED"]
          .find((candidate) => message.includes(candidate)) ?? "VERSION_FINALIZATION_FAILED";
        return new Response(JSON.stringify({ code, error: message }), {
          status: code === "BLOB_MISSING" || code === "RESERVATION_EXPIRED" ? 409 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
      return new Response(JSON.stringify({
        ...result,
        share_ready: shareReady,
        sample_check: sampleCheck,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      code: "LEGACY_ZIP_UPLOAD_DISABLED",
      error: "Full-project ZIP uploads are disabled. Update Tunesfork Sync to use incremental sync.",
    }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[create-version-from-desktop]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
