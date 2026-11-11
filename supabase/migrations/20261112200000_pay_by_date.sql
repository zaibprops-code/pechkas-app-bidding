-- =============================================================================
--  Paying Pechkas by a date (the owner's decision D36, 11 November 2026)
-- =============================================================================
--
--  WHAT FALLS DUE. Only final debts: a job's commission (the day it is
--  posted), a guarantee charge (posted only once final, after its appeal),
--  and a visit-fee refund charged to him — which now has the same 7-day
--  appeal before it is posted. Each is due 14 days after it was posted (on
--  Pakistan's calendar), has 3 days' grace, and from 00:00 on day 18 his NEW
--  offers stop while any of it is unpaid. Jobs he has go on. No fee, no
--  interest, no suspension. The Rs 3,000 limit is unchanged and separate.
--
--  WHAT PAID WHAT: pay_allocations. Lines saying "credit X paid N of debt Y",
--  only ever added. One step, pay_rebalance(), runs in post_txn() — the one
--  writer of the ledger — after every money change: anything reversed is
--  taken off whatever it paid or was paid by (new 'release' lines), then free
--  credit pays the oldest unpaid debt first (new 'apply' lines). A cash payout
--  to him is a debt that never falls due, so it uses up credit and the same
--  rupee can never also clear a fee. Credits that may pay fees: his confirmed
--  payment, guarantee-repair pay (A22), a visit fee Pechkas paid him (A39).
--  Everything is checked by one rule: unpaid debts - free credit = pro_owed().
--
--  A WAITING "I HAVE PAID" protects only the amount claimed, oldest fees
--  first, until the office decides. After 3 business days (Monday to Friday,
--  minus the office's list of official holidays) it needs attention and the
--  office is told each business day. A wrong holiday list cannot stop anyone's
--  offers: it only decides when the office is reminded.
--
--  EXTRA TIME: once per overdue spell, 3 to 14 days, only for fees whose offers
--  have already stopped, with a reason; offers stop again at the midnight after
--  the last extended day, with no second grace. Written once.
--
--  Every time and date is Pakistan's. Debts owed on the day this runs start
--  their 14 days that day; refunds charged under the old rule get the new
--  7-day appeal from that day first. Commission rates are not touched.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;

-- --- Settings: locked, because the technician agreement states them -----------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('pay_due_days', 14, 'days', 'A debt to Pechkas is due this many days after it is posted (D36). Locked: the technician agreement states it.'),
  ('pay_grace_days', 3, 'days', 'Days of grace after the due date before new offers stop (D36). Locked.'),
  ('pay_verify_business_days', 3, 'days', 'Business days the office has to check an "I have paid" before it needs attention (D36).'),
  ('pay_extend_min_days', 3, 'days', 'Shortest extension the office may give (D36). Locked.'),
  ('pay_extend_max_days', 14, 'days', 'Longest extension the office may give (D36). Locked.'),
  ('pay_extend_default_days', 7, 'days', 'The extension the office is offered first (D36).')
ON CONFLICT (key) DO NOTHING;
DELETE FROM public.setting_limits WHERE key IN ('pay_due_days', 'pay_grace_days', 'pay_verify_business_days',
                                                'pay_extend_min_days', 'pay_extend_max_days', 'pay_extend_default_days');

/** When D36 began: debts already owed then start their 14 days from this day, never earlier. */
CREATE TABLE IF NOT EXISTS public.pay_policy (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_policy FROM anon, authenticated;
INSERT INTO public.pay_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pk_day(p_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (p_at AT TIME ZONE 'Asia/Karachi')::date;
$$;

/** 00:00 in Islamabad at the start of a day. */
CREATE OR REPLACE FUNCTION public.pk_midnight(p_day date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (p_day::timestamp) AT TIME ZONE 'Asia/Karachi';
$$;


-- --- What paid what --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pay_allocations (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pro_id       uuid NOT NULL,
  credit_txn   uuid NOT NULL,
  debit_txn    uuid NOT NULL,
  amount_paisa bigint NOT NULL CHECK (amount_paisa <> 0),
  why          text NOT NULL CHECK (why IN ('opening', 'apply', 'release')),
  cause_txn    uuid,
  at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_allocations FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS pay_allocations_pro ON public.pay_allocations (pro_id);
CREATE INDEX IF NOT EXISTS pay_allocations_credit ON public.pay_allocations (credit_txn);
CREATE INDEX IF NOT EXISTS pay_allocations_debit ON public.pay_allocations (debit_txn);

CREATE OR REPLACE FUNCTION public.written_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'This record is written once: it cannot be changed or removed.';
END;
$$;
DROP TRIGGER IF EXISTS pay_allocations_once ON public.pay_allocations;
CREATE TRIGGER pay_allocations_once BEFORE UPDATE OR DELETE ON public.pay_allocations
  FOR EACH ROW EXECUTE FUNCTION public.written_once();

-- A refund charged to him is posted only once final; one charged under the old rule waits for its appeal.
ALTER TABLE public.visit_fees DROP CONSTRAINT IF EXISTS visit_fees_refund_check;
ALTER TABLE public.visit_fees ADD CONSTRAINT visit_fees_refund_check
  CHECK (refund IN ('owed', 'returned', 'charge_pending', 'charged', 'absorbed'));
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_charge_due     timestamptz;
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_finalized_at   timestamptz;
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_appeal_text    text CHECK (refund_appeal_text IS NULL OR length(refund_appeal_text) <= 300);
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_appeal_at      timestamptz;
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_appeal_outcome text CHECK (refund_appeal_outcome IS NULL OR refund_appeal_outcome IN ('kept', 'cancelled'));
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_appeal_note    text CHECK (refund_appeal_note IS NULL OR length(refund_appeal_note) <= 300);
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_decided_by     text;
ALTER TABLE public.visit_fees ADD COLUMN IF NOT EXISTS refund_decided_at     timestamptz;

/**
 * Everything in his account that the rule knows, one line per ledger posting:
 * fees (which fall due), payouts (a debt that never falls due) and the credits
 * that may pay them. Anything reversed is dead. A refund waiting on its appeal
 * is not yet payable.
 */
CREATE OR REPLACE FUNCTION public.pay_items(p_pro uuid)
RETURNS TABLE (txn uuid, kind text, posted_at timestamptz, amount bigint, side text, live boolean,
               payable boolean, clock_from timestamptz, ref text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.kind, t.created_at, abs(s.amount),
         CASE WHEN t.kind IN ('commission', 'guarantee_charge', 'visit_fee_refund') THEN 'fee'
              WHEN t.kind = 'payout' THEN 'payout' ELSE 'credit' END,
         NOT EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = t.id),
         CASE WHEN t.kind = 'visit_fee_refund'
              THEN coalesce((SELECT v.refund_finalized_at IS NOT NULL FROM public.visit_fees v WHERE v.refund_txn = t.id), true)
              ELSE true END,
         CASE WHEN t.kind = 'visit_fee_refund'
              THEN coalesce((SELECT v.refund_finalized_at FROM public.visit_fees v WHERE v.refund_txn = t.id), t.created_at)
              ELSE t.created_at END,
         t.job_ref
  FROM public.ledger_txns t
  CROSS JOIN LATERAL (SELECT sum(e.amount_paisa) AS amount FROM public.ledger_entries e
                      WHERE e.txn_id = t.id AND e.account = 'pro_owes' AND e.pro_id = p_pro) s
  WHERE s.amount IS NOT NULL AND s.amount <> 0
    AND ((t.kind IN ('commission', 'guarantee_charge', 'visit_fee_refund', 'payout') AND s.amount > 0)
      OR (t.kind IN ('settlement', 'guarantee_pay', 'visit_fee_cover') AND s.amount < 0));
$$;

/**
 * The one step: take anything dead or not yet payable off whatever it paid,
 * then let free credit pay the oldest unpaid debt first. Written as new lines
 * only. The caller holds this technician's pay lock.
 */
CREATE OR REPLACE FUNCTION public.pay_rebalance(p_pro uuid, p_cause uuid, p_opening boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n      integer := 0;
  v_credit uuid;
  v_free   bigint;
  v_debit  uuid;
  v_unpaid bigint;
  v_amt    bigint;
BEGIN
  -- Take back every allocation that touches something reversed, or a debt not yet payable.
  -- (No temporary table: a caller could plant one of the same name in his own session.)
  INSERT INTO public.pay_allocations (pro_id, credit_txn, debit_txn, amount_paisa, why, cause_txn)
  SELECT p_pro, a.credit_txn, a.debit_txn, -sum(a.amount_paisa), 'release', p_cause
  FROM public.pay_allocations a
  WHERE a.pro_id = p_pro
  GROUP BY a.credit_txn, a.debit_txn
  HAVING sum(a.amount_paisa) <> 0
     AND (NOT EXISTS (SELECT 1 FROM public.pay_items(p_pro) i WHERE i.txn = a.credit_txn AND i.side = 'credit' AND i.live)
          OR NOT EXISTS (SELECT 1 FROM public.pay_items(p_pro) i WHERE i.txn = a.debit_txn AND i.side IN ('fee', 'payout') AND i.live AND i.payable));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  LOOP
    v_credit := NULL;
    v_debit := NULL;
    SELECT i.txn, i.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.credit_txn = i.txn AND a.pro_id = p_pro), 0)
    INTO v_credit, v_free
    FROM public.pay_items(p_pro) i
    WHERE i.side = 'credit' AND i.live
      AND i.amount > coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.credit_txn = i.txn AND a.pro_id = p_pro), 0)
    ORDER BY i.posted_at, i.txn LIMIT 1;
    EXIT WHEN v_credit IS NULL;
    SELECT i.txn, i.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.debit_txn = i.txn AND a.pro_id = p_pro), 0)
    INTO v_debit, v_unpaid
    FROM public.pay_items(p_pro) i
    WHERE i.side IN ('fee', 'payout') AND i.live AND i.payable
      AND i.amount > coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.debit_txn = i.txn AND a.pro_id = p_pro), 0)
    ORDER BY i.posted_at, i.txn LIMIT 1;
    EXIT WHEN v_debit IS NULL;
    v_amt := least(v_free, v_unpaid);
    INSERT INTO public.pay_allocations (pro_id, credit_txn, debit_txn, amount_paisa, why, cause_txn)
    VALUES (p_pro, v_credit, v_debit, v_amt, CASE WHEN p_opening THEN 'opening' ELSE 'apply' END, p_cause);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/** The same lock for everything that can change one technician's position. */
