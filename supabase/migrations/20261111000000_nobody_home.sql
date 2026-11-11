-- =============================================================================
--  Nobody home: protecting the technician without blaming the customer
-- =============================================================================
--
--  The owner's decision D34 (11 November 2026). He has tapped "I have
--  arrived" and cannot get in: nobody answers, or the guard will not let
--  him through.
--
--  THE STEPS, each stamped by the database's own clock
--    1. He asks Pechkas to tell her (pro_cannot_get_in). "Nobody is
--       answering" only once his window has started and 15 minutes have
--       passed since the later of his Arrived and the window's start. "The
--       guard will not let me in" once his window has started, at once:
--       she can fix it by ringing her guard.
--    2. She is told, and has 10 minutes. "I'm coming" gives her 10 more,
--       once (customer_not_home_coming). She may also cancel (D10).
--    3. If the start code has not been given by then, he may report it, with
--       a fresh photo from Pechkas' camera (pro_report_not_home). The job
--       closes, cancelled by the technician.
--    4. A report is an allegation, not a finding. She may say "I was home"
--       within 24 hours (customer_dispute_not_home), and the office
--       confirms or rejects every report with a note (admin_not_home).
--
--  WHAT COUNTS
--    · Only an office-CONFIRMED "nobody home" counts towards her review
--      (3 in 60 days, flag_not_home), and never one where he arrived more
--      than 30 minutes after his window began.
--    · "Guard refused entry" counts against neither of them.
--    · His own "nobody home" reports are counted too (3 in 60 days,
--      flag_not_home_reports): an investigation, never a suspension.
--    · A disputed report counts against nobody until the office decides.
--
--  NO MONEY, EVER, FROM A REPORT
--    The job is CANCELLED, never stopped, so no visit fee (D12) can arise,
--    and nothing here writes the ledger, a debt or a payment. What his wasted
--    trip would have been worth is kept, as a reference only, in
--    uncompensated_visits, for the owner to decide later whether Pechkas
--    should pay technicians for them.
--
--  No GPS. No rescheduling. Safe to run twice.
-- =============================================================================

BEGIN;


