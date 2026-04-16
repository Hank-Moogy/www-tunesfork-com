
-- Drop the broad ALL policy
DROP POLICY IF EXISTS "Project owners can manage collaborators" ON public.collaborators;

-- Only owners can insert collaborators
CREATE POLICY "Only owners can insert collaborators"
ON public.collaborators
FOR INSERT
TO authenticated
WITH CHECK (is_project_owner(project_id));

-- Only owners can update collaborators
CREATE POLICY "Only owners can update collaborators"
ON public.collaborators
FOR UPDATE
TO authenticated
USING (is_project_owner(project_id));

-- Only owners can delete collaborators
CREATE POLICY "Only owners can delete collaborators"
ON public.collaborators
FOR DELETE
TO authenticated
USING (is_project_owner(project_id));

-- Owners can also view all collaborators on their projects
CREATE POLICY "Owners can view project collaborators"
ON public.collaborators
FOR SELECT
TO authenticated
USING (is_project_owner(project_id));
