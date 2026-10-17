-- Disposable local test cluster only. Never run this shim in Supabase.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
-- Native GoTrue/Supabase protect the Auth roster with RLS. No application read policy.
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

-- Minimal stand-in for the Supabase Storage schema, for DISPOSABLE local test clusters only. Never run this in
-- Supabase: the real `storage` schema is created and owned by the Storage service.
-- It mirrors the columns, grants, RLS switch and helper functions that Supabase Storage policies rely on
-- (storage.buckets, storage.objects with path_tokens, storage.foldername/filename/extension).
-- Apply it after bootstrap.sql and BEFORE the migrations, so a migration can insert the bucket and create policies.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets(
 id text PRIMARY KEY,
 name text NOT NULL,
 owner uuid,
 created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(),
 public boolean DEFAULT false,
 avif_autodetection boolean DEFAULT false,
 file_size_limit bigint,
 allowed_mime_types text[],
 owner_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS bname ON storage.buckets(name);
CREATE TABLE IF NOT EXISTS storage.objects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text REFERENCES storage.buckets(id),
 name text,
 owner uuid,
 created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(),
 last_accessed_at timestamptz DEFAULT now(),
 metadata jsonb,
 path_tokens text[] GENERATED ALWAYS AS (string_to_array(name,'/')) STORED,
 version text,
 owner_id text,
 user_metadata jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects(bucket_id,name);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $f$
DECLARE _parts text[];
BEGIN
 SELECT string_to_array(name,'/') INTO _parts;
 RETURN _parts[1:array_length(_parts,1)-1];
END $f$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _parts text[];
BEGIN
 SELECT string_to_array(name,'/') INTO _parts;
 RETURN _parts[array_length(_parts,1)];
END $f$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _parts text[]; _filename text;
BEGIN
 SELECT string_to_array(name,'/') INTO _parts;
 SELECT _parts[array_length(_parts,1)] INTO _filename;
 RETURN reverse(split_part(reverse(_filename),'.',1));
END $f$;
-- Supabase grants table privileges broadly and relies on RLS; buckets stay unreadable without a policy.
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT ALL ON storage.buckets,storage.objects TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon,authenticated,service_role;
