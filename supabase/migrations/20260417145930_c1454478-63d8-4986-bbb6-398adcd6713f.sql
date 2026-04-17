DROP POLICY IF EXISTS "Users can download project zips they have access to" ON storage.objects;

CREATE POLICY "Users can download project zips they have access to"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'project-zips'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.project_versions pv
      JOIN public.projects p ON p.id = pv.project_id
      WHERE pv.zip_url = storage.objects.name
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