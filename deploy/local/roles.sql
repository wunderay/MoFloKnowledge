-- One-time role setup for the all-in-one local database: Supabase-compatible roles for the real GoTrue and PostgREST.
-- Run by deploy/local/entrypoint.sh on the first start, before the GoTrue and application migrations.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE PASSWORD :'authenticator_pw';
GRANT anon, authenticated, service_role TO authenticator;
CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD :'auth_admin_pw';
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
GRANT CREATE ON DATABASE :"dbname" TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
