-- Store a changed .als as a patch against an earlier one.
--
-- A blob is still addressed by the sha256 of the *file* it reconstructs; only its
-- stored representation changes. `stored_bytes` is what actually occupies the
-- bucket and is what quota now counts, while `size_bytes` stays the logical file
-- size the manifest records.
--
-- Deltas are depth 1 by construction: a delta's base must itself be raw. A single
-- hop keeps restore cheap and stops one bad object from cascading through a chain.

ALTER TABLE public.project_blobs
  ADD COLUMN IF NOT EXISTS encoding text NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS base_sha256 text,
  ADD COLUMN IF NOT EXISTS stored_bytes bigint;

UPDATE public.project_blobs SET stored_bytes = size_bytes WHERE stored_bytes IS NULL;

ALTER TABLE public.project_blobs
  ALTER COLUMN stored_bytes SET NOT NULL;

ALTER TABLE public.project_blobs
  DROP CONSTRAINT IF EXISTS project_blobs_encoding_check,
  DROP CONSTRAINT IF EXISTS project_blobs_delta_base_check,
  DROP CONSTRAINT IF EXISTS project_blobs_stored_bytes_check,
  DROP CONSTRAINT IF EXISTS project_blobs_base_fk;

ALTER TABLE public.project_blobs
  ADD CONSTRAINT project_blobs_encoding_check
    CHECK (encoding IN ('raw', 'als_xml_delta')),
  ADD CONSTRAINT project_blobs_delta_base_check
    CHECK (
      (encoding = 'raw' AND base_sha256 IS NULL)
      OR (encoding = 'als_xml_delta' AND base_sha256 IS NOT NULL AND base_sha256 <> sha256)
    ),
  ADD CONSTRAINT project_blobs_stored_bytes_check
    CHECK (stored_bytes >= 0 AND stored_bytes <= 5368709120),
  -- RESTRICT is the point: a keyframe cannot be dropped while a delta needs it.
  ADD CONSTRAINT project_blobs_base_fk
    FOREIGN KEY (user_id, base_sha256)
    REFERENCES public.project_blobs(user_id, sha256) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS project_blobs_base_idx
  ON public.project_blobs(user_id, base_sha256)
  WHERE base_sha256 IS NOT NULL;

-- Enforce the depth-1 rule the FK cannot express.
CREATE OR REPLACE FUNCTION public.enforce_blob_delta_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_encoding text;
BEGIN
  IF NEW.encoding <> 'als_xml_delta' THEN
    RETURN NEW;
  END IF;
  SELECT encoding INTO base_encoding
  FROM public.project_blobs
  WHERE user_id = NEW.user_id AND sha256 = NEW.base_sha256;
  IF base_encoding IS DISTINCT FROM 'raw' THEN
    RAISE EXCEPTION 'DELTA_BASE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_blob_delta_depth ON public.project_blobs;
CREATE TRIGGER enforce_blob_delta_depth
BEFORE INSERT OR UPDATE OF encoding, base_sha256 ON public.project_blobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_blob_delta_depth();

-- A raw blob may not be rewritten as a delta once deltas depend on it.
CREATE OR REPLACE FUNCTION public.protect_delta_base_encoding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.encoding = 'raw' AND NEW.encoding <> 'raw' AND EXISTS (
    SELECT 1 FROM public.project_blobs child
    WHERE child.user_id = OLD.user_id AND child.base_sha256 = OLD.sha256
  ) THEN
    RAISE EXCEPTION 'DELTA_BASE_IN_USE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_delta_base_encoding ON public.project_blobs;
CREATE TRIGGER protect_delta_base_encoding
BEFORE UPDATE OF encoding ON public.project_blobs
FOR EACH ROW EXECUTE FUNCTION public.protect_delta_base_encoding();

ALTER TABLE public.upload_reservation_blobs
  ADD COLUMN IF NOT EXISTS encoding text NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS base_sha256 text,
  ADD COLUMN IF NOT EXISTS stored_bytes bigint;

UPDATE public.upload_reservation_blobs SET stored_bytes = size_bytes WHERE stored_bytes IS NULL;

ALTER TABLE public.upload_reservation_blobs
  ALTER COLUMN stored_bytes SET NOT NULL;

ALTER TABLE public.upload_reservation_blobs
  DROP CONSTRAINT IF EXISTS upload_reservation_blobs_encoding_check;

ALTER TABLE public.upload_reservation_blobs
  ADD CONSTRAINT upload_reservation_blobs_encoding_check
    CHECK (encoding IN ('raw', 'als_xml_delta'));

