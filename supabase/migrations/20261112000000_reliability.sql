-- =============================================================================
--  A technician who cannot come: honesty made easy, recovery made quick (D11)
-- =============================================================================
--
--  The owner's decision D11 (11 November 2026).
--
--  "I CAN'T COME" (pro_withdraw). Until his arrival is satisfied, he may
--  withdraw, with a reason (words optional). More than 2 hours before his
--  window: a normal withdrawal; within 2 hours, or after it started: late.
--  Decided on the database's clock, and only while the job is still his and
--  still on (she cannot have cancelled first). Three late withdrawals in 60
--  days ask the office to review him. Nothing automatic.
--
--  "I'M RUNNING LATE" (pro_running_late). Before he arrives, he gives the time
--  he will be there: at least 5 minutes away, at most 2 hours after his
--  window ends, twice per job at most. She is told and chooses. His window,
--  and every estimate, stay on record; a late arrival is still recorded.
--
--  "FIND ANOTHER TECHNICIAN" (customer_find_another). When he is more than 30
--  minutes late, has said he is running late, or may not be coming, she can
--  send the SAME job to other technicians: never her cancellation. His
--  lateness is recorded as D10 already does, unless he warned her and she
--  switched before he was 30 minutes late.
--
--  BOTH REOPEN THE SAME JOB (reopen_job), never a copy: its words, photos,
--  address and price stay; what belonged to his assignment (agreed price, the
--  window from his offer, the visit fee fixed when she chose him, the start
--  code, the arrival) is written to job_assignments first, then cleared. The
--  man who left is shut out of that job for good (pro_may_see_as). If no
--  window is left on its day, it moves to tomorrow and she is told; she can
--  change the day or cancel free.
--
--  PAUSE (admin_pause_pro): the office may stop a technician's NEW offers for
--  1, 3 or 7 days, with a reason; it ends by itself or is lifted with a reason;
--  every line is kept and cannot be changed. Jobs he already has go on. The
--  ladder (first confirmed no-show: contact him; second in 60 days: consider a
--  pause; third: review his approval) is a suggestion shown to the office,
--  never applied by the database.
--
--  No money anywhere. D10, D12 and D34 keep their rules; their records become
--  one per technician per job, so a reopened job's second technician has his
--  own. Chat shows only the current assignment's messages.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;


-- --- Settings ------------------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('flag_late_withdrawals', 3, 'count', 'Late withdrawals ("I can''t come" within 2 hours of his window) by one technician, within flag_days, that ask the office to review.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES ('flag_late_withdrawals', 1, 20) ON CONFLICT (key) DO NOTHING;


-- --- One record per technician per job --------------------------------------------------------------

ALTER TABLE public.pro_incidents DROP CONSTRAINT IF EXISTS pro_incidents_job_id_key;
ALTER TABLE public.pro_incidents DROP CONSTRAINT IF EXISTS pro_incidents_job_pro_key;
ALTER TABLE public.pro_incidents ADD CONSTRAINT pro_incidents_job_pro_key UNIQUE (job_id, pro_id);
ALTER TABLE public.pro_incidents DROP CONSTRAINT IF EXISTS pro_incidents_how_check;
ALTER TABLE public.pro_incidents ADD CONSTRAINT pro_incidents_how_check
  CHECK (how IN ('arrived_late', 'cancelled_waiting', 'clock', 'replaced_waiting'));
ALTER TABLE public.not_home_reports DROP CONSTRAINT IF EXISTS not_home_reports_job_id_key;
ALTER TABLE public.not_home_reports DROP CONSTRAINT IF EXISTS not_home_reports_job_pro_key;
ALTER TABLE public.not_home_reports ADD CONSTRAINT not_home_reports_job_pro_key UNIQUE (job_id, pro_id);

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS eta_at timestamptz;


-- --- The records --------------------------------------------------------------------------------

/** Every technician a job had before it went back to others: nothing about him is overwritten. */
CREATE TABLE IF NOT EXISTS public.job_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id                uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  assigned_at           timestamptz,
  assigned_by           text,
  ended_at              timestamptz NOT NULL DEFAULT now(),
  ended                 text NOT NULL CHECK (ended IN ('withdrawn', 'late_withdrawal', 'replaced')),
  note                  text,
  -- For "replaced": what her cancelling would have counted as at that moment (cancel_kind()).
  kind                  text,
  agreed_paisa          bigint,
  when_date             date,
  when_from             smallint,
  window_start          timestamptz,
  on_way_at             timestamptz,
  arrived_at            timestamptz,
  arrival_verified_at   timestamptz,
  arrival_review_status text,
  eta_at                timestamptz
);
ALTER TABLE public.job_assignments ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_assignments FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS job_assignments_job ON public.job_assignments (job_id);
CREATE INDEX IF NOT EXISTS job_assignments_pro ON public.job_assignments (pro_id, ended_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_withdrawals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz,
  stage        text,
  kind         text NOT NULL CHECK (kind IN ('normal', 'late')),
  reason       text NOT NULL CHECK (reason IN ('emergency', 'vehicle', 'other_job', 'cannot_reach', 'unwell', 'other')),
  note         text CHECK (note IS NULL OR length(note) <= 200),
  UNIQUE (job_id, pro_id)
);
ALTER TABLE public.pro_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_withdrawals FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS pro_withdrawals_pro ON public.pro_withdrawals (pro_id, at DESC);

