-- =============================================================================
--  When nobody offers: the customer decides, the job closes by itself
-- =============================================================================
--
--  The owner does not want the office ringing round for jobs nobody took.
--  The rule he chose, with the numbers he approved:
--
--    · After 20 minutes with no offer on a job for TODAY — 3 hours for a
--      later day, because technicians plan their days — the customer is
--      told once, and her job screen offers three things: raise her price
--      by Rs 200, Rs 500 or Rs 1,000 (the steps technicians use; the app
--      never suggests what the "right" price is, but says the usual Pechkas
--      price when hers is below it), choose another day, or keep waiting.
--    · A raise or a new day announces the job again to the technicians who
--      may see it, and starts the clock again. At most 3 raises a job, only
--      upwards, and only while no offer is waiting: once there is one, she
--      chooses.
--    · A job nobody took closes itself at 8pm on its day — no technician
--      can promise a time after that — as cancelled by "nobody", and she is
--      told plainly. Book again posts it for another day in one tap.
--    · The office's phone is no longer told about jobs without offers. The
--      admin panel's Demand page shows where that keeps happening, which is
--      where more technicians are needed.
--
--  Safe to run twice.

BEGIN;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS announced_at timestamptz;
UPDATE public.jobs SET announced_at = created_at WHERE announced_at IS NULL;
ALTER TABLE public.jobs ALTER COLUMN announced_at SET DEFAULT now();
ALTER TABLE public.jobs ALTER COLUMN announced_at SET NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS nudged_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS raises smallint NOT NULL DEFAULT 0;

