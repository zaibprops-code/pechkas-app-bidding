-- =============================================================================
--  WHAT HAS RUN
--
--  Run after 20261025000000_email_sign_in.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  The owner runs every migration by hand, so the database can be behind
--  the app on his phone — and then whole features quietly do nothing. This
--  lets the app's Me screen say so in plain words: it asks which migrations
--  have run and compares the newest with the one the app was built for.
--
--  Only migration names come back: they are the file names in the
--  repository, and say nothing about anybody.
-- =============================================================================

BEGIN;

/** The newest migration that has run, and how many have. */
CREATE OR REPLACE FUNCTION public.db_version()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('newest', max(name), 'count', count(*)) FROM public.applied_migrations;
$$;

GRANT EXECUTE ON FUNCTION public.db_version() TO anon, authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261026000000_what_has_run')
ON CONFLICT (name) DO NOTHING;

COMMIT;
