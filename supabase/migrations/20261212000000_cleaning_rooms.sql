-- Cleaning: two room jobs, and the kind of work renamed (the owner's
-- decision A129, 28 November 2026), after going through the same company's
-- cleaning list. Bathroom deep cleaning and kitchen deep cleaning, one room
-- each, one cleaner or one with a helper, in one visit: services (7 days),
-- not risky. "Sofa and carpet cleaning" becomes "Cleaning". Whole-house,
-- office and post-construction cleaning stay out: a team, priced by size.
-- Prices blank (NULL) on the owner's word.
--
-- Safe to run twice.

BEGIN;

UPDATE public.trades SET name = 'Cleaning' WHERE slug = 'cleaning' AND name <> 'Cleaning';

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('cleaning', 'Bathroom deep cleaning', 1, 'service', false),
  ('cleaning', 'Kitchen deep cleaning',  2, 'service', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261212000000_cleaning_rooms')
ON CONFLICT (name) DO NOTHING;

COMMIT;