CREATE TABLE IF NOT EXISTS public.eta_reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  eta_at       timestamptz NOT NULL,
  window_start timestamptz,
  reported_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eta_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eta_reports FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS eta_reports_job ON public.eta_reports (job_id, pro_id);

/** The office's pauses and lifts. Written once: a mistake is a new line, never an edit. */
CREATE TABLE IF NOT EXISTS public.pro_pause_log (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pro_id   uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  action   text NOT NULL CHECK (action IN ('pause', 'lift')),
  days     smallint CHECK (days IS NULL OR days IN (1, 3, 7)),
  until    timestamptz,
  note     text NOT NULL CHECK (length(note) BETWEEN 5 AND 300),
  by_id    uuid,
  by_name  text,
  at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pro_pause_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_pause_log FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS pro_pause_log_pro ON public.pro_pause_log (pro_id, at DESC);
CREATE OR REPLACE FUNCTION public.pause_log_written_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'A pause line is written once: it cannot be changed.';
END;
$$;
DROP TRIGGER IF EXISTS pro_pause_log_no_edit ON public.pro_pause_log;
CREATE TRIGGER pro_pause_log_no_edit BEFORE UPDATE ON public.pro_pause_log
  FOR EACH ROW EXECUTE FUNCTION public.pause_log_written_once();

/** Until when his new offers are paused, or NULL: the latest pause, if no lift came after it and it has not run out. */
CREATE OR REPLACE FUNCTION public.pro_pause_until(p_pro uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.until FROM public.pro_pause_log l
  WHERE l.pro_id = p_pro AND l.action = 'pause' AND l.until > now()
    AND NOT EXISTS (SELECT 1 FROM public.pro_pause_log x WHERE x.pro_id = p_pro AND x.action = 'lift' AND x.at >= l.at)
  ORDER BY l.at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pro_paused(p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pro_pause_until(p_pro) IS NOT NULL;
$$;

/** "3:30pm" on Pakistan's clock, for messages. */
CREATE OR REPLACE FUNCTION public.pk_clock(p_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT lower(to_char(p_at AT TIME ZONE 'Asia/Karachi', 'FMHH12:MIam'));
$$;


-- --- The one way a job goes back to others ------------------------------------------------------

/**
 * Writes his assignment to job_assignments, then sends the SAME job back to
 * other technicians: open, his price, window, fee, code and arrival cleared,
 * on its day if a window is left, otherwise tomorrow. The caller has locked
 * the row, checked who may do this, and tells the people concerned.
 */
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
    -- Its day while there is still time to take it: a job nobody took closes at 8pm on its day
    -- (close_unclaimed), so with less than an hour left it moves to tomorrow.
    WHEN v_job.when_date IS NULL OR v_job.when_date <= v_today THEN CASE WHEN v_hour >= 19 THEN v_today + 1 ELSE v_today END
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


-- --- His side ----------------------------------------------------------------------------------------

/** Before his arrival is satisfied, may he withdraw, and would it count as late now? */
CREATE OR REPLACE FUNCTION public.withdraw_kind(p_job public.jobs)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_job.status <> 'assigned' OR NOT (p_job.stage IN ('chosen', 'on_way') OR (p_job.stage = 'arrived' AND public.arrival_at(p_job) IS NULL)) THEN NULL
    WHEN public.window_start(p_job.when_date, p_job.when_from) IS NULL THEN CASE WHEN p_job.stage = 'chosen' THEN 'normal' ELSE 'late' END
    WHEN now() >= public.window_start(p_job.when_date, p_job.when_from) - interval '2 hours' THEN 'late'
    ELSE 'normal' END;
$$;

/** "I can't come": a reason, his record, and the job back to others at once. */
CREATE OR REPLACE FUNCTION public.pro_withdraw(p_job uuid, p_reason text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs;
  v_kind text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_pro  uuid;
  v_vars jsonb;
  v_day  date;
BEGIN
  -- His, assigned and locked: if she cancelled first, this finds nothing.
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  v_kind := public.withdraw_kind(v_job);
  IF v_kind IS NULL THEN
    RETURN public.refuse('You have already arrived. Please call the Pechkas office.', 'stage');
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('emergency', 'vehicle', 'other_job', 'cannot_reach', 'unwell', 'other') THEN
    RETURN public.refuse('Choose the reason.', 'reason');
  END IF;
  IF p_reason = 'other' AND length(coalesce(v_note, '')) < 5 THEN
    RETURN public.refuse('Say why, in a few words.', 'note');
  END IF;
  IF length(coalesce(v_note, '')) > 200 OR public.looks_like_cnic(v_note)
     OR regexp_replace(coalesce(v_note, ''), '[^0-9]', '', 'g') ~ '[0-9]{7}' THEN
    RETURN public.refuse('Keep it short, with no phone numbers.', 'note');
  END IF;
  v_pro := v_job.pro_id;
  v_vars := public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_pro));
  INSERT INTO public.pro_withdrawals (job_id, pro_id, window_start, stage, kind, reason, note)
  VALUES (p_job, v_pro, public.window_start(v_job.when_date, v_job.when_from), v_job.stage, v_kind, p_reason, v_note)
  ON CONFLICT (job_id, pro_id) DO NOTHING;
  PERFORM public.log_job(p_job, 'withdrawn', jsonb_build_object('kind', v_kind, 'reason', p_reason));
  v_day := v_job.when_date;
  v_job := public.reopen_job(p_job, CASE WHEN v_kind = 'late' THEN 'late_withdrawal' ELSE 'withdrawn' END, v_note);
  PERFORM public.tell(v_job.customer_id, 'pro_withdrew', p_job, '/jobs', v_vars,
                      CASE WHEN v_job.when_date IS DISTINCT FROM v_day THEN 'pro_withdrew.moved' END);
  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'day', v_job.when_date);
END;
$$;

/** "I'm running late": the time he will be there. She is told and chooses. */
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
    RETURN public.refuse('You have already changed your time twice. Please call the customer, or the Pechkas office.', 'eta');
  END IF;
  v_start := public.window_start(v_job.when_date, v_job.when_from);
  IF p_eta IS NULL OR p_eta < now() + interval '5 minutes'
     OR p_eta > coalesce(v_start + interval '4 hours', now() + interval '3 hours') THEN
    RETURN public.refuse('Choose a time between 5 minutes from now and 2 hours after your time ends.', 'eta');
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


-- --- Her side ------------------------------------------------------------------------------------

/**
 * When "Find another technician" is open to her: whenever he has not arrived and
 * she could still cancel (the owner's rule). Whether it is his fault is decided
 * when she uses it, the same way a cancellation would be.
 */
CREATE OR REPLACE FUNCTION public.can_find_another(p_job public.jobs)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_job.status = 'assigned' AND p_job.pro_id IS NOT NULL
    AND (p_job.stage IN ('chosen', 'on_way') OR (p_job.stage = 'arrived' AND public.arrival_at(p_job) IS NULL));
$$;

/** "Find another technician": the same job to others, never her cancellation. */
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
                              ELSE 'Your technician has arrived. Please call the Pechkas office.' END);
  END IF;
  v_pro := v_job.pro_id;
  v_start := public.window_start(v_job.when_date, v_job.when_from);
  -- What it counts as, exactly as her cancelling now would: his lateness (pro_late, no_show) is
  -- his; a late switch with no fault of his ('late') counts as her late cancellation unless he
  -- had said he was running late. Nothing against him before he is 30 minutes late.
  v_kind := public.cancel_kind(now(), v_start, v_job.on_way_at, public.arrival_at(v_job),
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


-- --- The office ----------------------------------------------------------------------------------

/** Pause his new offers for 1, 3 or 7 days, with a reason. Jobs he already has go on. */
CREATE OR REPLACE FUNCTION public.admin_pause_pro(p_pro uuid, p_days integer, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_until timestamptz;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can be paused.');
  END IF;
  IF p_days IS NULL OR p_days NOT IN (1, 3, 7) THEN
    RETURN public.refuse('Choose 1, 3 or 7 days.', 'days');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write the reason, in a sentence. He reads it in the app.', 'note');
  END IF;
  IF public.pro_paused(p_pro) THEN
    RETURN public.refuse('He is already paused. Lift it first to set a new length.');
  END IF;
  v_until := now() + make_interval(days => p_days);
  INSERT INTO public.pro_pause_log (pro_id, action, days, until, note, by_id, by_name)
  VALUES (p_pro, 'pause', p_days, v_until, v_note, auth.uid(), (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()));
  -- His waiting offers go: customers should not choose a man who cannot take new work.
  UPDATE public.offers SET status = 'withdrawn', updated_at = now() WHERE pro_id = p_pro AND status = 'pending';
  PERFORM public.tell(p_pro, 'paused_pro', NULL, '/pro/money', jsonb_build_object('until', to_char(v_until AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || ', ' || public.pk_clock(v_until)));
  RETURN jsonb_build_object('ok', true, 'until', v_until);
END;
$$;

/** Lift a pause early, with a reason. */
CREATE OR REPLACE FUNCTION public.admin_lift_pause(p_pro uuid, p_note text)
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
  IF NOT public.pro_paused(p_pro) THEN
    RETURN public.refuse('He is not paused.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write the reason, in a sentence.', 'note');
  END IF;
  INSERT INTO public.pro_pause_log (pro_id, action, note, by_id, by_name)
  VALUES (p_pro, 'lift', v_note, auth.uid(), (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()));
  PERFORM public.tell(p_pro, 'unpaused_pro', NULL, '/pro', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Who keeps failing customers, and what the office might do: counts, the suggested step, pauses, withdrawals, replacements. */
CREATE OR REPLACE FUNCTION public.admin_reliability()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => public.setting('flag_days')::integer);
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'days', public.setting('flag_days'),
    'late_withdrawals_at', public.setting('flag_late_withdrawals'),
    'pros', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'no_shows')::integer DESC, (x->>'late_withdrawals')::integer DESC, x->>'pro')
      FROM (
        SELECT jsonb_build_object(
          'pro_id', r.id, 'pro', r.full_name, 'phone', public.phone_of(r.id),
          'no_shows', n.no_shows, 'late_arrivals', n.late_arrivals, 'late_withdrawals', n.late_withdrawals,
          'withdrawals', n.withdrawals, 'replaced', n.replaced,
          -- The owner's ladder, as a suggestion only.
          'suggestion', CASE WHEN n.no_shows >= 3 THEN 'review' WHEN n.no_shows = 2 THEN 'pause' WHEN n.no_shows = 1 THEN 'contact' END,
          'paused_until', public.pro_pause_until(r.id),
          'pauses', coalesce((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'days', l.days, 'until', l.until, 'note', l.note,
                                                                  'by', l.by_name, 'at', l.at) ORDER BY l.at DESC)
                              FROM public.pro_pause_log l WHERE l.pro_id = r.id), '[]'::jsonb)) AS x
        FROM public.pros r
        CROSS JOIN LATERAL (SELECT
          (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'no_show' AND i.status = 'confirmed' AND i.detected_at >= v_since) AS no_shows,
          (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'late_arrival' AND i.status <> 'dismissed' AND i.detected_at >= v_since) AS late_arrivals,
          (SELECT count(*) FROM public.pro_withdrawals w WHERE w.pro_id = r.id AND w.kind = 'late' AND w.at >= v_since) AS late_withdrawals,
          (SELECT count(*) FROM public.pro_withdrawals w WHERE w.pro_id = r.id AND w.at >= v_since) AS withdrawals,
          (SELECT count(*) FROM public.job_assignments a WHERE a.pro_id = r.id AND a.ended = 'replaced' AND a.ended_at >= v_since) AS replaced) n
        WHERE r.status IN ('approved', 'suspended')
          AND (n.no_shows + n.late_arrivals + n.withdrawals + n.replaced > 0 OR public.pro_paused(r.id)
               OR EXISTS (SELECT 1 FROM public.pro_pause_log l WHERE l.pro_id = r.id AND l.at >= v_since))) s), '[]'::jsonb),
    'withdrawals', coalesce((
      SELECT jsonb_agg(jsonb_build_object('job_id', w.job_id, 'ref', j.ref, 'trade', j.trade, 'pro', r.full_name, 'kind', w.kind,
                                          'reason', w.reason, 'note', w.note, 'at', w.at, 'window_start', w.window_start, 'stage', w.stage,
                                          'job_status', j.status) ORDER BY w.at DESC)
      FROM public.pro_withdrawals w JOIN public.jobs j ON j.id = w.job_id LEFT JOIN public.pros r ON r.id = w.pro_id
      WHERE w.at >= v_since), '[]'::jsonb),
    'replaced', coalesce((
      SELECT jsonb_agg(jsonb_build_object('job_id', a.job_id, 'ref', j.ref, 'trade', j.trade, 'pro', r.full_name,
                                          'at', a.ended_at, 'window_start', a.window_start, 'eta_at', a.eta_at,
                                          'etas', (SELECT count(*) FROM public.eta_reports e WHERE e.job_id = a.job_id AND e.pro_id = a.pro_id),
                                          'job_status', j.status) ORDER BY a.ended_at DESC)
      FROM public.job_assignments a JOIN public.jobs j ON j.id = a.job_id LEFT JOIN public.pros r ON r.id = a.pro_id
      WHERE a.ended = 'replaced' AND a.ended_at >= v_since), '[]'::jsonb)
  );
