-- =============================================================================
--  AFTER LAUNCH (phase 7)
--
--  Run after 20261022000000_money_and_trust.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - the DEMAND REPORT: which jobs nobody offered on, which trades and
--     sectors have nobody to send, and which sectors Pechkas does not serve
--     yet are being asked for. A customer outside the live sectors can now
--     say "I am in G-9" instead of simply leaving;
--   - FRAUD FLAGS: patterns worth a look — a technician whose jobs keep
--     ending in a refused new price, or getting cancelled after he was
--     chosen; a customer who cancels again and again. FLAGS ONLY. Nothing
--     here suspends, blocks or charges anybody: the owner looks, writes a
--     note, and decides. The limits are starting guesses, kept as settings;
--   - ASK AGAIN: a customer can ask for a technician she has used before.
--     The job goes to him alone for `prefer_minutes`, then to everyone. He
--     may pass, and she may let everyone see it sooner;
--   - the REPEAT FEE: when a customer has had a job done by the same
--     technician before, Pechkas takes 7% of the labour instead of 10%.
--     Fixed on the job when it is done, like the rest of the money.
-- =============================================================================

BEGIN;


-- --- Numbers the owner chose -----------------------------------------------------------
--
-- The flag limits are guesses made before the app had any customers. Change
-- them here, in a later migration, once real jobs show what is normal.

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('repeat_commission_bps', 700, 'basis_points',
     'Pechkas'' share of the labour when the customer has had a job done by the same technician before. 700 = 7%.'),
  ('prefer_minutes', 10, 'minutes',
     'How long a job a customer asked a particular technician for is his alone, before every technician can see it.'),
  ('flag_days', 60, 'days',
     'How far back the fraud flags look.'),
  ('flag_min_jobs', 3, 'count',
     'Finished jobs a technician needs before a share of them (refused prices, new prices) can flag him.'),
  ('flag_stopped_bps', 3000, 'basis_points',
     'Flag a technician when this share of his finished jobs ended with the customer refusing a new price. 3000 = 30%.'),
  ('flag_raised_bps', 5000, 'basis_points',
     'Flag a technician when he asked for a new price on this share of his finished jobs. 5000 = 50%.'),
  ('flag_parts_bps', 6000, 'basis_points',
     'A job counts as parts-heavy when parts were at least this share of the price. 6000 = 60%.'),
  ('flag_parts_jobs', 2, 'count',
     'Flag a technician with this many parts-heavy jobs. Parts lower Pechkas'' fee.'),
  ('flag_code_wrong', 5, 'count',
     'Flag a technician when this many wrong start codes were typed on his jobs.'),
  ('flag_cancelled', 3, 'count',
     'Flag a technician when this many jobs were cancelled after he was chosen.'),
  ('flag_problems', 2, 'count',
     'Flag somebody when the other side reported this many problems or guarantee claims about them.'),
  ('flag_low_stars', 3, 'count',
     'Flag somebody with this many ratings of one or two stars.'),
  ('flag_same_pair', 4, 'count',
     'Flag a technician who did this many jobs for one customer.'),
  ('flag_customer_cancels', 5, 'count',
     'Flag a customer who cancelled this many jobs.')
ON CONFLICT (key) DO NOTHING;


-- --- The repeat fee ---------------------------------------------------------------------

-- What share was taken, fixed on the job with the commission itself.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS commission_bps integer
  CHECK (commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000);

/**
 * 10%, or 7% when this customer has had a job DONE by this technician
 * before. A done job never becomes undone, so the rate shown when he offers
 * can only stay the same or go down by the time he finishes — never up.
 */
