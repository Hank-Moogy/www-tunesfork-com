# Storage Optimization Roadmap

Problem: every save uploads the full zipped project folder. Measured 2026-06-11:
24 versions = 1.66 GB; one project (I:O) = 1.03 GB for ~7 near-identical
snapshots of a ~148 MB folder. ~90% of stored bytes are duplicated samples.

## Shipped

- **Skip identical saves** (tray app, `electron/main.cjs`): a stable content
  hash of the project folder is computed before zipping
  (`computeProjectContentHash`). `.als` files are hashed on their *gunzipped*
  XML because Ableton's gzip wrapper embeds a timestamp that changes on every
  ⌘S even without edits. If the hash matches the last successful upload for
  that folder (`projectLinks[].lastContentHash` in sync state), the upload is
  skipped. Fail-open: hashing errors fall back to uploading.
- **Orphan GC** (`cleanup-orphaned-zips` edge function): deletes project-zips
  objects no `project_versions.zip_url` references. Dry-run by default
  (`?confirm=true` to delete), never touches objects < 24h old (in-flight
  uploads), auth = `CLEANUP_TOKEN` function secret as bearer. Run it manually
  after bulk deletions, or wire it to pg_cron later. Today nothing else
  deletes storage objects — project deletion cascades DB rows but leaves
  zips; this function is the cleanup path.

## Next: auto-save retention (thinning)

Promoted majors are permanent. Auto-saves inside a version group decay,
Time-Machine style: keep everything ≤ 7 days old, then last-per-day ≤ 30
days, then last-per-week. Nightly job deletes pruned `project_versions`
rows, then calls `cleanup-orphaned-zips?confirm=true`. Retention window can
differ per plan tier (free vs paid) once Stripe is live.

## The structural fix: content-addressed blobs + manifests (the "git" model)

A save rarely changes anything but the `.als` (a few MB); samples are
immutable. Plan:

1. Tray app already walks + hashes every file (see content hash above).
   Extend it to produce a **manifest**: `[{ path, sha256, size }]`.
2. New bucket `blobs/`, object key = `sha256` (optionally per-user prefix
   for quota accounting: `{userId}/{sha256}`).
3. New edge function `negotiate-upload`: receives the manifest, returns the
   subset of hashes the server doesn't have; tray uploads only those files.
4. `project_versions` gains `manifest jsonb` (zip_url becomes nullable;
   legacy rows keep their zips — no migration needed).
5. Export / Open in Ableton: edge function streams a zip assembled from
   blobs (or returns the manifest + signed URLs and the desktop app
   assembles locally).
6. GC: a blob is deletable when no manifest references its hash (extend
   cleanup-orphaned-zips).

Expected effect: marginal cost of a save drops from full-folder size to
changed-files size (~30–70× less for typical sessions), plus cross-project
dedup of shared sample packs.

## Later levers

- Compression: zipper currently runs `zlib level 0` (store). `.als` is
  pre-compressed; WAV/AIFF deflate ~10–30%. Benchmark CPU cost before
  enabling. Mostly superseded by the manifest model.
- Optional exclusion of regenerable `Samples/Processed/Freeze/**` (visible
  tray setting; do NOT silently exclude `.asd` — warp markers).
- Cold tiering of old blobs to Cloudflare R2 (~$0.015/GB, zero egress) once
  past a few hundred GB.
- Per-plan storage quotas (UI already has StorageCard + storage_by_project
  in get_user_stats) — ties storage cost to monetization.
