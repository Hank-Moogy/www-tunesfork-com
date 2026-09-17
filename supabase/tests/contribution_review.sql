\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  owner_id constant uuid := '40000000-0000-0000-0000-000000000001';
  contributor_id constant uuid := '40000000-0000-0000-0000-000000000002';
  outsider_id constant uuid := '40000000-0000-0000-0000-000000000003';
  test_project_id constant uuid := '50000000-0000-0000-0000-000000000001';
  hash_a constant text := repeat('1', 64);
  hash_b constant text := repeat('2', 64);
  hash_c constant text := repeat('3', 64);
  result jsonb;
  reservation_id uuid;
  first_fork_id uuid;
  second_fork_id uuid;
  owner_version_id uuid;
  approved_number integer;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (owner_id, 'authenticated', 'authenticated', 'review-owner@example.test', '{}', '{}', now(), now()),
    (contributor_id, 'authenticated', 'authenticated', 'review-contributor@example.test', '{}', '{}', now(), now()),
    (outsider_id, 'authenticated', 'authenticated', 'review-outsider@example.test', '{}', '{}', now(), now());

  UPDATE public.account_entitlements
  SET storage_limit_bytes = NULL, max_projects = NULL
  WHERE user_id IN (owner_id, contributor_id, outsider_id);

  INSERT INTO public.projects (id, name, owner_id)
  VALUES (test_project_id, 'Amalhea', owner_id);
  INSERT INTO public.collaborators (project_id, user_id, permission_level)
  VALUES (test_project_id, contributor_id, 'contributor');

  -- ---------------------------------------------------------------- owner
  -- An owner's own save is a version immediately: nothing to review.
  result := public.reserve_project_upload(
    owner_id, test_project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size_bytes', 10))
  );
  reservation_id := (result->>'reservation_id')::uuid;
  result := public.finalize_manifest_project_version(
    reservation_id, owner_id, 'Amalhea',
    jsonb_build_object('schema_version', 1, 'files', jsonb_build_array(
      jsonb_build_object('path', 'Amalhea.als', 'sha256', hash_a, 'size', 10))),
    10, 'Owner save', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', hash_a, 'size', 10)), 10, 0
  );
  IF result->>'status' <> 'approved' OR (result->>'version_number')::integer <> 1 THEN
    RAISE EXCEPTION 'owner save should be approved v1: %', result;
  END IF;
  owner_version_id := (result->>'version_id')::uuid;

  -- ---------------------------------------------------------- contributor
  -- A contributor's save is a fork request: pending, and deliberately without a
  -- version number, so it cannot advance the owner's history.
  result := public.reserve_project_upload(
    contributor_id, test_project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_b, 'size_bytes', 20))
  );
  reservation_id := (result->>'reservation_id')::uuid;
  result := public.finalize_manifest_project_version(
    reservation_id, contributor_id, 'Amalhea',
    jsonb_build_object('schema_version', 1, 'files', jsonb_build_array(
      jsonb_build_object('path', 'Amalhea.als', 'sha256', hash_b, 'size', 20))),
    20, 'Contributor save', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', hash_b, 'size', 20)), 20, 0
  );
  IF result->>'status' <> 'pending' OR result->>'version_number' IS NOT NULL THEN
    RAISE EXCEPTION 'contributor save should be pending with no version number: %', result;
  END IF;
  first_fork_id := (result->>'version_id')::uuid;

  -- A pending fork request must not move the project's updated_at, or it would
  -- reorder the owner's dashboard as though work had landed.
  IF (SELECT updated_at FROM public.projects WHERE id = test_project_id)
     > (SELECT created_at FROM public.project_versions WHERE id = first_fork_id) THEN
    RAISE EXCEPTION 'pending fork request touched the project timestamp';
  END IF;

  -- Saving again before review replaces their own outstanding request.
  result := public.reserve_project_upload(
    contributor_id, test_project_id,
    jsonb_build_array(jsonb_build_object('sha256', hash_c, 'size_bytes', 30))
  );
  reservation_id := (result->>'reservation_id')::uuid;
  result := public.finalize_manifest_project_version(
    reservation_id, contributor_id, 'Amalhea',
    jsonb_build_object('schema_version', 1, 'files', jsonb_build_array(
      jsonb_build_object('path', 'Amalhea.als', 'sha256', hash_c, 'size', 30))),
    30, 'Contributor second save', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', hash_c, 'size', 30)), 30, 0
  );
  IF (result->>'superseded_count')::integer <> 1 THEN
    RAISE EXCEPTION 'second fork request did not supersede the first: %', result;
  END IF;
  second_fork_id := (result->>'version_id')::uuid;
  IF (SELECT status FROM public.project_versions WHERE id = first_fork_id) <> 'superseded' THEN
    RAISE EXCEPTION 'first fork request was not superseded';
  END IF;

  -- Neither pending row may consume a number from the approved sequence.
  IF (SELECT count(*) FROM public.project_versions pv
      WHERE pv.project_id = test_project_id AND pv.version_number IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'pending contributions consumed version numbers';
  END IF;

  -- An unapproved contribution is not something you can restore to.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  BEGIN
    PERFORM public.promote_project_version(second_fork_id);
    RAISE EXCEPTION 'expected CONTRIBUTION_NOT_APPROVED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CONTRIBUTION_NOT_APPROVED%' THEN RAISE; END IF;
  END;

  -- --------------------------------------------------------------- review
  -- Only the owner decides what enters their project's history.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', contributor_id)::text, true);
  BEGIN
    PERFORM public.review_project_contribution(second_fork_id, 'approve');
    RAISE EXCEPTION 'expected NOT_PROJECT_OWNER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_PROJECT_OWNER%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider_id)::text, true);
  BEGIN
    PERFORM public.review_project_contribution(second_fork_id, 'approve');
    RAISE EXCEPTION 'expected NOT_PROJECT_OWNER for an outsider';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_PROJECT_OWNER%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  BEGIN
    PERFORM public.review_project_contribution(second_fork_id, 'maybe');
    RAISE EXCEPTION 'expected INVALID_DECISION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_DECISION%' THEN RAISE; END IF;
  END;

  -- A superseded request is no longer reviewable.
  BEGIN
    PERFORM public.review_project_contribution(first_fork_id, 'approve');
    RAISE EXCEPTION 'expected CONTRIBUTION_ALREADY_REVIEWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CONTRIBUTION_ALREADY_REVIEWED%' THEN RAISE; END IF;
  END;

  result := public.review_project_contribution(second_fork_id, 'approve', 'Love the drop');
  approved_number := (result->>'version_number')::integer;
  IF result->>'status' <> 'approved' OR approved_number <> 2 THEN
    RAISE EXCEPTION 'approval did not assign the next version number: %', result;
  END IF;
  IF (SELECT uploader_id FROM public.project_versions WHERE id = second_fork_id) <> contributor_id THEN
    RAISE EXCEPTION 'approval rewrote the contribution author';
  END IF;
  IF (SELECT reviewed_by FROM public.project_versions WHERE id = second_fork_id) <> owner_id THEN
    RAISE EXCEPTION 'approval did not record the reviewer';
  END IF;

  -- Reviewing twice is refused rather than renumbering the version.
  BEGIN
    PERFORM public.review_project_contribution(second_fork_id, 'reject');
    RAISE EXCEPTION 'expected CONTRIBUTION_ALREADY_REVIEWED on re-review';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CONTRIBUTION_ALREADY_REVIEWED%' THEN RAISE; END IF;
  END;

  -- ------------------------------------------------------------- rejection
  result := public.reserve_project_upload(
    contributor_id, test_project_id,
    jsonb_build_array(jsonb_build_object('sha256', repeat('4', 64), 'size_bytes', 40))
  );
  reservation_id := (result->>'reservation_id')::uuid;
  result := public.finalize_manifest_project_version(
    reservation_id, contributor_id, 'Amalhea',
    jsonb_build_object('schema_version', 1, 'files', jsonb_build_array(
      jsonb_build_object('path', 'Amalhea.als', 'sha256', repeat('4', 64), 'size', 40))),
    40, 'Third save', 120, '[]'::jsonb, '[]'::jsonb, '12.1', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('sha256', repeat('4', 64), 'size', 40)), 40, 0
  );
  result := public.review_project_contribution((result->>'version_id')::uuid, 'reject', 'Not this one');
  IF result->>'status' <> 'rejected' OR result->>'version_number' IS NOT NULL THEN
    RAISE EXCEPTION 'rejection should not assign a version number: %', result;
  END IF;

  -- The approved main line stays contiguous: 1 then 2, nothing skipped.
  IF (SELECT array_agg(pv.version_number ORDER BY pv.version_number)
      FROM public.project_versions pv
      WHERE pv.project_id = test_project_id AND pv.status = 'approved') <> ARRAY[1, 2] THEN
    RAISE EXCEPTION 'approved version numbering is not contiguous';
  END IF;

  -- A share link never exposes anything unapproved.
  UPDATE public.projects SET share_token = 'review-test-token' WHERE id = test_project_id;
  IF EXISTS (
    SELECT 1 FROM public.get_versions_by_share_token('review-test-token')
    WHERE version_number IS NULL
  ) THEN
    RAISE EXCEPTION 'share token exposed an unapproved contribution';
  END IF;
  IF (SELECT count(*) FROM public.get_versions_by_share_token('review-test-token')) <> 2 THEN
    RAISE EXCEPTION 'share token did not return both approved versions';
  END IF;

  PERFORM owner_version_id;
  RAISE NOTICE 'contribution review acceptance tests passed';
END;
$test$;

ROLLBACK;
