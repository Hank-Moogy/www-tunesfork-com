// Deletes project ZIPs and audio previews that no project_versions row references.
//
// Safety:
//  - requires CLEANUP_TOKEN as the bearer token (ops-only endpoint)
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
    const referencedAudio = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("project_versions")
        .select("zip_url,audio_preview_url")
        .range(from, from + 999);
      if (error) throw error;
      for (const r of data ?? []) {
        if (r.zip_url) referenced.add(r.zip_url);
        if (r.audio_preview_url) {
          try {
            const marker = "/storage/v1/object/public/audio-previews/";
            const pathname = new URL(r.audio_preview_url).pathname;
            const markerIndex = pathname.indexOf(marker);
            if (markerIndex >= 0) {
              referencedAudio.add(decodeURIComponent(pathname.slice(markerIndex + marker.length)));
            }
          } catch {
            // Invalid legacy URLs remain untouched because they cannot map to a bucket path.
          }
        }
      }
      if (!data || data.length < 1000) break;
    }

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const scanBucket = async (bucket: string, bucketReferences: Set<string>) => {
      const orphans: string[] = [];
      let totalObjects = 0;
      const { data: top, error: topErr } = await admin.storage
        .from(bucket)
        .list("", { limit: 1000 });
      if (topErr) throw topErr;

      for (const entry of top ?? []) {
        if (entry.id) {
          totalObjects++;
          continue;
        }
        for (let offset = 0; ; offset += 1000) {
          const { data: files, error } = await admin.storage
            .from(bucket)
            .list(entry.name, { limit: 1000, offset });
          if (error) throw error;
          for (const file of files ?? []) {
            if (!file.id) continue;
            totalObjects++;
            const full = `${entry.name}/${file.name}`;
            const createdAt = file.created_at ? new Date(file.created_at).getTime() : 0;
            if (!bucketReferences.has(full) && createdAt < cutoff) orphans.push(full);
          }
          if (!files || files.length < 1000) break;
        }
      }
      return { totalObjects, orphans };
    };

    const zipScan = await scanBucket("project-zips", referenced);
    const audioScan = await scanBucket("audio-previews", referencedAudio);

    let deleted = 0;
    if (confirm) {
      for (const [bucket, orphans] of [
        ["project-zips", zipScan.orphans],
        ["audio-previews", audioScan.orphans],
      ] as const) {
        for (let i = 0; i < orphans.length; i += 100) {
          const batch = orphans.slice(i, i + 100);
          const { error } = await admin.storage.from(bucket).remove(batch);
          if (error) throw error;
          deleted += batch.length;
        }
      }
    }

    return new Response(JSON.stringify({
      mode: confirm ? "delete" : "dry-run",
      total_objects: zipScan.totalObjects + audioScan.totalObjects,
      referenced: referenced.size + referencedAudio.size,
      orphans: zipScan.orphans.length + audioScan.orphans.length,
      deleted,
      buckets: {
        project_zips: {
          total: zipScan.totalObjects,
          referenced: referenced.size,
          orphans: zipScan.orphans.length,
        },
        audio_previews: {
          total: audioScan.totalObjects,
          referenced: referencedAudio.size,
          orphans: audioScan.orphans.length,
        },
      },
      sample: [
        ...zipScan.orphans.map((path) => ({ bucket: "project-zips", path })),
        ...audioScan.orphans.map((path) => ({ bucket: "audio-previews", path })),
      ].slice(0, 10),
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cleanup-orphaned-zips]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