CREATE OR REPLACE FUNCTION public.pay_lock(p_pro uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(hashtext('pay:' || p_pro::text));
$$;


-- --- Extra time, and the office's holiday list ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pay_extensions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  days        smallint NOT NULL CHECK (days BETWEEN 1 AND 30),
  until_day   date NOT NULL,
  reason      text NOT NULL CHECK (length(reason) BETWEEN 5 AND 300),
  by_id       uuid,
  by_name     text
);
ALTER TABLE public.pay_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_extensions FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.pay_extension_fees (
  txn_id       uuid PRIMARY KEY,
  extension_id uuid NOT NULL REFERENCES public.pay_extensions(id) ON DELETE CASCADE
);
ALTER TABLE public.pay_extension_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_extension_fees FROM anon, authenticated;
DROP TRIGGER IF EXISTS pay_extensions_once ON public.pay_extensions;
CREATE TRIGGER pay_extensions_once BEFORE UPDATE ON public.pay_extensions
  FOR EACH ROW EXECUTE FUNCTION public.written_once();
DROP TRIGGER IF EXISTS pay_extension_fees_once ON public.pay_extension_fees;
CREATE TRIGGER pay_extension_fees_once BEFORE UPDATE ON public.pay_extension_fees
  FOR EACH ROW EXECUTE FUNCTION public.written_once();

