-- Is everything the app needs set up in this Supabase project?
-- Safe: it only reads. Paste it into Supabase → SQL Editor → Run.
-- Each line says OK, or what is missing and where to fix it.

SELECT 'Your owner login is on the office list' AS "check",
       CASE WHEN EXISTS (SELECT 1 FROM public.staff WHERE role = 'owner' AND active)
            THEN 'OK: ' || (SELECT string_agg(name, ', ') FROM public.staff WHERE role = 'owner' AND active)
            ELSE 'MISSING: run make_owner — docs/OWNER.md, "Setting up phase 1", step B' END AS result
UNION ALL
SELECT 'Private file store for photos and voice notes (job-media)',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'job-media' AND NOT public)
            THEN 'OK' ELSE 'MISSING: run 20261017000000_posting_a_job.sql' END
UNION ALL
SELECT 'Notification sender (pg_net)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
            THEN 'OK' ELSE 'MISSING: Database → Extensions → turn on pg_net, then run 20261019000000_notifications.sql again' END
UNION ALL
SELECT 'Clock for timed jobs (pg_cron)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
            THEN 'OK' ELSE 'MISSING: Database → Extensions → turn on pg_cron, then run 20261020000000_who_else_hears.sql again' END
UNION ALL
SELECT 'Timed jobs scheduled',
       CASE WHEN to_regclass('cron.job') IS NULL THEN 'MISSING: pg_cron is not on (line above)'
            ELSE coalesce((xpath('/row/j/text()', query_to_xml(
                   'SELECT string_agg(jobname, '', '' ORDER BY jobname) AS j FROM cron.job', false, false, '')))[1]::text,
                 'NONE: run 20261020000000_who_else_hears.sql and 20261023000000_after_launch.sql again') END
UNION ALL
SELECT 'Sectors taking jobs',
       coalesce((SELECT string_agg(name, ', ' ORDER BY sort) FROM public.sectors WHERE live), 'NONE: no sector is open')
UNION ALL
SELECT 'Approved technicians',
       (SELECT count(*) FROM public.pros WHERE status = 'approved')::text
       || ' approved, ' || (SELECT count(*) FROM public.pros WHERE status = 'approved' AND online)::text || ' online now'
UNION ALL
SELECT 'Accounts that have signed in',
       (SELECT count(*) FROM auth.users WHERE coalesce(phone, '') <> '')::text || ' by mobile number, '
       || (SELECT count(*) FROM auth.users WHERE coalesce(phone, '') = '' AND coalesce(email, '') <> '')::text || ' by email'
UNION ALL
SELECT 'Office alerts go to',
       coalesce((SELECT string_agg(name || ': 0' || substr(alert_phone, 3), ', ') FROM public.staff WHERE active AND alert_phone IS NOT NULL),
                'NOBODY YET: admin panel → Jobs → "Alerts on your phone"')
UNION ALL
SELECT 'Phones that can receive notifications',
       (SELECT count(*) FROM public.push_tokens)::text;
