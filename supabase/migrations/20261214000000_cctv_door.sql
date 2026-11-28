-- CCTV and door security (the owner's decision A131, 28 November 2026),
-- after going through the same company's CCTV list: a check-up and cleaning
-- (a service, 7 days), a video door phone fitted and a smart door lock fitted
-- (30 days), none risky; and the kind of work renamed from CCTV to "CCTV and
-- door security", so somebody looking for a lock finds it. Access control for
-- staff (offices) and smart home automation (no clear size, so no fair price
-- and nothing she can check in one visit) stay out. Prices blank (NULL) on
-- the owner's word.
--
-- Safe to run twice.

BEGIN;

UPDATE public.trades SET name = 'CCTV and door security' WHERE slug = 'cctv' AND name <> 'CCTV and door security';

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, v.risky
FROM (VALUES
  ('cctv', 'CCTV check-up and cleaning', 1, 'service', false),
  ('cctv', 'Video door phone fitting',   2, 'repair',  false),
  ('cctv', 'Smart door lock fitting',    3, 'repair',  false)
) AS v(trade, name, n, guarantee, risky)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261214000000_cctv_door')
ON CONFLICT (name) DO NOTHING;

COMMIT;
