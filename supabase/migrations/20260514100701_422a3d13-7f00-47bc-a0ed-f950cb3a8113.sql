-- Add major version + main flag to project_versions
ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS major_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_main_version boolean NOT NULL DEFAULT false;

-- Backfill: collapse every existing version into V1; mark latest save per project as Main
UPDATE public.project_versions SET major_version = 1 WHERE major_version IS NULL OR major_version <> 1;

WITH latest AS (
  SELECT DISTINCT ON (project_id) id
  FROM public.project_versions
  ORDER BY project_id, version_number DESC
)
UPDATE public.project_versions pv
SET is_main_version = true
FROM latest
WHERE pv.id = latest.id;

-- Only one main per project (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS project_versions_one_main_per_project
  ON public.project_versions (project_id)
  WHERE is_main_version;

-- RPC: promote a save to a new major version (V{max+1})
CREATE OR REPLACE FUNCTION public.promote_version_to_major(_version_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_new_major int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT project_id INTO v_project FROM public.project_versions WHERE id = _version_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;

  IF NOT (is_project_owner(v_project) OR is_contributor(v_project)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(MAX(major_version), 0) + 1 INTO v_new_major
  FROM public.project_versions WHERE project_id = v_project;

  UPDATE public.project_versions
  SET major_version = v_new_major
  WHERE id = _version_id;

  RETURN v_new_major;
END;
$$;

-- RPC: set a save as the Main version for the project
CREATE OR REPLACE FUNCTION public.set_main_version(_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT project_id INTO v_project FROM public.project_versions WHERE id = _version_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;

  IF NOT (is_project_owner(v_project) OR is_contributor(v_project)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.project_versions
  SET is_main_version = false
  WHERE project_id = v_project AND is_main_version = true;

  UPDATE public.project_versions
  SET is_main_version = true
  WHERE id = _version_id;
END;
$$;