END;
$$;


-- --- The one visibility rule: a paused man, and the man who left a job ------------------------------

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
         AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = r.id)
         -- She said no to his offer on this job: it is closed to him.
         AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = r.id AND o.status = 'declined')
         -- Paused by the office (D11): no new jobs reach him; jobs he has go on.
         AND NOT public.pro_paused(r.id)
         -- He withdrew from this job, or she replaced him on it: it is closed to him for good.
         AND NOT EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = j.id AND a.pro_id = r.id)
         -- A guarantee repair never goes to the man whose work it is redoing.
         AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.id = j.guarantee_of AND c.pro_id = r.id))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
$$;


CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can make offers.');
  END IF;
  v_owed := public.pro_owed(auth.uid());
  IF v_owed > public.setting('credit_limit_paisa') THEN
    RETURN public.refuse('You owe Pechkas ' || public.rs(v_owed) || '. Pay it to make new offers.', 'owed');
  END IF;
  -- A guarantee claim on his work that he has let run out stops new offers.
  IF public.claim_blocks(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('Your new offers have stopped until you answer the guarantee claim on your earlier job.', 'guarantee');
  END IF;

  -- Paused by the office (D11): told until when.
  IF public.pro_paused(auth.uid()) THEN
    RETURN public.refuse('The Pechkas office has paused your new offers until '
                         || to_char(public.pro_pause_until(auth.uid()) AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || ', '
                         || public.pk_clock(public.pro_pause_until(auth.uid())) || '.', 'paused');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
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

  -- When he will come. A job wanted now (older copies): how many minutes.
  -- A job whose customer chose the time or the part of the day (older
  -- copies): nothing to say. A job
  -- with only a day — every job the app posts now: the two hours he will
  -- arrive in, on that day, not one that has already started.
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
    IF p_arrive_from IS NULL OR p_arrive_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Say when you will arrive.', 'arrive');
    END IF;
    IF v_job.when_date = v_today AND p_arrive_from <= v_hour THEN
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

  INSERT INTO public.offers AS o (job_id, pro_id, price_paisa, eta_minutes, arrive_from, note, status, expires_at)
  VALUES (p_job, auth.uid(), p_price_paisa, p_eta_minutes, p_arrive_from, v_note, 'pending',
          now() + make_interval(mins => public.setting('offer_minutes')::integer))
  ON CONFLICT (job_id, pro_id) DO UPDATE SET
    price_paisa = EXCLUDED.price_paisa,
    eta_minutes = EXCLUDED.eta_minutes,
    arrive_from = EXCLUDED.arrive_from,
    note = EXCLUDED.note,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;


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
    -- Paused by the office (D11): until when, and the office's reason.
    'paused_until', public.pro_pause_until(auth.uid()),
    'pause_note', (SELECT l.note FROM public.pro_pause_log l WHERE l.pro_id = auth.uid() AND l.action = 'pause'
                   AND public.pro_paused(auth.uid()) ORDER BY l.at DESC LIMIT 1),
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
          'paid_by_pechkas', j.paid_by_pechkas, 'pay_cap_paisa', j.pay_cap_paisa,
          'visit_fee_paisa', public.visit_fee(j.id),
          'asked_you', coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false),
          'asked_until', CASE WHEN j.preferred_pro_id = auth.uid() AND j.preferred_until > now() THEN j.preferred_until END,
          'repeat', public.commission_rate(j.customer_id, auth.uid(), j.id) <> public.setting('commission_bps'),
          'commission_bps', public.commission_rate(j.customer_id, auth.uid(), j.id),
          'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                             FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'eta_minutes', o.eta_minutes, 'arrive_from', o.arrive_from,
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
               AND NOT public.pro_paused(r.id)
               AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = NEW.customer_id AND b.pro_id = r.id)) THEN
    NEW.preferred_pro_id := v_ask.pro_id;
    NEW.preferred_until := now() + make_interval(mins => public.setting('prefer_minutes')::integer);
  END IF;
  RETURN NEW;
