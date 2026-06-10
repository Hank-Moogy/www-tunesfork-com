-- promote_project_version requires auth.uid(); anon executions can only leak
-- whether a version id exists. Remove the default anon grant entirely.
REVOKE EXECUTE ON FUNCTION public.promote_project_version(uuid) FROM anon;
