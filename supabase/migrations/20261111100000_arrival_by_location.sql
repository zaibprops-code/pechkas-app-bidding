-- =============================================================================
--  Arriving, checked by location: one location service for all of Pechkas
-- =============================================================================
--
--  The owner's decision (11 November 2026), revising D34: the technician's
--  arrival is checked against the customer's pin by GPS, as the PRIMARY
--  evidence. A photograph supports it; the office still decides every case.
--
--  ONE SERVICE. check_location() is the only place a phone's position is
--  judged, and distance_m() the only distance formula. Every event that
--  checks a location (today: "I have arrived" and "nobody home"; later: On my
--  way, guarantee visits, matching by distance) calls it and nothing else.
--
--  WHAT IS RECORDED, only at those moments (never in the background): the
--  coordinates, their accuracy, when the phone took the reading, when the
--  database received it, whether the phone says the position was faked, the
--  distance from her pin, and one result:
--    verified · too_far · poor_accuracy · stale · faked · no_pin ·
--    no_location · outside_pakistan
--  Verified needs all of: within arrival_radius_m (100) of her pin, accuracy
--  within gps_accuracy_m (50), a reading no older than gps_max_age_s (120)
--  by the phone's own clock (so a phone whose clock is wrong is not failed
--  for that), not faked, not a reading already used, inside Pakistan.
--  A failed check is never guilt: it asks the office to look.
--
--  ARRIVAL. arrived_at stays the moment he tapped the button. New:
--  arrival_verified_at (GPS said yes) and arrival_review_status:
--    pending (not checked yet or failed) · verified · approved (the office,
--    with a reason) · rejected (the office: he was not there) · code (she gave
--    him the start code, which proves he was at her door) · before_checks
--    (arrived before this migration; kept as it was).
--  Only verified, approved, code or before_checks satisfy the arrival. An
--  unverified tap does NOT stop D10's no-show watch, does not make her
--  cancellation "late", and does not by itself record a late arrival; the
--  arrival counts from the moment it is satisfied.
--
--  RETENTION. Exact coordinates are erased after location_keep_days (90 at
--  most) by erase_old_locations() every night; the distance, accuracy, times
--  and result stay. Everything is deleted earlier with the job or account.
--
--  WHO SEES WHAT. The office sees coordinates (as "Open in Google Maps"
--  links). He sees his own result and distance, never anybody's history.
--  She sees only "arrival verified", and only when it was. No notification
--  carries a coordinate.
--
--  Faking GPS is possible on a phone altered deeply enough; the faked flag
--  catches the common fake-location apps. GPS is strong evidence, not proof.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;


-- --- Settings (the office tunes them after the street test) ----------------------------------------

-- Metres and seconds are kept as plain counts (the older migrations, run again, allow no other unit).
INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('arrival_radius_m', 100, 'count', 'In metres: how close to the customer''s pin a technician must be for his arrival to count as verified.'),
  ('gps_accuracy_m', 50, 'count', 'In metres: the worst GPS accuracy a location check accepts.'),
  ('gps_max_age_s', 120, 'count', 'In seconds: the oldest phone reading a location check accepts, by the phone''s own clock.'),
  ('location_keep_days', 90, 'days', 'Exact coordinates are erased after this many days (90 at most, the owner''s rule). Distance and result stay.'),
  ('flag_unverified_arrivals', 3, 'count', 'Arrivals that could not be verified and were not approved, by one technician within flag_days, that ask the office to review.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('arrival_radius_m', 25, 500),
  ('gps_accuracy_m', 10, 200),
  ('gps_max_age_s', 30, 600),
  ('location_keep_days', 7, 90),
  ('flag_unverified_arrivals', 1, 20)
ON CONFLICT (key) DO NOTHING;


-- --- The one distance formula --------------------------------------------------------------------

/** Metres between two points on the earth (haversine), rounded. The only distance formula Pechkas uses. */
CREATE OR REPLACE FUNCTION public.distance_m(p_lat1 double precision, p_lng1 double precision,
                                            p_lat2 double precision, p_lng2 double precision)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL ELSE
    round(2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))::integer END;
$$;


