-- Two more plumbing jobs and two AC jobs (the owner's decision A127, 28 November 2026), after
-- going through the same company's full plumbing list: everything else on it
-- Pechkas already has.
--
-- Water tank installation: a new plastic tank put up on the roof and joined
-- to the pipes. A plumber's job, so it belongs to Plumber; the Water tank
-- page shows it too (WORK_ALSO in packages/shared/src/work.ts), the way the
-- UPS page shows the electrician's UPS connection.
-- Low water pressure in taps or shower: a problem she sees, found and fixed,
-- instead of "Something else".
--
-- And two AC jobs from that company's list of common AC problems, named as
-- she sees them rather than by their cause: AC not cooling (risky, like the
-- gas top-up and the PCB work: the fault may be the gas or the electrics)
-- and a noisy or shaking AC (not risky: fan, mounts and loose parts).
--
-- And three Solar jobs from its solar list: a solar inverter fitted or
-- replaced, solar batteries replaced (solar technicians' work, so under
-- Solar rather than UPS), and a sudden drop in output found and fixed; all
-- risky, like the inverter fault job (high DC voltage, wiring, inverter).
-- Panel installation stays out: days of work, a structure, net metering.
--
-- All seven are repairs or fittings (30 days). Prices blank (NULL) on the
-- owner's word, as in A125 and A126. Safe to run twice.

BEGIN;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('plumber', 'Water tank installation',              1, 'repair', false),
  ('plumber', 'Low water pressure in taps or shower', 2, 'repair', false),
  ('ac',      'AC not cooling',                       1, 'repair', true),
  ('ac',      'Noisy or shaking AC',                  2, 'repair', false),
  ('solar',   'Solar inverter installation or replacement', 1, 'repair', true),
  ('solar',   'Solar battery replacement',            2, 'repair', true),
  ('solar',   'Solar producing less power',           3, 'repair', true)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261210000000_more_jobs_three')
ON CONFLICT (name) DO NOTHING;

COMMIT;
