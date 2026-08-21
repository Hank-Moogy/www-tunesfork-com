# Incremental Sync Implementation Spec

Status: proposed next storage/sync architecture

Related: `docs/STORAGE_OPTIMIZATION.md`

## Why this exists

Tunesfork currently does two useful things:

1. It watches Ableton projects and computes a stable project content hash.
2. It skips an upload when the project is byte-for-byte unchanged at the logical file-content level.

However, once any real file changes, the desktop app still zips the entire project folder and uploads the full archive as a new version.

For an Ableton project with hundreds of MB of samples, changing a small `.als` file can therefore upload hundreds of MB again.

The next architecture should make Tunesfork behave more like Git: versions reference immutable content objects, and a save uploads only content the server does not already have.

## Goal

A typical Ableton save that only changes the `.als` file should upload only the changed `.als` object plus a small manifest, not the entire project folder.

New samples should be uploaded once and reused by subsequent versions.

Old versions must remain fully reconstructable.

## Non-goals for v1

Do not start with binary delta encoding inside WAV/AIFF files.

Do not require semantic Ableton XML diffs for the first release.

Do not use Git itself as the storage engine.

The first version should use content-addressed whole-file blobs. This delivers most of the storage/bandwidth benefit with much less complexity.

## Target model

Each project version becomes:

`Project -> Version -> Manifest -> Content blobs`

A manifest should contain at least:

```json
{
  "schema_version": 1,
  "files": [
    {
      "path": "My Song Project/My Song.als",
      "sha256": "...",
      "size": 4382941,
      "mtime_ms": 1787000000000
    },
    {
      "path": "My Song Project/Samples/Recorded/Audio 001.wav",
      "sha256": "...",
      "size": 57382921,
      "mtime_ms": 1786990000000
    }
  ]
}
```

The SHA-256 is the identity of each blob.

## Phase 1 — manifest generation on desktop

Refactor the existing project walk/hash logic in `electron/main.cjs` so it returns both:

- the stable aggregate project hash used for unchanged-save detection;
- a per-file manifest containing relative path, SHA-256 and size.

For `.als` files, preserve the current stable hashing behavior where useful for unchanged-save detection, because the gzip wrapper timestamp changes on save.

For blob identity, use the hash of the actual uploaded bytes. This avoids reconstruction ambiguity. Store an optional `logical_sha256` for gunzipped `.als` content if needed for change detection.

Suggested shape:

```js
{
  projectHash,
  files: [
    {
      path,
      sha256,
      logicalSha256,
      size,
      mtimeMs
    }
  ]
}
```

Cache hashes locally by `path + size + mtime` so large unchanged sample libraries do not need to be re-hashed on every save.

## Phase 2 — upload negotiation API

Add a backend endpoint such as `negotiate-project-upload`.

Request:

```json
{
  "project_id": "optional-existing-project-id",
  "files": [
    { "sha256": "...", "size": 123 },
    { "sha256": "...", "size": 456 }
  ]
}
```

Response:

```json
{
  "missing": [
    {
      "sha256": "...",
      "object_path": "<content-addressed-path>",
      "signed_url": "..."
    }
  ]
}
```

The server must determine which hashes already exist and return upload authorization only for missing blobs.

The client then uploads only the missing objects.

## Phase 3 — content-addressed blob storage

Create a dedicated bucket/prefix for immutable blobs.

Recommended object identity:

`blobs/{sha256}`

If user-scoped ownership is required for authorization/accounting:

`blobs/{userId}/{sha256}`

Tradeoff:

- global hashes maximize cross-user deduplication but complicate authorization/accounting;
- user-prefixed hashes are simpler and still deduplicate all repeated files for one user.

Start user-scoped unless there is a strong reason to introduce global deduplication immediately.

Uploads must be immutable: never overwrite an existing hash with different content.

On upload completion, verify size and ideally SHA-256 server-side or through trusted metadata before accepting the blob as reusable.

## Phase 4 — version manifests

Add a manifest field/reference to `project_versions`.

Possible first implementation:

```sql
alter table project_versions
add column manifest jsonb;
```

`zip_url` should become optional for new manifest-based versions while remaining valid for legacy versions.

A new desktop-created version should include:

- project/version metadata;
- manifest;
- BPM / plugin / track metadata already produced today;
- sample integrity metadata already produced today;
- no full project zip unless fallback behavior is required.

The version registration endpoint must validate that all referenced blobs exist before committing the version.

## Phase 5 — reconstruct/download

Users must still be able to download/open any project version as a normal Ableton project folder.

Implement one of these approaches:

### Preferred for desktop

Return the manifest plus signed blob URLs and let the Tunesfork desktop client reconstruct the folder locally.

Advantages:

- no server-side zip compute;
- blobs can download concurrently;
- resumable downloads are possible;
- natural foundation for selective sync.

### Web fallback

For web-only downloads, provide a backend job/endpoint that assembles the manifest into a temporary zip.

Do not permanently store a full duplicate zip unless needed for caching.

## Phase 6 — garbage collection

A blob can only be deleted when no retained project version manifest references it.

