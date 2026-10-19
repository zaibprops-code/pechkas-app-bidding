-- Which database changes have run, and which have not.
-- Safe: it only reads. Paste it into Supabase → SQL Editor → Run.
-- Every line that says NOT RUN is a file from supabase/migrations to run,
-- oldest first. When a new migration is added, its name is added here too.

WITH expected(name) AS (VALUES
  ('20261015000000_foundations'),
  ('20261016000000_accounts_and_technicians'),
  ('20261017000000_posting_a_job'),
  ('20261018000000_bidding'),
  ('20261019000000_notifications'),
  ('20261020000000_who_else_hears'),
  ('20261021000000_doing_the_job'),
  ('20261022000000_money_and_trust'),
  ('20261023000000_after_launch'),
  ('20261024000000_settings_and_blocks'),
  ('20261025000000_email_sign_in'),
  ('20261026000000_what_has_run'),
  ('20261027000000_english_only')
)
SELECT e.name || '.sql' AS file,
       CASE WHEN a.name IS NULL THEN 'NOT RUN — run this file'
            ELSE 'ran on ' || to_char(a.applied_at, 'DD Mon YYYY HH24:MI') END AS status
FROM expected e
LEFT JOIN public.applied_migrations a ON a.name = e.name
ORDER BY e.name;