-- --- The record ----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.location_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  event        text NOT NULL CHECK (event IN ('arrived', 'not_home')),
  lat          double precision,
  lng          double precision,
  accuracy_m   real,
  fix_at       timestamptz,
  sent_at      timestamptz,
  received_at  timestamptz NOT NULL DEFAULT now(),
  mocked       boolean,
  distance_m   integer,
  result       text NOT NULL CHECK (result IN ('verified', 'too_far', 'poor_accuracy', 'stale', 'faked', 'no_pin',
                                               'no_location', 'outside_pakistan')),
  -- Why the phone gave no position: it was refused, it could not get one, or an older copy of the app sent none.
  app_reason   text CHECK (app_reason IS NULL OR app_reason IN ('denied', 'unavailable', 'older_app')),
  erased_at    timestamptz
);
ALTER TABLE public.location_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_checks FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS location_checks_job ON public.location_checks (job_id, received_at);
CREATE INDEX IF NOT EXISTS location_checks_pro ON public.location_checks (pro_id, received_at DESC);

/**
 * Every decision the office takes against a failed or missing check, kept
 * for good: who, when, what and why. Nobody may change a line; a line goes
 * only with its job (and so with the account), like every record of a job.
 */
CREATE TABLE IF NOT EXISTS public.location_reviews (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id    uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('arrival', 'not_home')),
  decision  text NOT NULL CHECK (decision IN ('approved', 'rejected', 'confirmed')),
  note      text NOT NULL CHECK (length(note) BETWEEN 5 AND 300),
  evidence  jsonb,
  by_id     uuid,
  by_name   text,
  at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.location_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_reviews FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.location_reviews_written_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'A review is written once: it cannot be changed.';
