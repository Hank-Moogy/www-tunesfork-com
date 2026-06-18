CREATE OR REPLACE FUNCTION public.set_version_audio_preview(
  _version_id uuid,
  _audio_preview_url text
)
RETURNS public.project_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_version public.project_versions;
  updated_version public.project_versions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(BTRIM(_audio_preview_url), '') IS NULL THEN
    RAISE EXCEPTION 'Audio preview URL is required';
  END IF;

  SELECT *
  INTO target_version
  FROM public.project_versions
  WHERE id = _version_id;

  IF target_version.id IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  IF NOT (
    public.is_project_owner(target_version.project_id)
    OR public.is_contributor(target_version.project_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed to update this version';
  END IF;

  UPDATE public.project_versions
  SET audio_preview_url = BTRIM(_audio_preview_url)
  WHERE id = _version_id
  RETURNING * INTO updated_version;

  UPDATE public.projects
  SET updated_at = now()
  WHERE id = updated_version.project_id;

  RETURN updated_version;
END;
$$;

REVOKE ALL ON FUNCTION public.set_version_audio_preview(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_version_audio_preview(uuid, text) TO authenticated;
