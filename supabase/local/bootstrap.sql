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

-- Supabase's auth.users. Only the columns the app actually reads.
CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY,
  email text,
  -- Phone sign-in stores the number here, as Supabase does, in E.164 without
  -- the plus: 923001234567.
  phone text
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

-- Supabase Storage, as far as the migrations touch it: buckets, the object
-- rows its upload API writes, and the helper policies use to read a path.
-- Uploading here is an INSERT into storage.objects, which is exactly what the
-- policies are checked against on the real thing.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text REFERENCES storage.buckets(id),
  name       text NOT NULL,
  owner_id   text,
  metadata   jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

/** The folders of a path: 'a/b/c.jpg' → {a,b}. The same as Supabase's. */
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;

-- Supabase's pg_net, as far as the migrations use it: one function with the
-- real one's exact signature. Instead of sending anything it writes the
-- request down, so the tests can read every notification that would have
-- left — who it went to and every word of it. `net.fail` makes it throw, to
-- prove a notification that cannot go never stops the job.
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE IF NOT EXISTS net.sent (
  id      bigserial PRIMARY KEY,
  url     text,
  body    jsonb,
  headers jsonb
);
CREATE TABLE IF NOT EXISTS net.fail (on_purpose boolean);

CREATE OR REPLACE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM net.fail) THEN
    RAISE EXCEPTION 'the push service could not be reached (on purpose)';
  END IF;
  INSERT INTO net.sent (url, body, headers) VALUES (url, body, headers) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Supabase's pg_cron, as far as the migrations use it: scheduling a named
-- job writes it down here (replacing one of the same name, as the real one
-- does). The tests read it to prove the clock was set, and call the
-- scheduled function themselves instead of waiting a minute.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobname  text PRIMARY KEY,
  schedule text NOT NULL,
  command  text NOT NULL
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;
  SELECT 1::bigint;
$$;
