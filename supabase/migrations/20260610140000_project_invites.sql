-- Personal invite links for collaborators who don't have an account yet.
-- The inviter shares the link through their own channel; Tunesfork never
-- emails unknown addresses. Invite tokens ride the existing share funnel:
-- get_project_by_share_token / get_versions_by_share_token / accept_share_invite
-- all resolve them, so the SharePage signup deeplink works unchanged.

CREATE TABLE public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  permission_level public.permission_level NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz
);

-- One pending invite per email per project; re-inviting refreshes it instead.
CREATE UNIQUE INDEX project_invites_pending_unique
  ON public.project_invites (project_id, email)
  WHERE accepted_at IS NULL;
CREATE INDEX idx_project_invites_project ON public.project_invites (project_id);

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project owners can manage invites"
ON public.project_invites
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = project_invites.project_id AND p.owner_id = auth.uid()
));

-- Token-based reads happen only through the SECURITY DEFINER functions below,
-- so no anon policy is needed.

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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _permission NOT IN ('viewer', 'contributor') THEN
    RAISE EXCEPTION 'Invalid permission level';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.owner_id = v_user
  ) THEN
    RAISE EXCEPTION 'Only the project owner can create invites';
  END IF;
  -- Abuse guard: invite links are cheap rows, but cap creation anyway.
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

REVOKE ALL ON FUNCTION public.create_project_invite(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_project_invite(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_project_invite(uuid, text, text) TO authenticated;

-- Resolve personal invite tokens in addition to project share tokens.
CREATE OR REPLACE FUNCTION public.get_project_by_share_token(_token text)
RETURNS SETOF public.projects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.projects WHERE share_token = _token
  UNION ALL
  SELECT p.* FROM public.projects p
  JOIN public.project_invites i ON i.project_id = p.id
  WHERE i.token = _token AND i.accepted_at IS NULL AND i.expires_at > now()
  LIMIT 1;
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
    pv.id,
    pv.project_id,
    pv.version_number,
    pv.change_note,
    pv.created_at,
    pv.file_size_bytes,
    pv.audio_preview_url,
    pv.track_list,
    pv.plugin_list
  FROM public.project_versions pv
  JOIN public.projects p ON p.id = pv.project_id
  WHERE p.share_token = _token
     OR EXISTS (
       SELECT 1 FROM public.project_invites i
       WHERE i.token = _token
         AND i.project_id = p.id
         AND i.accepted_at IS NULL
         AND i.expires_at > now()
     )
  ORDER BY pv.version_number DESC, pv.created_at DESC;
$$;

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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Personal invite token: single-use, expiring, carries its own permission.
  SELECT * INTO v_invite
  FROM public.project_invites
  WHERE token = _token AND accepted_at IS NULL AND expires_at > now()
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    SELECT owner_id INTO v_owner_id
    FROM public.projects WHERE id = v_invite.project_id;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired share link';
    END IF;

    -- Owner previewing their own invite link must not consume it.
    IF v_owner_id = v_user_id THEN
      RETURN v_invite.project_id;
    END IF;

    INSERT INTO public.collaborators (project_id, user_id, permission_level)
    VALUES (v_invite.project_id, v_user_id, v_invite.permission_level)
    ON CONFLICT (project_id, user_id) DO NOTHING;

    UPDATE public.project_invites
    SET accepted_by = v_user_id, accepted_at = now()
    WHERE id = v_invite.id;

    RETURN v_invite.project_id;
  END IF;

  -- Fall back to the project-wide share token.
  SELECT id, owner_id INTO v_project_id, v_owner_id
  FROM public.projects
  WHERE share_token = _token AND share_token IS NOT NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN v_project_id;
  END IF;

  INSERT INTO public.collaborators (project_id, user_id, permission_level)
  VALUES (v_project_id, v_user_id, 'viewer')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN v_project_id;
END;
$$;
