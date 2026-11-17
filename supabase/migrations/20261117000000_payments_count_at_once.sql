-- =============================================================================
--  A technician's payment counts at once (the owner's decision A5, 17 November 2026)
-- =============================================================================
--
--  Until now a technician's "I have paid" counted for nothing until the office
--  pressed Confirm, so the office stood in the middle of every payment and of
--  every new technician's approval (a trial job counts only once its
--  commission is paid). The owner's rule replaces that:
--
--   - "I have paid" counts AT ONCE: the same ledger line the office's Confirm
--     wrote, so the due dates and the Rs 3,000 limit see it immediately.
--   - Each transaction number can be used ONCE, spaces and capitals ignored.
--     Nothing in the app or its wording calls a payment "verified".
--   - For counting first (trial) jobs a payment is FINAL after 3 calendar
--     days (claim_final_days). No holiday list: JazzCash and Easypaisa work
--     every day.
--   - For 30 days (claim_correct_days) the office may press "Not received" or
--     "Received less: Rs ___". The payment's line is reversed and, for less,
--     a new line records what did arrive. The ledger knows a line as live or
--     reversed, never half reversed, so this is how "only the missing
--     amount" goes back: what he owes rises by exactly that. A flag every
--     time. A trial job that counted on that money goes back to waiting, and
--     a trade it approved goes back to trial; once he pays the missing amount
--     and that payment is final, the job counts again by itself.
--   - A SECOND shortfall within 90 days (claim_strike_days) pauses his new
--     offers by rule (pay_pauses), with no end date: jobs he has go on, he
--     appeals in writing, and the office lifts the pause or keeps it, in
--     writing. An appeal unanswered for 3 days (pay_appeal_remind_days) is
--     shown as a reminder under Exceptions.
--   - No office notice per payment. The Money page keeps "Payments to check"
--     (oldest first, with the days left of the 30), and the office is told at
--     most once a day how many there are.
--   - Payments already waiting when this runs stay under the old rule: the
--     office confirms them or turns them down, exactly as before.
--   - Built so a payment company's own confirmation can plug in later:
--     payment_provider_result() is granted to service_role only, and nothing
--     calls it yet.
--
--  The three numbers are locked: the technician agreement states them.
--  Part of edition 8: run this with the two first-jobs files, then one build.
--  Safe to run twice.

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('claim_final_days', 3, 'days', 'Days after a technician''s "I have paid" before it is final for counting first jobs (A5). Locked: the technician agreement states it.'),
  ('claim_correct_days', 30, 'days', 'Days the office may mark a technician''s payment "Not received" or "Received less" (A5). Locked.'),
  ('claim_strike_days', 90, 'days', 'A second payment not received in full within this many days pauses his new offers (A5). Locked.'),
  ('pay_appeal_remind_days', 3, 'days', 'An appeal against a payment pause unanswered this long is shown as a reminder under Exceptions (A5). Locked.')
ON CONFLICT (key) DO NOTHING;
-- Locked means no range for the office.
DELETE FROM public.setting_limits WHERE key IN ('claim_final_days', 'claim_correct_days', 'claim_strike_days', 'pay_appeal_remind_days');


-- --- A payment, as it is now ------------------------------------------------------------------------

ALTER TABLE public.payment_claims DROP CONSTRAINT IF EXISTS payment_claims_status_check;
ALTER TABLE public.payment_claims ADD CONSTRAINT payment_claims_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'counted', 'not_received', 'received_less'));
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS ref_key         text;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS final_at        timestamptz;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS correct_until   timestamptz;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS checked_by      text NOT NULL DEFAULT 'nobody';
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS provider_ref    text;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS arrived_at      timestamptz;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS arrived_by      text;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS received_paisa  bigint;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS received_txn    uuid;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS corrected_at    timestamptz;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS corrected_by    text;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS correction_note text;
ALTER TABLE public.payment_claims DROP CONSTRAINT IF EXISTS payment_claims_checked_by_check;
ALTER TABLE public.payment_claims ADD CONSTRAINT payment_claims_checked_by_check CHECK (checked_by IN ('nobody', 'provider'));
-- Each transaction number once, ever. Claims from before this rule have no key, so this step cannot fail on old data.
CREATE UNIQUE INDEX IF NOT EXISTS payment_claims_ref_once ON public.payment_claims (ref_key) WHERE ref_key IS NOT NULL;

/** A transaction number as it is compared: letters and digits only, in capitals. "tx 12-34" is "TX1234". */
CREATE OR REPLACE FUNCTION public.tx_key(p_ref text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

/** Is this credit final? Only a technician's own "I have paid" waits, for claim_final_days. */
CREATE OR REPLACE FUNCTION public.credit_final(p_txn uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.payment_claims c WHERE c.txn_id = p_txn AND c.status = 'counted' AND c.final_at > now());
$$;

/** Is this fee paid in full by money that is final? What a trial job waits for. */
CREATE OR REPLACE FUNCTION public.fee_paid_final(p_pro uuid, p_txn uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH fee AS (SELECT i.amount FROM public.pay_items(p_pro) i WHERE i.txn = p_txn AND i.side = 'fee' AND i.live)
  SELECT coalesce((SELECT amount FROM fee), 0) > 0
     AND coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a
                   WHERE a.pro_id = p_pro AND a.debit_txn = p_txn AND public.credit_final(a.credit_txn)), 0)
         >= (SELECT amount FROM fee);
$$;


