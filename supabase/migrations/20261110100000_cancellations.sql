-- =============================================================================
--  Cancellations: free for customers, recorded fairly for both sides
-- =============================================================================
--
--  The owner's decision D10 (10 November 2026), with his answers to the
--  audit's eight questions. Three things are never the same event: a
--  customer changing her mind, a technician not arriving on time, and a
--  customer cancelling once he is at her door.
--
--  CANCELLING
--    · Free for customers, always. Nothing here charges anybody, and a
--      cancellation never creates a visit fee (D12 stays separate).
--    · She may now cancel at the door too, before she gives him the start
--      code ("I no longer need this service"). After the start code it is
--      the office's, as before, and the office's cancel creates no fee.
--    · She picks a reason (optional words); the office says whom it is
--      cancelling for.
--
--  ONE CATEGORY PER CANCELLATION, decided by the database on its own clock
--  (cancel_kind), in this order, so no cancellation counts against both:
--    office          — the office cancelled
--    unclaimed       — nobody took it by 8pm (close_unclaimed)
--    before_choosing — no technician had been chosen
--    no_show         — 30 minutes after his window ended, he had not arrived
--    pro_late        — 30 minutes after his window started, he had not
--                      arrived, or he arrived after that
--    late            — at the door; or within 2 hours of his window; or after
--                      an On my way tapped no more than 3 hours before it
--    normal          — anything earlier
--  Existing cancellations are copied in as before_rules and counted nowhere.
--
--  THE TECHNICIAN'S RECORD (pro_incidents), kept apart from cancellations:
--    · a late arrival: Arrived tapped more than 30 minutes after the window
--      started, or the customer cancelled because he had not come;
--    · a potential no-show: a clock at the window's end + 30 minutes, which
--      tells the customer (cancel free, or keep waiting), the office and him.
--    · The office confirms or dismisses each, with a note. He may dispute
--      any, in words. Nothing suspends or charges anybody.
--
--  FLAGS (flags only, as always): 3 late cancellations in 60 days for a
--  customer; 3 late arrivals or 1 confirmed no-show in 60 days for a
--  technician. The old "5 cancellations" and "cancelled after he was
--  chosen" flags are retired: the second counted customers' cancellations
--  against technicians.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;