END;
$$;




-- --- Chat belongs to one assignment -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.job_chat(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_side text := public.chat_side(p_job);
  v_job  public.jobs%ROWTYPE;
BEGIN
  IF v_side IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'why', 'This chat is closed.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  RETURN jsonb_build_object(
    'ok', true,
    'ref', v_job.ref,
    'side', v_side,
    'can_send', v_job.status = 'assigned',
    'other_name', CASE WHEN v_side = 'customer'
                       THEN (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)
                       ELSE (SELECT first_name FROM public.profiles WHERE id = v_job.customer_id) END,
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.sender_id = auth.uid(), 'body', m.body, 'at', m.created_at) ORDER BY m.id)
      -- Only this assignment's messages: a job that came back never shows the next man what was said before.
      FROM public.job_messages m WHERE m.job_id = p_job AND m.created_at >= coalesce(v_job.assigned_at, '-infinity'::timestamptz)), '[]'::jsonb)
  );
END;
$$;




-- --- D10 and D34 records: one per technician per job ------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_late_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start   timestamptz := public.window_start(NEW.when_date, NEW.when_from);
  v_at      timestamptz := public.arrival_at(NEW);
  v_minutes integer;
BEGIN
  IF v_at IS NULL OR public.arrival_at(OLD) IS NOT NULL OR v_start IS NULL OR NEW.pro_id IS NULL
     OR NEW.arrival_review_status = 'before_checks' OR v_at < v_start + interval '30 minutes' THEN
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
      AND public.window_start(j.when_date, j.when_from) <= now() - interval '2 hours 30 minutes'
      AND public.window_start(j.when_date, j.when_from) > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.pro_id = j.pro_id)
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (v_job.id, v_job.pro_id, 'no_show', 'potential', public.window_start(v_job.when_date, v_job.when_from),
            floor(extract(epoch FROM (now() - public.window_start(v_job.when_date, v_job.when_from))) / 60)::integer, 'clock')
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
                                                 FROM public.not_home_reports r WHERE r.job_id = NEW.id AND r.pro_id = OLD.pro_id), 'not_home')
    -- Her cancellation reads his arrival only once it is satisfied: an unverified tap
    -- never makes her cancellation "at the door", nor hides his lateness.
    ELSE public.cancel_kind(now(), v_start, NEW.on_way_at, public.arrival_at(OLD),
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
  WHERE r.job_id = p_job AND r.pro_id = (SELECT j.pro_id FROM public.jobs j WHERE j.id = p_job);
$$;


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
  SELECT * INTO v_rep FROM public.not_home_reports WHERE job_id = p_job AND pro_id = v_job.pro_id FOR UPDATE;
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
  WHERE r.job_id = p_job AND r.customer_id = auth.uid()
    AND r.pro_id = (SELECT j.pro_id FROM public.jobs j WHERE j.id = p_job) FOR UPDATE;
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


CREATE OR REPLACE FUNCTION public.pro_report_not_home(p_job uuid, p_photo text, p_note text DEFAULT NULL,
                                                     p_loc jsonb DEFAULT NULL, p_no_camera boolean DEFAULT false)
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
  v_check   public.location_checks;
  v_evid    text;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  SELECT * INTO v_rep FROM public.not_home_reports WHERE job_id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_rep.id IS NULL OR v_rep.status NOT IN ('asking', 'coming') OR v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('Ask Pechkas to tell the customer first.', 'stage');
  END IF;
  IF now() < v_rep.deadline THEN
    RETURN public.refuse('The customer still has time to answer. Please wait.', 'wait')
           || jsonb_build_object('from', v_rep.deadline);
  END IF;
  -- Where he is now, judged the one way. Recorded even if the report is then refused.
  v_check := public.check_location(p_job, 'not_home', p_loc);
  IF p_photo IS NULL THEN
    -- A photo is needed whenever his location could not be verified now, unless his camera does not work;
    -- then he says so, and the report goes to the office as unverified.
    IF v_check.result <> 'verified' AND NOT coalesce(p_no_camera, false) THEN
      RETURN public.refuse('Your location could not be checked, so a photo of the gate or door is needed.', 'photos')
             || jsonb_build_object('location', v_check.result, 'distance_m', v_check.distance_m);
    END IF;
    IF coalesce(p_no_camera, false) AND length(coalesce(v_note, '')) < 10 THEN
      RETURN public.refuse('Say why there is no photo, in a sentence.', 'note');
    END IF;
  ELSE
    v_problem := public.own_uploads(jsonb_build_array(p_photo), 1);
    IF v_problem IS NOT NULL THEN
      RETURN public.refuse(v_problem, 'photos');
    END IF;
  END IF;
  -- How strong the evidence is, for the office: both checks verified, one of them or a photo, or neither.
  v_evid := CASE
    WHEN v_job.arrival_review_status = 'verified' AND v_check.result = 'verified' THEN 'strong'
    WHEN v_job.arrival_review_status = 'verified' OR v_check.result = 'verified' OR p_photo IS NOT NULL THEN 'partial'
    ELSE 'unverified' END;
  IF length(coalesce(v_note, '')) > 300 OR public.looks_like_cnic(v_note)
     OR regexp_replace(coalesce(v_note, ''), '[^0-9]', '', 'g') ~ '[0-9]{7}' THEN
    RETURN public.refuse('Keep the note short, with no phone numbers.', 'note');
  END IF;
  IF p_photo IS NOT NULL THEN
    INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, v_job.pro_id, 'gate', p_photo);
  END IF;
  UPDATE public.not_home_reports
  SET status = 'submitted', status_before = v_rep.status, submitted_at = now(), photo_path = p_photo, pro_note = v_note,
      arrival_check = v_job.arrival_review_status, report_check = v_check.result, evidence = v_evid,
      no_camera = coalesce(p_no_camera, false) AND p_photo IS NULL
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