CREATE OR REPLACE FUNCTION public.commission_rate(p_customer uuid, p_pro uuid, p_job uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN EXISTS (
           SELECT 1 FROM public.jobs d
           WHERE d.customer_id = p_customer AND d.pro_id = p_pro AND d.status = 'done'
             AND d.id IS DISTINCT FROM p_job)
         THEN public.setting('repeat_commission_bps')
         ELSE public.setting('commission_bps') END;
$$;

/** A share of the labour, rounded DOWN, as commission_on() and packages/shared do. */
CREATE OR REPLACE FUNCTION public.commission_at(p_labour bigint, p_bps bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (greatest(p_labour, 0) * p_bps) / 10000;
$$;

/** The same finish as before; the share is now 7% for a returning customer. */
CREATE OR REPLACE FUNCTION public.finish_work(p_job uuid, p_photos jsonb, p_parts_paisa bigint DEFAULT 0, p_receipt text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_problem text;
  v_parts   bigint := coalesce(p_parts_paisa, 0);
  v_bps     bigint;
  v_comm    bigint;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'working' THEN
    RETURN public.refuse('Start the job first.', 'stage');
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_changes WHERE job_id = p_job AND status = 'pending') THEN
    RETURN public.refuse('The customer has not answered the new price yet.', 'stage');
  END IF;
  IF v_parts < 0 OR v_parts % 100 <> 0 THEN
    RETURN public.refuse('Write what the parts cost in whole rupees.', 'parts');
  END IF;
  IF v_parts >= v_job.agreed_paisa THEN
    RETURN public.refuse('Parts cannot be the whole price. Some of it is your work.', 'parts');
  END IF;
  IF v_parts > 0 THEN
    v_problem := public.own_uploads(jsonb_build_array(p_receipt), 1);
    IF v_problem IS NOT NULL THEN
      RETURN public.refuse('Take a photo of the shop receipt for the parts.', 'receipt');
    END IF;
  ELSIF p_receipt IS NOT NULL THEN
    RETURN public.refuse('Write what the parts cost, or leave out the receipt.', 'parts');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;
  IF p_receipt IS NOT NULL AND p_photos ? p_receipt THEN
    RETURN public.refuse('Use a separate photo for the receipt.', 'receipt');
  END IF;

  v_bps := public.commission_rate(v_job.customer_id, v_job.pro_id, p_job);
  v_comm := public.commission_at(v_job.agreed_paisa - v_parts, v_bps);
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'after', x FROM jsonb_array_elements_text(p_photos) AS x;
  IF p_receipt IS NOT NULL THEN
    INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'receipt', p_receipt);
  END IF;
  UPDATE public.jobs
  SET status = 'done', finished_at = now(), collect_paisa = agreed_paisa,
      parts_paisa = v_parts, commission_paisa = v_comm, commission_bps = v_bps, updated_at = now()
  WHERE id = p_job;
  RETURN jsonb_build_object('ok', true, 'collect_paisa', v_job.agreed_paisa, 'parts_paisa', v_parts,
                            'commission_bps', v_bps, 'commission_paisa', v_comm,
                            'keeps_paisa', v_job.agreed_paisa - v_comm);
END;
$$;


-- --- Ask again ---------------------------------------------------------------------------

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS preferred_pro_id uuid REFERENCES public.pros(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS preferred_until timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS preferred_released_at timestamptz;
CREATE INDEX IF NOT EXISTS jobs_preferred ON public.jobs (preferred_until)
  WHERE preferred_pro_id IS NOT NULL AND preferred_released_at IS NULL;

-- "Ask Bilal again", tapped on a finished job: remembered until her next
-- post in that trade, for an hour at most. One at a time.
CREATE TABLE IF NOT EXISTS public.asked_for (
  customer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade       text NOT NULL REFERENCES public.trades(slug),
  from_job    uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  asked_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asked_for ENABLE ROW LEVEL SECURITY;

/**
 * The customer asks for the technician who did one of her finished jobs.
 * Her next job in that trade, within the hour, goes to him first.
 */
CREATE OR REPLACE FUNCTION public.ask_again(p_from_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pro public.pros%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_from_job AND customer_id = auth.uid();
  IF v_job.id IS NULL OR v_job.status <> 'done' OR v_job.pro_id IS NULL THEN
    RETURN public.refuse('You can ask again for somebody who finished a job for you.');
  END IF;
  SELECT * INTO v_pro FROM public.pros WHERE id = v_job.pro_id;
  IF v_pro.status IS DISTINCT FROM 'approved' THEN
    RETURN public.refuse('He is not working with Pechkas at the moment. Your job will go to every checked technician.');
  END IF;
  INSERT INTO public.asked_for (customer_id, pro_id, trade, from_job, asked_at)
  VALUES (auth.uid(), v_pro.id, v_job.trade, v_job.id, now())
  ON CONFLICT (customer_id) DO UPDATE SET
    pro_id = EXCLUDED.pro_id, trade = EXCLUDED.trade, from_job = EXCLUDED.from_job, asked_at = now();
  RETURN jsonb_build_object('ok', true,
    'first_name', split_part(v_pro.full_name, ' ', 1),
    'online', v_pro.online,
    'minutes', public.setting('prefer_minutes'));
END;
$$;

/** "Ask everyone instead." */
CREATE OR REPLACE FUNCTION public.forget_ask_again()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.asked_for WHERE customer_id = auth.uid();
  SELECT jsonb_build_object('ok', true);
$$;

/**
 * When the job is written: if she asked for somebody, in this trade, within
 * the hour, and he can take it right now — approved, online, the trade and
 * sector his, not over the credit limit — the job is his alone for a few
 * minutes. If he cannot, it goes to everyone at once: making her wait for a
 * man who is not working would help nobody.
 */
CREATE OR REPLACE FUNCTION public.job_preferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ask public.asked_for%ROWTYPE;
BEGIN
  DELETE FROM public.asked_for
  WHERE customer_id = NEW.customer_id AND trade = NEW.trade
  RETURNING * INTO v_ask;
  NEW.preferred_pro_id := NULL;
  NEW.preferred_until := NULL;
  NEW.preferred_released_at := NULL;
  IF v_ask.pro_id IS NULL OR v_ask.asked_at < now() - interval '1 hour' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pros r
             WHERE r.id = v_ask.pro_id AND r.status = 'approved' AND r.online AND r.id <> NEW.customer_id
               AND NEW.trade = ANY (r.trades) AND NEW.sector = ANY (r.sectors)
               AND public.pro_owed(r.id) <= public.setting('credit_limit_paisa')) THEN
    NEW.preferred_pro_id := v_ask.pro_id;
    NEW.preferred_until := now() + make_interval(mins => public.setting('prefer_minutes')::integer);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_preferred ON public.jobs;
CREATE TRIGGER job_preferred BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_preferred();

/**
 * The one rule for who may see a job, now with "his alone for a few
 * minutes": while a job is held for the technician she asked for, nobody
 * else's feed, offer or files can reach it. When the time is up it is
 * everybody's, whether or not the clock below has run yet.
 */
CREATE OR REPLACE FUNCTION public.pro_may_see_as(p_job uuid, p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.pros r ON r.id = p_pro
    WHERE j.id = p_job
      AND r.status = 'approved'
      AND (
        (j.status = 'open' AND j.trade = ANY (r.trades) AND j.sector = ANY (r.sectors)
         AND (j.preferred_pro_id IS NULL OR j.preferred_pro_id = r.id OR j.preferred_until <= now()))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
$$;

/** Tells every online technician who may now see the job, except one. */
CREATE OR REPLACE FUNCTION public.announce_job(p_job public.jobs, p_except uuid)
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
      AND r.id IS DISTINCT FROM p_except
      AND public.pro_may_see_as(p_job.id, r.id)
    ORDER BY r.last_seen_at DESC NULLS LAST
    LIMIT 100
  LOOP
    PERFORM public.tell(v_pro, 'new_job', p_job.id, '/pro', v_vars);
  END LOOP;
END;
$$;

/** A new job: to the man she asked for, alone; or to everyone. */
CREATE OR REPLACE FUNCTION public.on_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.preferred_pro_id IS NOT NULL AND NEW.preferred_until > now() THEN
    PERFORM public.log_job(NEW.id, 'asked_first', jsonb_build_object('pro_id', NEW.preferred_pro_id));
    PERFORM public.tell(NEW.preferred_pro_id, 'asked_again', NEW.id, '/pro',
      public.job_vars(NEW) || jsonb_build_object('price', public.rs(NEW.offered_paisa),
                                                 'minutes', public.setting('prefer_minutes')));
  ELSE
    PERFORM public.announce_job(NEW, NULL);
  END IF;
  RETURN NULL;
END;
$$;

/**
 * Opens a held job to everyone, once, and tells them. Whoever calls it —
 * the clock, the customer, or the technician passing — it happens one time:
 * the row is marked in the same statement that finds it.
 */
CREATE OR REPLACE FUNCTION public.release_job(p_job uuid, p_why text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  UPDATE public.jobs
  SET preferred_until = least(preferred_until, now()), preferred_released_at = now()
  WHERE id = p_job AND status = 'open' AND preferred_pro_id IS NOT NULL AND preferred_released_at IS NULL
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public.log_job(p_job, 'opened_to_all', jsonb_build_object('why', p_why));
  PERFORM public.announce_job(v_job, v_job.preferred_pro_id);
  RETURN true;
END;
$$;

/** Run every minute: held jobs whose time is up go to everyone. */
CREATE OR REPLACE FUNCTION public.release_preferred()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.jobs
    WHERE preferred_pro_id IS NOT NULL AND preferred_released_at IS NULL
      AND preferred_until <= now() AND status = 'open'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.release_job(v_id, 'time') THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

/** The customer: "Ask everyone now." */
CREATE OR REPLACE FUNCTION public.release_now(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job AND customer_id = auth.uid()) THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  PERFORM public.release_job(p_job, 'customer');
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The technician she asked for cannot come: it goes to everyone now, and she is told. */
CREATE OR REPLACE FUNCTION public.pass_asked(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs
  WHERE id = p_job AND preferred_pro_id = auth.uid() AND status = 'open' AND preferred_released_at IS NULL;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer waiting for you.');
  END IF;
  UPDATE public.offers SET status = 'withdrawn', updated_at = now()
  WHERE job_id = p_job AND pro_id = auth.uid() AND status = 'pending';
  IF public.release_job(p_job, 'pro') THEN
    PERFORM public.tell(v_job.customer_id, 'pref_passed', p_job, '/jobs',
      public.job_vars(v_job) || jsonb_build_object(
        'pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = auth.uid())));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- pg_cron runs release_preferred() every minute, as it does alert_needs_you().
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-release-preferred', '* * * * *', 'SELECT public.release_preferred()');
END
$$;


-- --- What each side sees ----------------------------------------------------------------------

/** The feed, now saying which jobs were asked for him, and his share on each. */
CREATE OR REPLACE FUNCTION public.pro_feed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_online boolean;
  v_owed   bigint;
BEGIN
  SELECT online INTO v_online FROM public.pros WHERE id = auth.uid() AND status = 'approved';
  IF v_online IS NULL THEN
    RETURN jsonb_build_object('approved', false, 'online', false, 'jobs', '[]'::jsonb);
  END IF;
  UPDATE public.pros SET last_seen_at = now() WHERE id = auth.uid();
  v_owed := public.pro_owed(auth.uid());

  RETURN jsonb_build_object(
    'approved', true,
    'online', v_online,
    'commission_bps', public.setting('commission_bps'),
    'repeat_commission_bps', public.setting('repeat_commission_bps'),
    'min_offer_paisa', public.setting('min_offer_paisa'),
    'max_counter_bps', public.setting('max_counter_bps'),
    'owed_paisa', v_owed,
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'blocked', v_owed > public.setting('credit_limit_paisa'),
    'jobs', CASE WHEN NOT v_online THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'description', j.description, 'offered_paisa', j.offered_paisa,
          'list_paisa', t.list_paisa, 'when_kind', j.when_kind, 'when_part', j.when_part,
          'sector', j.sector, 'power', j.power, 'parts', j.parts,
          'customer_first_name', p.first_name, 'created_at', j.created_at,
          'asked_you', coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false),
          'asked_until', CASE WHEN j.preferred_pro_id = auth.uid() AND j.preferred_until > now() THEN j.preferred_until END,
          'repeat', public.commission_rate(j.customer_id, auth.uid(), j.id) <> public.setting('commission_bps'),
          'commission_bps', public.commission_rate(j.customer_id, auth.uid(), j.id),
          'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                             FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'eta_minutes', o.eta_minutes,
                                                 'note', o.note, 'status', o.status, 'expires_at', o.expires_at,
                                                 'live', o.status = 'pending' AND o.expires_at > now())
                       FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = auth.uid())
        ) ORDER BY coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false) DESC, j.created_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.job_types t ON t.id = j.job_type_id
      WHERE j.status = 'open'
        AND j.created_at > now() - interval '48 hours'
        AND j.customer_id <> auth.uid()
        AND public.pro_may_see(j.id)
    ), '[]'::jsonb) END
  );
END;
$$;

/** His jobs under way, now with his share on each: 7% for a returning customer. */
CREATE OR REPLACE FUNCTION public.pro_my_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'description', j.description,
      'agreed_paisa', j.agreed_paisa,
      'commission_bps', c.bps,
      'repeat', c.bps <> public.setting('commission_bps'),
      'keeps_paisa', j.agreed_paisa - public.commission_at(j.agreed_paisa, c.bps),
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'lat', j.lat, 'lng', j.lng, 'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'customer_first_name', p.first_name, 'customer_phone', u.phone,
      'assigned_at', j.assigned_at,
      'stage', j.stage,
      'code_locked', j.code_locked_at IS NOT NULL,
      'code_tries_left', greatest(public.setting('code_tries') - j.code_tries, 0),
      'change', public.pending_change(j.id),
      'visit_fee_paisa', public.visit_fee(j.id),
      'photos', public.photos_of(j.id),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

/** The customer's jobs, now saying who a job was asked for, and whom she can ask again. */
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
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
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
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', u.phone, 'years', r.years)
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
                       AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = j.pro_id AND r.status = 'approved'),
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
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/** The technician's money, now also saying the returning-customer share. */
CREATE OR REPLACE FUNCTION public.pro_money()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_owed  bigint;
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'why', 'Only a technician has an account with Pechkas.');
  END IF;
  v_owed := public.pro_owed(v_me);
  RETURN jsonb_build_object(
    'ok', true,
    'owed_paisa', v_owed,
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'blocked', v_owed > public.setting('credit_limit_paisa'),
    'commission_bps', public.setting('commission_bps'),
    'repeat_commission_bps', public.setting('repeat_commission_bps'),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'month', (SELECT jsonb_build_object(
                'jobs', count(*),
                'collected_paisa', coalesce(sum(j.collect_paisa), 0),
                'parts_paisa', coalesce(sum(j.parts_paisa), 0),
                'commission_paisa', coalesce(sum(j.commission_paisa), 0))
              FROM public.jobs j
              WHERE j.pro_id = v_me AND j.status = 'done' AND j.finished_at >= v_month),
    'rating', public.pro_rating(v_me),
    'comments', coalesce((
      SELECT jsonb_agg(c ORDER BY c ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at,
                                  'ref', (SELECT ref FROM public.jobs WHERE id = x.job_id)) AS c
        FROM public.ratings x
        WHERE x.to_id = v_me AND x.side = 'customer' AND public.rating_revealed(x.job_id)
        ORDER BY x.created_at DESC LIMIT 5) s), '[]'::jsonb),
    'lines', coalesce((
      SELECT jsonb_agg(l ORDER BY l ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('kind', t.kind, 'ref', t.job_ref, 'amount_paisa', e.amount_paisa,
                                  'method', t.method, 'reference', t.reference, 'at', t.created_at) AS l
        FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id
        WHERE e.account = 'pro_owes' AND e.pro_id = v_me
        ORDER BY t.created_at DESC LIMIT 30) s), '[]'::jsonb)
  );
