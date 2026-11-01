-- =============================================================================
--  Checked before it counts, and a guarantee that brings somebody back
-- =============================================================================
--
--  The owner's decisions, with the numbers he approved.
--
--  HE SAYS FINISHED, SHE CONFIRMS
--    · "Work finished" (finish_work) no longer closes the job. It records
--      the photos, the parts and the money as before and puts the job in
--      the step 'checking'. The customer is asked to check it.
--    · "Yes, it works" (confirm_work) closes it: done, commission, rating.
--    · "Not finished yet" (not_finished) needs one of four reasons and may
--      carry a photo. The job goes back to 'working'; he is told the reason
--      and may answer in one line (reply_check). He fixes it and taps
--      "Work finished" again. The SECOND "not finished yet" puts the job in
--      'disputed' and on the office's list, with both sides' photos and
--      words; the office decides: finished, not finished (visit fee only),
--      or he goes back to fix it (admin_decide_dispute).
--    · Nobody answering: she is reminded 2 hours after he finishes and 4
--      hours before the end, and at 24 hours it counts as finished by
--      itself (check_clock), marked confirmed_by = 'clock'. A technician
--      whose jobs mostly close that way is a flag.
--    · He may add a short "Show it working" video at the finish.
--
--  THE GUARANTEE
--    · 30 days for repairs and installations, 7 for services (cleaning,
--      servicing, top-ups), from the moment the job counted as done.
--      Covers the same fault and anything his work caused; a part he
--      fitted is the shop's warranty, the labour to refit it is ours.
--    · A claim (claim_guarantee) needs words and at least one photo or
--      video. He has 24 hours to answer: "I'll come" with a two-hour
--      window starting within 48 hours, or "This isn't my work" with a
--      reason, which the office decides. He is reminded at 12 and 20 hours.
--    · No answer in 24 hours, or a missed visit: his NEW OFFERS STOP and a
--      replacement is arranged. She chooses the day; the job goes to the
--      other technicians in that trade and area (never him), marked as a
--      guarantee repair paid by Pechkas, offers capped at the original
--      labour price, and she chooses among them as usual.
--    · Pechkas pays the replacement from the RESERVE (lowering what he owes
--      Pechkas; anything beyond is owed to him and paid by the office), and
--      charges the original technician — only when he did not answer,
--      missed the visit, or refused and the office ruled against him —
--      never more than the labour of his original job. He may appeal
--      within 7 days; the office decides once.
--    · His offers come back the moment he accepts (while the replacement
--      has not been booked), when the claim closes, or when the office
--      lifts it.
--    · Two covered claims in 60 days is a flag; three in 90 asks the
--      office to review his approval. Flags only: nothing here suspends
--      anybody.
--
--  Safe to run twice.

BEGIN;

