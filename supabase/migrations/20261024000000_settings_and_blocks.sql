-- =============================================================================
--  SETTINGS AND BLOCKING (phase 8)
--
--  Run after 20261023000000_after_launch.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - the SETTINGS SCREEN: the office changes the times, the limits, the
--     visit fee, the flag limits and which sectors take jobs, each within a
--     range written here, each change recorded with who and when. The MONEY
--     settings — commission, the repeat fee, the credit limit, the guarantee
--     reserve — and the 30-day guarantee, which the store pages and the terms
--     promise, are not on it: they change only by migration, on purpose;
--   - BLOCKING: after a job, a customer can stop a technician from ever
--     seeing her jobs again. He is not told. The office sees it, and two
--     blocks in the flag window are a flag.
-- =============================================================================

BEGIN;


-- --- Numbers ----------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('flag_blocked', 2, 'count',
     'Flag a technician blocked by this many customers.')
ON CONFLICT (key) DO NOTHING;


-- --- What the office may change, and how far -------------------------------------------
--
-- A setting with no line here cannot be changed from the admin panel at all.
-- Leaving one out is the lock: commission_bps, repeat_commission_bps,
-- credit_limit_paisa, reserve_bps and guarantee_days are left out on purpose.

CREATE TABLE IF NOT EXISTS public.setting_limits (
  key text PRIMARY KEY REFERENCES public.settings(key) ON DELETE CASCADE,
  lo  bigint NOT NULL CHECK (lo >= 0),
  hi  bigint NOT NULL,
  CHECK (lo <= hi)
);
ALTER TABLE public.setting_limits ENABLE ROW LEVEL SECURITY;

-- Anything left from an earlier run that is now locked goes.
DELETE FROM public.setting_limits
WHERE key IN ('commission_bps', 'repeat_commission_bps', 'credit_limit_paisa', 'reserve_bps', 'guarantee_days');

INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('offer_minutes',         5,      60),
  ('escalate_minutes',      5,      120),
  ('prefer_minutes',        2,      30),
  ('min_offer_paisa',       50000,  500000),
  ('max_counter_bps',       10000,  30000),
  ('visit_fee_min_paisa',   10000,  200000),
  ('visit_fee_max_paisa',   10000,  300000),
  ('max_open_jobs',         1,      20),
  ('max_posts_per_day',     1,      50),
  ('code_tries',            3,      10),
  ('rating_min_count',      1,      20),
  ('rating_days',           1,      60),
  ('flag_days',             7,      365),
  ('flag_min_jobs',         1,      50),
  ('flag_stopped_bps',      1000,   10000),
  ('flag_raised_bps',       1000,   10000),
  ('flag_parts_bps',        1000,   10000),
  ('flag_parts_jobs',       1,      50),
  ('flag_code_wrong',       1,      50),
  ('flag_cancelled',        1,      50),
  ('flag_problems',         1,      50),
  ('flag_low_stars',        1,      50),
  ('flag_same_pair',        2,      50),
  ('flag_customer_cancels', 1,      50),
  ('flag_blocked',          1,      50)
ON CONFLICT (key) DO UPDATE SET lo = EXCLUDED.lo, hi = EXCLUDED.hi;

-- Every change, with who made it. Written by the functions below and never
-- changed: the record of who set what is only worth having if it is whole.
CREATE TABLE IF NOT EXISTS public.setting_changes (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key       text NOT NULL,
  old_value bigint,
  new_value bigint NOT NULL,
  by_id     uuid,
  by_name   text,
  at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.setting_changes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS setting_changes_at ON public.setting_changes (at DESC);

CREATE OR REPLACE FUNCTION public.setting_changes_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'The record of setting changes is written once and never changed.';
END;
$$;

DROP TRIGGER IF EXISTS setting_changes_once ON public.setting_changes;
CREATE TRIGGER setting_changes_once BEFORE UPDATE OR DELETE ON public.setting_changes
  FOR EACH ROW EXECUTE FUNCTION public.setting_changes_once();

/**
 * Everything on the settings screen: every setting, whether it may be
 * changed here and between what, the sectors with how many approved
 * technicians work in each, and the last changes.
 */
CREATE OR REPLACE FUNCTION public.admin_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'settings', (SELECT jsonb_agg(jsonb_build_object(
        'key', s.key, 'value', s.value, 'unit', s.unit, 'meaning', s.meaning,
        'editable', l.key IS NOT NULL, 'lo', l.lo, 'hi', l.hi,
        'changed_at', (SELECT max(c.at) FROM public.setting_changes c WHERE c.key = s.key),
        'changed_by', (SELECT c.by_name FROM public.setting_changes c WHERE c.key = s.key ORDER BY c.at DESC, c.id DESC LIMIT 1)
      ) ORDER BY s.key) FROM public.settings s LEFT JOIN public.setting_limits l ON l.key = s.key),
    'sectors', (SELECT jsonb_agg(jsonb_build_object(
        'name', x.name, 'live', x.live,
        'pros', (SELECT count(*) FROM public.pros r WHERE r.status = 'approved' AND x.name = ANY (r.sectors)),
        'open_jobs', (SELECT count(*) FROM public.jobs j WHERE j.sector = x.name AND j.status IN ('open', 'assigned'))
      ) ORDER BY x.sort) FROM public.sectors x),
    'changes', coalesce((SELECT jsonb_agg(c ORDER BY c ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('key', c.key, 'old', c.old_value, 'new', c.new_value, 'by', c.by_name, 'at', c.at) AS c
        FROM public.setting_changes c ORDER BY c.at DESC, c.id DESC LIMIT 30) z), '[]'::jsonb)
  ) END;
