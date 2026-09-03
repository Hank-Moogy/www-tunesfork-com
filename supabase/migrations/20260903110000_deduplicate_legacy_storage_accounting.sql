-- Physical quota usage counts objects, not references. Legacy rows can share a
-- ZIP or preview URL, so group those paths before summing their stored sizes.

CREATE OR REPLACE FUNCTION public.account_physical_storage_bytes(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH blob_bytes AS (
    SELECT COALESCE(sum(pb.size_bytes), 0)::bigint AS bytes
    FROM public.project_blobs pb
    WHERE pb.user_id = _user_id
      AND pb.status = 'ready'
      AND EXISTS (
        SELECT 1 FROM public.project_version_blobs pvb
        WHERE pvb.user_id = pb.user_id AND pvb.sha256 = pb.sha256
      )
  ), legacy_objects AS (
    SELECT pv.zip_url, max(pv.file_size_bytes)::bigint AS size_bytes
    FROM public.project_versions pv
    JOIN public.projects p ON p.id = pv.project_id
    WHERE p.owner_id = _user_id
      AND pv.manifest IS NULL
      AND pv.zip_url IS NOT NULL
    GROUP BY pv.zip_url
  ), legacy_bytes AS (
    SELECT COALESCE(sum(size_bytes), 0)::bigint AS bytes FROM legacy_objects
  ), preview_objects AS (
    SELECT pv.audio_preview_url, max(pv.audio_preview_size_bytes)::bigint AS size_bytes
    FROM public.project_versions pv
    JOIN public.projects p ON p.id = pv.project_id
    WHERE p.owner_id = _user_id
      AND pv.audio_preview_url IS NOT NULL
    GROUP BY pv.audio_preview_url
  ), preview_bytes AS (
    SELECT COALESCE(sum(size_bytes), 0)::bigint AS bytes FROM preview_objects
  )
  SELECT blob_bytes.bytes + legacy_bytes.bytes + preview_bytes.bytes
  FROM blob_bytes, legacy_bytes, preview_bytes;
$$;

REVOKE ALL ON FUNCTION public.account_physical_storage_bytes(uuid)
FROM PUBLIC, anon, authenticated;
