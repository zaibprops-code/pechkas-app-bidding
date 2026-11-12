-- =============================================================================
--  A customer who does not pay the technician (the owner's decision D35)
-- =============================================================================
--
--  Decided 12 November 2026. A technician must not owe commission on money he
--  has not received, and must not escape it by tapping a button.
--
--  HE REPORTS, within 7 days of the job counting as done: Not paid, or Paid
--  less with what he received. One report per job. He may correct the amount
--  until she answers; after that only the office, with a reason. If he reports
--  nothing, the commission stays exactly as posted: no job stays uncertain.
--
--  HIS COMMISSION IS HELD the moment he reports: the commission posting is
--  reversed line for line (his debt, Pechkas' share and the guarantee reserve
--  alike), so a held job counts towards nothing — not the Rs 3,000 limit, not
--  D36, no reminders. It is RELEASED only as a final figure: commission on the
--  LABOUR he actually received (what she paid, minus the job's recorded parts,
--  parts first), at the job's own rate, the reserve at the rate when he
--  reported. Each release posts only the difference from what is already
--  posted, worked out from totals, so any order of part-payments ends with
--  exactly what one posting would have made. Each release is a new D36 fee.
--
--  SHE IS ASKED (3 days), with a neutral notification: That's right, or I have
--  paid (words, an optional photo). Silence is never agreement: after 3 days
--  the case goes to the office, still held, and she is not blocked.
--
--  SHE CANNOT POST NEW JOBS only while she owes — she said "That's right" or
--  the office decided she owes — until he taps Now paid, the office records a
--  payment, closes the case or clears her. [DECIDE WITH A LAWYER]: her
--  acknowledgement is recorded as agreeing the amount, not as legal consent.
--
--  THE GUARANTEE IS SEPARATE. It is never cancelled, shortened or delayed by a
--  payment case, but while one is open her claim goes to the office instead of
--  to him (a claim already with him moves too, and his answer clock stops).
--  The office may send another technician at Pechkas' cost — no charge to him
--  — or find it not covered, or let him handle it under the normal rules (then
--  a refusal is the usual A21 path). A charge to him only follows an
--  independent office finding, through the usual 7-day appeal; a payment case
--  alone is never evidence of poor work.
--
--  Flags only: 3 reports by a technician in 60 days, 2 confirmed unpaid jobs
--  for a customer, 1 report the office found false. No money from Pechkas.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('unpaid_report_days', 7, 'days', 'Days after a job counts as done in which the technician may report that he was not paid, or paid less (D35). Locked.'),
  ('unpaid_answer_days', 3, 'days', 'Days the customer has to answer a payment question before it goes to the office (D35). Locked.'),
  ('flag_unpaid_reports', 3, 'count', 'Not-paid reports by one technician, within flag_days, that ask the office to look (D35).'),
  ('flag_unpaid_jobs', 2, 'count', 'Confirmed unpaid jobs for one customer, within flag_days, that ask the office to look (D35).')
ON CONFLICT (key) DO NOTHING;
DELETE FROM public.setting_limits WHERE key IN ('unpaid_report_days', 'unpaid_answer_days');
INSERT INTO public.setting_limits (key, lo, hi) VALUES ('flag_unpaid_reports', 1, 20), ('flag_unpaid_jobs', 1, 20) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payment_cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id              uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  customer_id         uuid NOT NULL,
  agreed_paisa        bigint NOT NULL,
  parts_paisa         bigint NOT NULL DEFAULT 0,
  commission_bps      integer NOT NULL,
  reserve_bps         integer NOT NULL,
  reported_paisa      bigint NOT NULL,
  received_paisa      bigint NOT NULL,
  status              text NOT NULL CHECK (status IN ('asked', 'owed', 'office', 'closed')),
  answer_due          timestamptz NOT NULL,
  customer_answer     text CHECK (customer_answer IN ('agrees', 'paid')),
  customer_text       text CHECK (customer_text IS NULL OR length(customer_text) <= 300),
  customer_photo      text,
  customer_answered_at timestamptz,
  held_txn            uuid,
  posted_commission   bigint NOT NULL DEFAULT 0,
  posted_reserve      bigint NOT NULL DEFAULT 0,
  releases            integer NOT NULL DEFAULT 0,
  owed_at             timestamptz,
  cleared_at          timestamptz,
  cleared_note        text,
  outcome             text CHECK (outcome IN ('paid_full', 'now_paid', 'closed')),
  false_report        boolean NOT NULL DEFAULT false,
  office_note         text CHECK (office_note IS NULL OR length(office_note) <= 300),
  office_by_name      text,
  office_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  CHECK (received_paisa >= 0 AND received_paisa <= agreed_paisa),
  CHECK (reported_paisa >= 0 AND reported_paisa < agreed_paisa)
);
ALTER TABLE public.payment_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_cases FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS payment_cases_customer ON public.payment_cases (customer_id) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS payment_cases_pro ON public.payment_cases (pro_id, created_at DESC);

