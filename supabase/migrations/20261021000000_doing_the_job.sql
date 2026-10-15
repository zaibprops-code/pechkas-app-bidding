-- =============================================================================
--  DOING THE JOB (phase 4)
--
--  Run after 20261020000000_who_else_hears.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds, in the order a job goes:
--   - the technician's steps: On my way → Arrived → (start code) Working →
--     Done. Forward only, one at a time, from the step the job is really at;
--   - the START CODE: four digits on the customer's phone, typed in by the
--     man at the gate. It proves he is the one the app sent. Five wrong tries
--     lock it and the office is told;
--   - before and after photos, required to start and to finish;
--   - a NEW PRICE AT THE DOOR: never just asked for. He sends the price, a
--     reason and a photo; the customer approves or declines in the app.
--     Declined, the job stops and only the visit fee is owed;
--   - the VISIT FEE: the petrol for his trip, between `visit_fee_min_paisa`
--     and `visit_fee_max_paisa`. Until Google Maps measures the trip there
--     is no distance, and the owner's rule is then the smallest fee;
--   - a text chat between the two, kept as the record if anything goes wrong;
--   - "something is wrong", for 24 hours after the job, to the office;
--   - every step written down in `job_events`, for the office.
--
--  MONEY: the apps never write a price. The new price is the technician's
--  request until the customer's own tap approves it, here, in the database.
-- =============================================================================

BEGIN;


-- --- Numbers the owner chose ---------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('visit_fee_min_paisa', 30000, 'paisa',
     'The smallest visit fee: what a customer owes if she declines a new price at the door. Also the fee when the trip cannot be measured.'),
  ('visit_fee_max_paisa', 100000, 'paisa',
     'The largest visit fee, however far he came. The same as the website''s inspection fee.'),
  ('code_tries', 5, 'count',
     'Wrong start codes before the code locks and the office is told.')
ON CONFLICT (key) DO NOTHING;


-- --- The job's steps ---------------------------------------------------------------------

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('open', 'assigned', 'done', 'stopped', 'cancelled'));

-- Where an assigned job is. NULL whenever the job is not assigned.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS stage text
  CHECK (stage IN ('chosen', 'on_way', 'arrived', 'working'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS start_code text CHECK (start_code ~ '^[0-9]{4}$');
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS code_tries smallint NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS code_locked_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS on_way_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
-- What he collects at the end, in cash: the agreed price when done, the
-- visit fee when stopped. Fixed when the job ends, so a later change to the
-- settings cannot rewrite what somebody already paid.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS collect_paisa bigint CHECK (collect_paisa IS NULL OR (collect_paisa > 0 AND collect_paisa % 100 = 0));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS problem_text text CHECK (problem_text IS NULL OR length(problem_text) <= 500);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS problem_at timestamptz;

/** Four digits from a strong random source. random() is not one. */
CREATE OR REPLACE FUNCTION public.new_start_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::integer) % 10000)::text, 4, '0');
$$;

/**
 * The moment a technician is given the job — by the customer or the office —
 * it gets a start code and its first step. Leaving `assigned` clears the
 * step. Done here, once, so no function can forget.
 */
CREATE OR REPLACE FUNCTION public.job_steps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'assigned' AND OLD.status IS DISTINCT FROM 'assigned' THEN
    NEW.stage := 'chosen';
    NEW.start_code := public.new_start_code();
    NEW.code_tries := 0;
    NEW.code_locked_at := NULL;
  ELSIF NEW.status <> 'assigned' THEN
    NEW.stage := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_steps ON public.jobs;
CREATE TRIGGER job_steps BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_steps();

-- Jobs already given to a technician before this file ran get their first
-- step and a code too, or they could never move.
UPDATE public.jobs SET stage = 'chosen', start_code = public.new_start_code()
WHERE status = 'assigned' AND stage IS NULL;


-- --- What happened, when, and who did it ------------------------------------------------

-- Written only by the database. Nobody, the office included, can change it.
CREATE TABLE IF NOT EXISTS public.job_events (
  id       bigserial PRIMARY KEY,
  job_id   uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  at       timestamptz NOT NULL DEFAULT now(),
  actor    text NOT NULL CHECK (actor IN ('customer', 'pro', 'office', 'system')),
  actor_id uuid,
  what     text NOT NULL,
  detail   jsonb
);
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS job_events_job ON public.job_events (job_id, at);

