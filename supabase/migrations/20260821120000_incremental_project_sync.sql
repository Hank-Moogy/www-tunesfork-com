-- Content-addressed project versions. Legacy ZIP versions remain readable.
ALTER TABLE public.project_versions
  ALTER COLUMN zip_url DROP NOT NULL;

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS manifest jsonb;

ALTER TABLE public.project_versions
  ADD CONSTRAINT project_versions_payload_check
  CHECK (zip_url IS NOT NULL OR manifest IS NOT NULL) NOT VALID;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-blobs', 'project-blobs', false, 5368709120)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE public.project_blobs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  object_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sha256)
);

ALTER TABLE public.project_blobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_version_blobs (
  version_id uuid NOT NULL REFERENCES public.project_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sha256 text NOT NULL,
  PRIMARY KEY (version_id, user_id, sha256),
  FOREIGN KEY (user_id, sha256)
    REFERENCES public.project_blobs(user_id, sha256) ON DELETE RESTRICT
);

ALTER TABLE public.project_version_blobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX project_version_blobs_blob_idx
  ON public.project_version_blobs(user_id, sha256);

COMMENT ON COLUMN public.project_versions.manifest IS
  'Schema-versioned immutable file manifest for content-addressed project versions.';