END;
$$;
DROP TRIGGER IF EXISTS location_reviews_no_edit ON public.location_reviews;
CREATE TRIGGER location_reviews_no_edit BEFORE UPDATE ON public.location_reviews
  FOR EACH ROW EXECUTE FUNCTION public.location_reviews_written_once();

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_verified_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_review_status text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_arrival_review_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_arrival_review_status_check CHECK (arrival_review_status IS NULL OR arrival_review_status IN
  ('pending', 'verified', 'approved', 'rejected', 'code', 'before_checks'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_review_note text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_reviewed_by_name text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_reviewed_at timestamptz;
-- Arrivals before the checks existed stay as they were.
UPDATE public.jobs SET arrival_review_status = 'before_checks'
WHERE arrived_at IS NOT NULL AND arrival_review_status IS NULL;

ALTER TABLE public.not_home_reports ADD COLUMN IF NOT EXISTS arrival_check text;
ALTER TABLE public.not_home_reports ADD COLUMN IF NOT EXISTS report_check text;
ALTER TABLE public.not_home_reports ADD COLUMN IF NOT EXISTS evidence text;
ALTER TABLE public.not_home_reports DROP CONSTRAINT IF EXISTS not_home_reports_evidence_check;
ALTER TABLE public.not_home_reports ADD CONSTRAINT not_home_reports_evidence_check CHECK (evidence IS NULL OR evidence IN ('strong', 'partial', 'unverified'));
ALTER TABLE public.not_home_reports ADD COLUMN IF NOT EXISTS no_camera boolean NOT NULL DEFAULT false;


-- --- The one place a position is judged ----------------------------------------------------------

/**
 * Records one check for the technician asking, on this job, at this event,
 * and judges it. `p_loc` is what the phone sent: lat, lng, accuracy, fix_at
 * and sent_at (both by the phone's clock), mocked, or only a `reason` when
 * there is no position. NULL means an older copy that sends nothing.
 */
CREATE OR REPLACE FUNCTION public.check_location(p_job uuid, p_event text, p_loc jsonb)
RETURNS public.location_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_lat    double precision;
  v_lng    double precision;
  v_acc    real;
  v_fix    timestamptz;
  v_sent   timestamptz;
  v_mocked boolean;
  v_reason text;
  v_dist   integer;
  v_age    double precision;
  v_result text;
  v_row    public.location_checks;
  v_num    text := '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$';
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  IF p_loc IS NOT NULL AND jsonb_typeof(p_loc) = 'object' THEN
    v_lat := CASE WHEN p_loc ->> 'lat' ~ v_num THEN (p_loc ->> 'lat')::double precision END;
    v_lng := CASE WHEN p_loc ->> 'lng' ~ v_num THEN (p_loc ->> 'lng')::double precision END;
    v_acc := CASE WHEN p_loc ->> 'accuracy' ~ v_num THEN (p_loc ->> 'accuracy')::real END;
    BEGIN
      v_fix := (p_loc ->> 'fix_at')::timestamptz;
      v_sent := (p_loc ->> 'sent_at')::timestamptz;
    EXCEPTION WHEN others THEN
      v_fix := NULL; v_sent := NULL;
    END;
    v_mocked := CASE WHEN jsonb_typeof(p_loc -> 'mocked') = 'boolean' THEN (p_loc ->> 'mocked')::boolean END;
    v_reason := CASE WHEN p_loc ->> 'reason' IN ('denied', 'unavailable') THEN p_loc ->> 'reason' END;
  ELSE
    v_reason := 'older_app';
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    v_lat := NULL; v_lng := NULL;
    v_reason := coalesce(v_reason, 'unavailable');
  END IF;
  v_dist := public.distance_m(v_lat, v_lng, v_job.lat, v_job.lng);
  v_age := extract(epoch FROM (v_sent - v_fix));

  v_result := CASE
    WHEN v_lat IS NULL THEN 'no_location'
    WHEN v_lat NOT BETWEEN 23 AND 37.5 OR v_lng NOT BETWEEN 60 AND 78 THEN 'outside_pakistan'
    WHEN v_job.lat IS NULL OR v_job.lng IS NULL THEN 'no_pin'
    WHEN coalesce(v_mocked, false) THEN 'faked'
    -- A reading too old, from the future, or one already sent before: never fresh.
    WHEN v_fix IS NULL OR v_sent IS NULL OR v_age > public.setting('gps_max_age_s') OR v_age < -60
         OR EXISTS (SELECT 1 FROM public.location_checks c
                    WHERE c.pro_id = auth.uid() AND c.fix_at IS NOT NULL
                      AND (c.fix_at = v_fix OR (c.job_id = p_job AND c.fix_at > v_fix))) THEN 'stale'
    WHEN v_acc IS NULL OR v_acc <= 0 OR v_acc > public.setting('gps_accuracy_m') THEN 'poor_accuracy'
    WHEN v_dist > public.setting('arrival_radius_m') THEN 'too_far'
    ELSE 'verified'
  END;
  -- A position outside Pakistan is not kept: it is not where any job is.
  IF v_result = 'outside_pakistan' THEN
    v_lat := NULL; v_lng := NULL; v_dist := NULL;
  END IF;

  INSERT INTO public.location_checks (job_id, pro_id, event, lat, lng, accuracy_m, fix_at, sent_at, mocked, distance_m, result, app_reason)
  VALUES (p_job, auth.uid(), p_event, v_lat, v_lng, v_acc, v_fix, v_sent, v_mocked, v_dist, v_result, v_reason)
  RETURNING * INTO v_row;
  PERFORM public.log_job(p_job, 'location_' || p_event, jsonb_build_object('result', v_result, 'distance_m', v_dist));
  RETURN v_row;
END;
$$;

/**
 * When his arrival counts, if it does: the GPS check's moment, or the tap
 * once the office approved it or she gave him the start code. NULL while it
 * is not satisfied: then the job is watched as though he had not arrived.
 */
CREATE OR REPLACE FUNCTION public.arrival_at(p_job public.jobs)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE p_job.arrival_review_status
    WHEN 'verified' THEN coalesce(p_job.arrival_verified_at, p_job.arrived_at)
    WHEN 'approved' THEN p_job.arrived_at
    WHEN 'code' THEN p_job.arrived_at
    WHEN 'before_checks' THEN p_job.arrived_at
  END;
$$;

/** What he may read of his own last check on a job: never coordinates. */
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
  LEFT JOIN LATERAL (SELECT * FROM public.location_checks c WHERE c.job_id = p_job.id AND c.event = 'arrived'
                     ORDER BY c.received_at DESC LIMIT 1) c ON true
  WHERE p_job.arrived_at IS NOT NULL;
$$;


-- --- Arriving --------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.tech_step(uuid, text);
/**
 * His steps, as before; "I have arrived" now carries his position, which
 * check_location() judges. The tap is always recorded: a failed check never
 * stops him, it only leaves the arrival pending for a second check, the
 * start code, or the office.
 */
CREATE OR REPLACE FUNCTION public.tech_step(p_job uuid, p_from text, p_loc jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs;
  v_check public.location_checks;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM p_from THEN
    RETURN public.refuse('This job has already moved on. Pull down to refresh.', 'stage');
  END IF;
  IF p_from = 'chosen' THEN
    UPDATE public.jobs SET stage = 'on_way', on_way_at = now(), updated_at = now() WHERE id = p_job;
    RETURN jsonb_build_object('ok', true);
  ELSIF p_from = 'on_way' THEN
    v_check := public.check_location(p_job, 'arrived', p_loc);
    UPDATE public.jobs
    SET stage = 'arrived', arrived_at = now(), updated_at = now(),
        arrival_review_status = CASE WHEN v_check.result = 'verified' THEN 'verified' ELSE 'pending' END,
        arrival_verified_at = CASE WHEN v_check.result = 'verified' THEN now() END
    WHERE id = p_job;
    RETURN jsonb_build_object('ok', true, 'arrival', jsonb_build_object('result', v_check.result, 'distance_m', v_check.distance_m));
  ELSE
    RETURN public.refuse('That step needs the start code or a photo.', 'stage');
  END IF;
END;
$$;

/** At the door with an arrival not yet verified: check again (bad signal, a wrong first reading). */
CREATE OR REPLACE FUNCTION public.pro_check_arrival(p_job uuid, p_loc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs;
  v_check public.location_checks;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('This job has already moved on. Pull down to refresh.', 'stage');
  END IF;
  IF v_job.arrival_review_status NOT IN ('pending', 'rejected') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  v_check := public.check_location(p_job, 'arrived', p_loc);
  IF v_check.result = 'verified' THEN
    UPDATE public.jobs SET arrival_review_status = 'verified', arrival_verified_at = now(), updated_at = now() WHERE id = p_job;
  END IF;
  RETURN jsonb_build_object('ok', true, 'arrival', jsonb_build_object('result', v_check.result, 'distance_m', v_check.distance_m));
END;
$$;

/** Her start code proves he was at her door: an arrival not yet verified is satisfied by it. */
CREATE OR REPLACE FUNCTION public.arrival_by_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.stage = 'working' AND OLD.stage = 'arrived' AND public.arrival_at(NEW) IS NULL THEN
    NEW.arrival_review_status := 'code';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_arrival_code ON public.jobs;
CREATE TRIGGER job_arrival_code BEFORE UPDATE OF stage ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.arrival_by_code();

/**
 * D10's late arrival, now from the moment his arrival is SATISFIED (verified,
 * approved, or the start code), not from an unchecked tap: otherwise a tap
 * from across the city, early, would make a late arrival look on time. A
 * potential no-show already noted becomes a late arrival: he did come.
 */
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
  WHERE job_id = NEW.id AND kind = 'no_show' AND status = 'potential';
  IF NOT FOUND THEN
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, arrived_at, minutes_late, how)
    VALUES (NEW.id, NEW.pro_id, 'late_arrival', 'recorded', v_start, v_at, v_minutes, 'arrived_late')
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'late_arrival', jsonb_build_object('minutes', v_minutes));
  PERFORM public.tell(NEW.pro_id, 'late_arrival_pro', NEW.id, '/pro/money',
    public.job_vars(NEW) || jsonb_build_object('minutes', v_minutes));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_late_arrival ON public.jobs;
-- On every update: the arrival can be satisfied by a check, the office or the code (which a BEFORE trigger sets).
CREATE TRIGGER job_late_arrival AFTER UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_late_arrival();


-- --- The office --------------------------------------------------------------------------------------

/** Approve (he was there: bad signal, a wrong pin) or reject (he was not) an arrival the check could not verify. */
CREATE OR REPLACE FUNCTION public.admin_arrival(p_job uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_job.id IS NULL OR v_job.arrived_at IS NULL THEN
    RETURN public.refuse('There is no arrival to review on this job.');
  END IF;
  IF v_job.arrival_review_status NOT IN ('pending', 'rejected') OR (v_job.arrival_review_status = 'rejected' AND NOT coalesce(p_approve, false)) THEN
    RETURN public.refuse('This arrival has already been settled.');
  END IF;
  IF p_approve IS NULL THEN
    RETURN public.refuse('Choose approve or reject.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a sentence. He reads it in the app.', 'note');
  END IF;
  UPDATE public.jobs
  SET arrival_review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      arrival_review_note = v_note, arrival_reviewed_by_name = v_name, arrival_reviewed_at = now(), updated_at = now()
  WHERE id = p_job;
  INSERT INTO public.location_reviews (job_id, kind, decision, note, evidence, by_id, by_name)
  VALUES (p_job, 'arrival', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, v_note,
          (SELECT jsonb_agg(jsonb_build_object('result', c.result, 'distance_m', c.distance_m, 'accuracy_m', c.accuracy_m, 'at', c.received_at)
                            ORDER BY c.received_at)
           FROM public.location_checks c WHERE c.job_id = p_job AND c.event = 'arrived'),
          auth.uid(), v_name);
  PERFORM public.log_job(p_job, 'arrival_reviewed', jsonb_build_object('approved', p_approve, 'note', v_note));
  PERFORM public.tell(v_job.pro_id, 'arrival_decided_pro', p_job, '/pro/money', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Arrivals the check could not verify, with every check, for the office to approve or reject. */
CREATE OR REPLACE FUNCTION public.admin_arrivals()
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
    'radius_m', public.setting('arrival_radius_m'),
    'accuracy_m', public.setting('gps_accuracy_m'),
    'keep_days', public.setting('location_keep_days'),
    'review_at', public.setting('flag_unverified_arrivals'),
    'arrivals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'status', j.status, 'stage', j.stage, 'customer', p.first_name, 'customer_phone', public.phone_of(j.customer_id),
          'pro', r.full_name, 'pro_id', j.pro_id, 'pro_phone', public.phone_of(j.pro_id),
          'arrived_at', j.arrived_at, 'window_start', public.window_start(j.when_date, j.when_from),
          'review_status', j.arrival_review_status, 'review_note', j.arrival_review_note,
          'reviewed_by_name', j.arrival_reviewed_by_name, 'reviewed_at', j.arrival_reviewed_at,
          'pin', CASE WHEN j.lat IS NOT NULL THEN jsonb_build_object('lat', j.lat, 'lng', j.lng) END,
          'needs_you', j.arrival_review_status = 'pending',
          'checks', public.location_evidence(j.id))
        ORDER BY (j.arrival_review_status = 'pending') DESC, j.arrived_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      WHERE j.arrival_review_status IN ('pending', 'rejected')
        AND (j.arrived_at >= v_since OR (j.arrival_review_status = 'pending' AND j.status = 'assigned'))), '[]'::jsonb),
    'pros', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'unverified')::integer DESC)
      FROM (
        SELECT jsonb_build_object('pro_id', j.pro_id, 'pro', r.full_name,
                 'unverified', count(*) FILTER (WHERE j.arrival_review_status IN ('pending', 'rejected')),
                 'verified', count(*) FILTER (WHERE j.arrival_review_status = 'verified'),
                 'approved', count(*) FILTER (WHERE j.arrival_review_status = 'approved'),
                 'code', count(*) FILTER (WHERE j.arrival_review_status = 'code')) AS x
        FROM public.jobs j LEFT JOIN public.pros r ON r.id = j.pro_id
        WHERE j.arrived_at >= v_since AND j.pro_id IS NOT NULL AND j.arrival_review_status <> 'before_checks'
        GROUP BY j.pro_id, r.full_name) s), '[]'::jsonb)
  );