/** Writes one line in a job's history, saying who did it. */
CREATE OR REPLACE FUNCTION public.log_job(p_job uuid, p_what text, p_detail jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
BEGIN
  SELECT CASE
           WHEN auth.uid() IS NULL THEN 'system'
           WHEN auth.uid() = j.customer_id THEN 'customer'
           WHEN auth.uid() = j.pro_id THEN 'pro'
           WHEN public.is_staff() THEN 'office'
           ELSE 'system'
         END
  INTO v_actor FROM public.jobs j WHERE j.id = p_job;
  INSERT INTO public.job_events (job_id, actor, actor_id, what, detail)
  VALUES (p_job, coalesce(v_actor, 'system'), auth.uid(), p_what, p_detail);
END;
$$;

/** Posting, every change of status and every step go in the history by themselves. */
CREATE OR REPLACE FUNCTION public.on_job_logged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_job(NEW.id, 'posted', jsonb_build_object('offered_paisa', NEW.offered_paisa));
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_job(NEW.id, NEW.status, jsonb_strip_nulls(jsonb_build_object(
        'pro_id', NEW.pro_id, 'agreed_paisa', NEW.agreed_paisa, 'collect_paisa', NEW.collect_paisa,
        'reason', CASE WHEN NEW.status = 'cancelled' THEN NEW.cancel_reason END)));
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IS NOT NULL AND NEW.stage <> 'chosen' THEN
      PERFORM public.log_job(NEW.id, NEW.stage);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_logged ON public.jobs;
CREATE TRIGGER job_logged AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_logged();


-- --- Photos and new prices ------------------------------------------------------------------

-- The technician's photos, in his own folder of the private bucket.
CREATE TABLE IF NOT EXISTS public.job_photos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  stage      text NOT NULL CHECK (stage IN ('before', 'after', 'change')),
  path       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS job_photos_job ON public.job_photos (job_id);

-- A new price at the door. pending until the customer taps.
CREATE TABLE IF NOT EXISTS public.job_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  from_paisa  bigint NOT NULL,
  price_paisa bigint NOT NULL CHECK (price_paisa > 0 AND price_paisa % 100 = 0),
  reason      text NOT NULL CHECK (length(reason) BETWEEN 5 AND 300),
  photo_path  text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);
ALTER TABLE public.job_changes ENABLE ROW LEVEL SECURITY;
-- Never two waiting at once on one job.
CREATE UNIQUE INDEX IF NOT EXISTS job_changes_one_pending ON public.job_changes (job_id) WHERE status = 'pending';

/**
 * Checks that every path is a photo the asker really uploaded to their own
 * folder, and that there are between `p_min` and 4. NULL means fine;
 * otherwise the sentence to show.
 */
CREATE OR REPLACE FUNCTION public.own_uploads(p_paths jsonb, p_min integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
  v_n    integer := 0;
BEGIN
  IF p_paths IS NULL OR jsonb_typeof(p_paths) <> 'array' THEN
    RETURN 'Add a photo.';
  END IF;
  FOR v_path IN SELECT jsonb_array_elements_text(p_paths) LOOP
    v_n := v_n + 1;
    IF split_part(v_path, '/', 1) <> auth.uid()::text OR v_path ~ '\.\.'
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'job-media' AND o.name = v_path)
       OR EXISTS (SELECT 1 FROM public.job_photos p WHERE p.path = v_path)
       OR EXISTS (SELECT 1 FROM public.job_media m WHERE m.path = v_path) THEN
      RETURN 'A photo did not finish uploading. Try again.';
    END IF;
  END LOOP;
  IF v_n < p_min THEN
    RETURN 'Add a photo.';
  END IF;
  IF v_n > 4 THEN
    RETURN 'At most 4 photos.';
  END IF;
  RETURN NULL;
END;
$$;

