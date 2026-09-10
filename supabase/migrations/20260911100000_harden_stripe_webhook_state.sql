-- Keep Stripe sandbox/live records independent and claim webhook deliveries
-- atomically so concurrent retries cannot run side effects twice.

ALTER TABLE public.stripe_webhook_events
  DROP CONSTRAINT stripe_webhook_events_pkey;
ALTER TABLE public.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (environment, event_id);

ALTER TABLE public.subscriptions
  DROP CONSTRAINT subscriptions_stripe_subscription_id_key;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_environment_stripe_subscription_id_key
  UNIQUE (environment, stripe_subscription_id);

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  _event_id text,
  _environment text,
  _event_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  IF _environment NOT IN ('sandbox', 'live') OR
     _event_id IS NULL OR _event_id = '' OR
     _event_type IS NULL OR _event_type = '' THEN
    RAISE EXCEPTION 'INVALID_STRIPE_WEBHOOK_CLAIM';
  END IF;

  INSERT INTO public.stripe_webhook_events (
    event_id, environment, event_type, status, attempts
  ) VALUES (
    _event_id, _environment, _event_type, 'processing', 1
  )
  ON CONFLICT (environment, event_id) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT status INTO current_status
  FROM public.stripe_webhook_events
  WHERE environment = _environment AND event_id = _event_id
  FOR UPDATE;

  IF current_status IN ('processing', 'processed') THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing',
      attempts = attempts + 1,
      event_type = _event_type,
      processed_at = NULL,
      last_error = NULL
  WHERE environment = _environment AND event_id = _event_id;

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, text)
  TO service_role;