-- --- "I have paid": it counts now ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_payment(p_amount_paisa bigint, p_method text, p_reference text, p_screenshot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_ref  text := nullif(btrim(coalesce(p_reference, '')), '');
  v_key  text := public.tx_key(p_reference);
  v_owed bigint;
  v_id   uuid;
  v_txn  uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN public.refuse('Only a technician can tell Pechkas he has paid.');
  END IF;
  -- One at a time per technician, so two taps on bad signal send one payment;
  -- one at a time per transaction number, so two people cannot both use it.
  PERFORM pg_advisory_xact_lock(hashtext('claim:' || v_me::text));
  IF length(v_key) >= 3 THEN
    PERFORM pg_advisory_xact_lock(hashtext('txref:' || v_key));
  END IF;
  PERFORM public.pay_lock(v_me);
  -- A payment sent before A5 is still with the office, under the old rule.
  IF EXISTS (SELECT 1 FROM public.payment_claims WHERE pro_id = v_me AND status = 'pending') THEN
    RETURN public.refuse('The office is still checking a payment you sent earlier. Wait for it first.', 'claim');
  END IF;
  v_owed := public.pro_owed(v_me);
  IF v_owed <= 0 THEN
    RETURN public.refuse('You owe Pechkas nothing at the moment.', 'amount');
  END IF;
  IF p_amount_paisa IS NULL OR p_amount_paisa <= 0 OR p_amount_paisa % 100 <> 0 THEN
    RETURN public.refuse('Write the amount you sent, in whole rupees.', 'amount');
  END IF;
  IF p_amount_paisa > v_owed THEN
    RETURN public.refuse('That is more than you owe (' || public.rs(v_owed) || '). Check the amount.', 'amount');
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('jazzcash', 'easypaisa', 'bank') THEN
    RETURN public.refuse('Choose how you paid.', 'method');
  END IF;
  IF v_ref IS NULL OR length(v_ref) > 80 OR length(v_key) < 3 THEN
    RETURN public.refuse('Write the transaction number from the payment message.', 'reference');
  END IF;
  IF public.looks_like_cnic(v_ref) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'reference');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_claims WHERE ref_key = v_key) THEN
    RETURN public.refuse('This transaction number has already been used.', 'reference');
  END IF;
  IF p_screenshot IS NULL
     OR p_screenshot !~ ('^' || v_me::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'job-media' AND o.name = p_screenshot) THEN
    RETURN public.refuse('Add a screenshot of the payment.', 'screenshot');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_claims WHERE screenshot_path = p_screenshot)
     OR EXISTS (SELECT 1 FROM public.job_media WHERE path = p_screenshot)
     OR EXISTS (SELECT 1 FROM public.job_photos WHERE path = p_screenshot) THEN
    RETURN public.refuse('That picture has been used before. Add the screenshot of this payment.', 'screenshot');
  END IF;

  INSERT INTO public.payment_claims (pro_id, amount_paisa, method, reference, screenshot_path, status, ref_key, final_at, correct_until)
  VALUES (v_me, p_amount_paisa, p_method, v_ref, p_screenshot, 'counted', v_key,
          now() + make_interval(days => public.setting('claim_final_days')::integer),
          now() + make_interval(days => public.setting('claim_correct_days')::integer))
  RETURNING id INTO v_id;
  -- The same line the office's Confirm writes: due dates and the limit see it at once.
  v_txn := public.post_txn('settle:claim:' || v_id::text, 'settlement', NULL, v_me, jsonb_build_array(
    jsonb_build_object('account', 'received', 'amount', p_amount_paisa),
    jsonb_build_object('account', 'pro_owes', 'pro_id', v_me, 'amount', -p_amount_paisa)
  ), p_method, v_ref);
  UPDATE public.payment_claims SET txn_id = v_txn WHERE id = v_id;
  -- No notice to the office: it is on "Payments to check", and the office hears once a day at most.
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'owed_paisa', public.pro_owed(v_me),
                            'final_at', now() + make_interval(days => public.setting('claim_final_days')::integer),
                            'correct_until', now() + make_interval(days => public.setting('claim_correct_days')::integer));
END;
$$;

/** His payments, newest first: what counts, what is final, and what the office corrected (with its note, read only here). */
CREATE OR REPLACE FUNCTION public.pay_claims_view(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY c ->> 'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', x.id, 'amount_paisa', x.amount_paisa, 'method', x.method, 'reference', x.reference,
      'status', x.status, 'reason', x.reason, 'created_at', x.created_at, 'decided_at', x.decided_at,
      'final_at', x.final_at, 'final', x.status = 'counted' AND x.final_at <= now(),
      'correct_until', x.correct_until, 'received_paisa', x.received_paisa,
      'missing_paisa', CASE WHEN x.status IN ('not_received', 'received_less') THEN x.amount_paisa - coalesce(x.received_paisa, 0) END,
      'corrected_at', x.corrected_at, 'note', x.correction_note) AS c
    FROM public.payment_claims x
    WHERE x.pro_id = p_pro
      AND (x.created_at > now() - make_interval(days => public.setting('claim_correct_days')::integer)
           OR x.corrected_at > now() - make_interval(days => public.setting('claim_strike_days')::integer)
           OR x.status = 'pending')
    ORDER BY x.created_at DESC
    LIMIT 20) s;
$$;

/** The list his app already reads, now with what counts, what is final and what was corrected. */
CREATE OR REPLACE FUNCTION public.my_payment_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pay_claims_view(auth.uid());
$$;