-- --- Settings ------------------------------------------------------------------------------
-- The guarantee lengths and the answer and visit times are promises in the
-- terms and the technician agreement: locked (no setting_limits row). The
-- flag thresholds are guesses, tunable like every other flag.

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('guarantee_service_days', 7, 'days',
     'How long the guarantee lasts on a service (cleaning, servicing, a top-up). Repairs and installations use guarantee_days.'),
  ('check_hours', 24, 'count',
     'Hours a finished job waits for the customer to check it before it counts as finished by itself.'),
  ('claim_answer_hours', 24, 'count',
     'Hours a technician has to answer a guarantee claim.'),
  ('claim_visit_hours', 48, 'count',
     'Hours after accepting a guarantee claim within which his return visit must start.'),
  ('appeal_days', 7, 'days',
     'Days a technician has to appeal a guarantee charge.'),
  ('flag_unchecked_jobs', 3, 'count',
     'Finished jobs closed by the clock, unchecked by the customer, that make a flag when they are also half his jobs.'),
  ('flag_unchecked_bps', 5000, 'basis_points',
     'Share of his finished jobs closed by the clock that makes the flag.'),
  ('flag_overruled', 2, 'count',
     'Times the office ruled a customer''s "not finished yet" wrong that make a flag.'),
  ('flag_guarantee_jobs', 2, 'count',
     'Guarantee claims on one technician''s work, in 60 days, that make a flag.'),
  ('flag_guarantee_review', 3, 'count',
     'Guarantee claims on one technician''s work, in 90 days, that ask the office to review his approval.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('flag_unchecked_jobs',   1,    20),
  ('flag_unchecked_bps',    1000, 10000),
  ('flag_overruled',        1,    10),
  ('flag_guarantee_jobs',   1,    10),
  ('flag_guarantee_review', 1,    10)
ON CONFLICT (key) DO NOTHING;
-- Promises, never the office's to change.
DELETE FROM public.setting_limits
WHERE key IN ('guarantee_service_days', 'check_hours', 'claim_answer_hours', 'claim_visit_hours', 'appeal_days');


-- --- Which jobs are services ------------------------------------------------------------------

ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS guarantee text NOT NULL DEFAULT 'repair';
ALTER TABLE public.job_types DROP CONSTRAINT IF EXISTS job_types_guarantee_check;
ALTER TABLE public.job_types ADD CONSTRAINT job_types_guarantee_check CHECK (guarantee IN ('repair', 'service'));
-- Work that wears off by itself — dust, a top-up, a drain that is used.
UPDATE public.job_types SET guarantee = 'service'
WHERE name ILIKE '%service%' OR name ILIKE '%clean%' OR name ILIKE '%top-up%' OR name ILIKE '%descal%'
   OR name ILIKE '%blocked drain%' OR name ILIKE '%virus%' OR name ILIKE '%check and written report%';

/** How many days this job's guarantee lasts: 7 for a service, 30 for anything else ("Something else" included). */
CREATE OR REPLACE FUNCTION public.guarantee_days_of(p_job uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN t.guarantee = 'service' THEN public.setting('guarantee_service_days')
              ELSE public.setting('guarantee_days') END::integer
  FROM public.jobs j LEFT JOIN public.job_types t ON t.id = j.job_type_id
  WHERE j.id = p_job;
$$;


-- --- The job's new columns and steps ----------------------------------------------------------

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checking_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS check_reminded smallint NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS not_finished smallint NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS confirmed_by text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_confirmed_by_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_confirmed_by_check CHECK (confirmed_by IN ('customer', 'clock', 'office'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS disputed_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispute_note text CHECK (dispute_note IS NULL OR length(dispute_note) <= 500);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispute_outcome text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_dispute_outcome_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_dispute_outcome_check CHECK (dispute_outcome IN ('done', 'stopped', 'return'));
-- A replacement for a guarantee claim: paid by Pechkas, offers capped.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS guarantee_of uuid;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS paid_by_pechkas boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_cap_paisa bigint CHECK (pay_cap_paisa IS NULL OR pay_cap_paisa > 0);

-- Two new steps while a job is assigned: waiting for her check, and disputed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.jobs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%stage%' AND pg_get_constraintdef(oid) LIKE '%working%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_stage_check
  CHECK (stage IN ('chosen', 'on_way', 'arrived', 'working', 'checking', 'disputed'));

-- A paid-by-Pechkas job has nothing for the customer to pay.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.jobs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%collect_paisa > 0%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_collect_paisa_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_collect_paisa_check
  CHECK (collect_paisa IS NULL OR (collect_paisa >= 0 AND collect_paisa % 100 = 0));

-- The finish video ("Show it working"), a guarantee repair's own photos.
ALTER TABLE public.job_photos DROP CONSTRAINT IF EXISTS job_photos_stage_check;
ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_stage_check
  CHECK (stage IN ('before', 'after', 'change', 'receipt', 'video', 'fix'));

-- The ledger learns three kinds: Pechkas paying for a guarantee repair, the
-- charge to the technician whose work failed, and Pechkas paying out what
-- it owes a technician.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.ledger_txns'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%commission%settlement%'
  LOOP
    EXECUTE format('ALTER TABLE public.ledger_txns DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.ledger_txns ADD CONSTRAINT ledger_txns_kind_check
  CHECK (kind IN ('commission', 'settlement', 'reversal', 'guarantee_pay', 'guarantee_charge', 'payout'));


-- --- Every round of checking, on record -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_checks (
  id           bigserial PRIMARY KEY,
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  round        smallint NOT NULL,
  finished_at  timestamptz NOT NULL DEFAULT now(),
  answer       text CHECK (answer IN ('yes', 'not_finished', 'clock', 'office')),
  answered_at  timestamptz,
  reason       text CHECK (reason IN ('not_working', 'unfinished', 'mess', 'price')),
  note         text CHECK (note IS NULL OR length(note) <= 300),
  photo        text,
  pro_reply    text CHECK (pro_reply IS NULL OR length(pro_reply) <= 200),
  pro_reply_at timestamptz,
  UNIQUE (job_id, round)
);
ALTER TABLE public.job_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_checks FROM anon, authenticated;

/** The four reasons, in the customer's words. */
CREATE OR REPLACE FUNCTION public.check_reason_text(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_reason
    WHEN 'not_working' THEN 'Still not working'
    WHEN 'unfinished' THEN 'Work left unfinished'
    WHEN 'mess' THEN 'Mess left behind'
    WHEN 'price' THEN 'Price is not what we agreed'
  END;
$$;


-- --- He says finished ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.finish_work(uuid, jsonb, bigint, text);

/**
 * "Work finished": the finish photo, what of the price was parts (with the
 * shop's receipt), and — optional — a short video of it working. The money
 * is fixed now, as before; the job is NOT done yet: it waits for the
 * customer's check. A guarantee repair paid by Pechkas carries no
 * commission and nothing for the customer to pay.
 */
CREATE OR REPLACE FUNCTION public.finish_work(p_job uuid, p_photos jsonb, p_parts_paisa bigint DEFAULT 0, p_receipt text DEFAULT NULL, p_video text DEFAULT NULL)
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
  v_round   smallint;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage = 'checking' THEN
    RETURN public.refuse('You have already said the work is finished. The customer is checking it.', 'stage');
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
  IF p_video IS NOT NULL THEN
    IF public.own_uploads(jsonb_build_array(p_video), 1) IS NOT NULL OR p_photos ? p_video OR p_video = p_receipt THEN
      RETURN public.refuse('The video did not finish uploading. Try again, or finish without it.', 'video');
    END IF;
  END IF;

  IF v_job.paid_by_pechkas THEN
    v_bps := 0;
    v_comm := 0;
  ELSE
    v_bps := public.commission_rate(v_job.customer_id, v_job.pro_id, p_job);
    v_comm := public.commission_at(v_job.agreed_paisa - v_parts, v_bps);
  END IF;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'after', x FROM jsonb_array_elements_text(p_photos) AS x;
  IF p_receipt IS NOT NULL THEN
    INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'receipt', p_receipt);
  END IF;
  IF p_video IS NOT NULL THEN
    INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'video', p_video);
  END IF;
  -- A receipt from an earlier round is replaced by this round's figure.
  UPDATE public.jobs
  SET stage = 'checking', checking_at = now(), check_reminded = 0,
      collect_paisa = CASE WHEN v_job.paid_by_pechkas THEN 0 ELSE agreed_paisa END,
      parts_paisa = v_parts, commission_paisa = v_comm, commission_bps = v_bps, updated_at = now()
  WHERE id = p_job;
  v_round := v_job.not_finished + 1;
  INSERT INTO public.job_checks (job_id, round) VALUES (p_job, v_round)
  ON CONFLICT (job_id, round) DO UPDATE SET finished_at = now(), answer = NULL, answered_at = NULL,
    reason = NULL, note = NULL, photo = NULL, pro_reply = NULL, pro_reply_at = NULL;

  PERFORM public.tell(v_job.customer_id, 'check_ready', p_job, '/jobs',
    public.job_vars(v_job) || jsonb_build_object('pro', split_part((SELECT full_name FROM public.pros WHERE id = v_job.pro_id), ' ', 1)));
  RETURN jsonb_build_object('ok', true, 'checking', true,
                            'collect_paisa', CASE WHEN v_job.paid_by_pechkas THEN 0 ELSE v_job.agreed_paisa END,
                            'parts_paisa', v_parts, 'commission_bps', v_bps, 'commission_paisa', v_comm,
                            'keeps_paisa', v_job.agreed_paisa - v_comm);
END;
$$;

/** Her job, waiting for her check, row locked. NULL when it is not. */
CREATE OR REPLACE FUNCTION public.my_checking_job(p_job uuid)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  SELECT * INTO v_job FROM public.jobs
  WHERE id = p_job AND customer_id = auth.uid() AND status = 'assigned' AND stage = 'checking'
  FOR UPDATE;
  RETURN v_job;
END;
$$;

/** Closes a checked job: done, by whom. The commission and price triggers follow from status. */
CREATE OR REPLACE FUNCTION public.close_checked(p_job uuid, p_by text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.job_checks SET answer = CASE p_by WHEN 'customer' THEN 'yes' ELSE p_by END, answered_at = now()
  WHERE job_id = p_job AND answer IS NULL;
  UPDATE public.jobs SET status = 'done', finished_at = now(), confirmed_by = p_by, updated_at = now()
  WHERE id = p_job;
  PERFORM public.log_job(p_job, 'confirmed', jsonb_build_object('by', p_by));
END;
$$;

/** "Yes, it works." */
CREATE OR REPLACE FUNCTION public.confirm_work(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  v_job := public.my_checking_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is nothing to check on this job now.');
  END IF;
  PERFORM public.close_checked(p_job, 'customer');
  PERFORM public.tell(v_job.pro_id, 'check_ok', p_job, '/pro', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true, 'collect_paisa', v_job.collect_paisa, 'paid_by_pechkas', v_job.paid_by_pechkas);
END;
$$;

/**
 * "Not finished yet": one of four reasons, a few words and a photo if she
 * likes. Back to working, and he is told why. The second time, the job is
 * disputed and goes to the office with both sides' evidence.
 */
CREATE OR REPLACE FUNCTION public.not_finished(p_job uuid, p_reason text, p_note text DEFAULT NULL, p_photo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_vars jsonb;
BEGIN
  v_job := public.my_checking_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is nothing to check on this job now.');
  END IF;
  IF public.check_reason_text(p_reason) IS NULL THEN
    RETURN public.refuse('Choose what is wrong.', 'reason');
  END IF;
  IF v_note IS NOT NULL AND (length(v_note) > 300 OR public.looks_like_cnic(v_note)) THEN
    RETURN public.refuse('Please keep it shorter, and no CNIC numbers.', 'note');
  END IF;
  IF p_photo IS NOT NULL AND public.own_uploads(jsonb_build_array(p_photo), 1) IS NOT NULL THEN
    RETURN public.refuse('The photo did not finish uploading. Try again.', 'photo');
  END IF;

  UPDATE public.job_checks SET answer = 'not_finished', answered_at = now(), reason = p_reason, note = v_note, photo = p_photo
  WHERE job_id = p_job AND answer IS NULL;
  v_vars := public.job_vars(v_job) || jsonb_build_object(
    'reason', public.check_reason_text(p_reason),
    'pro', split_part((SELECT full_name FROM public.pros WHERE id = v_job.pro_id), ' ', 1));

  IF v_job.not_finished + 1 >= 2 THEN
    UPDATE public.jobs SET stage = 'disputed', not_finished = not_finished + 1, disputed_at = now(),
                           dispute_outcome = NULL, dispute_note = NULL, checking_at = NULL, updated_at = now()
    WHERE id = p_job;
    PERFORM public.log_job(p_job, 'disputed', jsonb_build_object('reason', p_reason, 'note', v_note));
    PERFORM public.tell(v_job.customer_id, 'dispute_open', p_job, '/jobs', v_vars || jsonb_build_object('other', v_vars ->> 'pro'));
    PERFORM public.tell(v_job.pro_id, 'dispute_open', p_job, '/pro', v_vars || jsonb_build_object('other', v_vars ->> 'customer'));
    PERFORM public.tell_office('dispute', p_job, v_vars);
    RETURN jsonb_build_object('ok', true, 'disputed', true);
  END IF;

  UPDATE public.jobs SET stage = 'working', not_finished = not_finished + 1, checking_at = NULL, updated_at = now()
  WHERE id = p_job;
  PERFORM public.log_job(p_job, 'not_finished', jsonb_build_object('reason', p_reason, 'note', v_note));
  PERFORM public.tell(v_job.pro_id, 'not_finished', p_job, '/pro', v_vars);
  RETURN jsonb_build_object('ok', true, 'disputed', false);
END;
$$;

/** His one line in answer to her latest "not finished yet". Once per round. */
CREATE OR REPLACE FUNCTION public.reply_check(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_id   bigint;
BEGIN
  IF v_text IS NULL OR length(v_text) < 3 OR length(v_text) > 200 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Write one short line, without numbers like a CNIC.', 'reply');
  END IF;
  SELECT c.id INTO v_id FROM public.job_checks c JOIN public.jobs j ON j.id = c.job_id
  WHERE c.job_id = p_job AND j.pro_id = auth.uid() AND j.status = 'assigned'
    AND c.answer = 'not_finished' AND c.pro_reply IS NULL
  ORDER BY c.round DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN public.refuse('There is nothing to answer on this job.');
  END IF;
  UPDATE public.job_checks SET pro_reply = v_text, pro_reply_at = now() WHERE id = v_id;
  PERFORM public.log_job(p_job, 'pro_reply', jsonb_build_object('text', v_text));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The clock, every minute: reminds her 2 hours after he finished and 4
 * hours before the end, and closes what has waited check_hours. Each row
 * is marked in the statement that finds it, so nobody is told twice.
 */
CREATE OR REPLACE FUNCTION public.check_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours integer := public.setting('check_hours')::integer;
  v_job   public.jobs;
  v_n     integer := 0;
  v_vars  jsonb;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j SET check_reminded = 1
    WHERE j.status = 'assigned' AND j.stage = 'checking' AND j.check_reminded = 0
      AND j.checking_at <= now() - interval '2 hours' AND j.checking_at > now() - make_interval(hours => v_hours - 4)
    RETURNING j.*
  LOOP
    PERFORM public.tell(v_job.customer_id, 'check_remind', v_job.id, '/jobs', public.job_vars(v_job) || jsonb_build_object(
      'pro', split_part((SELECT full_name FROM public.pros WHERE id = v_job.pro_id), ' ', 1),
      'time', to_char((v_job.checking_at + make_interval(hours => v_hours)) AT TIME ZONE 'Asia/Karachi', 'FMHH12:MIam')));
  END LOOP;
  FOR v_job IN
    UPDATE public.jobs j SET check_reminded = 2
    WHERE j.status = 'assigned' AND j.stage = 'checking' AND j.check_reminded < 2
      AND j.checking_at <= now() - make_interval(hours => v_hours - 4)
    RETURNING j.*
  LOOP
    PERFORM public.tell(v_job.customer_id, 'check_remind', v_job.id, '/jobs', public.job_vars(v_job) || jsonb_build_object(
      'pro', split_part((SELECT full_name FROM public.pros WHERE id = v_job.pro_id), ' ', 1),
      'time', to_char((v_job.checking_at + make_interval(hours => v_hours)) AT TIME ZONE 'Asia/Karachi', 'FMHH12:MIam')));
  END LOOP;
  FOR v_job IN
    SELECT * FROM public.jobs j
    WHERE j.status = 'assigned' AND j.stage = 'checking' AND j.checking_at <= now() - make_interval(hours => v_hours)
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.close_checked(v_job.id, 'clock');
    v_vars := public.job_vars(v_job);
    PERFORM public.tell(v_job.customer_id, 'check_closed', v_job.id, '/jobs', v_vars);
    PERFORM public.tell(v_job.pro_id, 'check_ok', v_job.id, '/pro', v_vars);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * The office decides a disputed job: 'done' (finished — she owes the
 * agreed price), 'stopped' (not finished — she owes only the visit fee, and
 * there is no commission), or 'return' (he goes back to fix it). The note
 * is shown to both in the app, never in a notification.
 */
CREATE OR REPLACE FUNCTION public.admin_decide_dispute(p_job uuid, p_outcome text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fee  bigint;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND status = 'assigned' AND stage = 'disputed' FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is not waiting for a decision.');
  END IF;
  IF p_outcome NOT IN ('done', 'stopped', 'return') THEN
    RETURN public.refuse('Choose a decision.', 'outcome');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found, in a sentence. Both of them will read it in the app.', 'note');
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.jobs SET dispute_outcome = 'done', dispute_note = v_note WHERE id = p_job;
    PERFORM public.close_checked(p_job, 'office');
  ELSIF p_outcome = 'stopped' THEN
    v_fee := public.visit_fee(p_job);
    UPDATE public.job_checks SET answer = 'office', answered_at = now() WHERE job_id = p_job AND answer IS NULL;
    UPDATE public.jobs SET status = 'stopped', finished_at = now(), confirmed_by = 'office',
           collect_paisa = CASE WHEN paid_by_pechkas THEN 0 ELSE v_fee END,
           commission_paisa = 0, parts_paisa = 0, dispute_outcome = 'stopped', dispute_note = v_note, updated_at = now()
    WHERE id = p_job;
  ELSE
    UPDATE public.jobs SET stage = 'working', dispute_outcome = 'return', dispute_note = v_note, updated_at = now()
    WHERE id = p_job;
  END IF;
  PERFORM public.log_job(p_job, 'dispute_decided', jsonb_build_object('outcome', p_outcome, 'note', v_note));
  PERFORM public.tell(v_job.customer_id, 'dispute_decided', p_job, '/jobs', public.job_vars(v_job));
  PERFORM public.tell(v_job.pro_id, 'dispute_decided', p_job, '/pro', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Guarantee claims ---------------------------------------------------------------------

-- One row per claim, kept with the job (it goes when the customer's account
-- goes, like everything else of hers). The money it moved is in the ledger,
-- which keeps the job number and outlives it.
CREATE TABLE IF NOT EXISTS public.guarantee_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL,
  pro_id             uuid,
  status             text NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting', 'coming', 'checking', 'refused', 'replacing', 'disputed', 'fixed', 'not_covered')),
  description        text NOT NULL CHECK (length(description) BETWEEN 5 AND 500),
  media              jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  answer_due         timestamptz NOT NULL,
  reminded           smallint NOT NULL DEFAULT 0,
  answered_at        timestamptz,
  refuse_reason      text CHECK (refuse_reason IS NULL OR length(refuse_reason) <= 300),
  visit_date         date,
  visit_from         smallint CHECK (visit_from IS NULL OR visit_from IN (8, 10, 12, 14, 16, 18, 20)),
  fixed_at           timestamptz,
  fixed_photos       jsonb,
  still_broken       text CHECK (still_broken IS NULL OR length(still_broken) <= 300),
  closed_at          timestamptz,
  closed_by          text CHECK (closed_by IN ('customer', 'clock', 'office')),
  why_replacing      text CHECK (why_replacing IN ('no_answer', 'missed_visit', 'office')),
  charge_original    boolean NOT NULL DEFAULT false,
  replacement_job_id uuid,
  block_lifted       boolean NOT NULL DEFAULT false,
  office_note        text CHECK (office_note IS NULL OR length(office_note) <= 500),
  decided_by_name    text,
  decided_at         timestamptz,
  charge_paisa       bigint,
  charge_txn         uuid,
  charged_at         timestamptz,
  appeal_text        text CHECK (appeal_text IS NULL OR length(appeal_text) <= 500),
  appeal_photos      jsonb,
  appeal_at          timestamptz,
  appeal_outcome     text CHECK (appeal_outcome IN ('upheld', 'cancelled')),
  appeal_note        text CHECK (appeal_note IS NULL OR length(appeal_note) <= 500),
  appeal_decided_at  timestamptz
);
ALTER TABLE public.guarantee_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guarantee_claims FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS guarantee_claims_one_open ON public.guarantee_claims (job_id)
  WHERE status NOT IN ('fixed', 'not_covered');
CREATE INDEX IF NOT EXISTS guarantee_claims_pro ON public.guarantee_claims (pro_id, created_at DESC);

/** A claim that is still open counts as stopping his new offers when it is his fault it is late, and the office has not lifted it. */
CREATE OR REPLACE FUNCTION public.claim_blocks(p_pro uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id FROM public.guarantee_claims c
  WHERE c.pro_id = p_pro AND NOT c.block_lifted
    AND ((c.status = 'waiting' AND c.answer_due <= now())
         OR (c.status = 'replacing' AND c.charge_original AND c.why_replacing IN ('no_answer', 'missed_visit')))
  ORDER BY c.created_at
  LIMIT 1;
$$;

/** The words a claim's messages need. */
CREATE OR REPLACE FUNCTION public.claim_vars(p_claim public.guarantee_claims)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.job_vars(j) || jsonb_build_object(
    'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = p_claim.pro_id), 'The technician'),
    'due', to_char(p_claim.answer_due AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon, FMHH12:MIam'),
    'visit', CASE WHEN p_claim.visit_date IS NOT NULL
                  THEN to_char(p_claim.visit_date, 'FMDy FMDD Mon') || ', ' || public.window_text(p_claim.visit_from) END)
  FROM public.jobs j WHERE j.id = p_claim.job_id;
$$;

/**
 * "It has failed again": words, and at least one photo or video of the
 * fault, while the guarantee lasts. The technician is told and has
 * claim_answer_hours to answer.
 */
CREATE OR REPLACE FUNCTION public.claim_guarantee(p_job uuid, p_text text, p_media jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
  v_claim public.guarantee_claims;
  v_days  integer;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'done' THEN
    RETURN public.refuse('Only a finished job has a guarantee.');
  END IF;
  v_days := public.guarantee_days_of(p_job);
  IF v_job.finished_at < now() - make_interval(days => v_days) THEN
    RETURN public.refuse('The guarantee on this job lasted ' || v_days || ' days, and it has ended. You can post it as a new job.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.guarantee_claims WHERE job_id = p_job AND status NOT IN ('fixed', 'not_covered')) THEN
    RETURN public.refuse('You have already claimed on this job. Its card shows where it has got to.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 THEN
    RETURN public.refuse('Tell us what has gone wrong, in a few words.', 'text');
  END IF;
  IF length(v_text) > 500 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Please keep it shorter, and no CNIC numbers.', 'text');
  END IF;
  IF public.own_uploads(p_media, 1) IS NOT NULL THEN
    RETURN public.refuse('Add at least one photo or video of the fault, and let it finish uploading.', 'media');
  END IF;

  INSERT INTO public.guarantee_claims (job_id, customer_id, pro_id, description, media, answer_due)
  VALUES (p_job, v_job.customer_id, v_job.pro_id, v_text, p_media,
          now() + make_interval(hours => public.setting('claim_answer_hours')::integer))
  RETURNING * INTO v_claim;
  PERFORM public.log_job(p_job, 'guarantee', jsonb_build_object('text', v_text));
  IF v_claim.pro_id IS NULL THEN
    -- The technician has left Pechkas: straight to a replacement, charged to nobody.
    UPDATE public.guarantee_claims SET status = 'replacing', why_replacing = 'no_answer', charge_original = false
    WHERE id = v_claim.id RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.customer_id, 'claim_replacing', p_job, '/jobs', public.claim_vars(v_claim));
  ELSE
    PERFORM public.tell(v_claim.pro_id, 'claim_new', p_job, '/pro', public.claim_vars(v_claim));
  END IF;
  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id, 'answer_due', v_claim.answer_due);
END;
$$;

/**
 * His answer: "I'll come" with a day and a two-hour window that starts
 * within claim_visit_hours and has not started yet — or "This isn't my
 * work" with a reason, for the office to decide. Allowed late as well, as
 * long as no replacement has been booked: that is how his offers come back.
 */
CREATE OR REPLACE FUNCTION public.answer_claim(p_claim uuid, p_come boolean, p_date date DEFAULT NULL, p_from smallint DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim  public.guarantee_claims;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_start  timestamptz;
  v_vars   jsonb;
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND pro_id = auth.uid() FOR UPDATE;
  IF v_claim.id IS NULL OR NOT (v_claim.status = 'waiting'
       OR (v_claim.status = 'replacing' AND v_claim.why_replacing = 'no_answer' AND v_claim.replacement_job_id IS NULL)) THEN
    RETURN public.refuse('This claim is no longer waiting for your answer.');
  END IF;

  IF p_come THEN
    IF p_date IS NULL OR p_from IS NULL OR p_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Choose the day and the two hours you will come.', 'visit');
    END IF;
    v_start := (p_date + make_time(p_from, 0, 0)) AT TIME ZONE 'Asia/Karachi';
    IF v_start <= now() THEN
      RETURN public.refuse('That time has already started. Choose a later one.', 'visit');
    END IF;
    IF v_start > now() + make_interval(hours => public.setting('claim_visit_hours')::integer) THEN
      RETURN public.refuse('Choose a time within the next ' || public.setting('claim_visit_hours') || ' hours.', 'visit');
    END IF;
    UPDATE public.guarantee_claims
    SET status = 'coming', answered_at = now(), visit_date = p_date, visit_from = p_from,
        why_replacing = NULL, charge_original = false
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.log_job(v_claim.job_id, 'claim_coming', jsonb_build_object('date', p_date, 'from', p_from));
    PERFORM public.tell(v_claim.customer_id, 'claim_coming', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
  ELSE
    IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 300 OR public.looks_like_cnic(v_reason) THEN
      RETURN public.refuse('Say why this is not your work, in a sentence.', 'reason');
    END IF;
    UPDATE public.guarantee_claims
    SET status = 'refused', answered_at = now(), refuse_reason = v_reason, why_replacing = NULL, charge_original = false
    WHERE id = p_claim RETURNING * INTO v_claim;
    v_vars := public.claim_vars(v_claim);
    PERFORM public.log_job(v_claim.job_id, 'claim_refused', jsonb_build_object('reason', v_reason));
    PERFORM public.tell(v_claim.customer_id, 'claim_refused', v_claim.job_id, '/jobs', v_vars);
    PERFORM public.tell_office('claim_office', v_claim.job_id, v_vars);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Back at the house, he says it is fixed — with a photo. She checks it, as with any job. */
CREATE OR REPLACE FUNCTION public.claim_fixed(p_claim uuid, p_photos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim   public.guarantee_claims;
  v_problem text;
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND pro_id = auth.uid() AND status = 'coming' FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This claim is not waiting for your visit.');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT v_claim.job_id, auth.uid(), 'fix', x FROM jsonb_array_elements_text(p_photos) AS x;
  UPDATE public.guarantee_claims SET status = 'checking', fixed_at = now(), fixed_photos = p_photos
  WHERE id = p_claim RETURNING * INTO v_claim;
  PERFORM public.log_job(v_claim.job_id, 'claim_fixed');
  PERFORM public.tell(v_claim.customer_id, 'claim_fixed', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** She checks his repair: fixed — or still broken, which goes to the office. */
CREATE OR REPLACE FUNCTION public.check_claim(p_claim uuid, p_fixed boolean, p_text text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND customer_id = auth.uid() AND status = 'checking' FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('There is nothing to check on this claim now.');
  END IF;
  IF p_fixed THEN
    UPDATE public.guarantee_claims SET status = 'fixed', closed_at = now(), closed_by = 'customer' WHERE id = p_claim
    RETURNING * INTO v_claim;
    PERFORM public.log_job(v_claim.job_id, 'claim_closed', jsonb_build_object('by', 'customer'));
    PERFORM public.tell(v_claim.pro_id, 'claim_closed', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  ELSE
    IF v_text IS NULL OR length(v_text) < 5 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
      RETURN public.refuse('Say what is still wrong, in a few words.', 'text');
    END IF;
    UPDATE public.guarantee_claims SET status = 'disputed', still_broken = v_text WHERE id = p_claim
    RETURNING * INTO v_claim;
    PERFORM public.log_job(v_claim.job_id, 'claim_still_broken', jsonb_build_object('text', v_text));
    PERFORM public.tell_office('claim_office', v_claim.job_id, public.claim_vars(v_claim));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Pechkas will pay another technician: she chooses the day, and the job
 * goes to the others in that trade and area — never the original man —
 * marked as a guarantee repair, offers capped at the original labour.
 */
CREATE OR REPLACE FUNCTION public.book_replacement(p_claim uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_job   public.jobs;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_cap   bigint;
  v_new   uuid;
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND customer_id = auth.uid() AND status = 'replacing' AND replacement_job_id IS NULL
  FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This claim is not waiting for a day.');
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 6 OR (p_date = v_today AND v_hour >= 20) THEN
    RETURN public.refuse('Choose today (before 8pm) or a day in the coming week.', 'day');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_claim.job_id;
  -- The cap: what the original work was worth, and never below the lowest price.
  v_cap := greatest(coalesce(v_job.agreed_paisa, v_job.offered_paisa) - coalesce(v_job.parts_paisa, 0),
                    public.setting('min_offer_paisa'));
  v_cap := (v_cap / 100) * 100;

  INSERT INTO public.jobs (customer_id, trade, job_type_id, title, description, offered_paisa,
                           when_kind, when_part, when_date, sector, street, house, landmark, lat, lng,
                           power, parts, gate_note, guarantee_of, paid_by_pechkas, pay_cap_paisa)
  VALUES (v_job.customer_id, v_job.trade, v_job.job_type_id, left('Guarantee repair: ' || v_job.title, 120),
          left(v_claim.description, 500), v_cap,
          CASE WHEN p_date = v_today THEN 'today' WHEN p_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END,
          NULL, p_date, v_job.sector, v_job.street, v_job.house, v_job.landmark, v_job.lat, v_job.lng,
          v_job.power, v_job.parts, v_job.gate_note, v_claim.id, true, v_cap)
  RETURNING id INTO v_new;
  -- What she showed us is what the technicians see.
  INSERT INTO public.job_media (job_id, kind, path)
  SELECT v_new, CASE WHEN x ~* '\.(mp4|mov|m4v|webm)$' THEN 'video' ELSE 'photo' END, x
  FROM jsonb_array_elements_text(v_claim.media) AS x;
  UPDATE public.guarantee_claims SET replacement_job_id = v_new WHERE id = p_claim;
  PERFORM public.log_job(v_claim.job_id, 'replacement_booked', jsonb_build_object('job', v_new));
  RETURN jsonb_build_object('ok', true, 'job_id', v_new);
END;
$$;

/**
 * The clock, every minute: reminds him at 12 and 20 hours, moves a claim
 * he has not answered — or a visit he missed by two hours — to a
 * replacement, and closes a repair she has not checked in check_hours.
 */
CREATE OR REPLACE FUNCTION public.claim_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_n     integer := 0;
  v_hours integer := public.setting('claim_answer_hours')::integer;
BEGIN
  FOR v_claim IN
    UPDATE public.guarantee_claims c SET reminded = 1
    WHERE c.status = 'waiting' AND c.reminded = 0
      AND c.created_at <= now() - make_interval(hours => v_hours / 2) AND c.created_at > now() - make_interval(hours => v_hours - 4)
    RETURNING c.*
  LOOP
    PERFORM public.tell(v_claim.pro_id, 'claim_remind', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  END LOOP;
  FOR v_claim IN
    UPDATE public.guarantee_claims c SET reminded = 2
    WHERE c.status = 'waiting' AND c.reminded < 2 AND c.created_at <= now() - make_interval(hours => v_hours - 4)
    RETURNING c.*
  LOOP
    PERFORM public.tell(v_claim.pro_id, 'claim_remind', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  END LOOP;

  FOR v_claim IN
    UPDATE public.guarantee_claims c SET status = 'replacing', why_replacing = 'no_answer', charge_original = true
    WHERE c.status = 'waiting' AND c.answer_due <= now()
    RETURNING c.*
  LOOP
    PERFORM public.log_job(v_claim.job_id, 'claim_no_answer');
    PERFORM public.tell(v_claim.pro_id, 'claim_blocked', v_claim.job_id, '/pro', public.claim_vars(v_claim));
    PERFORM public.tell(v_claim.customer_id, 'claim_replacing', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
    v_n := v_n + 1;
  END LOOP;

  FOR v_claim IN
    UPDATE public.guarantee_claims c SET status = 'replacing', why_replacing = 'missed_visit', charge_original = true
    WHERE c.status = 'coming'
      AND ((c.visit_date + make_time(c.visit_from, 0, 0)) AT TIME ZONE 'Asia/Karachi') + interval '4 hours' <= now()
    RETURNING c.*
  LOOP
    PERFORM public.log_job(v_claim.job_id, 'claim_missed_visit');
    PERFORM public.tell(v_claim.pro_id, 'claim_blocked', v_claim.job_id, '/pro', public.claim_vars(v_claim));
    PERFORM public.tell(v_claim.customer_id, 'claim_replacing', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
    v_n := v_n + 1;
  END LOOP;

  FOR v_claim IN
    UPDATE public.guarantee_claims c SET status = 'fixed', closed_at = now(), closed_by = 'clock'
    WHERE c.status = 'checking' AND c.fixed_at <= now() - make_interval(hours => public.setting('check_hours')::integer)
    RETURNING c.*
  LOOP
    PERFORM public.log_job(v_claim.job_id, 'claim_closed', jsonb_build_object('by', 'clock'));
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * A replacement job that ends. Done: Pechkas pays the technician who did it
 * from the reserve (lowering what he owes), the claim is fixed, and — when
 * it was the original man's fault — he is charged, never more than the
 * labour of his original job. Stopped or cancelled: the claim waits for her
 * to choose another day.
 */
CREATE OR REPLACE FUNCTION public.on_replacement_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim  public.guarantee_claims;
  v_orig   public.jobs;
  v_pay    bigint;
  v_charge bigint;
  v_txn    uuid;
BEGIN
  IF NEW.guarantee_of IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('done', 'stopped', 'cancelled') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = NEW.guarantee_of FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.status IN ('stopped', 'cancelled') THEN
    -- A visit fee for a stopped replacement is Pechkas' to pay too.
    IF NEW.status = 'stopped' AND NEW.pro_id IS NOT NULL THEN
      v_pay := public.visit_fee(NEW.id);
      PERFORM public.post_txn('guarantee_pay:' || NEW.id, 'guarantee_pay', NEW.id, NEW.pro_id, jsonb_build_array(
        jsonb_build_object('account', 'pro_owes', 'pro_id', NEW.pro_id, 'amount', -v_pay),
        jsonb_build_object('account', 'reserve', 'amount', v_pay)));
    END IF;
    UPDATE public.guarantee_claims SET replacement_job_id = NULL WHERE id = v_claim.id AND replacement_job_id = NEW.id;
    RETURN NULL;
  END IF;

  -- Done.
  v_pay := NEW.agreed_paisa;
  PERFORM public.post_txn('guarantee_pay:' || NEW.id, 'guarantee_pay', NEW.id, NEW.pro_id, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', NEW.pro_id, 'amount', -v_pay),
    jsonb_build_object('account', 'reserve', 'amount', v_pay)));
  UPDATE public.guarantee_claims SET status = 'fixed', closed_at = now(), closed_by = coalesce(NEW.confirmed_by, 'clock')
  WHERE id = v_claim.id;
  PERFORM public.tell(NEW.pro_id, 'guarantee_paid', NEW.id, '/pro/money',
    public.job_vars(NEW) || jsonb_build_object('amount', public.rs(v_pay)));

  IF v_claim.charge_original AND v_claim.pro_id IS NOT NULL THEN
    SELECT * INTO v_orig FROM public.jobs WHERE id = v_claim.job_id;
    v_charge := least(NEW.agreed_paisa - coalesce(NEW.parts_paisa, 0),
                      coalesce(v_orig.agreed_paisa, 0) - coalesce(v_orig.parts_paisa, 0));
    IF v_charge > 0 THEN
      v_txn := public.post_txn('guarantee_charge:' || v_claim.id, 'guarantee_charge', v_claim.job_id, v_claim.pro_id, jsonb_build_array(
        jsonb_build_object('account', 'pro_owes', 'pro_id', v_claim.pro_id, 'amount', v_charge),
        jsonb_build_object('account', 'reserve', 'amount', -v_charge)));
      UPDATE public.guarantee_claims SET charge_paisa = v_charge, charge_txn = v_txn, charged_at = now() WHERE id = v_claim.id;
      PERFORM public.tell(v_claim.pro_id, 'claim_charged', v_claim.job_id, '/pro/money',
        public.claim_vars(v_claim) || jsonb_build_object('amount', public.rs(v_charge)));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_replacement_done ON public.jobs;
CREATE TRIGGER job_replacement_done AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_replacement_done();

/** One appeal against a charge, within appeal_days, with his reasons and, if he likes, photos. */
CREATE OR REPLACE FUNCTION public.appeal_charge(p_claim uuid, p_text text, p_photos jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND pro_id = auth.uid() AND charge_txn IS NOT NULL FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('There is no charge on this claim to appeal.');
  END IF;
  IF v_claim.appeal_at IS NOT NULL THEN
    RETURN public.refuse('You have already appealed. The office will decide.');
  END IF;
  IF v_claim.charged_at < now() - make_interval(days => public.setting('appeal_days')::integer) THEN
    RETURN public.refuse('Appeals must be made within ' || public.setting('appeal_days') || ' days of the charge.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 10 OR length(v_text) > 500 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Explain why the charge is wrong, in a few sentences.', 'text');
  END IF;
  IF coalesce(jsonb_array_length(p_photos), 0) > 0 AND public.own_uploads(p_photos, 1) IS NOT NULL THEN
    RETURN public.refuse('A photo did not finish uploading. Try again.', 'photos');
  END IF;
  UPDATE public.guarantee_claims SET appeal_text = v_text, appeal_photos = coalesce(p_photos, '[]'::jsonb), appeal_at = now()
  WHERE id = p_claim RETURNING * INTO v_claim;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT v_claim.job_id, auth.uid(), 'fix', x FROM jsonb_array_elements_text(coalesce(p_photos, '[]'::jsonb)) AS x;
  PERFORM public.log_job(v_claim.job_id, 'appeal', jsonb_build_object('text', v_text));
  PERFORM public.tell_office('claim_office', v_claim.job_id, public.claim_vars(v_claim));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- What each side reads --------------------------------------------------------------------

/** One claim, as the customer may read it: never his refusal reason or his surname. */
CREATE OR REPLACE FUNCTION public.claim_for_customer(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
      'id', c.id, 'status', c.status, 'description', c.description, 'media', c.media,
      'created_at', c.created_at, 'answer_due', c.answer_due,
      'visit_date', c.visit_date, 'visit_from', c.visit_from,
      'fixed_at', c.fixed_at, 'check_due', c.fixed_at + make_interval(hours => public.setting('check_hours')::integer),
      'why_replacing', c.why_replacing, 'replacement_job_id', c.replacement_job_id,
      'replacement_status', (SELECT r.status FROM public.jobs r WHERE r.id = c.replacement_job_id),
      'office_note', CASE WHEN c.status = 'not_covered' THEN c.office_note END,
      'closed_at', c.closed_at)
  FROM public.guarantee_claims c
  WHERE c.job_id = p_job AND c.customer_id = auth.uid()
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

/**
 * His claims: the open ones, and charges he may still appeal. Before he
 * accepts he gets the sector and her first name; once he is coming, the
 * address and her number, as with any job he is doing.
 */
CREATE OR REPLACE FUNCTION public.pro_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'status', c.status, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
      'sector', j.sector, 'customer_first_name', p.first_name,
      'description', c.description, 'media', c.media, 'created_at', c.created_at, 'answer_due', c.answer_due,
      'late', c.status = 'waiting' AND c.answer_due <= now(),
      'can_answer', c.status = 'waiting' OR (c.status = 'replacing' AND c.why_replacing = 'no_answer' AND c.replacement_job_id IS NULL),
      'visit_date', c.visit_date, 'visit_from', c.visit_from,
      'visit_by', coalesce(c.answered_at, now()) + make_interval(hours => public.setting('claim_visit_hours')::integer),
      'street', CASE WHEN c.status = 'coming' THEN j.street END,
      'house', CASE WHEN c.status = 'coming' THEN j.house END,
      'landmark', CASE WHEN c.status = 'coming' THEN j.landmark END,
      'gate_note', CASE WHEN c.status = 'coming' THEN j.gate_note END,
      'lat', CASE WHEN c.status = 'coming' THEN j.lat END,
      'lng', CASE WHEN c.status = 'coming' THEN j.lng END,
      'customer_phone', CASE WHEN c.status = 'coming' THEN public.phone_of(u.id) END,
      'why_replacing', c.why_replacing, 'still_broken', c.still_broken,
      'office_note', CASE WHEN c.why_replacing = 'office' OR c.status = 'not_covered' THEN c.office_note END,
      'charge_paisa', c.charge_paisa, 'charged_at', c.charged_at,
      'appeal_until', c.charged_at + make_interval(days => public.setting('appeal_days')::integer),
      'can_appeal', c.charge_txn IS NOT NULL AND c.appeal_at IS NULL
                    AND c.charged_at > now() - make_interval(days => public.setting('appeal_days')::integer),
      'appeal_at', c.appeal_at, 'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note,
      'blocks', coalesce(public.claim_blocks(auth.uid()) = c.id, false)
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.guarantee_claims c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.profiles p ON p.id = c.customer_id
  LEFT JOIN auth.users u ON u.id = c.customer_id
  WHERE c.pro_id = auth.uid()
    AND (c.status NOT IN ('fixed', 'not_covered')
         OR (c.charge_txn IS NOT NULL AND c.charged_at > now() - make_interval(days => 30))
         OR c.closed_at > now() - interval '3 days');
$$;


-- --- The office -----------------------------------------------------------------------------

/** Everything waiting for a person: refused claims, repairs she says are still broken, appeals, disputed jobs — and the rest, for reading. */
CREATE OR REPLACE FUNCTION public.admin_guarantee()
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
    'claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'status', c.status, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(c.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(c.pro_id),
          'finished_at', j.finished_at, 'guarantee_days', public.guarantee_days_of(j.id),
          'original_labour_paisa', coalesce(j.agreed_paisa, 0) - coalesce(j.parts_paisa, 0),
          'description', c.description, 'media', c.media, 'created_at', c.created_at, 'answer_due', c.answer_due,
          'refuse_reason', c.refuse_reason, 'visit_date', c.visit_date, 'visit_from', c.visit_from,
          'fixed_photos', c.fixed_photos, 'still_broken', c.still_broken,
          'why_replacing', c.why_replacing, 'charge_original', c.charge_original,
          'replacement_job_id', c.replacement_job_id,
          'replacement_ref', (SELECT x.ref FROM public.jobs x WHERE x.id = c.replacement_job_id),
          'block_lifted', c.block_lifted, 'blocking', coalesce(public.claim_blocks(c.pro_id) = c.id, false),
          'office_note', c.office_note, 'decided_by_name', c.decided_by_name, 'decided_at', c.decided_at,
          'closed_by', c.closed_by, 'closed_at', c.closed_at,
          'charge_paisa', c.charge_paisa, 'charged_at', c.charged_at,
          'appeal_text', c.appeal_text, 'appeal_photos', c.appeal_photos, 'appeal_at', c.appeal_at,
          'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note,
          'photos', public.photos_of(j.id),
          'needs_you', c.status IN ('refused', 'disputed') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
        ) ORDER BY (c.status IN ('refused', 'disputed') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)) DESC, c.created_at DESC)
      FROM public.guarantee_claims c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.profiles p ON p.id = c.customer_id
      LEFT JOIN public.pros r ON r.id = c.pro_id
      WHERE c.status NOT IN ('fixed', 'not_covered') OR c.created_at > now() - interval '60 days'), '[]'::jsonb),
    'disputes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(j.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(j.pro_id),
          'agreed_paisa', j.agreed_paisa, 'visit_fee_paisa', public.visit_fee(j.id), 'disputed_at', j.disputed_at,
          'stage', j.stage, 'status', j.status, 'outcome', j.dispute_outcome, 'note', j.dispute_note,
          'photos', public.photos_of(j.id),
          'checks', (SELECT jsonb_agg(jsonb_build_object('round', k.round, 'finished_at', k.finished_at, 'answer', k.answer,
                                                         'reason', public.check_reason_text(k.reason), 'note', k.note, 'photo', k.photo,
                                                         'pro_reply', k.pro_reply) ORDER BY k.round)
                     FROM public.job_checks k WHERE k.job_id = j.id)
        ) ORDER BY (j.stage = 'disputed') DESC, j.disputed_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      WHERE j.disputed_at IS NOT NULL AND (j.stage = 'disputed' OR j.disputed_at > now() - interval '60 days')), '[]'::jsonb),
    'reserve_paisa', -coalesce((SELECT sum(e.amount_paisa) FROM public.ledger_entries e WHERE e.account = 'reserve'), 0)
  );
END;
$$;

/**
 * The office decides a claim the technician refused, or a repair she says
 * is still broken: covered (a replacement is arranged, and he is charged
 * for it) or not covered (closed; she reads why in the app).
 */
CREATE OR REPLACE FUNCTION public.admin_decide_claim(p_claim uuid, p_covered boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND status IN ('refused', 'disputed') FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This claim is not waiting for a decision.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found, in a sentence. They will read it in the app.', 'note');
  END IF;
  IF p_covered THEN
    UPDATE public.guarantee_claims
    SET status = 'replacing', why_replacing = 'office', charge_original = true, office_note = v_note,
        decided_by_name = (SELECT name FROM public.staff WHERE id = auth.uid()), decided_at = now()
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.customer_id, 'claim_replacing', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
    PERFORM public.tell(v_claim.pro_id, 'claim_decided', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  ELSE
    UPDATE public.guarantee_claims
    SET status = 'not_covered', office_note = v_note, closed_at = now(), closed_by = 'office',
        decided_by_name = (SELECT name FROM public.staff WHERE id = auth.uid()), decided_at = now()
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.customer_id, 'claim_decided', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
    PERFORM public.tell(v_claim.pro_id, 'claim_decided', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  END IF;
  PERFORM public.log_job(v_claim.job_id, 'claim_decided', jsonb_build_object('covered', p_covered, 'note', v_note));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The office decides an appeal: upheld (the charge stands) or cancelled (reversed in the ledger). Once. */
CREATE OR REPLACE FUNCTION public.admin_decide_appeal(p_claim uuid, p_cancel boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND appeal_at IS NOT NULL AND appeal_outcome IS NULL FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This appeal is not waiting for a decision.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write why, in a sentence. He will read it in the app.', 'note');
  END IF;
  IF p_cancel THEN
    PERFORM public.post_txn('reverse:' || v_claim.charge_txn, 'reversal', v_claim.job_id, v_claim.pro_id,
      (SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
       FROM public.ledger_entries e WHERE e.txn_id = v_claim.charge_txn),
      NULL, NULL, 'Guarantee charge cancelled on appeal', v_claim.charge_txn);
  END IF;
  UPDATE public.guarantee_claims
  SET appeal_outcome = CASE WHEN p_cancel THEN 'cancelled' ELSE 'upheld' END, appeal_note = v_note, appeal_decided_at = now()
  WHERE id = p_claim RETURNING * INTO v_claim;
  PERFORM public.log_job(v_claim.job_id, 'appeal_decided', jsonb_build_object('cancelled', p_cancel, 'note', v_note));
  PERFORM public.tell(v_claim.pro_id, 'appeal_decided', v_claim.job_id, '/pro/money', public.claim_vars(v_claim));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Gives his new offers back while a claim is still open — the office's call, with a reason on record. */
CREATE OR REPLACE FUNCTION public.admin_lift_block(p_claim uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_claim public.guarantee_claims;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 THEN
    RETURN public.refuse('Write why, in a sentence.', 'note');
  END IF;
  UPDATE public.guarantee_claims SET block_lifted = true WHERE id = p_claim RETURNING * INTO v_claim;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('There is no such claim.');
  END IF;
  PERFORM public.log_job(v_claim.job_id, 'block_lifted', jsonb_build_object('note', v_note));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Pechkas pays a technician what it owes him (a guarantee repair beyond what he owed). Office only; once per form. */
CREATE OR REPLACE FUNCTION public.admin_pay_pro(p_pro uuid, p_amount_paisa bigint, p_method text, p_reference text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owed bigint;
  v_id   uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('settle:' || p_pro::text));
  v_owed := public.pro_owed(p_pro);
  IF p_amount_paisa IS NULL OR p_amount_paisa <= 0 OR p_amount_paisa % 100 <> 0 THEN
    RETURN public.refuse('Write the amount in whole rupees.', 'amount');
  END IF;
  IF -v_owed < p_amount_paisa THEN
    RETURN public.refuse('Pechkas owes him ' || public.rs(greatest(-v_owed, 0)) || ', not more.', 'amount');
  END IF;
  IF p_method NOT IN ('jazzcash', 'easypaisa', 'bank', 'cash') THEN
    RETURN public.refuse('Choose how it was paid.', 'method');
  END IF;
  IF p_key IS NULL OR length(p_key) < 8 THEN
    RETURN public.refuse('Refresh the page and try again.');
  END IF;
  v_id := public.post_txn('payout:' || p_key, 'payout', NULL, p_pro, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', p_pro, 'amount', p_amount_paisa),
    jsonb_build_object('account', 'received', 'amount', -p_amount_paisa)),
    p_method, nullif(btrim(coalesce(p_reference, '')), ''));
  RETURN jsonb_build_object('ok', true, 'recorded', v_id IS NOT NULL);
END;
$$;

/** Technicians Pechkas owes money to (their balance has gone below nothing). */
CREATE OR REPLACE FUNCTION public.admin_owed_to_pros()
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
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('pro_id', r.id, 'name', r.full_name, 'phone', public.phone_of(r.id), 'owed_to_him_paisa', -o.owed)
                     ORDER BY o.owed)
    FROM public.pros r CROSS JOIN LATERAL (SELECT public.pro_owed(r.id) AS owed) o
    WHERE o.owed < 0), '[]'::jsonb);
END;
$$;


-- --- Who may see which files --------------------------------------------------------------

/** A technician reads a job's files while he may see the job, her "not finished" photos on his job, and the photos of a claim on his work. */
CREATE OR REPLACE FUNCTION public.pro_may_see_file(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.job_media m WHERE m.path = p_name AND public.pro_may_see(m.job_id))
      OR EXISTS (SELECT 1 FROM public.job_checks k JOIN public.jobs j ON j.id = k.job_id
                 WHERE k.photo = p_name AND j.pro_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.guarantee_claims c
                 WHERE c.pro_id = auth.uid() AND c.media ? p_name);
$$;


-- --- The functions that change with it ----------------------------------------------------

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
  IF v_status IN ('accepted', 'rejected') THEN
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
         -- A guarantee repair never goes to the man whose work it is redoing.
         AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.id = j.guarantee_of AND c.pro_id = r.id))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
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
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

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
      'parts_paisa', j.parts_paisa, 'commission_paisa', j.commission_paisa,
      'customer_first_name', p.first_name,
      'paid_by_pechkas', j.paid_by_pechkas, 'confirmed_by', j.confirmed_by, 'dispute_note', j.dispute_note,
      'agreed_paisa', j.agreed_paisa,
      'my_rating', (SELECT x.stars FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'pro'),
      'can_rate', NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'pro')
    ) ORDER BY j.finished_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE j.pro_id = auth.uid() AND j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '24 hours';
$$;

CREATE OR REPLACE FUNCTION public.record_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NOT NEW.paid_by_pechkas
     AND NEW.agreed_paisa IS NOT NULL AND NEW.agreed_paisa - coalesce(NEW.parts_paisa, 0) > 0 THEN
    BEGIN
      INSERT INTO public.price_record
        (job_id, trade, job_type_id, sector, done_on, customer_paisa, agreed_paisa, parts_paisa, labour_paisa, list_paisa)
      VALUES (
        NEW.id, NEW.trade, NEW.job_type_id, NEW.sector,
        (coalesce(NEW.finished_at, now()) AT TIME ZONE 'Asia/Karachi')::date,
        NEW.offered_paisa, NEW.agreed_paisa, coalesce(NEW.parts_paisa, 0),
        NEW.agreed_paisa - coalesce(NEW.parts_paisa, 0),
        (SELECT t.list_paisa FROM public.job_types t WHERE t.id = NEW.job_type_id))
      ON CONFLICT (job_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'price_record: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;

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
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'cancelled' AND e.at >= v_since) AS cancelled,
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
        public.flag_if('cancelled', p.cancelled, public.setting('flag_cancelled')),
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
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.cancelled_by = 'customer' AND j.updated_at >= v_since) AS cancels,
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
        public.flag_if('cancels', c.cancels, public.setting('flag_customer_cancels')),
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
    'limits', (SELECT jsonb_object_agg(s.key, s.value) FROM public.settings s WHERE s.key LIKE 'flag\_%'),
    'people', v_rows
  );
END;
$$;


-- --- What the phones are told ---------------------------------------------------------------
-- Trade, first names, the job number and times only: never an address, a
-- number, or anything the office typed (that stays in the app).

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('check_ready.title',     400, NULL, '{pro} says the work is finished', 'customer'),
  ('check_ready.body',      401, NULL, 'Check it before you pay: open job {ref} and tap Yes, it works, or Not finished yet.', 'customer'),
  ('check_remind.title',    402, NULL, 'Please check job {ref}', 'customer'),
  ('check_remind.body',     403, NULL, '{pro} says the work is finished. If you do nothing, it counts as finished at {time}.', 'customer'),
  ('check_closed.title',    404, NULL, 'Job {ref} counts as finished', 'customer'),
  ('check_closed.body',     405, NULL, 'It was not checked within a day. If something is wrong, report it in the app, or use the guarantee.', 'customer'),
  ('check_ok.title',        406, NULL, 'Job {ref} is finished', 'technician'),
  ('check_ok.body',         407, NULL, 'The {trade} work for {customer} now counts as finished.', 'technician'),
  ('not_finished.title',    408, NULL, '{customer} says job {ref} is not finished', 'technician'),
  ('not_finished.body',     409, NULL, 'Reason: {reason}. Open the job, put it right, and tap Work finished again.', 'technician'),
  ('dispute_open.title',    410, NULL, 'Pechkas will look at job {ref}', 'both'),
  ('dispute_open.body',     411, NULL, 'You and {other} disagree about whether the work is finished. Pechkas will look at both sides'' photos and call you.', 'both'),
  ('dispute.title',         412, NULL, 'Disagreement on job {ref}', 'office'),
  ('dispute.body',          413, NULL, '{customer} has said twice that the {trade} work is not finished. Decide in Guarantee and disputes.', 'office'),
  ('dispute_decided.title', 414, NULL, 'Pechkas has decided on job {ref}', 'both'),
  ('dispute_decided.body',  415, NULL, 'Open the job in the app to read the decision.', 'both'),
  ('claim_new.title',       416, NULL, 'Guarantee claim on job {ref}', 'technician'),
  ('claim_new.body',        417, NULL, '{customer} says the {trade} fault has come back. Answer by {due}, or your new offers stop.', 'technician'),
  ('claim_remind.title',    418, NULL, 'Answer the guarantee claim on job {ref}', 'technician'),
  ('claim_remind.body',     419, NULL, 'Answer by {due}, or your new offers stop.', 'technician'),
  ('claim_blocked.title',   420, NULL, 'Your new offers have stopped', 'technician'),
  ('claim_blocked.body',    421, NULL, 'The guarantee claim on job {ref} was not answered in time, or the visit was missed. Another technician will be sent, and the cost may be charged to you.', 'technician'),
  ('claim_coming.title',    422, NULL, '{pro} will come back', 'customer'),
  ('claim_coming.body',     423, NULL, '{visit}, for job {ref}.', 'customer'),
  ('claim_refused.title',   424, NULL, '{pro} says this is not his work', 'customer'),
  ('claim_refused.body',    425, NULL, 'Pechkas will look at the photos and decide. Job {ref}.', 'customer'),
  ('claim_office.title',    426, NULL, 'Guarantee claim needs you: {ref}', 'office'),
  ('claim_office.body',     427, NULL, 'Open Guarantee and disputes in the admin panel.', 'office'),
  ('claim_fixed.title',     428, NULL, '{pro} says the fault is fixed', 'customer'),
  ('claim_fixed.body',      429, NULL, 'Check it and confirm in the app. Job {ref}.', 'customer'),
  ('claim_closed.title',    430, NULL, 'The guarantee claim on job {ref} is closed', 'technician'),
  ('claim_closed.body',     431, NULL, '{customer} has confirmed the repair.', 'technician'),
  ('claim_replacing.title', 432, NULL, 'Pechkas will send another technician', 'customer'),
  ('claim_replacing.body',  433, NULL, 'Choose a day for the repair in the app. Pechkas pays for it. Job {ref}.', 'customer'),
  ('claim_decided.title',   434, NULL, 'Pechkas has decided on the guarantee claim', 'both'),
  ('claim_decided.body',    435, NULL, 'Open job {ref} in the app to read the decision.', 'both'),
  ('claim_charged.title',   436, NULL, 'Guarantee repair charged: {amount}', 'technician'),
  ('claim_charged.body',    437, NULL, 'Added to what you owe for job {ref}. You can appeal within 7 days in My account.', 'technician'),
  ('appeal_decided.title',  438, NULL, 'Your appeal on job {ref} has been decided', 'technician'),
  ('appeal_decided.body',   439, NULL, 'Open My account to read the decision.', 'technician'),
  ('guarantee_paid.title',  440, NULL, 'Pechkas has paid you for job {ref}', 'technician'),
  ('guarantee_paid.body',   441, NULL, '{amount} has been taken off what you owe Pechkas.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
-- Older migrations keep a Roman Urdu column; the English stands in for it.
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 400 AND 441 AND ur IS NULL;


-- --- The clocks --------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-check-clock', '* * * * *', 'SELECT public.check_clock()');
  PERFORM cron.schedule('pechkas-claim-clock', '* * * * *', 'SELECT public.claim_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.guarantee_days_of(uuid), public.check_reason_text(text), public.my_checking_job(uuid),
  public.close_checked(uuid, text), public.check_clock(), public.claim_clock(), public.claim_blocks(uuid),
  public.claim_vars(public.guarantee_claims), public.claim_for_customer(uuid), public.on_replacement_done()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.finish_work(uuid, jsonb, bigint, text, text),
  public.confirm_work(uuid),
  public.not_finished(uuid, text, text, text),
  public.reply_check(uuid, text),
  public.claim_guarantee(uuid, text, jsonb),
  public.answer_claim(uuid, boolean, date, smallint, text),
  public.claim_fixed(uuid, jsonb),
  public.check_claim(uuid, boolean, text),
  public.book_replacement(uuid, date),
  public.appeal_charge(uuid, text, jsonb),
  public.pro_claims(),
  public.admin_guarantee(),
  public.admin_decide_claim(uuid, boolean, text),
  public.admin_decide_appeal(uuid, boolean, text),
  public.admin_decide_dispute(uuid, text, text),
  public.admin_lift_block(uuid, text),
  public.admin_pay_pro(uuid, bigint, text, text, text),
  public.admin_owed_to_pros()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261106000000_checks_and_guarantee')
ON CONFLICT (name) DO NOTHING;

COMMIT;
