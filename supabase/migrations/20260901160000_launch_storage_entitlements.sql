-- Launch storage economics: account entitlements, owner-scoped physical usage,
-- quota reservations, and atomic manifest-version finalization.

ALTER TABLE public.project_blobs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE public.project_blobs
SET status = 'ready', verified_at = COALESCE(verified_at, created_at)
WHERE status IS DISTINCT FROM 'ready' OR verified_at IS NULL;

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS audio_preview_size_bytes bigint NOT NULL DEFAULT 0
    CHECK (audio_preview_size_bytes >= 0),
  ADD COLUMN IF NOT EXISTS uploaded_bytes bigint NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
  ADD COLUMN IF NOT EXISTS reused_bytes bigint NOT NULL DEFAULT 0 CHECK (reused_bytes >= 0);

CREATE TABLE public.storage_transfer_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.project_versions(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('restore', 'download')),
  bytes bigint NOT NULL CHECK (bytes >= 0),
  app_surface text NOT NULL CHECK (app_surface IN ('web', 'desktop')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storage_transfer_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.account_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free', 'producer', 'studio', 'founding_producer', 'legacy')),
  storage_limit_bytes bigint CHECK (storage_limit_bytes IS NULL OR storage_limit_bytes >= 0),
  max_projects integer CHECK (max_projects IS NULL OR max_projects >= 0),
  max_collaborators_per_project integer CHECK (
    max_collaborators_per_project IS NULL OR max_collaborators_per_project >= 0
  ),
  unlimited_version_history boolean NOT NULL DEFAULT true,
  grandfathered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own entitlement"
ON public.account_entitlements FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Every account that exists when this migration lands keeps the alpha promise.
INSERT INTO public.account_entitlements (
  user_id, plan, storage_limit_bytes, max_projects,
  max_collaborators_per_project, grandfathered
)
SELECT id, 'legacy', NULL, NULL, NULL, true
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_default_account_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.account_entitlements (
    user_id, plan, storage_limit_bytes, max_projects,
    max_collaborators_per_project, grandfathered
  ) VALUES (
    NEW.id, 'free', 5368709120, 5, 3, false
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_account_entitlement ON auth.users;
CREATE TRIGGER create_default_account_entitlement
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_default_account_entitlement();

CREATE TABLE public.upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'project_manifest'
    CHECK (kind IN ('project_manifest', 'audio_preview')),
  object_path text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz
);

CREATE INDEX upload_reservations_owner_active_idx
  ON public.upload_reservations(storage_owner_id, expires_at)
  WHERE status = 'active';

ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.upload_reservation_blobs (
  reservation_id uuid NOT NULL REFERENCES public.upload_reservations(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 5368709120),
  object_path text NOT NULL,
  PRIMARY KEY (reservation_id, sha256)
);

ALTER TABLE public.upload_reservation_blobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.storage_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('dry_run', 'delete')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  scanned_objects bigint NOT NULL DEFAULT 0,
  scanned_bytes bigint NOT NULL DEFAULT 0,
  candidate_objects bigint NOT NULL DEFAULT 0,
  candidate_bytes bigint NOT NULL DEFAULT 0,
  deleted_objects bigint NOT NULL DEFAULT 0,
  reclaimed_bytes bigint NOT NULL DEFAULT 0,
  failed_objects bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.storage_cleanup_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.storage_deletion_candidates (
  bucket text NOT NULL CHECK (bucket IN ('project-zips', 'project-blobs', 'audio-previews')),
  object_path text NOT NULL,
  unreferenced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, object_path)
);
ALTER TABLE public.storage_deletion_candidates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.queue_version_storage_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.zip_url IS NOT NULL THEN
      INSERT INTO public.storage_deletion_candidates(bucket, object_path)
      VALUES ('project-zips', OLD.zip_url)
      ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
    END IF;
    IF OLD.audio_preview_url IS NOT NULL AND position('/audio-previews/' in OLD.audio_preview_url) > 0 THEN
      INSERT INTO public.storage_deletion_candidates(bucket, object_path)
      VALUES ('audio-previews', split_part(OLD.audio_preview_url, '/audio-previews/', 2))
      ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.zip_url IS NOT NULL AND OLD.zip_url IS DISTINCT FROM NEW.zip_url THEN
    INSERT INTO public.storage_deletion_candidates(bucket, object_path)
    VALUES ('project-zips', OLD.zip_url)
    ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
  END IF;
  IF OLD.audio_preview_url IS NOT NULL
     AND OLD.audio_preview_url IS DISTINCT FROM NEW.audio_preview_url
     AND position('/audio-previews/' in OLD.audio_preview_url) > 0 THEN
    INSERT INTO public.storage_deletion_candidates(bucket, object_path)
    VALUES ('audio-previews', split_part(OLD.audio_preview_url, '/audio-previews/', 2))
    ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_version_storage_deletion ON public.project_versions;
