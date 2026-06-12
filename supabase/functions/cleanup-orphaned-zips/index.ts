// Deletes project-zips objects that no project_versions row references —
// e.g. zips left behind after a project/version row was deleted, or uploads
// that never completed registration.
//
// Safety:
//  - requires the service-role key as the bearer token (ops-only endpoint)
//  - dry-run by default; pass ?confirm=true to actually delete
//  - never touches objects younger than 24h (an in-flight upload creates the
//    object before its version row exists)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const opsToken = Deno.env.get("CLEANUP_TOKEN");
    const auth = req.headers.get("Authorization") ?? "";
    if (!opsToken || auth !== `Bearer ${opsToken}`) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
    const confirm = new URL(req.url).searchParams.get("confirm") === "true";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Every zip path referenced by a version row
    const referenced = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("project_versions")
        .select("zip_url")
        .range(from, from + 999);
      if (error) throw error;
      for (const r of data ?? []) if (r.zip_url) referenced.add(r.zip_url);
      if (!data || data.length < 1000) break;
    }

    // Walk the bucket: top-level folders are user ids, files live below them
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const orphans: string[] = [];
    let totalObjects = 0;
    const { data: top, error: topErr } = await admin.storage
      .from("project-zips")
      .list("", { limit: 1000 });
    if (topErr) throw topErr;

    for (const entry of top ?? []) {
      if (entry.id) {
        // top-level file (unexpected layout) — count it, leave it alone
        totalObjects++;
        continue;
      }
      for (let offset = 0; ; offset += 1000) {
        const { data: files, error } = await admin.storage
          .from("project-zips")
          .list(entry.name, { limit: 1000, offset });
        if (error) throw error;
        for (const f of files ?? []) {
          if (!f.id) continue;
          totalObjects++;
          const full = `${entry.name}/${f.name}`;
          const createdAt = f.created_at ? new Date(f.created_at).getTime() : 0;
          if (!referenced.has(full) && createdAt < cutoff) orphans.push(full);
        }
        if (!files || files.length < 1000) break;
      }
    }

    let deleted = 0;
    if (confirm && orphans.length > 0) {
      for (let i = 0; i < orphans.length; i += 100) {
        const batch = orphans.slice(i, i + 100);
        const { error } = await admin.storage.from("project-zips").remove(batch);
        if (error) throw error;
        deleted += batch.length;
      }
    }

    return new Response(JSON.stringify({
      mode: confirm ? "delete" : "dry-run",
      total_objects: totalObjects,
      referenced: referenced.size,
      orphans: orphans.length,
      deleted,
      sample: orphans.slice(0, 10),
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cleanup-orphaned-zips]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
