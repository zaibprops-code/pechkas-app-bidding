-- =============================================================================
--  FOUNDATIONS
--
--  Run once, in the Supabase SQL editor, on the pechkas-app-bidding project.
--  docs/OWNER.md says exactly how. Running it a second time does no harm.
--
--  What it does:
--   1. Locks the door. A stranger holding the public key printed inside the
--      app can read no table and call no function — not now, and not for any
--      table or function added later, unless a later migration opens one on
--      purpose and says why.
--   2. Writes down the numbers the owner decided (commission, credit limit,
--      timers), so they live in the database that enforces them rather than
--      in an app that anybody can take apart.
--   3. Starts a list of which migrations have been run, because they are run
--      by hand and nobody should have to remember.
-- =============================================================================

BEGIN;

-- Supabase has this already. Saying so lets the tests build the same thing
-- on a bare Postgres before it goes anywhere near a real customer.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- --- 1. The door -------------------------------------------------------------
--
-- Supabase's default lets the public key read any new table in `public` until
-- somebody remembers to switch row security on. Here the default is reversed:
-- nobody but the owner can touch anything in `public` unless a migration
-- grants it explicitly. Forgetting to lock a table then fails safe — it is
-- simply unreachable — instead of failing open.
--
-- The way in, later, is a handful of functions, each asking the database
-- whether this person may do this thing, each naming exactly which columns
-- come back. Never a policy for `anon`.

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Postgres lets everybody (PUBLIC) run every new function, and that default
-- is global: revoking it "in schema public" is silently ignored. It has to be
-- revoked for the whole database, here, or every function a later migration
-- adds would be callable with the public key the moment it existed. The
-- tests caught exactly that.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- --- 2. The numbers the owner decided ---------------------------------------
--
-- Numbers only, each with its unit spelled out, so "10" can never be read as
-- ten rupees when it meant ten per cent. Money is whole paisa: Rs 3,000 is
-- 300000. Changing one is an UPDATE here, in a new migration, never a new
-- version of the app.

CREATE TABLE IF NOT EXISTS public.settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  value      bigint NOT NULL CHECK (value >= 0),
  unit       text   NOT NULL CHECK (unit IN ('paisa', 'basis_points', 'minutes', 'days')),
  meaning    text   NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Basis points: 1000 is 10%. Nothing above 100% makes sense.
  CHECK (unit <> 'basis_points' OR value <= 10000)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('commission_bps',     1000,   'basis_points',
     'Pechkas'' share of the agreed price of a completed job. 1000 = 10%. Labour only, rounded down, so odd paisa stay with the technician.'),
  ('credit_limit_paisa', 300000, 'paisa',
     'How much commission a technician may owe before he can make no new offers. 300000 = Rs 3,000.'),
  ('offer_minutes',      10,     'minutes',
     'How long a technician''s offer stays open before it expires.'),
  ('escalate_minutes',   15,     'minutes',
     'How long a job may sit with no offers before it comes to the owner to place by hand.'),
  ('guarantee_days',     30,     'days',
     'How long after completion a customer may claim the work failed and have it redone free.')
ON CONFLICT (key) DO NOTHING;


-- --- 3. Which migrations have been run ---------------------------------------

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.applied_migrations (name)
VALUES ('20261015000000_foundations')
ON CONFLICT (name) DO NOTHING;

COMMIT;
