\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := 'b0000000-0000-0000-0000-000000000001';
  collab_id constant uuid := 'b0000000-0000-0000-0000-000000000002';
  outsider constant uuid := 'b0000000-0000-0000-0000-000000000003';
  proj constant uuid := 'b1000000-0000-0000-0000-000000000001';
  collab_proj constant uuid := 'b1000000-0000-0000-0000-000000000002';
  v_owner uuid; v_collab uuid;
  have_count int; missing_count int; row_count int;
BEGIN
  INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES (owner_id,'authenticated','authenticated','pi-owner@example.test','{}','{}',now(),now()),
         (collab_id,'authenticated','authenticated','pi-collab@example.test','{}','{}',now(),now()),
         (outsider,'authenticated','authenticated','pi-out@example.test','{}','{}',now(),now());
  INSERT INTO public.projects (id,name,owner_id) VALUES (proj,'Shared',owner_id),(collab_proj,'Theirs',collab_id);
  INSERT INTO public.collaborators (project_id,user_id,permission_level) VALUES (proj,collab_id,'contributor');

  -- Channel-config variants of one plugin must not inflate the inventory.
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status,plugin_list)
  VALUES (proj,1,owner_id,'{"schema_version":1,"files":[]}'::jsonb,1,'approved',
          '["Serum x64","Doubler2 Mono/Stereo","Doubler2 Stereo","Kontakt","FabFilter Saturn 2"]'::jsonb)
  RETURNING id INTO v_owner;

  SELECT count(*) INTO row_count FROM public.user_plugins WHERE user_id = owner_id;
  IF row_count <> 4 THEN
    RAISE EXCEPTION 'five names covering four plugins should yield four rows, got %', row_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_plugins WHERE user_id=owner_id AND normalized_name='doubler2') THEN
    RAISE EXCEPTION 'channel variants did not fold into one plugin';
  END IF;
  -- Saturn 2 is a different product from Saturn; digits are identity, not version noise.
  IF NOT EXISTS (SELECT 1 FROM public.user_plugins WHERE user_id=owner_id AND normalized_name='fabfiltersaturn2') THEN
    RAISE EXCEPTION 'a trailing model number was stripped as though it were a version';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_plugins WHERE user_id=owner_id AND normalized_name='serum') THEN
    RAISE EXCEPTION 'an x64 marker was not removed';
  END IF;

  -- The collaborator owns only some of them, proven by their own upload.
  INSERT INTO public.project_versions (project_id,version_number,uploader_id,manifest,file_size_bytes,status,plugin_list)
  VALUES (collab_proj,1,collab_id,'{"schema_version":1,"files":[]}'::jsonb,1,'approved','["Kontakt","Serum"]'::jsonb)
  RETURNING id INTO v_collab;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', collab_id)::text, true);
  SELECT count(*) FILTER (WHERE have), count(*) FILTER (WHERE NOT have)
  INTO have_count, missing_count
  FROM public.project_version_plugins(v_owner);
  IF have_count <> 2 OR missing_count <> 2 THEN
    RAISE EXCEPTION 'collaborator should have 2 of 4 plugins, got have=% missing=%', have_count, missing_count;
  END IF;

  -- The owner has everything in their own project, by construction.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  SELECT count(*) FILTER (WHERE NOT have) INTO missing_count FROM public.project_version_plugins(v_owner);
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'the uploader cannot be missing plugins from their own upload: %', missing_count;
  END IF;

  -- Someone with no access to the project learns nothing about it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
  IF (SELECT count(*) FROM public.project_version_plugins(v_owner)) <> 0 THEN
    RAISE EXCEPTION 'plugin list leaked to a non-collaborator';
  END IF;

  -- An inventory is private even between collaborators.
  IF has_table_privilege('anon','public.user_plugins','SELECT') THEN
    RAISE EXCEPTION 'anon can read plugin inventories';
  END IF;

  RAISE NOTICE 'plugin inventory acceptance tests passed';
END;
$test$;

ROLLBACK;
