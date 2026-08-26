-- Keep legacy versions readable and promotable while enforcing sample
-- completeness on every newly-created version, regardless of which client or
-- upload path creates it. An insert trigger is intentional: a NOT VALID check
-- constraint would still reject updates to legacy rows with a null check.
CREATE OR REPLACE FUNCTION public.require_complete_samples_for_project_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sample_check IS NULL
    OR jsonb_typeof(NEW.sample_check) <> 'object'
    OR jsonb_typeof(NEW.sample_check -> 'included') <> 'number'
    OR jsonb_typeof(NEW.sample_check -> 'missing') <> 'number'
    OR jsonb_typeof(NEW.sample_check -> 'external') <> 'number'
  THEN
    RAISE EXCEPTION 'A valid sample completeness check is required for every upload'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.sample_check ->> 'included')::numeric < 0
    OR (NEW.sample_check ->> 'missing')::numeric <> 0
    OR (NEW.sample_check ->> 'external')::numeric <> 0
  THEN
    RAISE EXCEPTION 'Collect all referenced samples into the Ableton project before uploading'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_complete_samples_for_project_version
  ON public.project_versions;

CREATE TRIGGER require_complete_samples_for_project_version
BEFORE INSERT ON public.project_versions
FOR EACH ROW
EXECUTE FUNCTION public.require_complete_samples_for_project_version();