END;
$$;

/** Every location check on a job, for the office only: the coordinates while they are kept. */
CREATE OR REPLACE FUNCTION public.location_evidence(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'event', c.event, 'result', c.result, 'distance_m', c.distance_m, 'accuracy_m', round(c.accuracy_m),
      'lat', c.lat, 'lng', c.lng, 'mocked', c.mocked, 'app_reason', c.app_reason,
      'fix_at', c.fix_at, 'received_at', c.received_at, 'erased', c.erased_at IS NOT NULL)
    ORDER BY c.received_at), '[]'::jsonb)
  FROM public.location_checks c WHERE c.job_id = p_job;
$$;


-- --- Keeping coordinates no longer than allowed -------------------------------------------------------

/** Every night: exact coordinates older than location_keep_days are erased. What the check found stays. */
CREATE OR REPLACE FUNCTION public.erase_old_locations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.location_checks
  SET lat = NULL, lng = NULL, erased_at = now()
  WHERE lat IS NOT NULL
    AND received_at < now() - make_interval(days => least(public.setting('location_keep_days'), 90)::integer);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


-- --- Joined to D10 and D34 without changing their rules -------------------------------------------

/** D10's no-show watch, as before, now also over arrivals that were tapped but never verified. */
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
      AND NOT EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id)
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (v_job.id, v_job.pro_id, 'no_show', 'potential', public.window_start(v_job.when_date, v_job.when_from),
            floor(extract(epoch FROM (now() - public.window_start(v_job.when_date, v_job.when_from))) / 60)::integer, 'clock')
    ON CONFLICT (job_id) DO NOTHING;
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


