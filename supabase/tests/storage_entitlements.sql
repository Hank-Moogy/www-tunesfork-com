\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := '10000000-0000-0000-0000-000000000001';
  contributor_id constant uuid := '10000000-0000-0000-0000-000000000002';
  outsider_id constant uuid := '10000000-0000-0000-0000-000000000003';
  extra_id constant uuid := '10000000-0000-0000-0000-000000000004';
  project_id constant uuid := '20000000-0000-0000-0000-000000000001';
  outsider_project_id constant uuid := '20000000-0000-0000-0000-000000000002';
  initial_version_id constant uuid := '30000000-0000-0000-0000-000000000001';
  hash_a constant text := repeat('a', 64);
  hash_b constant text := repeat('b', 64);
  hash_c constant text := repeat('c', 64);
  hash_d constant text := repeat('d', 64);
  result jsonb;
  reservation_id uuid;
  created_version_id uuid;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (owner_id, 'authenticated', 'authenticated', 'owner@example.test', '{}', '{}', now(), now()),
    (contributor_id, 'authenticated', 'authenticated', 'contributor@example.test', '{}', '{}', now(), now()),
    (outsider_id, 'authenticated', 'authenticated', 'outsider@example.test', '{}', '{}', now(), now()),
    (extra_id, 'authenticated', 'authenticated', 'extra@example.test', '{}', '{}', now(), now());

  IF (SELECT plan FROM public.account_entitlements WHERE user_id = owner_id) <> 'free' THEN
    RAISE EXCEPTION 'new account did not receive the free entitlement';
  END IF;

  UPDATE public.account_entitlements
  SET storage_limit_bytes = 100, max_projects = 5, max_collaborators_per_project = 3
  WHERE user_id = owner_id;

  INSERT INTO public.projects (id, name, owner_id)
  VALUES (project_id, 'Owner project', owner_id),
         (outsider_project_id, 'Outsider project', outsider_id);
  INSERT INTO public.collaborators (project_id, user_id, permission_level)
  VALUES (project_id, contributor_id, 'contributor');

  result := public.reserve_project_upload(
    owner_id,
    project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 40))
  );
  reservation_id := (result->>'reservation_id')::uuid;

  BEGIN
    PERFORM public.finalize_manifest_project_version(
      reservation_id,
      owner_id,
      'Owner project',
      jsonb_build_object(
        'schema_version', 1,
        'files', jsonb_build_array(jsonb_build_object(
          'path', 'Owner project.als', 'sha256', hash_a, 'size', 40
        ))
      ),
      40,
      'Unreserved attestation test',
      120,
      '[]'::jsonb,
      '[]'::jsonb,
      '12.1',
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('sha256', hash_d, 'size', 40)),
      40,
      0
    );
    RAISE EXCEPTION 'expected UPLOAD_CONFLICT for an unreserved ready blob';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UPLOAD_CONFLICT%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.finalize_manifest_project_version(
      reservation_id,
      owner_id,
      'Owner project',
      jsonb_build_object(
        'schema_version', 1,
        'files', jsonb_build_array(jsonb_build_object(
          'path', 'Owner project.als', 'sha256', hash_a, 'size', 40
        ))
      ),
      41,
      'Logical size mismatch test',
      120,
      '[]'::jsonb,
      '[]'::jsonb,
      '12.1',
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size', 40)),
      40,
      0
    );
    RAISE EXCEPTION 'expected MANIFEST_INVALID for a logical size mismatch';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%MANIFEST_INVALID%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.finalize_manifest_project_version(
      reservation_id,
      owner_id,
      'Owner project',
      jsonb_build_object(
        'schema_version', 1,
        'files', jsonb_build_array(jsonb_build_object(
          'path', 'Owner project.als', 'sha256', hash_a, 'size', 40
        ))
      ),
      40,
      'Byte accounting mismatch test',
      120,
      '[]'::jsonb,
      '[]'::jsonb,
      '12.1',
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size', 40)),
      0,
      40
    );
    RAISE EXCEPTION 'expected UPLOAD_CONFLICT for false byte accounting';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UPLOAD_CONFLICT%' THEN RAISE; END IF;
  END;

  IF jsonb_array_length(result->'missing') <> 1
     OR (result#>>'{usage,reserved_bytes}')::bigint <> 40 THEN
    RAISE EXCEPTION 'first upload reservation did not reserve one 40-byte blob: %', result;
  END IF;

  BEGIN
    PERFORM public.reserve_project_upload(
      contributor_id,
      project_id,
      jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 40))
    );
    RAISE EXCEPTION 'expected UPLOAD_CONFLICT';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UPLOAD_CONFLICT%' THEN RAISE; END IF;
  END;

  PERFORM public.cancel_upload_reservation(reservation_id, owner_id);
  UPDATE public.project_blobs
  SET status = 'ready', verified_at = now()
  WHERE user_id = owner_id AND sha256 = hash_a;
  INSERT INTO public.project_versions (
    id, project_id, version_number, uploader_id, manifest, file_size_bytes
  ) VALUES (
    initial_version_id, project_id, 1, owner_id,
    jsonb_build_object('schema_version', 1, 'files', jsonb_build_array()), 40
  );
  INSERT INTO public.project_version_blobs (version_id, user_id, sha256)
  VALUES (initial_version_id, owner_id, hash_a);

  result := public.reserve_project_upload(
    owner_id,
    project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 40))
  );
  IF jsonb_array_length(result->'missing') <> 0
     OR (result->>'reused_bytes')::bigint <> 40
     OR (result#>>'{usage,reserved_bytes}')::bigint <> 0 THEN
    RAISE EXCEPTION 'owner-scoped blob reuse failed: %', result;
  END IF;
  reservation_id := (result->>'reservation_id')::uuid;
  result := public.finalize_manifest_project_version(
    reservation_id,
    owner_id,
    'Owner project',
    jsonb_build_object(
      'schema_version', 1,
      'files', jsonb_build_array(jsonb_build_object(
        'path', 'Owner project.als', 'sha256', hash_a, 'size', 40
      ))
    ),
    40,
    'Reuse test',
    120,
    '[]'::jsonb,
    '[]'::jsonb,
    '12.1',
    '{}'::jsonb,
    '[]'::jsonb,
    0,
    40
  );
  IF (result->>'version_number')::integer <> 2 THEN
    RAISE EXCEPTION 'version numbering did not advance from 1 to 2: %', result;
  END IF;
  created_version_id := (result->>'version_id')::uuid;

  BEGIN
    PERFORM public.reserve_project_upload(
      owner_id,
      project_id,
      jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 41))
    );
    RAISE EXCEPTION 'expected BLOB_SIZE_MISMATCH';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%BLOB_SIZE_MISMATCH%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.reserve_project_upload(
      outsider_id,
      project_id,
      jsonb_build_array(jsonb_build_object('sha256', hash_d, 'size_bytes', 1))
    );
    RAISE EXCEPTION 'expected PROJECT_UPLOAD_FORBIDDEN';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PROJECT_UPLOAD_FORBIDDEN%' THEN RAISE; END IF;
  END;

  result := public.reserve_project_upload(
    contributor_id,
    project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_b, 'size_bytes', 25))
  );
  IF (result->>'storage_owner_id')::uuid <> owner_id THEN
    RAISE EXCEPTION 'collaborator upload was not billed to project owner: %', result;
  END IF;

  result := public.reserve_project_upload(
    owner_id,
    project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_c, 'size_bytes', 35))
  );
  IF (result#>>'{usage,projected_bytes}')::bigint <> 100
     OR result#>>'{usage,warning_level}' <> 'limit' THEN
    RAISE EXCEPTION 'exact-limit reservation failed: %', result;
  END IF;

  BEGIN
    PERFORM public.reserve_project_upload(
      owner_id,
      project_id,
      jsonb_build_array(jsonb_build_object('sha256', hash_d, 'size_bytes', 1))
    );
    RAISE EXCEPTION 'expected QUOTA_EXCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%QUOTA_EXCEEDED%' THEN RAISE; END IF;
  END;

  result := public.reserve_project_upload(
    outsider_id,
    outsider_project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 40))
  );
  IF jsonb_array_length(result->'missing') <> 1 THEN
    RAISE EXCEPTION 'blob deduplication crossed account boundary: %', result;
  END IF;

  UPDATE public.account_entitlements SET max_projects = 1 WHERE user_id = owner_id;
  BEGIN
    INSERT INTO public.projects (name, owner_id) VALUES ('Over project limit', owner_id);
    RAISE EXCEPTION 'expected PROJECT_LIMIT_REACHED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PROJECT_LIMIT_REACHED%' THEN RAISE; END IF;
  END;

  UPDATE public.account_entitlements SET max_collaborators_per_project = 1 WHERE user_id = owner_id;
  BEGIN
    INSERT INTO public.collaborators (project_id, user_id, permission_level)
    VALUES (project_id, extra_id, 'viewer');
    RAISE EXCEPTION 'expected COLLABORATOR_LIMIT_REACHED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%COLLABORATOR_LIMIT_REACHED%' THEN RAISE; END IF;
  END;

  IF has_function_privilege('anon', 'public.reserve_project_upload(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_project_upload(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_account_plan(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privileged RPC execution grants are too broad';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_account_storage_usage(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.delete_project_version(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated self-service RPC grants are missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.set_version_audio_preview(uuid,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.project_versions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.project_versions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.project_versions', 'DELETE') THEN
    RAISE EXCEPTION 'legacy project-version storage write privileges remain enabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE (
      (schemaname = 'public' AND tablename = 'project_versions')
      OR (schemaname = 'storage' AND tablename = 'objects')
    )
      AND cmd IN ('ALL', 'INSERT')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'a direct client storage/version insertion policy remains enabled';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM public.delete_project_version(created_version_id);
  IF EXISTS (SELECT 1 FROM public.project_versions WHERE id = created_version_id) THEN
    RAISE EXCEPTION 'selected project version was not deleted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_version_blobs
    WHERE version_id = initial_version_id AND user_id = owner_id AND sha256 = hash_a
  ) OR EXISTS (
    SELECT 1 FROM public.storage_deletion_candidates
    WHERE bucket = 'project-blobs' AND object_path = owner_id::text || '/' || hash_a
  ) THEN
    RAISE EXCEPTION 'deleting one version released a blob still referenced by another version';
  END IF;

  BEGIN
    PERFORM public.delete_project_version(initial_version_id);
    RAISE EXCEPTION 'expected LAST_VERSION_REQUIRES_PROJECT_DELETE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LAST_VERSION_REQUIRES_PROJECT_DELETE%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'storage entitlement acceptance tests passed';
END;
$test$;

ROLLBACK;