-- Quota counts what sits in the bucket, so a delta costs its patch, not the file
-- it rebuilds. A keyframe still referenced only as some delta's base is retained
-- by the FK above, so it has to be counted even when no version cites it directly.
CREATE OR REPLACE FUNCTION public.account_physical_storage_bytes(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH blob_bytes AS (
    SELECT COALESCE(sum(pb.stored_bytes), 0)::bigint AS bytes
    FROM public.project_blobs pb
    WHERE pb.user_id = _user_id
      AND pb.status = 'ready'
      AND (
        EXISTS (
          SELECT 1 FROM public.project_version_blobs pvb
          WHERE pvb.user_id = pb.user_id AND pvb.sha256 = pb.sha256
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_blobs child
          JOIN public.project_version_blobs pvb
            ON pvb.user_id = child.user_id AND pvb.sha256 = child.sha256
          WHERE child.user_id = pb.user_id AND child.base_sha256 = pb.sha256
        )
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

-- Never queue a keyframe for deletion while a delta still rebuilds from it.
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
  ) AND NOT EXISTS (
    SELECT 1 FROM public.project_blobs child
    WHERE child.user_id = OLD.user_id AND child.base_sha256 = OLD.sha256
  ) AND blob_path IS NOT NULL THEN
    INSERT INTO public.storage_deletion_candidates(bucket, object_path)
    VALUES ('project-blobs', blob_path)
    ON CONFLICT (bucket, object_path) DO UPDATE SET unreferenced_at = now();
  END IF;
  RETURN OLD;
END;
$$;

-- Accept a delta proposal per file. The client cannot know whether the server
-- still holds the base it cached, so an unusable base silently downgrades that
-- file to raw rather than failing the sync; the response says what was accepted.
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
    SELECT f.sha256,
           max(f.size_bytes)::bigint AS size_bytes,
           (array_agg(f.encoding ORDER BY f.size_bytes))[1] AS encoding,
           (array_agg(f.base_sha256 ORDER BY f.size_bytes))[1] AS base_sha256,
           (array_agg(f.stored_bytes ORDER BY f.size_bytes))[1] AS stored_bytes
    FROM jsonb_to_recordset(_files)
      AS f(sha256 text, size_bytes bigint, encoding text, base_sha256 text, stored_bytes bigint)
    WHERE f.sha256 ~ '^[0-9a-f]{64}$'
      AND f.size_bytes BETWEEN 0 AND 5368709120
    GROUP BY f.sha256
  ), absent AS (
    SELECT r.sha256, r.size_bytes, storage_owner::text || '/' || r.sha256 AS object_path,
           r.encoding, r.base_sha256, r.stored_bytes
    FROM requested r
    LEFT JOIN public.project_blobs pb
      ON pb.user_id = storage_owner AND pb.sha256 = r.sha256
       AND pb.size_bytes = r.size_bytes AND pb.status = 'ready'
    WHERE pb.sha256 IS NULL
  ), resolved AS (
    -- A delta is honoured only when its base is a ready, raw blob this owner
    -- holds and the patch is genuinely smaller than the file.
    SELECT a.sha256, a.size_bytes, a.object_path,
           CASE
             WHEN a.encoding = 'als_xml_delta'
              AND a.stored_bytes IS NOT NULL
              AND a.stored_bytes > 0
              AND a.stored_bytes < a.size_bytes
              AND a.base_sha256 IS DISTINCT FROM a.sha256
              AND EXISTS (
                SELECT 1 FROM public.project_blobs base
                WHERE base.user_id = storage_owner
                  AND base.sha256 = a.base_sha256
                  AND base.status = 'ready'
                  AND base.encoding = 'raw'
              )
             THEN 'als_xml_delta'
             ELSE 'raw'
           END AS encoding,
           a.base_sha256 AS proposed_base,
           a.stored_bytes AS proposed_stored
    FROM absent a
  ), finalized AS (
    SELECT sha256, size_bytes, object_path, encoding,
           CASE WHEN encoding = 'als_xml_delta' THEN proposed_base ELSE NULL END AS base_sha256,
           CASE WHEN encoding = 'als_xml_delta' THEN proposed_stored ELSE size_bytes END AS stored_bytes
    FROM resolved
  )
  SELECT COALESCE(sum(stored_bytes), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'sha256', sha256, 'size', size_bytes, 'object_path', object_path,
           'encoding', encoding, 'base_sha256', base_sha256, 'stored_bytes', stored_bytes
         ) ORDER BY sha256), '[]'::jsonb)
  INTO requested_bytes, missing
  FROM finalized;

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
    reservation_id, sha256, size_bytes, object_path, encoding, base_sha256, stored_bytes
  )
  SELECT reservation_id, value->>'sha256', (value->>'size')::bigint, value->>'object_path',
         value->>'encoding', value->>'base_sha256', (value->>'stored_bytes')::bigint
  FROM jsonb_array_elements(missing);

  INSERT INTO public.project_blobs(
    user_id, sha256, size_bytes, object_path, status, encoding, base_sha256, stored_bytes
  )
  SELECT storage_owner, value->>'sha256', (value->>'size')::bigint,
         value->>'object_path', 'pending',
         value->>'encoding', value->>'base_sha256', (value->>'stored_bytes')::bigint
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

REVOKE ALL ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) TO service_role;

-- Promotion must carry the stored representation the reservation agreed on, or a
-- delta would land in project_blobs recorded as a whole file and be rebuilt as
-- garbage on restore. Copied from 20260902190000 with only that INSERT changed.

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
    user_id, sha256, size_bytes, object_path, status, verified_at,
    encoding, base_sha256, stored_bytes
  )
  SELECT reservation.storage_owner_id,
         urb.sha256,
         urb.size_bytes,
         urb.object_path,
         'ready', now(),
         urb.encoding,
         urb.base_sha256,
         urb.stored_bytes
  FROM public.upload_reservation_blobs urb
  WHERE urb.reservation_id = reservation.id
  ON CONFLICT (user_id, sha256) DO UPDATE
    SET status = 'ready', verified_at = now(),
        encoding = EXCLUDED.encoding,
        base_sha256 = EXCLUDED.base_sha256,
        stored_bytes = EXCLUDED.stored_bytes
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