ALTER TABLE public.guarantee_claims DROP CONSTRAINT IF EXISTS guarantee_claims_status_check;
ALTER TABLE public.guarantee_claims ADD CONSTRAINT guarantee_claims_status_check
  CHECK (status IN ('waiting', 'coming', 'checking', 'refused', 'replacing', 'disputed', 'fixed', 'not_covered', 'office_review'));
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS office_review_at timestamptz;
-- A claim made while a payment case is open goes to the office and is not sent to him until the office says so.
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS sent_to_pro boolean NOT NULL DEFAULT true;

/** Is a payment case open on this job? Then its guarantee claims are the office's. */
CREATE OR REPLACE FUNCTION public.payment_case_open(p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.payment_cases c WHERE c.job_id = p_job AND c.status <> 'closed');
$$;

/** Hand a job's live guarantee claims to the office while its payment case is open; his answer clock stops. */
CREATE OR REPLACE FUNCTION public.claims_to_office(p_job uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.guarantee_claims SET status = 'office_review', office_review_at = now()
  WHERE job_id = p_job AND status IN ('waiting', 'coming');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    PERFORM public.tell_office('claim_office_review', p_job, (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = p_job));
  END IF;
  RETURN v_n;
END;
$$;

/**
 * Post whatever commission is final now and not yet posted: on the labour he
 * has received (what she paid, minus parts, parts first), at the job's rate;
 * the reserve at the rate when he reported. Only the difference from what is
 * already posted, so part-payments in any order total exactly one posting.
 */
CREATE OR REPLACE FUNCTION public.release_commission(p_case uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      public.payment_cases;
  v_comm   bigint;
  v_res    bigint;
  v_dc     bigint;
  v_dr     bigint;
BEGIN
  SELECT * INTO v_c FROM public.payment_cases WHERE id = p_case FOR UPDATE;
  -- Nothing was held (no commission had been posted), so nothing is ever released.
  IF v_c.id IS NULL OR v_c.pro_id IS NULL OR v_c.held_txn IS NULL THEN
    RETURN 0;
  END IF;
  v_comm := public.commission_at(greatest(v_c.received_paisa - v_c.parts_paisa, 0), v_c.commission_bps);
  v_res := (v_comm * v_c.reserve_bps) / 10000;
  v_dc := v_comm - v_c.posted_commission;
  v_dr := v_res - v_c.posted_reserve;
  IF v_dc <= 0 THEN
    RETURN 0;
  END IF;
  PERFORM public.post_txn('commission_paid:' || v_c.id || ':' || (v_c.releases + 1), 'commission', v_c.job_id, v_c.pro_id, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', v_c.pro_id, 'amount', v_dc),
    jsonb_build_object('account', 'commission', 'amount', -(v_dc - v_dr)),
    jsonb_build_object('account', 'reserve', 'amount', -v_dr)),
    NULL, NULL, 'Commission on payment received');
  UPDATE public.payment_cases
  SET posted_commission = v_comm, posted_reserve = v_res, releases = releases + 1
  WHERE id = p_case;
  RETURN v_dc;
END;
$$;

/** The office has found he received less than was released on: every release reversed, to be released again. */
CREATE OR REPLACE FUNCTION public.unrelease_commission(p_case uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c   public.payment_cases;
  v_txn uuid;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_c FROM public.payment_cases WHERE id = p_case FOR UPDATE;
  FOR v_txn IN
    SELECT t.id FROM public.ledger_txns t
    WHERE t.idempotency_key LIKE 'commission_paid:' || p_case || ':%'
      AND NOT EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = t.id)
    ORDER BY t.created_at
  LOOP
    SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
    INTO v_lines FROM public.ledger_entries e WHERE e.txn_id = v_txn;
    PERFORM public.post_txn('reverse:' || v_txn, 'reversal', v_c.job_id, v_c.pro_id, v_lines, NULL, NULL,
                            'Corrected by the office: he received less', v_txn);
  END LOOP;
  UPDATE public.payment_cases SET posted_commission = 0, posted_reserve = 0 WHERE id = p_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_vars(p_case public.payment_cases)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.job_vars(j) || jsonb_build_object('pro', coalesce((SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = p_case.pro_id), 'The technician'))
  FROM public.jobs j WHERE j.id = p_case.job_id;
$$;

/** He was not paid, or paid less: his report, within 7 days of the job counting as done. */
CREATE OR REPLACE FUNCTION public.pro_report_unpaid(p_job uuid, p_received_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_txn uuid;
  v_case public.payment_cases;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'done' OR v_job.paid_by_pechkas THEN
    RETURN public.refuse('You can report this only on a finished job the customer pays for.');
  END IF;
  IF v_job.finished_at < now() - make_interval(days => public.setting('unpaid_report_days')::integer) THEN
    RETURN public.refuse('The ' || public.setting('unpaid_report_days') || ' days to report this have passed. Call the Pechkas office.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cases WHERE job_id = p_job) THEN
    RETURN public.refuse('You have already reported this job. Its card shows where it has got to.');
  END IF;
  IF p_received_paisa IS NULL OR p_received_paisa < 0 OR p_received_paisa % 100 <> 0 OR p_received_paisa >= v_job.agreed_paisa THEN
    RETURN public.refuse('Write what you received in whole rupees, less than ' || public.rs(v_job.agreed_paisa) || '.', 'amount');
  END IF;
  PERFORM public.pay_lock(auth.uid());
  INSERT INTO public.payment_cases (job_id, pro_id, customer_id, agreed_paisa, parts_paisa, commission_bps, reserve_bps,
                                    reported_paisa, received_paisa, status, answer_due)
  VALUES (p_job, auth.uid(), v_job.customer_id, v_job.agreed_paisa, coalesce(v_job.parts_paisa, 0),
          coalesce(v_job.commission_bps, public.setting('commission_bps')::integer), public.setting('reserve_bps')::integer,
          p_received_paisa, 0, 'asked', now() + make_interval(days => public.setting('unpaid_answer_days')::integer))
  RETURNING * INTO v_case;
  -- Held: the commission posting reversed line for line, reserve included. Nothing to hold if there was none.
  SELECT t.id INTO v_txn FROM public.ledger_txns t
  WHERE t.idempotency_key = 'commission:' || p_job AND NOT EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = t.id);
  IF v_txn IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
    INTO v_lines FROM public.ledger_entries e WHERE e.txn_id = v_txn;
    v_txn := public.post_txn('reverse:' || v_txn, 'reversal', p_job, auth.uid(), v_lines, NULL, NULL,
                             'Held: the customer has not paid in full', v_txn);
    UPDATE public.payment_cases SET held_txn = v_txn WHERE id = v_case.id;
  END IF;
  PERFORM public.claims_to_office(p_job);
  PERFORM public.log_job(p_job, 'payment_reported', jsonb_build_object('received', p_received_paisa));
  PERFORM public.tell(v_job.customer_id, 'payment_question', p_job, '/jobs', public.payment_vars(v_case));
  RETURN jsonb_build_object('ok', true, 'id', v_case.id);
END;
$$;

/** He may correct what he received until she answers. */
CREATE OR REPLACE FUNCTION public.pro_correct_unpaid(p_job uuid, p_received_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.payment_cases;
BEGIN
  SELECT * INTO v_c FROM public.payment_cases WHERE job_id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status <> 'asked' OR v_c.customer_answer IS NOT NULL THEN
    RETURN public.refuse('The customer has answered, so only the Pechkas office can change this now.');
  END IF;
  IF p_received_paisa IS NULL OR p_received_paisa < 0 OR p_received_paisa % 100 <> 0 OR p_received_paisa >= v_c.agreed_paisa THEN
    RETURN public.refuse('Write what you received in whole rupees, less than ' || public.rs(v_c.agreed_paisa) || '.', 'amount');
  END IF;
  UPDATE public.payment_cases SET reported_paisa = p_received_paisa WHERE id = v_c.id;
  PERFORM public.log_job(p_job, 'payment_corrected', jsonb_build_object('received', p_received_paisa));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Her one answer: "That's right" (she owes the rest) or "I have paid" (to the office). */
CREATE OR REPLACE FUNCTION public.customer_answer_unpaid(p_job uuid, p_answer text, p_text text DEFAULT NULL, p_photo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c    public.payment_cases;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_c FROM public.payment_cases WHERE job_id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status NOT IN ('asked', 'office') OR v_c.customer_answer IS NOT NULL THEN
    RETURN public.refuse('There is no payment question waiting for you on this job.');
  END IF;
  IF p_answer = 'paid' THEN
    IF v_text IS NULL OR length(v_text) < 5 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
      RETURN public.refuse('Tell us how you paid, in a few words.', 'text');
    END IF;
    IF p_photo IS NOT NULL AND (public.own_uploads(jsonb_build_array(p_photo), 1) IS NOT NULL
                                OR EXISTS (SELECT 1 FROM public.payment_cases x WHERE x.customer_photo = p_photo)) THEN
      RETURN public.refuse('Add the screenshot again and let it finish uploading.', 'photo');
    END IF;
  ELSIF p_answer IS DISTINCT FROM 'agrees' THEN
    RETURN public.refuse('Choose your answer.');
  END IF;
  PERFORM public.pay_lock(v_c.pro_id);
  UPDATE public.payment_cases
  SET customer_answer = p_answer, customer_text = v_text, customer_photo = p_photo, customer_answered_at = now(),
      received_paisa = CASE WHEN p_answer = 'agrees' THEN greatest(received_paisa, reported_paisa) ELSE received_paisa END,
      owed_at = CASE WHEN p_answer = 'agrees' THEN now() ELSE owed_at END,
      status = CASE WHEN p_answer = 'agrees' THEN 'owed' ELSE 'office' END
  WHERE id = v_c.id RETURNING * INTO v_c;
  -- She agrees what he received: that commission is now final.
  IF p_answer = 'agrees' THEN
    PERFORM public.release_commission(v_c.id);
  ELSE
    PERFORM public.tell_office('payment_office', p_job, public.payment_vars(v_c));
  END IF;
  PERFORM public.log_job(p_job, 'payment_answered', jsonb_build_object('answer', p_answer));
  PERFORM public.tell(v_c.pro_id, 'payment_answered', p_job, '/pro', public.payment_vars(v_c));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** He has now received the rest. */
CREATE OR REPLACE FUNCTION public.pro_now_paid(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.payment_cases;
BEGIN
  SELECT * INTO v_c FROM public.payment_cases WHERE job_id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status = 'closed' THEN
    RETURN public.refuse('There is no open payment question on this job.');
  END IF;
  PERFORM public.pay_lock(v_c.pro_id);
  UPDATE public.payment_cases SET received_paisa = agreed_paisa, status = 'closed', outcome = 'now_paid', closed_at = now()
  WHERE id = v_c.id;
  PERFORM public.release_commission(v_c.id);
  PERFORM public.log_job(p_job, 'payment_now_paid');
  PERFORM public.tell(v_c.customer_id, 'payment_settled', p_job, '/jobs', public.payment_vars(v_c));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The office, a reason every time: record what she has paid in all, decide she
 * owes, mark it paid in full, close it, clear her, or correct his amount. A
 * false report is a separate tick, only from the office.
 */
CREATE OR REPLACE FUNCTION public.admin_payment_case(p_case uuid, p_action text, p_note text,
                                                     p_amount_paisa bigint DEFAULT NULL, p_false_report boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c    public.payment_cases;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_c FROM public.payment_cases WHERE id = p_case FOR UPDATE;
  IF v_c.id IS NULL THEN
    RETURN public.refuse('There is no such case.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write the reason, in a sentence. Both of them read it in the app.', 'note');
  END IF;
  IF v_c.status = 'closed' AND p_action <> 'false_report' THEN
    RETURN public.refuse('This case is closed.');
  END IF;
  IF v_c.pro_id IS NOT NULL THEN
    PERFORM public.pay_lock(v_c.pro_id);
  END IF;
  v_name := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());
  IF p_action = 'received' THEN
    -- What she has paid him in all, as far as the office has established. It only goes up.
    IF p_amount_paisa IS NULL OR p_amount_paisa % 100 <> 0 OR p_amount_paisa < v_c.received_paisa OR p_amount_paisa > v_c.agreed_paisa THEN
      RETURN public.refuse('Write what she has paid in all, in whole rupees, from ' || public.rs(v_c.received_paisa) || ' to ' || public.rs(v_c.agreed_paisa) || '.', 'amount');
    END IF;
    UPDATE public.payment_cases SET received_paisa = p_amount_paisa,
      status = CASE WHEN p_amount_paisa = agreed_paisa THEN 'closed' ELSE status END,
      outcome = CASE WHEN p_amount_paisa = agreed_paisa THEN 'paid_full' ELSE outcome END,
      closed_at = CASE WHEN p_amount_paisa = agreed_paisa THEN now() ELSE closed_at END
    WHERE id = p_case;
  ELSIF p_action = 'correct' THEN
    -- What he really received, when the office finds his report was wrong. Downwards too: what was
    -- released on the old figure is reversed and released again on the new one.
    IF p_amount_paisa IS NULL OR p_amount_paisa < 0 OR p_amount_paisa % 100 <> 0 OR p_amount_paisa >= v_c.agreed_paisa THEN
      RETURN public.refuse('Write what he received, in whole rupees, less than ' || public.rs(v_c.agreed_paisa) || '.', 'amount');
    END IF;
    IF p_amount_paisa < v_c.received_paisa THEN
      PERFORM public.unrelease_commission(p_case);
    END IF;
    UPDATE public.payment_cases SET reported_paisa = p_amount_paisa,
      received_paisa = CASE WHEN status = 'owed' OR p_amount_paisa < received_paisa THEN p_amount_paisa ELSE received_paisa END
    WHERE id = p_case;
  ELSIF p_action = 'owes' THEN
    IF v_c.status = 'owed' AND v_c.cleared_at IS NULL THEN
      RETURN public.refuse('She is already recorded as owing the rest.');
    END IF;
    UPDATE public.payment_cases SET status = 'owed', received_paisa = greatest(received_paisa, reported_paisa),
      owed_at = coalesce(owed_at, now()), cleared_at = NULL, cleared_note = NULL WHERE id = p_case;
  ELSIF p_action = 'paid_full' THEN
    UPDATE public.payment_cases SET received_paisa = agreed_paisa, status = 'closed', outcome = 'paid_full', closed_at = now() WHERE id = p_case;
  ELSIF p_action = 'close' THEN
    -- Closed with what he has received; the rest is never charged to him.
    UPDATE public.payment_cases SET received_paisa = greatest(received_paisa, reported_paisa),
      status = 'closed', outcome = 'closed', closed_at = now() WHERE id = p_case;
  ELSIF p_action = 'clear' THEN
    IF v_c.status <> 'owed' OR v_c.cleared_at IS NOT NULL THEN
      RETURN public.refuse('She is not held back by this case.');
    END IF;
    UPDATE public.payment_cases SET cleared_at = now(), cleared_note = v_note WHERE id = p_case;
  ELSIF p_action IS DISTINCT FROM 'false_report' THEN
    RETURN public.refuse('Choose what to do.');
  END IF;
  UPDATE public.payment_cases
  SET office_note = v_note, office_by_name = v_name, office_at = now(),
      false_report = false_report OR coalesce(p_false_report, false) OR p_action = 'false_report'
  WHERE id = p_case RETURNING * INTO v_c;
  PERFORM public.release_commission(p_case);
  PERFORM public.log_job(v_c.job_id, 'payment_' || p_action, jsonb_build_object('note', v_note, 'by', v_name, 'amount', p_amount_paisa));
  IF p_action <> 'false_report' THEN
    PERFORM public.tell(v_c.customer_id, 'payment_decided', v_c.job_id, '/jobs', public.payment_vars(v_c));
    PERFORM public.tell(v_c.pro_id, 'payment_decided', v_c.job_id, '/pro', public.payment_vars(v_c));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** One side's view of the case. Her words go to her own screen and the office, never to him. */
CREATE OR REPLACE FUNCTION public.payment_view(p_job uuid, p_side text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'status', c.status, 'agreed_paisa', c.agreed_paisa, 'parts_paisa', c.parts_paisa,
    'reported_paisa', c.reported_paisa, 'received_paisa', c.received_paisa,
    'outstanding_paisa', c.agreed_paisa - greatest(c.received_paisa, c.reported_paisa),
    'answer_due', c.answer_due, 'customer_answer', c.customer_answer,
    'customer_text', CASE WHEN p_side = 'customer' THEN c.customer_text END,
    'blocked', c.status = 'owed' AND c.cleared_at IS NULL,
    'can_answer', p_side = 'customer' AND c.status IN ('asked', 'office') AND c.customer_answer IS NULL,
    'can_correct', p_side = 'pro' AND c.status = 'asked' AND c.customer_answer IS NULL,
    'can_now_paid', p_side = 'pro' AND c.status <> 'closed',
    'outcome', c.outcome, 'office_note', c.office_note, 'office_at', c.office_at, 'created_at', c.created_at,
    'commission_held', c.status <> 'closed' AND c.posted_commission < public.commission_at(greatest(c.agreed_paisa - c.parts_paisa, 0), c.commission_bps))
  FROM public.payment_cases c WHERE c.job_id = p_job;
$$;

/** His finished jobs he may still report as not paid (7 days), and every job with a case. */
CREATE OR REPLACE FUNCTION public.pro_payment_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'finished_at', j.finished_at,
      'customer_first_name', p.first_name, 'agreed_paisa', j.agreed_paisa, 'parts_paisa', coalesce(j.parts_paisa, 0),
      'commission_paisa', j.commission_paisa,
      'report_until', j.finished_at + make_interval(days => public.setting('unpaid_report_days')::integer),
      'can_report', NOT EXISTS (SELECT 1 FROM public.payment_cases c WHERE c.job_id = j.id)
                    AND j.finished_at > now() - make_interval(days => public.setting('unpaid_report_days')::integer),
      'payment', public.payment_view(j.id, 'pro')
    ) ORDER BY j.finished_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE j.pro_id = auth.uid() AND j.status = 'done' AND NOT j.paid_by_pechkas
    AND (j.finished_at > now() - make_interval(days => public.setting('unpaid_report_days')::integer)
         OR EXISTS (SELECT 1 FROM public.payment_cases c WHERE c.job_id = j.id
                    AND (c.status <> 'closed' OR c.closed_at > now() - interval '30 days')));
$$;

/** Unanswered questions go to the office after 3 days, still held, nobody blocked. */
CREATE OR REPLACE FUNCTION public.payment_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.payment_cases;
  v_n integer := 0;
BEGIN
  FOR v_c IN
    SELECT * FROM public.payment_cases WHERE status = 'asked' AND customer_answer IS NULL AND answer_due <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.payment_cases SET status = 'office' WHERE id = v_c.id;
    PERFORM public.log_job(v_c.job_id, 'payment_no_answer');
    PERFORM public.tell_office('payment_office', v_c.job_id, public.payment_vars(v_c));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/** The office's list of payment cases. */
CREATE OR REPLACE FUNCTION public.admin_payment_cases()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'job_id', c.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
        'customer', p.first_name, 'customer_phone', public.phone_of(c.customer_id),
        'pro', r.full_name, 'pro_phone', public.phone_of(c.pro_id),
        'status', c.status, 'agreed_paisa', c.agreed_paisa, 'parts_paisa', c.parts_paisa,
        'reported_paisa', c.reported_paisa, 'received_paisa', c.received_paisa,
        'posted_commission_paisa', c.posted_commission, 'commission_bps', c.commission_bps,
        'answer_due', c.answer_due, 'customer_answer', c.customer_answer, 'customer_text', c.customer_text,
        'customer_photo', c.customer_photo, 'blocked', c.status = 'owed' AND c.cleared_at IS NULL,
        'outcome', c.outcome, 'false_report', c.false_report, 'office_note', c.office_note,
        'office_by_name', c.office_by_name, 'office_at', c.office_at, 'created_at', c.created_at, 'closed_at', c.closed_at,
        'claim_open', EXISTS (SELECT 1 FROM public.guarantee_claims g WHERE g.job_id = c.job_id AND g.status = 'office_review'),
        'needs_you', c.status = 'office',
        'history', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'what', e.what, 'by', e.actor) ORDER BY e.at, e.id)
                             FROM public.job_events e WHERE e.job_id = c.job_id AND e.what LIKE 'payment%'), '[]'::jsonb)
      ) ORDER BY (c.status = 'office') DESC, c.created_at DESC)
    FROM public.payment_cases c
    JOIN public.jobs j ON j.id = c.job_id
    JOIN public.profiles p ON p.id = c.customer_id
    LEFT JOIN public.pros r ON r.id = c.pro_id
    WHERE c.status <> 'closed' OR c.closed_at > now() - interval '60 days'), '[]'::jsonb) END;
