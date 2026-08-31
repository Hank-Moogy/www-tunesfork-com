-- Sample readiness is advisory UX, not an authorization boundary. Owners may
-- share incomplete projects after acknowledging the warning, and recipients
-- may access the exact version that was shared.

DROP TRIGGER IF EXISTS prevent_incomplete_project_collaboration ON public.collaborators;
DROP FUNCTION IF EXISTS public.prevent_incomplete_project_collaboration();

DROP POLICY IF EXISTS "Users can view versions of accessible projects" ON public.project_versions;
CREATE POLICY "Users can view versions of accessible projects"
ON public.project_versions
FOR SELECT TO authenticated
USING (
  public.is_project_owner(project_id) OR public.is_collaborator(project_id)
);

-- The prior migration wired this helper into token/invite RPCs. Preserve the
-- RPC signatures while removing sample readiness as a server-side share gate.
CREATE OR REPLACE FUNCTION public.project_latest_version_is_share_ready(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id);
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
