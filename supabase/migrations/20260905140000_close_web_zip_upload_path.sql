-- Close the web ZIP upload path.
--
-- Removing the UI only hides the button: the publishable key ships in the client
-- bundle, so any authenticated session could still PUT a ZIP into its own folder
-- in project-zips and insert the project_versions row to match. Versions created
-- that way carry a zip_url with no manifest, so they skip the sample check and
-- the content-addressed blob accounting entirely.
--
-- Project payloads now arrive only through create-version-from-desktop, which
-- runs as the service role and is unaffected by these policies. Reads are left
-- alone so existing legacy ZIP versions stay downloadable.

DROP POLICY IF EXISTS "Auth users can upload project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder in project-zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own project zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own project zips" ON storage.objects;

DROP POLICY IF EXISTS "Owners and contributors can insert versions" ON public.project_versions;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_versions FROM anon, authenticated;