$$;

/**
 * The office's decision on a guarantee claim it holds because of a payment
 * case. Replace: another technician at Pechkas' cost, no charge to him.
 * Replace and charge: only on the office's independent finding that his work
 * failed — then the usual A21 charge with its 7-day appeal. Not covered. Or
 * hand it to him under the normal rules, with a fresh answer time.
 */
CREATE OR REPLACE FUNCTION public.admin_review_claim(p_claim uuid, p_action text, p_note text)
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
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND status = 'office_review' FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This claim is not waiting for the office.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a sentence. They will read it in the app.', 'note');
  END IF;
  IF p_action IN ('replace', 'replace_charge') THEN
    UPDATE public.guarantee_claims
    SET status = 'replacing', why_replacing = 'office', charge_original = (p_action = 'replace_charge'), office_note = v_note,
        decided_by_name = (SELECT name FROM public.staff WHERE id = auth.uid()), decided_at = now()
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.customer_id, 'claim_replacing', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
    -- Only an independent finding about his work is his business; then the usual charge and appeal follow.
    IF p_action = 'replace_charge' THEN
      PERFORM public.tell(v_claim.pro_id, 'claim_decided', v_claim.job_id, '/pro', public.claim_vars(v_claim));
    END IF;
  ELSIF p_action = 'not_covered' THEN
    UPDATE public.guarantee_claims SET status = 'not_covered', office_note = v_note, closed_at = now(), closed_by = 'office',
        decided_by_name = (SELECT name FROM public.staff WHERE id = auth.uid()), decided_at = now()
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.customer_id, 'claim_decided', v_claim.job_id, '/jobs', public.claim_vars(v_claim));
  ELSIF p_action = 'to_pro' THEN
    IF v_claim.pro_id IS NULL THEN
      RETURN public.refuse('That technician has left Pechkas. Send another technician instead.');
    END IF;
    UPDATE public.guarantee_claims
    SET status = 'waiting', reminded = 0, office_note = v_note, sent_to_pro = true,
        answer_due = now() + make_interval(hours => public.setting('claim_answer_hours')::integer)
    WHERE id = p_claim RETURNING * INTO v_claim;
    PERFORM public.tell(v_claim.pro_id, 'claim_new', v_claim.job_id, '/pro', public.claim_vars(v_claim));
  ELSE
    RETURN public.refuse('Choose what to do.');
  END IF;
  PERFORM public.log_job(v_claim.job_id, 'claim_reviewed', jsonb_build_object('action', p_action, 'note', v_note));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- She cannot post while she owes a technician, beside the unpaid visit fee -----------------------

