-- Three more Painting jobs (the owner's decision A130, 28 November 2026),
-- after going through the same company's painting list: a feature wall
-- texture (one wall), a door or furniture polish, and a gate or grill
-- painted. One painter, one visit, a result she sees the same day: repairs
-- (30 days), not risky. Outside walls at height (exterior painting) and roof
-- waterproofing stay out: ladders or scaffolding and a team over days, and a
-- coating nobody can check until it rains. Prices blank (NULL) on the
-- owner's word.
--
-- Safe to run twice: every row is added only if it is not there yet.

BEGIN;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('painting', 'Feature wall texture (one wall)', 1, 'repair', false),
  ('painting', 'Door or furniture polish',        2, 'repair', false),
  ('painting', 'Gate or grill painting',          3, 'repair', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261213000000_painting_more')
ON CONFLICT (name) DO NOTHING;

COMMIT;