/** D10's record of a cancellation, as before, reading the arrival only once it is satisfied. */
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
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(NEW.id, 'cancel_recorded', jsonb_build_object('category', v_category, 'code', NEW.cancel_code));
  RETURN NULL;
END;
$$;


/** Her jobs, as before; his arrival counts once satisfied, and she is told when it was verified. */
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
      'no_show', EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.kind = 'no_show' AND i.status = 'potential'),
      'cancel_code', j.cancel_code,
      'cancel_category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = j.id),
      -- He cannot get in (D34): being asked, "I'm coming", and "I was home".
      'not_home', public.not_home_view(j.id, 'customer'),
      -- Said to her only when the location check verified it; never his coordinates.
      'arrival_verified', j.arrival_review_status = 'verified'
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;


/** His jobs, as before, with his own arrival check. */
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
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;


DROP FUNCTION IF EXISTS public.pro_report_not_home(uuid, text, text);
/** D34's report, as before, now with his position checked the one way; a photo only when it could not be verified. */
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
  SELECT * INTO v_rep FROM public.not_home_reports WHERE job_id = p_job FOR UPDATE;
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


/** D34's office decision, as before, with a permanent review line. */
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
  -- Kept for good, whatever the evidence was: who decided, when, why, and what the checks said.
  INSERT INTO public.location_reviews (job_id, kind, decision, note, evidence, by_id, by_name)
  VALUES (v_rep.job_id, 'not_home', CASE WHEN p_confirm THEN 'confirmed' ELSE 'rejected' END, v_note,
          jsonb_build_object('evidence', v_rep.evidence, 'arrival_check', v_rep.arrival_check, 'report_check', v_rep.report_check,
                             'photo', v_rep.photo_path IS NOT NULL, 'disputed', v_rep.status = 'disputed'),
          auth.uid(), (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()));
  v_vars := (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = v_rep.job_id);
  PERFORM public.tell(v_rep.customer_id, 'not_home_decided', v_rep.job_id, '/jobs', v_vars);
  PERFORM public.tell(v_rep.pro_id, 'not_home_decided_pro', v_rep.job_id, '/pro/money', v_vars);
  RETURN jsonb_build_object('ok', true);