-- --- The settings -------------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('flag_late_cancels', 3, 'count', 'Late cancellations by one customer, within flag_days, that ask the office to review her account. Nothing happens automatically.'),
  ('flag_late_arrivals', 3, 'count', 'Late arrivals by one technician (more than 30 minutes after his window started), within flag_days, that ask the office to review.'),
  ('flag_no_shows', 1, 'count', 'Confirmed no-shows by one technician, within flag_days, that ask the office to review.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('flag_late_cancels', 1, 20),
  ('flag_late_arrivals', 1, 20),
  ('flag_no_shows', 1, 10)
ON CONFLICT (key) DO NOTHING;
-- The two retired flags stay in settings (older migrations name them) but
-- the office no longer sees or changes them.
DELETE FROM public.setting_limits WHERE key IN ('flag_cancelled', 'flag_customer_cancels');
UPDATE public.settings SET meaning = 'Retired on 10 November 2026 (D10): counted every cancellation. See flag_late_cancels.'
WHERE key = 'flag_customer_cancels';
UPDATE public.settings SET meaning = 'Retired on 10 November 2026 (D10): counted customers'' cancellations against technicians. See flag_late_arrivals and flag_no_shows.'
WHERE key = 'flag_cancelled';


-- --- What a job remembers about how it was cancelled -------------------------------------------

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancel_code text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_cancel_code_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_cancel_code_check CHECK (cancel_code IS NULL OR cancel_code IN
  ('fixed_myself', 'someone_else', 'plans_changed', 'pro_late', 'better_price', 'not_needed', 'other'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancel_for text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_cancel_for_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_cancel_for_check CHECK (cancel_for IS NULL OR cancel_for IN ('customer', 'pro', 'other'));

/** When his two-hour window starts, on Pakistan's clock; NULL for a job from an older copy with no window. */
CREATE OR REPLACE FUNCTION public.window_start(p_date date, p_from smallint)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_date IS NOT NULL AND p_from IS NOT NULL
              THEN (p_date + make_time(p_from::integer, 0, 0)) AT TIME ZONE 'Asia/Karachi' END;
$$;

/**
 * The one rule for what a customer's cancellation is (D10), in its order:
 * the technician's lateness first, so a cancellation he caused is never
 * counted against her. A window is two hours.
 */
CREATE OR REPLACE FUNCTION public.cancel_kind(p_at timestamptz, p_start timestamptz, p_on_way timestamptz,
                                              p_arrived timestamptz, p_stage text, p_chosen boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT coalesce(p_chosen, false) THEN 'before_choosing'
    WHEN p_start IS NOT NULL AND p_arrived IS NULL AND p_at >= p_start + interval '2 hours 30 minutes' THEN 'no_show'
    WHEN p_start IS NOT NULL AND ((p_arrived IS NULL AND p_at >= p_start + interval '30 minutes')
                                  OR p_arrived >= p_start + interval '30 minutes') THEN 'pro_late'
    WHEN p_stage = 'arrived' THEN 'late'
    WHEN p_start IS NOT NULL AND p_at >= p_start - interval '2 hours' THEN 'late'
    -- An On my way tapped hours early is not travelling yet (the owner's
    -- safeguard): it counts only within 3 hours of the window.
    WHEN p_on_way IS NOT NULL AND p_on_way <= p_at
         AND (p_start IS NULL OR p_on_way >= p_start - interval '3 hours') THEN 'late'
    ELSE 'normal'
  END;
$$;


-- --- The records --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cancellations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- Deleted with the account, like everything else about a person.
  customer_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pro_id            uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  cancelled_by      text NOT NULL CHECK (cancelled_by IN ('customer', 'office', 'nobody')),
  cancel_for        text CHECK (cancel_for IN ('customer', 'pro', 'other')),
  category          text NOT NULL CHECK (category IN ('before_choosing', 'normal', 'late', 'pro_late', 'no_show',
                                                      'office', 'unclaimed', 'before_rules')),
  reason_code       text,
  reason_text       text,
  cancelled_at      timestamptz NOT NULL DEFAULT now(),
  stage             text,
  window_start      timestamptz,
  on_way_at         timestamptz,
  arrived_at        timestamptz,
  reviewed_at       timestamptz,
  reviewed_by_name  text,
  review_note       text CHECK (review_note IS NULL OR length(review_note) <= 300)
);
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cancellations FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS cancellations_customer ON public.cancellations (customer_id, cancelled_at DESC);
CREATE INDEX IF NOT EXISTS cancellations_pro ON public.cancellations (pro_id, cancelled_at DESC);

CREATE TABLE IF NOT EXISTS public.pro_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id           uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('late_arrival', 'no_show')),
  status           text NOT NULL CHECK (status IN ('recorded', 'potential', 'confirmed', 'dismissed', 'disputed')),
  status_before    text,
  window_start     timestamptz,
  arrived_at       timestamptz,
  minutes_late     integer,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  how              text NOT NULL CHECK (how IN ('arrived_late', 'cancelled_waiting', 'clock')),
  pro_text         text CHECK (pro_text IS NULL OR length(pro_text) <= 300),
  pro_said_at      timestamptz,
  office_note      text CHECK (office_note IS NULL OR length(office_note) <= 300),
  decided_by_name  text,
  decided_at       timestamptz
);
ALTER TABLE public.pro_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_incidents FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS pro_incidents_pro ON public.pro_incidents (pro_id, detected_at DESC);

-- Every cancellation so far, as it was: kept, counted nowhere, reinterpreted never.
INSERT INTO public.cancellations (job_id, customer_id, pro_id, cancelled_by, category, reason_text, cancelled_at,
                                  stage, window_start, on_way_at, arrived_at)
SELECT j.id, j.customer_id, j.pro_id, coalesce(j.cancelled_by, 'customer'), 'before_rules', j.cancel_reason,
       coalesce((SELECT max(e.at) FROM public.job_events e WHERE e.job_id = j.id AND e.what = 'cancelled'), j.updated_at),
       NULL, public.window_start(j.when_date, j.when_from), j.on_way_at, j.arrived_at
FROM public.jobs j
WHERE j.status = 'cancelled'
ON CONFLICT (job_id) DO NOTHING;


-- --- Written by the database, whoever cancels --------------------------------------------------

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
DROP TRIGGER IF EXISTS job_cancellation ON public.jobs;
CREATE TRIGGER job_cancellation AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_cancellation();

/**
 * He taps Arrived: more than 30 minutes after his window started is a late
 * arrival, recorded and told to him. A "potential no-show" already noted for
 * this job becomes a late arrival: he did come.
 */
CREATE OR REPLACE FUNCTION public.record_late_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start   timestamptz := public.window_start(NEW.when_date, NEW.when_from);
  v_minutes integer;
BEGIN
  IF NEW.stage IS DISTINCT FROM 'arrived' OR OLD.stage IS NOT DISTINCT FROM 'arrived' OR v_start IS NULL OR NEW.pro_id IS NULL
     OR coalesce(NEW.arrived_at, now()) < v_start + interval '30 minutes' THEN
    RETURN NULL;
  END IF;
  v_minutes := floor(extract(epoch FROM (coalesce(NEW.arrived_at, now()) - v_start)) / 60)::integer;
  UPDATE public.pro_incidents
  SET kind = 'late_arrival', status = 'recorded', arrived_at = coalesce(NEW.arrived_at, now()), minutes_late = v_minutes, how = 'arrived_late'
  WHERE job_id = NEW.id AND kind = 'no_show' AND status = 'potential';
  IF NOT FOUND THEN
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, arrived_at, minutes_late, how)
    VALUES (NEW.id, NEW.pro_id, 'late_arrival', 'recorded', v_start, coalesce(NEW.arrived_at, now()), v_minutes, 'arrived_late')
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'late_arrival', jsonb_build_object('minutes', v_minutes));
  PERFORM public.tell(NEW.pro_id, 'late_arrival_pro', NEW.id, '/pro/money',
    public.job_vars(NEW) || jsonb_build_object('minutes', v_minutes));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_late_arrival ON public.jobs;
