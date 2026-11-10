-- =============================================================================
--  The visit fee: a flat fee, owed only after a real visit, and recorded
-- =============================================================================
--
--  The owner's decision D12 (9 November 2026), with his follow-up answers
--  (10 November: "go with your suggestions").
--
--  THE RULE
--    · A flat visit fee, Rs 300 to start, which the office changes in
--      Settings (the setting is still called visit_fee_min_paisa; the
--      "largest" one is kept for a possible distance fee and no longer used).
--    · The technician keeps all of it. Pechkas takes no commission on it, and
--      it never enters the commission or the price record.
--    · It is owed only when he came, gave the start code (the only proof he
--      was at her door), inspected, asked a new price with a reason and a
--      photo, and the customer said no. A new price now needs the start code
--      first (D12.1).
--    · It is never owed when he did not come, when the repair goes ahead, or
--      when the office finds the failure was his: the office's "not
--      finished" decision now has two outcomes, fee or no fee (D12.2).
--    · A guarantee repair stopped at the door: Pechkas pays it, as before. A
--      new price on a guarantee repair goes to the office, never to the
--      customer, who would be spending Pechkas' money (D12.7).
--    · The fee is fixed when she chooses him: the figure she was shown
--      (D12.6).
--
--  WHAT THE APP RECORDS
--    The app takes no money: she pays him at the door. visit_fees keeps one
--    row per stopped job: the amount, who pays, why, and what happened —
--      due → paid (he says so)                       (D12.3)
--      due → unpaid (he says not) → she cannot post a new job until she pays
--            or the office clears it; the office may pay him from the
--            reserve, once per ledger key (D12.5)
--      due / paid / unpaid → disputed (she disagrees within 24 hours, or says
--            she paid) → the office keeps it or waives it
--      waived after she paid → he gives it back, or the office charges him
--            and settles with her (D12.4)
--      covered → Pechkas paid him (a guarantee repair, or an unpaid fee)
--    Every step is in job_events with who did it; every office action needs
--    a reason. Money only moves in the ledger, keyed so it cannot happen
--    twice: visit_fee_cover:<fee>, visit_fee_refund:<fee>.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;


-- --- The setting ------------------------------------------------------------------------------

UPDATE public.settings
SET meaning = 'The visit fee: what a customer pays the technician when he came, gave the start code, asked a new price, and she said no. 30000 = Rs 300. The technician keeps all of it; Pechkas takes no commission. Fixed on a job when the customer chooses him.'
WHERE key = 'visit_fee_min_paisa';
UPDATE public.settings
SET meaning = 'Not used while the visit fee is flat (the owner''s decision of 9 November 2026). Kept for a fee by distance later.'
WHERE key = 'visit_fee_max_paisa';


-- --- What a job now remembers -----------------------------------------------------------------

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS visit_fee_paisa bigint;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_visit_fee_paisa_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_visit_fee_paisa_check CHECK (visit_fee_paisa IS NULL OR visit_fee_paisa >= 0);
-- Why a job stopped: she declined a new price; the office declined one for
-- her (a guarantee repair, or she answered by phone); the office decided a
-- disputed job was not finished, with or without the fee.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_stop_reason_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_stop_reason_check
  CHECK (stop_reason IS NULL OR stop_reason IN ('declined', 'office_declined', 'office_fee', 'office_no_fee'));

-- A new price: who answered it, and his "she said no at the door".
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS decided_by text;
ALTER TABLE public.job_changes DROP CONSTRAINT IF EXISTS job_changes_decided_by_check;
ALTER TABLE public.job_changes ADD CONSTRAINT job_changes_decided_by_check CHECK (decided_by IS NULL OR decided_by IN ('customer', 'office'));
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS office_note text;
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS pro_says_no_at timestamptz;
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS office_told_at timestamptz;

-- Two new kinds of ledger line.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.ledger_txns'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.ledger_txns DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.ledger_txns ADD CONSTRAINT ledger_txns_kind_check
  CHECK (kind IN ('commission', 'settlement', 'reversal', 'guarantee_pay', 'guarantee_charge', 'payout',
                  'visit_fee_cover', 'visit_fee_refund'));


-- --- The fee is fixed when she chooses him ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fix_visit_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'assigned' AND NEW.visit_fee_paisa IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'assigned') THEN
    NEW.visit_fee_paisa := public.setting('visit_fee_min_paisa');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_fix_visit_fee ON public.jobs;
CREATE TRIGGER job_fix_visit_fee BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.fix_visit_fee();

-- Jobs already under way keep the fee they were shown, which was the setting.
UPDATE public.jobs SET visit_fee_paisa = public.setting('visit_fee_min_paisa')
WHERE status = 'assigned' AND visit_fee_paisa IS NULL;

/** The fee for a job: the one fixed when she chose him, or today's for a job not yet chosen. */
CREATE OR REPLACE FUNCTION public.visit_fee(p_job uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT j.visit_fee_paisa FROM public.jobs j WHERE j.id = p_job),
                  public.setting('visit_fee_min_paisa'));
$$;


