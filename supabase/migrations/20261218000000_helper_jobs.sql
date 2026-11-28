-- Helper jobs (the owner's decisions A135, 28 November 2026; D42): the
-- general mazdoor at the chowk, lifting, moving, carrying. Unlike every other
-- kind of work it is bought by TIME, not by a result:
--
--   * Priced by time: the customer chooses 2 hours, half a day (4) or a full
--     day (8) and names her price for that time. trades.by_time marks such a
--     kind of work; jobs.work_hours holds the choice and is required for one.
--   * One man per job: two men are two jobs.
--   * It ends with "Did he do the work?", the same 24-hour check as "Is it
--     working?" (only the app's words change), and NO guarantee afterwards:
--     guarantee_days_of() gives 0 for a job of a kind of work bought by time,
--     so nothing can be claimed. (job_types.guarantee keeps its two values:
--     an older migration run again recreates that rule, and a third value
--     would stop it.)
--
-- Who pays if he breaks something, and his injury, are open for the lawyer
-- (D42.4, D42.5, with D3). Digging, rubble and building sites stay out.
--
-- post_job() is not rewritten: post_timed_job() checks the hours, hands them
-- to the jobs_hours trigger through a transaction-local setting, and calls
-- post_job(). The trigger refuses a timed job posted without hours (an older
-- copy calling post_job straight), so no such job can exist.
-- app_lists, pro_feed, pro_my_jobs and my_jobs are copied from their latest
-- migrations with only work_hours (and by_time) added.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS by_time boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS work_hours smallint;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_work_hours_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_work_hours_check CHECK (work_hours IS NULL OR work_hours IN (2, 4, 8));

INSERT INTO public.trades (slug, name, sort, by_time)
SELECT 'helper', 'Helper', (SELECT coalesce(max(sort), 0) + 1 FROM public.trades), true
WHERE NOT EXISTS (SELECT 1 FROM public.trades WHERE slug = 'helper');
UPDATE public.trades SET by_time = true WHERE slug = 'helper' AND NOT by_time;

INSERT INTO public.job_types (trade, name, list_paisa, sort, guarantee, risky)
SELECT 'helper', v.name, NULL,
       (SELECT coalesce(max(t.sort), 0) FROM public.job_types t WHERE t.trade = 'helper') + v.n,
       'service', false
FROM (VALUES
  ('Furniture moved within the house', 1),
  ('Things carried up or down stairs', 2),
  ('Loading or unloading a vehicle', 3),
  ('Storeroom or roof cleared (carried down to the street)', 4)
) AS v(name, n)
WHERE NOT EXISTS (SELECT 1 FROM public.job_types j WHERE j.trade = 'helper' AND j.name = v.name);

/** A timed job carries its hours; any other job carries none. */
CREATE OR REPLACE FUNCTION public.job_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours text := nullif(current_setting('pechkas.work_hours', true), '');
BEGIN
  IF coalesce((SELECT t.by_time FROM public.trades t WHERE t.slug = NEW.trade), false) THEN
    IF NEW.work_hours IS NULL THEN
      IF v_hours IS NULL OR v_hours NOT IN ('2', '4', '8') THEN
        RAISE EXCEPTION 'Choose how long you need him for. If you do not see the choice, update the app.';
      END IF;
      NEW.work_hours := v_hours::smallint;
    END IF;
  ELSE
    NEW.work_hours := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jobs_hours ON public.jobs;
CREATE TRIGGER jobs_hours BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.job_hours();
REVOKE ALL ON FUNCTION public.job_hours() FROM PUBLIC, anon, authenticated;

/** Post a job bought by time: the same as post_job(), with how long. */
CREATE OR REPLACE FUNCTION public.post_timed_job(
  p_hours       smallint,
  p_trade       text,
  p_job_type    integer,
  p_description text,
  p_offer_paisa bigint,
  p_when_kind   text,
  p_when_part   text,
  p_sector      text,
  p_street      text,
  p_house       text,
  p_landmark    text DEFAULT NULL,
  p_lat         double precision DEFAULT NULL,
  p_lng         double precision DEFAULT NULL,
  p_power       text DEFAULT NULL,
  p_parts       text DEFAULT NULL,
  p_gate_note   text DEFAULT NULL,
  p_media       jsonb DEFAULT '[]'::jsonb,
  p_when_date   date DEFAULT NULL,
  p_when_from   smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT t.by_time FROM public.trades t WHERE t.slug = p_trade), false) THEN
    RETURN public.refuse('This kind of work is not booked by time.', 'trade');
  END IF;
  IF p_hours IS NULL OR p_hours NOT IN (2, 4, 8) THEN
    RETURN public.refuse('Choose how long you need him for.', 'hours');
  END IF;
  PERFORM set_config('pechkas.work_hours', p_hours::text, true);
  RETURN public.post_job(
    p_trade => p_trade, p_job_type => p_job_type, p_description => p_description, p_offer_paisa => p_offer_paisa,
    p_when_kind => p_when_kind, p_when_part => p_when_part, p_sector => p_sector, p_street => p_street,
    p_house => p_house, p_landmark => p_landmark, p_lat => p_lat, p_lng => p_lng, p_power => p_power,
    p_parts => p_parts, p_gate_note => p_gate_note, p_media => p_media, p_when_date => p_when_date,
    p_when_from => p_when_from);