CREATE TRIGGER job_late_arrival AFTER UPDATE OF stage ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_late_arrival();

/**
 * Every minute: 30 minutes after a window ended with no "Arrived", a
 * potential no-show — recorded once, never a confirmed violation until the
 * office has looked. She is told she can cancel free or keep waiting; the
 * office and he are told too.
 */
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
    WHERE j.status = 'assigned' AND j.stage IN ('chosen', 'on_way') AND j.pro_id IS NOT NULL
      AND public.window_start(j.when_date, j.when_from) <= now() - interval '2 hours 30 minutes'
      AND public.window_start(j.when_date, j.when_from) > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id)
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (v_job.id, v_job.pro_id, 'no_show', 'potential', public.window_start(v_job.when_date, v_job.when_from),
            floor(extract(epoch FROM (now() - public.window_start(v_job.when_date, v_job.when_from))) / 60)::integer, 'clock')
    ON CONFLICT (job_id) DO NOTHING;
    IF FOUND THEN
      PERFORM public.log_job(v_job.id, 'no_show_potential');
      PERFORM public.tell(v_job.customer_id, 'no_show_customer', v_job.id, '/jobs',
        public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id)));
      PERFORM public.tell(v_job.pro_id, 'no_show_pro', v_job.id, '/pro', public.job_vars(v_job));
      PERFORM public.tell_office('no_show_office', v_job.id, public.job_vars(v_job));
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;


