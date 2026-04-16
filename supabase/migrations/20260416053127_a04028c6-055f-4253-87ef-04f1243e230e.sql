
-- Drop the permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert notifications for others" ON public.notifications;

-- Create a secure RPC to insert notifications, with authorization checks
CREATE OR REPLACE FUNCTION public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_message text DEFAULT NULL,
  notification_reference_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the target user exists in profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  -- Prevent users from sending notifications to themselves
  IF target_user_id = auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, message, reference_id)
  VALUES (target_user_id, notification_type, notification_message, notification_reference_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, uuid) TO authenticated;