CREATE OR REPLACE FUNCTION public.no_post_while_fee_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
  v_owe bigint;
BEGIN
  IF NEW.paid_by_pechkas OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT j.ref INTO v_ref FROM public.visit_fees v JOIN public.jobs j ON j.id = v.job_id
  WHERE v.customer_id = NEW.customer_id AND v.cleared_at IS NULL
    AND (v.status = 'unpaid' OR (v.status = 'covered' AND v.covered_unpaid))
  LIMIT 1;
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'The visit fee on job % is still unpaid. Pay the technician, or open that job and tap "I have paid him", then post again.', v_ref;
  END IF;
  -- D35: only once she agreed, or the office decided, that she owes the rest. Never while disputed or unanswered.
  SELECT j.ref, c.agreed_paisa - greatest(c.received_paisa, c.reported_paisa) INTO v_ref, v_owe
  FROM public.payment_cases c JOIN public.jobs j ON j.id = c.job_id
  WHERE c.customer_id = NEW.customer_id AND c.status = 'owed' AND c.cleared_at IS NULL
  ORDER BY c.owed_at
  LIMIT 1;
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'You still owe the technician % for job %. Pay him and he will tell Pechkas, or call the Pechkas office, then post again.', public.rs(v_owe), v_ref;
  END IF;
  RETURN NEW;