-- --- Settings ------------------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('flag_not_home', 3, 'count', 'Office-confirmed "nobody home" reports about one customer, within flag_days, that ask the office to review her account. Nothing happens automatically.'),
  ('flag_not_home_reports', 3, 'count', '"Nobody home" reports made by one technician, within flag_days, that ask the office to look into them. Never a suspension.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('flag_not_home', 1, 20),
  ('flag_not_home_reports', 1, 20)
ON CONFLICT (key) DO NOTHING;


-- --- What the existing records may now say -------------------------------------------------------

-- The technician can now end a job, only by this report.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_cancelled_by_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_cancelled_by_check CHECK (cancelled_by IN ('customer', 'office', 'nobody', 'pro'));
ALTER TABLE public.cancellations DROP CONSTRAINT IF EXISTS cancellations_cancelled_by_check;
ALTER TABLE public.cancellations ADD CONSTRAINT cancellations_cancelled_by_check
  CHECK (cancelled_by IN ('customer', 'office', 'nobody', 'pro'));
ALTER TABLE public.cancellations DROP CONSTRAINT IF EXISTS cancellations_category_check;
ALTER TABLE public.cancellations ADD CONSTRAINT cancellations_category_check
  CHECK (category IN ('before_choosing', 'normal', 'late', 'pro_late', 'no_show', 'office', 'unclaimed', 'before_rules',
                      'not_home', 'guard'));
-- His photo of the gate.
ALTER TABLE public.job_photos DROP CONSTRAINT IF EXISTS job_photos_stage_check;
ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_stage_check
  CHECK (stage IN ('before', 'after', 'change', 'receipt', 'video', 'fix', 'gate'));


-- --- The record --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.not_home_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id           uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (reason IN ('nobody_home', 'guard')),
  -- asking → coming → (answered: she let him in | closed: the job ended another way)
  --         → submitted (awaiting review) → disputed → confirmed | rejected
  status           text NOT NULL CHECK (status IN ('asking', 'coming', 'answered', 'closed', 'submitted', 'disputed', 'confirmed', 'rejected')),
  status_before    text,
  arrived_at       timestamptz,
  window_start     timestamptz,
  -- He tapped Arrived more than 30 minutes after his window began: then it
  -- can never count against her.
  pro_was_late     boolean NOT NULL DEFAULT false,
  minutes_late     integer,
  asked_at         timestamptz NOT NULL DEFAULT now(),
  customer_told_at timestamptz,
  coming_at        timestamptz,
  deadline         timestamptz NOT NULL,
  submitted_at     timestamptz,
  photo_path       text,
  pro_note         text CHECK (pro_note IS NULL OR length(pro_note) <= 300),
  customer_text    text CHECK (customer_text IS NULL OR length(customer_text) <= 300),
  customer_said_at timestamptz,
  office_note      text CHECK (office_note IS NULL OR length(office_note) <= 300),
  decided_by_name  text,
  decided_at       timestamptz
);
ALTER TABLE public.not_home_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.not_home_reports FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS not_home_reports_pro ON public.not_home_reports (pro_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS not_home_reports_customer ON public.not_home_reports (customer_id, submitted_at DESC);

/**
 * Every visit he made that nobody paid for, for the owner to see what
 * no-shows really cost before deciding whether Pechkas should pay for them.
 * No customer is named, and the record outlives her account (the report
 * itself goes with it); his id is cleared if he deletes his. The visit fee
 * is the figure fixed on that job, kept as a reference only: it was never
 * charged to anybody and never paid to him.
 */
CREATE TABLE IF NOT EXISTS public.uncompensated_visits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           uuid UNIQUE REFERENCES public.not_home_reports(id) ON DELETE SET NULL,
  pro_id              uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  job_ref             text NOT NULL,
  trade               text NOT NULL,
  sector              text NOT NULL,
  day                 date NOT NULL,
  reason              text NOT NULL CHECK (reason IN ('nobody_home', 'guard')),
  minutes_waited      integer NOT NULL,
  visit_fee_ref_paisa bigint,
  outcome             text NOT NULL CHECK (outcome IN ('submitted', 'disputed', 'confirmed', 'rejected')),
  recorded_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uncompensated_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uncompensated_visits FROM anon, authenticated;

/** The analysis record follows the report's outcome, until the report is gone. */
CREATE OR REPLACE FUNCTION public.follow_not_home_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('submitted', 'disputed', 'confirmed', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.uncompensated_visits SET outcome = NEW.status WHERE report_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS not_home_outcome ON public.not_home_reports;
CREATE TRIGGER not_home_outcome AFTER UPDATE OF status ON public.not_home_reports
  FOR EACH ROW EXECUTE FUNCTION public.follow_not_home_outcome();

/**
 * While she is being asked, the job can still go on: the start code ends
 * the asking (she let him in); any other end of the job closes it.
 */
CREATE OR REPLACE FUNCTION public.end_not_home_asking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.stage = 'working' AND OLD.stage IS DISTINCT FROM 'working' THEN
    UPDATE public.not_home_reports SET status = 'answered' WHERE job_id = NEW.id AND status IN ('asking', 'coming');
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'assigned' THEN
    UPDATE public.not_home_reports SET status = 'closed' WHERE job_id = NEW.id AND status IN ('asking', 'coming');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_not_home_asking ON public.jobs;
CREATE TRIGGER job_not_home_asking AFTER UPDATE OF status, stage ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.end_not_home_asking();

/** When he may first ask, by the rule above; NULL until he has arrived. */
CREATE OR REPLACE FUNCTION public.not_home_from(p_job public.jobs, p_reason text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_job.arrived_at IS NULL THEN NULL
    WHEN p_reason = 'guard' THEN greatest(p_job.arrived_at, coalesce(public.window_start(p_job.when_date, p_job.when_from), p_job.arrived_at))
    ELSE greatest(p_job.arrived_at, coalesce(public.window_start(p_job.when_date, p_job.when_from), p_job.arrived_at)) + interval '15 minutes'
  END;
$$;

/** What each side may read of a job's report, and what each may do now. */
CREATE OR REPLACE FUNCTION public.not_home_view(p_job uuid, p_side text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
      'reason', r.reason, 'status', r.status, 'asked_at', r.asked_at, 'coming_at', r.coming_at,
      'deadline', r.deadline, 'submitted_at', r.submitted_at, 'decided_at', r.decided_at,
      'office_note', CASE WHEN r.status IN ('confirmed', 'rejected') THEN r.office_note END,
      'pro_was_late', r.pro_was_late,
      'can_report', p_side = 'pro' AND r.status IN ('asking', 'coming') AND now() >= r.deadline,
      'can_say_coming', p_side = 'customer' AND r.status = 'asking',
      'can_dispute', p_side = 'customer' AND r.status = 'submitted' AND r.reason = 'nobody_home'
                     AND r.submitted_at > now() - interval '24 hours',
      'dispute_until', CASE WHEN r.status = 'submitted' THEN r.submitted_at + interval '24 hours' END,
      'customer_text', CASE WHEN p_side = 'customer' THEN r.customer_text END)
  FROM public.not_home_reports r
  WHERE r.job_id = p_job;
$$;


-- --- His side --------------------------------------------------------------------------------------

/**
 * He cannot get in: Pechkas tells her, and the clock for her answer starts.
 * Refusals say from when he may ask (`from`), so the screen can count down.
 */
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
  IF EXISTS (SELECT 1 FROM public.not_home_reports r WHERE r.job_id = p_job) THEN
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
  v_minutes := CASE WHEN v_start IS NOT NULL THEN floor(extract(epoch FROM (v_job.arrived_at - v_start)) / 60)::integer END;
  INSERT INTO public.not_home_reports (job_id, pro_id, customer_id, reason, status, arrived_at, window_start,
                                       pro_was_late, minutes_late, customer_told_at, deadline)
  VALUES (p_job, v_job.pro_id, v_job.customer_id, p_reason, 'asking', v_job.arrived_at, v_start,
          coalesce(v_job.arrived_at >= v_start + interval '30 minutes', false), v_minutes, now(), v_deadline);
  PERFORM public.log_job(p_job, 'not_home_asked', jsonb_build_object('reason', p_reason));
  PERFORM public.tell(v_job.customer_id, CASE WHEN p_reason = 'guard' THEN 'guard_ask' ELSE 'not_home_ask' END, p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)));
  RETURN jsonb_build_object('ok', true, 'deadline', v_deadline);
END;
$$;

/** Nobody came: he reports it, with a photo taken now. The job closes. No money moves. */
CREATE OR REPLACE FUNCTION public.pro_report_not_home(p_job uuid, p_photo text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs%ROWTYPE;
  v_rep     public.not_home_reports%ROWTYPE;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_problem text;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  SELECT * INTO v_rep FROM public.not_home_reports WHERE job_id = p_job FOR UPDATE;
  IF v_rep.id IS NULL OR v_rep.status NOT IN ('asking', 'coming') OR v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('Ask Pechkas to tell the customer first.', 'stage');
  END IF;
  IF now() < v_rep.deadline THEN
    RETURN public.refuse('The customer still has time to answer. Please wait.', 'wait')
           || jsonb_build_object('from', v_rep.deadline);
  END IF;
  v_problem := public.own_uploads(CASE WHEN p_photo IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_photo) END, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;
  IF length(coalesce(v_note, '')) > 300 OR public.looks_like_cnic(v_note)
     OR regexp_replace(coalesce(v_note, ''), '[^0-9]', '', 'g') ~ '[0-9]{7}' THEN
    RETURN public.refuse('Keep the note short, with no phone numbers.', 'note');
  END IF;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, v_job.pro_id, 'gate', p_photo);
  UPDATE public.not_home_reports
  SET status = 'submitted', status_before = v_rep.status, submitted_at = now(), photo_path = p_photo, pro_note = v_note
  WHERE id = v_rep.id;
  INSERT INTO public.uncompensated_visits (report_id, pro_id, job_ref, trade, sector, day, reason, minutes_waited,
                                           visit_fee_ref_paisa, outcome)
  VALUES (v_rep.id, v_job.pro_id, v_job.ref, v_job.trade, v_job.sector, (now() AT TIME ZONE 'Asia/Karachi')::date, v_rep.reason,
          floor(extract(epoch FROM (now() - v_job.arrived_at)) / 60)::integer, public.visit_fee(p_job), 'submitted')
  ON CONFLICT (report_id) DO NOTHING;
  -- Cancelled, never stopped: no visit fee can come of it (D12 stays apart).
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'pro', cancel_for = CASE WHEN v_rep.reason = 'guard' THEN 'other' ELSE 'customer' END,
      cancel_reason = CASE WHEN v_rep.reason = 'guard' THEN 'The guard did not let the technician in.' ELSE 'Nobody answered at the door.' END,
      updated_at = now()
  WHERE id = p_job;
  PERFORM public.log_job(p_job, 'not_home_reported', jsonb_build_object('reason', v_rep.reason));
  PERFORM public.tell(v_job.customer_id, CASE WHEN v_rep.reason = 'guard' THEN 'guard_reported' ELSE 'not_home_reported' END, p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Her side ----------------------------------------------------------------------------------------

/** "I'm coming": ten more minutes, once. */
CREATE OR REPLACE FUNCTION public.customer_not_home_coming(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_rep public.not_home_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  SELECT * INTO v_rep FROM public.not_home_reports WHERE job_id = p_job FOR UPDATE;
  IF v_rep.status = 'coming' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'deadline', v_rep.deadline);
  END IF;
  IF v_rep.id IS NULL OR v_rep.status <> 'asking' OR v_job.status <> 'assigned' THEN
    RETURN public.refuse('This has already been settled.');
  END IF;
  UPDATE public.not_home_reports SET status = 'coming', coming_at = now(), deadline = now() + interval '10 minutes'
  WHERE id = v_rep.id RETURNING * INTO v_rep;
  PERFORM public.log_job(p_job, 'not_home_coming');
  PERFORM public.tell(v_job.pro_id, 'not_home_coming', p_job, '/pro', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true, 'deadline', v_rep.deadline);
END;
$$;

/** "I was home": once, within 24 hours. It goes to the office and counts against nobody until it decides. */
CREATE OR REPLACE FUNCTION public.customer_dispute_not_home(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rep  public.not_home_reports%ROWTYPE;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT r.* INTO v_rep FROM public.not_home_reports r
  WHERE r.job_id = p_job AND r.customer_id = auth.uid() FOR UPDATE;
  IF v_rep.id IS NULL THEN
    RETURN public.refuse('There is no such report.');
  END IF;
  IF v_rep.status <> 'submitted' OR v_rep.reason <> 'nobody_home' THEN
    RETURN public.refuse('This has already gone to the Pechkas office.');
  END IF;
  IF v_rep.submitted_at <= now() - interval '24 hours' THEN
    RETURN public.refuse('More than 24 hours have passed. Please call the Pechkas office.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Say what happened, in a sentence.', 'text');
  END IF;
  UPDATE public.not_home_reports
  SET status = 'disputed', status_before = 'submitted', customer_text = v_text, customer_said_at = now()
  WHERE id = v_rep.id;
  PERFORM public.log_job(p_job, 'not_home_disputed');
  PERFORM public.tell_office('not_home_disputed', p_job, (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = p_job));
  PERFORM public.tell(v_rep.pro_id, 'not_home_disputed_pro', p_job, '/pro/money', (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = p_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The office ------------------------------------------------------------------------------------

/** Confirm (it happened as he said) or reject (it did not), with a note both read in the app. */
CREATE OR REPLACE FUNCTION public.admin_not_home(p_report uuid, p_confirm boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rep  public.not_home_reports%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_vars jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_rep FROM public.not_home_reports WHERE id = p_report FOR UPDATE;
  IF v_rep.id IS NULL THEN
    RETURN public.refuse('There is no such report.');
  END IF;
  IF v_rep.status NOT IN ('submitted', 'disputed') THEN
    RETURN public.refuse('This report has already been decided.');
  END IF;
  IF p_confirm IS NULL THEN
    RETURN public.refuse('Choose confirm or reject.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a sentence. Both of them read it in the app.', 'note');
  END IF;
  UPDATE public.not_home_reports
  SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'rejected' END, status_before = v_rep.status, office_note = v_note,
      decided_by_name = (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()), decided_at = now()
  WHERE id = p_report;
  PERFORM public.log_job(v_rep.job_id, 'not_home_decided', jsonb_build_object('confirmed', p_confirm, 'note', v_note));
  v_vars := (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = v_rep.job_id);
  PERFORM public.tell(v_rep.customer_id, 'not_home_decided', v_rep.job_id, '/jobs', v_vars);
  PERFORM public.tell(v_rep.pro_id, 'not_home_decided_pro', v_rep.job_id, '/pro/money', v_vars);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Every report with its timeline and the notifications sent, and the uncompensated visits. */
CREATE OR REPLACE FUNCTION public.admin_not_home_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'job_id', r.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(r.customer_id),
          'pro', x.full_name, 'pro_phone', public.phone_of(r.pro_id),
          'reason', r.reason, 'status', r.status, 'arrived_at', r.arrived_at, 'window_start', r.window_start,
          'pro_was_late', r.pro_was_late, 'minutes_late', r.minutes_late, 'asked_at', r.asked_at,
          'customer_told_at', r.customer_told_at, 'coming_at', r.coming_at, 'deadline', r.deadline,
          'submitted_at', r.submitted_at, 'photo', r.photo_path, 'pro_note', r.pro_note,
          'customer_text', r.customer_text, 'customer_said_at', r.customer_said_at,
          'office_note', r.office_note, 'decided_by_name', r.decided_by_name, 'decided_at', r.decided_at,
          'needs_you', r.status IN ('submitted', 'disputed'),
          'history', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'what', e.what, 'by', e.actor) ORDER BY e.at)
                               FROM public.job_events e WHERE e.job_id = r.job_id
                                 AND e.what IN ('arrived', 'not_home_asked', 'not_home_coming', 'not_home_reported',
                                                'not_home_disputed', 'not_home_decided', 'cancelled')), '[]'::jsonb),
          'told', coalesce((SELECT jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'phones', l.phones) ORDER BY l.created_at)
                            FROM public.push_log l WHERE l.job_id = r.job_id
                              AND (l.kind LIKE 'not_home%' OR l.kind LIKE 'guard%' OR l.kind = 'arrived')), '[]'::jsonb))
        ORDER BY (r.status IN ('submitted', 'disputed')) DESC, r.submitted_at DESC NULLS LAST, r.asked_at DESC)
      FROM public.not_home_reports r
      JOIN public.jobs j ON j.id = r.job_id
      JOIN public.profiles p ON p.id = r.customer_id
      LEFT JOIN public.pros x ON x.id = r.pro_id
      WHERE r.status NOT IN ('answered', 'closed')
        AND (r.asked_at > now() - interval '180 days' OR r.status IN ('submitted', 'disputed'))), '[]'::jsonb),
    'uncompensated', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'job_ref', u.job_ref, 'trade', u.trade, 'sector', u.sector, 'day', u.day, 'reason', u.reason,
          'pro', x.full_name, 'minutes_waited', u.minutes_waited, 'visit_fee_ref_paisa', u.visit_fee_ref_paisa,
          'outcome', u.outcome) ORDER BY u.recorded_at DESC)
      FROM public.uncompensated_visits u LEFT JOIN public.pros x ON x.id = u.pro_id
      WHERE u.recorded_at > now() - interval '365 days'), '[]'::jsonb),
    'uncompensated_by_month', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'month' DESC)
      FROM (
        SELECT jsonb_build_object('month', to_char(u.day, 'YYYY-MM'), 'visits', count(*),
                                  'nobody_home', count(*) FILTER (WHERE u.reason = 'nobody_home'),
                                  'guard', count(*) FILTER (WHERE u.reason = 'guard'),
                                  'confirmed', count(*) FILTER (WHERE u.outcome = 'confirmed'),
                                  'minutes_waited', sum(u.minutes_waited),
                                  'visit_fee_ref_paisa', sum(u.visit_fee_ref_paisa)) AS x
        FROM public.uncompensated_visits u
        GROUP BY to_char(u.day, 'YYYY-MM')) s), '[]'::jsonb)
  );