-- --- A pause by rule: two payments not received in full within 90 days ---------------------------------

CREATE TABLE IF NOT EXISTS public.pay_pauses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id        uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  strike_claims uuid[] NOT NULL,
  lifted_at     timestamptz,
  lifted_by     text,
  lift_note     text CHECK (lift_note IS NULL OR length(lift_note) BETWEEN 5 AND 300)
);
ALTER TABLE public.pay_pauses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_pauses FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS pay_pauses_one_active ON public.pay_pauses (pro_id) WHERE lifted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pay_pause_appeals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pause_id    uuid NOT NULL REFERENCES public.pay_pauses(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  words       text NOT NULL CHECK (length(words) BETWEEN 10 AND 500),
  at          timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'kept', 'lifted')),
  note        text CHECK (note IS NULL OR length(note) BETWEEN 5 AND 300),
  answered_at timestamptz,
  answered_by text
);
ALTER TABLE public.pay_pause_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_pause_appeals FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS pay_pause_appeals_one_waiting ON public.pay_pause_appeals (pause_id) WHERE status = 'waiting';

CREATE OR REPLACE FUNCTION public.pay_paused(p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.pay_pauses p WHERE p.pro_id = p_pro AND p.lifted_at IS NULL);
$$;

/**
 * Paused, by the office for a few days (D11) or by rule for payments (A5).
 * Every door that already asks this (the feed, notifications, "ask again",
 * picking a checker) now stops both. pro_pause_until() stays the office's
 * pause alone: it is the one with a date.
 */
CREATE OR REPLACE FUNCTION public.pro_paused(p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pro_pause_until(p_pro) IS NOT NULL OR public.pay_paused(p_pro);
$$;

/** The pause as he and the office read it: since when, the two payments, his appeal and its answer. */
CREATE OR REPLACE FUNCTION public.pay_pause_view(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'since', p.started_at,
    'strikes', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'created_at', c.created_at, 'corrected_at', c.corrected_at, 'method', c.method,
                           'reference', c.reference, 'amount_paisa', c.amount_paisa,
                           'received_paisa', coalesce(c.received_paisa, 0)) ORDER BY c.created_at)
                         FROM public.payment_claims c WHERE c.id = ANY (p.strike_claims)), '[]'::jsonb),
    'appeal', (SELECT jsonb_build_object('id', a.id, 'words', a.words, 'at', a.at, 'status', a.status,
                                         'note', a.note, 'answered_at', a.answered_at)
               FROM public.pay_pause_appeals a WHERE a.pause_id = p.id ORDER BY a.at DESC LIMIT 1),
    'can_appeal', NOT EXISTS (SELECT 1 FROM public.pay_pause_appeals a WHERE a.pause_id = p.id AND a.status = 'waiting'),
    'strike_days', public.setting('claim_strike_days'))
  FROM public.pay_pauses p WHERE p.pro_id = p_pro AND p.lifted_at IS NULL;
$$;