END;
$$;
REVOKE ALL ON FUNCTION public.post_timed_job(smallint, text, integer, text, bigint, text, text, text, text, text, text,
  double precision, double precision, text, text, text, jsonb, date, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_timed_job(smallint, text, integer, text, bigint, text, text, text, text, text, text,
  double precision, double precision, text, text, text, jsonb, date, smallint) TO authenticated;

-- The notifications no longer name "Yes, it works": a helper's job is
-- checked with "Did he do the work?", and has no guarantee to point to.
UPDATE public.push_words SET en = 'Check it before you pay: open job {ref} and say whether it is done.' WHERE key = 'check_ready.body';
UPDATE public.push_words SET en = 'It was not checked within a day. If something is wrong, open the job in the app.' WHERE key = 'check_closed.body';

-- guarantee_days_of: copied from 20261106000000_checks_and_guarantee.sql; a job bought by time has none.
CREATE OR REPLACE FUNCTION public.guarantee_days_of(p_job uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN coalesce(tr.by_time, false) THEN 0 WHEN t.guarantee = 'service' THEN public.setting('guarantee_service_days')
              ELSE public.setting('guarantee_days') END::integer
  FROM public.jobs j LEFT JOIN public.job_types t ON t.id = j.job_type_id
  LEFT JOIN public.trades tr ON tr.slug = j.trade
  WHERE j.id = p_job;
$$;

-- app_lists: copied from 20261202000000_fast_posting.sql; trades say by_time.
CREATE OR REPLACE FUNCTION public.app_lists()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'trades',  (SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'by_time', t.by_time) ORDER BY t.sort) FROM public.trades t),
    'sectors', (SELECT jsonb_agg(s.name ORDER BY s.sort) FROM public.sectors s),
    'live_sectors', (SELECT coalesce(jsonb_agg(s.name ORDER BY s.sort), '[]'::jsonb) FROM public.sectors s WHERE s.live),
    'islamabad_sectors', (SELECT coalesce(jsonb_agg(s.name ORDER BY s.sort), '[]'::jsonb) FROM public.sectors s WHERE s.city = 'islamabad'),
    'job_types', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'trade', j.trade, 'name', j.name, 'list_paisa', j.list_paisa,
                                                      'floor_paisa', public.price_floor(j.id)) ORDER BY j.trade, j.sort) FROM public.job_types j),
    'min_offer_paisa', public.setting('min_offer_paisa'),
    'min_price_bps', public.setting('min_price_bps'),
    'visit_fee_min_paisa', public.setting('visit_fee_min_paisa'),
    'visit_fee_max_paisa', public.setting('visit_fee_max_paisa')
  );
$$;