END;
$$;

/** One job's whole record for the office, now with the share taken and who it was asked for. */
CREATE OR REPLACE FUNCTION public.admin_job_detail(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor, 'what', e.what, 'detail', e.detail) ORDER BY e.id)
                        FROM public.job_events e WHERE e.job_id = p_job), '[]'::jsonb),
    'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('at', m.created_at,
                                   'from', CASE WHEN m.sender_id = j.customer_id THEN 'customer' WHEN m.sender_id = j.pro_id THEN 'pro' ELSE 'gone' END,
                                   'body', m.body) ORDER BY m.id)
                          FROM public.job_messages m WHERE m.job_id = p_job), '[]'::jsonb),
    'photos', public.photos_of(p_job),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('from_paisa', c.from_paisa, 'price_paisa', c.price_paisa, 'reason', c.reason,
                                  'photo', c.photo_path, 'status', c.status, 'at', c.created_at) ORDER BY c.created_at)
                         FROM public.job_changes c WHERE c.job_id = p_job), '[]'::jsonb),
    'money', jsonb_build_object('collect_paisa', j.collect_paisa, 'parts_paisa', j.parts_paisa,
                                'commission_paisa', j.commission_paisa, 'commission_bps', j.commission_bps),
    'asked_for', (SELECT r.full_name FROM public.pros r WHERE r.id = j.preferred_pro_id),
    'ratings', coalesce((SELECT jsonb_agg(jsonb_build_object('side', x.side, 'stars', x.stars, 'words', x.words, 'at', x.created_at))
                         FROM public.ratings x WHERE x.job_id = p_job), '[]'::jsonb),
    'problems', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'side', x.side, 'body', x.body, 'status', x.status,
                                  'office_note', x.office_note, 'mistake', x.mistake, 'at', x.created_at) ORDER BY x.created_at)
                          FROM public.problems x WHERE x.job_id = p_job), '[]'::jsonb)
  ) END
  FROM public.jobs j WHERE j.id = p_job;
