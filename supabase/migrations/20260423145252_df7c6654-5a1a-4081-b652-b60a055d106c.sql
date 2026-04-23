
CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE(
  user_email text,
  display_name text,
  project_count bigint,
  collaborator_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.email::text AS user_email,
    p.display_name,
    COALESCE(proj.cnt, 0) AS project_count,
    COALESCE(collab.cnt, 0) AS collaborator_count,
    p.created_at
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN (
    SELECT owner_id, COUNT(*)::bigint AS cnt
    FROM public.projects
    GROUP BY owner_id
  ) proj ON proj.owner_id = u.id
  LEFT JOIN (
    SELECT pr.owner_id, COUNT(DISTINCT c.user_id)::bigint AS cnt
    FROM public.collaborators c
    JOIN public.projects pr ON pr.id = c.project_id
    GROUP BY pr.owner_id
  ) collab ON collab.owner_id = u.id
  ORDER BY p.created_at DESC;
END;
$$;
