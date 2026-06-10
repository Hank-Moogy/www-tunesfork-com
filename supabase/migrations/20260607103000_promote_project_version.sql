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
  SELECT *
  INTO target_version
  FROM public.project_versions
  WHERE id = _version_id;

  IF target_version.id IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = target_version.project_id
      AND (
        p.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.collaborators c
          WHERE c.project_id = p.id
            AND c.user_id = auth.uid()
            AND c.permission_level = 'contributor'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not allowed to promote this version';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version_number
  FROM public.project_versions
  WHERE project_id = target_version.project_id;

  UPDATE public.project_versions
  SET version_number = next_version_number
  WHERE id = _version_id
  RETURNING * INTO promoted_version;

  UPDATE public.projects
  SET updated_at = now()
  WHERE id = promoted_version.project_id;

  RETURN promoted_version;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_project_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_project_version(uuid) TO authenticated;