CREATE TRIGGER queue_version_storage_deletion
BEFORE DELETE ON public.project_versions
FOR EACH ROW EXECUTE FUNCTION public.queue_version_storage_deletion();

DROP TRIGGER IF EXISTS queue_replaced_version_storage_deletion ON public.project_versions;
CREATE TRIGGER queue_replaced_version_storage_deletion
BEFORE UPDATE OF zip_url, audio_preview_url ON public.project_versions
FOR EACH ROW EXECUTE FUNCTION public.queue_version_storage_deletion();

CREATE OR REPLACE FUNCTION public.sync_blob_storage_deletion_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blob_path text;
  blob_user uuid;
  blob_hash text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    blob_user := NEW.user_id;
    blob_hash := NEW.sha256;
  ELSE
    blob_user := OLD.user_id;
    blob_hash := OLD.sha256;
  END IF;
  SELECT object_path INTO blob_path FROM public.project_blobs
  WHERE user_id = blob_user AND sha256 = blob_hash;
  IF TG_OP = 'INSERT' THEN
    DELETE FROM public.storage_deletion_candidates
    WHERE bucket = 'project-blobs' AND object_path = blob_path;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_version_blobs
    WHERE user_id = OLD.user_id AND sha256 = OLD.sha256
  ) AND blob_path IS NOT NULL THEN
    INSERT INTO public.storage_deletion_candidates(bucket, object_path)
    VALUES ('project-blobs', blob_path)
    ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_blob_storage_deletion_candidate ON public.project_version_blobs;
CREATE TRIGGER sync_blob_storage_deletion_candidate
AFTER INSERT OR DELETE ON public.project_version_blobs
FOR EACH ROW EXECUTE FUNCTION public.sync_blob_storage_deletion_candidate();

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
  ), legacy_bytes AS (
    SELECT COALESCE(sum(pv.file_size_bytes), 0)::bigint AS bytes
    FROM public.project_versions pv
    JOIN public.projects p ON p.id = pv.project_id
    WHERE p.owner_id = _user_id
      AND pv.manifest IS NULL
      AND pv.zip_url IS NOT NULL
  ), preview_bytes AS (
    SELECT COALESCE(sum(pv.audio_preview_size_bytes), 0)::bigint AS bytes
    FROM public.project_versions pv
    JOIN public.projects p ON p.id = pv.project_id
    WHERE p.owner_id = _user_id
      AND pv.audio_preview_url IS NOT NULL
  )
  SELECT blob_bytes.bytes + legacy_bytes.bytes + preview_bytes.bytes
  FROM blob_bytes, legacy_bytes, preview_bytes;
$$;

