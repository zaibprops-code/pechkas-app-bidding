-- =============================================================================
--  LOCAL TESTING ONLY — NOT A MIGRATION, NEVER RUN ON SUPABASE
--
--  Supabase gives every project three roles and an `auth` schema. A plain
--  Postgres does not, so this creates just enough of them that the real
--  migrations can be run and the security policies actually tested here
--  before they go anywhere near a customer's address.
--
--  If this file and Supabase ever disagree, this file is the one that is
--  wrong. Nothing in here is ever deployed.
-- =============================================================================

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

GRANT anon, authenticated, service_role TO postgres;

-- Supabase keeps pgcrypto and friends in their own schema rather than in
-- public. The migrations spell that out, so it has to exist here too.
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase's auth.users. Only the columns the job book actually reads.
CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY,
  email text
);

/**
 * Who is asking, according to their signed token.
 *
 * The real one reads the same setting, so a policy written against this
 * behaves identically on Supabase.
 */
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', ''),
    'anon'
  );
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

-- Supabase grants these by default on the public schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
