
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Only admins can view roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No insert/update/delete from client
CREATE POLICY "No client modifications"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Admin metrics function (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_users INT;
  total_projects INT;
  users_with_collabs INT;
  collab_percentage NUMERIC;
  result JSON;
BEGIN
  -- Only admins can call this
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COUNT(*) INTO total_users FROM public.profiles;
  SELECT COUNT(*) INTO total_projects FROM public.projects;
  
  SELECT COUNT(DISTINCT p.owner_id) INTO users_with_collabs
  FROM public.projects p
  WHERE EXISTS (
    SELECT 1 FROM public.collaborators c WHERE c.project_id = p.id
  );
  
  IF total_users > 0 THEN
    collab_percentage := ROUND((users_with_collabs::NUMERIC / total_users) * 100, 1);
  ELSE
    collab_percentage := 0;
  END IF;

  result := json_build_object(
    'total_users', total_users,
    'total_projects', total_projects,
    'users_with_collaborators', users_with_collabs,
    'collaboration_percentage', collab_percentage
  );
  
  RETURN result;
END;
$$;