END;
$$;




-- --- A guarantee claim while a payment case is open goes to the office, never cancelled or shortened ----

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
  IF public.payment_case_open(p_job) THEN
    -- D35: the same guarantee, decided by the office; he is not asked while the payment is in question.
    UPDATE public.guarantee_claims SET status = 'office_review', office_review_at = now(), sent_to_pro = false
    WHERE id = v_claim.id RETURNING * INTO v_claim;
    PERFORM public.tell_office('claim_office_review', p_job, public.claim_vars(v_claim));
  ELSIF v_claim.pro_id IS NULL THEN
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




-- --- His claims: only the ones sent to him ----------------------------------------------------------

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
      'with_office', c.status = 'office_review',
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
      'blocks', coalesce(public.claim_blocks(auth.uid()) = c.id, false)
    ) || jsonb_build_object(
      -- The charge: waiting for its date (pending), or posted (final).
      'charge_paisa', c.charge_paisa,
      'charge_due', c.charge_due,
      'charge_final', c.charge_txn IS NOT NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled',
      'charged_at', c.charged_at,
      'appeal_until', coalesce(c.charge_due, c.charged_at + make_interval(days => public.setting('appeal_days')::integer)),
      'can_appeal', coalesce(c.charge_paisa, 0) > 0 AND c.appeal_at IS NULL
                    AND ((c.charge_txn IS NULL AND c.charge_due > now())
                         OR (c.charge_txn IS NOT NULL AND c.charge_due IS NULL
                             AND c.charged_at > now() - make_interval(days => public.setting('appeal_days')::integer))),
      'appeal_at', c.appeal_at, 'appeal_text', c.appeal_text, 'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.guarantee_claims c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.profiles p ON p.id = c.customer_id
  LEFT JOIN auth.users u ON u.id = c.customer_id
  WHERE c.pro_id = auth.uid() AND c.sent_to_pro
    AND (c.status NOT IN ('fixed', 'not_covered')
         OR (c.charge_paisa > 0 AND c.charge_txn IS NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled')
         OR (c.appeal_at IS NOT NULL AND (c.appeal_outcome IS NULL OR c.appeal_decided_at > now() - interval '30 days'))
         OR (c.charge_txn IS NOT NULL AND c.charged_at > now() - interval '30 days')
         OR c.closed_at > now() - interval '3 days');
$$;




-- --- The office: claims it holds need it, and say a payment case is open ----------------------------

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
      SELECT jsonb_agg(x.claim ORDER BY x.needs DESC, x.created_at DESC)
      FROM (
        SELECT c.created_at,
               coalesce(c.status IN ('refused', 'disputed', 'office_review') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
                        OR (rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live), false) AS needs,
               jsonb_build_object(
                 'id', c.id, 'status', c.status, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
                 'customer', p.first_name, 'customer_phone', public.phone_of(c.customer_id),
                 'pro', r.full_name, 'pro_phone', public.phone_of(c.pro_id),
                 'finished_at', j.finished_at, 'guarantee_days', public.guarantee_days_of(j.id),
                 'original_labour_paisa', coalesce(j.agreed_paisa, 0) - coalesce(j.parts_paisa, 0),
                 'description', c.description, 'media', c.media, 'created_at', c.created_at, 'answer_due', c.answer_due,
                 'refuse_reason', c.refuse_reason, 'visit_date', c.visit_date, 'visit_from', c.visit_from,
                 'fixed_photos', c.fixed_photos, 'still_broken', c.still_broken,
                 'why_replacing', c.why_replacing, 'charge_original', c.charge_original,
                 'replacement_job_id', c.replacement_job_id, 'replacement_ref', rj.ref,
                 'block_lifted', c.block_lifted, 'blocking', coalesce(public.claim_blocks(c.pro_id) = c.id, false),
                 'office_note', c.office_note, 'decided_by_name', c.decided_by_name, 'decided_at', c.decided_at,
                 'closed_by', c.closed_by, 'closed_at', c.closed_at,
                 'photos', public.photos_of(j.id)
               ) || jsonb_build_object(
                 -- The replacement, and the office's limit on what Pechkas pays for it.
                 'replacement_status', rj.status,
                 'replacement_offers', rx.n,
                 'replacement_waiting', coalesce(rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live, false),
                 'cap_paisa', rj.pay_cap_paisa,
                 'first_cap_paisa', coalesce(c.first_cap_paisa, rj.pay_cap_paisa),
                 'max_cap_paisa', coalesce(c.first_cap_paisa, rj.pay_cap_paisa) * 3,
                 'can_raise_cap', coalesce(c.status = 'replacing' AND rj.status = 'open' AND rj.paid_by_pechkas, false),
                 'cap_raised_at', c.cap_raised_at, 'cap_raised_by_name', c.cap_raised_by_name, 'cap_note', c.cap_note,
                 -- The charge, recorded and then final.
                 'charge_paisa', c.charge_paisa, 'charge_due', c.charge_due, 'charged_at', c.charged_at,
                 'charge_final', c.charge_txn IS NOT NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled',
                 'appeal_text', c.appeal_text, 'appeal_photos', c.appeal_photos, 'appeal_at', c.appeal_at,
                 'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note,
                 'payment_case', public.payment_case_open(j.id),
                 'needs_you', coalesce(c.status IN ('refused', 'disputed', 'office_review') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
                                       OR (rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live), false)
               ) AS claim
        FROM public.guarantee_claims c
        JOIN public.jobs j ON j.id = c.job_id
        JOIN public.profiles p ON p.id = c.customer_id
        LEFT JOIN public.pros r ON r.id = c.pro_id
        LEFT JOIN public.jobs rj ON rj.id = c.replacement_job_id
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE o.status = 'pending' AND o.expires_at > now()) AS n,
                 coalesce(bool_or(o.status = 'pending' AND o.expires_at > now()), false) AS live
          FROM public.offers o WHERE o.job_id = rj.id) rx ON true
        WHERE c.status NOT IN ('fixed', 'not_covered') OR c.created_at > now() - interval '60 days'
           OR (c.charge_paisa > 0 AND c.charge_txn IS NULL) OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
      ) x), '[]'::jsonb),
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
    'reserve_paisa', -coalesce((SELECT sum(e.amount_paisa) FROM public.ledger_entries e WHERE e.account = 'reserve'), 0),
    'charges_waiting_paisa', coalesce((SELECT sum(c.charge_paisa) FROM public.guarantee_claims c
                                        WHERE c.charge_paisa > 0 AND c.charge_txn IS NULL
                                          AND coalesce(c.appeal_outcome, '') <> 'cancelled'), 0)
  );