$$;


-- --- Demand ----------------------------------------------------------------------------------

-- A customer outside the live sectors saying "I am here, and I need this".
-- One line per customer, sector and trade; asking again only moves the date.
CREATE TABLE IF NOT EXISTS public.sector_asks (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sector      text NOT NULL REFERENCES public.sectors(name),
  trade       text NOT NULL REFERENCES public.trades(slug),
  asked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, sector, trade)
);
ALTER TABLE public.sector_asks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sector_asks_sector ON public.sector_asks (sector, asked_at DESC);

/** "Pechkas is not in G-9 yet. Tell us you are there." Nothing is promised in return. */
CREATE OR REPLACE FUNCTION public.ask_for_sector(p_trade text, p_sector text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'customer') THEN
    RETURN public.refuse('Only a customer account can ask for this.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trades WHERE slug = p_trade) THEN
    RETURN public.refuse('Choose what kind of work it is.', 'trade');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector) THEN
    RETURN public.refuse('Choose your sector.', 'sector');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector AND live) THEN
    RETURN public.refuse('Pechkas already works in ' || p_sector || '. Post your job.', 'sector');
  END IF;
  IF (SELECT count(*) FROM public.sector_asks WHERE customer_id = auth.uid() AND asked_at > now() - interval '24 hours') >= 10 THEN
    RETURN public.refuse('Thank you, we have your request.');
  END IF;
  INSERT INTO public.sector_asks (customer_id, sector, trade) VALUES (auth.uid(), p_sector, p_trade)
  ON CONFLICT (customer_id, sector, trade) DO UPDATE SET asked_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The demand report, for the office. Over the last `p_days`:
 *  - each sector and trade where jobs were posted: how many, how many
 *    waited with no offer at all, how many the office placed by hand, how many
 *    were done, and how many approved technicians cover it;
 *  - live sectors and trades with NO approved technician at all;
 *  - sectors not served yet that customers asked for, with the trades and
 *    how many technicians already say they work there.
 * Every number is a count of real rows.
 */
