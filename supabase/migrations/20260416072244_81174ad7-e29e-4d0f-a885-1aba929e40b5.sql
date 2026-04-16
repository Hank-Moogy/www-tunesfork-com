
-- Create plugin_catalog table
CREATE TABLE public.plugin_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  developer TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Unknown',
  website_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  normalized_name TEXT NOT NULL DEFAULT '',
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_free BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'approved',
  submitted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast fuzzy matching
CREATE INDEX idx_plugin_catalog_normalized_name ON public.plugin_catalog (normalized_name);
CREATE INDEX idx_plugin_catalog_status ON public.plugin_catalog (status);

-- Enable RLS
ALTER TABLE public.plugin_catalog ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view approved plugins
CREATE POLICY "Anyone can view approved plugins"
ON public.plugin_catalog
FOR SELECT
TO authenticated
USING (status = 'approved');

-- Users can also see their own pending submissions
CREATE POLICY "Users can view own pending submissions"
ON public.plugin_catalog
FOR SELECT
TO authenticated
USING (submitted_by = auth.uid() AND status = 'pending');

-- Authenticated users can submit new plugins
CREATE POLICY "Authenticated users can submit plugins"
ON public.plugin_catalog
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = submitted_by AND status = 'pending');

-- Trigger for updated_at
CREATE TRIGGER update_plugin_catalog_updated_at
BEFORE UPDATE ON public.plugin_catalog
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Normalize function helper
CREATE OR REPLACE FUNCTION public.normalize_plugin_name(raw_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(trim(raw_name), '\s*v?\d+(\.\d+)*\s*$', '', 'i'),
    '[^a-z0-9]', '', 'gi'
  ));
$$;

-- Match plugins function: takes a jsonb array of plugin name strings,
-- returns matched catalog entries + unmatched names
CREATE OR REPLACE FUNCTION public.match_plugins(plugin_names JSONB)
RETURNS TABLE(
  input_name TEXT,
  catalog_id UUID,
  catalog_name TEXT,
  developer TEXT,
  type TEXT,
  website_url TEXT,
  logo_url TEXT,
  is_free BOOLEAN,
  matched BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname TEXT;
  norm TEXT;
  found RECORD;
BEGIN
  FOR pname IN SELECT jsonb_array_elements_text(plugin_names)
  LOOP
    norm := normalize_plugin_name(pname);
    
    SELECT pc.id, pc.name, pc.developer, pc.type, pc.website_url, pc.logo_url, pc.is_free
    INTO found
    FROM public.plugin_catalog pc
    WHERE pc.status = 'approved'
      AND (
        pc.normalized_name = norm
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(pc.aliases) alias
          WHERE normalize_plugin_name(alias) = norm
        )
      )
    LIMIT 1;
    
    IF found IS NOT NULL THEN
      input_name := pname;
      catalog_id := found.id;
      catalog_name := found.name;
      developer := found.developer;
      type := found.type;
      website_url := found.website_url;
      logo_url := found.logo_url;
      is_free := found.is_free;
      matched := true;
      RETURN NEXT;
    ELSE
      input_name := pname;
      catalog_id := NULL;
      catalog_name := NULL;
      developer := NULL;
      type := NULL;
      website_url := NULL;
      logo_url := NULL;
      is_free := NULL;
      matched := false;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
