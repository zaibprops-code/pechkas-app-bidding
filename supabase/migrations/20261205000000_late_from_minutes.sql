-- =============================================================================
-- Late is measured from Google's minutes, and jobs run 7am to 10pm
-- (the owner's decision A116, 25 November 2026; Part 2c).
--
--   1. Every job the app posts is "as soon as possible", and the technician
--      no longer names two hours. When she chooses him, the job is given a
--      DUE time (jobs.due_at): the moment she chose him, plus Google's
--      driving minutes from where his phone was when he offered
--      (chosen_eta_seconds, Part 2b). If Google gave no minutes — no key yet,
--      or no answer — the office's `due_fallback_minutes` (60) stands in:
--      a rule everybody can see, never a guess shown as Google's.
--      A job chosen before the day opens is due from 7am.
--   2. He counts as LATE `late_grace_minutes` (15, locked: the terms say it)
--      after his due time, and as a possible NO-SHOW `no_show_minutes` (60,
--      the office's, 30–180) after it. due_of(), late_from() and
--      no_show_from() are the one rule; cancel_kind_of() uses them, and
--      every function that measured from the two-hour window now asks them.
--   3. A job that still has a window (older copies, which may still name two
--      hours) keeps the old rules exactly: 30 minutes into the window is
--      late, 30 minutes after it ends is a possible no-show.
--   4. Jobs run 7am to 10pm (`day_opens_hour`, `day_closes_hour`, locked).
--      A job is for today until 9pm; after that it is for tomorrow from 7am.
--      A job nobody took closes at 10pm on its day (was 8pm).
--   5. If Google answers in the first five minutes after she chose him,
--      that answer replaces the fallback.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('late_grace_minutes', 15, 'minutes', 'A technician counts as late this many minutes after the time he was due (Google''s minutes when the customer chose him). Locked: the terms state it.'),
  ('no_show_minutes', 60, 'minutes', 'A technician who has not arrived this many minutes after the time he was due is a possible no-show: the customer, he and the office are told.'),
  ('due_fallback_minutes', 60, 'minutes', 'When Google gave no minutes for the chosen technician, he is due this many minutes after the customer chose him.'),
  ('day_opens_hour', 7, 'count', 'Jobs run from this hour, Pakistan time. Locked.'),
  ('day_closes_hour', 22, 'count', 'Jobs run until this hour, Pakistan time; a job nobody took closes then, and after an hour before it new jobs are for tomorrow. Locked.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('no_show_minutes', 30, 180),
  ('due_fallback_minutes', 30, 180)
ON CONFLICT (key) DO UPDATE SET lo = excluded.lo, hi = excluded.hi;
-- The promise and the day's hours are locked.
DELETE FROM public.setting_limits WHERE key IN ('late_grace_minutes', 'day_opens_hour', 'day_closes_hour');

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS due_at timestamptz;

/** The hour new jobs stop being for today: an hour before the day closes. */
CREATE OR REPLACE FUNCTION public.last_post_hour()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.setting('day_closes_hour')::integer - 1;
$$;

CREATE OR REPLACE FUNCTION public.day_closes_hour()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.setting('day_closes_hour')::integer;
$$;

/** When a day's work opens, on Pakistan's clock. */
CREATE OR REPLACE FUNCTION public.day_open_at(p_date date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_date IS NOT NULL
              THEN (p_date + make_time(public.setting('day_opens_hour')::integer, 0, 0)) AT TIME ZONE 'Asia/Karachi' END;
$$;

/** The moment he is due: his window's start on a job that has one, else the due time set when she chose him. */
CREATE OR REPLACE FUNCTION public.due_of(p_job public.jobs)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(public.window_start(p_job.when_date, p_job.when_from), p_job.due_at);
$$;

/** From when he is late: 30 minutes into a window (older jobs), else late_grace_minutes after he was due. */
CREATE OR REPLACE FUNCTION public.late_from(p_job public.jobs)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.window_start(p_job.when_date, p_job.when_from) IS NOT NULL
      THEN public.window_start(p_job.when_date, p_job.when_from) + interval '30 minutes'
    WHEN p_job.due_at IS NOT NULL
      THEN p_job.due_at + make_interval(mins => public.setting('late_grace_minutes')::integer)
  END;
$$;

/** From when he is a possible no-show: 30 minutes after a window ends (older jobs), else no_show_minutes after he was due. */
CREATE OR REPLACE FUNCTION public.no_show_from(p_job public.jobs)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.window_start(p_job.when_date, p_job.when_from) IS NOT NULL
      THEN public.window_start(p_job.when_date, p_job.when_from) + interval '2 hours 30 minutes'
    WHEN p_job.due_at IS NOT NULL
      THEN p_job.due_at + make_interval(mins => public.setting('no_show_minutes')::integer)
  END;
$$;

/** The latest time "I'm running late" may name: 2 hours after a window ends, 2 hours after he was due, else 3 hours from now. */
CREATE OR REPLACE FUNCTION public.eta_latest(p_job public.jobs)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.window_start(p_job.when_date, p_job.when_from) IS NOT NULL
      THEN public.window_start(p_job.when_date, p_job.when_from) + interval '4 hours'
    WHEN p_job.due_at IS NOT NULL THEN greatest(p_job.due_at, now()) + interval '2 hours'
    ELSE now() + interval '3 hours'
  END;
$$;

/**
 * What a customer's cancellation (or "find another technician") is, in D10's
 * order, for any job. A job with a window, or with no due time, is exactly
 * cancel_kind() as before. A job with a due time: a possible no-show, then
 * his lateness, then hers — at the door, or after an On my way tapped no more
 * than 3 hours before he was due; before he sets off it is normal, because
 * she asked for somebody now and has not kept him from anything yet.
 */
CREATE OR REPLACE FUNCTION public.cancel_kind_of(p_at timestamptz, p_job public.jobs, p_arrived timestamptz,
                                                 p_stage text, p_chosen boolean)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT coalesce(p_chosen, false) THEN 'before_choosing'
    WHEN public.window_start(p_job.when_date, p_job.when_from) IS NOT NULL OR p_job.due_at IS NULL
      THEN public.cancel_kind(p_at, public.window_start(p_job.when_date, p_job.when_from), p_job.on_way_at,
                              p_arrived, p_stage, p_chosen)
    WHEN p_arrived IS NULL AND p_at >= public.no_show_from(p_job) THEN 'no_show'
    WHEN (p_arrived IS NULL AND p_at >= public.late_from(p_job)) OR p_arrived >= public.late_from(p_job) THEN 'pro_late'
    WHEN p_stage = 'arrived' THEN 'late'
    WHEN p_job.on_way_at IS NOT NULL AND p_job.on_way_at <= p_at
         AND p_job.on_way_at >= p_job.due_at - interval '3 hours' THEN 'late'
    ELSE 'normal'
  END;
$$;

/**
 * Gives a newly chosen job its due time, and takes it away when the job goes
 * back to everyone (reopen_job), with the minutes that belonged to the man
 * who left. A job whose window came from an offer (older copies) has none:
 * its window is its time.
 */
CREATE OR REPLACE FUNCTION public.fix_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'assigned' AND NEW.when_from IS NOT NULL THEN
    NEW.due_at := NULL;
  ELSIF NEW.status = 'assigned' THEN
    IF TG_OP = 'INSERT' OR NEW.due_at IS NULL OR OLD.status IS DISTINCT FROM 'assigned'
       OR OLD.pro_id IS DISTINCT FROM NEW.pro_id OR OLD.assigned_at IS DISTINCT FROM NEW.assigned_at
       OR OLD.chosen_eta_seconds IS DISTINCT FROM NEW.chosen_eta_seconds OR OLD.when_from IS DISTINCT FROM NEW.when_from THEN
      NEW.due_at := greatest(coalesce(NEW.assigned_at, now()), coalesce(public.day_open_at(NEW.when_date), '-infinity'::timestamptz))
                    + make_interval(secs => coalesce(NEW.chosen_eta_seconds, public.setting('due_fallback_minutes')::integer * 60));
    END IF;
  ELSIF NEW.status = 'open' THEN
    NEW.due_at := NULL;
    IF TG_OP = 'UPDATE' AND OLD.status = 'assigned' THEN
      NEW.chosen_eta_seconds := NULL;
      NEW.chosen_distance_m := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jobs_due ON public.jobs;
-- Named to run after job_steps and job_launch_rate, which fire first in name order.
CREATE TRIGGER jobs_due BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.fix_due();

/**
 * Keeps his minutes on the job when she chooses him; and when Google's answer
 * comes in within five minutes of the choice, it takes the fallback's place.
 */
CREATE OR REPLACE FUNCTION public.offer_chosen_eta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    UPDATE public.jobs SET chosen_eta_seconds = NEW.eta_seconds, chosen_distance_m = coalesce(NEW.route_m, NEW.distance_m)
    WHERE id = NEW.job_id;
  ELSIF NEW.status = 'accepted' AND OLD.eta_seconds IS NULL AND NEW.eta_seconds IS NOT NULL THEN
    UPDATE public.jobs SET chosen_eta_seconds = NEW.eta_seconds, chosen_distance_m = coalesce(NEW.route_m, NEW.distance_m)
    WHERE id = NEW.job_id AND status = 'assigned' AND pro_id = NEW.pro_id AND chosen_eta_seconds IS NULL
      AND stage IN ('chosen', 'on_way') AND assigned_at > now() - interval '5 minutes';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS offers_chosen_eta ON public.offers;
CREATE TRIGGER offers_chosen_eta AFTER UPDATE OF status, eta_seconds ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offer_chosen_eta();

-- Jobs already chosen and running without a window are given their due time now.
UPDATE public.jobs
SET due_at = greatest(coalesce(assigned_at, now()), coalesce(public.day_open_at(when_date), '-infinity'::timestamptz))
             + make_interval(secs => coalesce(chosen_eta_seconds, public.setting('due_fallback_minutes')::integer * 60))
WHERE status = 'assigned' AND when_from IS NULL AND due_at IS NULL;

-- One sentence for a late arrival, whichever way his time was set.
UPDATE public.push_words SET en = v.en, ur = CASE WHEN public.push_words.ur IS NULL THEN NULL ELSE v.en END
FROM (VALUES
  ('late_arrival_pro.body', 'You arrived {minutes} minutes after you were due. If that is wrong, tell the office from My account.')
) AS v(key, en)
WHERE public.push_words.key = v.key;

-- my_jobs: copied from 20261113000000_first_jobs.sql; only the lines about time changed.
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

-- pro_my_jobs: copied from 20261117100000_launch_offers.sql; only the lines about time changed.
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
    ) || jsonb_build_object(
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

-- record_cancellation: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.record_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start    timestamptz := public.due_of(OLD);
  v_category text;
  v_minutes  integer;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status IS NOT DISTINCT FROM 'cancelled' THEN
    RETURN NULL;
  END IF;
  v_category := CASE
    WHEN NEW.cancelled_by = 'office' THEN 'office'
    WHEN NEW.cancelled_by = 'nobody' THEN 'unclaimed'
    -- He could not get in (D34): its own label, never a late cancellation.
    WHEN NEW.cancelled_by = 'pro' THEN coalesce((SELECT CASE WHEN r.reason = 'guard' THEN 'guard' ELSE 'not_home' END
                                                 FROM public.not_home_reports r WHERE r.job_id = NEW.id AND r.pro_id = OLD.pro_id), 'not_home')
    -- Her cancellation reads his arrival only once it is satisfied: an unverified tap
    -- never makes her cancellation "at the door", nor hides his lateness.
    ELSE public.cancel_kind_of(now(), OLD, public.arrival_at(OLD),
                            CASE WHEN OLD.stage = 'arrived' AND public.arrival_at(OLD) IS NULL THEN 'on_way' ELSE OLD.stage END,
                            OLD.status = 'assigned')
  END;
  INSERT INTO public.cancellations (job_id, customer_id, pro_id, cancelled_by, cancel_for, category, reason_code, reason_text,
                                    stage, window_start, on_way_at, arrived_at)
  VALUES (NEW.id, NEW.customer_id, CASE WHEN OLD.status = 'assigned' THEN OLD.pro_id END,
          coalesce(NEW.cancelled_by, 'customer'), NEW.cancel_for, v_category, NEW.cancel_code, NEW.cancel_reason,
          OLD.stage, v_start, NEW.on_way_at, NEW.arrived_at)
  ON CONFLICT (job_id) DO NOTHING;

  -- Cancelled because he had not come: that lateness is his, on his record (once per job).
  IF v_category IN ('pro_late', 'no_show') AND OLD.pro_id IS NOT NULL AND public.arrival_at(OLD) IS NULL THEN
    v_minutes := floor(extract(epoch FROM (now() - v_start)) / 60)::integer;
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (NEW.id, OLD.pro_id, CASE WHEN v_category = 'no_show' THEN 'no_show' ELSE 'late_arrival' END,
            CASE WHEN v_category = 'no_show' THEN 'potential' ELSE 'recorded' END, v_start, v_minutes, 'cancelled_waiting')
    ON CONFLICT (job_id, pro_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'cancel_recorded', jsonb_build_object('category', v_category, 'code', NEW.cancel_code));
  RETURN NULL;
END;
$$;

-- customer_find_another: copied from 20261130000000_in_the_app.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.customer_find_another(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_start timestamptz;
  v_kind  text;
  v_pro   uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF NOT public.can_find_another(v_job) THEN
    RETURN public.refuse(CASE WHEN v_job.status = 'open' THEN 'This job is already open to other technicians.'
                              ELSE 'Your technician has arrived. Please write to the Pechkas office in the app.' END);
  END IF;
  v_pro := v_job.pro_id;
  v_start := public.due_of(v_job);
  -- What it counts as, exactly as her cancelling now would: his lateness (pro_late, no_show) is
  -- his; a late switch with no fault of his ('late') counts as her late cancellation unless he
  -- had said he was running late. Nothing against him before he is late (late_from).
  v_kind := public.cancel_kind_of(now(), v_job, public.arrival_at(v_job),
                               CASE WHEN v_job.stage = 'arrived' THEN 'on_way' ELSE v_job.stage END, true);
  IF v_kind IN ('pro_late', 'no_show') THEN
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (p_job, v_pro, CASE WHEN v_kind = 'no_show' THEN 'no_show' ELSE 'late_arrival' END,
            CASE WHEN v_kind = 'no_show' THEN 'potential' ELSE 'recorded' END, v_start,
            floor(extract(epoch FROM (now() - v_start)) / 60)::integer, 'replaced_waiting')
    ON CONFLICT (job_id, pro_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(p_job, 'replaced', jsonb_build_object('kind', v_kind));
  v_job := public.reopen_job(p_job, 'replaced', NULL,
    CASE WHEN v_kind = 'late' AND v_job.eta_at IS NOT NULL THEN 'excused' ELSE v_kind END);
  PERFORM public.tell(v_pro, 'replaced_pro', p_job, '/pro', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true, 'day', v_job.when_date, 'kind', v_kind);
END;
$$;

-- no_show_clock: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.no_show_clock()
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
    SELECT j.* FROM public.jobs j
    WHERE j.status = 'assigned' AND j.pro_id IS NOT NULL
      -- An arrival tapped but not verified is still watched: a tap alone is not an arrival.
      AND (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL))
      AND public.no_show_from(j) <= now()
      AND public.due_of(j) > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.pro_id = j.pro_id)
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (v_job.id, v_job.pro_id, 'no_show', 'potential', public.due_of(v_job),
            floor(extract(epoch FROM (now() - public.due_of(v_job))) / 60)::integer, 'clock')
    ON CONFLICT (job_id, pro_id) DO NOTHING;
    IF FOUND THEN
      PERFORM public.log_job(v_job.id, 'no_show_potential');
      IF v_job.stage = 'arrived' THEN
        -- He tapped Arrived but it could not be verified. She knows whether he is at her door,
        -- so she is not told he has not come; he and the office are.
        PERFORM public.tell(v_job.pro_id, 'arrival_unchecked_pro', v_job.id, '/pro', public.job_vars(v_job));
        PERFORM public.tell_office('arrival_unchecked_office', v_job.id, public.job_vars(v_job));
      ELSE
        PERFORM public.tell(v_job.customer_id, 'no_show_customer', v_job.id, '/jobs',
          public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)));
        PERFORM public.tell(v_job.pro_id, 'no_show_pro', v_job.id, '/pro', public.job_vars(v_job));
        PERFORM public.tell_office('no_show_office', v_job.id, public.job_vars(v_job));
      END IF;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- record_late_arrival: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.record_late_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start   timestamptz := public.due_of(NEW);
  v_at      timestamptz := public.arrival_at(NEW);
  v_minutes integer;
BEGIN
  IF v_at IS NULL OR public.arrival_at(OLD) IS NOT NULL OR v_start IS NULL OR NEW.pro_id IS NULL
     OR NEW.arrival_review_status = 'before_checks' OR v_at < public.late_from(NEW) THEN
    RETURN NULL;
  END IF;
  v_minutes := floor(extract(epoch FROM (v_at - v_start)) / 60)::integer;
  UPDATE public.pro_incidents
  SET kind = 'late_arrival', status = 'recorded', arrived_at = v_at, minutes_late = v_minutes, how = 'arrived_late'
  WHERE job_id = NEW.id AND pro_id = NEW.pro_id AND kind = 'no_show' AND status = 'potential';
  IF NOT FOUND THEN
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, arrived_at, minutes_late, how)
    VALUES (NEW.id, NEW.pro_id, 'late_arrival', 'recorded', v_start, v_at, v_minutes, 'arrived_late')
    ON CONFLICT (job_id, pro_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'late_arrival', jsonb_build_object('minutes', v_minutes));
  PERFORM public.tell(NEW.pro_id, 'late_arrival_pro', NEW.id, '/pro/money',
    public.job_vars(NEW) || jsonb_build_object('minutes', v_minutes));
  RETURN NULL;
END;
$$;

-- pro_running_late: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.pro_running_late(p_job uuid, p_eta timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs;
  v_start timestamptz;
  v_n     integer;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF NOT (v_job.stage IN ('chosen', 'on_way') OR (v_job.stage = 'arrived' AND public.arrival_at(v_job) IS NULL)) THEN
    RETURN public.refuse('You have already arrived.', 'stage');
  END IF;
  SELECT count(*) INTO v_n FROM public.eta_reports WHERE job_id = p_job AND pro_id = v_job.pro_id;
  IF v_n >= 2 THEN
    RETURN public.refuse('You have already changed your time twice. Please tell the customer in Chat.', 'eta');
  END IF;
  v_start := public.due_of(v_job);
  IF p_eta IS NULL OR p_eta < now() + interval '5 minutes'
     OR p_eta > public.eta_latest(v_job) THEN
    RETURN public.refuse('Choose a time between 5 minutes from now and ' || public.pk_clock(public.eta_latest(v_job)) || '.', 'eta');
  END IF;
  INSERT INTO public.eta_reports (job_id, pro_id, eta_at, window_start) VALUES (p_job, v_job.pro_id, p_eta, v_start);
  UPDATE public.jobs SET eta_at = p_eta, updated_at = now() WHERE id = p_job;
  PERFORM public.log_job(p_job, 'running_late', jsonb_build_object('eta', p_eta));
  PERFORM public.tell(v_job.customer_id, 'running_late', p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id),
                                                 'time', public.pk_clock(p_eta)));
  RETURN jsonb_build_object('ok', true, 'eta', p_eta, 'left', 1 - v_n);