-- --- Cancelling ---------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.cancel_job(uuid, text);
/**
 * The customer cancels: free, always. Before he arrives, or at the door
 * before she gives him the start code. After that it is the office's. A
 * reason is one tap, words optional.
 */
CREATE OR REPLACE FUNCTION public.cancel_job(p_job uuid, p_reason text DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_job.status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('This job is already closed.');
  END IF;
  -- At the door she may still say no; once she has let him start, it is the office's.
  IF v_job.status = 'assigned' AND v_job.stage NOT IN ('chosen', 'on_way', 'arrived') THEN
    RETURN public.refuse('He has already started. Please call the Pechkas office to stop the job now.');
  END IF;
  IF p_code IS NOT NULL AND p_code NOT IN ('fixed_myself', 'someone_else', 'plans_changed', 'pro_late', 'better_price', 'not_needed', 'other') THEN
    RETURN public.refuse('Choose a reason from the list.', 'reason');
  END IF;
  IF length(coalesce(v_reason, '')) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'customer', cancel_reason = v_reason, cancel_code = p_code, updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true,
    'category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = p_job));
END;
$$;

DROP FUNCTION IF EXISTS public.admin_cancel_job(uuid, text);
/** The office cancels, at any step, saying whom for. Never a fee. */
CREATE OR REPLACE FUNCTION public.admin_cancel_job(p_job uuid, p_reason text, p_for text DEFAULT 'other')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT status INTO v_status FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('This job is already closed.');
  END IF;
  IF v_reason IS NULL THEN
    RETURN public.refuse('Write the reason. The customer will see it.', 'reason');
  END IF;
  IF length(v_reason) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  IF coalesce(p_for, 'other') NOT IN ('customer', 'pro', 'other') THEN
    RETURN public.refuse('Say whom you are cancelling for.', 'for');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'office', cancel_reason = v_reason, cancel_for = coalesce(p_for, 'other'), updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- His side: his record, and disputing it ---------------------------------------------------

/** His late arrivals and no-shows in the last 60 days, with what the office decided. */
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

/** He says a record about him is wrong, once, in words: it goes to the office. */
CREATE OR REPLACE FUNCTION public.pro_dispute_incident(p_incident uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inc  public.pro_incidents;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_inc FROM public.pro_incidents WHERE id = p_incident AND pro_id = auth.uid() FOR UPDATE;
  IF v_inc.id IS NULL THEN
    RETURN public.refuse('There is no such record.');
  END IF;
  IF v_inc.pro_said_at IS NOT NULL OR v_inc.status NOT IN ('recorded', 'potential', 'confirmed') THEN
    RETURN public.refuse('You have already told the office about this one.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Say what happened, in a sentence.', 'text');
  END IF;
  UPDATE public.pro_incidents SET status = 'disputed', status_before = v_inc.status, pro_text = v_text, pro_said_at = now()
  WHERE id = p_incident;
  PERFORM public.log_job(v_inc.job_id, 'incident_disputed', jsonb_build_object('kind', v_inc.kind));
  PERFORM public.tell_office('incident_disputed', v_inc.job_id, (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = v_inc.job_id));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The office ---------------------------------------------------------------------------------

/** Confirm or dismiss a late arrival or a potential no-show, with a note he reads in the app. */
CREATE OR REPLACE FUNCTION public.admin_incident(p_incident uuid, p_confirm boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inc  public.pro_incidents;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_inc FROM public.pro_incidents WHERE id = p_incident FOR UPDATE;
  IF v_inc.id IS NULL THEN
    RETURN public.refuse('There is no such record.');
  END IF;
  IF v_inc.status IN ('confirmed', 'dismissed') THEN
    RETURN public.refuse('This record has already been decided.');
  END IF;
  IF p_confirm IS NULL THEN
    RETURN public.refuse('Choose confirm or dismiss.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a sentence. He reads it in the app.', 'note');
  END IF;
  UPDATE public.pro_incidents
  SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'dismissed' END, office_note = v_note,
      decided_by_name = (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()), decided_at = now()
  WHERE id = p_incident RETURNING * INTO v_inc;
  PERFORM public.log_job(v_inc.job_id, 'incident_decided', jsonb_build_object('confirmed', p_confirm, 'note', v_note));
  PERFORM public.tell(v_inc.pro_id, 'incident_decided', v_inc.job_id, '/pro/money',
    (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = v_inc.job_id));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The office has looked at a customer's late cancellations: each unreviewed one gets the note. */
CREATE OR REPLACE FUNCTION public.admin_review_cancellations(p_customer uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_n    integer;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a sentence.', 'note');
  END IF;
  UPDATE public.cancellations
  SET reviewed_at = now(), reviewed_by_name = (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()), review_note = v_note
  WHERE customer_id = p_customer AND category = 'late' AND reviewed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN public.refuse('There is nothing waiting to be reviewed for this customer.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'reviewed', v_n);
END;
$$;

/** Every cancellation, who needs looking at, and each side's counts. */
CREATE OR REPLACE FUNCTION public.admin_cancellations()
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
    'late_cancels_at', public.setting('flag_late_cancels'),
    'late_arrivals_at', public.setting('flag_late_arrivals'),
    'no_shows_at', public.setting('flag_no_shows'),
    'cancellations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'job_id', c.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer_id', c.customer_id, 'customer', p.first_name, 'pro', r.full_name,
          'cancelled_by', c.cancelled_by, 'cancel_for', c.cancel_for, 'category', c.category,
          'reason_code', c.reason_code, 'reason_text', c.reason_text, 'cancelled_at', c.cancelled_at,
          'stage', c.stage, 'window_start', c.window_start, 'on_way_at', c.on_way_at, 'arrived_at', c.arrived_at,
          'reviewed_at', c.reviewed_at, 'reviewed_by_name', c.reviewed_by_name, 'review_note', c.review_note)
        ORDER BY c.cancelled_at DESC)
      FROM public.cancellations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.profiles p ON p.id = c.customer_id
      LEFT JOIN public.pros r ON r.id = c.pro_id
      WHERE c.cancelled_at > now() - interval '180 days'), '[]'::jsonb),
    'customers_to_review', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'late')::integer DESC)
      FROM (
        SELECT jsonb_build_object('customer_id', c.customer_id, 'customer', p.first_name,
                                  'phone', public.phone_of(c.customer_id), 'late', count(*),
                                  'unreviewed', count(*) FILTER (WHERE c.reviewed_at IS NULL)) AS x
        FROM public.cancellations c JOIN public.profiles p ON p.id = c.customer_id
        WHERE c.category = 'late' AND c.cancelled_at >= v_since
        GROUP BY c.customer_id, p.first_name
        HAVING count(*) >= public.setting('flag_late_cancels') AND count(*) FILTER (WHERE c.reviewed_at IS NULL) > 0) s), '[]'::jsonb),
    'incidents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'job_id', i.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'pro_id', i.pro_id, 'pro', r.full_name, 'pro_phone', public.phone_of(i.pro_id),
          'customer', p.first_name, 'customer_phone', public.phone_of(j.customer_id),
          'kind', i.kind, 'status', i.status, 'how', i.how, 'window_start', i.window_start, 'arrived_at', i.arrived_at,
          'minutes_late', i.minutes_late, 'detected_at', i.detected_at, 'pro_text', i.pro_text, 'office_note', i.office_note,
          'decided_by_name', i.decided_by_name, 'decided_at', i.decided_at, 'job_status', j.status,
          'needs_you', i.status IN ('potential', 'disputed'))
        ORDER BY (i.status IN ('potential', 'disputed')) DESC, i.detected_at DESC)
      FROM public.pro_incidents i
      JOIN public.jobs j ON j.id = i.job_id
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = i.pro_id
      WHERE i.detected_at > now() - interval '180 days' OR i.status IN ('potential', 'disputed')), '[]'::jsonb),
    'pros', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'pro')
      FROM (
        SELECT jsonb_build_object('pro_id', i.pro_id, 'pro', r.full_name,
            'late_arrivals', count(*) FILTER (WHERE i.kind = 'late_arrival' AND i.status <> 'dismissed'),
            'no_shows', count(*) FILTER (WHERE i.kind = 'no_show' AND i.status = 'confirmed'),
            'waiting', count(*) FILTER (WHERE i.status IN ('potential', 'disputed'))) AS x
        FROM public.pro_incidents i LEFT JOIN public.pros r ON r.id = i.pro_id
        WHERE i.detected_at >= v_since
        GROUP BY i.pro_id, r.full_name) s), '[]'::jsonb)
  );
