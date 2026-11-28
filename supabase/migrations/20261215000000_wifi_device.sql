-- One more Wi-Fi job (the owner's decision A132, 28 November 2026), after
-- going through the same company's networking list, the rest of which
-- Pechkas already has: a printer, TV or other device brought onto the home
-- Wi-Fi. One technician, one visit, a result she checks before he leaves:
-- 30 days, not risky. Price blank (NULL) on the owner's word. "Internet
-- keeps dropping" now says it covers slow internet too (its line in
-- packages/shared/src/work.ts, not here).
--
-- Safe to run twice.

BEGIN;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('wifi', 'Printer, TV or other device not connecting', 1, 'repair', false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261215000000_wifi_device')
ON CONFLICT (name) DO NOTHING;

COMMIT;
