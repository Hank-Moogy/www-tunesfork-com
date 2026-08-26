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
  const files = input.files.map((raw) => {
    const file = raw as Record<string, unknown>;
    const filePath = String(file.path ?? "");
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
    if (seenPaths.has(filePath)) throw new Error("Manifest contains duplicate paths");
    seenPaths.add(filePath);
    if (!/^[0-9a-f]{64}$/.test(sha256) || (logical && !/^[0-9a-f]{64}$/.test(logical))) {
      throw new Error("Manifest contains an invalid SHA-256");
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > 5 * 1024 * 1024 * 1024) {
      throw new Error("Manifest contains an invalid file size");
    }
    if (!Number.isFinite(mtimeMs) || mtimeMs < 0) throw new Error("Manifest contains an invalid mtime");
    return { path: filePath, sha256, logical_sha256: logical, size, mtime_ms: mtimeMs };
  });
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
    if (sampleCheck.missing > 0 || sampleCheck.external > 0) {
      return new Response(JSON.stringify({
        error: "Collect all referenced samples into the Ableton project before uploading",
        sample_check: sampleCheck,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zipPath = String(body.zip_storage_path ?? "");
    const manifest = parseManifest(body.manifest);
    const fileSize = Number(body.file_size_bytes ?? 0);
    if ((!zipPath && !manifest) || !Number.isSafeInteger(fileSize) || fileSize < 0) {
      return new Response(JSON.stringify({ error: "A ZIP path or manifest and a valid file_size_bytes value are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blobReferences: { user_id: string; sha256: string }[] = [];
    if (manifest) {
      const uniqueFiles = new Map(manifest.files.map((file) => [file.sha256, file]));
      const registered = new Set<string>();
      const hashes = [...uniqueFiles.keys()];
      for (let offset = 0; offset < hashes.length; offset += 100) {
        const { data, error } = await admin.from("project_blobs")
          .select("sha256,size_bytes")
          .eq("user_id", userId)
          .in("sha256", hashes.slice(offset, offset + 100));
        if (error) throw error;
        for (const blob of data ?? []) {
          const expected = uniqueFiles.get(blob.sha256);
          if (expected && Number(blob.size_bytes) === expected.size) registered.add(blob.sha256);
        }
      }

      for (const [sha256, expected] of uniqueFiles) {
        if (!registered.has(sha256)) {
          const { data: objects, error } = await admin.storage.from("project-blobs")
            .list(userId, { search: sha256, limit: 10 });
          if (error) throw error;
          const object = objects?.find((candidate) => candidate.name === sha256);
          if (!object || Number(object.metadata?.size) !== expected.size) {
            return new Response(JSON.stringify({ error: `Missing or invalid content blob ${sha256}` }), {
              status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const { error: upsertError } = await admin.from("project_blobs").upsert({
            user_id: userId,
            sha256,
            size_bytes: expected.size,
            object_path: `${userId}/${sha256}`,
          }, { onConflict: "user_id,sha256" });
          if (upsertError) throw upsertError;
        }
        blobReferences.push({ user_id: userId, sha256 });
      }
    }

    // Resolve project: existing or new
    let projectId: string;
    if (body.project_id) {
      const { data: proj } = await admin.from("projects").select("id, owner_id").eq("id", body.project_id).maybeSingle();
      if (!proj) {
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Ownership/contributor check
      if (proj.owner_id !== userId) {
        const { data: collab } = await admin
          .from("collaborators")
          .select("permission_level")
          .eq("project_id", proj.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!collab || collab.permission_level !== "contributor") {
          return new Response(JSON.stringify({ error: "Not allowed to upload to this project" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      projectId = proj.id;
    } else {
      const projectName = String(body.project_name ?? "Untitled").slice(0, 200);

      // Try to find an existing project owned by this user with the same name.
      // This makes repeated saves of the same .als append as new versions instead
      // of creating duplicate projects on every save.
      const { data: existing } = await admin
        .from("projects")
        .select("id")
        .eq("owner_id", userId)
        .eq("name", projectName)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        projectId = existing.id;
      } else {
        const { data: created, error: cErr } = await admin
          .from("projects")
          .insert({ name: projectName, bpm: body.bpm ?? null, owner_id: userId })
          .select()
          .single();
        if (cErr) throw cErr;
        projectId = created.id;
      }
    }

    // Desktop saves are snapshots within the current major version: they reuse
    // the highest version_number (saves group by duplicate version_number).
    // promote_project_version() creates the next major; autosync must not turn
    // every Ableton save into V2, V3, V4...
    const { data: latest } = await admin
      .from("project_versions")
      .select("version_number, major_version")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);
    const versionNumber = latest && latest[0]?.version_number ? latest[0].version_number : 1;
    const majorVersion = latest && latest[0]?.major_version ? latest[0].major_version : versionNumber;
    const isFirstVersion = !latest || latest.length === 0;

    const { data: version, error: vErr } = await admin
      .from("project_versions")
      .insert({
        project_id: projectId,
        version_number: versionNumber,
        major_version: majorVersion,
        is_main_version: isFirstVersion,
        uploader_id: userId,
        change_note: body.change_note ?? "Auto-saved from desktop",
        zip_url: zipPath || null,
        manifest,
        plugin_list: body.plugin_list ?? null,
        track_list: body.track_list ?? null,
        ableton_version: body.ableton_version ?? null,
        sample_check: sampleCheck,
        file_size_bytes: fileSize,
      })
      .select()
      .single();
    if (vErr) throw vErr;

    if (blobReferences.length) {
      const { error: refError } = await admin.from("project_version_blobs").insert(
        blobReferences.map((blob) => ({ version_id: version.id, ...blob })),
      );
      if (refError) {
        await admin.from("project_versions").delete().eq("id", version.id);
        throw refError;
      }
    }

    // Bump the project's updated_at (and refresh BPM if we got one) so the
    // dashboard card and project page reflect the latest save.
    const projectUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.bpm != null) projectUpdate.bpm = body.bpm;
    await admin.from("projects").update(projectUpdate).eq("id", projectId);

    await admin.from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

    return new Response(
      JSON.stringify({ project_id: projectId, version_id: version.id, version_number: versionNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[create-version-from-desktop]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
