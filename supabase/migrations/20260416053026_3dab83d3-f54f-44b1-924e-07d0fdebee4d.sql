
-- 1. Change default so new projects don't auto-get a share token
ALTER TABLE public.projects ALTER COLUMN share_token SET DEFAULT NULL;

-- 2. Clear all existing share tokens (users must explicitly re-share)
UPDATE public.projects SET share_token = NULL;

-- 3. Drop the flawed anon SELECT policies
DROP POLICY IF EXISTS "Anyone can view project by share_token" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view versions of shared projects" ON public.project_versions;

-- 4. Create secure RPC to fetch a project by its token
CREATE OR REPLACE FUNCTION public.get_project_by_share_token(_token text)
RETURNS SETOF public.projects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.projects
  WHERE share_token = _token
  LIMIT 1;
$$;

-- 5. Create secure RPC to fetch versions for a shared project
CREATE OR REPLACE FUNCTION public.get_versions_by_share_token(_token text)
RETURNS SETOF public.project_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pv.* FROM public.project_versions pv
  JOIN public.projects p ON p.id = pv.project_id
  WHERE p.share_token = _token
  ORDER BY pv.version_number DESC;
$$;
