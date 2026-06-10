-- The share/invite page is usually viewed signed-out, and profiles is
-- RLS-protected — so the inviter showed as "A producer". Expose just the
-- owner's display name/avatar for a valid share or invite token.
CREATE OR REPLACE FUNCTION public.get_share_token_owner_profile(_token text)
RETURNS TABLE(display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.display_name, pr.avatar_url
  FROM public.projects p
  JOIN public.profiles pr ON pr.user_id = p.owner_id
  WHERE p.share_token = _token
     OR EXISTS (
       SELECT 1 FROM public.project_invites i
       WHERE i.token = _token
         AND i.project_id = p.id
         AND i.accepted_at IS NULL
         AND i.expires_at > now()
     )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_share_token_owner_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_token_owner_profile(text) TO anon, authenticated;