CREATE OR REPLACE FUNCTION public.admin_demand(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'days', v_days,
    'served', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'nobody_offered')::integer DESC, (x ->> 'posted')::integer DESC, x ->> 'sector', x ->> 'trade')
      FROM (
        SELECT jsonb_build_object(
            'sector', j.sector, 'trade', j.trade, 'trade_name', t.name,
            'posted', count(*),
            -- No offer at all, and either the office had to place it or it
            -- waited `escalate_minutes` first. One cancelled a minute after
            -- posting tells us nothing about who was available.
            'nobody_offered', count(*) FILTER (
               WHERE NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id)
                 AND (j.assigned_by = 'office'
                      OR CASE WHEN j.status = 'open' THEN now() ELSE coalesce(j.assigned_at, j.updated_at) END - j.created_at
                         >= make_interval(mins => public.setting('escalate_minutes')::integer))),
            'by_hand', count(*) FILTER (WHERE j.assigned_by = 'office'),
            'done', count(*) FILTER (WHERE j.status = 'done'),
            'cancelled', count(*) FILTER (WHERE j.status = 'cancelled'),
            'pros', (SELECT count(*) FROM public.pros r WHERE r.status = 'approved' AND j.trade = ANY (r.trades) AND j.sector = ANY (r.sectors))
          ) AS x
        FROM public.jobs j JOIN public.trades t ON t.slug = j.trade
        WHERE j.created_at >= v_since
        GROUP BY j.sector, j.trade, t.name
      ) s), '[]'::jsonb),
    'uncovered', coalesce((
      SELECT jsonb_agg(jsonb_build_object('sector', s.name, 'trade', t.slug, 'trade_name', t.name) ORDER BY s.sort, t.sort)
      FROM public.sectors s CROSS JOIN public.trades t
      WHERE s.live
        AND NOT EXISTS (SELECT 1 FROM public.pros r WHERE r.status = 'approved' AND t.slug = ANY (r.trades) AND s.name = ANY (r.sectors))
    ), '[]'::jsonb),
    'asked', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'people')::integer DESC, x ->> 'sector')
      FROM (
        SELECT jsonb_build_object(
            'sector', a.sector,
            'people', count(DISTINCT a.customer_id),
            'last_at', max(a.asked_at),
            'trades', (SELECT jsonb_object_agg(b.trade_name, b.n) FROM (
                         SELECT t.name AS trade_name, count(*) AS n FROM public.sector_asks z JOIN public.trades t ON t.slug = z.trade
                         WHERE z.sector = a.sector AND z.asked_at >= v_since GROUP BY t.name) b),
            'pros', (SELECT count(*) FROM public.pros r WHERE r.status = 'approved' AND a.sector = ANY (r.sectors))
          ) AS x
        FROM public.sector_asks a
        WHERE a.asked_at >= v_since
        GROUP BY a.sector
      ) s), '[]'::jsonb)
  );