END;
$$;

-- pro_cannot_get_in: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.pro_cannot_get_in(p_job uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job      public.jobs%ROWTYPE;
  v_start    timestamptz;
  v_from     timestamptz;
  v_minutes  integer;
  v_deadline timestamptz := now() + interval '10 minutes';
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('nobody_home', 'guard') THEN
    RETURN public.refuse('Choose what is stopping you.', 'reason');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('Tap I have arrived first, once you are at the door.', 'stage');
  END IF;
  IF EXISTS (SELECT 1 FROM public.not_home_reports r WHERE r.job_id = p_job AND r.pro_id = auth.uid()) THEN
    RETURN public.refuse('The customer has already been told about this job.', 'stage');
  END IF;
  v_start := public.window_start(v_job.when_date, v_job.when_from);
  IF v_start IS NOT NULL AND now() < v_start THEN
    RETURN public.refuse('Your time for this job has not started yet. Please wait for it.', 'wait')
           || jsonb_build_object('from', public.not_home_from(v_job, p_reason));
  END IF;
  v_from := public.not_home_from(v_job, p_reason);
  IF now() < v_from THEN
    RETURN public.refuse('Please wait a little longer and try calling the customer first.', 'wait')
           || jsonb_build_object('from', v_from);
  END IF;
  v_minutes := CASE WHEN public.due_of(v_job) IS NOT NULL THEN floor(extract(epoch FROM (v_job.arrived_at - public.due_of(v_job))) / 60)::integer END;
  INSERT INTO public.not_home_reports (job_id, pro_id, customer_id, reason, status, arrived_at, window_start,
                                       pro_was_late, minutes_late, customer_told_at, deadline)
  VALUES (p_job, v_job.pro_id, v_job.customer_id, p_reason, 'asking', v_job.arrived_at, public.due_of(v_job),
          coalesce(v_job.arrived_at >= public.late_from(v_job), false), v_minutes, now(), v_deadline);
  PERFORM public.log_job(p_job, 'not_home_asked', jsonb_build_object('reason', p_reason));
  PERFORM public.tell(v_job.customer_id, CASE WHEN p_reason = 'guard' THEN 'guard_ask' ELSE 'not_home_ask' END, p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)));
  RETURN jsonb_build_object('ok', true, 'deadline', v_deadline);