-- --- What each side sees ----------------------------------------------------------------------------

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
          THEN public.cancel_kind(now(), public.window_start(j.when_date, j.when_from), j.on_way_at, public.arrival_at(j),
                                  CASE WHEN j.stage = 'arrived' AND public.arrival_at(j) IS NULL THEN 'on_way' ELSE j.stage END, true) END,
      'pro_late', j.status = 'assigned' AND (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL))
                  AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
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
      'technicians_before', (SELECT count(*) FROM public.job_assignments a WHERE a.job_id = j.id)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;


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
      'late', (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL)) AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
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
      'eta_latest', CASE WHEN public.window_start(j.when_date, j.when_from) IS NOT NULL
                         THEN public.window_start(j.when_date, j.when_from) + interval '4 hours' ELSE now() + interval '3 hours' END
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;


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
    'unverified_arrivals_at', public.setting('flag_unverified_arrivals'),
    'unverified_arrivals', coalesce((
      SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'arrived_at', j.arrived_at, 'status', j.arrival_review_status,
                                          'result', (SELECT c.result FROM public.location_checks c WHERE c.job_id = j.id AND c.event = 'arrived'
                                                     ORDER BY c.received_at DESC LIMIT 1),
                                          'note', j.arrival_review_note)
        ORDER BY j.arrived_at DESC)
      FROM public.jobs j
      WHERE j.pro_id = auth.uid() AND j.arrival_review_status IN ('pending', 'rejected', 'approved')
        AND j.arrived_at > now() - interval '90 days'), '[]'::jsonb)
      -- And on jobs he later left (D11): kept from his assignment, never lost with it.
      || coalesce((
      SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'arrived_at', a.arrived_at, 'status', a.arrival_review_status,
                                          'result', (SELECT c.result FROM public.location_checks c WHERE c.job_id = j.id AND c.event = 'arrived'
                                                     AND c.pro_id = a.pro_id ORDER BY c.received_at DESC LIMIT 1),
                                          'note', NULL::text)
        ORDER BY a.arrived_at DESC)
      FROM public.job_assignments a JOIN public.jobs j ON j.id = a.job_id
      WHERE a.pro_id = auth.uid() AND a.arrival_review_status IN ('pending', 'rejected', 'approved')
        AND a.arrived_at > now() - interval '90 days'), '[]'::jsonb),
    -- "I can't come" (D11): his withdrawals, how many were late, and any pause with the office's reason.
    'late_withdrawals', (SELECT count(*) FROM public.pro_withdrawals w WHERE w.pro_id = auth.uid() AND w.kind = 'late'
                           AND w.at > now() - make_interval(days => public.setting('flag_days')::integer)),
    'late_withdrawals_at', public.setting('flag_late_withdrawals'),
    'withdrawals', coalesce((
      SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'trade', j.trade, 'at', w.at, 'kind', w.kind, 'reason', w.reason) ORDER BY w.at DESC)
      FROM public.pro_withdrawals w JOIN public.jobs j ON j.id = w.job_id
      WHERE w.pro_id = auth.uid() AND w.at > now() - interval '90 days'), '[]'::jsonb),
    'paused_until', public.pro_pause_until(auth.uid()),
    'pauses', coalesce((
      SELECT jsonb_agg(jsonb_build_object('action', l.action, 'days', l.days, 'until', l.until, 'note', l.note, 'at', l.at) ORDER BY l.at DESC)
      FROM public.pro_pause_log l WHERE l.pro_id = auth.uid() AND l.at > now() - interval '90 days'), '[]'::jsonb),
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


