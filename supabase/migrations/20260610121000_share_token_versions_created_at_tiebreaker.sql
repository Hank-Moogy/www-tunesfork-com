-- version_number is no longer unique per project (saves are grouped under a
-- major version), so order ties by created_at to keep the newest save first.
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
  ORDER BY pv.version_number DESC, pv.created_at DESC;
$$;
