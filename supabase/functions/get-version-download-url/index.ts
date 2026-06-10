// Returns a short-lived signed URL for the latest (or specified) version of
// a project, gated by a paired desktop token. Used by the Electron app's
// "Open in Ableton" deep-link handler.
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
    if (!dt || dt.revoked_at) return json({ error: "invalid token" }, 401);

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

    if (project.owner_id !== dt.user_id) {
      const { data: collab } = await admin
        .from("collaborators")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", dt.user_id)
        .maybeSingle();
      if (!collab) return json({ error: "not authorized" }, 403);
    }

    // Pick version
    let q = admin
      .from("project_versions")
      .select("id, version_number, zip_url")
      .eq("project_id", projectId);
    if (versionId) q = q.eq("id", versionId);
    else q = q.order("version_number", { ascending: false }).order("created_at", { ascending: false }).limit(1);

    const { data: versions } = await q;
    const version = versions?.[0];
    if (!version) return json({ error: "no version found" }, 404);

    const { data: signed, error: signErr } = await admin.storage
      .from("project-zips")
      .createSignedUrl(version.zip_url, 300);
    if (signErr || !signed) return json({ error: signErr?.message ?? "sign failed" }, 500);

    // Touch last_used_at on the device token (best-effort)
    admin.from("device_tokens").update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash).then(() => {});

    return json({
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