-- --- The record ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.visit_fees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL,
  pro_id            uuid,
  amount_paisa      bigint NOT NULL CHECK (amount_paisa >= 0 AND amount_paisa % 100 = 0),
  reason            text NOT NULL CHECK (reason IN ('declined', 'office_declined', 'office_fee', 'office_no_fee')),
  change_id         uuid,
  payer             text NOT NULL CHECK (payer IN ('customer', 'pechkas')),
  status            text NOT NULL CHECK (status IN ('due', 'paid', 'unpaid', 'disputed', 'waived', 'covered')),
  status_before     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  unpaid_at         timestamptz,
  customer_said     text CHECK (customer_said IN ('disagree', 'paid')),
  customer_text     text CHECK (customer_text IS NULL OR length(customer_text) <= 300),
  customer_said_at  timestamptz,
  covered_unpaid    boolean NOT NULL DEFAULT false,
  covered_txn       uuid,
  covered_at        timestamptz,
  refund            text CHECK (refund IN ('owed', 'returned', 'charged')),
  refund_txn        uuid,
  cleared_at        timestamptz,
  office_note       text CHECK (office_note IS NULL OR length(office_note) <= 300),
  office_by_name    text,
  office_at         timestamptz
);
ALTER TABLE public.visit_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visit_fees FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS visit_fees_customer ON public.visit_fees (customer_id) WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS visit_fees_pro ON public.visit_fees (pro_id, created_at DESC);

/** A visit fee's record, written once, the moment a job stops — whichever function stopped it. */
CREATE OR REPLACE FUNCTION public.record_visit_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_payer  text;
  v_amount bigint := coalesce(NEW.visit_fee_paisa, public.setting('visit_fee_min_paisa'));
  v_change uuid;
  v_txn    uuid;
BEGIN
  IF NEW.status <> 'stopped' OR OLD.status IS NOT DISTINCT FROM 'stopped' THEN
    RETURN NULL;
  END IF;
  v_payer := CASE WHEN NEW.paid_by_pechkas THEN 'pechkas' ELSE 'customer' END;
  v_status := CASE WHEN NEW.stop_reason = 'office_no_fee' THEN 'waived'
                   WHEN NEW.paid_by_pechkas THEN 'covered'
                   ELSE 'due' END;
  SELECT c.id INTO v_change FROM public.job_changes c
  WHERE c.job_id = NEW.id AND c.status = 'declined' ORDER BY c.decided_at DESC NULLS LAST LIMIT 1;
  -- A guarantee repair's fee was paid from the reserve by on_replacement_done(),
  -- which runs first; this row only points at that payment.
  SELECT t.id INTO v_txn FROM public.ledger_txns t WHERE t.idempotency_key = 'guarantee_pay:' || NEW.id;

  INSERT INTO public.visit_fees (job_id, customer_id, pro_id, amount_paisa, reason, change_id, payer, status,
                                 covered_txn, covered_at, office_note, office_by_name, office_at)
  VALUES (NEW.id, NEW.customer_id, NEW.pro_id, v_amount, coalesce(NEW.stop_reason, 'declined'), v_change, v_payer, v_status,
          v_txn, CASE WHEN v_txn IS NOT NULL THEN now() END,
          CASE WHEN NEW.stop_reason IN ('office_fee', 'office_no_fee') THEN left(NEW.dispute_note, 300) END,
          CASE WHEN NEW.stop_reason IN ('office_fee', 'office_no_fee', 'office_declined')
               THEN (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()) END,
          CASE WHEN NEW.stop_reason IN ('office_fee', 'office_no_fee', 'office_declined') THEN now() END)
  ON CONFLICT (job_id) DO NOTHING;
  PERFORM public.log_job(NEW.id, 'visit_fee_recorded',
    jsonb_build_object('amount', v_amount, 'payer', v_payer, 'status', v_status, 'reason', coalesce(NEW.stop_reason, 'declined')));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_visit_fee ON public.jobs;
CREATE TRIGGER job_visit_fee AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_visit_fee();

/**
 * A fee as one side may read it. The customer never sees the office's
 * name; the technician never sees her words, only that she raised it.
 */
CREATE OR REPLACE FUNCTION public.visit_fee_view(p_job uuid, p_side text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
      'id', v.id, 'amount_paisa', v.amount_paisa, 'payer', v.payer, 'status', v.status, 'reason', v.reason,
      'created_at', v.created_at, 'paid_at', v.paid_at, 'refund', v.refund,
      'customer_said', v.customer_said,
      'office_note', CASE WHEN v.status = 'waived' OR v.reason IN ('office_fee', 'office_no_fee', 'office_declined')
                          OR v.office_at IS NOT NULL THEN v.office_note END,
      'blocks_posting', p_side = 'customer' AND v.cleared_at IS NULL
                        AND (v.status = 'unpaid' OR (v.status = 'covered' AND v.covered_unpaid)),
      'can_disagree', p_side = 'customer' AND v.payer = 'customer' AND v.customer_said_at IS NULL
                      AND v.status IN ('due', 'paid', 'unpaid') AND v.created_at > now() - interval '24 hours',
      'can_say_paid', p_side = 'customer' AND v.status = 'unpaid',
      'can_mark', p_side = 'pro' AND v.payer = 'customer'
                  AND (v.status IN ('due', 'unpaid') OR (v.status = 'disputed' AND v.customer_said = 'paid')))
  FROM public.visit_fees v WHERE v.job_id = p_job;
$$;


-- --- A new price: only after the start code, and the office answers on a guarantee repair ------

