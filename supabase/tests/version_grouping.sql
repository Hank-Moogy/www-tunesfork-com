\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := 'c0000000-0000-0000-0000-000000000001';
  contrib constant uuid := 'c0000000-0000-0000-0000-000000000002';
  proj constant uuid := 'c1000000-0000-0000-0000-000000000001';
  res jsonb; reservation uuid; save_id uuid; fork_id uuid;
  numbers int[];
BEGIN
  INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES (owner_id,'authenticated','authenticated','vg-owner@example.test','{}','{}',now(),now()),
         (contrib,'authenticated','authenticated','vg-contrib@example.test','{}','{}',now(),now());
  UPDATE public.account_entitlements SET storage_limit_bytes = NULL, max_projects = NULL
  WHERE user_id IN (owner_id, contrib);
  INSERT INTO public.projects (id,name,owner_id) VALUES (proj,'Grouping',owner_id);
  INSERT INTO public.collaborators (project_id,user_id,permission_level) VALUES (proj,contrib,'contributor');

  -- Five ordinary saves. This is an afternoon's work, not five versions.
  FOR i IN 1..5 LOOP
    res := public.reserve_project_upload(
      owner_id, proj,
      jsonb_build_array(jsonb_build_object('sha256', md5(i::text) || md5((i+100)::text), 'size_bytes', 10 + i))
    );
    reservation := (res->>'reservation_id')::uuid;
    res := public.finalize_manifest_project_version(
      reservation, owner_id, 'Grouping',
      jsonb_build_object('schema_version',1,'files',jsonb_build_array(
        jsonb_build_object('path','Grouping.als','sha256', md5(i::text) || md5((i+100)::text),'size',10 + i))),
      10 + i, 'save ' || i, 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('sha256', md5(i::text) || md5((i+100)::text),'size',10 + i)), 10 + i, 0
    );
    save_id := (res->>'version_id')::uuid;
    IF (res->>'version_number')::int <> 1 THEN
      RAISE EXCEPTION 'save % became version %, expected all five to stay at 1', i, res->>'version_number';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.project_versions WHERE project_id = proj AND status='approved') <> 5 THEN
    RAISE EXCEPTION 'the saves themselves must still all be kept';
  END IF;
  IF (SELECT count(DISTINCT version_number) FROM public.project_versions WHERE project_id = proj AND status='approved') <> 1 THEN
    RAISE EXCEPTION 'five saves should sit under one version number';
  END IF;

  -- Promotion is the deliberate act that makes V2.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  PERFORM public.promote_project_version(save_id);
  IF (SELECT version_number FROM public.project_versions WHERE id = save_id) <> 2 THEN
    RAISE EXCEPTION 'promotion should have produced version 2';
  END IF;

  -- And a save after a promotion joins the new current version, not a sixth one.
  res := public.reserve_project_upload(
    owner_id, proj, jsonb_build_array(jsonb_build_object('sha256', md5('after') || md5('after2'), 'size_bytes', 42))
  );
  res := public.finalize_manifest_project_version(
    (res->>'reservation_id')::uuid, owner_id, 'Grouping',
    jsonb_build_object('schema_version',1,'files',jsonb_build_array(
      jsonb_build_object('path','Grouping.als','sha256', md5('after') || md5('after2'),'size',42))),
    42, 'after promote', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', md5('after') || md5('after2'),'size',42)), 42, 0
  );
  IF (res->>'version_number')::int <> 2 THEN
    RAISE EXCEPTION 'a save after promotion should join version 2, got %', res->>'version_number';
  END IF;

  -- Approving a contributor's fork is the other deliberate act.
  res := public.reserve_project_upload(
    contrib, proj, jsonb_build_array(jsonb_build_object('sha256', md5('fork') || md5('fork2'), 'size_bytes', 7))
  );
  res := public.finalize_manifest_project_version(
    (res->>'reservation_id')::uuid, contrib, 'Grouping',
    jsonb_build_object('schema_version',1,'files',jsonb_build_array(
      jsonb_build_object('path','Grouping.als','sha256', md5('fork') || md5('fork2'),'size',7))),
    7, 'their change', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', md5('fork') || md5('fork2'),'size',7)), 7, 0
  );
  fork_id := (res->>'version_id')::uuid;
  IF res->>'version_number' IS NOT NULL THEN
    RAISE EXCEPTION 'a pending fork still carries no version number';
  END IF;

  res := public.review_project_contribution(fork_id, 'approve');
  IF (res->>'version_number')::int <> 3 THEN
    RAISE EXCEPTION 'approving a fork should produce version 3, got %', res->>'version_number';
  END IF;

  -- Seven saves, three versions: 1, 2, 3 — and no gaps.
  SELECT array_agg(DISTINCT version_number ORDER BY version_number) INTO numbers
  FROM public.project_versions WHERE project_id = proj AND status='approved';
  IF numbers <> ARRAY[1,2,3] THEN
    RAISE EXCEPTION 'version numbers should read 1,2,3 — got %', numbers;
  END IF;

  RAISE NOTICE 'version grouping acceptance tests passed';
END;
$test$;

ROLLBACK;
