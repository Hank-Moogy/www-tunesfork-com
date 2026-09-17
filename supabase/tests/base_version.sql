\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := '80000000-0000-0000-0000-000000000001';
  contrib_a constant uuid := '80000000-0000-0000-0000-000000000002';
  contrib_b constant uuid := '80000000-0000-0000-0000-000000000003';
  proj constant uuid := '90000000-0000-0000-0000-000000000001';
  other_proj constant uuid := '90000000-0000-0000-0000-000000000002';
  v1 uuid; v2 uuid; fork_a uuid; fork_b uuid; foreign_v uuid;
  state jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (owner_id,'authenticated','authenticated','bv-owner@example.test','{}','{}',now(),now()),
         (contrib_a,'authenticated','authenticated','bv-a@example.test','{}','{}',now(),now()),
         (contrib_b,'authenticated','authenticated','bv-b@example.test','{}','{}',now(),now());
  INSERT INTO public.projects (id, name, owner_id) VALUES (proj,'Amalhea',owner_id),(other_proj,'Elsewhere',owner_id);
  INSERT INTO public.collaborators (project_id,user_id,permission_level)
  VALUES (proj,contrib_a,'contributor'),(proj,contrib_b,'contributor');

  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status)
  VALUES (proj,1,owner_id,'{"schema_version":1,"files":[]}'::jsonb,10,'approved') RETURNING id INTO v1;
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status)
  VALUES (other_proj,1,owner_id,'{"schema_version":1,"files":[]}'::jsonb,10,'approved') RETURNING id INTO foreign_v;

  -- Two collaborators both fork from v1, which is the tip at the time.
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status,base_version_id)
  VALUES (proj,NULL,contrib_a,'{"schema_version":1,"files":[]}'::jsonb,10,'pending',v1) RETURNING id INTO fork_a;
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status,base_version_id)
  VALUES (proj,NULL,contrib_b,'{"schema_version":1,"files":[]}'::jsonb,10,'pending',v1) RETURNING id INTO fork_b;

  state := public.contribution_base_state(fork_a);
  IF (state->>'stale')::boolean IS NOT FALSE OR (state->>'known')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'a fork built on the tip should not be stale: %', state;
  END IF;

  -- The owner approves A. B is now built on a version that is no longer current.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  PERFORM public.review_project_contribution(fork_a, 'approve');

  state := public.contribution_base_state(fork_b);
  IF (state->>'stale')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'fork B should be stale once A is approved: %', state;
  END IF;
  IF (state->>'base_version_number')::int <> 1 OR (state->>'current_version_number')::int <> 2 THEN
    RAISE EXCEPTION 'base state should name both versions: %', state;
  END IF;

  -- Warn and accept: staleness is reported, never enforced.
  PERFORM public.review_project_contribution(fork_b, 'approve');
  IF (SELECT status FROM public.project_versions WHERE id = fork_b) <> 'approved' THEN
    RAISE EXCEPTION 'a stale fork must still be approvable — the owner decides';
  END IF;

  -- A version predating this column is unknown, which is not the same as current.
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status)
  VALUES (proj,NULL,contrib_a,'{"schema_version":1,"files":[]}'::jsonb,10,'pending') RETURNING id INTO v2;
  state := public.contribution_base_state(v2);
  IF (state->>'known')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'an absent base must report known=false: %', state;
  END IF;
  IF state->>'stale' IS NOT NULL THEN
    RAISE EXCEPTION 'an absent base must not claim to be up to date: %', state;
  END IF;

  -- A base belonging to another project is not a base for this one.
  IF EXISTS (
    SELECT 1 FROM public.project_versions pv
    WHERE pv.project_id = proj AND pv.base_version_id = foreign_v
  ) THEN
    RAISE EXCEPTION 'a cross-project base leaked in';
  END IF;

  RAISE NOTICE 'base version acceptance tests passed';
END;
$test$;

ROLLBACK;