END;
$$;



-- --- What the screens read ---------------------------------------------------------------------

/** Her jobs, as before, with what cancelling would mean right now. */
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
      'cancel_category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = j.id)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/** His jobs, as before, with when his window starts and whether he is late for it. */
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
      'late', j.stage IN ('chosen', 'on_way') AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now()
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

/**
 * The flags, as before, with the two cancellation flags replaced (D10): a
 * customer's late cancellations, and a technician's own late arrivals and
 * confirmed no-shows. Flags only: nothing here acts on anybody.
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
-- Trade, first names, the job number and minutes only. The office's notes
-- and his words are read in the app, never in a notification. An at-door
-- cancellation tells nobody new: it is on the office's Cancellations page.

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('no_show_customer.title',   492, NULL, '{pro} has not arrived', 'customer'),
  ('no_show_customer.body',    493, NULL, 'His time for job {ref} has passed. You can cancel free in the app, or keep waiting. Pechkas has been told.', 'customer'),
  ('no_show_pro.title',        494, NULL, 'You have not arrived: {ref}', 'technician'),
  ('no_show_pro.body',         495, NULL, 'Your time for this job has passed. Tap I have arrived if you are there, or ring the Pechkas office.', 'technician'),
  ('no_show_office.title',     496, NULL, 'Technician not arrived: {ref}', 'office'),
  ('no_show_office.body',      497, NULL, '30 minutes after his time ended, he has not tapped I have arrived. See Cancellations in the admin panel.', 'office'),
  ('late_arrival_pro.title',   498, NULL, 'Late arrival recorded: {ref}', 'technician'),
  ('late_arrival_pro.body',    499, NULL, 'You arrived {minutes} minutes after your time began. If that is wrong, tell the office from My account.', 'technician'),
  ('incident_disputed.title',  500, NULL, 'A technician disputes a record: {ref}', 'office'),
  ('incident_disputed.body',   501, NULL, 'Open Cancellations in the admin panel to read it and decide.', 'office'),
  ('incident_decided.title',   502, NULL, 'The office has looked at job {ref}', 'technician'),
  ('incident_decided.body',    503, NULL, 'Open My account to read what it decided.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 492 AND 503 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-no-show-clock', '* * * * *', 'SELECT public.no_show_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.window_start(date, smallint),
  public.cancel_kind(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean),
  public.record_cancellation(), public.record_late_arrival(), public.no_show_clock()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.cancel_job(uuid, text, text),
  public.admin_cancel_job(uuid, text, text),
  public.pro_record(),
  public.pro_dispute_incident(uuid, text),
  public.admin_incident(uuid, boolean, text),
  public.admin_review_cancellations(uuid, text),
  public.admin_cancellations(),
  public.admin_flags(),
  public.my_jobs(),
  public.pro_my_jobs()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261110100000_cancellations')
ON CONFLICT (name) DO NOTHING;

COMMIT;