/** The customer may open the photos the technician took on her job. */
CREATE OR REPLACE FUNCTION public.customer_may_see_file(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_photos p JOIN public.jobs j ON j.id = p.job_id
    WHERE p.path = p_name AND j.customer_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "job media: read own folder, the office, or a technician who may see the job" ON storage.objects;
DROP POLICY IF EXISTS "job media: read own folder, the office, the job's technician or its customer" ON storage.objects;
CREATE POLICY "job media: read own folder, the office, the job's technician or its customer" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff()
      OR public.pro_may_see_file(name)
      OR public.customer_may_see_file(name)
    )
  );


-- --- The visit fee ------------------------------------------------------------------------

/**
 * What a customer owes when she declines a new price at the door: the petrol
 * for his trip, never below the smallest or above the largest fee.
 *
 * The trip is to be measured with Google Maps, which is not connected yet.
 * Without a measured distance the owner's rule is the smallest fee — never a
 * guess. When Google Maps arrives, the distance goes in here and nowhere
 * else, so the customer's screen and the technician's cannot disagree.
 */
CREATE OR REPLACE FUNCTION public.visit_fee(p_job uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.setting('visit_fee_min_paisa');
$$;


-- --- The office, told -------------------------------------------------------------------------

/** Tells every active office person with an alert number. */
CREATE OR REPLACE FUNCTION public.tell_office(p_kind text, p_job uuid, p_vars jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff uuid;
BEGIN
  FOR v_staff IN
    SELECT DISTINCT u.id FROM public.staff s JOIN auth.users u ON u.phone = s.alert_phone
    WHERE s.active AND s.alert_phone IS NOT NULL
  LOOP
    PERFORM public.tell(v_staff, p_kind, p_job, '/', p_vars);
  END LOOP;
END;
$$;


-- --- The technician's side -------------------------------------------------------------------

/**
 * The job he is chosen for, locked, if it is his and still on. Every step
 * below starts here, so "is it his" is written once.
 */
CREATE OR REPLACE FUNCTION public.my_assigned_job(p_job uuid)
RETURNS public.jobs
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.* FROM public.jobs j
  JOIN public.pros r ON r.id = j.pro_id AND r.status = 'approved'
  WHERE j.id = p_job AND j.pro_id = auth.uid() AND j.status = 'assigned'
  FOR UPDATE OF j;
$$;

/**
 * On my way, then Arrived. He sends the step his screen was showing; if the
 * job is not at that step any more — a tap that looked lost on bad signal and
 * was tapped again — nothing moves.
 */
CREATE OR REPLACE FUNCTION public.tech_step(p_job uuid, p_from text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
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
  ELSIF p_from = 'on_way' THEN
    UPDATE public.jobs SET stage = 'arrived', arrived_at = now(), updated_at = now() WHERE id = p_job;
  ELSE
    RETURN public.refuse('That step needs the start code or a photo.', 'stage');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * At the gate: the customer's code, and at least one photo of how it was.
 * A wrong code is counted and REMEMBERED — so this refuses rather than
 * raising, which would undo the count.
 */
CREATE OR REPLACE FUNCTION public.start_work(p_job uuid, p_code text, p_photos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_problem text;
  v_tries   integer;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('Tap Arrived first.', 'stage');
  END IF;
  IF v_job.code_locked_at IS NOT NULL THEN
    RETURN public.refuse('Too many wrong codes. Call the Pechkas office.', 'code');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;

  IF p_code IS NULL OR btrim(p_code) <> v_job.start_code THEN
    v_tries := v_job.code_tries + 1;
    UPDATE public.jobs SET code_tries = v_tries,
           code_locked_at = CASE WHEN v_tries >= public.setting('code_tries') THEN now() END
    WHERE id = p_job;
    PERFORM public.log_job(p_job, 'code_wrong', jsonb_build_object('try', v_tries));
    IF v_tries >= public.setting('code_tries') THEN
      PERFORM public.log_job(p_job, 'code_locked');
      PERFORM public.tell_office('code_locked', p_job, public.job_vars(v_job));
      RETURN public.refuse('Too many wrong codes. Call the Pechkas office.', 'code');
    END IF;
    RETURN public.refuse('That is not the code. Ask the customer to read it from the app.', 'code');
  END IF;

  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'before', x FROM jsonb_array_elements_text(p_photos) AS x;
  UPDATE public.jobs SET stage = 'working', started_at = now(), updated_at = now() WHERE id = p_job;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** A new price, with a reason and a photo. The customer decides; he cannot. */
CREATE OR REPLACE FUNCTION public.ask_change(p_job uuid, p_price_paisa bigint, p_reason text, p_photo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_problem text;
  v_id      uuid;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage NOT IN ('arrived', 'working') THEN
    RETURN public.refuse('A new price can only be asked at the house.', 'stage');
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_changes WHERE job_id = p_job AND status = 'pending') THEN
    RETURN public.refuse('The customer has not answered the last one yet.', 'stage');
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 OR p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('Write the new price in whole rupees.', 'price');
  END IF;
  IF p_price_paisa = v_job.agreed_paisa THEN
    RETURN public.refuse('That is the price already agreed.', 'price');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RETURN public.refuse('Say why: what did you find?', 'reason');
  END IF;
  IF length(v_reason) > 300 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Keep the reason short.', 'reason');
  END IF;
  v_problem := public.own_uploads(jsonb_build_array(p_photo), 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;

  INSERT INTO public.job_changes (job_id, pro_id, from_paisa, price_paisa, reason, photo_path)
  VALUES (p_job, auth.uid(), v_job.agreed_paisa, p_price_paisa, v_reason, p_photo)
  RETURNING id INTO v_id;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'change', p_photo);
  PERFORM public.log_job(p_job, 'change_asked', jsonb_build_object('from_paisa', v_job.agreed_paisa, 'price_paisa', p_price_paisa, 'reason', v_reason));
  PERFORM public.tell(v_job.customer_id, 'change', p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object(
      'pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id),
      'price', public.rs(p_price_paisa), 'was', public.rs(v_job.agreed_paisa)));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** He takes back a new price the customer has not answered. */
CREATE OR REPLACE FUNCTION public.withdraw_change(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  UPDATE public.job_changes SET status = 'withdrawn', decided_at = now()
  WHERE job_id = p_job AND status = 'pending';
  IF NOT FOUND THEN
    RETURN public.refuse('There is no new price waiting.');
  END IF;
  PERFORM public.log_job(p_job, 'change_withdrawn');
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Done: at least one photo of the finished work. Nothing may be waiting on the customer. */
CREATE OR REPLACE FUNCTION public.finish_work(p_job uuid, p_photos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_problem text;
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
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;

  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'after', x FROM jsonb_array_elements_text(p_photos) AS x;
  UPDATE public.jobs
  SET status = 'done', finished_at = now(), collect_paisa = agreed_paisa, updated_at = now()
  WHERE id = p_job;
  RETURN jsonb_build_object('ok', true, 'collect_paisa', v_job.agreed_paisa);
END;
$$;


-- --- The customer's side ---------------------------------------------------------------------

/**
 * Approve or decline a new price. Approved, it is the agreed price.
 * Declined, the job stops here and the visit fee is what is owed.
 */
CREATE OR REPLACE FUNCTION public.decide_change(p_change uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change public.job_changes%ROWTYPE;
  v_job    public.jobs%ROWTYPE;
  v_fee    bigint;
BEGIN
  SELECT * INTO v_change FROM public.job_changes WHERE id = p_change;
  IF v_change.id IS NULL THEN
    RETURN public.refuse('That new price is no longer there.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_change.job_id FOR UPDATE;
  IF v_job.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN public.refuse('That new price is no longer there.');
  END IF;
  SELECT * INTO v_change FROM public.job_changes WHERE id = p_change FOR UPDATE;
  IF v_change.status <> 'pending' OR v_job.status <> 'assigned' THEN
    RETURN public.refuse('This has already been answered, or the job has ended.');
  END IF;

  IF coalesce(p_approve, false) THEN
    UPDATE public.job_changes SET status = 'approved', decided_at = now() WHERE id = p_change;
    UPDATE public.jobs SET agreed_paisa = v_change.price_paisa, updated_at = now() WHERE id = v_job.id;
    PERFORM public.log_job(v_job.id, 'change_approved', jsonb_build_object('price_paisa', v_change.price_paisa));
    PERFORM public.tell(v_job.pro_id, 'change_ok', v_job.id, '/pro',
      public.job_vars(v_job) || jsonb_build_object('price', public.rs(v_change.price_paisa)));
  ELSE
    v_fee := public.visit_fee(v_job.id);
    UPDATE public.job_changes SET status = 'declined', decided_at = now() WHERE id = p_change;
    PERFORM public.log_job(v_job.id, 'change_declined', jsonb_build_object('price_paisa', v_change.price_paisa));
    UPDATE public.jobs
    SET status = 'stopped', finished_at = now(), collect_paisa = v_fee, updated_at = now()
    WHERE id = v_job.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** "Something is wrong", within 24 hours of the end. Once; the office takes it from there. */
CREATE OR REPLACE FUNCTION public.report_problem(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status NOT IN ('done', 'stopped') THEN
    RETURN public.refuse('There is no finished job here to report.');
  END IF;
  IF v_job.problem_at IS NOT NULL THEN
    RETURN public.refuse('You have already told us. The office will call you.');
  END IF;
  IF v_job.finished_at < now() - interval '24 hours' THEN
    RETURN public.refuse('It has been more than a day. Please call the Pechkas office.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 THEN
    RETURN public.refuse('Tell us what is wrong, in a few words.', 'problem');
  END IF;
  IF length(v_text) > 500 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Please keep it shorter.', 'problem');
  END IF;
  UPDATE public.jobs SET problem_text = v_text, problem_at = now(), updated_at = now() WHERE id = p_job;
  PERFORM public.log_job(p_job, 'problem', jsonb_build_object('text', v_text));
  PERFORM public.tell_office('problem', p_job, public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** A customer calls off their own job: open, or before the technician reaches the house. */
CREATE OR REPLACE FUNCTION public.cancel_job(p_job uuid, p_reason text DEFAULT NULL)
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
  -- Once he is at the gate, a "no" is a declined price (and the visit fee)
  -- or a call to the office — not a button that leaves him there unpaid.
  IF v_job.status = 'assigned' AND v_job.stage NOT IN ('chosen', 'on_way') THEN
    RETURN public.refuse('He has already arrived. Please call the Pechkas office to cancel now.');
  END IF;
  IF length(coalesce(v_reason, '')) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'customer', cancel_reason = v_reason, updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- What each side sees ---------------------------------------------------------------------

/** A job's photos, by stage, for whoever is already allowed to see that job. */
CREATE OR REPLACE FUNCTION public.photos_of(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('stage', p.stage, 'path', p.path) ORDER BY p.id), '[]'::jsonb)
  FROM public.job_photos p WHERE p.job_id = p_job;
$$;

/** The new price waiting on a job, if there is one. */
CREATE OR REPLACE FUNCTION public.pending_change(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', c.id, 'from_paisa', c.from_paisa, 'price_paisa', c.price_paisa,
                            'reason', c.reason, 'photo', c.photo_path, 'created_at', c.created_at)
  FROM public.job_changes c WHERE c.job_id = p_job AND c.status = 'pending';
$$;

/**
 * The customer's own jobs. The start code is shown from the moment he is
 * chosen until he starts; after that it has done its job. The technician's
 * number only while the job is on; afterwards his first name, and the
 * office for anything else.
 */
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
      'change', CASE WHEN j.status = 'assigned' THEN public.pending_change(j.id) END,
      'visit_fee_paisa', CASE WHEN j.status = 'assigned' THEN public.visit_fee(j.id) END,
      'collect_paisa', j.collect_paisa,
      'finished_at', j.finished_at,
      'photos', public.photos_of(j.id),
      'can_report', j.status IN ('done', 'stopped') AND j.problem_at IS NULL AND j.finished_at > now() - interval '24 hours',
      'problem_at', j.problem_at,
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/**
 * The jobs a technician has been chosen for, with what he needs to get
 * there, the step each is at, and what he will collect. Never the start code:
 * that is the customer's to give.
 */
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
      'keeps_paisa', j.agreed_paisa - (j.agreed_paisa * public.setting('commission_bps')) / 10000,
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
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

/**
 * What he finished in the last day: what to collect, and nothing about the
 * house any more. The address left his phone when the job ended.
 */
CREATE OR REPLACE FUNCTION public.pro_finished()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
      'status', j.status, 'collect_paisa', j.collect_paisa, 'finished_at', j.finished_at,
      'customer_first_name', p.first_name
    ) ORDER BY j.finished_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE j.pro_id = auth.uid() AND j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '24 hours';
$$;


-- --- Chat --------------------------------------------------------------------------------

-- Text only, between the customer and the chosen technician, kept as the
-- record if anything goes wrong. The office can read it; nobody can edit it.
CREATE TABLE IF NOT EXISTS public.job_messages (
  id         bigserial PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sender_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS job_messages_job ON public.job_messages (job_id, id);

/** The asker's side of a job they may chat on: 'customer', 'pro', or NULL. */
CREATE OR REPLACE FUNCTION public.chat_side(p_job uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN j.customer_id = auth.uid() THEN 'customer'
              WHEN j.pro_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = auth.uid() AND r.status = 'approved') THEN 'pro'
         END
  FROM public.jobs j
  WHERE j.id = p_job AND j.pro_id IS NOT NULL
    -- Readable while the job is on and for a day after, then it is the
    -- office's record.
    AND (j.status = 'assigned' OR (j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '24 hours'));
$$;

/** The messages on one job, for its customer or its technician. */
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
      FROM public.job_messages m WHERE m.job_id = p_job), '[]'::jsonb)
  );
END;
$$;

/** One message. Its words never go on the other person's lock screen — only that one came. */
CREATE OR REPLACE FUNCTION public.send_message(p_job uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_side text := public.chat_side(p_job);
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_job  public.jobs%ROWTYPE;
  v_to   uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  IF v_side IS NULL OR v_job.status <> 'assigned' THEN
    RETURN public.refuse('This chat is closed.');
  END IF;
  IF v_body IS NULL THEN
    RETURN public.refuse('Write something first.', 'body');
  END IF;
  IF length(v_body) > 500 THEN
    RETURN public.refuse('Keep it shorter.', 'body');
  END IF;
  IF public.looks_like_cnic(v_body) THEN
    RETURN public.refuse('Never send a CNIC number here.', 'body');
  END IF;
  IF (SELECT count(*) FROM public.job_messages WHERE job_id = p_job) >= 300 THEN
    RETURN public.refuse('This chat is full. Please call instead.', 'body');
  END IF;

  INSERT INTO public.job_messages (job_id, sender_id, body) VALUES (p_job, auth.uid(), v_body);

  -- One buzz a minute at most, however fast the messages come.
  v_to := CASE WHEN v_side = 'customer' THEN v_job.pro_id ELSE v_job.customer_id END;
  IF NOT EXISTS (SELECT 1 FROM public.push_log WHERE user_id = v_to AND job_id = p_job AND kind = 'message'
                 AND created_at > now() - interval '1 minute') THEN
    PERFORM public.tell(v_to, 'message', p_job, CASE WHEN v_side = 'customer' THEN '/pro' ELSE '/jobs' END,
      public.job_vars(v_job) || jsonb_build_object(
        'from', CASE WHEN v_side = 'customer' THEN (SELECT first_name FROM public.profiles WHERE id = v_job.customer_id)
                     ELSE (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id) END));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Notifications for the new moments ----------------------------------------------------------

-- Who reads each message, so the rule "a technician always gets Roman Urdu"
-- is the database's, not a list in a test. Rows from before this column
-- existed are sorted out first; every later insert says who.
ALTER TABLE public.push_words ADD COLUMN IF NOT EXISTS who text;
UPDATE public.push_words SET who = CASE
    WHEN key ~ '^(offer|office_assigned|office_cancelled)\.' THEN 'customer'
    WHEN key ~ '^needs_you\.' THEN 'office'
    ELSE 'technician'
  END
WHERE who IS NULL;

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('on_way.title',     100, NULL, '{pro} is on his way to {ref}', 'customer'),
  ('on_way.body',      101, NULL, 'Your start code is in the app. Give it to him at the door, not before.', 'customer'),
  ('arrived.title',    110, NULL, '{pro} has arrived', 'customer'),
  ('arrived.body',     111, NULL, 'Give him the start code from the app for {ref}, once you have seen him.', 'customer'),
  ('change.title',     120, NULL, '{pro} asks a new price: {price}', 'customer'),
  ('change.body',      121, NULL, 'For {ref}, instead of {was}. Approve or decline in the app; nothing changes until you do.', 'customer'),
  ('change_ok.title',  130, 'Nayi price manzoor: {price}', 'New price approved: {price}', 'technician'),
  ('change_ok.body',   131, '{customer} ne {ref} ki nayi price maan li. Kaam jaari rakhein.', '{customer} approved the new price for {ref}. Carry on.', 'technician'),
  ('stopped.title',    140, 'Kaam band: {ref}', 'Job stopped: {ref}', 'technician'),
  ('stopped.body',     141, '{customer} ne nayi price nahi maani. Sirf visit fee {fee} lein.', '{customer} declined the new price. Collect only the visit fee, {fee}.', 'technician'),
  ('done.title',       150, NULL, '{ref} is done', 'customer'),
  ('done.body',        151, NULL, 'Pay {pro} {price} in cash. If something is wrong, tell us in the app within 24 hours.', 'customer'),
  ('message.title',    160, 'Naya message: {from}', 'New message from {from}', 'both'),
  ('message.body',     161, '{ref} ke baare mein. Parhne ke liye app kholein.', 'About {ref}. Open the app to read it.', 'both'),
  ('code_locked.title', 170, NULL, 'Start code locked on {ref}', 'office'),
  ('code_locked.body',  171, NULL, 'Too many wrong codes at the gate. Ring the customer and the technician, then unlock it in the admin panel.', 'office'),
  ('problem.title',    180, NULL, 'Problem reported on {ref}', 'office'),
  ('problem.body',     181, NULL, '{customer} says something is wrong. Open the admin panel and ring them.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;

ALTER TABLE public.push_words ALTER COLUMN who SET NOT NULL;
ALTER TABLE public.push_words DROP CONSTRAINT IF EXISTS push_words_who;
ALTER TABLE public.push_words ADD CONSTRAINT push_words_who
  CHECK (who IN ('technician', 'customer', 'office', 'both'));
ALTER TABLE public.push_words DROP CONSTRAINT IF EXISTS push_words_urdu;
ALTER TABLE public.push_words ADD CONSTRAINT push_words_urdu
  CHECK (who IN ('customer', 'office') OR ur IS NOT NULL);

/** Now also the steps of an assigned job, and its end. */
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
    ELSIF OLD.status = 'assigned' AND NEW.status = 'cancelled' AND OLD.pro_id IS NOT NULL THEN
      PERFORM public.tell(OLD.pro_id, 'cancelled', NEW.id, '/pro', v_vars);
    ELSIF NEW.status = 'done' THEN
      PERFORM public.tell(NEW.customer_id, 'done', NEW.id, '/jobs', v_vars);
    ELSIF NEW.status = 'stopped' THEN
      PERFORM public.tell(NEW.pro_id, 'stopped', NEW.id, '/pro', v_vars);
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

DROP TRIGGER IF EXISTS push_job_changed ON public.jobs;
CREATE TRIGGER push_job_changed AFTER UPDATE OF status, stage ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_changed();


-- --- Posting: the visit fee is said before anybody posts -----------------------------------------

CREATE OR REPLACE FUNCTION public.app_lists()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'trades',  (SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name) ORDER BY t.sort) FROM public.trades t),
    'sectors', (SELECT jsonb_agg(s.name ORDER BY s.sort) FROM public.sectors s),
    'live_sectors', (SELECT coalesce(jsonb_agg(s.name ORDER BY s.sort), '[]'::jsonb) FROM public.sectors s WHERE s.live),
    'job_types', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'trade', j.trade, 'name', j.name, 'list_paisa', j.list_paisa) ORDER BY j.trade, j.sort) FROM public.job_types j),
    'min_offer_paisa', public.setting('min_offer_paisa'),
    'visit_fee_min_paisa', public.setting('visit_fee_min_paisa'),
    'visit_fee_max_paisa', public.setting('visit_fee_max_paisa')
  );
$$;


-- --- The office ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_jobs(text);

/**
 * Every job, for the office only. `p_status` 'finished' means done or
 * stopped. `needs_you`: open with no live offer for `escalate_minutes`; a
 * locked start code; a problem reported; or a job that looks stuck — on
 * the way for over three hours, or working for over ten.
 */
CREATE FUNCTION public.admin_jobs(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, trade text, title text, description text, offered_paisa bigint,
  list_paisa bigint, when_kind text, when_part text,
  sector text, street text, house text, landmark text, lat double precision, lng double precision,
  power text, parts text, gate_note text, status text, cancelled_by text, cancel_reason text,
  created_at timestamptz, customer_name text, customer_phone text, media jsonb,
  live_offers integer, needs_you boolean, why text, agreed_paisa bigint, assigned_by text,
  pro_name text, pro_phone text, stage text, collect_paisa bigint, code_locked boolean,
  problem_text text, finished_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.ref, j.trade, j.title, j.description, j.offered_paisa,
         t.list_paisa, j.when_kind, j.when_part,
         j.sector, j.street, j.house, j.landmark, j.lat, j.lng,
         j.power, j.parts, j.gate_note, j.status, j.cancelled_by, j.cancel_reason,
         j.created_at, p.first_name, u.phone,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                   FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
         live.n,
         w.why IS NOT NULL,
         w.why,
         j.agreed_paisa, j.assigned_by,
         r.full_name, ru.phone, j.stage, j.collect_paisa, j.code_locked_at IS NOT NULL,
         j.problem_text, j.finished_at
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  LEFT JOIN public.job_types t ON t.id = j.job_type_id
  LEFT JOIN public.pros r ON r.id = j.pro_id
  LEFT JOIN auth.users ru ON ru.id = j.pro_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n FROM public.offers o
    WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()
  ) live
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN j.problem_at IS NOT NULL AND j.status IN ('done', 'stopped') AND j.problem_at > now() - interval '7 days' THEN 'Problem reported'
      WHEN j.status = 'assigned' AND j.code_locked_at IS NOT NULL THEN 'Start code locked'
      WHEN j.status = 'assigned' AND j.stage = 'on_way' AND j.on_way_at < now() - interval '3 hours' THEN 'On the way for over 3 hours'
      WHEN j.status = 'assigned' AND j.stage = 'working' AND j.started_at < now() - interval '10 hours' THEN 'Working for over 10 hours'
      WHEN j.status = 'open' AND live.n = 0 AND j.created_at < now() - make_interval(mins => public.setting('escalate_minutes')::integer) THEN 'No offers'
    END AS why
  ) w
  WHERE public.is_staff()
    AND (p_status IS NULL
         OR j.status = p_status
         OR (p_status = 'finished' AND j.status IN ('done', 'stopped')))
  ORDER BY j.created_at DESC
  LIMIT 200;
$$;

/** One job's history, chat, photos and new prices, for the office. */
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
                         FROM public.job_changes c WHERE c.job_id = p_job), '[]'::jsonb)
  ) END
  FROM public.jobs j WHERE j.id = p_job;