GC flow:

1. prune project versions according to retention rules;
2. compute referenced blob hashes;
3. delete unreferenced blobs after a safety delay;
4. keep an audit/log trail for destructive GC runs.

Never delete recently uploaded unreferenced blobs immediately because a version registration may still be in flight.

## Phase 7 — local hash index

Add a local persistent hash cache to the desktop app.

Suggested key:

`absolute path + file size + mtimeMs`

Stored value:

`sha256`

This is important because content-addressed sync should not turn every Ableton save into a full read/hash of hundreds of GB of samples.

Invalidate the cached hash when size or modification time changes.

## Upload algorithm

Target desktop flow:

```text
Ableton save detected
        ↓
Debounce / serialize project saves
        ↓
Walk project folder
        ↓
Reuse cached hashes where possible
        ↓
Build manifest + aggregate logical project hash
        ↓
If aggregate hash == last uploaded hash: stop
        ↓
Send manifest hashes to negotiate-project-upload
        ↓
Server returns missing blobs
        ↓
Upload only missing blobs
        ↓
Register new project version with manifest
        ↓
Persist local lastVersion + projectHash
```

## Expected behavior examples

### Save with no meaningful edits

Project size: 800 MB

Upload: `0 B`

Current unchanged-save optimization already handles this case.

### Arrangement edit only

Project size: 800 MB

Changed `.als`: 4 MB

Expected upload: approximately 4 MB + manifest/API overhead.

### Add one sample

Project size: 800 MB

Changed `.als`: 4 MB

New WAV: 25 MB

Expected upload: approximately 29 MB + overhead.

### Reuse an existing sample already stored by the user

Expected upload for that sample: `0 B`.

## Later: chunk-level binary deduplication

Whole-file content addressing should ship first.

A later optimization can split large mutable files into fixed-size or content-defined chunks and hash each chunk. Then changing part of a large file uploads only changed chunks.

Potential model:

`File -> chunk manifest -> content-addressed chunks`

This is useful for large files that are rewritten in place, but adds substantial complexity and should only be built if measurement shows whole-file blobs are insufficient.

## Later: Ableton semantic diffs

Tunesfork already parses `.als` metadata. A future layer can compare gunzipped XML / parsed project structures between versions and expose human-readable changes such as:

- track added/removed;
- clip added/moved;
- arrangement region changed;
- device/plugin added;
- parameter or automation changed;
- BPM changed.

This should be treated primarily as a product/version-history feature, not as a prerequisite for efficient uploads.

For storage, uploading the changed `.als` file as one content-addressed blob is already cheap enough in most cases.

## Backward compatibility

Do not migrate historical zip-based versions immediately.

The read/download path should support both:

- legacy version: `zip_url` exists;
- incremental version: `manifest` exists.

New versions can switch to manifests behind a feature flag.

This permits gradual rollout and rollback without rewriting historical data.

## Rollout

1. Ship manifest generation + local hash cache behind a debug flag.
2. Log estimated bytes avoided without changing upload behavior.
3. Add backend negotiation/blob storage.
4. Enable manifest uploads for internal/test accounts.
5. Verify reconstruction byte-for-byte across macOS and Windows.
6. Add web download reconstruction.
7. Roll out incrementally.
8. Only after stability, consider stopping creation of full zip snapshots for new versions.

## Metrics

Track at minimum:

- project logical size;
- bytes hashed per save;
- bytes uploaded per save;
- bytes deduplicated per save;
- number of manifest files;
- number of missing blobs;
- upload duration;
- reconstruction/download duration;
- reconstruction failures;
- storage bytes referenced vs physical bytes stored.

Primary KPI:

`upload_reduction_ratio = 1 - bytes_uploaded / logical_project_size`

For normal arrangement-only saves, target >95% reduction.

## Acceptance criteria for v1

Incremental sync is ready when all of the following are true:

- A no-op Ableton save uploads nothing.
- Editing only the `.als` does not upload unchanged samples.
- Adding one new sample uploads that sample only once.
- Two project versions can reference the same stored blob safely.
- A manifest-based version can be reconstructed into a valid Ableton project folder.
- Legacy zip versions still download normally.
- Interrupted uploads can retry without duplicating blobs.
- Failed version registration does not corrupt previous versions.
- GC cannot delete blobs referenced by retained versions.
- Desktop logs show logical project size vs actual uploaded bytes.

## Recommended implementation order

Build these next, in this order:

1. **Extract manifest builder from `computeProjectContentHash`.**
2. **Add persistent local file-hash cache.**
3. **Add `negotiate-project-upload` backend API.**
4. **Add immutable content-addressed blob bucket/prefix.**
5. **Upload only missing blobs from the Electron client.**
6. **Store the manifest on `project_versions`.**
7. **Reconstruct manifest-based versions in the desktop client.**
8. **Add web zip reconstruction fallback.**
9. **Extend GC to unreferenced blobs.**
10. **Measure savings before considering chunk-level binary diffs.**

The key architectural rule is simple: **a Tunesfork version should describe project state; it should not require duplicating the entire project payload.**
