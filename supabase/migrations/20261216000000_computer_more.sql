-- Two more Computers jobs (the owner's decision A133, 28 November 2026),
-- after going through the same company's computer list: a laptop or
-- computer that overheats (dust cleaned out, fan and cooling paste seen to)
-- and a broken laptop hinge. One technician, one visit, a result she sees the
-- same day: 30 days (what she pays for is "it stops cutting out", not a
-- cleaning), not risky. Software installation, data recovery, workshop
-- repairs and office IT support stay out. Prices blank (NULL) on the owner's
-- word.
--
-- Safe to run twice.

BEGIN;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('computers', 'Laptop or computer overheating', 1, 'repair', false),
  ('computers', 'Broken laptop hinge',            2, 'repair', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261216000000_computer_more')
ON CONFLICT (name) DO NOTHING;

COMMIT;
