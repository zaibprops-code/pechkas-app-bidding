-- More jobs, and Water tank as a new kind of work (the owner's decision A125, 28 November 2026).
--
-- Seven small jobs inside the kinds of work that already exist, chosen because
-- the same technicians can do them in one visit, and one new kind of work,
-- Water tank, with one job: cleaning a tank on the roof. Underground tanks are
-- left out on purpose (the owner's choice): a man inside one can collapse from
-- bad air, and risky work in a brand-new trade could not be opened to anybody.
--
-- Every price is left blank (NULL) on the owner's word: the screens say "Price
-- after a look" and the lowest offer is min_offer_paisa, as for any job with no
-- usual price (price_floor()). Setting a price later is a migration to job_types.
--
-- The guarantee: a service (7 days) for the filter change and the tank cleaning,
-- which wear off by themselves; a repair or fitting (30 days) for everything else.
-- The water dispenser is risky, like the fridge: it can hold cooling gas.
--
-- Safe to run twice: every row is added only if it is not there yet.

BEGIN;

INSERT INTO public.trades (slug, name, sort)
VALUES ('tank', 'Water tank', (SELECT coalesce(max(sort), 0) + 1 FROM public.trades))
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('plumber',     'Water purifier (RO) filter change',      1, 'service', false),
  ('plumber',     'Silicone sealing (bath, basin or sink)', 2, 'repair',  false),
  ('plumber',     'Bathroom accessory fitting',             3, 'repair',  false),
  ('electrician', 'TV wall mounting',                       1, 'repair',  false),
  ('carpentry',   'Mirror, picture or frame hanging',       1, 'repair',  false),
  ('carpentry',   'Mosquito mesh (jaali) for a window or door', 2, 'repair', false),
  ('appliances',  'Water dispenser repair',                 1, 'repair',  true),
  ('tank',        'Overhead water tank cleaning',           1, 'service', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261208000000_more_jobs')
ON CONFLICT (name) DO NOTHING;

COMMIT;
