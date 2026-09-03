-- All launch storage writes pass through quota-aware Edge functions and
-- service-role RPCs. Retire the pre-reservation preview setter and remove
-- direct project-version mutation privileges as defense in depth.

REVOKE ALL ON FUNCTION public.set_version_audio_preview(uuid, text)
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_versions
FROM anon, authenticated;