-- pro_feed: copied from 20261118000000_first_job_labour.sql; work_hours added.
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
    -- D36: an overdue fee stops new offers on its own.
    'pay_blocked', public.pay_blocked(auth.uid()),
    'overdue_paisa', (public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint,
    -- Paused by the office (D11): until when, and the office's reason.
    'paused_until', public.pro_pause_until(auth.uid()),
    'pause_note', (SELECT l.note FROM public.pro_pause_log l WHERE l.pro_id = auth.uid() AND l.action = 'pause'
                   AND public.pro_pause_until(auth.uid()) IS NOT NULL ORDER BY l.at DESC LIMIT 1),
    -- A5: paused by rule for payments, with no end date.
    'pay_pause', public.pay_pause_view(auth.uid()),
    'guarantee_block', (SELECT jsonb_build_object('claim_id', c.id, 'ref', j.ref, 'customer', p.first_name,
                                                   'can_answer', c.status = 'waiting' OR (c.why_replacing = 'no_answer' AND c.replacement_job_id IS NULL))
                        FROM public.guarantee_claims c JOIN public.jobs j ON j.id = c.job_id JOIN public.profiles p ON p.id = c.customer_id
                        WHERE c.id = public.claim_blocks(auth.uid())),
    'open_claims', (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = auth.uid() AND c.status IN ('waiting', 'coming')),
    'jobs', CASE WHEN NOT v_online THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'description', j.description, 'offered_paisa', j.offered_paisa,
          'list_paisa', t.list_paisa, 'when_kind', j.when_kind, 'when_part', j.when_part,
          'when_date', j.when_date, 'when_from', j.when_from,
          'sector', j.sector, 'power', j.power, 'parts', j.parts,
          'customer_first_name', p.first_name, 'created_at', j.created_at,
          'paid_by_pechkas', j.paid_by_pechkas, 'pay_cap_paisa', j.pay_cap_paisa, 'work_hours', j.work_hours,
          'visit_fee_paisa', public.visit_fee(j.id),
          'asked_you', coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false),
          'asked_until', CASE WHEN j.preferred_pro_id = auth.uid() AND j.preferred_until > now() THEN j.preferred_until END,
          'repeat', public.repeat_pair(j.customer_id, auth.uid(), j.id),
          -- A99: the launch rate if she chose him now, and until when.
          'launch', public.launch_applies(auth.uid(), j.trade, now()),
          'launch_until', CASE WHEN public.launch_applies(auth.uid(), j.trade, now()) THEN public.launch_until(auth.uid(), j.trade) END,
          'commission_bps', public.commission_rate(j.customer_id, auth.uid(), j.id),
          'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                             FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'parts_paisa', o.parts_paisa, 'eta_minutes', o.eta_minutes, 'arrive_from', o.arrive_from,
                                                 'note', o.note, 'status', o.status, 'expires_at', o.expires_at,
                                                 'live', o.status = 'pending' AND o.expires_at > now())
                       FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = auth.uid())
        ) ORDER BY coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false) DESC, j.created_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.job_types t ON t.id = j.job_type_id
      WHERE j.status = 'open'
        -- Two days for a job wanted now; a job for a day stays until that day
        -- has passed, and goes the day after, offered on or not.
        AND (j.created_at > now() - interval '48 hours'
             OR (j.when_kind <> 'now' AND j.when_date >= (now() AT TIME ZONE 'Asia/Karachi')::date))
        AND (j.when_kind = 'now' OR j.when_date IS NULL OR j.when_date >= (now() AT TIME ZONE 'Asia/Karachi')::date)
        AND j.customer_id <> auth.uid()
        AND public.pro_may_see(j.id)
    ), '[]'::jsonb) END
  );
END;
$$;

