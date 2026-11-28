-- Three new kinds of work for the men at Mazdoor Chowk (the owner's
-- decision A134, 28 November 2026): Masonry and tiles (the raj mistri),
-- Garden (the mali) and Welding. One man, one visit, a result she can check.
--
-- Masonry: repairs, 30 days, not risky. Building new walls or rooms, roof
-- work and structural cracks (beams, columns, ceilings: an engineer's work)
-- stay out.
-- Garden: services, 7 days, not risky. Climbing or cutting down trees and
-- spraying pesticides stay out.
-- Welding: repairs, 30 days, and on the owner's word NOT marked risky for
-- now, "Something else" included: risky work needs another welder to check a
-- new one, and in a brand-new trade nobody could ever start. The safety
-- rules for welding come later (D43). Making a new gate or grill (workshop
-- work) stays out.
--
-- Prices blank (NULL) on the owner's word. Safe to run twice.

BEGIN;

INSERT INTO public.trades (slug, name, sort)
SELECT v.slug, v.name, (SELECT coalesce(max(sort), 0) FROM public.trades) + v.n
FROM (VALUES ('mason', 'Masonry and tiles', 1), ('garden', 'Garden', 2), ('welding', 'Welding', 3)) AS v(slug, name, n)
WHERE NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.slug = v.slug);

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT v.trade, v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = v.trade) + v.n,
       v.guarantee, false
FROM (VALUES
  ('mason',   'Broken floor tile replaced',                         1, 'repair'),
  ('mason',   'Broken wall tile replaced',                          2, 'repair'),
  ('mason',   'Loose or hollow tile fixed',                         3, 'repair'),
  ('mason',   'Tile gaps re-filled (grout)',                        4, 'repair'),
  ('mason',   'Fallen or broken plaster repaired',                  5, 'repair'),
  ('mason',   'Hole in a wall closed (after a pipe or wire)',       6, 'repair'),
  ('mason',   'Small brick wall repair',                            7, 'repair'),
  ('mason',   'Broken step or floor patch repaired',                8, 'repair'),
  ('mason',   'Marble or granite counter chip repaired',            9, 'repair'),
  ('garden',  'Grass cutting',                                      1, 'service'),
  ('garden',  'Weeding and lawn clean-up',                          2, 'service'),
  ('garden',  'New grass laid (a small lawn)',                      3, 'service'),
  ('garden',  'Hedge or bush trimming',                             4, 'service'),
  ('garden',  'Small tree pruned from the ground',                  5, 'service'),
  ('garden',  'Plants potted or re-potted',                         6, 'service'),
  ('garden',  'New plants planted',                                 7, 'service'),
  ('garden',  'Flower bed or kitchen garden prepared',              8, 'service'),
  ('welding', 'Gate hinge or latch welded',                         1, 'repair'),
  ('welding', 'Window grill repaired',                              2, 'repair'),
  ('welding', 'Railing or stair rail repaired',                     3, 'repair'),
  ('welding', 'Broken metal furniture welded (chair, bed frame)',   4, 'repair'),
  ('welding', 'Water tank stand repaired (on the ground)',          5, 'repair')
) AS v(trade, name, n, guarantee)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = v.trade AND j.name = v.name);

INSERT INTO public.applied_migrations (name)
VALUES ('20261217000000_mason_garden_welding')
ON CONFLICT (name) DO NOTHING;

COMMIT;
