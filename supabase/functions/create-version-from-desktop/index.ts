// Desktop app calls this with a device token to register a new version after uploading a zip.
// Body: { project_id?: string, project_name?: string, bpm?: number, change_note?: string,
//          zip_storage_path: string, file_size_bytes: number, plugin_list?: any, track_list?: any }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const zipPath = String(body.zip_storage_path ?? "");
    const fileSize = Number(body.file_size_bytes ?? 0);
    if (!zipPath || !fileSize) {
      return new Response(JSON.stringify({ error: "zip_storage_path and file_size_bytes required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        zip_url: zipPath,
        plugin_list: body.plugin_list ?? null,
        track_list: body.track_list ?? null,
        ableton_version: body.ableton_version ?? null,
        sample_check: body.sample_check ?? null,
        file_size_bytes: fileSize,
      })
      .select()
      .single();
    if (vErr) throw vErr;

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
