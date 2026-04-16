
-- Add onboarding_completed to profiles
ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;

-- Create onboarding_responses table
CREATE TABLE public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  producer_level text,
  usage_mode text,
  music_genres jsonb,
  referral_source text,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

-- Users can insert their own response
CREATE POLICY "Users can insert their own onboarding response"
ON public.onboarding_responses
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own response
CREATE POLICY "Users can view their own onboarding response"
ON public.onboarding_responses
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