/** A new price: only once the start code is in; on a guarantee repair, answered by the office. */
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
  -- The start code is the customer's: entered, it proves he is at her door.
  -- A visit fee can only follow a new price, so it can only follow a real visit.
  IF v_job.stage IS DISTINCT FROM 'working' THEN
    RETURN public.refuse(CASE WHEN v_job.stage = 'arrived'
                              THEN 'Enter the customer''s start code first. A new price can be asked once she has let you in.'
                              ELSE 'A new price can only be asked at the house.' END, 'stage');
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
  IF v_job.paid_by_pechkas THEN
    -- Pechkas pays for a guarantee repair, so the office answers, never the customer.
    PERFORM public.tell_office('change_office', p_job, public.job_vars(v_job));
    PERFORM public.tell(v_job.customer_id, 'change_to_office', p_job, '/jobs', public.job_vars(v_job));
  ELSE
    PERFORM public.tell(v_job.customer_id, 'change', p_job, '/jobs',
      public.job_vars(v_job) || jsonb_build_object(
        'pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id),
        'price', public.rs(p_price_paisa), 'was', public.rs(v_job.agreed_paisa)));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The customer answers a new price. Declined, the job stops and the visit fee fixed when she chose him is owed. */
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
  IF v_job.paid_by_pechkas THEN
    RETURN public.refuse('Pechkas is paying for this repair, so the Pechkas office answers the new price. You do not need to do anything.');
  END IF;

  IF coalesce(p_approve, false) THEN
    UPDATE public.job_changes SET status = 'approved', decided_at = now(), decided_by = 'customer' WHERE id = p_change;
    UPDATE public.jobs SET agreed_paisa = v_change.price_paisa, updated_at = now() WHERE id = v_job.id;
    PERFORM public.log_job(v_job.id, 'change_approved', jsonb_build_object('price_paisa', v_change.price_paisa));
    PERFORM public.tell(v_job.pro_id, 'change_ok', v_job.id, '/pro',
      public.job_vars(v_job) || jsonb_build_object('price', public.rs(v_change.price_paisa)));
  ELSE
    v_fee := public.visit_fee(v_job.id);
    UPDATE public.job_changes SET status = 'declined', decided_at = now(), decided_by = 'customer' WHERE id = p_change;
    PERFORM public.log_job(v_job.id, 'change_declined', jsonb_build_object('price_paisa', v_change.price_paisa));
    UPDATE public.jobs
    SET status = 'stopped', stop_reason = 'declined', finished_at = now(), collect_paisa = v_fee, updated_at = now()
    WHERE id = v_job.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


/**
 * The office answers a new price: always on a guarantee repair (Pechkas'
 * money), and on any job when the customer gave her answer at the door or
 * by phone but not in the app. A reason is required and kept.
 */
