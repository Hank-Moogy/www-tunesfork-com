-- Add a share token column to projects for public sharing
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_projects_share_token ON public.projects(share_token);

-- Allow public (anon) read access to projects via share_token
CREATE POLICY "Anyone can view project by share_token"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (share_token IS NOT NULL);

-- Allow public read of versions for shared projects
CREATE POLICY "Anyone can view versions of shared projects"
ON public.project_versions
FOR SELECT
TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.share_token IS NOT NULL
));