/** Official holidays, typed by the office from the government's notice. Never guessed. */
CREATE TABLE IF NOT EXISTS public.pk_holidays (
  day        date PRIMARY KEY,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  added_by   text,
  added_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pk_holidays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pk_holidays FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.pk_holiday_log (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day     date NOT NULL,
  name    text,
  action  text NOT NULL CHECK (action IN ('added', 'removed')),
  by_name text,
  at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pk_holiday_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pk_holiday_log FROM anon, authenticated;
DROP TRIGGER IF EXISTS pk_holiday_log_once ON public.pk_holiday_log;
CREATE TRIGGER pk_holiday_log_once BEFORE UPDATE OR DELETE ON public.pk_holiday_log
  FOR EACH ROW EXECUTE FUNCTION public.written_once();

CREATE OR REPLACE FUNCTION public.business_day(p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT extract(isodow FROM p_day) < 6 AND NOT EXISTS (SELECT 1 FROM public.pk_holidays h WHERE h.day = p_day);
$$;

/** Business days after one day, up to and including another. */
CREATE OR REPLACE FUNCTION public.business_days_between(p_from date, p_to date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM generate_series(p_from + 1, p_to, interval '1 day') AS d(day)
  WHERE p_to > p_from AND public.business_day(d.day::date);
$$;

ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS needs_attention_at timestamptz;
ALTER TABLE public.payment_claims ADD COLUMN IF NOT EXISTS office_told_on     date;

/** One reminder per technician per day, at most. */
CREATE TABLE IF NOT EXISTS public.pay_reminders (
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  day          date NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('due_soon', 'due_today', 'last_day', 'stopped')),
  amount_paisa bigint NOT NULL,
  refs         text,
  at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pro_id, day)
);
ALTER TABLE public.pay_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_reminders FROM anon, authenticated;


-- --- Each fee, its dates and where it stands ----------------------------------------------------

/**
 * Every fee with its dates on Pakistan's calendar. Day 0 is the day it was
 * posted (or when D36 began, if later); due on day 14; grace on 15-17;
 * stop at 00:00 on day 18 — or, if extended, at 00:00 after the last
 * extended day. A waiting "I have paid" protects only its amount, oldest
 * fees first.
 */
CREATE OR REPLACE FUNCTION public.pay_fees(p_pro uuid)
RETURNS TABLE (txn uuid, kind text, ref text, posted_at timestamptz, amount bigint, paid bigint, unpaid bigint,
               protected bigint, payable boolean, due_day date, last_grace_day date, stop_at timestamptz,
               extension_id uuid, extended_to date, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH f AS (
    SELECT i.txn, i.kind, i.ref, i.posted_at, i.amount, i.payable,
           coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.debit_txn = i.txn AND a.pro_id = p_pro), 0) AS paid,
           greatest(public.pk_day(i.clock_from), public.pk_day((SELECT p.started_at FROM public.pay_policy p))) AS day0,
           x.extension_id, e.until_day
    FROM public.pay_items(p_pro) i
    LEFT JOIN public.pay_extension_fees x ON x.txn_id = i.txn
    LEFT JOIN public.pay_extensions e ON e.id = x.extension_id
    WHERE i.side = 'fee' AND i.live
  ),
  g AS (
    SELECT f.*, f.amount - f.paid AS unpaid,
           (f.day0 + public.setting('pay_due_days')::integer) AS due,
           coalesce((SELECT c.amount_paisa FROM public.payment_claims c WHERE c.pro_id = p_pro AND c.status = 'pending'), 0) AS claim
    FROM f
  ),
  h AS (
    SELECT g.*,
           sum(CASE WHEN g.payable THEN g.unpaid ELSE 0 END) OVER (ORDER BY g.posted_at, g.txn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
    FROM g
  )
  SELECT h.txn, h.kind, h.ref, h.posted_at, h.amount, h.paid, h.unpaid,
         CASE WHEN h.payable THEN least(h.unpaid, greatest(h.claim - coalesce(h.before, 0), 0)) ELSE 0 END,
         h.payable, h.due, h.due + public.setting('pay_grace_days')::integer,
         CASE WHEN h.until_day IS NOT NULL THEN public.pk_midnight(h.until_day + 1)
              ELSE public.pk_midnight(h.due + public.setting('pay_grace_days')::integer + 1) END,
         h.extension_id, h.until_day,
         CASE
           WHEN h.unpaid = 0 THEN 'paid'
           WHEN NOT h.payable THEN 'appeal'
           WHEN now() >= CASE WHEN h.until_day IS NOT NULL THEN public.pk_midnight(h.until_day + 1)
                              ELSE public.pk_midnight(h.due + public.setting('pay_grace_days')::integer + 1) END
             THEN CASE WHEN h.unpaid - least(h.unpaid, greatest(h.claim - coalesce(h.before, 0), 0)) > 0 THEN 'stopped' ELSE 'protected' END
           WHEN h.until_day IS NOT NULL THEN 'extended'
           WHEN public.pk_day(now()) > h.due THEN 'grace'
           WHEN public.pk_day(now()) = h.due THEN 'due'
           ELSE 'not_due' END
  FROM h;
$$;

/** Are his new offers stopped by an overdue fee? (The Rs 3,000 limit is checked on its own.) */
CREATE OR REPLACE FUNCTION public.pay_blocked(p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.pay_fees(p_pro) f WHERE f.status = 'stopped');
$$;

/** His whole position, for his screen and the office's. */
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


-- --- The office -----------------------------------------------------------------------------------

/** Extra time, once per overdue spell, only for fees whose offers have already stopped. */
CREATE OR REPLACE FUNCTION public.admin_extend_pay(p_pro uuid, p_days integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
  v_until  date;
  v_n      integer;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  PERFORM public.pay_lock(p_pro);
  IF p_days IS NULL OR p_days < public.setting('pay_extend_min_days') OR p_days > public.setting('pay_extend_max_days') THEN
    RETURN public.refuse('Choose between ' || public.setting('pay_extend_min_days') || ' and ' || public.setting('pay_extend_max_days') || ' days.', 'days');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 300 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Write the reason, in a sentence. He reads it in the app.', 'reason');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pay_fees(p_pro) f WHERE f.extension_id IS NOT NULL AND f.unpaid > 0) THEN
    RETURN public.refuse('He already has more time on fees that are still unpaid. One extension until those are paid.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pay_fees(p_pro) f WHERE f.status = 'stopped' AND f.extension_id IS NULL) THEN
    RETURN public.refuse('Nothing of his is overdue. Extra time is only for fees whose offers have already stopped.');
  END IF;
  v_until := public.pk_day(now()) + p_days;
  INSERT INTO public.pay_extensions (pro_id, days, until_day, reason, by_id, by_name)
  VALUES (p_pro, p_days, v_until, v_reason, auth.uid(), (SELECT s.name FROM public.staff s WHERE s.id = auth.uid()))
  RETURNING id INTO v_id;
  INSERT INTO public.pay_extension_fees (txn_id, extension_id)
  SELECT f.txn, v_id FROM public.pay_fees(p_pro) f WHERE f.status = 'stopped' AND f.extension_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.tell(p_pro, 'pay_extended', NULL, '/pro/money',
    jsonb_build_object('date', to_char(v_until, 'FMDy FMDD Mon')));
  RETURN jsonb_build_object('ok', true, 'until_day', v_until, 'fees', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_holidays()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'days', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'by', h.added_by) ORDER BY h.day)
                      FROM public.pk_holidays h WHERE h.day >= public.pk_day(now()) - 60), '[]'::jsonb),
    'log', coalesce((SELECT jsonb_agg(jsonb_build_object('day', l.day, 'name', l.name, 'action', l.action, 'by', l.by_name, 'at', l.at) ORDER BY l.at DESC)
                     FROM (SELECT * FROM public.pk_holiday_log ORDER BY at DESC LIMIT 30) l), '[]'::jsonb)) END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_holiday(p_day date, p_name text, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_by   text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_day IS NULL OR p_day < public.pk_day(now()) - 366 OR p_day > public.pk_day(now()) + 731 THEN
    RETURN public.refuse('Choose a day within the next two years.', 'day');
  END IF;
  v_by := (SELECT s.name FROM public.staff s WHERE s.id = auth.uid());
  IF p_on THEN
    IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 80 THEN
      RETURN public.refuse('Write the holiday''s name, as in the government''s notice.', 'name');
    END IF;
    INSERT INTO public.pk_holidays (day, name, added_by) VALUES (p_day, v_name, v_by)
    ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name, added_by = EXCLUDED.added_by, added_at = now();
    INSERT INTO public.pk_holiday_log (day, name, action, by_name) VALUES (p_day, v_name, 'added', v_by);
  ELSE
    DELETE FROM public.pk_holidays WHERE day = p_day;
    IF FOUND THEN
      INSERT INTO public.pk_holiday_log (day, name, action, by_name) VALUES (p_day, NULL, 'removed', v_by);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- A visit-fee refund charged to him: appeal first ----------------------------------------------

/** Post a refund charge that has become final: no appeal by its date, or the office kept it. */
CREATE OR REPLACE FUNCTION public.post_refund_charge(p_fee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee public.visit_fees;
  v_txn uuid;
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE id = p_fee FOR UPDATE;
  IF v_fee.id IS NULL THEN
    RETURN;
  END IF;
  IF v_fee.refund = 'charge_pending' THEN
    v_txn := public.post_txn('visit_fee_refund:' || v_fee.id, 'visit_fee_refund', v_fee.job_id, v_fee.pro_id, jsonb_build_array(
      jsonb_build_object('account', 'pro_owes', 'pro_id', v_fee.pro_id, 'amount', v_fee.amount_paisa),
      jsonb_build_object('account', 'received', 'amount', -v_fee.amount_paisa)),
      NULL, NULL, 'Waived visit fee paid back to the customer by Pechkas');
    UPDATE public.visit_fees SET refund = 'charged', refund_txn = v_txn, refund_finalized_at = now() WHERE id = p_fee;
    PERFORM public.tell(v_fee.pro_id, 'fee_refund_charged', v_fee.job_id, '/pro/money', public.fee_vars(v_fee));
  ELSIF v_fee.refund = 'charged' AND v_fee.refund_finalized_at IS NULL THEN
    -- Charged under the old rule; its appeal time has passed or the office kept it: it is now payable.
    PERFORM public.pay_lock(v_fee.pro_id);
    UPDATE public.visit_fees SET refund_finalized_at = now() WHERE id = p_fee;
    PERFORM public.pay_rebalance(v_fee.pro_id, v_fee.refund_txn);
  END IF;
  PERFORM public.log_job(v_fee.job_id, 'visit_fee_refund_final', jsonb_build_object('amount', v_fee.amount_paisa));
END;
$$;

/** His one appeal against a refund charge, before its date. */
CREATE OR REPLACE FUNCTION public.pro_appeal_refund(p_fee uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee  public.visit_fees;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE id = p_fee AND pro_id = auth.uid() FOR UPDATE;
  IF v_fee.id IS NULL OR NOT (v_fee.refund = 'charge_pending' OR (v_fee.refund = 'charged' AND v_fee.refund_finalized_at IS NULL)) THEN
    RETURN public.refuse('There is no charge on this visit fee to appeal.');
  END IF;
  IF v_fee.refund_appeal_at IS NOT NULL THEN
    RETURN public.refuse('You have already appealed. The office will decide.');
  END IF;
  IF v_fee.refund_charge_due IS NULL OR v_fee.refund_charge_due <= now() THEN
    RETURN public.refuse('The time to appeal this charge has passed.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 10 OR length(v_text) > 300 OR public.looks_like_cnic(v_text)
     OR regexp_replace(v_text, '[^0-9]', '', 'g') ~ '[0-9]{7}' THEN
    RETURN public.refuse('Say why in a sentence or two, with no phone numbers.', 'text');
  END IF;
  UPDATE public.visit_fees SET refund_appeal_text = v_text, refund_appeal_at = now() WHERE id = p_fee;
  PERFORM public.log_job(v_fee.job_id, 'visit_fee_refund_appeal');
  PERFORM public.tell_office('refund_appeal_office', v_fee.job_id, public.fee_vars(v_fee));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Refund charges whose appeal time has passed with no appeal become final. */
CREATE OR REPLACE FUNCTION public.refund_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR v_id IN
    SELECT v.id FROM public.visit_fees v
    WHERE (v.refund = 'charge_pending' OR (v.refund = 'charged' AND v.refund_finalized_at IS NULL))
      AND v.refund_charge_due <= now() AND v.refund_appeal_at IS NULL
    ORDER BY v.refund_charge_due
  LOOP
    PERFORM public.post_refund_charge(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;


-- --- The daily clock: reminders, and waiting payments the office has not checked -------------------

CREATE OR REPLACE FUNCTION public.pay_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := public.pk_day(now());
  v_pro   uuid;
  v_kind  text;
  v_amt   bigint;
  v_refs  text;
  v_day   date;
  v_n     integer := 0;
  v_c     public.payment_claims;
BEGIN
  FOR v_pro IN SELECT DISTINCT e.pro_id FROM public.ledger_entries e WHERE e.account = 'pro_owes' AND e.pro_id IS NOT NULL LOOP
    v_kind := NULL;
    -- The most urgent first; fees a waiting payment protects are not reminded.
    SELECT k, sum(amt), string_agg(DISTINCT ref, ', '), min(d) INTO v_kind, v_amt, v_refs, v_day FROM (
      SELECT CASE
               WHEN public.pk_day(f.stop_at) = v_today AND now() >= f.stop_at THEN 'stopped'
               WHEN public.pk_day(f.stop_at) - 1 = v_today THEN 'last_day'
               WHEN f.extended_to IS NULL AND f.due_day = v_today THEN 'due_today'
               WHEN f.extended_to IS NULL AND f.due_day = v_today + 3 THEN 'due_soon' END AS k,
             f.unpaid - f.protected AS amt, coalesce(f.ref, 'charge') AS ref, f.due_day AS d
      FROM public.pay_fees(v_pro) f
      WHERE f.payable AND f.unpaid - f.protected > 0) s
    WHERE k IS NOT NULL
    GROUP BY k
    ORDER BY CASE k WHEN 'stopped' THEN 1 WHEN 'last_day' THEN 2 WHEN 'due_today' THEN 3 ELSE 4 END
    LIMIT 1;
    IF v_kind IS NOT NULL THEN
      INSERT INTO public.pay_reminders (pro_id, day, kind, amount_paisa, refs)
      VALUES (v_pro, v_today, v_kind, v_amt, v_refs)
      ON CONFLICT (pro_id, day) DO NOTHING;
      IF FOUND THEN
        PERFORM public.tell(v_pro, 'pay_' || v_kind, NULL, '/pro/money',
          jsonb_build_object('amount', public.rs(v_amt), 'refs', v_refs, 'date', to_char(v_day, 'FMDy FMDD Mon')));
        v_n := v_n + 1;
      END IF;
    END IF;
  END LOOP;

  -- A waiting "I have paid" the office has not checked in 3 business days: it needs attention,
  -- and the office is told each business day until somebody decides. It protects him all along.
  IF public.business_day(v_today) THEN
    FOR v_c IN
      SELECT * FROM public.payment_claims c
      WHERE c.status = 'pending'
        AND public.business_days_between(public.pk_day(c.created_at), v_today) >= public.setting('pay_verify_business_days')
        AND c.office_told_on IS DISTINCT FROM v_today
      FOR UPDATE SKIP LOCKED
    LOOP
      UPDATE public.payment_claims SET needs_attention_at = coalesce(needs_attention_at, now()), office_told_on = v_today WHERE id = v_c.id;
      PERFORM public.tell_office('claim_waiting_office', NULL, jsonb_build_object(
        'name', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_c.pro_id),
        'amount', public.rs(v_c.amount_paisa),
        'days', public.business_days_between(public.pk_day(v_c.created_at), v_today)));
      v_n := v_n + 1;
    END LOOP;
  END IF;
  RETURN v_n;
END;
$$;


-- --- The one writer of the ledger now keeps what-paid-what in step, under the pay lock --------------

CREATE OR REPLACE FUNCTION public.post_txn(
  p_key text, p_kind text, p_job uuid, p_pro uuid, p_lines jsonb,
  p_method text DEFAULT NULL, p_reference text DEFAULT NULL, p_memo text DEFAULT NULL, p_reverses uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id  uuid;
  v_sum bigint;
  v_pro uuid;
BEGIN
  SELECT coalesce(sum((l ->> 'amount')::bigint), 0) INTO v_sum FROM jsonb_array_elements(p_lines) AS l;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'Ledger lines must add up to nothing; these add up to %.', v_sum;
  END IF;
  INSERT INTO public.ledger_txns (idempotency_key, kind, job_id, job_ref, pro_id, pro_name, method, reference, memo, reverses, created_by, created_by_name)
  VALUES (p_key, p_kind, p_job, (SELECT ref FROM public.jobs WHERE id = p_job), p_pro,
          (SELECT full_name FROM public.pros WHERE id = p_pro), p_method, p_reference, p_memo, p_reverses,
          auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.ledger_entries (txn_id, account, pro_id, amount_paisa)
  SELECT v_id, l ->> 'account', nullif(l ->> 'pro_id', '')::uuid, (l ->> 'amount')::bigint
  FROM jsonb_array_elements(p_lines) AS l
  WHERE (l ->> 'amount')::bigint <> 0;
  -- D36: whatever this did to a technician's account, what-paid-what follows it in the same transaction.
  FOR v_pro IN SELECT DISTINCT nullif(l ->> 'pro_id', '')::uuid FROM jsonb_array_elements(p_lines) AS l
               WHERE l ->> 'account' = 'pro_owes' AND (l ->> 'amount')::bigint <> 0 AND nullif(l ->> 'pro_id', '') IS NOT NULL LOOP
    PERFORM public.pay_lock(v_pro);
    PERFORM public.pay_rebalance(v_pro, v_id);
  END LOOP;
  RETURN v_id;
END;
$$;




-- --- Offers: an overdue fee stops them, beside the Rs 3,000 limit -----------------------------------

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
    -- D36: an overdue fee stops new offers on its own.
    'pay_blocked', public.pay_blocked(auth.uid()),
    'overdue_paisa', (public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint,
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
               AND NOT public.pay_blocked(r.id)
               AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = NEW.customer_id AND b.pro_id = r.id)) THEN
    NEW.preferred_pro_id := v_ask.pro_id;
    NEW.preferred_until := now() + make_interval(mins => public.setting('prefer_minutes')::integer);
  END IF;
  RETURN NEW;
END;
$$;




-- --- A waiting payment and its refusal take the same lock -------------------------------------------

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
  PERFORM public.pay_lock(v_me);
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
  IF v_c.id IS NOT NULL THEN
    PERFORM public.pay_lock(v_c.pro_id);
  END IF;
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




-- --- What each side sees ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pro_money()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_owed  bigint;
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'why', 'Only a technician has an account with Pechkas.');
  END IF;
  v_owed := public.pro_owed(v_me);
  RETURN jsonb_build_object(
    'ok', true,
    'owed_paisa', v_owed,
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'blocked', v_owed > public.setting('credit_limit_paisa'),
    -- D36: every fee with its dates, a waiting payment, extra time.
    'pay', public.pay_state(v_me),
    -- A visit-fee refund charged to him: waiting on its appeal, or decided lately.
    'refund_charges', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 'ref', j.ref, 'amount_paisa', v.amount_paisa, 'refund', v.refund, 'due', v.refund_charge_due,
          'final', v.refund_finalized_at IS NOT NULL OR v.refund = 'absorbed',
          'can_appeal', v.refund_appeal_at IS NULL AND v.refund_charge_due > now()
                        AND (v.refund = 'charge_pending' OR (v.refund = 'charged' AND v.refund_finalized_at IS NULL)),
          'appeal_at', v.refund_appeal_at, 'outcome', v.refund_appeal_outcome, 'note', v.refund_appeal_note) ORDER BY v.office_at DESC)
      FROM public.visit_fees v JOIN public.jobs j ON j.id = v.job_id
      WHERE v.pro_id = v_me AND v.refund IN ('charge_pending', 'charged', 'absorbed') AND v.refund_charge_due IS NOT NULL
        AND (v.refund_finalized_at IS NULL OR v.refund_finalized_at > now() - interval '30 days' OR v.refund_decided_at > now() - interval '30 days')), '[]'::jsonb),
    'commission_bps', public.setting('commission_bps'),
    'repeat_commission_bps', public.setting('repeat_commission_bps'),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'month', (SELECT jsonb_build_object(
                'jobs', count(*),
                'collected_paisa', coalesce(sum(j.collect_paisa), 0),
                'parts_paisa', coalesce(sum(j.parts_paisa), 0),
                'commission_paisa', coalesce(sum(j.commission_paisa), 0))
              FROM public.jobs j
              WHERE j.pro_id = v_me AND j.status = 'done' AND j.finished_at >= v_month),
    'rating', public.pro_rating(v_me),
    'comments', coalesce((
      SELECT jsonb_agg(c ORDER BY c ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at,
                                  'ref', (SELECT ref FROM public.jobs WHERE id = x.job_id)) AS c
        FROM public.ratings x
        WHERE x.to_id = v_me AND x.side = 'customer' AND public.rating_revealed(x.job_id)
        ORDER BY x.created_at DESC LIMIT 5) s), '[]'::jsonb),
    'lines', coalesce((
      SELECT jsonb_agg(l ORDER BY l ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('kind', t.kind, 'ref', t.job_ref, 'amount_paisa', e.amount_paisa,
                                  'method', t.method, 'reference', t.reference, 'at', t.created_at) AS l
        FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id
        WHERE e.account = 'pro_owes' AND e.pro_id = v_me
        ORDER BY t.created_at DESC LIMIT 30) s), '[]'::jsonb)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_money()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'extend_days', jsonb_build_object('min', public.setting('pay_extend_min_days'), 'max', public.setting('pay_extend_max_days'),
                                      'default', public.setting('pay_extend_default_days')),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'totals', (SELECT jsonb_build_object(
                 'owed_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'pro_owes'), 0),
                 'commission_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'commission'), 0),
                 'reserve_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'reserve'), 0),
                 'received_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'received'), 0))
               FROM public.ledger_entries e),
    'pros', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'full_name', r.full_name, 'phone', public.phone_of(u.id), 'status', r.status,
          'owed_paisa', public.pro_owed(r.id),
          'blocked', public.pro_owed(r.id) > public.setting('credit_limit_paisa'),
          'jobs_done', (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done'),
          'last_paid_at', (SELECT max(t.created_at) FROM public.ledger_txns t WHERE t.pro_id = r.id AND t.kind = 'settlement'),
          'rating', public.pro_rating(r.id),
          -- D36: overdue fees, a waiting payment, extra time.
          'pay', public.pay_state(r.id)
        ) ORDER BY public.pro_owed(r.id) DESC, r.full_name)
      FROM public.pros r LEFT JOIN auth.users u ON u.id = r.id
      WHERE r.status IN ('approved', 'suspended') OR public.pro_owed(r.id) <> 0), '[]'::jsonb)
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
      'created_at', x.created_at, 'decided_at', x.decided_at, 'decided_by', x.decided_by,
      -- D36: how long it has waited, in business days, and whether it now needs attention.
      'business_days', public.business_days_between(public.pk_day(x.created_at), public.pk_day(now())),
      'needs_attention', x.needs_attention_at IS NOT NULL AND x.status = 'pending'
    ) ORDER BY (x.needs_attention_at IS NOT NULL AND x.status = 'pending') DESC, x.created_at DESC)
    FROM public.payment_claims x JOIN public.pros r ON r.id = x.pro_id
    WHERE p_status IS NULL OR x.status = p_status
  ), '[]'::jsonb) END;
