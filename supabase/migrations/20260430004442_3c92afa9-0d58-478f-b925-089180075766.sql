-- Device tokens: long-lived API tokens issued to paired desktop apps
CREATE TABLE public.device_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Desktop',
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX idx_device_tokens_hash ON public.device_tokens(token_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own device tokens"
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own device tokens"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Device pair codes: short-lived codes used during the pair-by-browser flow
CREATE TABLE public.device_pair_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT 'Desktop',
  user_id UUID,
  confirmed_at TIMESTAMPTZ,
  token_id UUID REFERENCES public.device_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX idx_device_pair_codes_code ON public.device_pair_codes(code);

ALTER TABLE public.device_pair_codes ENABLE ROW LEVEL SECURITY;

-- Pair codes are accessed via edge functions only (service role); no client policies needed.

-- Waitlist for the Tunesfork Sync coming-soon page
CREATE TABLE public.sync_waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  user_id UUID,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join the waitlist"
  ON public.sync_waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view waitlist"
  ON public.sync_waitlist FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