END;
$$;




-- --- Her jobs: the payment question -----------------------------------------------------------------

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
      'technicians_before', (SELECT count(*) FROM public.job_assignments a WHERE a.job_id = j.id),
      -- D35: he says he was not paid in full.
      'payment', public.payment_view(j.id, 'customer')
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;




-- --- Flags: reports, confirmed unpaid jobs, and a report the office found false ---------------------

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
      -- D36: a fee past its grace, his new offers stopped.
      CASE WHEN public.pay_blocked(r.id) THEN 1 ELSE 0 END AS overdue,
      -- D35: his not-paid reports, and any the office found false.
      (SELECT count(*) FROM public.payment_cases x WHERE x.pro_id = r.id AND x.created_at >= v_since) AS unpaid_reports,
      (SELECT count(*) FROM public.payment_cases x WHERE x.pro_id = r.id AND x.false_report AND x.office_at >= v_since) AS false_unpaid,
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
        public.flag_if('overdue', p.overdue, 1),
        public.flag_if('unpaid_reports', p.unpaid_reports, public.setting('flag_unpaid_reports')),
        public.flag_if('false_unpaid', p.false_unpaid, 1),
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
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.dispute_outcome = 'done' AND j.disputed_at >= v_since) AS overruled,
      -- D35: jobs she agreed, or the office found, she had not paid in full. A report alone never counts.
      (SELECT count(*) FROM public.payment_cases x WHERE x.customer_id = c.id AND x.owed_at >= v_since) AS unpaid_jobs
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
        public.flag_if('overruled', c.overruled, public.setting('flag_overruled')),
        public.flag_if('unpaid_jobs', c.unpaid_jobs, public.setting('flag_unpaid_jobs'))
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