END;
$$;


/** D34's list for the office, as before, with the location evidence. */
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
          'evidence', r.evidence, 'arrival_check', r.arrival_check, 'report_check', r.report_check, 'no_camera', r.no_camera,
          'pin', CASE WHEN j.lat IS NOT NULL THEN jsonb_build_object('lat', j.lat, 'lng', j.lng) END,
          'checks', public.location_evidence(r.job_id),
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


/** His record, as before, with the arrivals that could not be verified and what the office decided. */
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
        AND j.arrived_at > now() - interval '90 days'), '[]'::jsonb),
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


/** The flags, as before, with unverified arrivals. */
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
         AND x.arrived_at >= v_since) AS unverified_arrivals,
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
-- No coordinate, distance or office note ever goes in a notification.

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('arrival_decided_pro.title',      522, NULL, 'The office has looked at your arrival: {ref}', 'technician'),
  ('arrival_decided_pro.body',       523, NULL, 'Open My account to read what it decided.', 'technician'),
  ('arrival_unchecked_pro.title',    524, NULL, 'Your arrival is not verified: {ref}', 'technician'),
  ('arrival_unchecked_pro.body',     525, NULL, 'Your time for this job has passed and your arrival could not be checked. At the door, tap Check my location again, or ring the Pechkas office.', 'technician'),
  ('arrival_unchecked_office.title', 526, NULL, 'Arrival not verified: {ref}', 'office'),
  ('arrival_unchecked_office.body',  527, NULL, '30 minutes after his time ended, his arrival is still not verified. See Cancellations in the admin panel.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 522 AND 527 AND ur IS NULL;


-- --- The clock --------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-erase-old-locations', '17 3 * * *', 'SELECT public.erase_old_locations()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.distance_m(double precision, double precision, double precision, double precision),
  public.check_location(uuid, text, jsonb),
  public.arrival_at(public.jobs),
  public.arrival_view(public.jobs),
  public.location_evidence(uuid),
  public.arrival_by_code(),
  public.location_reviews_written_once(),
  public.erase_old_locations()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.tech_step(uuid, text, jsonb),
  public.pro_check_arrival(uuid, jsonb),
  public.pro_report_not_home(uuid, text, text, jsonb, boolean),
  public.admin_arrival(uuid, boolean, text),
  public.admin_arrivals(),
  public.admin_not_home(uuid, boolean, text),
  public.admin_not_home_reports(),
  public.admin_flags(),
  public.pro_record(),
  public.my_jobs(),
  public.pro_my_jobs()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261111100000_arrival_by_location')
ON CONFLICT (name) DO NOTHING;

COMMIT;
