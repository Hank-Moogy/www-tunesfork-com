-- Who has which plugins, so a shared project can say what you are missing.
--
-- Every desktop save already uploads the plugin names found in the set, and 133
-- versions carry them — but nothing has ever read them back. A collaborator
-- opening a shared project has no way to know it needs a synth they do not own
-- until Ableton tells them, by which point they are already confused.
--
-- The inventory is derived, not declared: if a project you uploaded uses Serum,
-- you have Serum. That is free, accurate, and needs nothing from the user.

-- Live reports the same plugin under several names depending on the channel
-- configuration and the plugin format — "Doubler2 Mono/Stereo", "Doubler2
-- Stereo", "Waves Tune Stereo", "WavesTune Stereo". Without folding those
-- together an inventory would claim you are missing a plugin you demonstrably
-- own. Digits are kept, because Doubler2 and Doubler4 really are different.
-- The existing normalizer stripped trailing digits as a version number and left
-- channel configuration alone, so "Serum x64" became "serumx", "FabFilter
-- Saturn 2" collided with Saturn 1, and "Doubler2 Mono/Stereo" did not match
-- "Doubler2 Stereo" — the exact folding an inventory depends on. The catalogue
-- is empty and nothing stores its output, so it is replaced rather than
-- worked around. match_plugins calls it by name and gets the better behaviour.
DROP FUNCTION IF EXISTS public.normalize_plugin_name(text);

CREATE OR REPLACE FUNCTION public.normalize_plugin_name(raw_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Applied twice so a name carrying both a format and a channel marker
  -- ("Serum x64 Stereo") loses both. Digits are kept: Doubler2 and Doubler4 are
  -- genuinely different plugins, and so are Serum and Serum 2.
  SELECT nullif(
    regexp_replace(
      lower(
        regexp_replace(
          regexp_replace(
            trim(coalesce(raw_name, '')),
            '\s*[-_(\[]?\s*(mono\s*/\s*stereo|stereo\s*/\s*mono|mono|stereo|surround|vst3|vst2|vst|audiounit|au|x64|x86|64\s*bit|32\s*bit)\s*[-_)\]]?\s*$',
            '', 'gi'
          ),
          '\s*[-_(\[]?\s*(mono\s*/\s*stereo|stereo\s*/\s*mono|mono|stereo|surround|vst3|vst2|vst|audiounit|au|x64|x86|64\s*bit|32\s*bit)\s*[-_)\]]?\s*$',
          '', 'gi'
        )
      ),
      '[^a-z0-9]', '', 'g'
    ),
    ''
  );
$$;

CREATE TABLE IF NOT EXISTS public.user_plugins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  project_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, normalized_name)
);

ALTER TABLE public.user_plugins ENABLE ROW LEVEL SECURITY;

-- An inventory is personal. You can see your own; comparisons against anyone
-- else's happen inside a definer function that returns only a yes or no.
DROP POLICY IF EXISTS "Users read their own plugin inventory" ON public.user_plugins;
CREATE POLICY "Users read their own plugin inventory"
ON public.user_plugins FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_plugins_normalized_idx ON public.user_plugins (normalized_name);

-- Supabase grants SELECT on public tables to anon and authenticated by default,
-- which would leave RLS as the only thing between a logged-out request and
-- everyone's plugin inventory. Rows are written by a definer trigger and read
-- through a definer function, so no client role needs direct access at all.
REVOKE ALL ON public.user_plugins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_plugins FROM authenticated;

