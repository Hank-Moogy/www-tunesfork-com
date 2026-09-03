# Storage Optimization — Launch State

Status: launch MVP implemented and its storage migrations and Edge Functions
deployed to the linked Supabase project.

## Launch architecture

- Tunesfork Sync is the only upload and manifest-restore client.
- Manifest schema v1 references immutable `{owner_uuid}/{sha256}` whole-file
  blobs. Deduplication crosses projects for one owner, never accounts.
- No-op saves create no version and upload zero bytes. Changed saves upload only
  missing blobs; the app never silently falls back to a full ZIP.
- Legacy ZIP versions remain restorable. New versions cannot be inserted through
  browser storage policies.
- Physical usage counts distinct referenced ready blobs, legacy ZIP object
  paths, and preview object URLs. Logical history size remains a separate metric.
- Collaborator uploads reserve and consume the project owner's allowance.

## Entitlements

| Plan | Storage | Projects | Collaborators/project | History |
|---|---:|---:|---:|---|
| Free | 5 GB | 5 | 3 | Unlimited within storage |
| Producer | 100 GB | Unlimited | 5 | Unlimited within storage |
| Founding Producer | 100 GB | Unlimited | 5 | Unlimited within storage |
| Studio | 500 GB | Unlimited | Unlimited | Unlimited |
| Legacy | Unlimited, metered | Unlimited | Unlimited | Unlimited |

Accounts present when migration `20260901160000` is deployed are marked legacy.
Accounts created afterward receive Free limits.

## Operational controls

- Upload reservations count against quota and expire after 24 hours.
- Warnings occur at 80% and 95%; only new uploads are blocked at 100%.
- Version/project deletion releases logical references immediately. Physical
  deletion waits at least 24 hours.
- Cleanup covers ZIPs, previews, expired uploads, and blobs. Production deletion
  requires two dry runs whose candidate-set SHA-256 fingerprints match exactly.
- Every cleanup records scanned/candidate/deleted/failed/reclaimed counts.
- `storage_economics_daily` exposes logical, uploaded, and reused bytes and the
  deduplication ratio. `storage_transfer_events` records planned restore bytes.

Run cleanup with the `CLEANUP_TOKEN` bearer secret. Omit `?confirm=true` for the
required dry runs. Each response includes `cleanup_run_id` and
`candidate_fingerprint`; two consecutive dry runs must report identical
candidate counts, bytes, and fingerprints before a confirmed run is accepted.

```sh
curl -H "Authorization: Bearer $CLEANUP_TOKEN" \
  "https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1/cleanup-orphaned-zips"
```

Run that command twice and inspect both responses. Only after they match, use
the same request with `?confirm=true`. A confirmed cleanup that has any failed
deletion batch returns HTTP 207 and records the exact partial result.

## Post-launch cost task

Review this monthly once real cohorts exist. Add alerts using live Supabase
billing values rather than embedding vendor prices in product code. Measure:

- physical bytes and daily growth per account/plan;
- upload reuse ratio and orphan/reservation bytes;
- cached and uncached restore egress;
- gross margin per paid plan and the 95th-percentile account.

Only then evaluate content-defined chunking for large mutable files, cold-tier
storage, preview lifecycle limits, compression, and CDN caching. These are not
Launch MVP requirements and must not weaken byte-identical restore guarantees.
