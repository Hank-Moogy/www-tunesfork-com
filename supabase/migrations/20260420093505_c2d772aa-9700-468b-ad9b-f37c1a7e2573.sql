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

  IF existing_token IS NOT NULL AND length(existing_token) > 0 THEN
    RETURN existing_token;
  END IF;

  LOOP
    new_token := replace(gen_random_uuid()::text, '-', '');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.projects WHERE share_token = new_token
    );
  END LOOP;

  UPDATE public.projects
  SET share_token = new_token
  WHERE id = _project_id AND owner_id = auth.uid();

  RETURN new_token;
END;
$$;