CREATE OR REPLACE FUNCTION public.arrival_view(p_job public.jobs)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'status', p_job.arrival_review_status,
    'result', c.result, 'distance_m', c.distance_m, 'accuracy_m', round(c.accuracy_m), 'checked_at', c.received_at,
    'radius_m', public.setting('arrival_radius_m'), 'accuracy_limit_m', public.setting('gps_accuracy_m'),
    'review_note', p_job.arrival_review_note)
  FROM (SELECT NULL) x
  LEFT JOIN LATERAL (SELECT * FROM public.location_checks c WHERE c.job_id = p_job.id AND c.pro_id = p_job.pro_id AND c.event = 'arrived'
                     ORDER BY c.received_at DESC LIMIT 1) c ON true
  WHERE p_job.arrived_at IS NOT NULL;
$$;




-- --- The office: flags ------------------------------------------------------------------------------

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
      -- Arrivals tapped but never verified, nor approved by the office, nor proved by the start code.
      (SELECT count(*) FROM public.jobs x WHERE x.pro_id = r.id AND x.arrival_review_status IN ('pending', 'rejected')
         AND x.arrived_at >= v_since)
      + (SELECT count(*) FROM public.job_assignments x WHERE x.pro_id = r.id AND x.arrival_review_status IN ('pending', 'rejected')
         AND x.arrived_at >= v_since) AS unverified_arrivals,
      -- "I can't come" within 2 hours of his time, or after it began (D11).
      (SELECT count(*) FROM public.pro_withdrawals x WHERE x.pro_id = r.id AND x.kind = 'late' AND x.at >= v_since) AS late_withdrawals,
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
        public.flag_if('unverified_arrivals', p.unverified_arrivals, public.setting('flag_unverified_arrivals')),
        public.flag_if('late_withdrawals', p.late_withdrawals, public.setting('flag_late_withdrawals')),
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
         AND x.cancelled_at >= v_since)
      -- "Find another technician" used just as late, with no fault of his and no warning from him (D11),
      -- counts the same: switching is never a way round the late-cancellation count.
      + (SELECT count(*) FROM public.job_assignments x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.ended = 'replaced' AND x.kind = 'late' AND x.ended_at >= v_since) AS late_cancels,
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