$$;

/** After the office has rung both of them: the technician may try the code again. */
CREATE OR REPLACE FUNCTION public.admin_unlock_code(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  UPDATE public.jobs SET code_tries = 0, code_locked_at = NULL, updated_at = now()
  WHERE id = p_job AND status = 'assigned' AND code_locked_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN public.refuse('That code is not locked.');
  END IF;
  PERFORM public.log_job(p_job, 'code_unlocked');
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- log_job(), own_uploads(), my_assigned_job(), tell_office(), visit_fee(),
-- photos_of(), pending_change(), chat_side() and new_start_code() are
-- granted to nobody: they are pieces of the functions below.

GRANT EXECUTE ON FUNCTION
  public.customer_may_see_file(text),
  public.tech_step(uuid, text),
  public.start_work(uuid, text, jsonb),
  public.ask_change(uuid, bigint, text, text),
  public.withdraw_change(uuid),
  public.finish_work(uuid, jsonb),
  public.decide_change(uuid, boolean),
  public.report_problem(uuid, text),
  public.pro_finished(),
  public.job_chat(uuid),
  public.send_message(uuid, text),
  public.admin_jobs(text),
  public.admin_job_detail(uuid),
  public.admin_unlock_code(uuid)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261021000000_doing_the_job')
ON CONFLICT (name) DO NOTHING;

COMMIT;