END;
$$;

-- post_job: copied from 20261202000000_fast_posting.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.post_job(
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
DECLARE
  v_me     uuid := auth.uid();
  v_role   text;
  v_title  text;
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_street text := btrim(coalesce(p_street, ''));
  v_house  text := btrim(coalesce(p_house, ''));
  v_land   text := nullif(btrim(coalesce(p_landmark, '')), '');
  v_gate   text := nullif(btrim(coalesce(p_gate_note, '')), '');
  v_media  jsonb := coalesce(p_media, '[]'::jsonb);
  v_item   jsonb;
  v_job    uuid;
  v_ref    text;
  v_kind   text;
  v_path   text;
  -- Pakistan's own clock: "today" is the customer's today, not the server's.
  v_today  date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour   integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_wkind  text;
  v_wpart  text;
  v_wdate  date;
  v_wfrom  smallint;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
  IF v_role IS DISTINCT FROM 'customer' THEN
    RETURN public.refuse('Only a customer account can post a job.');
  END IF;

  -- What
  IF NOT EXISTS (SELECT 1 FROM public.trades WHERE slug = p_trade) THEN
    RETURN public.refuse('Choose what kind of work it is.', 'trade');
  END IF;
  IF p_job_type IS NOT NULL THEN
    SELECT name INTO v_title FROM public.job_types WHERE id = p_job_type AND trade = p_trade;
    IF v_title IS NULL THEN
      RETURN public.refuse('That job does not belong to this kind of work.', 'job_type');
    END IF;
  ELSE
    v_title := 'Something else';
  END IF;

  -- Show us
  IF jsonb_typeof(v_media) <> 'array' OR jsonb_array_length(v_media) > 6 THEN
    RETURN public.refuse('Too many files for one job.', 'media');
  END IF;
  IF length(coalesce(v_desc, '')) > 500 THEN
    RETURN public.refuse('Please keep the description under 500 letters.', 'description');
  END IF;
  IF jsonb_array_length(v_media) = 0 AND length(coalesce(v_desc, '')) < 10 THEN
    RETURN public.refuse('Show us what is wrong: a voice note, a video, a photo, or a few words.', 'media');
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'voice') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'video') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'photo') > 4 THEN
    RETURN public.refuse('One voice note, one video and up to four photos.', 'media');
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_media) LOOP
    v_kind := v_item->>'kind';
    v_path := v_item->>'path';
    IF v_kind NOT IN ('voice', 'video', 'photo') OR v_path IS NULL
       OR v_path !~ ('^' || v_me::text || '/[A-Za-z0-9_-]{1,64}\.(m4a|mp4|aac|mp3|mov|3gp|jpg|jpeg|png|webp)$') THEN
      RETURN public.refuse('One of the files was not uploaded properly. Please add it again.', 'media');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'job-media' AND o.name = v_path) THEN
      RETURN public.refuse('One of the files did not finish uploading. Please try again.', 'media');
    END IF;
    IF EXISTS (SELECT 1 FROM public.job_media WHERE path = v_path) THEN
      RETURN public.refuse('That file already belongs to another job.', 'media');
    END IF;
  END LOOP;

  -- Price
  IF p_offer_paisa IS NULL OR p_offer_paisa % 100 <> 0 THEN
    RETURN public.refuse('Offer a price in whole rupees.', 'offer');
  END IF;
  IF p_offer_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('The lowest offer is Rs ' || to_char(public.setting('min_offer_paisa') / 100, 'FM999,999,999') || ': what it costs for somebody to come and look.', 'offer');
  END IF;
  -- The lowest for this job: a share of its usual price, set by the office (fast_posting).
  IF p_offer_paisa < public.price_floor(p_job_type) THEN
    RETURN public.refuse('The lowest for this job is Rs ' || to_char(public.price_floor(p_job_type) / 100, 'FM999,999,999') || '.', 'offer');
  END IF;
  IF p_offer_paisa > 50000000 THEN
    RETURN public.refuse('For work this size, write to the Pechkas office in the app first.', 'offer');
  END IF;

  -- When
  -- As soon as possible (older copies); a day, which is all the app asks
  -- now — the technician says in his offer when he will come; a day and a
  -- window (the copies that let the customer choose the time); or the older
  -- today / tomorrow with a part of the day.
  IF p_when_kind = 'now' THEN
    IF p_when_part IS NOT NULL OR p_when_date IS NOT NULL OR p_when_from IS NOT NULL THEN
      RETURN public.refuse('Choose when you want somebody.', 'when');
    END IF;
    v_wkind := 'now';
    v_wdate := v_today;
  ELSIF p_when_date IS NOT NULL THEN
    IF p_when_date < v_today OR p_when_date > v_today + 6 THEN
      RETURN public.refuse('Choose a day in the coming week.', 'when');
    END IF;
    IF p_when_from IS NOT NULL AND p_when_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Choose a time.', 'when');
    END IF;
    -- Today only while a technician could still come: jobs run 7am to 10pm (A116), so a
    -- job is for today until 9pm. A chosen window (older copies) must not have started.
    IF p_when_date = v_today AND (CASE WHEN p_when_from IS NULL THEN v_hour >= public.last_post_hour() ELSE p_when_from <= v_hour END) THEN
      RETURN public.refuse(CASE WHEN p_when_from IS NULL THEN 'It is too late for today. Choose tomorrow or another day.'
                                ELSE 'That time has already started. Choose a later one.' END, 'when');
    END IF;
    v_wdate := p_when_date;
    v_wfrom := p_when_from;
    v_wkind := CASE WHEN p_when_date = v_today THEN 'today' WHEN p_when_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END;
    v_wpart := CASE WHEN p_when_from IS NULL THEN NULL WHEN p_when_from < 12 THEN 'morning' WHEN p_when_from < 16 THEN 'afternoon' ELSE 'evening' END;
  ELSIF p_when_kind IN ('today', 'tomorrow') AND p_when_part IN ('morning', 'afternoon', 'evening') AND p_when_from IS NULL THEN
    v_wkind := p_when_kind;
    v_wpart := p_when_part;
    v_wdate := v_today + CASE WHEN p_when_kind = 'tomorrow' THEN 1 ELSE 0 END;
  ELSE
    RETURN public.refuse('Choose when you want somebody.', 'when');
  END IF;

  -- Where
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector) THEN
    RETURN public.refuse('Choose your sector.', 'sector');
  END IF;
  -- Every part of Islamabad (Bahria Town and DHA count), nowhere else yet (the owner, 25 November 2026).
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector AND city = 'islamabad') THEN
    RETURN public.refuse('Pechkas works in Islamabad only, for now.', 'sector');
  END IF;
  -- D37: risky work only where somebody can do it.
  IF NOT public.type_open(p_trade, p_job_type, p_sector) THEN
    RETURN public.refuse('This kind of job is not available on Pechkas yet.', 'job_type');
  END IF;
  IF length(v_street) < 1 OR length(v_street) > 60 THEN
    RETURN public.refuse('Write your street.', 'street');
  END IF;
  IF length(v_house) < 1 OR length(v_house) > 60 THEN
    RETURN public.refuse('Write your house number.', 'house');
  END IF;
  IF length(coalesce(v_land, '')) > 120 THEN
    RETURN public.refuse('Please keep the landmark short.', 'landmark');
  END IF;
  IF (p_lat IS NULL) <> (p_lng IS NULL)
     OR (p_lat IS NOT NULL AND (p_lat NOT BETWEEN 23 AND 37.5 OR p_lng NOT BETWEEN 60 AND 78)) THEN
    RETURN public.refuse('Your location did not come through. Try again, or leave it out.', 'location');
  END IF;

  -- Good to know
  IF p_power IS NOT NULL AND p_power NOT IN ('on', 'off') THEN
    RETURN public.refuse('Say whether the electricity is on.', 'power');
  END IF;
  IF p_parts IS NOT NULL AND p_parts NOT IN ('pro_buys', 'customer_has') THEN
    RETURN public.refuse('Say who brings the parts.', 'parts');
  END IF;
  IF length(coalesce(v_gate, '')) > 120 THEN
    RETURN public.refuse('Please keep the note for the gate short.', 'gate_note');
  END IF;
  IF public.looks_like_cnic(v_desc) OR public.looks_like_cnic(v_land) OR public.looks_like_cnic(v_gate) THEN
    RETURN public.refuse('Please do not write a CNIC number here.', 'description');
  END IF;

  -- Floods
  IF (SELECT count(*) FROM public.jobs WHERE customer_id = v_me AND status = 'open') >= public.setting('max_open_jobs') THEN
    RETURN public.refuse('You already have ' || public.setting('max_open_jobs') || ' jobs open. Cancel one you no longer need first.');
  END IF;
  IF (SELECT count(*) FROM public.jobs WHERE customer_id = v_me AND created_at > now() - interval '24 hours') >= public.setting('max_posts_per_day') THEN
    RETURN public.refuse('That is a lot of jobs for one day. Please write to the Pechkas office in the app.');
  END IF;

  INSERT INTO public.jobs (
    customer_id, trade, job_type_id, title, description, offered_paisa,
    when_kind, when_part, when_date, when_from, sector, street, house, landmark, lat, lng,
    power, parts, gate_note
  ) VALUES (
    v_me, p_trade, p_job_type, v_title, v_desc, p_offer_paisa,
    v_wkind, v_wpart, v_wdate, v_wfrom, p_sector, v_street, v_house, v_land, p_lat, p_lng,
    p_power, p_parts, v_gate
  ) RETURNING id, ref INTO v_job, v_ref;

  INSERT INTO public.job_media (job_id, kind, path, seconds)
  SELECT v_job, m->>'kind', m->>'path',
         CASE WHEN (m->>'seconds') ~ '^[0-9]{1,3}$' THEN (m->>'seconds')::smallint END
  FROM jsonb_array_elements(v_media) m;

  RETURN jsonb_build_object('ok', true, 'id', v_job, 'ref', v_ref);