$$;

/** One setting, within its range, written down with who changed it. */
CREATE OR REPLACE FUNCTION public.admin_set_setting(p_key text, p_value bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old  public.settings%ROWTYPE;
  v_lim  public.setting_limits%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_old FROM public.settings WHERE key = p_key FOR UPDATE;
  IF v_old.key IS NULL THEN
    RETURN public.refuse('There is no such setting.');
  END IF;
  SELECT * INTO v_lim FROM public.setting_limits WHERE key = p_key;
  IF v_lim.key IS NULL THEN
    RETURN public.refuse('This one is changed only by Claude, in a migration: it is money, or a promise made to customers.', 'value');
  END IF;
  IF p_value IS NULL OR p_value < v_lim.lo OR p_value > v_lim.hi THEN
    RETURN public.refuse('Choose a value from ' || v_lim.lo || ' to ' || v_lim.hi || '.', 'value');
  END IF;
  IF v_old.unit = 'paisa' AND p_value % 100 <> 0 THEN
    RETURN public.refuse('Whole rupees only.', 'value');
  END IF;
  IF p_key = 'visit_fee_min_paisa' AND p_value > public.setting('visit_fee_max_paisa')
     OR p_key = 'visit_fee_max_paisa' AND p_value < public.setting('visit_fee_min_paisa') THEN
    RETURN public.refuse('The smallest visit fee cannot be more than the largest.', 'value');
  END IF;
  IF p_value = v_old.value THEN
    RETURN jsonb_build_object('ok', true, 'same', true);
  END IF;
  UPDATE public.settings SET value = p_value, updated_at = now() WHERE key = p_key;
  INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
  VALUES (p_key, v_old.value, p_value, auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Opens or closes a sector for new jobs. Opening needs at least one approved
 * technician who works there: a sector with nobody in it would be a promise
 * nobody could keep. Closing leaves jobs already posted there as they are.
 */
CREATE OR REPLACE FUNCTION public.admin_set_sector(p_name text, p_live boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_live boolean;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT live INTO v_live FROM public.sectors WHERE name = p_name FOR UPDATE;
  IF v_live IS NULL OR p_live IS NULL THEN
    RETURN public.refuse('There is no such sector.');
  END IF;
  IF v_live = p_live THEN
    RETURN jsonb_build_object('ok', true, 'same', true);
  END IF;
  IF p_live AND NOT EXISTS (SELECT 1 FROM public.pros r WHERE r.status = 'approved' AND p_name = ANY (r.sectors)) THEN
    RETURN public.refuse('No approved technician works in ' || p_name || ' yet. Approve somebody there first.', 'sector');
  END IF;
  UPDATE public.sectors SET live = p_live WHERE name = p_name;
  INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
  VALUES ('sector:' || p_name, CASE WHEN v_live THEN 1 ELSE 0 END, CASE WHEN p_live THEN 1 ELSE 0 END,
          auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Blocking -----------------------------------------------------------------------------

-- A customer's "never send me him again". One line per customer and
-- technician. Deleted with either account.
CREATE TABLE IF NOT EXISTS public.blocks (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  from_job    uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  reason      text CHECK (reason IS NULL OR length(reason) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, pro_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS blocks_pro ON public.blocks (pro_id, created_at DESC);

/**
 * The customer blocks the technician of one of her jobs, once it is over:
 * done, stopped at the door, or cancelled after he was chosen. While a job
 * is on, a problem goes to the office instead — blocking then would leave a
 * man with her address and no job. He is not told. His live offers on her
 * other jobs are taken back, and any "ask again" for him is forgotten.
 */
CREATE OR REPLACE FUNCTION public.block_pro(p_job uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  IF v_job.id IS NULL OR v_job.pro_id IS NULL THEN
    RETURN public.refuse('There is no technician on this job to block.');
  END IF;
  IF v_job.status NOT IN ('done', 'stopped', 'cancelled') THEN
    RETURN public.refuse('While the job is on, report a problem or call the Pechkas office instead.');
  END IF;
  IF length(coalesce(v_reason, '')) > 300 OR public.looks_like_cnic(v_reason)
     OR coalesce(v_reason, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Keep it short, and no phone or CNIC numbers.', 'reason');
  END IF;
  INSERT INTO public.blocks (customer_id, pro_id, from_job, reason)
  VALUES (auth.uid(), v_job.pro_id, p_job, v_reason)
  ON CONFLICT (customer_id, pro_id) DO NOTHING;
  UPDATE public.offers o SET status = 'withdrawn', updated_at = now()
  FROM public.jobs j
  WHERE o.job_id = j.id AND j.customer_id = auth.uid() AND o.pro_id = v_job.pro_id AND o.status = 'pending';
  DELETE FROM public.asked_for WHERE customer_id = auth.uid() AND pro_id = v_job.pro_id;
  PERFORM public.log_job(p_job, 'blocked');
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Undo, from the same job's card. */
CREATE OR REPLACE FUNCTION public.unblock_pro(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pro uuid;
BEGIN
  SELECT pro_id INTO v_pro FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  IF v_pro IS NULL THEN
    RETURN public.refuse('There is no technician on this job.');
  END IF;
  DELETE FROM public.blocks WHERE customer_id = auth.uid() AND pro_id = v_pro;
  IF FOUND THEN
    PERFORM public.log_job(p_job, 'unblocked');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Who blocked a technician, for the office: first names, the job and the words. */
CREATE OR REPLACE FUNCTION public.admin_blocks(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'customer', p.first_name, 'phone', u.phone, 'ref', j.ref, 'reason', b.reason, 'at', b.created_at
      ) ORDER BY b.created_at DESC)
    FROM public.blocks b
    JOIN public.profiles p ON p.id = b.customer_id
    LEFT JOIN auth.users u ON u.id = b.customer_id
    LEFT JOIN public.jobs j ON j.id = b.from_job
    WHERE b.pro_id = p_pro), '[]'::jsonb) END;
$$;

/**
 * The one rule for who may see a job, now also: never a job of a customer
 * who blocked him. And, as before, "his alone for a few minutes": while a job is held for the technician she asked for, nobody
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
         AND (j.preferred_pro_id IS NULL OR j.preferred_pro_id = r.id OR j.preferred_until <= now())
         AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = r.id))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
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
               AND public.pro_owed(r.id) <= public.setting('credit_limit_paisa')
               AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = NEW.customer_id AND b.pro_id = r.id)) THEN
    NEW.preferred_pro_id := v_ask.pro_id;
    NEW.preferred_until := now() + make_interval(mins => public.setting('prefer_minutes')::integer);
  END IF;
  RETURN NEW;
END;
$$;

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
  IF EXISTS (SELECT 1 FROM public.blocks WHERE customer_id = auth.uid() AND pro_id = v_pro.id) THEN
    RETURN public.refuse('You blocked him. Undo that first if you want to ask for him again.');
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

/** The customer's jobs, now saying whether she blocked the technician, and whether she may. */
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
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/** The flags, now also: blocked by more than one customer. */
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
         GROUP BY j.customer_id) g) AS same_customer,
      (SELECT count(*) FROM public.blocks b WHERE b.pro_id = r.id AND b.created_at >= v_since) AS blocked
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
        public.flag_if('same_customer', p.same_customer, public.setting('flag_same_pair')),
        public.flag_if('blocked', p.blocked, public.setting('flag_blocked'))
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


-- --- Who may call what ------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION
  public.admin_settings(),
  public.admin_set_setting(text, bigint),
  public.admin_set_sector(text, boolean),
  public.block_pro(uuid, text),
  public.unblock_pro(uuid),
  public.admin_blocks(uuid)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261024000000_settings_and_blocks')
ON CONFLICT (name) DO NOTHING;

COMMIT;
