-- =============================================================================
--  Pay Pechkas: a technician says he has paid; the office confirms it
-- =============================================================================
--
--  Technicians pay what they owe Pechkas OUTSIDE the app — JazzCash,
--  Easypaisa or a bank transfer to the account the office typed in. Until
--  now the office also had to be told some other way, and type the payment
--  in by hand. Now he can say so in the app:
--
--    · claim_payment(): the amount, how he paid, the transaction ID and a
--      screenshot of the payment. One waiting at a time; never more than he
--      owes; the screenshot must be his own upload, really in storage, and
--      used once. The office's phones are told.
--    · The office sees the claims waiting (admin_payment_claims()) with the
--      screenshot, checks its own account, and either confirms — which
--      records the payment through admin_settle(), exactly as if it had
--      typed it, so the ledger rules are the same — or turns it down with a
--      reason he sees in the app.
--
--  NOTHING here holds money, moves money or lowers what he owes by itself:
--  only the office's confirmation does, after the money has arrived. A
--  claim is a message, not a payment. A prepaid wallet is a different thing
--  and needs a lawyer first.
--
--  Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id          uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  amount_paisa    bigint NOT NULL CHECK (amount_paisa > 0 AND amount_paisa % 100 = 0),
  method          text NOT NULL CHECK (method IN ('jazzcash', 'easypaisa', 'bank')),
  reference       text NOT NULL CHECK (length(btrim(reference)) BETWEEN 3 AND 80),
  screenshot_path text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reason          text CHECK (reason IS NULL OR length(reason) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      text,
  txn_id          uuid
);
ALTER TABLE public.payment_claims ENABLE ROW LEVEL SECURITY;
-- One claim waiting per technician at a time, whatever the app does.
CREATE UNIQUE INDEX IF NOT EXISTS payment_claims_one_waiting ON public.payment_claims (pro_id) WHERE status = 'pending';

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('paid_claim.title',     205, NULL, 'A technician says he has paid {amount}', 'office'),
  ('paid_claim.body',      206, NULL, '{name} sent {amount} by {method}. Check your account, then confirm it in the admin panel, Money.', 'office'),
  ('claim_rejected.title', 207, 'Your payment of {amount} was not confirmed', 'Your payment of {amount} was not confirmed', 'technician'),
  ('claim_rejected.body',  208, 'Open My account to see why.', 'Open My account to see why.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;

CREATE OR REPLACE FUNCTION public.method_name(p_method text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_method WHEN 'jazzcash' THEN 'JazzCash' WHEN 'easypaisa' THEN 'Easypaisa' WHEN 'bank' THEN 'bank transfer' WHEN 'cash' THEN 'cash' ELSE p_method END;
$$;


-- --- The technician ---------------------------------------------------------------------------

/** "I have paid": a message to the office, never a payment. Refusals name the box they are about. */
CREATE OR REPLACE FUNCTION public.claim_payment(p_amount_paisa bigint, p_method text, p_reference text, p_screenshot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_ref  text := nullif(btrim(coalesce(p_reference, '')), '');
  v_owed bigint;
  v_id   uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN public.refuse('Only a technician can tell Pechkas he has paid.');
  END IF;
  -- One at a time per technician, so two taps on bad signal send one claim.
  PERFORM pg_advisory_xact_lock(hashtext('claim:' || v_me::text));
  IF EXISTS (SELECT 1 FROM public.payment_claims WHERE pro_id = v_me AND status = 'pending') THEN
    RETURN public.refuse('You have already told the office about a payment. It is checking it now.', 'claim');
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
  IF v_ref IS NULL OR length(v_ref) < 3 OR length(v_ref) > 80 THEN
    RETURN public.refuse('Write the transaction ID from the payment message.', 'reference');
  END IF;
  IF public.looks_like_cnic(v_ref) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'reference');
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

  INSERT INTO public.payment_claims (pro_id, amount_paisa, method, reference, screenshot_path)
  VALUES (v_me, p_amount_paisa, p_method, v_ref, p_screenshot)
  RETURNING id INTO v_id;

  PERFORM public.tell_office('paid_claim', NULL, jsonb_build_object(
    'name', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_me),
    'amount', public.rs(p_amount_paisa),
    'method', public.method_name(p_method)));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

/** His last few claims and what became of them, newest first. */
CREATE OR REPLACE FUNCTION public.my_payment_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY c ->> 'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', x.id, 'amount_paisa', x.amount_paisa, 'method', x.method, 'reference', x.reference,
                              'status', x.status, 'reason', x.reason, 'created_at', x.created_at, 'decided_at', x.decided_at) AS c
    FROM public.payment_claims x
    WHERE x.pro_id = auth.uid()
    ORDER BY x.created_at DESC
    LIMIT 5) s;