CREATE OR REPLACE FUNCTION public.admin_decide_change(p_change uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change public.job_changes%ROWTYPE;
  v_job    public.jobs%ROWTYPE;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_change FROM public.job_changes WHERE id = p_change;
  IF v_change.id IS NULL THEN
    RETURN public.refuse('That new price is no longer there.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_change.job_id FOR UPDATE;
  SELECT * INTO v_change FROM public.job_changes WHERE id = p_change FOR UPDATE;
  IF v_change.status <> 'pending' OR v_job.status <> 'assigned' THEN
    RETURN public.refuse('This has already been answered, or the job has ended.');
  END IF;
  IF p_approve IS NULL THEN
    RETURN public.refuse('Choose approve or decline.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write why, in a sentence. It stays on the job''s record.', 'note');
  END IF;

  IF p_approve THEN
    UPDATE public.job_changes SET status = 'approved', decided_at = now(), decided_by = 'office', office_note = v_note WHERE id = p_change;
    UPDATE public.jobs SET agreed_paisa = v_change.price_paisa,
           pay_cap_paisa = CASE WHEN paid_by_pechkas THEN greatest(coalesce(pay_cap_paisa, 0), v_change.price_paisa) ELSE pay_cap_paisa END,
           updated_at = now()
    WHERE id = v_job.id;
    PERFORM public.log_job(v_job.id, 'change_approved', jsonb_build_object('price_paisa', v_change.price_paisa, 'by', 'office', 'note', v_note));
    PERFORM public.tell(v_job.pro_id, 'change_ok', v_job.id, '/pro',
      public.job_vars(v_job) || jsonb_build_object('price', public.rs(v_change.price_paisa)));
  ELSE
    UPDATE public.job_changes SET status = 'declined', decided_at = now(), decided_by = 'office', office_note = v_note WHERE id = p_change;
    PERFORM public.log_job(v_job.id, 'change_declined', jsonb_build_object('price_paisa', v_change.price_paisa, 'by', 'office', 'note', v_note));
    UPDATE public.jobs
    SET status = 'stopped', stop_reason = 'office_declined', finished_at = now(),
        collect_paisa = CASE WHEN paid_by_pechkas THEN 0 ELSE public.visit_fee(id) END, updated_at = now()
    WHERE id = v_job.id;
    UPDATE public.visit_fees SET office_note = v_note WHERE job_id = v_job.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * "She said no at the door": he cannot stop the job himself. The customer
 * is asked to answer in the app; if she has not after 20 minutes, the
 * office is told and rings her (visit_fee_clock).
 */
CREATE OR REPLACE FUNCTION public.pro_reports_no(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs;
  v_change public.job_changes%ROWTYPE;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  SELECT * INTO v_change FROM public.job_changes WHERE job_id = p_job AND status = 'pending' FOR UPDATE;
  IF v_change.id IS NULL THEN
    RETURN public.refuse('There is no new price waiting for an answer.');
  END IF;
  IF v_change.pro_says_no_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE public.job_changes SET pro_says_no_at = now() WHERE id = v_change.id;
  PERFORM public.log_job(p_job, 'pro_says_declined', jsonb_build_object('change', v_change.id));
  IF v_job.paid_by_pechkas THEN
    PERFORM public.tell_office('change_office', p_job, public.job_vars(v_job));
  ELSE
    PERFORM public.tell(v_job.customer_id, 'change_waiting', p_job, '/jobs',
      public.job_vars(v_job) || jsonb_build_object(
        'pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id),
        'fee', public.rs(public.visit_fee(p_job))));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- After the job stopped: paid, not paid, disagreed -----------------------------------------

/** Lock his fee for an action; NULL when it is not his job's fee. */
CREATE OR REPLACE FUNCTION public.fee_vars(p_fee public.visit_fees)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.job_vars(j) || jsonb_build_object(
    'amount', public.rs(p_fee.amount_paisa),
    'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = p_fee.pro_id), 'The technician'))
  FROM public.jobs j WHERE j.id = p_fee.job_id;
$$;

/** The technician says whether he was paid the visit fee. Once paid, it stays paid; a mistake goes to the office. */
CREATE OR REPLACE FUNCTION public.pro_visit_fee(p_job uuid, p_paid boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee public.visit_fees;
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE job_id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_fee.id IS NULL OR v_fee.payer <> 'customer' THEN
    RETURN public.refuse('There is no visit fee for you to collect on this job.');
  END IF;
  IF p_paid IS NULL THEN
    RETURN public.refuse('Say whether you were paid.');
  END IF;
  -- The same answer twice changes nothing.
  IF (p_paid AND v_fee.status = 'paid') OR (NOT p_paid AND v_fee.status = 'unpaid') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF p_paid THEN
    IF NOT (v_fee.status IN ('due', 'unpaid') OR (v_fee.status = 'disputed' AND v_fee.customer_said = 'paid')) THEN
      RETURN public.refuse('The office is looking at this fee. It will tell you what it decides.');
    END IF;
    UPDATE public.visit_fees SET status = 'paid', paid_at = now(), status_before = NULL WHERE id = v_fee.id;
    PERFORM public.log_job(p_job, 'visit_fee_paid', jsonb_build_object('by', 'pro'));
  ELSE
    IF v_fee.status <> 'due' THEN
      RETURN public.refuse(CASE WHEN v_fee.status = 'paid' THEN 'You said you were paid. If that was a mistake, call the Pechkas office.'
                                ELSE 'The office is looking at this fee. It will tell you what it decides.' END);
    END IF;
    UPDATE public.visit_fees SET status = 'unpaid', unpaid_at = now() WHERE id = v_fee.id RETURNING * INTO v_fee;
    PERFORM public.log_job(p_job, 'visit_fee_unpaid', jsonb_build_object('by', 'pro'));
    PERFORM public.tell(v_fee.customer_id, 'fee_unpaid', p_job, '/jobs', public.fee_vars(v_fee));
    PERFORM public.tell_office('fee_unpaid_office', p_job, public.fee_vars(v_fee));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The customer: "I disagree with this fee" (once, within 24 hours, with a
 * reason) or "I have paid him" (when he says she has not). Either goes to
 * the office, and while the office looks she is not stopped from posting.
 */
CREATE OR REPLACE FUNCTION public.customer_visit_fee(p_job uuid, p_kind text, p_text text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee  public.visit_fees;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE job_id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_fee.id IS NULL OR v_fee.payer <> 'customer' THEN
    RETURN public.refuse('There is no visit fee for you on this job.');
  END IF;
  IF v_text IS NOT NULL AND (length(v_text) > 300 OR public.looks_like_cnic(v_text)) THEN
    RETURN public.refuse('Please keep it short.', 'text');
  END IF;
  IF p_kind = 'disagree' THEN
    IF v_fee.customer_said_at IS NOT NULL THEN
      RETURN public.refuse('You have already told us. The office will decide.');
    END IF;
    IF v_fee.status NOT IN ('due', 'paid', 'unpaid') OR v_fee.created_at <= now() - interval '24 hours' THEN
      RETURN public.refuse('This fee can no longer be questioned in the app. Call the Pechkas office.');
    END IF;
    IF v_text IS NULL OR length(v_text) < 5 THEN
      RETURN public.refuse('Tell us why, in a few words.', 'text');
    END IF;
  ELSIF p_kind = 'paid' THEN
    IF v_fee.status <> 'unpaid' THEN
      RETURN public.refuse('Nothing to answer here.');
    END IF;
  ELSE
    RETURN public.refuse('Choose what to tell us.');
  END IF;
  UPDATE public.visit_fees
  SET status = 'disputed', status_before = v_fee.status, customer_said = p_kind, customer_text = v_text, customer_said_at = now()
  WHERE id = v_fee.id RETURNING * INTO v_fee;
  PERFORM public.log_job(p_job, 'visit_fee_disputed', jsonb_build_object('kind', p_kind));
  PERFORM public.tell_office('fee_disputed_office', p_job, public.fee_vars(v_fee));
  PERFORM public.tell(v_fee.pro_id, 'fee_disputed_pro', p_job, '/pro', public.fee_vars(v_fee));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Nobody posts a new job while a visit fee is unpaid and the office has not cleared it. */
CREATE OR REPLACE FUNCTION public.no_post_while_fee_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
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
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_no_post_fee_unpaid ON public.jobs;
CREATE TRIGGER job_no_post_fee_unpaid BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.no_post_while_fee_unpaid();


-- --- The office ---------------------------------------------------------------------------------

/**
 * Every office action on a fee, each needing a reason, each logged:
 *   waive          — no fee. If she had already paid, it must go back to her (refund owed).
 *   keep           — a disputed fee stands as it was before (due, paid or unpaid).
 *   mark_paid      — she paid; the office has checked.
 *   cover          — an unpaid fee: Pechkas pays him from the reserve. She stays
 *                    unable to post until she settles with Pechkas and the office clears her.
 *   clear          — she may post again (she settled with Pechkas, or the office forgives it).
 *   refund_returned— he gave the money back to her.
 *   refund_charge  — he would not: Pechkas paid her back, and it is added to what he owes.
 */
CREATE OR REPLACE FUNCTION public.admin_visit_fee(p_fee uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee   public.visit_fees;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_name  text;
  v_txn   uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_fee FROM public.visit_fees WHERE id = p_fee FOR UPDATE;
  IF v_fee.id IS NULL THEN
    RETURN public.refuse('There is no such visit fee.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write why, in a sentence. It stays on the record.', 'note');
  END IF;
  v_name := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());

  IF p_action = 'waive' THEN
    IF v_fee.status NOT IN ('due', 'paid', 'unpaid', 'disputed') OR v_fee.payer <> 'customer' THEN
      RETURN public.refuse('This fee cannot be waived now.');
    END IF;
    UPDATE public.visit_fees
    SET status = 'waived',
        refund = CASE WHEN v_fee.status = 'paid' OR (v_fee.status = 'disputed' AND v_fee.status_before = 'paid') THEN 'owed' END,
        cleared_at = coalesce(cleared_at, now())
    WHERE id = p_fee RETURNING * INTO v_fee;
    PERFORM public.tell(v_fee.customer_id, 'fee_waived', v_fee.job_id, '/jobs', public.fee_vars(v_fee));
    PERFORM public.tell(v_fee.pro_id, CASE WHEN v_fee.refund = 'owed' THEN 'fee_refund' ELSE 'fee_waived_pro' END,
                        v_fee.job_id, '/pro', public.fee_vars(v_fee));
  ELSIF p_action = 'keep' THEN
    IF v_fee.status <> 'disputed' THEN
      RETURN public.refuse('Only a disputed fee can be kept.');
    END IF;
    UPDATE public.visit_fees SET status = coalesce(status_before, 'due'), status_before = NULL WHERE id = p_fee RETURNING * INTO v_fee;
    PERFORM public.tell(v_fee.customer_id, 'fee_kept', v_fee.job_id, '/jobs', public.fee_vars(v_fee));
  ELSIF p_action = 'mark_paid' THEN
    IF v_fee.status NOT IN ('due', 'unpaid', 'disputed') OR v_fee.payer <> 'customer' THEN
      RETURN public.refuse('This fee cannot be marked paid now.');
    END IF;
    UPDATE public.visit_fees SET status = 'paid', paid_at = now(), status_before = NULL WHERE id = p_fee RETURNING * INTO v_fee;
  ELSIF p_action = 'cover' THEN
    IF v_fee.status <> 'unpaid' AND NOT (v_fee.status = 'disputed' AND v_fee.status_before = 'unpaid') THEN
      RETURN public.refuse('Pechkas pays a fee only when it is unpaid.');
    END IF;
    v_txn := public.post_txn('visit_fee_cover:' || v_fee.id, 'visit_fee_cover', v_fee.job_id, v_fee.pro_id, jsonb_build_array(
      jsonb_build_object('account', 'pro_owes', 'pro_id', v_fee.pro_id, 'amount', -v_fee.amount_paisa),
      jsonb_build_object('account', 'reserve', 'amount', v_fee.amount_paisa)),
      NULL, NULL, 'Visit fee the customer did not pay, paid by Pechkas');
    UPDATE public.visit_fees
    SET status = 'covered', payer = 'pechkas', covered_unpaid = true, covered_txn = v_txn, covered_at = now(), status_before = NULL
    WHERE id = p_fee RETURNING * INTO v_fee;
    PERFORM public.tell(v_fee.pro_id, 'fee_covered', v_fee.job_id, '/pro/money', public.fee_vars(v_fee));
  ELSIF p_action = 'clear' THEN
    IF v_fee.cleared_at IS NOT NULL OR NOT (v_fee.status = 'unpaid' OR (v_fee.status = 'covered' AND v_fee.covered_unpaid)) THEN
      RETURN public.refuse('This customer is not held back by this fee.');
    END IF;
    UPDATE public.visit_fees SET cleared_at = now() WHERE id = p_fee RETURNING * INTO v_fee;
  ELSIF p_action = 'refund_returned' THEN
    IF v_fee.refund IS DISTINCT FROM 'owed' THEN
      RETURN public.refuse('No money is owed back on this fee.');
    END IF;
    UPDATE public.visit_fees SET refund = 'returned' WHERE id = p_fee RETURNING * INTO v_fee;
  ELSIF p_action = 'refund_charge' THEN
    IF v_fee.refund IS DISTINCT FROM 'owed' THEN
      RETURN public.refuse('No money is owed back on this fee.');
    END IF;
    v_txn := public.post_txn('visit_fee_refund:' || v_fee.id, 'visit_fee_refund', v_fee.job_id, v_fee.pro_id, jsonb_build_array(
      jsonb_build_object('account', 'pro_owes', 'pro_id', v_fee.pro_id, 'amount', v_fee.amount_paisa),
      jsonb_build_object('account', 'received', 'amount', -v_fee.amount_paisa)),
      NULL, NULL, 'Waived visit fee paid back to the customer by Pechkas');
    UPDATE public.visit_fees SET refund = 'charged', refund_txn = v_txn WHERE id = p_fee RETURNING * INTO v_fee;
    PERFORM public.tell(v_fee.pro_id, 'fee_refund_charged', v_fee.job_id, '/pro/money', public.fee_vars(v_fee));
  ELSE
    RETURN public.refuse('Choose what to do.');
  END IF;

  UPDATE public.visit_fees SET office_note = v_note, office_by_name = v_name, office_at = now() WHERE id = p_fee;
  PERFORM public.log_job(v_fee.job_id, 'visit_fee_' || p_action, jsonb_build_object('note', v_note, 'by', v_name));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Every visit fee, what needs the office, each technician's visit-fee earnings, and the history of each. */
CREATE OR REPLACE FUNCTION public.admin_visit_fees()
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
    'fee_now', public.setting('visit_fee_min_paisa'),
    'fees', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 'job_id', v.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(v.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(v.pro_id),
          'amount_paisa', v.amount_paisa, 'payer', v.payer, 'status', v.status, 'status_before', v.status_before,
          'reason', v.reason, 'created_at', v.created_at, 'paid_at', v.paid_at, 'unpaid_at', v.unpaid_at,
          'customer_said', v.customer_said, 'customer_text', v.customer_text, 'customer_said_at', v.customer_said_at,
          'covered_unpaid', v.covered_unpaid, 'covered_at', v.covered_at, 'refund', v.refund, 'cleared_at', v.cleared_at,
          'office_note', v.office_note, 'office_by_name', v.office_by_name, 'office_at', v.office_at,
          'change', (SELECT jsonb_build_object('from_paisa', c.from_paisa, 'price_paisa', c.price_paisa, 'reason', c.reason,
                                               'photo', c.photo_path, 'decided_at', c.decided_at, 'decided_by', c.decided_by)
                     FROM public.job_changes c WHERE c.id = v.change_id),
          'customer_unpaid_before', (SELECT count(*) FROM public.visit_fees o
                                     WHERE o.customer_id = v.customer_id AND o.id <> v.id AND (o.unpaid_at IS NOT NULL)),
          'needs_you', v.status IN ('unpaid', 'disputed') OR v.refund = 'owed',
          'history', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'what', e.what, 'by', e.actor, 'detail', e.detail) ORDER BY e.at, e.id)
                               FROM public.job_events e WHERE e.job_id = v.job_id
                                 AND (e.what LIKE 'visit_fee%' OR e.what IN ('change_asked', 'change_approved', 'change_declined', 'pro_says_declined'))), '[]'::jsonb)
        ) ORDER BY (v.status IN ('unpaid', 'disputed') OR v.refund = 'owed') DESC, v.created_at DESC)
      FROM public.visit_fees v
      JOIN public.jobs j ON j.id = v.job_id
      JOIN public.profiles p ON p.id = v.customer_id
      LEFT JOIN public.pros r ON r.id = v.pro_id
      WHERE v.created_at > now() - interval '180 days' OR v.status IN ('unpaid', 'disputed') OR v.refund = 'owed'), '[]'::jsonb),
    'changes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(j.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(j.pro_id),
          'from_paisa', c.from_paisa, 'price_paisa', c.price_paisa, 'reason', c.reason, 'photo', c.photo_path,
          'created_at', c.created_at, 'pro_says_no_at', c.pro_says_no_at,
          'paid_by_pechkas', j.paid_by_pechkas, 'pay_cap_paisa', j.pay_cap_paisa, 'visit_fee_paisa', public.visit_fee(j.id)
        ) ORDER BY c.created_at)
      FROM public.job_changes c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      WHERE c.status = 'pending' AND (j.paid_by_pechkas OR c.pro_says_no_at IS NOT NULL)), '[]'::jsonb),
    'earnings', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'paid_paisa')::bigint DESC)
      FROM (
        SELECT jsonb_build_object(
            'pro_id', v.pro_id, 'pro', r.full_name,
            'paid_paisa', coalesce(sum(v.amount_paisa) FILTER (WHERE v.status = 'paid'), 0),
            'covered_paisa', coalesce(sum(v.amount_paisa) FILTER (WHERE v.status = 'covered'), 0),
            'waiting_paisa', coalesce(sum(v.amount_paisa) FILTER (WHERE v.status IN ('due', 'unpaid', 'disputed')), 0),
            'count', count(*) FILTER (WHERE v.status <> 'waived')) AS x
        FROM public.visit_fees v LEFT JOIN public.pros r ON r.id = v.pro_id
        WHERE v.pro_id IS NOT NULL
        GROUP BY v.pro_id, r.full_name) e), '[]'::jsonb),
    'setting_history', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', s.at, 'by', s.by_name, 'from', s.old_value, 'to', s.new_value) ORDER BY s.at DESC)
      FROM public.setting_changes s WHERE s.key = 'visit_fee_min_paisa'), '[]'::jsonb)
  );
