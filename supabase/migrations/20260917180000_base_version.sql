-- Record what a version was built on, so a fork that raced another can be seen.
--
-- A fork is a whole snapshot taken when the collaborator opened the project. If
-- the project moves on before the owner reviews it, approving that fork silently
-- discards everything in between: approve fork A (built on v2) then fork B (also
-- built on v2) and B's approval erases A. Nothing could detect this, because no
-- row recorded what it started from.
--
-- The decision is warn-and-accept, not refuse: the person with the context to
-- judge is the owner, and refusing punishes a collaborator for the owner's own
-- save. So this records the fact and leaves the choice on the review screen.

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS base_version_id uuid REFERENCES public.project_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_versions.base_version_id IS
  'The approved version this one was built on. NULL for versions created before this was tracked, and for the first version of a project.';

CREATE INDEX IF NOT EXISTS project_versions_base_idx
  ON public.project_versions (base_version_id)
  WHERE base_version_id IS NOT NULL;

-- Is this contribution built on what is currently the tip?
CREATE OR REPLACE FUNCTION public.contribution_base_state(_version_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT pv.id, pv.project_id, pv.base_version_id
    FROM public.project_versions pv
    WHERE pv.id = _version_id
  ), tip AS (
    SELECT pv.id, pv.version_number
    FROM public.project_versions pv, target t
    WHERE pv.project_id = t.project_id AND pv.status = 'approved'
    ORDER BY pv.version_number DESC, pv.created_at DESC
    LIMIT 1
  ), base AS (
    SELECT pv.id, pv.version_number
    FROM public.project_versions pv, target t
    WHERE pv.id = t.base_version_id
  )
  SELECT jsonb_build_object(
    'base_version_id', (SELECT base_version_id FROM target),
    'base_version_number', (SELECT version_number FROM base),
    'current_version_id', (SELECT id FROM tip),
    'current_version_number', (SELECT version_number FROM tip),
    -- Unknown base is not the same as up to date; say so rather than implying safety.
    'known', (SELECT base_version_id IS NOT NULL FROM target),
    'stale', CASE
      WHEN (SELECT base_version_id FROM target) IS NULL THEN NULL
      WHEN (SELECT id FROM tip) IS NULL THEN false
      ELSE (SELECT base_version_id FROM target) IS DISTINCT FROM (SELECT id FROM tip)
    END
  )
  FROM target;
$$;

REVOKE ALL ON FUNCTION public.contribution_base_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribution_base_state(uuid) TO authenticated, service_role;

-- finalize now records what the upload was built on.
-- The signature gains a parameter, so the old one is dropped rather than left
-- beside it: two overloads reachable by named arguments is an ambiguity waiting
-- to be dispatched wrongly.
DROP FUNCTION IF EXISTS public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text, jsonb, jsonb, bigint, bigint
);

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
  _reused_bytes bigint,
  _base_version_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation public.upload_reservations;
  resolved_project_id uuid;
  project_owner_id uuid;
  is_owner_upload boolean;
  contribution_state public.contribution_status;
  resolved_base_version_id uuid;
  next_version_number integer;
  next_major integer;
  first_version boolean;
  created_version_id uuid;
  superseded_count integer := 0;
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

  SELECT p.owner_id INTO project_owner_id FROM public.projects p WHERE p.id = resolved_project_id;
  is_owner_upload := project_owner_id IS NOT DISTINCT FROM _uploader_id;
  contribution_state := CASE WHEN is_owner_upload THEN 'approved' ELSE 'pending' END::public.contribution_status;

  PERFORM pg_advisory_xact_lock(hashtextextended(resolved_project_id::text, 3));

  -- Only trust a base the client names if it is genuinely an approved version of
  -- this project; anything else is recorded as unknown rather than believed.
  SELECT pv.id INTO resolved_base_version_id
  FROM public.project_versions pv
  WHERE pv.id = _base_version_id
    AND pv.project_id = resolved_project_id
    AND pv.status = 'approved';

  IF is_owner_upload THEN
    SELECT COALESCE(max(version_number) + 1, 1),
           COALESCE(max(major_version), 1),
           count(*) = 0
    INTO next_version_number, next_major, first_version
    FROM public.project_versions
    WHERE project_id = resolved_project_id AND status = 'approved';
  ELSE
    -- A contributor who saves again before the owner has reviewed replaces their
    -- own outstanding request rather than stacking a queue of near-identical
    -- forks for the owner to wade through.
    UPDATE public.project_versions
    SET status = 'superseded', reviewed_at = now()
    WHERE project_id = resolved_project_id
      AND uploader_id = _uploader_id
      AND status = 'pending';
    GET DIAGNOSTICS superseded_count = ROW_COUNT;

    next_version_number := NULL;
    SELECT COALESCE(max(major_version), 1) INTO next_major
    FROM public.project_versions
    WHERE project_id = resolved_project_id AND status = 'approved';
    first_version := false;
  END IF;

  INSERT INTO public.project_versions (
    project_id, version_number, major_version, is_main_version,
    uploader_id, change_note, zip_url, manifest, plugin_list, track_list,
    ableton_version, sample_check, file_size_bytes, uploaded_bytes, reused_bytes,
    status, base_version_id
  ) VALUES (
    resolved_project_id, next_version_number, COALESCE(next_major, 1),
    COALESCE(first_version, false),
    _uploader_id, COALESCE(_change_note, 'Auto-saved from desktop'), NULL,
    _manifest, _plugin_list, _track_list, _ableton_version, _sample_check,
    manifest_logical_size, authoritative_uploaded_bytes, authoritative_reused_bytes,
    contribution_state, resolved_base_version_id
  ) RETURNING id INTO created_version_id;

  INSERT INTO public.project_version_blobs(version_id, user_id, sha256)
  SELECT DISTINCT created_version_id, reservation.storage_owner_id, item->>'sha256'
  FROM jsonb_array_elements(_manifest->'files') item;

  -- A pending fork request has not changed the project, so it must not reorder
  -- the owner's dashboard as though it had.
  IF is_owner_upload THEN
    UPDATE public.projects
    SET updated_at = now(), bpm = COALESCE(_bpm, bpm)
    WHERE id = resolved_project_id;
  END IF;

  UPDATE public.upload_reservations
  SET status = 'completed', completed_at = now(), project_id = resolved_project_id
  WHERE id = reservation.id;

  usage := public.get_account_storage_usage(reservation.storage_owner_id);
  RETURN jsonb_build_object(
    'project_id', resolved_project_id,
    'version_id', created_version_id,
    'version_number', next_version_number,
    'status', contribution_state,
    'superseded_count', superseded_count,
    'base_state', public.contribution_base_state(created_version_id),
    'usage', usage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint, uuid
) TO service_role;
