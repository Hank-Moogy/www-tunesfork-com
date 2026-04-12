-- Increase audio-previews bucket file size limit to 500MB
UPDATE storage.buckets 
SET file_size_limit = 524288000
WHERE id = 'audio-previews';