END;
$$;


-- --- Fraud flags -----------------------------------------------------------------------------
--
-- Patterns, not verdicts. A flag means "worth a look", nothing more: every
-- one of them also happens to honest people. Nothing in this section
-- changes anybody's account. The owner reads, rings, writes a note, and —
-- if he decides to — suspends somebody by hand in Technicians.

CREATE TABLE IF NOT EXISTS public.flag_notes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  side       text NOT NULL CHECK (side IN ('pro', 'customer')),
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note       text NOT NULL CHECK (length(note) BETWEEN 3 AND 500),
  -- "I looked and it is fine": the person sinks to the bottom of the list.
  checked    boolean NOT NULL DEFAULT false,
  by_name    text,
  at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flag_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS flag_notes_subject ON public.flag_notes (subject_id, at DESC);

/** One flag, if its count reaches its limit: {kind, n, of?, limit}. NULL otherwise. */
CREATE OR REPLACE FUNCTION public.flag_if(p_kind text, p_n bigint, p_limit bigint, p_of bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_n > 0 AND p_n >= p_limit
              THEN jsonb_strip_nulls(jsonb_build_object('kind', p_kind, 'n', p_n, 'of', p_of, 'limit', p_limit)) END;
$$;

/**
 * Everybody with at least one flag over the last `flag_days`, with what
 * tripped it, the notes written about them, and the limits in force.
 */
CREATE OR REPLACE FUNCTION public.admin_flags()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => public.setting('flag_days')::integer);
  v_min   bigint := public.setting('flag_min_jobs');
  v_rows  jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;

  WITH pro AS (
    SELECT r.id, r.full_name AS name, u.phone, r.status,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since) AS finished,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'stopped' AND j.finished_at >= v_since) AS stopped,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since
         AND EXISTS (SELECT 1 FROM public.job_changes c WHERE c.job_id = j.id)) AS raised,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         AND j.parts_paisa * 10000 >= j.collect_paisa * public.setting('flag_parts_bps')) AS parts,
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'code_wrong' AND e.at >= v_since) AS codes,
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'cancelled' AND e.at >= v_since) AS cancelled,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.pro_id = r.id AND x.side = 'customer' AND x.kind IN ('problem', 'guarantee') AND x.created_at >= v_since) AS complaints,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = r.id AND x.side = 'customer' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      (SELECT coalesce(max(n), 0) FROM (
         SELECT count(*) AS n FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         GROUP BY j.customer_id) g) AS same_customer
    FROM public.pros r LEFT JOIN auth.users u ON u.id = r.id
    WHERE r.status IN ('approved', 'suspended')
  ),
  pro_flags AS (
    SELECT p.*, array_remove(ARRAY[
        CASE WHEN p.finished >= v_min AND p.stopped * 10000 >= p.finished * public.setting('flag_stopped_bps')
             THEN public.flag_if('stopped', p.stopped, 1, p.finished) END,
        CASE WHEN p.finished >= v_min AND p.raised * 10000 >= p.finished * public.setting('flag_raised_bps')
             THEN public.flag_if('raised', p.raised, 1, p.finished) END,
        public.flag_if('parts', p.parts, public.setting('flag_parts_jobs')),
        public.flag_if('codes', p.codes, public.setting('flag_code_wrong')),
        public.flag_if('cancelled', p.cancelled, public.setting('flag_cancelled')),
        public.flag_if('complaints', p.complaints, public.setting('flag_problems')),
        public.flag_if('low_stars', p.low_stars, public.setting('flag_low_stars')),
        public.flag_if('same_customer', p.same_customer, public.setting('flag_same_pair'))
      ], NULL) AS flags
    FROM pro p
  ),
  cust AS (
    SELECT c.id, c.first_name AS name, u.phone,
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.cancelled_by = 'customer' AND j.updated_at >= v_since) AS cancels,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.side = 'pro' AND x.kind = 'problem' AND x.created_at >= v_since) AS reports,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = c.id AND x.side = 'pro' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars
    FROM public.profiles c LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.role = 'customer'
  ),
  cust_flags AS (
    SELECT c.*, array_remove(ARRAY[
        public.flag_if('cancels', c.cancels, public.setting('flag_customer_cancels')),
        public.flag_if('reports', c.reports, public.setting('flag_problems')),
        public.flag_if('low_stars', c.low_stars, public.setting('flag_low_stars'))
      ], NULL) AS flags
    FROM cust c
  ),
  everyone AS (
    SELECT 'pro' AS side, id, name, phone, status, flags FROM pro_flags WHERE cardinality(flags) > 0
    UNION ALL
    SELECT 'customer', id, name, phone, NULL, flags FROM cust_flags WHERE cardinality(flags) > 0
  )
  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'checked_at') IS NOT NULL, jsonb_array_length(x -> 'flags') DESC, x ->> 'name'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
        'side', e.side, 'id', e.id, 'name', e.name, 'phone', e.phone, 'status', e.status,
        'flags', to_jsonb(e.flags),
        'checked_at', (SELECT max(n.at) FROM public.flag_notes n WHERE n.subject_id = e.id AND n.checked),
        'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('note', n.note, 'checked', n.checked, 'by', n.by_name, 'at', n.at) ORDER BY n.at DESC)
                           FROM public.flag_notes n WHERE n.subject_id = e.id), '[]'::jsonb)
      ) AS x
    FROM everyone e
  ) s;

  RETURN jsonb_build_object(
    'days', public.setting('flag_days'),
    'limits', (SELECT jsonb_object_agg(s.key, s.value) FROM public.settings s WHERE s.key LIKE 'flag\_%'),
    'people', v_rows
  );
