-- Grant the project owner admin access when that auth user exists.
-- The previous backend had a hard-coded auth.users id, which is not portable
-- to a new Supabase project.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('Samori.osei@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
