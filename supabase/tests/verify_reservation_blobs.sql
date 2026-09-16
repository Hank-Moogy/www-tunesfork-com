\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := '60000000-0000-0000-0000-000000000001';
  other_id constant uuid := '60000000-0000-0000-0000-000000000002';
  reservation_id constant uuid := '70000000-0000-0000-0000-000000000001';
  hash_present constant text := repeat('a', 64);
  hash_absent constant text := repeat('b', 64);
  hash_badmeta constant text := repeat('c', 64);
  result jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (owner_id, 'authenticated', 'authenticated', 'verify-owner@example.test', '{}', '{}', now(), now()),
    (other_id, 'authenticated', 'authenticated', 'verify-other@example.test', '{}', '{}', now(), now());

  INSERT INTO public.upload_reservations (id, storage_owner_id, uploader_id, project_id, reserved_bytes)
  VALUES (reservation_id, owner_id, owner_id, NULL, 60);
  INSERT INTO public.upload_reservation_blobs (reservation_id, sha256, size_bytes, object_path)
  VALUES
    (reservation_id, hash_present, 10, owner_id::text || '/' || hash_present),
    (reservation_id, hash_absent, 20, owner_id::text || '/' || hash_absent),
    (reservation_id, hash_badmeta, 30, owner_id::text || '/' || hash_badmeta);

  -- Only two of the three blobs actually reached storage, and one of those
  -- carries unusable metadata.
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES
    ('project-blobs', owner_id::text || '/' || hash_present, jsonb_build_object('size', 10)),
    ('project-blobs', owner_id::text || '/' || hash_badmeta, jsonb_build_object('size', 'unknown'));

  -- A blob of the same name in a different bucket must not count as uploaded.
  INSERT INTO storage.buckets (id, name) VALUES ('other-bucket', 'other-bucket')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('other-bucket', owner_id::text || '/' || hash_absent, jsonb_build_object('size', 20));

  result := public.verify_reservation_blobs(reservation_id, owner_id);

  IF jsonb_array_length(result) <> 1 THEN
    RAISE EXCEPTION 'expected exactly the one verifiable blob, got: %', result;
  END IF;
  IF result#>>'{0,sha256}' <> hash_present OR (result#>>'{0,size}')::bigint <> 10 THEN
    RAISE EXCEPTION 'wrong blob or size returned: %', result;
  END IF;

  -- A reservation may only be verified by the device that created it.
  IF public.verify_reservation_blobs(reservation_id, other_id) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'another uploader could verify this reservation';
  END IF;

  -- An unknown reservation returns nothing rather than erroring.
  IF public.verify_reservation_blobs(gen_random_uuid(), owner_id) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'unknown reservation did not return an empty set';
  END IF;

  -- Not reachable by the roles a browser can reach.
  IF has_function_privilege('authenticated', 'public.verify_reservation_blobs(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.verify_reservation_blobs(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verify_reservation_blobs is callable from the browser';
  END IF;

  RAISE NOTICE 'verify_reservation_blobs acceptance tests passed';
END;
$test$;

ROLLBACK;