-- pro_my_jobs: copied from 20261205000000_late_from_minutes.sql; work_hours added.
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
      'repeat', public.repeat_pair(j.customer_id, j.pro_id, j.id),
      -- A99: fixed when she chose him.
      'launch', j.launch_bps IS NOT NULL,
      'keeps_paisa', j.agreed_paisa - public.commission_at(j.agreed_paisa, c.bps),
      'when_kind', j.when_kind, 'when_part', j.when_part, 'when_date', j.when_date, 'when_from', j.when_from,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'lat', j.lat, 'lng', j.lng, 'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'customer_first_name', p.first_name, 'customer_phone', public.phone_of(u.id),
      'assigned_at', j.assigned_at,
      'stage', j.stage,
      'code_locked', j.code_locked_at IS NOT NULL,
      'code_tries_left', greatest(public.setting('code_tries') - j.code_tries, 0),
      'change', public.pending_change(j.id),
      'visit_fee_paisa', public.visit_fee(j.id),
      'photos', public.photos_of(j.id),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) || jsonb_build_object('work_hours', j.work_hours) || jsonb_build_object(
      'checking_at', j.checking_at,
      'check_due', CASE WHEN j.stage = 'checking' THEN j.checking_at + make_interval(hours => public.setting('check_hours')::integer) END,
      'not_finished', j.not_finished,
      'last_check', (SELECT jsonb_build_object('round', k.round, 'reason', public.check_reason_text(k.reason), 'note', k.note,
                                               'photo', k.photo, 'pro_reply', k.pro_reply, 'can_reply', k.pro_reply IS NULL)
                     FROM public.job_checks k WHERE k.job_id = j.id AND k.answer = 'not_finished' ORDER BY k.round DESC LIMIT 1),
      'dispute_outcome', j.dispute_outcome, 'dispute_note', j.dispute_note,
      'paid_by_pechkas', j.paid_by_pechkas,
      'keeps_paisa', CASE WHEN j.paid_by_pechkas THEN j.agreed_paisa ELSE j.agreed_paisa - public.commission_at(j.agreed_paisa, c.bps) END,
      'commission_bps', CASE WHEN j.paid_by_pechkas THEN 0 ELSE c.bps END
    ) || jsonb_build_object(
      'can_ask_change', j.stage = 'working',
      'window_start', public.window_start(j.when_date, j.when_from),
      'due_at', public.due_of(j), 'late_from', public.late_from(j), 'due_by_google', j.chosen_eta_seconds IS NOT NULL,
      'late', (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL)) AND public.late_from(j) <= now(),
      -- He cannot get in (D34): from when he may ask, and where it stands.
      'not_home_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'nobody_home') END,
      'guard_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'guard') END,
      'not_home', public.not_home_view(j.id, 'pro'),
      -- His own arrival check: the result and the distance, never coordinates.
      'arrival', public.arrival_view(j)
    ) || jsonb_build_object(
      -- "I can't come" and "I'm running late" (D11): whether he may, what it would count as now, and his estimate.
      'withdraw_kind_now', public.withdraw_kind(j),
      'late_withdrawals_at', public.setting('flag_late_withdrawals'),
      'flag_days', public.setting('flag_days'),
      'eta_at', j.eta_at,
      'etas_left', greatest(0, 2 - (SELECT count(*) FROM public.eta_reports e WHERE e.job_id = j.id AND e.pro_id = j.pro_id)),
      'eta_latest', public.eta_latest(j)
    ) || jsonb_build_object(
      -- D37: her answer at the door, his first jobs, his checker.
      'face_needed', j.face_confirmed_at IS NULL AND EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = j.pro_id),
      'first_job', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id),
      'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind,
                                          'checker', CASE WHEN k.kind = 'app' THEN split_part(k.checker_name, ' ', 1) END)
                FROM public.risk_checks k WHERE k.job_id = j.id AND k.pro_id = j.pro_id AND k.status IN ('asked', 'accepted') LIMIT 1)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

