-- Revoke column-level SELECT on share_token from authenticated users.
-- RLS policies are row-level only; column-level grants restrict which columns can be read.
REVOKE SELECT (share_token) ON public.projects FROM authenticated, anon;

-- Owners still need to read their own share_token. Provide a SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.get_project_share_token(_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT share_token
  FROM public.projects
  WHERE id = _project_id
    AND owner_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_project_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_share_token(uuid) TO authenticated;