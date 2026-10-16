-- Seven-table baseline. Requires Supabase auth.users/auth.uid and application roles.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='moflo_owner') THEN CREATE ROLE moflo_owner NOLOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='moflo_worker') THEN CREATE ROLE moflo_worker NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION moflo_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, moflo_worker;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA public, auth TO moflo_owner;
GRANT REFERENCES, SELECT(id) ON auth.users TO moflo_owner;
GRANT CREATE ON SCHEMA public TO moflo_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO moflo_owner;
SET ROLE moflo_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  website_url text NOT NULL CHECK (website_url ~ '^https?://'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creation_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  draft_generation bigint NOT NULL DEFAULT 0 CHECK (draft_generation >= 0),
  next_snapshot_version bigint NOT NULL DEFAULT 1
    CHECK (next_snapshot_version >= 1),
  UNIQUE (created_by, creation_request_id)
);
CREATE INDEX companies_creator_idx ON public.companies(created_by);
-- Deliberately no global UNIQUE constraint on website_url or hostname.

CREATE TABLE public.company_members (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX company_members_user_idx
  ON public.company_members(user_id, company_id);

CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  requested_url text NOT NULL CHECK (requested_url ~ '^https?://'),
  effective_url text NULL CHECK (effective_url IS NULL OR effective_url ~ '^https?://'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','validating','crawling','extracting','succeeded','partial','failed','cancelled')),
  options jsonb NOT NULL DEFAULT '{"max_pages":10,"max_depth":2}'::jsonb
    CHECK (jsonb_typeof(options) = 'object'),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(progress) = 'object'),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(checkpoint) = 'object'),
  proposals jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposals) = 'object'),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(errors) = 'array'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  cancel_requested_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, request_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status IN ('succeeded','partial','failed','cancelled'))
    = (finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX scrape_jobs_one_active_idx ON public.scrape_jobs(company_id)
  WHERE status IN ('queued','validating','crawling','extracting');
CREATE INDEX scrape_jobs_claim_idx ON public.scrape_jobs(next_attempt_at, created_at)
  WHERE status IN ('queued','validating','crawling','extracting');
CREATE INDEX scrape_jobs_company_idx ON public.scrape_jobs(company_id, created_at DESC);
CREATE INDEX scrape_jobs_requester_idx ON public.scrape_jobs(requested_by);

CREATE TABLE public.source_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  scrape_job_id uuid NOT NULL,
  normalized_url text NOT NULL CHECK (normalized_url ~ '^https?://'),
  final_url text NULL CHECK (final_url IS NULL OR final_url ~ '^https?://'),
  title text NULL,
  author text NULL,
  site_name text NULL,
  published_on date NULL,
  retrieved_at timestamptz NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  response_status smallint NULL CHECK (response_status BETWEEN 100 AND 599),
  capture_status text NOT NULL CHECK (capture_status IN
    ('captured','blocked','failed','unsupported')),
  capture_method text NULL CHECK (capture_method IN ('http','browser')),
  cleaned_content text NULL,
  content_sha256 text NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  observations jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(observations) = 'object'),
  design_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(design_evidence) = 'object'),
  error_code text NULL,
  UNIQUE (company_id, id),
  UNIQUE (company_id, scrape_job_id, normalized_url),
  FOREIGN KEY (company_id, scrape_job_id)
    REFERENCES public.scrape_jobs(company_id, id) ON DELETE RESTRICT,
  CHECK (capture_status <> 'captured' OR
    (retrieved_at IS NOT NULL AND final_url IS NOT NULL
     AND cleaned_content IS NOT NULL AND content_sha256 IS NOT NULL))
);
CREATE INDEX source_pages_job_idx ON public.source_pages(company_id, scrape_job_id);

CREATE TABLE public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN
    ('company_foundation','positioning','market_and_customers',
     'branding_and_style','online_presence','key_person','offering')),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX knowledge_entries_singleton_idx
  ON public.knowledge_entries(company_id, kind)
  WHERE kind NOT IN ('key_person','offering');
CREATE INDEX knowledge_entries_creator_idx ON public.knowledge_entries(created_by);

CREATE TABLE public.knowledge_entry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  entry_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  schema_version text NOT NULL DEFAULT '1.0.0',
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','approved','rejected')),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  change_reason text NULL CHECK (change_reason IS NULL OR length(change_reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entry_id, revision),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, entry_id)
    REFERENCES public.knowledge_entries(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX knowledge_entry_versions_author_idx
  ON public.knowledge_entry_versions(author_id);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT entry_current_revision_fk
  FOREIGN KEY (company_id, id, current_revision)
  REFERENCES public.knowledge_entry_versions(company_id, entry_id, revision)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.knowledge_base_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  version_number bigint NOT NULL CHECK (version_number >= 1),
  schema_version text NOT NULL DEFAULT '1.0.0',
  request_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  entry_manifest jsonb NOT NULL CHECK (jsonb_typeof(entry_manifest) = 'array'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  UNIQUE (company_id, id),
  UNIQUE (company_id, version_number),
  UNIQUE (company_id, request_id),
  CHECK (payload->>'company_id' = company_id::text),
  CHECK (payload->>'knowledge_base_version_id' = id::text),
  CHECK (payload->>'version' = version_number::text),
  CHECK (payload->>'schema_version' = schema_version)
);
CREATE INDEX knowledge_base_versions_author_idx
  ON public.knowledge_base_versions(author_id);

COMMIT;