-- my_jobs: copied from 20261205000000_late_from_minutes.sql; work_hours added.
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
    ) || jsonb_build_object('work_hours', j.work_hours) || jsonb_build_object(
      -- Nobody has offered yet (when_nobody_offers): what she may do about it.
      'list_paisa', (SELECT t.list_paisa FROM public.job_types t WHERE t.id = j.job_type_id),
      'nudged', j.status = 'open' AND j.nudged_at IS NOT NULL,
      'raises_left', greatest(public.setting('max_raises') - j.raises, 0),
      'can_raise', j.status = 'open' AND j.raises < public.setting('max_raises') AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()),
      'can_move', j.status = 'open' AND j.when_kind <> 'now' AND j.when_from IS NULL AND j.when_part IS NULL AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) || jsonb_build_object(
      -- He says finished, she checks (checks_and_guarantee).
      'checking_at', j.checking_at,
      'check_due', CASE WHEN j.stage = 'checking' THEN j.checking_at + make_interval(hours => public.setting('check_hours')::integer) END,
      'not_finished', j.not_finished,
      'checks', coalesce((SELECT jsonb_agg(jsonb_build_object('round', k.round, 'answer', k.answer, 'reason', public.check_reason_text(k.reason),
                                                              'note', k.note, 'photo', k.photo, 'pro_reply', k.pro_reply) ORDER BY k.round)
                          FROM public.job_checks k WHERE k.job_id = j.id AND k.answer IS NOT NULL), '[]'::jsonb),
      'disputed', j.stage = 'disputed',
      'dispute_outcome', j.dispute_outcome, 'dispute_note', j.dispute_note,
      'confirmed_by', j.confirmed_by,
      'paid_by_pechkas', j.paid_by_pechkas,
      'guarantee_of_ref', (SELECT o.ref FROM public.guarantee_claims c JOIN public.jobs o ON o.id = c.job_id WHERE c.id = j.guarantee_of),
      'guarantee_days', CASE WHEN j.status = 'done' THEN public.guarantee_days_of(j.id) END,
      'guarantee_until', CASE WHEN j.status = 'done' THEN j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) END,
      'claim', public.claim_for_customer(j.id),
      'can_claim', j.status = 'done' AND j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) > now()
                   AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered')),
      'claim_open', EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered'))
                    OR EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open')
    ) || jsonb_build_object(
      -- A repair Pechkas pays for has no price for her to raise (guarantee_followups).
      'can_raise', j.status = 'open' AND NOT j.paid_by_pechkas AND j.raises < public.setting('max_raises')
                   AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) || jsonb_build_object(
      -- The visit fee (visit_fee): the figure she is shown before choosing,
      -- fixed when she chooses, and what happened to it after.
      'visit_fee_paisa', CASE WHEN j.status IN ('open', 'assigned') THEN public.visit_fee(j.id) END,
      'stop_reason', j.stop_reason,
      'visit_fee', public.visit_fee_view(j.id, 'customer')
    ) || jsonb_build_object(
      -- Cancelling (cancellations): whether she may, what it would count as
      -- right now, whether he is late or has not come, and how it was recorded.
      'window_start', public.window_start(j.when_date, j.when_from),
      'due_at', public.due_of(j), 'late_from', public.late_from(j), 'due_by_google', j.chosen_eta_seconds IS NOT NULL,
      'can_cancel', j.status = 'open' OR (j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')),
      'cancel_kind_now', CASE
        WHEN j.status = 'open' THEN 'before_choosing'
        WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')
          THEN public.cancel_kind_of(now(), j, public.arrival_at(j),
                                  CASE WHEN j.stage = 'arrived' AND public.arrival_at(j) IS NULL THEN 'on_way' ELSE j.stage END, true) END,
      'pro_late', j.status = 'assigned' AND (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL))
                  AND public.late_from(j) <= now(),
      'no_show', EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.pro_id = j.pro_id AND i.kind = 'no_show' AND i.status = 'potential'),
      'cancel_code', j.cancel_code,
      'cancel_category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = j.id),
      -- He cannot get in (D34): being asked, "I'm coming", and "I was home".
      'not_home', public.not_home_view(j.id, 'customer'),
      -- Said to her only when the location check verified it; never his coordinates.
      'arrival_verified', j.arrival_review_status = 'verified'
    ) || jsonb_build_object(
      -- A technician who cannot come (D11): find another, his estimate, and what came before.
      'can_find_another', public.can_find_another(j),
      'eta_at', CASE WHEN j.status = 'assigned' THEN j.eta_at END,
      'reopened', (SELECT jsonb_build_object('ended', a.ended, 'at', a.ended_at,
                                             'pro', (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = a.pro_id))
                   FROM public.job_assignments a WHERE a.job_id = j.id ORDER BY a.ended_at DESC LIMIT 1),
      'technicians_before', (SELECT count(*) FROM public.job_assignments a WHERE a.job_id = j.id),
      -- D35: he says he was not paid in full.
      'payment', public.payment_view(j.id, 'customer')
    ) || jsonb_build_object(
      -- D37: his photo and her answer at the door, his first jobs, a checked job, her safety report.
      'pro_photo', CASE WHEN j.status IN ('assigned', 'done', 'stopped') THEN (SELECT f.path FROM public.pro_faces f WHERE f.pro_id = j.pro_id) END,
      'face_needed', j.status = 'assigned' AND j.stage = 'arrived' AND j.face_confirmed_at IS NULL
                     AND EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = j.pro_id),
      'face_confirmed', j.face_confirmed_at IS NOT NULL,
      'new_on_pechkas', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id),
      'trial_questions', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id AND x.answered_at IS NULL
                                 AND ((j.status = 'assigned' AND j.stage = 'checking')
                                      OR (j.status = 'done' AND j.finished_at > now() - interval '2 days'))),
      'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind,
                                          'checker', CASE WHEN k.kind = 'app' THEN split_part(k.checker_name, ' ', 1) END)
                FROM public.risk_checks k WHERE k.job_id = j.id AND k.status IN ('asked', 'accepted', 'passed', 'not_yet', 'unsafe')
                ORDER BY k.created_at DESC LIMIT 1),
      'safety_report', (SELECT jsonb_build_object('status', s.status, 'at', s.at) FROM public.safety_reports s
                        WHERE s.job_id = j.id AND s.from_id = auth.uid() AND s.kind = 'safety' LIMIT 1),
      'can_report_safety', j.pro_id IS NOT NULL
                           AND (j.status = 'assigned' OR (j.status IN ('done', 'stopped')
                                AND j.finished_at > now() - make_interval(days => public.guarantee_days_of(j.id))))
                           AND NOT EXISTS (SELECT 1 FROM public.safety_reports s WHERE s.job_id = j.id AND s.from_id = auth.uid() AND s.kind = 'safety')
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

INSERT INTO public.applied_migrations (name)
VALUES ('20261218000000_helper_jobs')
ON CONFLICT (name) DO NOTHING;

COMMIT;
