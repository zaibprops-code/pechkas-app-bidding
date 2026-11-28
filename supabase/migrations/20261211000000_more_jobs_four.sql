-- Four more Home appliances jobs (the owner's decision A128, 28 November
-- 2026), after going through the same company's appliance list: a
-- dishwasher, kitchen hood (chimney) cleaning and installation, and an
-- electric or induction stove. Gas stoves stay out: Pechkas does no gas work
-- (A97). None is risky (like the washing machine and the electric oven);
-- hood cleaning is a service (7 days), the rest 30 days. Prices blank (NULL)
-- on the owner's word. The page itself is split into three groups in
-- packages/shared/src/work.ts, not here.
--
-- Safe to run twice: every row is added only if it is not there yet.

BEGIN;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('appliances', 'Dishwasher repair',                       1, 'repair',  false),
  ('appliances', 'Kitchen hood (chimney) cleaning',         2, 'service', false),
  ('appliances', 'Kitchen hood (chimney) installation',     3, 'repair',  false),
  ('appliances', 'Electric stove or hob repair',            4, 'repair',  false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261211000000_more_jobs_four')
ON CONFLICT (name) DO NOTHING;

COMMIT;
