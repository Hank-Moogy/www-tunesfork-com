-- Allow desktop sync and web uploads to store full Ableton project zips.
UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'project-zips';
