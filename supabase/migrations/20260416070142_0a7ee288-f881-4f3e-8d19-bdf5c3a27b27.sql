
-- Drop the permissive INSERT policy
DROP POLICY IF EXISTS "Auth users can upload audio previews" ON storage.objects;

-- Recreate with folder ownership check
CREATE POLICY "Auth users can upload audio previews"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'audio-previews'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
