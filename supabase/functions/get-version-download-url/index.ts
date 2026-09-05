// Returns a short-lived signed URL for the latest (or specified) version of
// a project, gated by a paired desktop token or authenticated web session.
// Used by Electron restore and browser downloads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing token" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const tokenHash = await sha256Hex(token);
    const { data: dt } = await admin
      .from("device_tokens")
      .select("user_id, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    let userId: string | null = null;
    if (dt && !dt.revoked_at) {
      userId = dt.user_id;
    } else {
      const { data: authData } = await admin.auth.getUser(token);
      userId = authData.user?.id ?? null;
    }
    if (!userId) return json({ error: "invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body.project_id;
    const versionId: string | null = body.version_id ?? null;
    if (!projectId) return json({ error: "project_id required" }, 400);

    // Authorize: user must own or be a collaborator on the project
    const { data: project } = await admin
      .from("projects")
      .select("id, name, owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return json({ error: "project not found" }, 404);

    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: collab } = await admin
        .from("collaborators")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!collab) return json({ error: "not authorized" }, 403);
    }

    // Pick version
    let q = admin
      .from("project_versions")
      .select("id, version_number, zip_url, manifest, sample_check, file_size_bytes")
      .eq("project_id", projectId);
    if (versionId) q = q.eq("id", versionId);
    else q = q.order("version_number", { ascending: false }).order("created_at", { ascending: false }).limit(1);

    const { data: versions } = await q;
    const version = versions?.[0];
    if (!version) return json({ error: "no version found" }, 404);

    if (version.manifest?.schema_version === 1 && Array.isArray(version.manifest.files)) {
      const uniqueHashes = [...new Set<string>(version.manifest.files.map((file: { sha256: string }) => file.sha256))];
      const requestedHashes = Array.isArray(body.blob_hashes)
        ? [...new Set<string>(body.blob_hashes.map(String))]
        : null;
      if (requestedHashes && (requestedHashes.length === 0 || requestedHashes.length > 100)) {
        return json({ error: "blob_hashes must contain between 1 and 100 hashes" }, 400);
      }
      if (requestedHashes?.some((sha256) => !uniqueHashes.includes(sha256))) {
        return json({ error: "requested blob is not part of this version" }, 400);
      }
      const hashesToSign = requestedHashes ?? [];

      if (!requestedHashes) {
        await admin.from("storage_transfer_events").insert({
          user_id: userId, project_id: projectId, version_id: version.id,
          direction: "restore", bytes: Number(version.file_size_bytes || 0), app_surface: dt ? "desktop" : "web",
        });
        return json({
          kind: "manifest",
          manifest: {
            schema_version: 1,
            files: version.manifest.files,
          },
          projectName: project.name,
          versionId: version.id,
          versionNumber: version.version_number,
        });
      }

      // Older rows may not expose uploader_id in the selected shape. Resolve blob
      // ownership from the registry so collaborator downloads remain supported.
      const { data: blobs, error: blobError } = await admin.from("project_version_blobs")
        .select("sha256,user_id").eq("version_id", version.id).in("sha256", hashesToSign);
      if (blobError) return json({ error: blobError.message }, 500);
      if ((blobs ?? []).length !== hashesToSign.length) return json({ error: "BLOB_MISSING" }, 409);
      const ownerByHash = new Map((blobs ?? []).map((blob) => [blob.sha256, blob.user_id]));

      // A delta-encoded blob is a patch: the client also needs its base to rebuild
      // the file, so sign both. Deltas are depth 1, so one extra lookup suffices.
      const { data: encodings, error: encodingError } = await admin.from("project_blobs")
        .select("sha256,user_id,encoding,base_sha256")
        .eq("user_id", project.owner_id).in("sha256", hashesToSign);
      if (encodingError) return json({ error: encodingError.message }, 500);
      const encodingByHash = new Map((encodings ?? []).map((blob) => [blob.sha256, blob]));
      const baseHashes = [...new Set(
        (encodings ?? [])
          .filter((blob) => blob.encoding === "als_xml_delta" && blob.base_sha256)
          .map((blob) => blob.base_sha256 as string),
      )].filter((sha256) => !hashesToSign.includes(sha256));

      const pathsToSign = [
        ...hashesToSign.map((sha256) => `${ownerByHash.get(sha256) ?? project.owner_id}/${sha256}`),
        ...baseHashes.map((sha256) => `${project.owner_id}/${sha256}`),
      ];
      const { data: signedBlobs, error: signError } = await admin.storage
        .from("project-blobs").createSignedUrls(pathsToSign, 900);
      if (signError || !signedBlobs) return json({ error: signError?.message ?? "sign failed" }, 500);
      const allHashes = [...hashesToSign, ...baseHashes];
      const urlByHash = new Map(allHashes.map((sha256, index) => [sha256, signedBlobs[index]?.signedUrl]));
      if ([...urlByHash.values()].some((signedUrl) => !signedUrl)) {
        return json({ error: "Could not sign every content blob" }, 500);
      }
      return json({
        kind: "blob_urls",
        blobs: hashesToSign.map((sha256) => {
          const encoding = encodingByHash.get(sha256);
          return {
            sha256,
            signed_url: urlByHash.get(sha256),
            encoding: encoding?.encoding ?? "raw",
            base_sha256: encoding?.base_sha256 ?? null,
            base_signed_url: encoding?.base_sha256 ? urlByHash.get(encoding.base_sha256) ?? null : null,
          };
        }),
        versionId: version.id,
      });
    }

    if (!version.zip_url) return json({ error: "version has no downloadable payload" }, 409);
    const { data: signed, error: signErr } = await admin.storage.from("project-zips")
      .createSignedUrl(version.zip_url, 300);
    if (signErr || !signed) return json({ error: signErr?.message ?? "sign failed" }, 500);

    // Touch last_used_at on the device token (best-effort)
    admin.from("device_tokens").update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash).then(() => {});
    await admin.from("storage_transfer_events").insert({
      user_id: userId, project_id: projectId, version_id: version.id,
      direction: "restore", bytes: Number(version.file_size_bytes || 0), app_surface: dt ? "desktop" : "web",
    });

    return json({
      kind: "zip",
      signedUrl: signed.signedUrl,
      projectName: project.name,
      versionId: version.id,
      versionNumber: version.version_number,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
