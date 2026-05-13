CREATE OR REPLACE FUNCTION public.get_frequent_collaborators(_limit int DEFAULT 8)
RETURNS TABLE(user_id uuid, email text, display_name text, avatar_url text, project_count bigint, last_added_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    c.user_id,
    u.email::text,
    p.display_name,
    p.avatar_url,
    count(distinct c.project_id) AS project_count,
    max(c.created_at) AS last_added_at
  FROM public.collaborators c
  JOIN public.projects pr ON pr.id = c.project_id
  JOIN public.profiles p ON p.user_id = c.user_id
  JOIN auth.users u ON u.id = c.user_id
  WHERE pr.owner_id = auth.uid()
    AND c.user_id <> auth.uid()
  GROUP BY c.user_id, u.email, p.display_name, p.avatar_url
  ORDER BY project_count DESC, last_added_at DESC
  LIMIT _limit;
END;
$$;