END;
$$;

/** The owner's note on a flagged person. "Checked" moves them to the bottom; it changes nothing else. */
CREATE OR REPLACE FUNCTION public.admin_note_flag(p_side text, p_id uuid, p_note text, p_checked boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_side NOT IN ('pro', 'customer')
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id AND role = p_side) THEN
    RETURN public.refuse('There is nobody like that.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 3 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found, in a few words.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  INSERT INTO public.flag_notes (side, subject_id, note, checked, by_name)
  VALUES (p_side, p_id, v_note, coalesce(p_checked, false), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The words for the new notifications ---------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('asked_again.title', 260, 'Customer ne dobara aap ko bulaya: {trade} · {sector}', 'Asked for you again: {trade} · {sector}', 'technician'),
  ('asked_again.body',  261, '{customer} · {price} · {when}. {minutes} minute tak yeh kaam sirf aap ke liye hai, phir sab ko jayega.',
                             '{customer} · {price} · {when}. For {minutes} minutes this job is yours alone; then everyone sees it.', 'technician'),
  ('pref_passed.title', 270, NULL, '{pro} cannot take {ref}', 'customer'),
  ('pref_passed.body',  271, NULL, 'Your job has gone to every checked technician for {trade} in {sector}.', 'customer')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;


-- --- Who may call what ------------------------------------------------------------------------
--
-- commission_rate(), commission_at(), job_preferred(), announce_job(),
-- release_job(), release_preferred() and flag_if() are granted to nobody.

GRANT EXECUTE ON FUNCTION
  public.ask_again(uuid),
  public.forget_ask_again(),
  public.release_now(uuid),
  public.pass_asked(uuid),
  public.ask_for_sector(text, text),
  public.admin_demand(integer),
  public.admin_flags(),
  public.admin_note_flag(text, uuid, text, boolean)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261023000000_after_launch')
ON CONFLICT (name) DO NOTHING;

COMMIT;