END;
$$;


-- --- Joined to what is already there (D10's record, the flags, the screens) -------------------

/** Who is told what when a job moves, as before; a job he closed himself (nobody home) does not tell him to stay away. */
CREATE OR REPLACE FUNCTION public.on_job_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vars jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NULL;
  END IF;
  v_vars := public.job_vars(NEW)
         || jsonb_build_object('price', public.rs(coalesce(NEW.collect_paisa, NEW.agreed_paisa, NEW.offered_paisa)),
                               'fee', public.rs(coalesce(NEW.collect_paisa, public.setting('visit_fee_min_paisa'))),
                               'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = NEW.pro_id), 'Your technician'));

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'open' AND NEW.status = 'assigned' AND NEW.pro_id IS NOT NULL THEN
      IF NEW.assigned_by = 'office' THEN
        PERFORM public.tell(NEW.pro_id, 'office_gave', NEW.id, '/pro', v_vars);
        PERFORM public.tell(NEW.customer_id, 'office_assigned', NEW.id, '/jobs', v_vars);
      ELSE
        PERFORM public.tell(NEW.pro_id, 'chosen', NEW.id, '/pro', v_vars);
      END IF;
    ELSIF OLD.status = 'assigned' AND NEW.status = 'cancelled' AND OLD.pro_id IS NOT NULL
          AND NEW.cancelled_by IS DISTINCT FROM 'pro' THEN
      PERFORM public.tell(OLD.pro_id, 'cancelled', NEW.id, '/pro', v_vars);
    ELSIF NEW.status = 'done' THEN
      PERFORM public.tell(NEW.customer_id, 'done', NEW.id, '/jobs', v_vars);
    ELSIF NEW.status = 'stopped' THEN
      -- Why it stopped decides what he is told. The office's "not finished"
      -- decisions are told by dispute_decided instead.
      v_vars := v_vars || jsonb_build_object('fee', public.rs(public.visit_fee(NEW.id)));
      IF NEW.stop_reason = 'office_declined' THEN
        PERFORM public.tell(NEW.pro_id, CASE WHEN NEW.paid_by_pechkas THEN 'stopped_office_paid' ELSE 'stopped_office' END,
                            NEW.id, '/pro', v_vars);
      ELSIF NEW.stop_reason IS NULL OR NEW.stop_reason = 'declined' THEN
        PERFORM public.tell(NEW.pro_id, 'stopped', NEW.id, '/pro', v_vars);
      END IF;
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_by = 'office' THEN
      PERFORM public.tell(NEW.customer_id, 'office_cancelled', NEW.id, '/jobs', v_vars);
    END IF;
  ELSIF NEW.stage = 'on_way' THEN
    PERFORM public.tell(NEW.customer_id, 'on_way', NEW.id, '/jobs', v_vars);
  ELSIF NEW.stage = 'arrived' THEN
    PERFORM public.tell(NEW.customer_id, 'arrived', NEW.id, '/jobs', v_vars);
  END IF;
  RETURN NULL;
END;
$$;


/** D10's one record per cancelled job, as before, with D34's two labels. */
CREATE OR REPLACE FUNCTION public.record_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start    timestamptz := public.window_start(NEW.when_date, NEW.when_from);
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
                                                 FROM public.not_home_reports r WHERE r.job_id = NEW.id), 'not_home')
    ELSE public.cancel_kind(now(), v_start, NEW.on_way_at, NEW.arrived_at, OLD.stage, OLD.status = 'assigned')
  END;
  INSERT INTO public.cancellations (job_id, customer_id, pro_id, cancelled_by, cancel_for, category, reason_code, reason_text,
                                    stage, window_start, on_way_at, arrived_at)
  VALUES (NEW.id, NEW.customer_id, CASE WHEN OLD.status = 'assigned' THEN OLD.pro_id END,
          coalesce(NEW.cancelled_by, 'customer'), NEW.cancel_for, v_category, NEW.cancel_code, NEW.cancel_reason,
          OLD.stage, v_start, NEW.on_way_at, NEW.arrived_at)
  ON CONFLICT (job_id) DO NOTHING;

  -- Cancelled because he had not come: that lateness is his, on his record (once per job).
  IF v_category IN ('pro_late', 'no_show') AND OLD.pro_id IS NOT NULL AND NEW.arrived_at IS NULL THEN
    v_minutes := floor(extract(epoch FROM (now() - v_start)) / 60)::integer;
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (NEW.id, OLD.pro_id, CASE WHEN v_category = 'no_show' THEN 'no_show' ELSE 'late_arrival' END,
            CASE WHEN v_category = 'no_show' THEN 'potential' ELSE 'recorded' END, v_start, v_minutes, 'cancelled_waiting')
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'cancel_recorded', jsonb_build_object('category', v_category, 'code', NEW.cancel_code));
  RETURN NULL;