/** He writes to Pechkas about the pause. One waiting at a time; after a "keep" he may write again. */
CREATE OR REPLACE FUNCTION public.pro_pay_appeal(p_words text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p     public.pay_pauses;
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
BEGIN
  SELECT * INTO v_p FROM public.pay_pauses WHERE pro_id = auth.uid() AND lifted_at IS NULL FOR UPDATE;
  IF v_p.id IS NULL THEN
    RETURN public.refuse('Your offers are not paused for a payment.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pay_pause_appeals a WHERE a.pause_id = v_p.id AND a.status = 'waiting') THEN
    RETURN public.refuse('Pechkas has your appeal. You will be answered here in the app.');
  END IF;
  IF v_words IS NULL OR length(v_words) < 10 OR length(v_words) > 500 THEN
    RETURN public.refuse('Write why the pause is wrong, in a sentence or more.', 'words');
  END IF;
  IF public.looks_like_cnic(v_words) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'words');
  END IF;
  INSERT INTO public.pay_pause_appeals (pause_id, pro_id, words) VALUES (v_p.id, auth.uid(), v_words);
  PERFORM public.tell_office('pay_appeal_office', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The office lifts the pause (with or without an appeal), or answers an appeal by keeping it. In writing, always. */
CREATE OR REPLACE FUNCTION public.admin_pay_pause(p_pause uuid, p_lift boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p    public.pay_pauses;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write the reason, in a sentence. He reads it in the app.', 'note');
  END IF;
  SELECT * INTO v_p FROM public.pay_pauses WHERE id = p_pause FOR UPDATE;
  IF v_p.id IS NULL OR v_p.lifted_at IS NOT NULL THEN
    RETURN public.refuse('This pause has already been lifted.');
  END IF;
  v_name := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());
  IF coalesce(p_lift, false) THEN
    UPDATE public.pay_pauses SET lifted_at = now(), lifted_by = v_name, lift_note = v_note WHERE id = v_p.id;
    UPDATE public.pay_pause_appeals SET status = 'lifted', note = v_note, answered_at = now(), answered_by = v_name
    WHERE pause_id = v_p.id AND status = 'waiting';
    PERFORM public.tell(v_p.pro_id, 'pay_pause_lifted', NULL, '/pro', '{}'::jsonb);
  ELSE
    UPDATE public.pay_pause_appeals SET status = 'kept', note = v_note, answered_at = now(), answered_by = v_name
    WHERE pause_id = v_p.id AND status = 'waiting';
    IF NOT FOUND THEN
      RETURN public.refuse('He has not written yet. You can lift the pause, or wait for his appeal.');
    END IF;
    PERFORM public.tell(v_p.pro_id, 'pause_appeal_decided', NULL, '/pro/money', '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The office's correction: "Not received" or "Received less" ----------------------------------------

/**
 * A trial job that counted on money that is no longer there goes back to
 * waiting, and a trade it approved goes back to trial, the same way a covered
 * guarantee claim does. Once the missing amount is paid and final, the clock
 * counts the job again.
 */
CREATE OR REPLACE FUNCTION public.trial_after_shortfall(p_pro uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.trial_jobs;
  v_txn uuid;
  v_n   integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM public.trial_jobs WHERE pro_id = p_pro AND status = 'good' ORDER BY created_at FOR UPDATE LOOP
    SELECT t.id INTO v_txn FROM public.ledger_txns t WHERE t.idempotency_key = 'commission:' || v_row.job_id;
    IF v_txn IS NOT NULL AND NOT public.fee_paid_final(p_pro, v_txn) THEN
      PERFORM public.trial_set(v_row.job_id, p_pro, 'waiting', NULL);
      UPDATE public.pro_trades SET status = 'trial', approved_at = NULL, approved_by = NULL,
             note = 'Back on trial: the payment for a first job did not arrive in full.', since = now()
      WHERE pro_id = p_pro AND trade = v_row.trade AND status = 'approved' AND approved_by = 'trial'
        AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = v_row.trade AND x.status = 'good')
            < public.setting('trial_jobs');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * "Not received" (p_received_paisa 0) or "Received less: Rs ___", within
 * claim_correct_days of the payment. The payment's line is reversed and, when
 * something did arrive, a new line records it: what he owes rises by exactly
 * the missing amount, and nothing is edited. A flag every time; a second
 * within claim_strike_days pauses his new offers by rule.
 */
CREATE OR REPLACE FUNCTION public.admin_claim_correct(p_claim uuid, p_received_paisa bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c       public.payment_claims;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_name    text;
  v_lines   jsonb;
  v_rcv_txn uuid;
  v_strikes uuid[];
  v_paused  boolean := false;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 3 OR length(v_note) > 200 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what you found, in a few words. He reads it in the app.', 'note');
  END IF;
  SELECT * INTO v_c FROM public.payment_claims WHERE id = p_claim FOR UPDATE;
  IF v_c.id IS NULL THEN
    RETURN public.refuse('That payment is not on the list.');
  END IF;
  PERFORM public.pay_lock(v_c.pro_id);
  IF v_c.status <> 'counted' THEN
    RETURN public.refuse(CASE WHEN v_c.status IN ('not_received', 'received_less') THEN 'That payment has already been corrected.'
                              ELSE 'This payment is under the old rule: confirm it or turn it down.' END);
  END IF;
  IF v_c.correct_until IS NULL OR now() > v_c.correct_until THEN
    RETURN public.refuse('More than ' || public.setting('claim_correct_days') || ' days have passed: this payment can no longer be corrected.');
  END IF;
  IF p_received_paisa IS NULL OR p_received_paisa < 0 OR p_received_paisa % 100 <> 0 THEN
    RETURN public.refuse('Write what arrived, in whole rupees.', 'received');
  END IF;
  IF p_received_paisa >= v_c.amount_paisa THEN
    RETURN public.refuse('That is the whole amount: there is nothing to correct.', 'received');
  END IF;
  v_name := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());

  -- Reverse the payment's line in full ...
  SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
  INTO v_lines FROM public.ledger_entries e WHERE e.txn_id = v_c.txn_id;
  PERFORM public.post_txn('reverse:' || v_c.txn_id, 'reversal', NULL, v_c.pro_id, v_lines, NULL, NULL,
                          CASE WHEN p_received_paisa = 0 THEN 'Not received: ' ELSE 'Received less: ' END || v_note, v_c.txn_id);
  -- ... and record what did arrive, which is final: the office saw it.
  IF p_received_paisa > 0 THEN
    v_rcv_txn := public.post_txn('settle:claim:' || v_c.id::text || ':received', 'settlement', NULL, v_c.pro_id, jsonb_build_array(
      jsonb_build_object('account', 'received', 'amount', p_received_paisa),
      jsonb_build_object('account', 'pro_owes', 'pro_id', v_c.pro_id, 'amount', -p_received_paisa)
    ), v_c.method, v_c.reference, 'Received less: ' || v_note);
  END IF;
  UPDATE public.payment_claims
  SET status = CASE WHEN p_received_paisa = 0 THEN 'not_received' ELSE 'received_less' END,
      received_paisa = p_received_paisa, received_txn = v_rcv_txn,
      corrected_at = now(), corrected_by = v_name, correction_note = v_note
  WHERE id = v_c.id;

  PERFORM public.trial_after_shortfall(v_c.pro_id);

  -- The second within claim_strike_days pauses his new offers by rule.
  SELECT array_agg(x.id ORDER BY x.corrected_at) INTO v_strikes FROM public.payment_claims x
  WHERE x.pro_id = v_c.pro_id AND x.status IN ('not_received', 'received_less')
    AND x.corrected_at > now() - make_interval(days => public.setting('claim_strike_days')::integer);
  IF cardinality(v_strikes) >= 2 AND NOT public.pay_paused(v_c.pro_id) THEN
    INSERT INTO public.pay_pauses (pro_id, strike_claims) VALUES (v_c.pro_id, v_strikes);
    -- His waiting offers go: customers should not choose a man who cannot take new work.
    UPDATE public.offers SET status = 'withdrawn', updated_at = now() WHERE pro_id = v_c.pro_id AND status = 'pending';
    PERFORM public.tell(v_c.pro_id, 'pay_paused', NULL, '/pro/money', '{}'::jsonb);
    v_paused := true;
  ELSE
    PERFORM public.tell(v_c.pro_id, 'pay_short', NULL, '/pro/money', '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'paused', v_paused, 'owed_paisa', public.pro_owed(v_c.pro_id));
END;
$$;

/** The office has seen the money: off "Payments to check". It can still be corrected within the 30 days. */
CREATE OR REPLACE FUNCTION public.admin_claim_arrived(p_claim uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.payment_claims;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_c FROM public.payment_claims WHERE id = p_claim FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status <> 'counted' THEN
    RETURN public.refuse('That payment is not waiting to be checked.');
  END IF;
  IF v_c.arrived_at IS NULL THEN
    UPDATE public.payment_claims SET arrived_at = now(), arrived_by = (SELECT s.name FROM public.staff s WHERE s.id = auth.uid())
    WHERE id = v_c.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** "Payments to check", oldest first, with the days left of the 30; then the ones already marked as arrived. */
CREATE OR REPLACE FUNCTION public.admin_payments_to_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'correct_days', public.setting('claim_correct_days'),
    'final_days', public.setting('claim_final_days'),
    'to_check', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', x.id, 'pro_id', x.pro_id, 'pro_name', r.full_name, 'amount_paisa', x.amount_paisa,
          'method', x.method, 'reference', x.reference, 'screenshot_path', x.screenshot_path,
          'created_at', x.created_at, 'final', x.final_at <= now(), 'correct_until', x.correct_until,
          'days_left', greatest(ceil(extract(epoch FROM x.correct_until - now()) / 86400), 0)::integer,
          'owed_paisa', public.pro_owed(x.pro_id)) ORDER BY x.created_at)
      FROM public.payment_claims x JOIN public.pros r ON r.id = x.pro_id
      WHERE x.status = 'counted' AND x.arrived_at IS NULL AND x.correct_until > now()), '[]'::jsonb),
    'arrived', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', x.id, 'pro_id', x.pro_id, 'pro_name', r.full_name, 'amount_paisa', x.amount_paisa,
          'method', x.method, 'reference', x.reference, 'screenshot_path', x.screenshot_path,
          'created_at', x.created_at, 'arrived_at', x.arrived_at, 'arrived_by', x.arrived_by, 'correct_until', x.correct_until,
          'days_left', greatest(ceil(extract(epoch FROM x.correct_until - now()) / 86400), 0)::integer) ORDER BY x.created_at DESC)
      FROM public.payment_claims x JOIN public.pros r ON r.id = x.pro_id
      WHERE x.status = 'counted' AND x.arrived_at IS NOT NULL AND x.correct_until > now()), '[]'::jsonb),
    'corrected', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', x.id, 'pro_name', r.full_name, 'amount_paisa', x.amount_paisa, 'received_paisa', x.received_paisa,
          'method', x.method, 'reference', x.reference, 'status', x.status, 'note', x.correction_note,
          'corrected_at', x.corrected_at, 'corrected_by', x.corrected_by) ORDER BY x.corrected_at DESC)
      FROM public.payment_claims x JOIN public.pros r ON r.id = x.pro_id
      WHERE x.status IN ('not_received', 'received_less')
        AND x.corrected_at > now() - make_interval(days => public.setting('claim_strike_days')::integer)), '[]'::jsonb)
  ) END;