$$;




-- --- Visit-fee refunds: recorded, appealed, then posted ---------------------------------------------

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
    IF v_fee.refund IS NULL OR v_fee.refund NOT IN ('owed', 'charge_pending') THEN
      RETURN public.refuse('No money is owed back on this fee.');
    END IF;
    UPDATE public.visit_fees SET refund = 'returned' WHERE id = p_fee RETURNING * INTO v_fee;
  ELSIF p_action = 'refund_charge' THEN
    IF v_fee.refund IS DISTINCT FROM 'owed' THEN
      RETURN public.refuse('No money is owed back on this fee.');
    END IF;
    -- D36: recorded, not posted. He may appeal for appeal_days; only then is it a debt (post_refund_charge).
    UPDATE public.visit_fees
    SET refund = 'charge_pending', refund_charge_due = now() + make_interval(days => public.setting('appeal_days')::integer)
    WHERE id = p_fee RETURNING * INTO v_fee;
    PERFORM public.tell(v_fee.pro_id, 'fee_refund_pending', v_fee.job_id, '/pro/money',
      public.fee_vars(v_fee) || jsonb_build_object('date', to_char(v_fee.refund_charge_due AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon')));
  ELSIF p_action IN ('refund_keep', 'refund_cancel') THEN
    IF v_fee.refund_appeal_at IS NULL OR v_fee.refund_appeal_outcome IS NOT NULL
       OR NOT (v_fee.refund = 'charge_pending' OR (v_fee.refund = 'charged' AND v_fee.refund_finalized_at IS NULL)) THEN
      RETURN public.refuse('There is no appeal waiting on this fee.');
    END IF;
    UPDATE public.visit_fees
    SET refund_appeal_outcome = CASE WHEN p_action = 'refund_keep' THEN 'kept' ELSE 'cancelled' END,
        refund_appeal_note = v_note, refund_decided_by = v_name, refund_decided_at = now()
    WHERE id = p_fee;
    IF p_action = 'refund_keep' THEN
      PERFORM public.post_refund_charge(p_fee);
    ELSE
      IF v_fee.refund = 'charged' THEN
        -- Charged under the old rule: undone by a reversal, never an edit.
        PERFORM public.post_txn('reverse:' || v_fee.refund_txn, 'reversal', v_fee.job_id, v_fee.pro_id,
          (SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
           FROM public.ledger_entries e WHERE e.txn_id = v_fee.refund_txn),
          NULL, NULL, 'Refund charge cancelled on appeal', v_fee.refund_txn);
      END IF;
      -- Pechkas bears the refund it already paid her.
      UPDATE public.visit_fees SET refund = 'absorbed' WHERE id = p_fee;
    END IF;
    SELECT * INTO v_fee FROM public.visit_fees WHERE id = p_fee;
    PERFORM public.tell(v_fee.pro_id, 'refund_decided', v_fee.job_id, '/pro/money', public.fee_vars(v_fee));
  ELSE
    RETURN public.refuse('Choose what to do.');
  END IF;

  UPDATE public.visit_fees SET office_note = v_note, office_by_name = v_name, office_at = now() WHERE id = p_fee;
  PERFORM public.log_job(v_fee.job_id, 'visit_fee_' || p_action, jsonb_build_object('note', v_note, 'by', v_name));
  RETURN jsonb_build_object('ok', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.visit_fee_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH f AS (
    SELECT to_char(date_trunc('month', v.created_at AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM') AS month,
           v.amount_paisa AS a, v.status, v.covered_unpaid, v.refund, v.cleared_at,
           -- What 10% would have been, on money a customer really paid, rounded down like a commission.
           CASE WHEN v.status = 'paid' THEN public.commission_at(v.amount_paisa, public.setting('commission_bps')::bigint) ELSE 0 END AS might
    FROM public.visit_fees v
  ),
  rows AS (
    SELECT coalesce(month, 'total') AS month, jsonb_build_object(
      'month', coalesce(month, 'total'),
      'count', count(*),
      'recorded_paisa', coalesce(sum(a), 0),
      'paid_count', count(*) FILTER (WHERE status = 'paid'),
      'paid_paisa', coalesce(sum(a) FILTER (WHERE status = 'paid'), 0),
      'outstanding_count', count(*) FILTER (WHERE status IN ('due', 'unpaid')),
      'outstanding_paisa', coalesce(sum(a) FILTER (WHERE status IN ('due', 'unpaid')), 0),
      'disputed_count', count(*) FILTER (WHERE status = 'disputed'),
      'disputed_paisa', coalesce(sum(a) FILTER (WHERE status = 'disputed'), 0),
      'waived_count', count(*) FILTER (WHERE status = 'waived'),
      'waived_paisa', coalesce(sum(a) FILTER (WHERE status = 'waived'), 0),
      -- Of the waived: money paid that he still has to give back, and money already back with her.
      'refund_owed_paisa', coalesce(sum(a) FILTER (WHERE status = 'waived' AND refund = 'owed'), 0),
      'refunded_paisa', coalesce(sum(a) FILTER (WHERE status = 'waived' AND refund IN ('returned', 'charge_pending', 'charged', 'absorbed')), 0),
      'covered_count', count(*) FILTER (WHERE status = 'covered'),
      'covered_paisa', coalesce(sum(a) FILTER (WHERE status = 'covered'), 0),
      'covered_guarantee_paisa', coalesce(sum(a) FILTER (WHERE status = 'covered' AND NOT covered_unpaid), 0),
      'covered_unpaid_paisa', coalesce(sum(a) FILTER (WHERE status = 'covered' AND covered_unpaid), 0),
      'customers_owing_count', count(*) FILTER (WHERE status = 'covered' AND covered_unpaid AND cleared_at IS NULL),
      'kept_paisa', coalesce(sum(a) FILTER (WHERE status IN ('paid', 'covered')), 0),
      'commission_paisa', 0,
      'potential_commission_paisa', coalesce(sum(might), 0)
    ) AS r
    FROM f
    GROUP BY ROLLUP (month)
  )
  SELECT jsonb_build_object(
    'commission_bps', public.setting('commission_bps'),
    'total', (SELECT r FROM rows WHERE month = 'total'),
    'months', coalesce((SELECT jsonb_agg(r ORDER BY month DESC) FROM rows WHERE month <> 'total'), '[]'::jsonb)
  );
$$;


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
    -- D13: where every fee stands, and the commission Pechkas chose not to take.
    'report', public.visit_fee_report(),
    'fees', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 'job_id', v.job_id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(v.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(v.pro_id),
          'amount_paisa', v.amount_paisa, 'payer', v.payer, 'status', v.status, 'status_before', v.status_before,
          'reason', v.reason, 'created_at', v.created_at, 'paid_at', v.paid_at, 'unpaid_at', v.unpaid_at,
          'customer_said', v.customer_said, 'customer_text', v.customer_text, 'customer_said_at', v.customer_said_at,
          'covered_unpaid', v.covered_unpaid, 'covered_at', v.covered_at, 'refund', v.refund, 'cleared_at', v.cleared_at,
          'refund_charge_due', v.refund_charge_due, 'refund_finalized_at', v.refund_finalized_at,
          'refund_appeal_text', v.refund_appeal_text, 'refund_appeal_at', v.refund_appeal_at,
          'refund_appeal_outcome', v.refund_appeal_outcome, 'refund_appeal_note', v.refund_appeal_note,
          'office_note', v.office_note, 'office_by_name', v.office_by_name, 'office_at', v.office_at,
          'change', (SELECT jsonb_build_object('from_paisa', c.from_paisa, 'price_paisa', c.price_paisa, 'reason', c.reason,
                                               'photo', c.photo_path, 'decided_at', c.decided_at, 'decided_by', c.decided_by)
                     FROM public.job_changes c WHERE c.id = v.change_id),
          'customer_unpaid_before', (SELECT count(*) FROM public.visit_fees o
                                     WHERE o.customer_id = v.customer_id AND o.id <> v.id AND (o.unpaid_at IS NOT NULL)),
          'needs_you', v.status IN ('unpaid', 'disputed') OR v.refund = 'owed' OR (v.refund_appeal_at IS NOT NULL AND v.refund_appeal_outcome IS NULL),
          'history', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'what', e.what, 'by', e.actor, 'detail', e.detail) ORDER BY e.at, e.id)
                               FROM public.job_events e WHERE e.job_id = v.job_id
                                 AND (e.what LIKE 'visit_fee%' OR e.what IN ('change_asked', 'change_approved', 'change_declined', 'pro_says_declined'))), '[]'::jsonb)
        ) ORDER BY (v.status IN ('unpaid', 'disputed') OR v.refund = 'owed' OR (v.refund_appeal_at IS NOT NULL AND v.refund_appeal_outcome IS NULL)) DESC, v.created_at DESC)
      FROM public.visit_fees v
      JOIN public.jobs j ON j.id = v.job_id
      JOIN public.profiles p ON p.id = v.customer_id
      LEFT JOIN public.pros r ON r.id = v.pro_id
      WHERE v.created_at > now() - interval '180 days' OR v.status IN ('unpaid', 'disputed') OR v.refund IN ('owed', 'charge_pending')
         OR (v.refund_appeal_at IS NOT NULL AND v.refund_appeal_outcome IS NULL)), '[]'::jsonb),
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