END;
$$;

/** His visit fees: the last 60 days, and any still open. */
CREATE OR REPLACE FUNCTION public.pro_visit_fees()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'fees', coalesce((
      SELECT jsonb_agg(public.visit_fee_view(v.job_id, 'pro') || jsonb_build_object(
               'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
               'customer_first_name', p.first_name, 'finished_at', j.finished_at) ORDER BY v.created_at DESC)
      FROM public.visit_fees v JOIN public.jobs j ON j.id = v.job_id JOIN public.profiles p ON p.id = v.customer_id
      WHERE v.pro_id = auth.uid()
        AND (v.created_at > now() - interval '60 days' OR v.status IN ('due', 'unpaid', 'disputed') OR v.refund = 'owed')), '[]'::jsonb),
    'paid_paisa', (SELECT coalesce(sum(v.amount_paisa), 0) FROM public.visit_fees v WHERE v.pro_id = auth.uid() AND v.status IN ('paid', 'covered')),
    'waiting_paisa', (SELECT coalesce(sum(v.amount_paisa), 0) FROM public.visit_fees v WHERE v.pro_id = auth.uid() AND v.status IN ('due', 'unpaid', 'disputed')));
$$;

/** Every minute: a "she said no at the door" with no answer after 20 minutes goes to the office, once. */
CREATE OR REPLACE FUNCTION public.visit_fee_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change public.job_changes%ROWTYPE;
  v_n      integer := 0;