$$;


-- --- At most one notice a day: "N payments to check" ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.office_daily_notices (
  kind text NOT NULL,
  day  date NOT NULL,
  n    integer NOT NULL,
  at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, day)
);
ALTER TABLE public.office_daily_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.office_daily_notices FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.payments_to_check_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*)::integer INTO v_n FROM public.payment_claims x
  WHERE x.status = 'counted' AND x.arrived_at IS NULL AND x.correct_until > now();
  IF v_n = 0 THEN
    RETURN 0;
  END IF;
  INSERT INTO public.office_daily_notices (kind, day, n) VALUES ('payments_to_check', public.pk_day(now()), v_n)
  ON CONFLICT (kind, day) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM public.tell_office('payments_to_check', NULL,
    jsonb_build_object('what', v_n || CASE WHEN v_n = 1 THEN ' payment' ELSE ' payments' END));
  RETURN 1;
END;
$$;


-- --- Ready for a payment company: its answer makes a payment final at once -----------------------------

/**
 * For later (Option 2). A payment company's server, holding the service-role
 * key, may say a transaction arrived. Nothing calls this yet, and it is
 * granted to nobody else. It only makes a matching payment final sooner; it
 * never creates a payment and never changes an amount.
 */
CREATE OR REPLACE FUNCTION public.payment_provider_result(p_reference text, p_amount_paisa bigint, p_provider_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c   public.payment_claims;
  v_ref text := nullif(btrim(coalesce(p_provider_ref, '')), '');
BEGIN
  IF v_ref IS NULL OR length(v_ref) > 80 OR public.looks_like_cnic(v_ref) THEN
    RETURN public.refuse('A reference from the payment company is needed.');
  END IF;
  SELECT * INTO v_c FROM public.payment_claims WHERE ref_key = public.tx_key(p_reference) FOR UPDATE;
  IF v_c.id IS NULL THEN
    RETURN public.refuse('No payment has that transaction number.');
  END IF;
  IF v_c.status <> 'counted' THEN
    RETURN public.refuse('That payment has been corrected by the office.');
  END IF;
  IF p_amount_paisa IS DISTINCT FROM v_c.amount_paisa THEN
    RETURN public.refuse('The amount does not match.', 'amount');
  END IF;
  UPDATE public.payment_claims SET checked_by = 'provider', provider_ref = v_ref, final_at = least(final_at, now())
  WHERE id = v_c.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The functions that change with this ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trial_review(p_job uuid, p_pro uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.trial_jobs;
  v_job public.jobs;
  v_txn uuid;
  v_why text;
BEGIN
  SELECT * INTO v_row FROM public.trial_jobs WHERE job_id = p_job AND pro_id = p_pro FOR UPDATE;
  IF v_row.status IS NULL OR v_row.status NOT IN ('waiting', 'good') THEN
    RETURN v_row.status;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;

  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND public.claim_covered(c.status)) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'claim');
    IF v_row.status = 'good' THEN
      UPDATE public.pro_trades SET status = 'trial', approved_at = NULL, approved_by = NULL,
             note = 'Back on trial: a guarantee claim on a first job.', since = now()
      WHERE pro_id = p_pro AND trade = v_row.trade AND status = 'approved' AND approved_by = 'trial'
        AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = v_row.trade AND x.status = 'good')
            < public.setting('trial_jobs');
    END IF;
    RETURN 'not_counted';
  END IF;
  IF v_row.status = 'good' THEN
    RETURN 'good';
  END IF;

  IF v_job.paid_by_pechkas THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  IF v_row.answered_at IS NULL THEN
    IF v_job.finished_at < now() - interval '2 days' THEN
      PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_answers');
      RETURN 'not_counted';
    END IF;
    RETURN 'waiting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'before')
     OR NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'after') THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'photos');
    RETURN 'not_counted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cases x WHERE x.job_id = p_job) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'payment_case');
    RETURN 'not_counted';
  END IF;
  -- A claim still being decided: wait for it.
  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND c.status <> 'not_covered') THEN
    RETURN 'waiting';
  END IF;
  -- Real payment: the commission on it is posted, not reversed, and paid.
  SELECT t.id INTO v_txn FROM public.ledger_txns t WHERE t.idempotency_key = 'commission:' || p_job;
  IF v_txn IS NULL OR EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = v_txn) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  -- A5: paid, and by money that is final. His own "I have paid" is final after claim_final_days.
  IF NOT public.fee_paid_final(p_pro, v_txn) THEN
    RETURN 'waiting';
  END IF;
  -- The distance between homes is the owner's number: until it is set, nothing counts.
  IF public.setting('trial_customer_gap_m') = 0 THEN
    RETURN 'waiting';
  END IF;
  v_why := public.trial_customer_why(p_job, p_pro);
  IF v_why IS NOT NULL THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', v_why);
    RETURN 'not_counted';
  END IF;
  PERFORM public.trial_set(p_job, p_pro, 'good', NULL);
  PERFORM public.promote_trade(p_pro, v_row.trade);
  RETURN 'good';
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_state(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH f AS (SELECT * FROM public.pay_fees(p_pro)),
  c AS (SELECT * FROM public.payment_claims WHERE pro_id = p_pro AND status = 'pending' LIMIT 1),
  cr AS (
    SELECT coalesce(sum(i.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a
                                             WHERE a.credit_txn = i.txn AND a.pro_id = p_pro), 0)), 0) AS free
    FROM public.pay_items(p_pro) i WHERE i.side = 'credit' AND i.live
  )
  SELECT jsonb_build_object(
    'owed_paisa', public.pro_owed(p_pro),
    'credit_paisa', (SELECT free FROM cr),
    'overdue_paisa', coalesce((SELECT sum(f.unpaid - f.protected) FROM f WHERE f.status = 'stopped'), 0),
    'in_grace_paisa', coalesce((SELECT sum(f.unpaid - f.protected) FROM f WHERE f.status IN ('due', 'grace')), 0),
    'blocked', EXISTS (SELECT 1 FROM f WHERE f.status = 'stopped'),
    'blocked_since', (SELECT min(f.stop_at) FROM f WHERE f.status = 'stopped'),
    'next_due', (SELECT min(f.due_day) FROM f WHERE f.status IN ('not_due', 'due')),
    'due_days', public.setting('pay_due_days'),
    'grace_days', public.setting('pay_grace_days'),
    'claim', (SELECT jsonb_build_object('id', c.id, 'amount_paisa', c.amount_paisa, 'method', c.method, 'created_at', c.created_at,
                                        'business_days', public.business_days_between(public.pk_day(c.created_at), public.pk_day(now())),
                                        'needs_attention', c.needs_attention_at IS NOT NULL) FROM c),
    -- A5: his payments (what counts, what is final, what was corrected) and a pause by rule.
    'claims', public.pay_claims_view(p_pro),
    'pay_pause', public.pay_pause_view(p_pro),
    'final_days', public.setting('claim_final_days'),
    'correct_days', public.setting('claim_correct_days'),
    'strike_days', public.setting('claim_strike_days'),
    'extension', (SELECT jsonb_build_object('id', e.id, 'granted_at', e.granted_at, 'days', e.days, 'until_day', e.until_day,
                                            'reason', e.reason, 'by', e.by_name)
                  FROM public.pay_extensions e WHERE e.pro_id = p_pro ORDER BY e.granted_at DESC LIMIT 1),
    'can_extend', EXISTS (SELECT 1 FROM f WHERE f.status = 'stopped' AND f.extension_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM f WHERE f.extension_id IS NOT NULL AND f.unpaid > 0),
    'fees', coalesce((SELECT jsonb_agg(jsonb_build_object(
                        'txn', f.txn, 'kind', f.kind, 'ref', f.ref, 'posted_at', f.posted_at, 'amount_paisa', f.amount,
                        'paid_paisa', f.paid, 'unpaid_paisa', f.unpaid, 'protected_paisa', f.protected,
                        'due_day', f.due_day, 'last_grace_day', f.last_grace_day, 'stop_at', f.stop_at,
                        'extended_to', f.extended_to, 'status', f.status) ORDER BY f.posted_at DESC)
                      FROM f WHERE f.unpaid > 0 OR f.posted_at > now() - interval '30 days'), '[]'::jsonb)
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
  v_gate   text;
  v_cap    text;
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
  -- D37: the price cap on his first jobs.
  v_cap := public.trial_cap_why(auth.uid(), v_job.trade, p_price_paisa);
  IF v_cap IS NOT NULL THEN
    RETURN public.refuse(v_cap, 'price');
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
  -- The office's own pause (A5's pause by rule has no date and is lifted from Exceptions).
  IF public.pro_pause_until(p_pro) IS NOT NULL THEN
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
  IF public.pro_pause_until(p_pro) IS NULL THEN
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

