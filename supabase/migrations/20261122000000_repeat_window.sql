-- =============================================================================
-- A105 (the owner, 22 November 2026, D18): the 7% repeat rate looks back
-- 12 months.
--
-- A customer and technician pay the repeat rate (7% instead of 10%) only when
-- they finished a job together in the 12 months before she chose him for this
-- one. Measured from the moment she chooses him, because that is when the
-- rate is fixed: the 7% he sees before she chooses can never turn into 10%
-- half-way through the job. On a job nobody has been chosen for yet (his
-- list of jobs), it is measured from now: "if she chose him now".
--
-- The 12 is locked, like the 10% and 7%: the technician agreement states it.
-- repeat_pair() is still the one test, so the rate, the "returning customer"
-- tag and every screen follow it together.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('repeat_window_months', 12, 'count', 'The repeat rate needs a job finished together in this many months before she chose him (A105). Locked: the technician agreement states it.')
ON CONFLICT (key) DO NOTHING;
-- Locked: never one the office may change.
DELETE FROM public.setting_limits WHERE key = 'repeat_window_months';

/**
 * A returning customer: a job done by this technician for this customer,
 * finished in the 12 months before she chose him for p_job (before now while
 * p_job is still open), and not p_job itself.
 */
CREATE OR REPLACE FUNCTION public.repeat_pair(p_customer uuid, p_pro uuid, p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH since AS (
    SELECT coalesce((SELECT j.assigned_at FROM public.jobs j
                     WHERE j.id = p_job AND j.status <> 'open' AND j.pro_id = p_pro), now())
           - make_interval(months => public.setting('repeat_window_months')::integer) AS t
  )
  SELECT EXISTS (SELECT 1 FROM public.jobs d, since
                 WHERE d.customer_id = p_customer AND d.pro_id = p_pro AND d.status = 'done'
                   AND d.id IS DISTINCT FROM p_job
                   AND d.finished_at >= since.t);
$$;

INSERT INTO public.applied_migrations (name)
VALUES ('20261122000000_repeat_window')
ON CONFLICT (name) DO NOTHING;

COMMIT;