-- A job that closed because nobody offered was cancelled by nobody.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.jobs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%cancelled_by%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_cancelled_by_check CHECK (cancelled_by IN ('customer', 'office', 'nobody'));

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('nudge_today_minutes', 20, 'minutes', 'How long a job for today waits with no offer before the customer is told she can raise her price or choose another day.'),
  ('nudge_later_minutes', 180, 'minutes', 'The same for a job on a later day, when technicians have more time to see it.'),
  ('max_raises', 3, 'count', 'How many times a customer may raise her price on one job.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('no_offers.title', 300, 'No offers yet on {ref}', 'No offers yet on {ref}', 'customer'),
  ('no_offers.body',  301, 'Your {trade} job has no offers yet. Open it to raise your price, choose another day, or keep waiting.',
                           'Your {trade} job has no offers yet. Open it to raise your price, choose another day, or keep waiting.', 'customer'),
  ('unclaimed.title', 302, 'No technician was free: {ref}', 'No technician was free: {ref}', 'customer'),
  ('unclaimed.body',  303, 'Your {trade} job closed without an offer. Open it and tap Book again to post it for another day.',
                           'Your {trade} job closed without an offer. Open it and tap Book again to post it for another day.', 'customer'),
  ('job_again.title', 304, '{trade} in {sector}: {price}', '{trade} in {sector}: {price}', 'technician'),
  ('job_again.body',  305, '{customer} · {price} · {when}. The price or the day has changed. Open the app to send your offer.',
                           '{customer} · {price} · {when}. The price or the day has changed. Open the app to send your offer.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;


-- --- Telling the technicians again --------------------------------------------------------

/** The same technicians a new job reaches (pro_may_see_as(), online), told the job has changed. */
CREATE OR REPLACE FUNCTION public.announce_again(p_job public.jobs)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vars jsonb := public.job_vars(p_job) || jsonb_build_object('price', public.rs(p_job.offered_paisa));
  v_pro  uuid;
BEGIN
  FOR v_pro IN
    SELECT r.id FROM public.pros r
    WHERE r.online
      AND r.id <> p_job.customer_id
      AND public.pro_may_see_as(p_job.id, r.id)
    ORDER BY r.last_seen_at DESC NULLS LAST
    LIMIT 100
  LOOP
    PERFORM public.tell(v_pro, 'job_again', p_job.id, '/pro', v_vars);
  END LOOP;
END;
$$;


-- --- The customer's three choices ---------------------------------------------------------

/** Raise her price by one of the three steps, while nobody has offered. Refusals name field 'raise'. */
CREATE OR REPLACE FUNCTION public.raise_price(p_job uuid, p_add_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'open' THEN
    RETURN public.refuse('This job is no longer waiting for offers.', 'raise');
  END IF;
  IF p_add_paisa IS NULL OR p_add_paisa NOT IN (20000, 50000, 100000) THEN
    RETURN public.refuse('Raise it by Rs 200, Rs 500 or Rs 1,000.', 'raise');
  END IF;
  IF EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = p_job AND o.status = 'pending' AND o.expires_at > now()) THEN
    RETURN public.refuse('A technician has already offered. Choose an offer, or wait for it to run out.', 'raise');
  END IF;
  IF v_job.raises >= public.setting('max_raises') THEN
    RETURN public.refuse('You have raised the price on this job ' || public.setting('max_raises') || ' times already. Choose another day, or keep waiting.', 'raise');
  END IF;
  IF v_job.offered_paisa + p_add_paisa > 50000000 THEN
    RETURN public.refuse('For work this size, call Pechkas first.', 'raise');
  END IF;

  UPDATE public.jobs
  SET offered_paisa = offered_paisa + p_add_paisa, raises = raises + 1,
      announced_at = now(), nudged_at = NULL, needs_you_told_at = NULL
  WHERE id = p_job
  RETURNING * INTO v_job;
  PERFORM public.log_job(p_job, 'price_raised', jsonb_build_object('to', v_job.offered_paisa, 'by', p_add_paisa));
  PERFORM public.announce_again(v_job);
  RETURN jsonb_build_object('ok', true, 'offered_paisa', v_job.offered_paisa,
                            'raises_left', greatest(public.setting('max_raises') - v_job.raises, 0));
END;
$$;

/** Another day for a job that has only a day, while nobody has offered. Refusals name field 'day'. */
CREATE OR REPLACE FUNCTION public.change_day(p_job uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'open' THEN
    RETURN public.refuse('This job is no longer waiting for offers.', 'day');
  END IF;
  IF v_job.when_kind = 'now' OR v_job.when_from IS NOT NULL OR v_job.when_part IS NOT NULL THEN
    RETURN public.refuse('Cancel this job and post it again for another day.', 'day');
  END IF;
  IF EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = p_job AND o.status = 'pending' AND o.expires_at > now()) THEN
    RETURN public.refuse('A technician has already offered. Choose an offer, or wait for it to run out.', 'day');
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 6 OR (p_date = v_today AND v_hour >= 20) THEN
    RETURN public.refuse('Choose a day in the coming week.', 'day');
  END IF;
  IF p_date = v_job.when_date THEN
    RETURN public.refuse('That is the day it is already for.', 'day');
  END IF;

  UPDATE public.jobs
  SET when_date = p_date,
      when_kind = CASE WHEN p_date = v_today THEN 'today' WHEN p_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END,
      announced_at = now(), nudged_at = NULL, needs_you_told_at = NULL
  WHERE id = p_job
  RETURNING * INTO v_job;
  PERFORM public.log_job(p_job, 'day_changed', jsonb_build_object('to', p_date));
  PERFORM public.announce_again(v_job);
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The clock ------------------------------------------------------------------------------

/**
 * Tells each customer, once, that nobody has offered: 20 minutes after the
 * job was announced for today (or wanted now), 3 hours for a later day.
 * Not while it is held for the one technician she asked for. Marked in the
 * statement that finds it, so it is said once whatever runs it.
 */
CREATE OR REPLACE FUNCTION public.nudge_no_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_n   integer := 0;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j SET nudged_at = now()
    WHERE j.status = 'open'
      AND j.nudged_at IS NULL
      AND (j.preferred_until IS NULL OR j.preferred_until <= now())
      AND j.announced_at <= now() - make_interval(mins => (CASE WHEN j.when_kind = 'now' OR j.when_date <= (now() AT TIME ZONE 'Asia/Karachi')::date
                                                                 THEN public.setting('nudge_today_minutes')
                                                                 ELSE public.setting('nudge_later_minutes') END)::integer)
      AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.updated_at >= j.announced_at)
    RETURNING j.*
  LOOP
    PERFORM public.tell(v_job.customer_id, 'no_offers', v_job.id, '/jobs', public.job_vars(v_job));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * Closes open jobs nobody took: at 8pm on their day (Pakistan's clock), or
 * a day after posting for a job wanted "now" by an older copy. The
 * customer is told; a technician whose offer had run out is not — he has
 * moved on.
 */
CREATE OR REPLACE FUNCTION public.close_unclaimed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_job   public.jobs%ROWTYPE;
  v_n     integer := 0;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j
    SET status = 'cancelled', cancelled_by = 'nobody', cancel_reason = 'No technician was free for this job.', updated_at = now()
    WHERE j.status = 'open'
      AND CASE WHEN j.when_kind = 'now' OR j.when_date IS NULL
               THEN j.created_at < now() - interval '24 hours'
               ELSE j.when_date < v_today OR (j.when_date = v_today AND v_hour >= 20) END
    RETURNING j.*
  LOOP
    PERFORM public.tell(v_job.customer_id, 'unclaimed', v_job.id, '/jobs', public.job_vars(v_job));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- The clock runs both every minute. Scheduling under the same name again
-- replaces it, so a rerun is harmless. And the office's phone is no longer
-- told about jobs without offers (the owner's choice): that job is removed.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-no-offers', '* * * * *', 'SELECT public.nudge_no_offers()');
  PERFORM cron.schedule('pechkas-close-unclaimed', '* * * * *', 'SELECT public.close_unclaimed()');
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pechkas-needs-you') THEN
    IF to_regprocedure('cron.unschedule(text)') IS NOT NULL THEN
      PERFORM cron.unschedule('pechkas-needs-you');
    ELSE
      DELETE FROM cron.job WHERE jobname = 'pechkas-needs-you';
    END IF;
  END IF;
END
$$;


-- --- What her job says ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
      'description', j.description, 'offered_paisa', j.offered_paisa,
      'when_kind', j.when_kind, 'when_part', j.when_part, 'when_date', j.when_date, 'when_from', j.when_from,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'job_type_id', j.job_type_id, 'lat', j.lat, 'lng', j.lng,
      'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'status', j.status, 'stage', j.stage, 'cancelled_by', j.cancelled_by, 'cancel_reason', j.cancel_reason,
      'created_at', j.created_at,
      'live_offers', (SELECT count(*) FROM public.offers o JOIN public.pros r ON r.id = o.pro_id
                      WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now() AND r.status = 'approved'),
      'agreed_paisa', j.agreed_paisa,
      'start_code', CASE WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived') THEN j.start_code END,
      'code_locked', j.code_locked_at IS NOT NULL,
      'pro', CASE
               WHEN j.status = 'assigned' THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', public.phone_of(u.id), 'years', r.years)
                 FROM public.pros r JOIN auth.users u ON u.id = r.id WHERE r.id = j.pro_id)
               WHEN j.status IN ('done', 'stopped') THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'years', r.years)
                 FROM public.pros r WHERE r.id = j.pro_id)
             END,
      'preferred', CASE WHEN j.status = 'open' AND j.preferred_pro_id IS NOT NULL AND j.preferred_until > now() THEN (
                     SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'until', j.preferred_until)
                     FROM public.pros r WHERE r.id = j.preferred_pro_id) END,
      -- Whom it was held for at all, so the screen can tell "he passed / time
      -- ran out" from "he was not working, so it was never held".
      'asked_for', (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.preferred_pro_id),
      'can_ask_again', j.status = 'done'
                       AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = j.pro_id AND r.status = 'approved')
                       AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'blocked', j.pro_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'can_block', j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled'),
      -- Only his first name, only for the block button: a cancelled job's
      -- card otherwise says nothing about the man who was going to come.
      'block_name', CASE WHEN j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled')
                         THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END,
      'change', CASE WHEN j.status = 'assigned' THEN public.pending_change(j.id) END,
      'visit_fee_paisa', CASE WHEN j.status = 'assigned' THEN public.visit_fee(j.id) END,
      'collect_paisa', j.collect_paisa,
      'parts_paisa', j.parts_paisa,
      'finished_at', j.finished_at,
      'photos', public.photos_of(j.id),
      'can_report', j.status IN ('done', 'stopped') AND j.problem_at IS NULL AND j.finished_at > now() - interval '24 hours',
      'problem_at', j.problem_at,
      'my_rating', (SELECT x.stars FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'can_rate', j.status IN ('done', 'stopped')
                  AND j.finished_at > now() - make_interval(days => public.setting('rating_days')::integer)
                  AND NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'guarantee_until', CASE WHEN j.status = 'done'
                              THEN j.finished_at + make_interval(days => public.setting('guarantee_days')::integer) END,
      'claim_open', EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open'),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) || jsonb_build_object(
      -- Nobody has offered yet (when_nobody_offers): what she may do about it.
      'list_paisa', (SELECT t.list_paisa FROM public.job_types t WHERE t.id = j.job_type_id),
      'nudged', j.status = 'open' AND j.nudged_at IS NOT NULL,
      'raises_left', greatest(public.setting('max_raises') - j.raises, 0),
      'can_raise', j.status = 'open' AND j.raises < public.setting('max_raises') AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()),
      'can_move', j.status = 'open' AND j.when_kind <> 'now' AND j.when_from IS NULL AND j.when_part IS NULL AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- announce_again(), nudge_no_offers() and close_unclaimed() are granted to
-- nobody: the clock and the functions above run them.

GRANT EXECUTE ON FUNCTION
  public.raise_price(uuid, bigint),
  public.change_day(uuid, date)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261104000000_when_nobody_offers')
ON CONFLICT (name) DO NOTHING;

COMMIT;
