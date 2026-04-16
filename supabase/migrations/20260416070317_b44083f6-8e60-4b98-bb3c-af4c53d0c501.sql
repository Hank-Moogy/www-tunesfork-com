
-- Collaborators can view all collaborator records on projects they belong to
CREATE POLICY "Collaborators can view project collaborators"
ON public.collaborators
FOR SELECT
TO authenticated
USING (is_collaborator(project_id));
