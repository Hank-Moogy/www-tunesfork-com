-- Stripe launch safety: idempotent webhooks, founding-plan capacity, and one
-- server-owned entitlement boundary shared with storage enforcement.

CREATE TABLE public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.founding_checkout_reservations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  interval text NOT NULL CHECK (interval IN ('month', 'year')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  PRIMARY KEY (user_id, environment)
);
ALTER TABLE public.founding_checkout_reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_founding_producer_slot(
  _user_id uuid, _environment text, _interval text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  occupied integer;
BEGIN
  IF _environment NOT IN ('sandbox', 'live') OR _interval NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'INVALID_FOUNDING_RESERVATION';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('founding-producer-' || _environment));
  DELETE FROM public.founding_checkout_reservations WHERE expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND environment = _environment
      AND price_id LIKE 'founding_producer_%'
      AND status IN ('active', 'trialing', 'past_due')
  ) THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO occupied
  FROM (
    SELECT user_id FROM public.subscriptions
    WHERE environment = _environment AND price_id LIKE 'founding_producer_%'
      AND status IN ('active', 'trialing', 'past_due')
    UNION
    SELECT user_id FROM public.founding_checkout_reservations
    WHERE environment = _environment
  ) founding_accounts;
  IF occupied >= 100 THEN RETURN false; END IF;

  INSERT INTO public.founding_checkout_reservations (user_id, environment, interval, expires_at)
  VALUES (_user_id, _environment, _interval, now() + interval '30 minutes')
  ON CONFLICT (user_id, environment) DO UPDATE
  SET interval = EXCLUDED.interval, expires_at = EXCLUDED.expires_at;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_founding_producer_slot(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_founding_producer_slot(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_account_plan(_user_id uuid, _plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _plan NOT IN ('free', 'producer', 'studio', 'founding_producer') THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  INSERT INTO public.account_entitlements (
    user_id, plan, storage_limit_bytes, max_projects,
    max_collaborators_per_project, grandfathered
  ) VALUES (
    _user_id,
    _plan,
    CASE _plan WHEN 'free' THEN 5368709120 WHEN 'studio' THEN 536870912000 ELSE 107374182400 END,
    CASE WHEN _plan = 'free' THEN 5 ELSE NULL END,
    CASE _plan WHEN 'free' THEN 3 WHEN 'studio' THEN NULL ELSE 5 END,
    false
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = CASE WHEN account_entitlements.grandfathered THEN account_entitlements.plan ELSE EXCLUDED.plan END,
    storage_limit_bytes = CASE WHEN account_entitlements.grandfathered THEN NULL ELSE EXCLUDED.storage_limit_bytes END,
    max_projects = CASE WHEN account_entitlements.grandfathered THEN account_entitlements.max_projects ELSE EXCLUDED.max_projects END,
    max_collaborators_per_project = CASE WHEN account_entitlements.grandfathered THEN account_entitlements.max_collaborators_per_project ELSE EXCLUDED.max_collaborators_per_project END,
    updated_at = now();

END;
$$;
REVOKE ALL ON FUNCTION public.apply_account_plan(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_account_plan(uuid, text) TO service_role;