BEGIN
  FOR v_change IN
    UPDATE public.job_changes c SET office_told_at = now()
    WHERE c.status = 'pending' AND c.pro_says_no_at <= now() - interval '20 minutes' AND c.office_told_at IS NULL
    RETURNING c.*
  LOOP
    PERFORM public.tell_office('change_unanswered', v_change.job_id,
      (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = v_change.job_id));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/** The new price waiting, with the evidence, and who answers it. */
CREATE OR REPLACE FUNCTION public.pending_change(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', c.id, 'from_paisa', c.from_paisa, 'price_paisa', c.price_paisa,
                            'reason', c.reason, 'photo', c.photo_path, 'created_at', c.created_at,
                            'pro_says_no_at', c.pro_says_no_at, 'office_decides', j.paid_by_pechkas)
  FROM public.job_changes c JOIN public.jobs j ON j.id = c.job_id
  WHERE c.job_id = p_job AND c.status = 'pending';
$$;

/** Who is told what when a job moves; a stopped job's message now follows why it stopped. */
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

/** The office decides a disputed job: finished; not finished with the fee; not finished, his fault, no fee; or back to work. */
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
  IF p_outcome NOT IN ('done', 'stopped', 'stopped_no_fee', 'return') THEN
    RETURN public.refuse('Choose a decision.', 'outcome');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found, in a sentence. Both of them will read it in the app.', 'note');
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.jobs SET dispute_outcome = 'done', dispute_note = v_note WHERE id = p_job;
    PERFORM public.close_checked(p_job, 'office');
  ELSIF p_outcome IN ('stopped', 'stopped_no_fee') THEN
    -- 'stopped': not finished, and not his fault (a part could not be had):
    -- the visit fee is owed. 'stopped_no_fee': not finished because of his
    -- work: no fee (the owner's rule, D12.2).
    v_fee := CASE WHEN p_outcome = 'stopped' THEN public.visit_fee(p_job) ELSE 0 END;
    UPDATE public.job_checks SET answer = 'office', answered_at = now() WHERE job_id = p_job AND answer IS NULL;
    UPDATE public.jobs SET status = 'stopped', finished_at = now(), confirmed_by = 'office',
           collect_paisa = CASE WHEN paid_by_pechkas THEN 0 ELSE v_fee END,
           commission_paisa = 0, parts_paisa = 0, dispute_outcome = 'stopped', dispute_note = v_note,
           stop_reason = CASE WHEN p_outcome = 'stopped' THEN 'office_fee' ELSE 'office_no_fee' END, updated_at = now()
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

/** A replacement job that ends; a visit fee is paid by Pechkas only when one is owed. */
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
    IF NEW.status = 'stopped' AND NEW.pro_id IS NOT NULL AND NEW.stop_reason IS DISTINCT FROM 'office_no_fee' THEN
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

  IF v_claim.charge_original AND v_claim.pro_id IS NOT NULL AND v_claim.charge_paisa IS NULL THEN
    SELECT * INTO v_orig FROM public.jobs WHERE id = v_claim.job_id;
    -- What the repair's work cost, never more than the labour of his own job;
    -- a raised limit above that is Pechkas' cost, not his.
    v_charge := least(NEW.agreed_paisa - coalesce(NEW.parts_paisa, 0),
                      coalesce(v_orig.agreed_paisa, 0) - coalesce(v_orig.parts_paisa, 0));
    IF v_charge > 0 THEN
      UPDATE public.guarantee_claims
      SET charge_paisa = v_charge, charge_due = now() + make_interval(days => public.setting('appeal_days')::integer)
      WHERE id = v_claim.id RETURNING * INTO v_claim;
      PERFORM public.log_job(v_claim.job_id, 'charge_recorded', jsonb_build_object('amount', v_charge, 'due', v_claim.charge_due));
      PERFORM public.tell(v_claim.pro_id, 'charge_pending', v_claim.job_id, '/pro/claims',
        public.claim_vars(v_claim) || jsonb_build_object('amount', public.rs(v_charge),
          'date', to_char(v_claim.charge_due AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon')));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_replacement_done ON public.jobs;
CREATE TRIGGER job_replacement_done AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_replacement_done();

/** Her jobs, as before, with the visit fee: before she chooses, and after a job stops. */
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
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/** His jobs, as before; a new price can be asked only once the start code is in. */
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
      'can_ask_change', j.stage = 'working'
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

/** His finished jobs of the last day, with the visit fee's state. */
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
      'can_rate', NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'pro'),
      'stop_reason', j.stop_reason,
      'visit_fee', public.visit_fee_view(j.id, 'pro')
    ) ORDER BY j.finished_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE j.pro_id = auth.uid() AND j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '24 hours';
$$;

/** The jobs he may offer on, as before, with the visit fee shown before he offers. */
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


-- --- What the phones are told -------------------------------------------------------------------
-- Trade, first names, the job number and amounts only. The office's reasons
-- and the customer's words are read in the app, never in a notification.

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('change_waiting.title',       460, NULL, '{pro} is waiting for your answer', 'customer'),
  ('change_waiting.body',        461, NULL, 'Approve or decline the new price for job {ref} in the app. If you decline, you pay only the visit fee of {fee}.', 'customer'),
  ('change_office.title',        462, NULL, 'New price to decide: {ref}', 'office'),
  ('change_office.body',         463, NULL, 'Open Visit fees in the admin panel to approve or decline it.', 'office'),
  ('change_unanswered.title',    464, NULL, 'No answer to a new price: {ref}', 'office'),
  ('change_unanswered.body',     465, NULL, 'The technician says the customer answered at the door, but nothing was tapped. Ring her, then decide in Visit fees.', 'office'),
  ('change_to_office.title',     466, NULL, 'Pechkas will answer the new price: {ref}', 'customer'),
  ('change_to_office.body',      467, NULL, 'Pechkas pays for this repair, so the office decides. You pay nothing.', 'customer'),
  ('stopped_office.title',       468, NULL, 'Job stopped: {ref}', 'technician'),
  ('stopped_office.body',        469, NULL, 'The new price was declined. Please collect only the visit fee of {fee}.', 'technician'),
  ('stopped_office_paid.title',  470, NULL, 'Job stopped: {ref}', 'technician'),
  ('stopped_office_paid.body',   471, NULL, 'Pechkas declined the new price. Pechkas pays your visit fee of {fee}.', 'technician'),
  ('fee_unpaid.title',           472, NULL, 'Visit fee unpaid: {ref}', 'customer'),
  ('fee_unpaid.body',            473, NULL, '{pro} says the visit fee of {amount} has not been paid. Pay him, or open the job and tap I have paid him.', 'customer'),
  ('fee_unpaid_office.title',    474, NULL, 'Visit fee unpaid: {ref}', 'office'),
  ('fee_unpaid_office.body',     475, NULL, '{pro} says the visit fee of {amount} was not paid. See Visit fees in the admin panel.', 'office'),
  ('fee_disputed_office.title',  476, NULL, 'Visit fee questioned: {ref}', 'office'),
  ('fee_disputed_office.body',   477, NULL, 'Open Visit fees in the admin panel to decide.', 'office'),
  ('fee_disputed_pro.title',     478, NULL, 'The visit fee on {ref} is with the office', 'technician'),
  ('fee_disputed_pro.body',      479, NULL, 'The customer asked Pechkas to look at it. You will be told what it decides.', 'technician'),
  ('fee_waived.title',           480, NULL, 'No visit fee for job {ref}', 'customer'),
  ('fee_waived.body',            481, NULL, 'Pechkas has waived it. Open the job to read why.', 'customer'),
  ('fee_waived_pro.title',       482, NULL, 'The visit fee on {ref} was waived', 'technician'),
  ('fee_waived_pro.body',        483, NULL, 'Pechkas decided no fee is owed. Open the app to read why.', 'technician'),
  ('fee_refund.title',           484, NULL, 'Give back the visit fee on {ref}', 'technician'),
  ('fee_refund.body',            485, NULL, 'Pechkas waived the fee of {amount}. Please return it to the customer, then tell the office.', 'technician'),
  ('fee_refund_charged.title',   486, NULL, 'Visit fee on {ref} added to what you owe', 'technician'),
  ('fee_refund_charged.body',    487, NULL, 'Pechkas paid the customer back {amount}, and it is added to what you owe Pechkas.', 'technician'),
  ('fee_kept.title',             488, NULL, 'The visit fee on {ref} stands', 'customer'),
  ('fee_kept.body',              489, NULL, 'Pechkas looked, and the fee of {amount} stands. Open the job to read why.', 'customer'),
  ('fee_covered.title',          490, NULL, 'Pechkas paid your visit fee: {ref}', 'technician'),
  ('fee_covered.body',           491, NULL, '{amount} has been taken off what you owe Pechkas.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 460 AND 491 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-visit-fee-clock', '* * * * *', 'SELECT public.visit_fee_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.fix_visit_fee(), public.record_visit_fee(), public.visit_fee_view(uuid, text),
  public.fee_vars(public.visit_fees), public.no_post_while_fee_unpaid(), public.visit_fee_clock()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.ask_change(uuid, bigint, text, text),
  public.decide_change(uuid, boolean),
  public.admin_decide_change(uuid, boolean, text),
  public.pro_reports_no(uuid),
  public.pro_visit_fee(uuid, boolean),
  public.customer_visit_fee(uuid, text, text),
  public.admin_visit_fee(uuid, text, text),
  public.admin_visit_fees(),
  public.pro_visit_fees(),
  public.admin_decide_dispute(uuid, text, text),
  public.my_jobs(),
  public.pro_my_jobs(),
  public.pro_finished(),
  public.pro_feed()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261110000000_visit_fee')
ON CONFLICT (name) DO NOTHING;

COMMIT;