-- --- What people are told ----------------------------------------------------------------------------
-- Trade, sector, first name and job number only: never an address, a coordinate or anybody's words.

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('pro_withdrew.title',  528, NULL, 'We are sorry: {pro} cannot come ({ref})', 'customer'),
  ('pro_withdrew.body',   529, NULL, 'Your {trade} job is open to other Pechkas technicians again, with everything you posted. You will be told when offers come. Nothing to pay.', 'customer'),
  ('pro_withdrew.moved',  530, NULL, 'Today''s times are over, so your {trade} job is now open for tomorrow, with everything you posted. You can change the day or cancel free in the app.', 'customer'),
  ('running_late.title',  531, NULL, '{pro} is running late: {ref}', 'customer'),
  ('running_late.body',   532, NULL, 'He now expects to arrive by {time}. You can wait, or open the job to find another technician. Either costs you nothing.', 'customer'),
  ('replaced_pro.title',  533, NULL, 'The customer chose another technician: {ref}', 'technician'),
  ('replaced_pro.body',   534, NULL, 'The {trade} job in {sector} is no longer yours. Please do not go.', 'technician'),
  ('paused_pro.title',    535, NULL, 'Your new offers are paused', 'technician'),
  ('paused_pro.body',     536, NULL, 'The Pechkas office has paused your new offers until {until}. Jobs you already have go on. Open My account to read why.', 'technician'),
  ('unpaused_pro.title',  537, NULL, 'You can make offers again', 'technician'),
  ('unpaused_pro.body',   538, NULL, 'The Pechkas office has lifted the pause on your offers.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 528 AND 538 AND ur IS NULL;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.pause_log_written_once(),
  public.pro_pause_until(uuid),
  public.pro_paused(uuid),
  public.pk_clock(timestamptz),
  public.reopen_job(uuid, text, text, text),
  public.withdraw_kind(public.jobs),
  public.can_find_another(public.jobs),
  public.pro_withdraw(uuid, text, text),
  public.pro_running_late(uuid, timestamptz),
  public.customer_find_another(uuid),
  public.admin_pause_pro(uuid, integer, text),
  public.admin_lift_pause(uuid, text),
  public.admin_reliability()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pro_withdraw(uuid, text, text),
  public.pro_running_late(uuid, timestamptz),
  public.customer_find_another(uuid),
  public.admin_pause_pro(uuid, integer, text),
  public.admin_lift_pause(uuid, text),
  public.admin_reliability(),
  public.make_offer(uuid, bigint, integer, text, smallint),
  public.pro_feed(),
  public.job_chat(uuid),
  public.pro_cannot_get_in(uuid, text),
  public.customer_not_home_coming(uuid),
  public.customer_dispute_not_home(uuid, text),
  public.pro_report_not_home(uuid, text, text, jsonb, boolean),
  public.admin_flags(),
  public.pro_record(),
  public.my_jobs(),
  public.pro_my_jobs()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261112000000_reliability')
ON CONFLICT (name) DO NOTHING;

COMMIT;