CREATE OR REPLACE FUNCTION public.admin_exceptions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'is_owner', public.is_owner(),
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'kind', s.kind, 'pro_id', s.pro_id, 'pro', r.full_name, 'trade', s.trade,
          'trade_name', (SELECT t.name FROM public.trades t WHERE t.slug = s.trade),
          'ref', j.ref, 'job_id', j.id, 'job_status', j.status, 'from_side', CASE WHEN s.from_id = j.customer_id THEN 'customer' ELSE 'checker' END,
          'from', (SELECT p.first_name FROM public.profiles p WHERE p.id = s.from_id),
          'words', s.words, 'photo', s.photo, 'at', s.at, 'his_side', s.his_side, 'his_side_at', s.his_side_at,
          'his_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', x.ref, 'trade', x.trade, 'stage', x.stage, 'when_date', x.when_date))
                                FROM public.jobs x WHERE x.pro_id = s.pro_id AND x.status = 'assigned'), '[]'::jsonb))
        ORDER BY s.at)
      FROM public.safety_reports s JOIN public.pros r ON r.id = s.pro_id LEFT JOIN public.jobs j ON j.id = s.job_id
      WHERE s.status = 'open'), '[]'::jsonb),
    'appeals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'pro_id', a.pro_id, 'pro', r.full_name, 'trade', a.trade,
          'trade_name', (SELECT t.name FROM public.trades t WHERE t.slug = a.trade),
          'reason', a.reason, 'paused_at', a.paused_at, 'words', a.words, 'at', a.at,
          'first_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'status', x.status, 'why', x.why, 'works_no', x.works_no,
                                                                      'on_time', x.on_time, 'explained', x.explained, 'clean', x.clean)
                                                   ORDER BY x.created_at)
                                  FROM public.trial_jobs x JOIN public.jobs j ON j.id = x.job_id
                                  WHERE x.pro_id = a.pro_id AND x.trade = a.trade), '[]'::jsonb))
        ORDER BY a.at)
      FROM public.trade_appeals a JOIN public.pros r ON r.id = a.pro_id
      WHERE a.status = 'waiting'), '[]'::jsonb),
    -- A5: pauses by rule for payments, with his appeal; one unanswered for pay_appeal_remind_days is a reminder.
    'remind_days', public.setting('pay_appeal_remind_days'),
    'pay_pauses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'pro_id', p.pro_id, 'pro', r.full_name, 'since', p.started_at,
          'owed_paisa', public.pro_owed(p.pro_id),
          'view', public.pay_pause_view(p.pro_id),
          'waiting_days', (SELECT floor(extract(epoch FROM now() - a.at) / 86400)::integer
                           FROM public.pay_pause_appeals a WHERE a.pause_id = p.id AND a.status = 'waiting'),
          'remind', EXISTS (SELECT 1 FROM public.pay_pause_appeals a WHERE a.pause_id = p.id AND a.status = 'waiting'
                            AND a.at <= now() - make_interval(days => public.setting('pay_appeal_remind_days')::integer)))
        ORDER BY (SELECT a.at FROM public.pay_pause_appeals a WHERE a.pause_id = p.id AND a.status = 'waiting') NULLS LAST, p.started_at)
      FROM public.pay_pauses p JOIN public.pros r ON r.id = p.pro_id
      WHERE p.lifted_at IS NULL), '[]'::jsonb),
    'face_changes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'pro_id', c.pro_id, 'pro', r.full_name, 'reason', c.reason,
                                          'new_path', c.path, 'old_path', f.path, 'at', c.asked_at) ORDER BY c.asked_at)
      FROM public.face_changes c JOIN public.pros r ON r.id = c.pro_id LEFT JOIN public.pro_faces f ON f.pro_id = c.pro_id
      WHERE c.status = 'waiting'), '[]'::jsonb),
    'need_assessor', coalesce((
      SELECT jsonb_agg(jsonb_build_object('pro_id', t.pro_id, 'pro', r.full_name, 'trade', t.trade, 'trade_name', tr.name,
                                          'sectors', to_jsonb(r.sectors)) ORDER BY tr.sort, r.full_name)
      FROM public.pro_trades t JOIN public.pros r ON r.id = t.pro_id JOIN public.trades tr ON tr.slug = t.trade
      WHERE public.risk_ready(t.pro_id, t.trade)
        AND NOT EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = t.pro_id AND k.trade = t.trade AND k.status IN ('ready', 'asked', 'accepted'))
        AND NOT EXISTS (SELECT 1 FROM public.pro_trades c JOIN public.pros cr ON cr.id = c.pro_id
                        WHERE c.trade = t.trade AND c.status = 'approved' AND c.risky = 'unlocked' AND cr.status = 'approved')), '[]'::jsonb),
    'outside', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'status', k.status, 'pro', r.full_name, 'trade', k.trade, 'assessor', k.checker_name,
                                          'ref', j.ref, 'job_status', j.status, 'stage', j.stage, 'sector', j.sector,
                                          'when_date', j.when_date, 'when_from', j.when_from, 'answer_by', k.answer_by)
                       ORDER BY k.created_at)
      FROM public.risk_checks k JOIN public.pros r ON r.id = k.pro_id LEFT JOIN public.jobs j ON j.id = k.job_id
      WHERE k.kind = 'outside' AND k.status IN ('ready', 'asked', 'accepted')), '[]'::jsonb)
  ) END;
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
      -- A5: his own payments the office marked "Not received" or "Received less".
      (SELECT count(*) FROM public.payment_claims x WHERE x.pro_id = r.id AND x.status IN ('not_received', 'received_less') AND x.corrected_at >= v_since) AS short_payments,
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
         AND c.created_at >= now() - interval '90 days') AS claims90,
      -- D37: a man he passed as a checker turned out bad.
      (SELECT count(*) FROM public.checker_strikes s WHERE s.checker_id = r.id AND s.lifted_at IS NULL) AS checker_strikes
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
        public.flag_if('short_payments', p.short_payments, 1),
        public.flag_if('checker_strike', p.checker_strikes, 1),
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
      (SELECT count(*) FROM public.payment_cases x WHERE x.customer_id = c.id AND x.owed_at >= v_since) AS unpaid_jobs,
      -- D37 (point C): a safety report, or "It works: no", the office found false.
      (SELECT count(*) FROM public.safety_reports x WHERE x.from_id = c.id AND x.status = 'false' AND x.decided_at >= v_since)
      + (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.dispute_outcome = 'done' AND j.disputed_at >= v_since
           AND EXISTS (SELECT 1 FROM public.trial_jobs t WHERE t.job_id = j.id)) AS false_reports
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
        public.flag_if('unpaid_jobs', c.unpaid_jobs, public.setting('flag_unpaid_jobs')),
        public.flag_if('false_reports', c.false_reports, 1)
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


