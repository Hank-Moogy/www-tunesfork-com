-- Fork requests: a contributor's save becomes a pending contribution that the
-- project owner reviews, instead of silently appending to the owner's main line.
--
-- Pending contributions deliberately carry version_number = NULL. A fork request
-- that has not been approved is not a version of the project: giving it a number
-- would let a contributor advance the owner's version history without consent,
-- and would make "v4" mean different things to different people while it sits in
-- review. The number is assigned at approval, so the main line stays contiguous
-- and always reflects what the owner accepted.

DO $$ BEGIN
  CREATE TYPE public.contribution_status AS ENUM ('approved', 'pending', 'rejected', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS status public.contribution_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Everything that exists today was accepted by definition.
UPDATE public.project_versions SET status = 'approved' WHERE status IS NULL;

ALTER TABLE public.project_versions ALTER COLUMN version_number DROP NOT NULL;

ALTER TABLE public.project_versions
  DROP CONSTRAINT IF EXISTS project_versions_number_required_when_approved;
ALTER TABLE public.project_versions
  ADD CONSTRAINT project_versions_number_required_when_approved
  CHECK (
    (status = 'approved' AND version_number IS NOT NULL)
    OR (status <> 'approved' AND version_number IS NULL)
  );

CREATE INDEX IF NOT EXISTS project_versions_pending_idx
  ON public.project_versions (project_id, created_at DESC)
  WHERE status = 'pending';

-- ---------------------------------------------------------------- visibility
-- A pending fork request is visible to the owner (who must review it) and to the
-- contributor who sent it. It is not part of the project for anyone else, and it
-- never reaches a share link.
DROP POLICY IF EXISTS "Users can view versions of accessible projects" ON public.project_versions;
CREATE POLICY "Users can view versions of accessible projects"
ON public.project_versions
FOR SELECT TO authenticated
USING (
  CASE
    WHEN status = 'approved' THEN public.is_project_owner(project_id) OR public.is_collaborator(project_id)
    ELSE public.is_project_owner(project_id) OR uploader_id = auth.uid()
  END
);

CREATE OR REPLACE FUNCTION public.get_versions_by_share_token(_token text)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  version_number integer,
  change_note text,
  created_at timestamptz,
  file_size_bytes bigint,
  audio_preview_url text,
  track_list jsonb,
  plugin_list jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pv.id, pv.project_id, pv.version_number, pv.change_note, pv.created_at,
    pv.file_size_bytes, pv.audio_preview_url, pv.track_list, pv.plugin_list
  FROM public.project_versions pv
  JOIN public.projects p ON p.id = pv.project_id
  WHERE pv.status = 'approved'
    AND (
      p.share_token = _token
      OR EXISTS (
        SELECT 1 FROM public.project_invites i
        WHERE i.token = _token
          AND i.project_id = p.id
          AND i.accepted_at IS NULL
          AND i.expires_at > now()
      )
    )
  ORDER BY pv.version_number DESC, pv.created_at DESC;
$$;

-- A fork request is not something you can "restore to".
CREATE OR REPLACE FUNCTION public.promote_project_version(_version_id uuid)
RETURNS public.project_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_version public.project_versions;
  next_version_number integer;
  promoted_version public.project_versions;
BEGIN
  SELECT * INTO target_version FROM public.project_versions WHERE id = _version_id;
  IF target_version.id IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  IF target_version.status <> 'approved' THEN
    RAISE EXCEPTION 'CONTRIBUTION_NOT_APPROVED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = target_version.project_id
      AND (
        p.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.collaborators c
          WHERE c.project_id = p.id AND c.user_id = auth.uid()
            AND c.permission_level = 'contributor'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not allowed to promote this version';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version_number
  FROM public.project_versions
  WHERE project_id = target_version.project_id AND status = 'approved';

  UPDATE public.project_versions
  SET version_number = next_version_number
  WHERE id = _version_id
  RETURNING * INTO promoted_version;

  UPDATE public.projects SET updated_at = now() WHERE id = promoted_version.project_id;
  RETURN promoted_version;
END;
$$;

-- ------------------------------------------------------------------- review
CREATE OR REPLACE FUNCTION public.review_project_contribution(
  _version_id uuid,
  _decision text,
  _review_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contribution public.project_versions;
  owner_id uuid;
  next_version_number integer;
BEGIN
  IF _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;

  SELECT * INTO contribution
  FROM public.project_versions
  WHERE id = _version_id
  FOR UPDATE;
  IF contribution.id IS NULL THEN
    RAISE EXCEPTION 'CONTRIBUTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.owner_id INTO owner_id FROM public.projects p WHERE p.id = contribution.project_id;
  -- Only the owner decides what enters their project's history.
  IF owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NOT_PROJECT_OWNER' USING ERRCODE = '42501';
  END IF;
  IF contribution.status <> 'pending' THEN
    RAISE EXCEPTION 'CONTRIBUTION_ALREADY_REVIEWED' USING ERRCODE = 'P0001';
  END IF;

  IF _decision = 'reject' THEN
    UPDATE public.project_versions
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = _review_note
    WHERE id = _version_id;
    RETURN jsonb_build_object('version_id', _version_id, 'status', 'rejected', 'version_number', NULL);
  END IF;

  -- Serialize against concurrent approvals so two fork requests cannot take the
  -- same version number.
  PERFORM pg_advisory_xact_lock(hashtextextended(contribution.project_id::text, 3));
  SELECT COALESCE(max(version_number), 0) + 1 INTO next_version_number
  FROM public.project_versions
  WHERE project_id = contribution.project_id AND status = 'approved';

  UPDATE public.project_versions
  SET status = 'approved',
      version_number = next_version_number,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = _review_note
  WHERE id = _version_id;

  UPDATE public.projects SET updated_at = now() WHERE id = contribution.project_id;

  RETURN jsonb_build_object(
    'version_id', _version_id,
    'status', 'approved',
    'version_number', next_version_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_project_contribution(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_project_contribution(uuid, text, text) TO authenticated;

-- ------------------------------------------------- finalization sends a fork
-- request instead of appending to someone else's main line.
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
  project_owner_id uuid;
  is_owner_upload boolean;
  contribution_state public.contribution_status;
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
    status
  ) VALUES (
    resolved_project_id, next_version_number, COALESCE(next_major, 1),
    COALESCE(first_version, false),
    _uploader_id, COALESCE(_change_note, 'Auto-saved from desktop'), NULL,
    _manifest, _plugin_list, _track_list, _ableton_version, _sample_check,
    manifest_logical_size, authoritative_uploaded_bytes, authoritative_reused_bytes,
    contribution_state
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