CREATE OR REPLACE FUNCTION public.account_reserved_storage_bytes(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(reserved_bytes), 0)::bigint
  FROM public.upload_reservations
  WHERE storage_owner_id = _user_id
    AND status = 'active'
    AND expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.storage_warning_level(
  _used bigint, _reserved bigint, _limit bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _limit IS NULL THEN 'unlimited'
    WHEN _used + _reserved >= _limit THEN 'limit'
    WHEN (_used + _reserved)::numeric / GREATEST(_limit, 1) >= 0.95 THEN '95'
    WHEN (_used + _reserved)::numeric / GREATEST(_limit, 1) >= 0.80 THEN '80'
    ELSE 'none'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_storage_usage(_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := COALESCE(_user_id, auth.uid());
  entitlement public.account_entitlements;
  used_bytes bigint;
  reserved_bytes bigint;
BEGIN
  IF target_user IS NULL OR (auth.uid() IS NOT NULL AND target_user <> auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO entitlement FROM public.account_entitlements WHERE user_id = target_user;
  IF entitlement.user_id IS NULL THEN
    entitlement.plan := 'free';
    entitlement.storage_limit_bytes := 5368709120;
    entitlement.max_projects := 5;
    entitlement.max_collaborators_per_project := 3;
    entitlement.grandfathered := false;
  END IF;

  used_bytes := public.account_physical_storage_bytes(target_user);
  reserved_bytes := public.account_reserved_storage_bytes(target_user);
  RETURN jsonb_build_object(
    'user_id', target_user,
    'plan', entitlement.plan,
    'grandfathered', entitlement.grandfathered,
    'used_bytes', used_bytes,
    'reserved_bytes', reserved_bytes,
    'limit_bytes', entitlement.storage_limit_bytes,
    'warning_level', public.storage_warning_level(
      used_bytes, reserved_bytes, entitlement.storage_limit_bytes
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_storage_usage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_project_upload(
  _uploader_id uuid,
  _project_id uuid,
  _files jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  storage_owner uuid;
  entitlement public.account_entitlements;
  used_bytes bigint;
  active_reserved bigint;
  requested_bytes bigint;
  reservation_id uuid;
  missing jsonb;
  reused_bytes bigint;
  current_projects integer;
BEGIN
  IF jsonb_typeof(_files) <> 'array' OR jsonb_array_length(_files) > 20000 THEN
    RAISE EXCEPTION 'MANIFEST_INVALID' USING ERRCODE = '22023';
  END IF;

  IF _project_id IS NULL THEN
    storage_owner := _uploader_id;
  ELSE
    SELECT p.owner_id INTO storage_owner FROM public.projects p WHERE p.id = _project_id;
    IF storage_owner IS NULL THEN
      RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF storage_owner <> _uploader_id AND NOT EXISTS (
      SELECT 1 FROM public.collaborators
      WHERE project_id = _project_id AND user_id = _uploader_id
        AND permission_level = 'contributor'
    ) THEN
      RAISE EXCEPTION 'PROJECT_UPLOAD_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(storage_owner::text, 0));
  UPDATE public.upload_reservations
  SET status = 'expired'
  WHERE storage_owner_id = storage_owner AND status = 'active' AND expires_at <= now();

  SELECT * INTO entitlement FROM public.account_entitlements WHERE user_id = storage_owner;
  IF entitlement.user_id IS NULL THEN
    entitlement.plan := 'free';
    entitlement.storage_limit_bytes := 5368709120;
    entitlement.max_projects := 5;
    entitlement.max_collaborators_per_project := 3;
  END IF;

  IF _project_id IS NULL AND entitlement.max_projects IS NOT NULL THEN
    SELECT count(*) INTO current_projects FROM public.projects p WHERE p.owner_id = storage_owner;
    current_projects := current_projects + (
      SELECT count(*) FROM public.upload_reservations
      WHERE storage_owner_id = storage_owner AND project_id IS NULL
        AND status = 'active' AND expires_at > now()
    );
    IF current_projects >= entitlement.max_projects THEN
      RAISE EXCEPTION 'PROJECT_LIMIT_REACHED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_files) AS f(sha256 text, size_bytes bigint)
    JOIN public.project_blobs pb
      ON pb.user_id = storage_owner AND pb.sha256 = f.sha256
    WHERE pb.size_bytes <> f.size_bytes
  ) THEN
    RAISE EXCEPTION 'BLOB_SIZE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_files) AS f(sha256 text, size_bytes bigint)
    JOIN public.upload_reservation_blobs urb
      ON urb.sha256 = f.sha256 AND urb.size_bytes = f.size_bytes
    JOIN public.upload_reservations ur ON ur.id = urb.reservation_id
    WHERE ur.storage_owner_id = storage_owner
      AND ur.status = 'active' AND ur.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'UPLOAD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  WITH requested AS (
    SELECT sha256, max(size_bytes)::bigint AS size_bytes
    FROM jsonb_to_recordset(_files) AS f(sha256 text, size_bytes bigint)
    WHERE sha256 ~ '^[0-9a-f]{64}$'
      AND size_bytes BETWEEN 0 AND 5368709120
    GROUP BY sha256
  ), absent AS (
    SELECT r.sha256, r.size_bytes, storage_owner::text || '/' || r.sha256 AS object_path
    FROM requested r
    LEFT JOIN public.project_blobs pb
      ON pb.user_id = storage_owner AND pb.sha256 = r.sha256
       AND pb.size_bytes = r.size_bytes AND pb.status = 'ready'
    WHERE pb.sha256 IS NULL
  )
  SELECT COALESCE(sum(size_bytes), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'sha256', sha256, 'size', size_bytes, 'object_path', object_path
         ) ORDER BY sha256), '[]'::jsonb)
  INTO requested_bytes, missing
  FROM absent;

  SELECT COALESCE(sum((item->>'size_bytes')::bigint), 0) - requested_bytes
  INTO reused_bytes
  FROM jsonb_array_elements(_files) item;
  reused_bytes := GREATEST(reused_bytes, 0);

  used_bytes := public.account_physical_storage_bytes(storage_owner);
  active_reserved := public.account_reserved_storage_bytes(storage_owner);
  IF entitlement.storage_limit_bytes IS NOT NULL
     AND used_bytes + active_reserved + requested_bytes > entitlement.storage_limit_bytes THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'used_bytes', used_bytes,
              'reserved_bytes', active_reserved,
              'required_bytes', requested_bytes,
              'limit_bytes', entitlement.storage_limit_bytes
            )::text;
  END IF;

  INSERT INTO public.upload_reservations (
    storage_owner_id, uploader_id, project_id, reserved_bytes
  ) VALUES (storage_owner, _uploader_id, _project_id, requested_bytes)
  RETURNING id INTO reservation_id;

  INSERT INTO public.upload_reservation_blobs (
    reservation_id, sha256, size_bytes, object_path
  )
  SELECT reservation_id, value->>'sha256', (value->>'size')::bigint, value->>'object_path'
  FROM jsonb_array_elements(missing);

  INSERT INTO public.project_blobs(user_id, sha256, size_bytes, object_path, status)
  SELECT storage_owner, value->>'sha256', (value->>'size')::bigint,
         value->>'object_path', 'pending'
  FROM jsonb_array_elements(missing)
  ON CONFLICT (user_id, sha256) DO NOTHING;

  RETURN jsonb_build_object(
    'reservation_id', reservation_id,
    'storage_owner_id', storage_owner,
    'expires_at', now() + interval '24 hours',
    'missing', missing,
    'reused_bytes', reused_bytes,
    'usage', jsonb_build_object(
      'used_bytes', used_bytes,
      'reserved_bytes', active_reserved + requested_bytes,
      'limit_bytes', entitlement.storage_limit_bytes,
      'projected_bytes', used_bytes + active_reserved + requested_bytes,
      'warning_level', public.storage_warning_level(
        used_bytes, active_reserved + requested_bytes, entitlement.storage_limit_bytes
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_upload_reservation(
  _reservation_id uuid, _uploader_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.upload_reservations
  SET status = 'cancelled', completed_at = now()
  WHERE id = _reservation_id AND uploader_id = _uploader_id AND status = 'active';
$$;

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

  INSERT INTO public.project_blobs (
    user_id, sha256, size_bytes, object_path, status, verified_at
  )
  SELECT reservation.storage_owner_id,
         item->>'sha256',
         (item->>'size')::bigint,
         reservation.storage_owner_id::text || '/' || (item->>'sha256'),
         'ready', now()
  FROM jsonb_array_elements(COALESCE(_ready_blobs, '[]'::jsonb)) item
  ON CONFLICT (user_id, sha256) DO UPDATE
    SET status = 'ready', verified_at = now()
    WHERE public.project_blobs.size_bytes = EXCLUDED.size_bytes;

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

  SELECT COALESCE(max(version_number), 1),
         COALESCE(max(major_version), COALESCE(max(version_number), 1)),
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
    _logical_size, GREATEST(COALESCE(_uploaded_bytes, 0), 0), GREATEST(COALESCE(_reused_bytes, 0), 0)
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

CREATE OR REPLACE FUNCTION public.reserve_audio_preview_upload(
  _uploader_id uuid, _version_id uuid, _size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_project uuid;
  owner_id uuid;
  entitlement public.account_entitlements;
  used_bytes bigint;
  active_reserved bigint;
  reservation_id uuid;
  preview_path text;
BEGIN
  IF _size_bytes < 0 OR _size_bytes > 524288000 THEN
    RAISE EXCEPTION 'PREVIEW_SIZE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pv.project_id, p.owner_id INTO target_project, owner_id
  FROM public.project_versions pv JOIN public.projects p ON p.id = pv.project_id
  WHERE pv.id = _version_id;
  IF target_project IS NULL THEN
    RAISE EXCEPTION 'VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF owner_id <> _uploader_id AND NOT EXISTS (
    SELECT 1 FROM public.collaborators
    WHERE project_id = target_project AND user_id = _uploader_id
      AND permission_level = 'contributor'
  ) THEN
    RAISE EXCEPTION 'PREVIEW_UPLOAD_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  SELECT * INTO entitlement FROM public.account_entitlements WHERE user_id = owner_id;
  IF entitlement.user_id IS NULL THEN
    entitlement.plan := 'free';
    entitlement.storage_limit_bytes := 5368709120;
    entitlement.max_projects := 5;
    entitlement.max_collaborators_per_project := 3;
  END IF;
  used_bytes := public.account_physical_storage_bytes(owner_id);
  active_reserved := public.account_reserved_storage_bytes(owner_id);
  IF entitlement.storage_limit_bytes IS NOT NULL
     AND used_bytes + active_reserved + _size_bytes > entitlement.storage_limit_bytes THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;
  preview_path := owner_id::text || '/' || gen_random_uuid()::text;
  INSERT INTO public.upload_reservations(
    storage_owner_id, uploader_id, project_id, kind, object_path, reserved_bytes
  ) VALUES (owner_id, _uploader_id, target_project, 'audio_preview', preview_path, _size_bytes)
  RETURNING id INTO reservation_id;
  RETURN jsonb_build_object(
    'reservation_id', reservation_id,
    'storage_owner_id', owner_id,
    'object_path', preview_path,
    'expires_at', now() + interval '24 hours',
    'usage', jsonb_build_object(
      'used_bytes', used_bytes,
      'reserved_bytes', active_reserved + _size_bytes,
      'limit_bytes', entitlement.storage_limit_bytes,
      'projected_bytes', used_bytes + active_reserved + _size_bytes,
      'warning_level', public.storage_warning_level(
        used_bytes, active_reserved + _size_bytes, entitlement.storage_limit_bytes
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_audio_preview_upload(
  _reservation_id uuid,
  _uploader_id uuid,
  _version_id uuid,
  _public_url text,
  _size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation public.upload_reservations;
BEGIN
  SELECT * INTO reservation FROM public.upload_reservations
  WHERE id = _reservation_id FOR UPDATE;
  IF reservation.id IS NULL OR reservation.uploader_id <> _uploader_id
     OR reservation.kind <> 'audio_preview' OR reservation.status <> 'active'
     OR reservation.expires_at <= now() OR reservation.reserved_bytes <> _size_bytes THEN
    RAISE EXCEPTION 'RESERVATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_versions
    WHERE id = _version_id AND project_id = reservation.project_id
  ) THEN
    RAISE EXCEPTION 'VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.project_versions
  SET audio_preview_url = _public_url, audio_preview_size_bytes = _size_bytes
  WHERE id = _version_id;
  UPDATE public.upload_reservations
  SET status = 'completed', completed_at = now()
  WHERE id = reservation.id;
  RETURN public.get_account_storage_usage(reservation.storage_owner_id);
END;
$$;

-- New project/version payloads must use the quota-aware service boundary.
DROP POLICY IF EXISTS "Owners and contributors can insert versions" ON public.project_versions;
DROP POLICY IF EXISTS "Auth users can upload project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder in project-zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own project zips" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload audio previews" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload audio previews for accessible projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own audio previews" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own audio previews" ON storage.objects;

-- Sample readiness is advisory; keep collecting the metadata without rejecting saves.
DROP TRIGGER IF EXISTS require_complete_samples_for_project_version ON public.project_versions;

CREATE OR REPLACE FUNCTION public.enforce_project_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_limit integer;
  project_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text, 1));
  SELECT max_projects INTO project_limit
  FROM public.account_entitlements WHERE user_id = NEW.owner_id;
  project_limit := COALESCE(project_limit, 5);
  IF EXISTS (
    SELECT 1 FROM public.account_entitlements
    WHERE user_id = NEW.owner_id AND max_projects IS NULL
  ) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO project_count FROM public.projects WHERE owner_id = NEW.owner_id;
  IF project_count >= project_limit THEN
    RAISE EXCEPTION 'PROJECT_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_project_entitlement ON public.projects;
CREATE TRIGGER enforce_project_entitlement
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_entitlement();

CREATE OR REPLACE FUNCTION public.enforce_collaborator_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  collaborator_limit integer;
  collaborator_count integer;
BEGIN
  SELECT p.owner_id INTO owner_id FROM public.projects p WHERE p.id = NEW.project_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text, 2));
  IF EXISTS (
    SELECT 1 FROM public.account_entitlements
    WHERE user_id = owner_id AND max_collaborators_per_project IS NULL
  ) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(max_collaborators_per_project, 3) INTO collaborator_limit
  FROM public.account_entitlements WHERE user_id = owner_id;
  collaborator_limit := COALESCE(collaborator_limit, 3);
  SELECT count(*) INTO collaborator_count
  FROM public.collaborators WHERE project_id = NEW.project_id;
  IF collaborator_count >= collaborator_limit THEN
    RAISE EXCEPTION 'COLLABORATOR_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_collaborator_entitlement ON public.collaborators;
CREATE TRIGGER enforce_collaborator_entitlement
BEFORE INSERT ON public.collaborators
FOR EACH ROW EXECUTE FUNCTION public.enforce_collaborator_entitlement();

CREATE OR REPLACE FUNCTION public.delete_project_version(_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_project uuid;
  owner_id uuid;
  remaining integer;
BEGIN
  SELECT pv.project_id, p.owner_id INTO target_project, owner_id
  FROM public.project_versions pv
  JOIN public.projects p ON p.id = pv.project_id
  WHERE pv.id = _version_id;
  IF target_project IS NULL OR owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'VERSION_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO remaining
  FROM public.project_versions WHERE project_id = target_project;
  IF remaining <= 1 THEN
    RAISE EXCEPTION 'LAST_VERSION_REQUIRES_PROJECT_DELETE' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.project_versions WHERE id = _version_id;
  RETURN jsonb_build_object(
    'project_id', target_project,
    'deleted_version_id', _version_id,
    'usage', public.get_account_storage_usage(owner_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_version(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.account_physical_storage_bytes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_reserved_storage_bytes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_upload_reservation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text, jsonb, jsonb, bigint, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_audio_preview_upload(uuid, uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_audio_preview_upload(uuid, uuid, uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_upload_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text, jsonb, jsonb, bigint, bigint
) TO service_role;

CREATE OR REPLACE VIEW public.storage_economics_daily
WITH (security_invoker = true)
AS
SELECT
  p.owner_id AS user_id,
  COALESCE(ae.plan, 'free') AS plan,
  date_trunc('day', pv.created_at) AS day,
  count(*) AS saves,
  sum(pv.file_size_bytes)::bigint AS logical_bytes,
  sum(pv.uploaded_bytes)::bigint AS uploaded_bytes,
  sum(pv.reused_bytes)::bigint AS reused_bytes,
  CASE WHEN sum(pv.file_size_bytes) > 0
    THEN 1 - sum(pv.uploaded_bytes)::numeric / sum(pv.file_size_bytes)
    ELSE 1
  END AS deduplication_ratio
FROM public.project_versions pv
JOIN public.projects p ON p.id = pv.project_id
LEFT JOIN public.account_entitlements ae ON ae.user_id = p.owner_id
GROUP BY p.owner_id, COALESCE(ae.plan, 'free'), date_trunc('day', pv.created_at);
GRANT EXECUTE ON FUNCTION public.reserve_audio_preview_upload(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_audio_preview_upload(uuid, uuid, uuid, text, bigint) TO service_role;
