-- Make the reservation authoritative during manifest finalization.
-- The Edge function verifies storage objects; this transaction verifies that its
-- attestation exactly matches the reservation and derives byte accounting itself.

CREATE OR REPLACE FUNCTION public.finalize_manifest_project_version(
  _reservation_id uuid,
  _uploader_id uuid,
  _project_name text,
  _manifest jsonb,
  _logical_size bigint,
  _change_note text,
  _bpm integer,
  _plugin_list jsonb,
  _track_list jsonb,
  _ableton_version text,
  _sample_check jsonb,
  _ready_blobs jsonb,
  _uploaded_bytes bigint,
  _reused_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation public.upload_reservations;
  resolved_project_id uuid;
  next_version_number integer;
  next_major integer;
  first_version boolean;
  created_version_id uuid;
  manifest_logical_size bigint;
  authoritative_uploaded_bytes bigint;
  authoritative_reused_bytes bigint;
  usage jsonb;
BEGIN
  SELECT * INTO reservation
  FROM public.upload_reservations
  WHERE id = _reservation_id
  FOR UPDATE;

  IF reservation.id IS NULL OR reservation.uploader_id <> _uploader_id THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF reservation.kind <> 'project_manifest' OR reservation.status <> 'active' OR reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'RESERVATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(_manifest) <> 'object'
     OR (_manifest->>'schema_version') IS DISTINCT FROM '1'
     OR jsonb_typeof(_manifest->'files') <> 'array'
     OR jsonb_array_length(_manifest->'files') > 20000
     OR jsonb_typeof(COALESCE(_ready_blobs, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'MANIFEST_INVALID' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_manifest->'files') item
    WHERE jsonb_typeof(item) <> 'object'
       OR COALESCE(item->>'sha256', '') !~ '^[0-9a-f]{64}$'
       OR CASE
            WHEN COALESCE(item->>'size', '') ~ '^[0-9]+$'
            THEN (item->>'size')::numeric NOT BETWEEN 0 AND 5368709120
            ELSE true
          END
  ) THEN
    RAISE EXCEPTION 'MANIFEST_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum((item->>'size')::bigint), 0)::bigint
  INTO manifest_logical_size
  FROM jsonb_array_elements(_manifest->'files') item;

  IF _logical_size IS NULL OR _logical_size <> manifest_logical_size THEN
    RAISE EXCEPTION 'MANIFEST_INVALID: logical size mismatch' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_ready_blobs, '[]'::jsonb)) item
    WHERE jsonb_typeof(item) <> 'object'
       OR COALESCE(item->>'sha256', '') !~ '^[0-9a-f]{64}$'
       OR CASE
            WHEN COALESCE(item->>'size', '') ~ '^[0-9]+$'
            THEN (item->>'size')::numeric NOT BETWEEN 0 AND 5368709120
            ELSE true
          END
  ) THEN
    RAISE EXCEPTION 'UPLOAD_CONFLICT' USING ERRCODE = '22023';
  END IF;

  -- The storage verifier must attest every missing blob, once, with exactly the
  -- hash and size reserved by negotiation. It cannot promote unrelated blobs.
  IF (
    SELECT count(*)
    FROM public.upload_reservation_blobs urb
    WHERE urb.reservation_id = reservation.id
  ) <> (
    SELECT count(DISTINCT item->>'sha256')
    FROM jsonb_array_elements(COALESCE(_ready_blobs, '[]'::jsonb)) item
  ) THEN
    RAISE EXCEPTION 'BLOB_MISSING' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_ready_blobs, '[]'::jsonb)) item
    LEFT JOIN public.upload_reservation_blobs urb
      ON urb.reservation_id = reservation.id
     AND urb.sha256 = item->>'sha256'
     AND urb.size_bytes = (item->>'size')::bigint
    WHERE urb.sha256 IS NULL
  ) THEN
    RAISE EXCEPTION 'UPLOAD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- A client may not reserve content and then omit it from the committed manifest.
  IF EXISTS (
    SELECT 1
    FROM public.upload_reservation_blobs urb
    LEFT JOIN LATERAL (
      SELECT 1
      FROM jsonb_array_elements(_manifest->'files') item
      WHERE item->>'sha256' = urb.sha256
        AND (item->>'size')::bigint = urb.size_bytes
      LIMIT 1
    ) manifest_item ON true
    WHERE urb.reservation_id = reservation.id
      AND manifest_item IS NULL
  ) THEN
    RAISE EXCEPTION 'MANIFEST_INVALID: reserved blob absent from manifest' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_blobs (
    user_id, sha256, size_bytes, object_path, status, verified_at
  )
  SELECT reservation.storage_owner_id,
         urb.sha256,
         urb.size_bytes,
         urb.object_path,
         'ready', now()
  FROM public.upload_reservation_blobs urb
  WHERE urb.reservation_id = reservation.id
  ON CONFLICT (user_id, sha256) DO UPDATE
    SET status = 'ready', verified_at = now()
    WHERE public.project_blobs.size_bytes = EXCLUDED.size_bytes
      AND public.project_blobs.object_path = EXCLUDED.object_path;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_manifest->'files') item
    LEFT JOIN public.project_blobs pb
      ON pb.user_id = reservation.storage_owner_id
     AND pb.sha256 = item->>'sha256'
     AND pb.size_bytes = (item->>'size')::bigint
     AND pb.status = 'ready'
    WHERE pb.sha256 IS NULL
  ) THEN
    RAISE EXCEPTION 'BLOB_MISSING' USING ERRCODE = 'P0001';
  END IF;

  authoritative_uploaded_bytes := reservation.reserved_bytes;
  authoritative_reused_bytes := GREATEST(manifest_logical_size - authoritative_uploaded_bytes, 0);

  IF GREATEST(COALESCE(_uploaded_bytes, 0), 0) <> authoritative_uploaded_bytes
     OR GREATEST(COALESCE(_reused_bytes, 0), 0) <> authoritative_reused_bytes THEN
    RAISE EXCEPTION 'UPLOAD_CONFLICT: byte accounting mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF reservation.project_id IS NOT NULL THEN
    resolved_project_id := reservation.project_id;
  ELSE
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE owner_id = reservation.storage_owner_id
      AND name = left(COALESCE(NULLIF(_project_name, ''), 'Untitled'), 200)
    ORDER BY created_at ASC LIMIT 1;
    IF resolved_project_id IS NULL THEN
      INSERT INTO public.projects(name, bpm, owner_id)
      VALUES (
        left(COALESCE(NULLIF(_project_name, ''), 'Untitled'), 200),
        _bpm, reservation.storage_owner_id
      ) RETURNING id INTO resolved_project_id;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(resolved_project_id::text, 3));
  SELECT COALESCE(max(version_number) + 1, 1),
         COALESCE(max(major_version), 1),
         count(*) = 0
  INTO next_version_number, next_major, first_version
  FROM public.project_versions
  WHERE project_id = resolved_project_id;

  INSERT INTO public.project_versions (
    project_id, version_number, major_version, is_main_version,
    uploader_id, change_note, zip_url, manifest, plugin_list, track_list,
    ableton_version, sample_check, file_size_bytes, uploaded_bytes, reused_bytes
  ) VALUES (
    resolved_project_id, next_version_number, next_major, first_version,
    _uploader_id, COALESCE(_change_note, 'Auto-saved from desktop'), NULL,
    _manifest, _plugin_list, _track_list, _ableton_version, _sample_check,
    manifest_logical_size, authoritative_uploaded_bytes, authoritative_reused_bytes
  ) RETURNING id INTO created_version_id;

  INSERT INTO public.project_version_blobs(version_id, user_id, sha256)
  SELECT DISTINCT created_version_id, reservation.storage_owner_id, item->>'sha256'
  FROM jsonb_array_elements(_manifest->'files') item;

  UPDATE public.projects
  SET updated_at = now(), bpm = COALESCE(_bpm, bpm)
  WHERE id = resolved_project_id;

  UPDATE public.upload_reservations
  SET status = 'completed', completed_at = now(), project_id = resolved_project_id
  WHERE id = reservation.id;

  usage := public.get_account_storage_usage(reservation.storage_owner_id);
  RETURN jsonb_build_object(
    'project_id', resolved_project_id,
    'version_id', created_version_id,
    'version_number', next_version_number,
    'usage', usage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint
) TO service_role;
