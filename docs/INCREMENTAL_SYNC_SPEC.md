# Incremental Sync v1 Contract

Status: implemented for launch.

The desktop client walks an Ableton project, normalizes manifest paths to NFC,
hashes uploaded bytes with SHA-256, and caches hashes by local path/size/mtime.
The aggregate logical hash uses gunzipped `.als` content so Ableton's gzip
timestamp does not create false versions.

The manifest contract is:

```json
{
  "schema_version": 1,
  "files": [{
    "path": "Song Project/Song.als",
    "sha256": "64 lowercase hex characters",
    "logical_sha256": "optional stable .als hash",
    "size": 123,
    "mtime_ms": 1787000000000
  }]
}
```

Validation rejects traversal, backslashes, duplicate or case-insensitive/NFC
collisions, missing `.als` files, more than 20,000 files, and files above 5 GB.

Upload sequence:

1. `negotiate-project-upload` authenticates the device, resolves the owner,
   locks owner accounting, enforces project/quota limits, registers pending
   blobs, and returns one immutable signed target for every missing blob.
2. Sync uploads missing blobs resumably.
3. `create-version-from-desktop` verifies the reservation, object existence and
   sizes, then calls the transactional finalizer.
4. The transaction marks blobs ready, creates the manifest version and refs,
   closes the reservation, and returns current usage.

Stable failures include `QUOTA_EXCEEDED`, `RESERVATION_EXPIRED`, `BLOB_MISSING`,
`BLOB_SIZE_MISMATCH`, `MANIFEST_INVALID`, `PROJECT_LIMIT_REACHED`, and
`UPLOAD_CONFLICT`. No error path uploads a legacy ZIP.

Restore first requests the manifest, then signs batches of at most 100 hashes
for 15 minutes. Sync downloads four files concurrently into a fresh
version-specific folder and verifies every SHA-256 and size before opening the
`.als`. Browser reconstruction is intentionally unavailable.