END;
$$;

-- close_unclaimed: copied from 20261107000000_guarantee_followups.sql; only the lines about time changed.
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
               ELSE j.when_date < v_today OR (j.when_date = v_today AND v_hour >= public.day_closes_hour()) END
    RETURNING j.*
  LOOP
    IF v_job.paid_by_pechkas THEN
      PERFORM public.tell(v_job.customer_id, 'replacement_unclaimed', v_job.id, '/jobs', public.job_vars(v_job));
      PERFORM public.tell_office('replacement_unclaimed_office', v_job.id, public.job_vars(v_job));
    ELSE
      PERFORM public.tell(v_job.customer_id, 'unclaimed', v_job.id, '/jobs', public.job_vars(v_job));
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- reopen_job: copied from 20261112000000_reliability.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.reopen_job(p_job uuid, p_ended text, p_note text, p_kind text DEFAULT NULL)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_from  boolean;
  v_day   date;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job FOR UPDATE;
  INSERT INTO public.job_assignments (job_id, pro_id, assigned_at, assigned_by, ended, note, kind, agreed_paisa, when_date, when_from,
                                      window_start, on_way_at, arrived_at, arrival_verified_at, arrival_review_status, eta_at)
  VALUES (p_job, v_job.pro_id, v_job.assigned_at, v_job.assigned_by, p_ended, p_note, p_kind, v_job.agreed_paisa, v_job.when_date,
          v_job.when_from, public.window_start(v_job.when_date, v_job.when_from), v_job.on_way_at, v_job.arrived_at,
          v_job.arrival_verified_at, v_job.arrival_review_status, v_job.eta_at);
  -- The window came from his offer when she chose him: the next technician names his own.
  v_from := EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = p_job AND o.pro_id = v_job.pro_id
                    AND o.status = 'accepted' AND o.arrive_from IS NOT NULL);
  UPDATE public.offers SET status = 'withdrawn', updated_at = now()
  WHERE job_id = p_job AND pro_id = v_job.pro_id AND status = 'accepted';
  v_day := CASE
    WHEN v_job.when_kind = 'now' THEN v_job.when_date
    -- Its day while there is still time to take it: a job nobody took closes at 10pm on its day
    -- (close_unclaimed), so with less than an hour left it moves to tomorrow.
    WHEN v_job.when_date IS NULL OR v_job.when_date <= v_today THEN CASE WHEN v_hour >= public.last_post_hour() THEN v_today + 1 ELSE v_today END
    ELSE v_job.when_date END;
  -- A time she chose herself (older copies) that has already started cannot be promised to
  -- the next man: he names his own, as on every job the app posts now.
  IF v_job.when_kind <> 'now' AND v_job.when_from IS NOT NULL AND public.window_start(v_day, v_job.when_from) <= now() THEN
    v_from := true;
  END IF;
  UPDATE public.jobs
  SET status = 'open', pro_id = NULL, agreed_paisa = NULL, assigned_at = NULL, assigned_by = NULL,
      on_way_at = NULL, arrived_at = NULL, arrival_verified_at = NULL, arrival_review_status = NULL,
      arrival_review_note = NULL, arrival_reviewed_by_name = NULL, arrival_reviewed_at = NULL,
      visit_fee_paisa = NULL, code_tries = 0, code_locked_at = NULL, eta_at = NULL,
      when_from = CASE WHEN v_from THEN NULL ELSE when_from END,
      when_part = CASE WHEN v_from THEN NULL ELSE when_part END,
      when_date = v_day,
      when_kind = CASE WHEN when_kind = 'now' THEN 'now' WHEN v_day = v_today THEN 'today'
                       WHEN v_day = v_today + 1 THEN 'tomorrow' ELSE 'later' END,
      preferred_pro_id = NULL, preferred_until = NULL,
      announced_at = now(), nudged_at = NULL, needs_you_told_at = NULL, updated_at = now()
  WHERE id = p_job
  RETURNING * INTO v_job;
  PERFORM public.log_job(p_job, 'reopened', jsonb_build_object('ended', p_ended, 'day', v_day));
  PERFORM public.announce_again(v_job);
  RETURN v_job;