-- --- What people are told: a job number, never what anybody wrote -------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('payment_question.title',    557, NULL, 'A question about payment for {ref}', 'customer'),
  ('payment_question.body',     558, NULL, 'Open the job in the Pechkas app to answer.', 'customer'),
  ('payment_office.title',      559, NULL, 'A payment question needs you: {ref}', 'office'),
  ('payment_office.body',       560, NULL, 'Open Payment disputes in the admin panel.', 'office'),
  ('payment_answered.title',    561, NULL, 'The customer has answered about payment for {ref}', 'technician'),
  ('payment_answered.body',     562, NULL, 'Open the job in the Pechkas app to see where it has got to.', 'technician'),
  ('payment_decided.title',     563, NULL, 'Pechkas has decided about payment for {ref}', 'both'),
  ('payment_decided.body',      564, NULL, 'Open the job in the Pechkas app to read the decision.', 'both'),
  ('payment_settled.title',     565, NULL, 'Payment for {ref} is settled', 'customer'),
  ('payment_settled.body',      566, NULL, '{pro} says he has now been paid in full. Thank you.', 'customer'),
  ('claim_office_review.title', 567, NULL, 'A guarantee claim needs you: {ref}', 'office'),
  ('claim_office_review.body',  568, NULL, 'A payment question is open on this job, so the office decides the claim. Open Guarantee and disputes.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 557 AND 568 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-payment-clock', '*/10 * * * *', 'SELECT public.payment_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.payment_case_open(uuid),
  public.claims_to_office(uuid),
  public.release_commission(uuid),
  public.unrelease_commission(uuid),
  public.payment_vars(public.payment_cases),
  public.payment_view(uuid, text),
  public.payment_clock(),
  public.pro_report_unpaid(uuid, bigint),
  public.pro_correct_unpaid(uuid, bigint),
  public.customer_answer_unpaid(uuid, text, text, text),
  public.pro_now_paid(uuid),
  public.pro_payment_jobs(),
  public.admin_payment_case(uuid, text, text, bigint, boolean),
  public.admin_payment_cases(),
  public.admin_review_claim(uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pro_report_unpaid(uuid, bigint),
  public.pro_correct_unpaid(uuid, bigint),
  public.customer_answer_unpaid(uuid, text, text, text),
  public.pro_now_paid(uuid),
  public.pro_payment_jobs(),
  public.admin_payment_case(uuid, text, text, bigint, boolean),
  public.admin_payment_cases(),
  public.admin_review_claim(uuid, text, text),
  public.claim_guarantee(uuid, text, jsonb),
  public.pro_claims(),
  public.admin_guarantee(),
  public.my_jobs(),
  public.admin_flags()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261112300000_payment_disputes')
ON CONFLICT (name) DO NOTHING;

COMMIT;