-- --- What he and the office are told ------------------------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('pay_short.title',           617, NULL, 'A payment was not received in full', 'technician'),
  ('pay_short.body',            618, NULL, 'Open My account to see what has changed.', 'technician'),
  ('pay_paused.title',          619, NULL, 'Your new offers are paused', 'technician'),
  ('pay_paused.body',           620, NULL, 'Two payments were not received in full. Open the app to read why and to appeal.', 'technician'),
  ('pay_pause_lifted.title',    621, NULL, 'Your pause has been lifted', 'technician'),
  ('pay_pause_lifted.body',     622, NULL, 'You can make offers again.', 'technician'),
  ('pay_appeal_office.title',   623, NULL, 'A technician has written about a payment pause', 'office'),
  ('pay_appeal_office.body',    624, NULL, 'Open Exceptions in the office panel.', 'office'),
  ('payments_to_check.title',   625, NULL, '{what} to check', 'office'),
  ('payments_to_check.body',    626, NULL, 'Open Money in the office panel.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
-- The Urdu column is unused (English only), but an older file's rule wants it filled for a technician's
-- message when that file is run again; the English stands in, as for every message since D10.
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 617 AND 626 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  -- 05:10 UTC is 10:10 in Islamabad, just after the daily pay reminders.
  PERFORM cron.schedule('pechkas-payments-to-check', '10 5 * * *', 'SELECT public.payments_to_check_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.tx_key(text),
  public.credit_final(uuid),
  public.fee_paid_final(uuid, uuid),
  public.pay_claims_view(uuid),
  public.pay_paused(uuid),
  public.pay_pause_view(uuid),
  public.trial_after_shortfall(uuid),
  public.payments_to_check_clock(),
  public.payment_provider_result(text, bigint, text),
  public.pro_pay_appeal(text),
  public.admin_pay_pause(uuid, boolean, text),
  public.admin_claim_correct(uuid, bigint, text),
  public.admin_claim_arrived(uuid),
  public.admin_payments_to_check()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pro_pay_appeal(text),
  public.admin_pay_pause(uuid, boolean, text),
  public.admin_claim_correct(uuid, bigint, text),
  public.admin_claim_arrived(uuid),
  public.admin_payments_to_check()
TO authenticated;

-- A payment company's answer arrives only through a server function holding the service-role key.
GRANT EXECUTE ON FUNCTION public.payment_provider_result(text, bigint, text) TO service_role;


INSERT INTO public.applied_migrations (name)
VALUES ('20261117000000_payments_count_at_once')
ON CONFLICT (name) DO NOTHING;

COMMIT;