END;
$$;


/** Her jobs, as before, with the nobody-home report on that job. */
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
      'can_cancel', j.status = 'open' OR (j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')),
      'cancel_kind_now', CASE
        WHEN j.status = 'open' THEN 'before_choosing'
        WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')
          THEN public.cancel_kind(now(), public.window_start(j.when_date, j.when_from), j.on_way_at, j.arrived_at, j.stage, true) END,
      'pro_late', j.status = 'assigned' AND j.stage IN ('chosen', 'on_way')
                  AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
      'no_show', EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.kind = 'no_show' AND i.status = 'potential'),
      'cancel_code', j.cancel_code,
      'cancel_category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = j.id),
      -- He cannot get in (D34): being asked, "I'm coming", and "I was home".
      'not_home', public.not_home_view(j.id, 'customer')
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;


/** His jobs, as before, with when he may ask Pechkas to tell her and what has happened since. */
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
      'late', j.stage IN ('chosen', 'on_way') AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
      -- He cannot get in (D34): from when he may ask, and where it stands.
      'not_home_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'nobody_home') END,
      'guard_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'guard') END,
      'not_home', public.not_home_view(j.id, 'pro')
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;


/** His record, as before, with the nobody-home reports he made and what the office decided. */
CREATE OR REPLACE FUNCTION public.pro_record()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'late_arrivals', (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = auth.uid() AND i.kind = 'late_arrival'
                        AND i.status <> 'dismissed' AND i.detected_at > now() - make_interval(days => public.setting('flag_days')::integer)),
    'no_shows', (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = auth.uid() AND i.kind = 'no_show'
                   AND i.status = 'confirmed' AND i.detected_at > now() - make_interval(days => public.setting('flag_days')::integer)),
    'review_at', public.setting('flag_late_arrivals'),
    'no_shows_at', public.setting('flag_no_shows'),
    'days', public.setting('flag_days'),
    'not_home_reports_at', public.setting('flag_not_home_reports'),
    'not_home_reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'ref', j.ref, 'trade', j.trade, 'reason', r.reason, 'status', r.status,
          'submitted_at', r.submitted_at, 'office_note', r.office_note, 'decided_at', r.decided_at)
        ORDER BY r.submitted_at DESC)
      FROM public.not_home_reports r JOIN public.jobs j ON j.id = r.job_id
      WHERE r.pro_id = auth.uid() AND r.submitted_at > now() - interval '90 days'), '[]'::jsonb),
    'incidents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'kind', i.kind, 'status', i.status, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'window_start', i.window_start, 'arrived_at', i.arrived_at, 'minutes_late', i.minutes_late, 'how', i.how,
          'detected_at', i.detected_at, 'pro_text', i.pro_text, 'office_note', i.office_note, 'decided_at', i.decided_at,
          'can_dispute', i.status IN ('recorded', 'potential', 'confirmed') AND i.pro_said_at IS NULL)
        ORDER BY i.detected_at DESC)
      FROM public.pro_incidents i JOIN public.jobs j ON j.id = i.job_id
      WHERE i.pro_id = auth.uid() AND i.detected_at > now() - interval '90 days'), '[]'::jsonb));
