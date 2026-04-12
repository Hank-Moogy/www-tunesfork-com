
-- Fix infinite recursion: drop the circular policies and replace with non-recursive ones

-- 1. Drop the problematic collaborators policy that queries projects
DROP POLICY IF EXISTS "Project owners can manage collaborators" ON public.collaborators;

-- 2. Drop the problematic projects policy that queries collaborators  
DROP POLICY IF EXISTS "Collaborators can view shared projects" ON public.projects;

-- 3. Recreate collaborators management policy using a security definer function
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND owner_id = auth.uid()
  )
$$;

-- 4. Recreate collaborators management policy using the function (avoids recursion)
CREATE POLICY "Project owners can manage collaborators"
ON public.collaborators
FOR ALL
TO authenticated
USING (public.is_project_owner(project_id))
WITH CHECK (public.is_project_owner(project_id));

-- 5. Create a security definer function for collaborator check
CREATE OR REPLACE FUNCTION public.is_collaborator(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators
    WHERE project_id = _project_id AND user_id = auth.uid()
  )
$$;

-- 6. Recreate projects collaborator view policy using the function
CREATE POLICY "Collaborators can view shared projects"
ON public.projects
FOR SELECT
TO authenticated
USING (public.is_collaborator(id));

-- 7. Also fix project_versions policies that have the same nested pattern
DROP POLICY IF EXISTS "Users can view versions of accessible projects" ON public.project_versions;
DROP POLICY IF EXISTS "Owners and contributors can insert versions" ON public.project_versions;

CREATE POLICY "Users can view versions of accessible projects"
ON public.project_versions
FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id) OR public.is_collaborator(project_id)
);

CREATE OR REPLACE FUNCTION public.is_contributor(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators
    WHERE project_id = _project_id
      AND user_id = auth.uid()
      AND permission_level = 'contributor'
  )
$$;

CREATE POLICY "Owners and contributors can insert versions"
ON public.project_versions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id) OR public.is_contributor(project_id)
);
