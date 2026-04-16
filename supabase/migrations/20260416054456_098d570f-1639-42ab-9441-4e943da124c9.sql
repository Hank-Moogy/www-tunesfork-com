
-- Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "Users can download their own project zips" ON storage.objects;

-- Create a broader policy: owner's own files OR files belonging to projects they collaborate on
CREATE POLICY "Users can download project zips they have access to"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-zips'
  AND (
    -- Own files
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Files uploaded by someone else but for a project the user owns or collaborates on
    EXISTS (
      SELECT 1 FROM public.project_versions pv
      JOIN public.projects p ON p.id = pv.project_id
      WHERE pv.zip_url LIKE '%' || storage.filename(name)
        AND (
          p.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.collaborators c
            WHERE c.project_id = p.id AND c.user_id = auth.uid()
          )
        )
    )
  )
);
