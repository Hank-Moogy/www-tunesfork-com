-- A. Share-page info leak: rewrite to return only safe columns
DROP FUNCTION IF EXISTS public.get_versions_by_share_token(text);

CREATE OR REPLACE FUNCTION public.get_versions_by_share_token(_token text)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  version_number integer,
  change_note text,
  created_at timestamptz,
  file_size_bytes bigint,
  audio_preview_url text,
  track_list jsonb,
  plugin_list jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pv.id,
    pv.project_id,
    pv.version_number,
    pv.change_note,
    pv.created_at,
    pv.file_size_bytes,
    pv.audio_preview_url,
    pv.track_list,
    pv.plugin_list
  FROM public.project_versions pv
  JOIN public.projects p ON p.id = pv.project_id
  WHERE p.share_token = _token
  ORDER BY pv.version_number DESC;
$$;

REVOKE ALL ON FUNCTION public.get_versions_by_share_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_versions_by_share_token(text) TO anon, authenticated;

-- B. Notification spam: allowlist + length cap + relationship check
CREATE OR REPLACE FUNCTION public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_message text DEFAULT NULL,
  notification_reference_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed_types text[] := ARRAY['new_version', 'new_collaborator', 'comment', 'mention', 'share_accepted'];
  share_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user_id = auth.uid() THEN
    RETURN;
  END IF;

  IF NOT (notification_type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;

  IF notification_message IS NOT NULL AND length(notification_message) > 500 THEN
    notification_message := left(notification_message, 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  -- Caller and target must share at least one project (owner or collaborator)
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.collaborators c ON c.project_id = p.id
    WHERE
      (p.owner_id = auth.uid() AND (c.user_id = target_user_id OR p.owner_id = target_user_id))
      OR (c.user_id = auth.uid() AND (p.owner_id = target_user_id OR EXISTS (
        SELECT 1 FROM public.collaborators c2
        WHERE c2.project_id = p.id AND c2.user_id = target_user_id
      )))
  ) INTO share_exists;

  IF NOT share_exists THEN
    RAISE EXCEPTION 'No shared project with target user';
  END IF;

  INSERT INTO public.notifications (user_id, type, message, reference_id)
  VALUES (target_user_id, notification_type, notification_message, notification_reference_id);
END;
$$;

-- C. Collaborator lookup by exact email
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.avatar_url
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(u.email) = lower(trim(_email))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;

-- E. Patch search_path on the remaining pgmq helpers
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;