-- Saving and sharing have different requirements. Accept every inspected
-- snapshot, but only expose complete versions to collaborators/share links and
-- prevent new sharing while the newest snapshot is incomplete.

CREATE OR REPLACE FUNCTION public.is_project_version_share_ready(_sample_check jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _sample_check IS NOT NULL
    AND jsonb_typeof(_sample_check) = 'object'
    AND jsonb_typeof(_sample_check -> 'missing') = 'number'
    AND jsonb_typeof(_sample_check -> 'external') = 'number'
    AND COALESCE(_sample_check -> 'verified', 'true'::jsonb) = 'true'::jsonb
    AND (_sample_check ->> 'missing')::numeric = 0
    AND (_sample_check ->> 'external')::numeric = 0;
$$;

-- Versions created before sample inspection existed remain shareable.
UPDATE public.project_versions
SET sample_check = jsonb_build_object(
  'included', 0,
  'missing', 0,
  'external', 0,
  'missing_paths', '[]'::jsonb,
  'external_paths', '[]'::jsonb,
  'legacy', true
)
WHERE sample_check IS NULL;

-- Keep requiring trustworthy metadata, but no longer reject incomplete saves.
CREATE OR REPLACE FUNCTION public.require_complete_samples_for_project_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sample_check IS NULL
    OR jsonb_typeof(NEW.sample_check) <> 'object'
    OR jsonb_typeof(NEW.sample_check -> 'included') <> 'number'
    OR jsonb_typeof(NEW.sample_check -> 'missing') <> 'number'
    OR jsonb_typeof(NEW.sample_check -> 'external') <> 'number'
    OR (
      NEW.sample_check ? 'verified'
      AND jsonb_typeof(NEW.sample_check -> 'verified') <> 'boolean'
    )
  THEN
    RAISE EXCEPTION 'A valid sample completeness check is required for every upload'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.sample_check ->> 'included')::numeric < 0
    OR (NEW.sample_check ->> 'missing')::numeric < 0
    OR (NEW.sample_check ->> 'external')::numeric < 0
  THEN
    RAISE EXCEPTION 'Sample completeness counts cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_latest_version_is_share_ready(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.is_project_version_share_ready(pv.sample_check)
    FROM public.project_versions pv
    WHERE pv.project_id = _project_id
    ORDER BY pv.version_number DESC, pv.created_at DESC
    LIMIT 1
  ), false);
$$;

-- Owners keep their full private save history. Collaborators only receive
-- snapshots that contain all referenced samples.
DROP POLICY IF EXISTS "Users can view versions of accessible projects" ON public.project_versions;
CREATE POLICY "Users can view versions of accessible projects"
ON public.project_versions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_versions.project_id
      AND (
        p.owner_id = auth.uid()
        OR (
          public.is_project_version_share_ready(project_versions.sample_check)
          AND EXISTS (
            SELECT 1 FROM public.collaborators c
            WHERE c.project_id = p.id AND c.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.prevent_incomplete_project_collaboration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.project_latest_version_is_share_ready(NEW.project_id) THEN
    RAISE EXCEPTION 'Collect All and Save before sharing this project'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_incomplete_project_collaboration ON public.collaborators;
CREATE TRIGGER prevent_incomplete_project_collaboration
BEFORE INSERT ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.prevent_incomplete_project_collaboration();

CREATE OR REPLACE FUNCTION public.ensure_project_share_token(_project_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_token text;
  new_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT share_token INTO existing_token
  FROM public.projects
  WHERE id = _project_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or not owned by user';
  END IF;
  IF NOT public.project_latest_version_is_share_ready(_project_id) THEN
    RAISE EXCEPTION 'Collect All and Save before sharing this project';
  END IF;

  IF existing_token IS NOT NULL AND length(existing_token) > 0 THEN
    RETURN existing_token;
  END IF;

  LOOP
    new_token := replace(gen_random_uuid()::text, '-', '');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.projects WHERE share_token = new_token);
  END LOOP;

  UPDATE public.projects
  SET share_token = new_token
  WHERE id = _project_id AND owner_id = auth.uid();
  RETURN new_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_project_invite(
  _project_id uuid,
  _email text,
  _permission text DEFAULT 'viewer'
)
RETURNS public.project_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text := lower(trim(_email));
  v_invite public.project_invites;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _permission NOT IN ('viewer', 'contributor') THEN RAISE EXCEPTION 'Invalid permission level'; END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.owner_id = v_user
  ) THEN
    RAISE EXCEPTION 'Only the project owner can create invites';
  END IF;
  IF NOT public.project_latest_version_is_share_ready(_project_id) THEN
    RAISE EXCEPTION 'Collect All and Save before sharing this project';
  END IF;
  IF (
    SELECT count(*) FROM public.project_invites
    WHERE invited_by = v_user AND created_at > now() - interval '1 day'
  ) >= 20 THEN
    RAISE EXCEPTION 'Daily invite limit reached — try again tomorrow';
  END IF;

  UPDATE public.project_invites
  SET permission_level = _permission::public.permission_level,
      expires_at = now() + interval '14 days'
  WHERE project_id = _project_id AND email = v_email AND accepted_at IS NULL
  RETURNING * INTO v_invite;

  IF v_invite.id IS NULL THEN
    INSERT INTO public.project_invites (project_id, email, permission_level, invited_by)
    VALUES (_project_id, v_email, _permission::public.permission_level, v_user)
    RETURNING * INTO v_invite;
  END IF;
  RETURN v_invite;
END;
$$;

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
  WHERE public.is_project_version_share_ready(pv.sample_check)
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

-- Existing tokens may still open the last complete snapshot, but cannot add a
-- new collaborator while the owner's newest save is incomplete.
CREATE OR REPLACE FUNCTION public.accept_share_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_owner_id uuid;
  v_user_id uuid := auth.uid();
  v_invite public.project_invites;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_invite
  FROM public.project_invites
  WHERE token = _token AND accepted_at IS NULL AND expires_at > now()
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    SELECT owner_id INTO v_owner_id FROM public.projects WHERE id = v_invite.project_id;
    IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired share link'; END IF;
    IF v_owner_id = v_user_id THEN RETURN v_invite.project_id; END IF;
    IF NOT public.project_latest_version_is_share_ready(v_invite.project_id) THEN
      RAISE EXCEPTION 'This project needs Collect All and Save before a collaborator can join';
    END IF;

    INSERT INTO public.collaborators (project_id, user_id, permission_level)
    VALUES (v_invite.project_id, v_user_id, v_invite.permission_level)
    ON CONFLICT (project_id, user_id) DO NOTHING;
    UPDATE public.project_invites
    SET accepted_by = v_user_id, accepted_at = now()
    WHERE id = v_invite.id;
    RETURN v_invite.project_id;
  END IF;

  SELECT id, owner_id INTO v_project_id, v_owner_id
  FROM public.projects
  WHERE share_token = _token AND share_token IS NOT NULL
  LIMIT 1;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired share link'; END IF;
  IF v_owner_id = v_user_id THEN RETURN v_project_id; END IF;
  IF NOT public.project_latest_version_is_share_ready(v_project_id) THEN
    RAISE EXCEPTION 'This project needs Collect All and Save before a collaborator can join';
  END IF;

  INSERT INTO public.collaborators (project_id, user_id, permission_level)
  VALUES (v_project_id, v_user_id, 'viewer')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN v_project_id;
END;
$$;