-- Record what an upload proves its uploader has.
CREATE OR REPLACE FUNCTION public.record_version_plugins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plugin_list IS NULL OR jsonb_typeof(NEW.plugin_list) <> 'array' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_plugins (user_id, normalized_name, display_name, project_count, first_seen_at, last_seen_at)
  SELECT NEW.uploader_id,
         public.normalize_plugin_name(name),
         min(name),
         1,
         now(),
         now()
  FROM jsonb_array_elements_text(NEW.plugin_list) AS name
  WHERE public.normalize_plugin_name(name) IS NOT NULL
  GROUP BY public.normalize_plugin_name(name)
  ON CONFLICT (user_id, normalized_name) DO UPDATE
    SET last_seen_at = now(),
        project_count = public.user_plugins.project_count + 1;

  -- Keep a catalogue of every plugin seen anywhere, so the product has a real
  -- plugin database rather than an empty table. Observed rows are facts, not
  -- curation: a human still approves the ones that get developer and website
  -- metadata.
  INSERT INTO public.plugin_catalog (name, normalized_name, status)
  SELECT min(name), public.normalize_plugin_name(name), 'observed'
  FROM jsonb_array_elements_text(NEW.plugin_list) AS name
  WHERE public.normalize_plugin_name(name) IS NOT NULL
  GROUP BY public.normalize_plugin_name(name)
  ON CONFLICT (name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_version_plugins ON public.project_versions;
CREATE TRIGGER record_version_plugins
AFTER INSERT ON public.project_versions
FOR EACH ROW EXECUTE FUNCTION public.record_version_plugins();

-- Backfill from everything already uploaded; this is where the inventory comes
-- from on day one rather than after everyone saves again.
INSERT INTO public.user_plugins (user_id, normalized_name, display_name, project_count, first_seen_at, last_seen_at)
SELECT pv.uploader_id,
       public.normalize_plugin_name(name),
       min(name),
       count(DISTINCT pv.project_id),
       min(pv.created_at),
       max(pv.created_at)
FROM public.project_versions pv,
     LATERAL jsonb_array_elements_text(pv.plugin_list) AS name
WHERE jsonb_typeof(pv.plugin_list) = 'array'
  AND public.normalize_plugin_name(name) IS NOT NULL
GROUP BY pv.uploader_id, public.normalize_plugin_name(name)
ON CONFLICT (user_id, normalized_name) DO NOTHING;

INSERT INTO public.plugin_catalog (name, normalized_name, status)
SELECT min(name), public.normalize_plugin_name(name), 'observed'
FROM public.project_versions pv,
     LATERAL jsonb_array_elements_text(pv.plugin_list) AS name
WHERE jsonb_typeof(pv.plugin_list) = 'array'
  AND public.normalize_plugin_name(name) IS NOT NULL
GROUP BY public.normalize_plugin_name(name)
ON CONFLICT (name) DO NOTHING;

-- What a version needs, and whether the caller has been seen using it.
-- Definer so it can read the caller's own inventory without exposing anybody
-- else's, and it answers only for versions the caller may already read.
CREATE OR REPLACE FUNCTION public.project_version_plugins(_version_id uuid)
RETURNS TABLE (name text, normalized_name text, have boolean, project_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT pv.id, pv.plugin_list, pv.uploader_id
    FROM public.project_versions pv
    JOIN public.projects p ON p.id = pv.project_id
    WHERE pv.id = _version_id
      AND (
        p.owner_id = auth.uid()
        OR pv.uploader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.project_id = p.id AND c.user_id = auth.uid())
      )
  ), names AS (
    SELECT DISTINCT
      public.normalize_plugin_name(value) AS normalized_name,
      min(value) OVER (PARTITION BY public.normalize_plugin_name(value)) AS name
    FROM allowed, LATERAL jsonb_array_elements_text(allowed.plugin_list) AS value
    WHERE jsonb_typeof(allowed.plugin_list) = 'array'
      AND public.normalize_plugin_name(value) IS NOT NULL
  )
  SELECT n.name,
         n.normalized_name,
         up.user_id IS NOT NULL AS have,
         coalesce(up.project_count, 0)
  FROM names n
  LEFT JOIN public.user_plugins up
    ON up.normalized_name = n.normalized_name AND up.user_id = auth.uid()
  ORDER BY (up.user_id IS NOT NULL), n.name;
$$;

REVOKE ALL ON FUNCTION public.project_version_plugins(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_version_plugins(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_plugin_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_plugin_name(text) TO authenticated, service_role;
