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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, owner_id INTO v_project_id, v_owner_id
  FROM public.projects
  WHERE share_token = _token AND share_token IS NOT NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  -- Owner doesn't need to be added as collaborator
  IF v_owner_id = v_user_id THEN
    RETURN v_project_id;
  END IF;

  INSERT INTO public.collaborators (project_id, user_id, permission_level)
  VALUES (v_project_id, v_user_id, 'viewer')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_share_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_share_invite(text) TO authenticated;

-- Ensure the unique constraint exists for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collaborators_project_user_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.collaborators
        ADD CONSTRAINT collaborators_project_user_unique UNIQUE (project_id, user_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;