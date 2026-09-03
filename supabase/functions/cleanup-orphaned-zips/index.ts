// Deletes project ZIPs and audio previews that no project_versions row references.
//
// Safety:
//  - requires CLEANUP_TOKEN as the bearer token (ops-only endpoint)
//  - dry-run by default; pass ?confirm=true to actually delete
//  - never touches objects younger than 24h (an in-flight upload creates the
//    object before its version row exists)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  let admin: ReturnType<typeof createClient> | null = null;
  let cleanupRunId: string | null = null;
  let scannedObjects = 0;
  let scannedBytes = 0;
  let candidateObjects = 0;
  let candidateBytes = 0;
  let deletedObjects = 0;
  let reclaimedBytes = 0;
  let failedObjects = 0;
  const runErrors: string[] = [];
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

    admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: cleanupRun } = await admin.from("storage_cleanup_runs").insert({
      mode: confirm ? "delete" : "dry_run",
    }).select("id").single();
    cleanupRunId = cleanupRun?.id ?? null;
    await admin.from("upload_reservations").update({ status: "expired" })
      .eq("status", "active").lt("expires_at", new Date().toISOString());

    // Every zip path referenced by a version row
    const referenced = new Set<string>();
    const referencedAudio = new Set<string>();
    const referencedBlobs = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("project_versions")
        .select("zip_url,audio_preview_url")
        .order("id", { ascending: true })
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

    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("project_blobs")
        .select("user_id,sha256,object_path,project_version_blobs!inner(version_id)")
        .eq("status", "ready")
        .order("user_id", { ascending: true })
        .order("sha256", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      for (const blob of data ?? []) referencedBlobs.add(blob.object_path || `${blob.user_id}/${blob.sha256}`);
      if (!data || data.length < 1000) break;
    }

    for (let from = 0; ; from += 1000) {
      const { data: activeReservationBlobs, error: reservationBlobError } = await admin
        .from("upload_reservation_blobs")
        .select("object_path,upload_reservations!inner(status,expires_at)")
        .eq("upload_reservations.status", "active")
        .gt("upload_reservations.expires_at", new Date().toISOString())
        .order("reservation_id", { ascending: true })
        .order("sha256", { ascending: true })
        .range(from, from + 999);
      if (reservationBlobError) throw reservationBlobError;
      for (const blob of activeReservationBlobs ?? []) referencedBlobs.add(blob.object_path);
      if (!activeReservationBlobs || activeReservationBlobs.length < 1000) break;
    }

    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (let from = 0; ; from += 1000) {
      const { data: graceCandidates, error: graceError } = await admin
        .from("storage_deletion_candidates")
        .select("bucket,object_path")
        .gt("unreferenced_at", new Date(cutoff).toISOString())
        .order("bucket", { ascending: true })
        .order("object_path", { ascending: true })
        .range(from, from + 999);
      if (graceError) throw graceError;
      for (const candidate of graceCandidates ?? []) {
        if (candidate.bucket === "project-zips") referenced.add(candidate.object_path);
        else if (candidate.bucket === "audio-previews") referencedAudio.add(candidate.object_path);
        else if (candidate.bucket === "project-blobs") referencedBlobs.add(candidate.object_path);
      }
      if (!graceCandidates || graceCandidates.length < 1000) break;
    }

    const scanBucket = async (bucket: string, bucketReferences: Set<string>) => {
      const orphans: { path: string; size: number }[] = [];
      let totalObjects = 0;
      let totalBytes = 0;
      for (let topOffset = 0; ; topOffset += 1000) {
        const { data: top, error: topErr } = await admin.storage
          .from(bucket)
          .list("", { limit: 1000, offset: topOffset, sortBy: { column: "name", order: "asc" } });
        if (topErr) throw topErr;

        for (const entry of top ?? []) {
          if (entry.id) {
            totalObjects++;
            const size = Number(entry.metadata?.size ?? 0);
            totalBytes += size;
            const createdAt = entry.created_at ? new Date(entry.created_at).getTime() : 0;
            if (!bucketReferences.has(entry.name) && createdAt < cutoff) {
              orphans.push({ path: entry.name, size });
            }
            continue;
          }
          for (let offset = 0; ; offset += 1000) {
            const { data: files, error } = await admin.storage
              .from(bucket)
              .list(entry.name, {
                limit: 1000,
                offset,
                sortBy: { column: "name", order: "asc" },
              });
            if (error) throw error;
            for (const file of files ?? []) {
              if (!file.id) continue;
              totalObjects++;
              const size = Number(file.metadata?.size ?? 0);
              totalBytes += size;
              const full = `${entry.name}/${file.name}`;
              const createdAt = file.created_at ? new Date(file.created_at).getTime() : 0;
              if (!bucketReferences.has(full) && createdAt < cutoff) orphans.push({ path: full, size });
            }
            if (!files || files.length < 1000) break;
          }
        }
        if (!top || top.length < 1000) break;
      }
      return { totalObjects, totalBytes, orphans };
    };

    const zipScan = await scanBucket("project-zips", referenced);
    const audioScan = await scanBucket("audio-previews", referencedAudio);
    const blobScan = await scanBucket("project-blobs", referencedBlobs);
    const allScans = [zipScan, audioScan, blobScan];
    scannedObjects = allScans.reduce((sum, scan) => sum + scan.totalObjects, 0);
    scannedBytes = allScans.reduce((sum, scan) => sum + scan.totalBytes, 0);
    candidateObjects = allScans.reduce((sum, scan) => sum + scan.orphans.length, 0);
    candidateBytes = allScans.reduce(
      (sum, scan) => sum + scan.orphans.reduce((subtotal, item) => subtotal + item.size, 0), 0,
    );
    const candidateKeys = [
      ...zipScan.orphans.map((item) => `project-zips:${item.path}:${item.size}`),
      ...audioScan.orphans.map((item) => `audio-previews:${item.path}:${item.size}`),
      ...blobScan.orphans.map((item) => `project-blobs:${item.path}:${item.size}`),
    ].sort();
    const fingerprintBuffer = await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(candidateKeys.join("\n")),
    );
    const fingerprint = Array.from(new Uint8Array(fingerprintBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

    if (confirm) {
      const { data: priorDryRuns, error: priorError } = await admin.from("storage_cleanup_runs")
        .select("candidate_objects,candidate_bytes,details")
        .eq("mode", "dry_run")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(2);
      if (priorError) throw priorError;
      const approved = priorDryRuns?.length === 2 && priorDryRuns.every((run) =>
        Number(run.candidate_objects) === candidateObjects
        && Number(run.candidate_bytes) === candidateBytes
        && run.details?.fingerprint === fingerprint
      );
      if (!approved) {
        if (cleanupRunId) {
          await admin.from("storage_cleanup_runs").update({
            completed_at: new Date().toISOString(),
            scanned_objects: scannedObjects,
            scanned_bytes: scannedBytes,
            candidate_objects: candidateObjects,
            candidate_bytes: candidateBytes,
            failed_objects: 0,
            details: { error: "TWO_MATCHING_DRY_RUNS_REQUIRED", fingerprint },
          }).eq("id", cleanupRunId);
        }
        return new Response(JSON.stringify({
          code: "TWO_MATCHING_DRY_RUNS_REQUIRED",
          error: "Run two matching dry runs before deleting storage objects",
          candidate_objects: candidateObjects,
          candidate_bytes: candidateBytes,
        }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
    }

    const deletedByBucket = new Map<string, { path: string; size: number }[]>();
    if (confirm) {
      for (const [bucket, orphans] of [
        ["project-zips", zipScan.orphans],
        ["audio-previews", audioScan.orphans],
        ["project-blobs", blobScan.orphans],
      ] as const) {
        for (let i = 0; i < orphans.length; i += 100) {
          const batch = orphans.slice(i, i + 100);
          const { error } = await admin.storage.from(bucket).remove(batch.map((item) => item.path));
          if (error) {
            failedObjects += batch.length;
            runErrors.push(`${bucket}: ${error.message}`);
            continue;
          }
          deletedObjects += batch.length;
          reclaimedBytes += batch.reduce((sum, item) => sum + item.size, 0);
          deletedByBucket.set(bucket, [...(deletedByBucket.get(bucket) ?? []), ...batch]);
        }
      }
      const deletedBlobs = deletedByBucket.get("project-blobs") ?? [];
      if (deletedBlobs.length) {
        for (let i = 0; i < deletedBlobs.length; i += 100) {
          const paths = deletedBlobs.slice(i, i + 100).map((item) => item.path);
          const { error } = await admin.from("project_blobs").delete().in("object_path", paths);
          if (error) runErrors.push(`project_blobs registry: ${error.message}`);
        }
      }
      for (const [bucket, deletedItems] of deletedByBucket) {
        for (let i = 0; i < deletedItems.length; i += 100) {
          const paths = deletedItems.slice(i, i + 100).map((item) => item.path);
          if (paths.length) {
            const { error } = await admin.from("storage_deletion_candidates")
              .delete().eq("bucket", bucket).in("object_path", paths);
            if (error) runErrors.push(`${bucket} candidates: ${error.message}`);
          }
        }
      }
    }

    if (cleanupRunId) {
      await admin.from("storage_cleanup_runs").update({
        completed_at: new Date().toISOString(),
        scanned_objects: scannedObjects,
        scanned_bytes: scannedBytes,
        candidate_objects: candidateObjects,
        candidate_bytes: candidateBytes,
        deleted_objects: deletedObjects,
        reclaimed_bytes: reclaimedBytes,
        failed_objects: failedObjects,
        details: {
          required_consecutive_dry_runs: 2,
          fingerprint,
          errors: runErrors.slice(0, 20),
        },
      }).eq("id", cleanupRunId);
    }

    return new Response(JSON.stringify({
      mode: confirm ? "delete" : "dry-run",
      total_objects: zipScan.totalObjects + audioScan.totalObjects + blobScan.totalObjects,
      total_bytes: scannedBytes,
      referenced: referenced.size + referencedAudio.size + referencedBlobs.size,
      orphans: zipScan.orphans.length + audioScan.orphans.length + blobScan.orphans.length,
      orphan_bytes: candidateBytes,
      deleted: deletedObjects,
      failed: failedObjects,
      reclaimed_bytes: reclaimedBytes,
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
        project_blobs: {
          total: blobScan.totalObjects,
          referenced: referencedBlobs.size,
          orphans: blobScan.orphans.length,
        },
      },
      sample: [
        ...zipScan.orphans.map((item) => ({ bucket: "project-zips", path: item.path, size: item.size })),
        ...audioScan.orphans.map((item) => ({ bucket: "audio-previews", path: item.path, size: item.size })),
        ...blobScan.orphans.map((item) => ({ bucket: "project-blobs", path: item.path, size: item.size })),
      ].slice(0, 10),
    }), {
      status: confirm && failedObjects > 0 ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cleanup-orphaned-zips]", e);
    if (admin && cleanupRunId) {
      const fatalError = String((e as Error).message).slice(0, 1000);
      await admin.from("storage_cleanup_runs").update({
        completed_at: new Date().toISOString(),
        scanned_objects: scannedObjects,
        scanned_bytes: scannedBytes,
        candidate_objects: candidateObjects,
        candidate_bytes: candidateBytes,
        deleted_objects: deletedObjects,
        reclaimed_bytes: reclaimedBytes,
        failed_objects: Math.max(failedObjects, candidateObjects - deletedObjects, 1),
        details: { error: fatalError, errors: runErrors.slice(0, 20) },
      }).eq("id", cleanupRunId);
    }
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
