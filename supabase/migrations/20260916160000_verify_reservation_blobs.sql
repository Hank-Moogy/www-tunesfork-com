-- Verify an upload by looking its blobs up directly, instead of scanning the
-- storage owner's entire blob folder.
--
-- create-version-from-desktop verified an upload by paging through
-- storage.objects for the whole owner prefix, 1000 at a time, capped at 100,000
-- objects, matching names in memory. Cost scaled with how much the owner had
-- ever stored rather than with the size of this upload, and past the cap the
-- verification simply could not find the blob and every save failed with
-- BLOB_MISSING.
--
-- It gets worse exactly when collaboration starts working: a contributor's
-- upload reserves against the PROJECT OWNER, so each contributor save paged
-- through the owner's entire library.
--
-- storage.objects has a unique index on (bucket_id, name), and object_path is
-- already stored on every reserved blob, so the whole check is one indexed join.
CREATE OR REPLACE FUNCTION public.verify_reservation_blobs(
  _reservation_id uuid,
  _uploader_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('sha256', found.sha256, 'size', found.size_bytes)),
    '[]'::jsonb
  )
  FROM (
    SELECT urb.sha256,
           (object.metadata->>'size')::bigint AS size_bytes
    FROM public.upload_reservation_blobs urb
    JOIN public.upload_reservations ur ON ur.id = urb.reservation_id
    JOIN storage.objects object
      ON object.bucket_id = 'project-blobs'
     AND object.name = urb.object_path
    WHERE urb.reservation_id = _reservation_id
      -- Scoped to the calling device's uploader, so a reservation cannot be
      -- probed by anyone who did not create it.
      AND ur.uploader_id = _uploader_id
      AND (object.metadata->>'size') ~ '^[0-9]+$'
  ) AS found;
$$;

REVOKE ALL ON FUNCTION public.verify_reservation_blobs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_reservation_blobs(uuid, uuid) TO service_role;