$$;


-- --- The office -------------------------------------------------------------------------------

/** Claims to check (or those already decided), with the technician, what he owes now and the screenshot. */
CREATE OR REPLACE FUNCTION public.admin_payment_claims(p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', x.id, 'pro_id', x.pro_id, 'pro_name', r.full_name, 'pro_phone', public.phone_of(r.id),
      'owed_paisa', public.pro_owed(x.pro_id),
      'amount_paisa', x.amount_paisa, 'method', x.method, 'reference', x.reference,
      'screenshot_path', x.screenshot_path, 'status', x.status, 'reason', x.reason,
      'created_at', x.created_at, 'decided_at', x.decided_at, 'decided_by', x.decided_by
    ) ORDER BY x.created_at DESC)
    FROM public.payment_claims x JOIN public.pros r ON r.id = x.pro_id
    WHERE p_status IS NULL OR x.status = p_status
  ), '[]'::jsonb) END;
$$;

/**
 * The money has arrived: record it exactly as the office would by hand,
 * through admin_settle() (its checks, its ledger entry, its message to him),
 * keyed on the claim so two clicks record it once.
 */
CREATE OR REPLACE FUNCTION public.admin_confirm_claim(p_claim uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.payment_claims%ROWTYPE;
  v_r jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_c FROM public.payment_claims WHERE id = p_claim FOR UPDATE;
  IF v_c.id IS NULL THEN
    RETURN public.refuse('That payment is not on the list.');
  END IF;
  IF v_c.status <> 'pending' THEN
    RETURN public.refuse('That payment has already been ' || v_c.status || '.');
  END IF;
  v_r := public.admin_settle(v_c.pro_id, v_c.amount_paisa, v_c.method, v_c.reference, 'claim:' || v_c.id::text);
  IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
    RETURN v_r;
  END IF;
  UPDATE public.payment_claims
  SET status = 'confirmed', decided_at = now(),
      decided_by = (SELECT name FROM public.staff WHERE id = auth.uid()),
      txn_id = (SELECT id FROM public.ledger_txns WHERE idempotency_key = 'settle:claim:' || v_c.id::text)
  WHERE id = v_c.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** It did not arrive, or the figures do not match: he is told, and sees the office's reason in the app only. */
CREATE OR REPLACE FUNCTION public.admin_reject_claim(p_claim uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      public.payment_claims%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 OR length(v_reason) > 200 THEN
    RETURN public.refuse('Say why, so he can put it right.', 'reason');
  END IF;
  IF public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'reason');
  END IF;
  SELECT * INTO v_c FROM public.payment_claims WHERE id = p_claim FOR UPDATE;
  IF v_c.id IS NULL THEN
    RETURN public.refuse('That payment is not on the list.');
  END IF;
  IF v_c.status <> 'pending' THEN
    RETURN public.refuse('That payment has already been ' || v_c.status || '.');
  END IF;
  UPDATE public.payment_claims
  SET status = 'rejected', reason = v_reason, decided_at = now(),
      decided_by = (SELECT name FROM public.staff WHERE id = auth.uid())
  WHERE id = v_c.id;
  -- The notification says only that it was not confirmed: the office's words stay in the app.
  PERFORM public.tell(v_c.pro_id, 'claim_rejected', NULL, '/pro/money', jsonb_build_object('amount', public.rs(v_c.amount_paisa)));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- method_name() is granted to nobody: it is only used inside the functions above.

GRANT EXECUTE ON FUNCTION
  public.claim_payment(bigint, text, text, text),
  public.my_payment_claims(),
  public.admin_payment_claims(text),
  public.admin_confirm_claim(uuid),
  public.admin_reject_claim(uuid, text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261103000000_pay_pechkas')
ON CONFLICT (name) DO NOTHING;

COMMIT;