$$;


/** The flags, as before, with D34's two: confirmed nobody-home for her, his own reports for him. */
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
    SELECT r.id, r.full_name AS name, public.phone_of(u.id) AS phone, r.status,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since) AS finished,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'stopped' AND j.finished_at >= v_since) AS stopped,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since
         AND EXISTS (SELECT 1 FROM public.job_changes c WHERE c.job_id = j.id)) AS raised,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         AND j.parts_paisa * 10000 >= j.collect_paisa * public.setting('flag_parts_bps')) AS parts,
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'code_wrong' AND e.at >= v_since) AS codes,
      -- His own lateness only (cancellations): never a customer changing her mind.
      (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'late_arrival'
         AND i.status <> 'dismissed' AND i.detected_at >= v_since) AS late_arrivals,
      (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'no_show'
         AND i.status = 'confirmed' AND i.detected_at >= v_since) AS no_shows,
      -- "Nobody home" reports he made (D34), except those still disputed.
      (SELECT count(*) FROM public.not_home_reports x WHERE x.pro_id = r.id AND x.reason = 'nobody_home'
         AND x.status IN ('submitted', 'confirmed', 'rejected') AND x.submitted_at >= v_since) AS not_home_reports,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.pro_id = r.id AND x.side = 'customer' AND x.kind IN ('problem', 'guarantee') AND x.created_at >= v_since) AS complaints,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = r.id AND x.side = 'customer' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      (SELECT coalesce(max(n), 0) FROM (
         SELECT count(*) AS n FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         GROUP BY j.customer_id) g) AS same_customer,
      (SELECT count(*) FROM public.blocks b WHERE b.pro_id = r.id AND b.created_at >= v_since) AS blocked,
      -- Jobs where his price for the work was well above what jobs of that
      -- kind usually go for. Only kinds with a range at all count.
      (SELECT count(*) FROM public.jobs j, LATERAL (SELECT public.price_range_of(j.job_type_id) AS pr) x
         WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since AND x.pr IS NOT NULL
           AND (j.agreed_paisa - coalesce(j.parts_paisa, 0)) * 10000
               > (x.pr ->> 'high_paisa')::bigint * (10000 + public.setting('flag_price_over_bps'))) AS price_over,
      -- Finished jobs that closed by the clock, nobody having checked them.
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         AND j.confirmed_by = 'clock') AS unchecked,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since) AS done_jobs,
      -- Guarantee claims on his work, except those the office found not covered.
      (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = r.id AND c.status <> 'not_covered'
         AND c.created_at >= now() - interval '60 days') AS claims60,
      (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = r.id AND c.status <> 'not_covered'
         AND c.created_at >= now() - interval '90 days') AS claims90
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
        public.flag_if('late_arrivals', p.late_arrivals, public.setting('flag_late_arrivals')),
        public.flag_if('no_shows', p.no_shows, public.setting('flag_no_shows')),
        public.flag_if('not_home_reports', p.not_home_reports, public.setting('flag_not_home_reports')),
        public.flag_if('complaints', p.complaints, public.setting('flag_problems')),
        public.flag_if('low_stars', p.low_stars, public.setting('flag_low_stars')),
        public.flag_if('same_customer', p.same_customer, public.setting('flag_same_pair')),
        public.flag_if('blocked', p.blocked, public.setting('flag_blocked')),
        public.flag_if('price_over', p.price_over, public.setting('flag_price_over_jobs')),
        CASE WHEN p.unchecked >= public.setting('flag_unchecked_jobs')
                  AND p.unchecked * 10000 >= p.done_jobs * public.setting('flag_unchecked_bps')
             THEN public.flag_if('unchecked', p.unchecked, 1, p.done_jobs) END,
        CASE WHEN p.claims90 >= public.setting('flag_guarantee_review')
             THEN public.flag_if('guarantee_review', p.claims90, public.setting('flag_guarantee_review'))
             ELSE public.flag_if('guarantee', p.claims60, public.setting('flag_guarantee_jobs')) END
      ], NULL) AS flags
    FROM pro p
  ),
  cust AS (
    SELECT c.id, c.first_name AS name, public.phone_of(u.id) AS phone,
      -- Late cancellations only: at the door, within 2 hours, or once he was on his way.
      (SELECT count(*) FROM public.cancellations x WHERE x.customer_id = c.id AND x.category = 'late'
         AND x.cancelled_at >= v_since) AS late_cancels,
      -- Nobody home, confirmed by the office, and never when he was late (D34).
      (SELECT count(*) FROM public.not_home_reports x WHERE x.customer_id = c.id AND x.reason = 'nobody_home'
         AND x.status = 'confirmed' AND NOT x.pro_was_late AND x.submitted_at >= v_since) AS not_home,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.side = 'pro' AND x.kind = 'problem' AND x.created_at >= v_since) AS reports,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = c.id AND x.side = 'pro' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      -- "Not finished yet" twice, and the office found the work finished.
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.dispute_outcome = 'done' AND j.disputed_at >= v_since) AS overruled
    FROM public.profiles c LEFT JOIN auth.users u ON u.id = c.id
    -- Customer mode now, or ever posted a job: a technician who books a
    -- repair is still a customer for that job, whichever mode he is in today.
    WHERE c.role = 'customer' OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.customer_id = c.id)
  ),
  cust_flags AS (
    SELECT c.*, array_remove(ARRAY[
        public.flag_if('late_cancels', c.late_cancels, public.setting('flag_late_cancels')),
        public.flag_if('not_home', c.not_home, public.setting('flag_not_home')),
        public.flag_if('reports', c.reports, public.setting('flag_problems')),
        public.flag_if('low_stars', c.low_stars, public.setting('flag_low_stars')),
        public.flag_if('overruled', c.overruled, public.setting('flag_overruled'))
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
    'limits', (SELECT jsonb_object_agg(s.key, s.value) FROM public.settings s WHERE s.key LIKE 'flag\_%'
               AND s.key NOT IN ('flag_cancelled', 'flag_customer_cancels')),
    'people', v_rows
  );
END;
$$;


-- --- What the phones are told -------------------------------------------------------------------
-- Trade, first names and the job number only. Never the address, her words,
-- his note or the office's: those are read in the app.

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('not_home_ask.title',          504, NULL, '{pro} is at your door', 'customer'),
  ('not_home_ask.body',           505, NULL, 'Nobody has answered for job {ref}. Open the app and tap I am coming, or cancel the job.', 'customer'),
  ('guard_ask.title',             506, NULL, '{pro} cannot get past the gate', 'customer'),
  ('guard_ask.body',              507, NULL, 'He says the guard has not let him in for job {ref}. Please tell the guard, then open the app and tap I am coming.', 'customer'),
  ('not_home_coming.title',       508, NULL, '{customer} is coming', 'technician'),
  ('not_home_coming.body',        509, NULL, 'She says she is coming to the door for job {ref}. Please wait 10 more minutes.', 'technician'),
  ('not_home_reported.title',     510, NULL, 'Job {ref} was closed', 'customer'),
  ('not_home_reported.body',      511, NULL, '{pro} reported that nobody answered. If you were home, open the job within 24 hours and tell Pechkas.', 'customer'),
  ('guard_reported.title',        512, NULL, 'Job {ref} was closed', 'customer'),
  ('guard_reported.body',         513, NULL, '{pro} reported that the guard did not let him in. It does not count against you. You can book it again.', 'customer'),
  ('not_home_disputed.title',     514, NULL, 'Nobody-home report disputed: {ref}', 'office'),
  ('not_home_disputed.body',      515, NULL, 'The customer says she was home. See Cancellations in the admin panel.', 'office'),
  ('not_home_disputed_pro.title', 516, NULL, 'The customer disagrees: {ref}', 'technician'),
  ('not_home_disputed_pro.body',  517, NULL, 'She says she was home. The Pechkas office will look and tell you what it decides.', 'technician'),
  ('not_home_decided.title',      518, NULL, 'The office has looked at job {ref}', 'customer'),
  ('not_home_decided.body',       519, NULL, 'Open the job to read what it decided.', 'customer'),
  ('not_home_decided_pro.title',  520, NULL, 'The office has looked at job {ref}', 'technician'),
  ('not_home_decided_pro.body',   521, NULL, 'Open My account to read what it decided.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 504 AND 521 AND ur IS NULL;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.follow_not_home_outcome(), public.end_not_home_asking(),
  public.not_home_from(public.jobs, text), public.not_home_view(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pro_cannot_get_in(uuid, text),
  public.pro_report_not_home(uuid, text, text),
  public.customer_not_home_coming(uuid),
  public.customer_dispute_not_home(uuid, text),
  public.admin_not_home(uuid, boolean, text),
  public.admin_not_home_reports(),
  public.admin_flags(),
  public.pro_record(),
  public.my_jobs(),
  public.pro_my_jobs()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261111000000_nobody_home')
ON CONFLICT (name) DO NOTHING;

COMMIT;
