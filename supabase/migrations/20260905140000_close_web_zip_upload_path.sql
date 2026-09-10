-- Close the direct browser ZIP upload path while preserving legacy downloads.
-- Project payloads now arrive through quota-aware Edge Functions and service-role RPCs.

DROP POLICY IF EXISTS "Auth users can upload project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder in project-zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own project zips" ON storage.objects;

DROP POLICY IF EXISTS "Owners and contributors can insert versions" ON public.project_versions;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_versions FROM anon, authenticated;