END;
$$;

-- make_offer: copied from 20261118000000_first_job_labour.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
  p_parts_paisa bigint,
  p_eta_minutes integer DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_arrive_from smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_max    bigint;
  v_owed   bigint;
  v_today  date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour   integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_gate   text;
  v_cap    text;
  v_parts  bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can make offers.');
  END IF;
  -- D36: read his position under the same lock as every payment, fee and reversal.
  PERFORM public.pay_lock(auth.uid());
  v_owed := public.pro_owed(auth.uid());
  IF v_owed > public.setting('credit_limit_paisa') THEN
    RETURN public.refuse('You owe Pechkas ' || public.rs(v_owed) || '. Pay it to make new offers.', 'owed');
  END IF;
  IF public.pay_blocked(auth.uid()) THEN
    RETURN public.refuse('Your new offers have stopped: ' || public.rs((public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint)
                         || ' you owe Pechkas is overdue. Pay it from My account and they start again.', 'overdue');
  END IF;
  -- A guarantee claim on his work that he has let run out stops new offers.
  IF public.claim_blocks(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('Your new offers have stopped until you answer the guarantee claim on your earlier job.', 'guarantee');
  END IF;

  -- A5: paused by rule after two payments not received in full. No end date: the office lifts it.
  IF public.pay_paused(auth.uid()) THEN
    RETURN public.refuse('Your new offers are paused: twice in ' || public.setting('claim_strike_days')
                         || ' days, Pechkas did not receive the full amount of a payment. Open My account to read why and to write to Pechkas.', 'pay_paused');
  END IF;
  -- Paused by the office (D11): told until when.
  IF public.pro_pause_until(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('The Pechkas office has paused your new offers until '
                         || to_char(public.pro_pause_until(auth.uid()) AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || ', '
                         || public.pk_clock(public.pro_pause_until(auth.uid())) || '.', 'paused');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  -- D37: his first jobs: one at a time, and only the kinds open to him.
  IF v_job.id IS NOT NULL AND v_job.status = 'open' THEN
    v_gate := public.pro_gate(auth.uid(), v_job.trade, v_job.job_type_id, v_job.sector, v_job.customer_id, v_job.id);
    IF v_gate = 'one_job' THEN
      RETURN public.refuse('On your first jobs you hold one job at a time. Finish the one you have first.', 'trial');
    END IF;
    IF v_gate IN ('risky', 'something_else') THEN
      RETURN public.refuse('This kind of job is not open to you yet.', 'trial');
    END IF;
  END IF;
  IF v_job.id IS NULL OR v_job.status <> 'open' OR NOT public.pro_may_see(p_job) OR v_job.customer_id = auth.uid() THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  v_max := (v_job.offered_paisa * public.setting('max_counter_bps')) / 10000;
  -- A guarantee repair is paid by Pechkas, up to what the original work was worth.
  IF v_job.paid_by_pechkas THEN
    v_max := least(v_max, v_job.pay_cap_paisa);
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 THEN
    RETURN public.refuse('Offer a price in whole rupees.', 'price');
  END IF;
  IF p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('That is below the lowest price for any job.', 'price');
  END IF;
  IF p_price_paisa > v_max THEN
    RETURN public.refuse('At most Rs ' || to_char(v_max / 100, 'FM999,999,999') || ' for this job.', 'price');
  END IF;
  -- D37, A104: the limit on his first jobs is on his WORK. Parts he says are in the price (with a
  -- shop receipt at the finish) are taken off first. Said only on a first job; anywhere else parts
  -- are said at the finish, as always. An older copy sends none: the whole price counts, as before.
  IF public.trade_level(auth.uid(), v_job.trade) = 'trial' AND coalesce(p_parts_paisa, 0) > 0 THEN
    IF p_parts_paisa % 100 <> 0 THEN
      RETURN public.refuse('Write the parts in whole rupees.', 'parts');
    END IF;
    IF p_parts_paisa >= p_price_paisa THEN
      RETURN public.refuse('Parts cannot be the whole price. Some of it is your work.', 'parts');
    END IF;
    v_parts := p_parts_paisa;
  END IF;
  v_cap := public.trial_cap_why(auth.uid(), v_job.trade, p_price_paisa - coalesce(v_parts, 0));
  IF v_cap IS NOT NULL THEN
    RETURN public.refuse(v_cap, 'price');
  END IF;

  -- When he will come. A job wanted now (older copies): how many minutes.
  -- A job whose customer chose the time or the part of the day (older
  -- copies): nothing to say. A job
  -- with only a day — every job the app posts now: nothing either: Google's
  -- minutes when she chooses him are his time (A116). An older copy may still
  -- name two hours, which then are his time, as before.
  IF v_job.when_kind = 'now' THEN
    IF p_eta_minutes IS NULL OR p_eta_minutes NOT BETWEEN 5 AND 480 THEN
      RETURN public.refuse('Say how soon you can be there.', 'eta');
    END IF;
    IF p_arrive_from IS NOT NULL THEN
      RETURN public.refuse('Say how soon you can be there.', 'eta');
    END IF;
  ELSIF v_job.when_from IS NOT NULL OR v_job.when_part IS NOT NULL OR v_job.when_date IS NULL THEN
    IF p_eta_minutes IS NOT NULL OR p_arrive_from IS NOT NULL THEN
      RETURN public.refuse('This job already has a time; no arrival time needed.', 'eta');
    END IF;
  ELSE
    IF p_eta_minutes IS NOT NULL THEN
      RETURN public.refuse('Say when you will arrive, not how many minutes.', 'arrive');
    END IF;
    IF v_job.when_date < v_today THEN
      RETURN public.refuse('This job is no longer open.');
    END IF;
    IF p_arrive_from IS NOT NULL AND p_arrive_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Say when you will arrive.', 'arrive');
    END IF;
    IF p_arrive_from IS NOT NULL AND v_job.when_date = v_today AND p_arrive_from <= v_hour THEN
      RETURN public.refuse('That time has already started. Choose a later one.', 'arrive');
    END IF;
  END IF;

  IF length(coalesce(v_note, '')) > 200 THEN
    RETURN public.refuse('Keep the note short.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  IF coalesce(v_note, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Do not write your number. The customer gets it when they choose you.', 'note');
  END IF;

  SELECT status INTO v_status FROM public.offers WHERE job_id = p_job AND pro_id = auth.uid();
  -- 'rejected' is not a refusal any more: on an open job it means somebody else was chosen and
  -- the job came back (D11), so he may offer again. The man who left it is shut out above.
  IF v_status = 'accepted' THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  INSERT INTO public.offers AS o (job_id, pro_id, price_paisa, parts_paisa, eta_minutes, arrive_from, note, status, expires_at)
  VALUES (p_job, auth.uid(), p_price_paisa, v_parts, p_eta_minutes, p_arrive_from, v_note, 'pending',
          now() + make_interval(mins => public.setting('offer_minutes')::integer))
  ON CONFLICT (job_id, pro_id) DO UPDATE SET
    price_paisa = EXCLUDED.price_paisa,
    parts_paisa = EXCLUDED.parts_paisa,
    eta_minutes = EXCLUDED.eta_minutes,
    arrive_from = EXCLUDED.arrive_from,
    note = EXCLUDED.note,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.last_post_hour() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_closes_hour() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_open_at(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.due_of(public.jobs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_from(public.jobs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.no_show_from(public.jobs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eta_latest(public.jobs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_kind_of(timestamptz, public.jobs, timestamptz, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fix_due() FROM PUBLIC, anon, authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261205000000_late_from_minutes')
ON CONFLICT (name) DO NOTHING;

COMMIT;
