-- More jobs, second list, and Sofa and carpet cleaning as a new kind of work
-- (the owner's decision A126, 28 November 2026).
--
-- Chosen by going through another Islamabad and Rawalpindi home-service
-- company's list of services with the same test as A125: one technician,
-- one visit, a price she can name, a result she can check. Their names were
-- not copied; each job is named in Pechkas' own words.
--
-- Plumber: a pipe you can see that has burst or leaks, a short new water
-- pipe inside the house, and an instant electric geyser (risky, like the
-- other geyser work). AC: a chemical (deep) wash and a window AC service,
-- both services (7 days). Electrician: ceiling fan repair; earthing and a
-- new DB or breaker board, both risky like the breaker work. UPS and
-- inverter: its first job of its own, battery replacement (risky; UPS work
-- opens only with risky Electrician work, trades.opens_with). Home
-- appliances: clothes dryer repair. Carpentry: kitchen cabinet fitting.
-- And a new kind of work, Sofa and carpet cleaning: one man with a cleaning
-- machine, three services (7 days). Whole-house, office and kitchen deep
-- cleaning stay out: a team's work, priced by size or the hour.
--
-- Every price is left blank (NULL) on the owner's word, as in A125: "After a
-- look", and the lowest offer is the ordinary min_offer_paisa.
--
-- Safe to run twice: every row is added only if it is not there yet.

BEGIN;

INSERT INTO public.trades (slug, name, sort)
VALUES ('cleaning', 'Sofa and carpet cleaning', (SELECT coalesce(max(sort), 0) + 1 FROM public.trades))
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('plumber',     'Burst or leaking pipe repair',      1, 'repair',  false),
  ('plumber',     'New water pipe line',               2, 'repair',  false),
  ('plumber',     'Instant electric geyser fitting',   3, 'repair',  true),
  ('ac',          'AC chemical wash',                  1, 'service', false),
  ('ac',          'Window AC service',                 2, 'service', false),
  ('electrician', 'Ceiling fan repair',                1, 'repair',  false),
  ('electrician', 'Earthing',                          2, 'repair',  true),
  ('electrician', 'New DB or breaker board',           3, 'repair',  true),
  ('ups',         'UPS battery replacement',           1, 'repair',  true),
  ('appliances',  'Clothes dryer repair',              1, 'repair',  false),
  ('carpentry',   'Kitchen cabinet fitting',           1, 'repair',  false),
  ('cleaning',    'Sofa cleaning',                     1, 'service', false),
  ('cleaning',    'Carpet or rug cleaning',            2, 'service', false),
  ('cleaning',    'Mattress cleaning',                 3, 'service', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261209000000_more_jobs_two')
ON CONFLICT (name) DO NOTHING;

COMMIT;
