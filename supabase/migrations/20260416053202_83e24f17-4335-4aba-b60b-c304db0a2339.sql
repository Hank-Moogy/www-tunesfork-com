
-- project-zips: scope SELECT to user's own folder
DROP POLICY IF EXISTS "Auth users can download project zips" ON storage.objects;
CREATE POLICY "Users can download their own project zips"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-zips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- project-zips: scope INSERT to user's own folder
DROP POLICY IF EXISTS "Auth users can upload project zips" ON storage.objects;
CREATE POLICY "Users can upload to their own folder in project-zips"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-zips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- project-zips: UPDATE scoped to own folder
CREATE POLICY "Users can update their own project zips"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-zips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- project-zips: DELETE scoped to own folder
CREATE POLICY "Users can delete their own project zips"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-zips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- audio-previews: UPDATE scoped to own folder
CREATE POLICY "Users can update their own audio previews"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'audio-previews' AND (storage.foldername(name))[1] = auth.uid()::text);

-- audio-previews: DELETE scoped to own folder
CREATE POLICY "Users can delete their own audio previews"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio-previews' AND (storage.foldername(name))[1] = auth.uid()::text);
