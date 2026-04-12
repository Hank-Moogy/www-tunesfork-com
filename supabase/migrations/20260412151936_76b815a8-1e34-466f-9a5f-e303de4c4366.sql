-- Fix collaborators FK to cascade
ALTER TABLE public.collaborators DROP CONSTRAINT collaborators_project_id_fkey;
ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Fix project_versions FK to cascade
ALTER TABLE public.project_versions DROP CONSTRAINT IF EXISTS project_versions_project_id_fkey;
ALTER TABLE public.project_versions
  ADD CONSTRAINT project_versions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Fix comments FK to cascade
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_version_id_fkey;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES public.project_versions(id) ON DELETE CASCADE;