-- --- What people are told: amounts and job numbers only ---------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('pay_due_soon.title',         539, NULL, '{amount} due to Pechkas on {date}', 'technician'),
  ('pay_due_soon.body',          540, NULL, 'For {refs}. Pay it from My account before then.', 'technician'),
  ('pay_due_today.title',        541, NULL, '{amount} due to Pechkas today', 'technician'),
  ('pay_due_today.body',         542, NULL, 'For {refs}. Pay it from My account. Your new offers stop after 3 days of grace.', 'technician'),
  ('pay_last_day.title',         543, NULL, 'Last day to pay {amount}', 'technician'),
  ('pay_last_day.body',          544, NULL, 'For {refs}. Pay today from My account, or your new offers stop at midnight. Jobs you have go on.', 'technician'),
  ('pay_stopped.title',          545, NULL, 'Your new offers have stopped', 'technician'),
  ('pay_stopped.body',           546, NULL, '{amount} for {refs} is overdue. Pay it from My account and they start again. Jobs you have go on.', 'technician'),
  ('pay_extended.title',         547, NULL, 'More time to pay Pechkas', 'technician'),
  ('pay_extended.body',          548, NULL, 'The Pechkas office has given you until {date}. Open My account to read why.', 'technician'),
  ('claim_waiting_office.title', 549, NULL, 'A payment has waited {days} business days', 'office'),
  ('claim_waiting_office.body',  550, NULL, '{name} says he paid {amount}. Check it in Money: his offers are protected until you decide.', 'office'),
  ('fee_refund_pending.title',   551, NULL, 'A visit fee refund will be charged to you: {ref}', 'technician'),
  ('fee_refund_pending.body',    552, NULL, '{amount} goes on what you owe on {date}, unless you appeal before then in My account.', 'technician'),
  ('refund_appeal_office.title', 553, NULL, 'A technician appealed a refund charge: {ref}', 'office'),
  ('refund_appeal_office.body',  554, NULL, 'Read it on the Visit fees page and decide.', 'office'),
  ('refund_decided.title',       555, NULL, 'Your appeal has been decided: {ref}', 'technician'),
  ('refund_decided.body',        556, NULL, 'Open My account to read what the office decided.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 539 AND 556 AND ur IS NULL;


-- --- The clocks ------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  -- 10:00 in Islamabad (05:00 UTC): reminders, and payments the office has not checked.
  PERFORM cron.schedule('pechkas-pay-clock', '0 5 * * *', 'SELECT public.pay_clock()');
  PERFORM cron.schedule('pechkas-refund-clock', '*/10 * * * *', 'SELECT public.refund_clock()');
END $$;


-- --- The day it begins ---------------------------------------------------------------------------

-- A refund charged under the old rule gets the new 7-day appeal from today before it counts.
UPDATE public.visit_fees
SET refund_charge_due = (SELECT p.started_at FROM public.pay_policy p) + make_interval(days => public.setting('appeal_days')::integer)
WHERE refund = 'charged' AND refund_finalized_at IS NULL AND refund_charge_due IS NULL;

-- What each technician's payments have already paid, oldest first, written once as 'opening'.
DO $$
DECLARE
  v_pro uuid;
BEGIN
  FOR v_pro IN SELECT DISTINCT e.pro_id FROM public.ledger_entries e WHERE e.account = 'pro_owes' AND e.pro_id IS NOT NULL LOOP
    PERFORM public.pay_lock(v_pro);
    PERFORM public.pay_rebalance(v_pro, NULL, NOT EXISTS (SELECT 1 FROM public.pay_allocations a WHERE a.pro_id = v_pro));
  END LOOP;
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.pk_day(timestamptz),
  public.pk_midnight(date),
  public.written_once(),
  public.pay_items(uuid),
  public.pay_rebalance(uuid, uuid, boolean),
  public.pay_lock(uuid),
  public.business_day(date),
  public.business_days_between(date, date),
  public.pay_fees(uuid),
  public.pay_blocked(uuid),
  public.pay_state(uuid),
  public.post_refund_charge(uuid),
  public.refund_clock(),
  public.pay_clock(),
  public.admin_extend_pay(uuid, integer, text),
  public.admin_holidays(),
  public.admin_set_holiday(date, text, boolean),
  public.pro_appeal_refund(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.admin_extend_pay(uuid, integer, text),
  public.admin_holidays(),
  public.admin_set_holiday(date, text, boolean),
  public.pro_appeal_refund(uuid, text),
  public.make_offer(uuid, bigint, integer, text, smallint),
  public.pro_feed(),
  public.pro_money(),
  public.admin_money(),
  public.admin_flags(),
  public.admin_visit_fee(uuid, text, text),
  public.admin_visit_fees(),
  public.claim_payment(bigint, text, text, text),
  public.admin_reject_claim(uuid, text),
  public.admin_payment_claims(text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261112200000_pay_by_date')
ON CONFLICT (name) DO NOTHING;

COMMIT;
