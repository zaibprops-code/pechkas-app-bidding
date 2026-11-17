-- =============================================================================
--  Launch offers (the owner's decision D38, A99–A101, 17 November 2026)
-- =============================================================================
--
--  A99, a launch rate that belongs to each technician, not the calendar:
--   - 5% (launch_bps) instead of 10%, and instead of 7% for a repeat
--     customer, on his jobs in a trade FROM HIS 3RD GOOD FIRST JOB THERE.
--   - His 90 days (launch_days) start when that trade is approved, and the
--     5% ends no later than 12 months (launch_cap_months) after his 3rd
--     good job, whatever happens: a late identity service cannot stretch it.
--   - Only for technicians who applied by the cut-off day (launch_apply_by,
--     YYYYMMDD). It is 0, "not set", until the owner gives the date, and
--     while it is not set the offer is off for everybody.
--   - The rate is FIXED WHEN THE CUSTOMER CHOOSES HIM (jobs.launch_bps), so
--     the rate he sees before he offers can only stay or fall.
--   - His first 3 jobs in each trade keep the full commission: paying it
--     shows whether he pays Pechkas.
--
--  A100, a credit for bringing in another technician:
--   - A newcomer names the referrer's code (set_referrer) until his own
--     application is approved. Rs 1,000 (referral_credit_paisa), at most 5
--     newcomers (referral_cap) per referrer.
--   - Earned only once the newcomer has 3 good first jobs in a trade AND the
--     30-day "Not received" window has passed on every payment of his own
--     that paid their commission. Until then the referrer sees it as
--     "Pending". Afterwards it is kept, whatever happens to those jobs.
--   - Never cash: it only pays fees (pay_rebalance never lets it pay a
--     payout), it never shows as money Pechkas owes him, and it never counts
--     as payment for a first job (fee_paid_final ignores it).
--
--  A101: no customer discount. Nothing here.
--
--  The numbers are locked: the technician agreement states them. Part of
--  edition 8. Safe to run twice. At the very end, after COMMIT, a list of
--  approved technicians with no first-job record: none are expected; such
--  a technician gets no launch rate, and nothing else changes for him.

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('launch_bps', 500, 'basis_points', 'The launch rate (A99): 5% of the labour. Locked: the technician agreement states it.'),
  ('launch_days', 90, 'days', 'Days of launch rate after his trade is approved (A99). Locked.'),
  ('launch_cap_months', 12, 'count', 'The launch rate ends no later than this many months after his 3rd good first job (A99). Locked.'),
  ('launch_apply_by', 0, 'count', 'Last day to apply for the launch rate, as YYYYMMDD (A99). 0 = not set: the offer is off. Set by a migration when the owner gives the date.'),
  ('referral_credit_paisa', 100000, 'paisa', 'Credit for bringing in another technician (A100): Rs 1,000. Locked.'),
  ('referral_cap', 5, 'count', 'Most newcomers one technician is credited for (A100). Locked.')
ON CONFLICT (key) DO NOTHING;
DELETE FROM public.setting_limits
WHERE key IN ('launch_bps', 'launch_days', 'launch_cap_months', 'launch_apply_by', 'referral_credit_paisa', 'referral_cap');

-- A referral credit: a credit to him, a cost to Pechkas (account "promotions").
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.ledger_txns'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%kind = ANY%' LOOP
    EXECUTE format('ALTER TABLE public.ledger_txns DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.ledger_entries'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%account = ANY%' LOOP
    EXECUTE format('ALTER TABLE public.ledger_entries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.ledger_txns ADD CONSTRAINT ledger_txns_kind_check
  CHECK (kind IN ('commission', 'settlement', 'reversal', 'guarantee_pay', 'guarantee_charge', 'payout',
                  'visit_fee_cover', 'visit_fee_refund', 'checker_fee', 'referral_credit'));
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_account_check
  CHECK (account IN ('pro_owes', 'commission', 'reserve', 'received', 'checks', 'promotions'));

-- The app's store link, typed by the office once the app is public. Empty: no "Tell a technician" button.
ALTER TABLE public.office_info DROP CONSTRAINT IF EXISTS office_info_key_check;
ALTER TABLE public.office_info ADD CONSTRAINT office_info_key_check CHECK (key IN ('pay_to', 'app_link'));


-- --- A99: the launch rate -----------------------------------------------------------------------------

-- When each trade first reached 3 good first jobs, and was first approved. Set once, never moved.
CREATE TABLE IF NOT EXISTS public.launch_marks (
  pro_id        uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade         text NOT NULL,
  third_good_at timestamptz NOT NULL,
  approved_at   timestamptz,
  PRIMARY KEY (pro_id, trade)
);
ALTER TABLE public.launch_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_marks FROM anon, authenticated;

-- The rate fixed on a job when she chooses him: 500, or NULL for the usual rate.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS launch_bps integer;

/** The cut-off day, or NULL while it is not set. */
CREATE OR REPLACE FUNCTION public.launch_cutoff_day()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN public.setting('launch_apply_by') > 0
              THEN to_date(public.setting('launch_apply_by')::text, 'YYYYMMDD') END;
$$;

/**
 * When his launch rate in a trade ends: 90 days after approval, never later
 * than 12 months after his 3rd good job; at midnight in Islamabad at the end
 * of that day, so "if you are chosen by 12 Mar" is exactly true.
 */
CREATE OR REPLACE FUNCTION public.launch_until(p_pro uuid, p_trade text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pk_midnight(public.pk_day(least(
           coalesce(m.approved_at + make_interval(days => public.setting('launch_days')::integer), 'infinity'::timestamptz),
           m.third_good_at + make_interval(months => public.setting('launch_cap_months')::integer))) + 1)
  FROM public.launch_marks m WHERE m.pro_id = p_pro AND m.trade = p_trade;
$$;

/** Would a job in this trade, chosen at this moment, be at the launch rate? The one rule. */
CREATE OR REPLACE FUNCTION public.launch_applies(p_pro uuid, p_trade text, p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.launch_cutoff_day() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = p_pro
                 AND r.applied_at < public.pk_midnight(public.launch_cutoff_day() + 1))
     AND EXISTS (SELECT 1 FROM public.launch_marks m WHERE m.pro_id = p_pro AND m.trade = p_trade
                 AND p_at >= m.third_good_at AND p_at < public.launch_until(p_pro, p_trade))
     -- Still 3 good first jobs now: one that stopped counting stops the 5% until it counts again.
     AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = p_trade AND x.status = 'good')
         >= public.setting('trial_jobs');
$$;

/** Has this pair finished a job together before? (The 7% rule, on its own, so a launch rate is never called "repeat".) */
CREATE OR REPLACE FUNCTION public.repeat_pair(p_customer uuid, p_pro uuid, p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.jobs d
                 WHERE d.customer_id = p_customer AND d.pro_id = p_pro AND d.status = 'done'
                   AND d.id IS DISTINCT FROM p_job);
$$;

/**
 * The commission rate, still the one place it is decided. The usual rate
 * (10%, or 7% for a repeat customer), lowered to the launch rate when it
 * applies: on a job he has been chosen for, as fixed when she chose him;
 * on an open job, as it would be if she chose him now.
 */
CREATE OR REPLACE FUNCTION public.commission_rate(p_customer uuid, p_pro uuid, p_job uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH b AS (SELECT CASE WHEN public.repeat_pair(p_customer, p_pro, p_job)
                         THEN public.setting('repeat_commission_bps') ELSE public.setting('commission_bps') END AS base),
  j AS (SELECT id, status, pro_id, trade, launch_bps FROM public.jobs WHERE id = p_job)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM j WHERE j.status <> 'open' AND j.pro_id = p_pro)
      THEN least(b.base, coalesce((SELECT j.launch_bps FROM j), b.base))
    WHEN EXISTS (SELECT 1 FROM j) AND public.launch_applies(p_pro, (SELECT j.trade FROM j), now())
      THEN least(b.base, public.setting('launch_bps'))
    ELSE b.base END
  FROM b;
$$;

/** Fixes the launch rate on a job the moment a technician is given it; clears it when the job goes back. */
CREATE OR REPLACE FUNCTION public.job_launch_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'assigned' AND NEW.pro_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'assigned' OR OLD.pro_id IS DISTINCT FROM NEW.pro_id) THEN
    NEW.launch_bps := CASE WHEN NOT coalesce(NEW.paid_by_pechkas, false) AND public.launch_applies(NEW.pro_id, NEW.trade, now())
                           THEN public.setting('launch_bps')::integer END;
  ELSIF NEW.status = 'open' THEN
    NEW.launch_bps := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_launch_rate ON public.jobs;
CREATE TRIGGER job_launch_rate BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_launch_rate();

/** A first job turned good: the 3rd in a trade marks the start of his launch rate, once. */
CREATE OR REPLACE FUNCTION public.trial_launch_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'good' AND OLD.status IS DISTINCT FROM 'good'
     AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = NEW.pro_id AND x.trade = NEW.trade AND x.status = 'good')
         >= public.setting('trial_jobs') THEN
    INSERT INTO public.launch_marks (pro_id, trade, third_good_at) VALUES (NEW.pro_id, NEW.trade, now())
    ON CONFLICT (pro_id, trade) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trial_launch_mark ON public.trial_jobs;
CREATE TRIGGER trial_launch_mark AFTER UPDATE OF status ON public.trial_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trial_launch_mark();

/** A trade approved: his 90 days start, the first time only. */
CREATE OR REPLACE FUNCTION public.trade_launch_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.launch_marks SET approved_at = now()
    WHERE pro_id = NEW.pro_id AND trade = NEW.trade AND approved_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trade_launch_mark ON public.pro_trades;
CREATE TRIGGER trade_launch_mark AFTER UPDATE OF status ON public.pro_trades
  FOR EACH ROW EXECUTE FUNCTION public.trade_launch_mark();


-- --- A100: bringing in another technician -------------------------------------------------------------

ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS ref_code    text;
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.pros(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pros_ref_code_once ON public.pros (ref_code) WHERE ref_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referral_credits (
  newcomer_id  uuid PRIMARY KEY REFERENCES public.pros(id) ON DELETE CASCADE,
  referrer_id  uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'over_cap')),
  trade        text,
  earn_at      timestamptz,
  earned_at    timestamptz,
  amount_paisa bigint,
  txn_id       uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_credits FROM anon, authenticated;

/** His code, made the first time he asks once he is approved: his first name's letters and two digits. */
CREATE OR REPLACE FUNCTION public.referral_code(p_pro uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_base text;
  v_i    integer := 0;
BEGIN
  SELECT ref_code INTO v_code FROM public.pros WHERE id = p_pro AND status = 'approved' FOR UPDATE;
  IF v_code IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro AND status = 'approved') THEN
    RETURN v_code;
  END IF;
  v_base := left(upper(regexp_replace(coalesce((SELECT first_name FROM public.profiles WHERE id = p_pro), ''), '[^A-Za-z]', '', 'g')), 6);
  IF length(v_base) < 2 THEN
    v_base := 'PK';
  END IF;
  LOOP
    v_i := v_i + 1;
    v_code := v_base || (10 + floor(random() * (CASE WHEN v_i < 20 THEN 90 ELSE 9990 END))::integer)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.pros WHERE ref_code = v_code);
  END LOOP;
  UPDATE public.pros SET ref_code = v_code WHERE id = p_pro;
  RETURN v_code;
END;
$$;

/** The newcomer names who told him, until his application is approved. Empty clears it. */
CREATE OR REPLACE FUNCTION public.set_referrer(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ref  uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN public.refuse('Apply as a technician first.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pros WHERE id = v_me AND status IN ('approved', 'suspended')) THEN
    RETURN public.refuse('Your application is approved, so the code can no longer be changed.', 'code');
  END IF;
  IF v_code = '' THEN
    UPDATE public.pros SET referred_by = NULL WHERE id = v_me;
    DELETE FROM public.referral_credits WHERE newcomer_id = v_me AND status = 'pending';
    RETURN jsonb_build_object('ok', true);
  END IF;
  SELECT id INTO v_ref FROM public.pros WHERE ref_code = v_code AND status = 'approved';
  IF v_ref IS NULL THEN
    RETURN public.refuse('No technician has that code. Check it with the person who sent it.', 'code');
  END IF;
  IF v_ref = v_me THEN
    RETURN public.refuse('That is your own code.', 'code');
  END IF;
  UPDATE public.pros SET referred_by = v_ref WHERE id = v_me;
  INSERT INTO public.referral_credits (newcomer_id, referrer_id) VALUES (v_me, v_ref)
  ON CONFLICT (newcomer_id) DO UPDATE SET referrer_id = EXCLUDED.referrer_id
  WHERE public.referral_credits.status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** What of his referral credits is still unspent: it pays his next fees, never his pocket. */
CREATE OR REPLACE FUNCTION public.promo_free(p_pro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(i.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a
                                           WHERE a.credit_txn = i.txn AND a.pro_id = p_pro), 0)), 0)::bigint
  FROM public.pay_items(p_pro) i WHERE i.kind = 'referral_credit' AND i.live;
$$;

/**
 * One newcomer's credit, looked at again. It waits until he has 3 good
 * first jobs in a trade, each one's commission paid by money of his that is
 * final, and until the 30-day "Not received" window has passed on every
 * payment of his that paid them. Then it is earned, within the cap.
 */
CREATE OR REPLACE FUNCTION public.referral_review(p_newcomer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rc     public.referral_credits;
  v_trade  text;
  v_jobs   uuid[];
  v_txns   uuid[];
  v_earn   timestamptz;
  v_amount bigint := public.setting('referral_credit_paisa');
  v_txn    uuid;
BEGIN
  SELECT * INTO v_rc FROM public.referral_credits WHERE newcomer_id = p_newcomer FOR UPDATE;
  IF v_rc.newcomer_id IS NULL OR v_rc.status <> 'pending' THEN
    RETURN v_rc.status;
  END IF;
  -- His earliest trade with 3 good first jobs now, and those 3 jobs.
  SELECT m.trade INTO v_trade FROM public.launch_marks m
  WHERE m.pro_id = p_newcomer
    AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_newcomer AND x.trade = m.trade AND x.status = 'good')
        >= public.setting('trial_jobs')
  ORDER BY m.third_good_at LIMIT 1;
  IF v_trade IS NULL THEN
    UPDATE public.referral_credits SET trade = NULL, earn_at = NULL WHERE newcomer_id = p_newcomer;
    RETURN 'pending';
  END IF;
  SELECT array_agg(job_id) INTO v_jobs FROM (
    SELECT x.job_id FROM public.trial_jobs x WHERE x.pro_id = p_newcomer AND x.trade = v_trade AND x.status = 'good'
    ORDER BY x.decided_at, x.job_id LIMIT public.setting('trial_jobs')) s;
  SELECT array_agg(t.id) INTO v_txns FROM public.ledger_txns t
  WHERE t.idempotency_key = ANY (SELECT 'commission:' || j FROM unnest(v_jobs) AS j);
  IF cardinality(v_txns) IS DISTINCT FROM cardinality(v_jobs)
     OR EXISTS (SELECT 1 FROM unnest(v_txns) AS f WHERE NOT public.fee_paid_final(p_newcomer, f)) THEN
    UPDATE public.referral_credits SET trade = v_trade, earn_at = NULL WHERE newcomer_id = p_newcomer;
    RETURN 'pending';
  END IF;
  -- The last day any of his own payments behind them could still be marked "Not received".
  SELECT max(c.correct_until) INTO v_earn
  FROM public.payment_claims c
  WHERE c.status = 'counted' AND c.txn_id IN (
    SELECT a.credit_txn FROM public.pay_allocations a
    WHERE a.pro_id = p_newcomer AND a.debit_txn = ANY (v_txns)
    GROUP BY a.credit_txn HAVING sum(a.amount_paisa) > 0);
  v_earn := coalesce(v_earn, now());
  IF v_earn > now() THEN
    UPDATE public.referral_credits SET trade = v_trade, earn_at = v_earn WHERE newcomer_id = p_newcomer;
    RETURN 'pending';
  END IF;
  -- Earned, within the cap.
  IF (SELECT count(*) FROM public.referral_credits r WHERE r.referrer_id = v_rc.referrer_id AND r.status = 'earned')
     >= public.setting('referral_cap') THEN
    UPDATE public.referral_credits SET status = 'over_cap', trade = v_trade, earn_at = now() WHERE newcomer_id = p_newcomer;
    RETURN 'over_cap';
  END IF;
  v_txn := public.post_txn('referral:' || p_newcomer::text, 'referral_credit', NULL, v_rc.referrer_id, jsonb_build_array(
    jsonb_build_object('account', 'promotions', 'amount', v_amount),
    jsonb_build_object('account', 'pro_owes', 'pro_id', v_rc.referrer_id, 'amount', -v_amount)),
    NULL, NULL, 'Bringing in a technician');
  UPDATE public.referral_credits
  SET status = 'earned', trade = v_trade, earn_at = now(), earned_at = now(), amount_paisa = v_amount, txn_id = v_txn
  WHERE newcomer_id = p_newcomer;
  PERFORM public.tell(v_rc.referrer_id, 'referral_earned', NULL, '/pro/money', jsonb_build_object(
    'amount', public.rs(v_amount),
    'name', (SELECT p.first_name FROM public.profiles p WHERE p.id = p_newcomer)));
  RETURN 'earned';
END;
$$;

/** Every 10 minutes: pending referral credits whose time has come. */
CREATE OR REPLACE FUNCTION public.launch_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR v_id IN SELECT newcomer_id FROM public.referral_credits WHERE status = 'pending' ORDER BY created_at LOOP
    IF public.referral_review(v_id) = 'earned' THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;


-- --- His screen, and the office's ---------------------------------------------------------------------

/** His launch rate per trade, his code, who he brought in, and the app link to share. */
CREATE OR REPLACE FUNCTION public.my_launch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_r  public.pros;
BEGIN
  SELECT * INTO v_r FROM public.pros WHERE id = v_me;
  IF v_r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'why', 'Only a technician has a launch rate.');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'cutoff', public.launch_cutoff_day(),
    'eligible', public.launch_cutoff_day() IS NOT NULL AND v_r.applied_at < public.pk_midnight(public.launch_cutoff_day() + 1),
    'bps', public.setting('launch_bps'),
    'days', public.setting('launch_days'),
    'trades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'trade', t.trade, 'name', tr.name,
          'good', (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = v_me AND x.trade = t.trade AND x.status = 'good'),
          'third_good_at', m.third_good_at, 'approved_at', m.approved_at,
          'until', public.launch_until(v_me, t.trade),
          'on', public.launch_applies(v_me, t.trade, now())) ORDER BY tr.sort)
      FROM public.pro_trades t JOIN public.trades tr ON tr.slug = t.trade
      LEFT JOIN public.launch_marks m ON m.pro_id = v_me AND m.trade = t.trade
      WHERE t.pro_id = v_me), '[]'::jsonb),
    'code', public.referral_code(v_me),
    'referred_by_code', (SELECT r.ref_code FROM public.pros r WHERE r.id = v_r.referred_by),
    'can_change_code', v_r.status NOT IN ('approved', 'suspended'),
    'credit_paisa', public.setting('referral_credit_paisa'),
    'cap', public.setting('referral_cap'),
    'earned', (SELECT count(*) FROM public.referral_credits c WHERE c.referrer_id = v_me AND c.status = 'earned'),
    'promo_free_paisa', public.promo_free(v_me),
    'brought_in', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'name', p.first_name, 'status', c.status, 'earn_at', c.earn_at, 'earned_at', c.earned_at,
          'good', (SELECT max(n) FROM (SELECT count(*) AS n FROM public.trial_jobs x
                                       WHERE x.pro_id = c.newcomer_id AND x.status = 'good' GROUP BY x.trade) g))
        ORDER BY c.created_at)
      FROM public.referral_credits c JOIN public.profiles p ON p.id = c.newcomer_id
      WHERE c.referrer_id = v_me), '[]'::jsonb),
    'app_link', (SELECT value FROM public.office_info WHERE key = 'app_link'));
END;
$$;

/** The office: the offer's settings, the app link, and every referral with where it stands. */
CREATE OR REPLACE FUNCTION public.admin_launch()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'cutoff', public.launch_cutoff_day(),
    'bps', public.setting('launch_bps'),
    'days', public.setting('launch_days'),
    'cap_months', public.setting('launch_cap_months'),
    'credit_paisa', public.setting('referral_credit_paisa'),
    'cap', public.setting('referral_cap'),
    'app_link', (SELECT value FROM public.office_info WHERE key = 'app_link'),
    'on_launch_rate', (SELECT count(DISTINCT m.pro_id) FROM public.launch_marks m WHERE public.launch_applies(m.pro_id, m.trade, now())),
    'referrals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'referrer', rr.full_name, 'newcomer', rn.full_name, 'status', c.status, 'trade', c.trade,
          'earn_at', c.earn_at, 'earned_at', c.earned_at, 'amount_paisa', c.amount_paisa, 'since', c.created_at)
        ORDER BY c.created_at DESC)
      FROM public.referral_credits c JOIN public.pros rr ON rr.id = c.referrer_id JOIN public.pros rn ON rn.id = c.newcomer_id), '[]'::jsonb)
  ) END;
$$;

/** The store link the "Tell a technician" message carries. Empty: no button. */
CREATE OR REPLACE FUNCTION public.admin_set_app_link(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_text IS NULL THEN
    DELETE FROM public.office_info WHERE key = 'app_link';
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF v_text !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s]*)?$' OR length(v_text) > 300 THEN
    RETURN public.refuse('Paste the whole link, starting with https://', 'app_link');
  END IF;
  INSERT INTO public.office_info (key, value, updated_at, updated_by_name)
  VALUES ('app_link', v_text, now(), (SELECT name FROM public.staff WHERE id = auth.uid()))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by_name = EXCLUDED.updated_by_name;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Never cash: a referral credit pays fees and nothing else ------------------------------------------

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
      OR (t.kind IN ('settlement', 'guarantee_pay', 'visit_fee_cover', 'checker_fee', 'referral_credit') AND s.amount < 0));
$$;

/**
 * The one step (D36), unchanged except for one rule: a referral credit
 * pays only fees, never a payout, so money already sent to him can never be
 * covered by it. The oldest credit that has something it may pay goes first.
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
  v_kind   text;
  v_free   bigint;
  v_debit  uuid;
  v_unpaid bigint;
  v_amt    bigint;
BEGIN
  -- Take back every allocation that touches something reversed, or a debt not yet payable.
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
    SELECT c.txn, c.kind, c.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.credit_txn = c.txn AND a.pro_id = p_pro), 0)
    INTO v_credit, v_kind, v_free
    FROM public.pay_items(p_pro) c
    WHERE c.side = 'credit' AND c.live
      AND c.amount > coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.credit_txn = c.txn AND a.pro_id = p_pro), 0)
      AND EXISTS (SELECT 1 FROM public.pay_items(p_pro) d
                  WHERE d.side IN ('fee', 'payout') AND d.live AND d.payable
                    AND (c.kind <> 'referral_credit' OR d.side = 'fee')
                    AND d.amount > coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.debit_txn = d.txn AND a.pro_id = p_pro), 0))
    ORDER BY c.posted_at, c.txn LIMIT 1;
    EXIT WHEN v_credit IS NULL;
    SELECT i.txn, i.amount - coalesce((SELECT sum(a.amount_paisa) FROM public.pay_allocations a WHERE a.debit_txn = i.txn AND a.pro_id = p_pro), 0)
    INTO v_debit, v_unpaid
    FROM public.pay_items(p_pro) i
    WHERE i.side IN ('fee', 'payout') AND i.live AND i.payable
      AND (v_kind <> 'referral_credit' OR i.side = 'fee')
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
                   WHERE a.pro_id = p_pro AND a.debit_txn = p_txn AND public.credit_final(a.credit_txn)
                     -- A100: a referral credit lowers what he owes, but never proves he paid Pechkas.
                     AND NOT EXISTS (SELECT 1 FROM public.ledger_txns t WHERE t.id = a.credit_txn AND t.kind = 'referral_credit')), 0)
         >= (SELECT amount FROM fee);
$$;

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
    -- A100: unspent referral credit is never money Pechkas owes him.
    FROM public.pros r CROSS JOIN LATERAL (SELECT public.pro_owed(r.id) + public.promo_free(r.id) AS owed) o
    WHERE o.owed < 0), '[]'::jsonb);
END;
$$;

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
  -- A100: unspent referral credit is never paid out.
  v_owed := public.pro_owed(p_pro) + public.promo_free(p_pro);
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


-- --- The screens' figures: the rate he sees, and "repeat" only when it is ------------------------------

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
          'repeat', public.repeat_pair(j.customer_id, auth.uid(), j.id),
          -- A99: the launch rate if she chose him now, and until when.
          'launch', public.launch_applies(auth.uid(), j.trade, now()),
          'launch_until', CASE WHEN public.launch_applies(auth.uid(), j.trade, now()) THEN public.launch_until(auth.uid(), j.trade) END,
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
      'repeat', public.repeat_pair(j.customer_id, j.pro_id, j.id),
      -- A99: fixed when she chose him.
      'launch', j.launch_bps IS NOT NULL,
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
    ) || jsonb_build_object(
      -- D37: her answer at the door, his first jobs, his checker.
      'face_needed', j.face_confirmed_at IS NULL AND EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = j.pro_id),
      'first_job', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id),
      'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind,
                                          'checker', CASE WHEN k.kind = 'app' THEN split_part(k.checker_name, ' ', 1) END)
                FROM public.risk_checks k WHERE k.job_id = j.id AND k.pro_id = j.pro_id AND k.status IN ('asked', 'accepted') LIMIT 1)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
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
      -- A100: newcomers he brought in whose first jobs failed the customer checks.
      (SELECT count(DISTINCT n.id) FROM public.pros n JOIN public.trial_jobs x ON x.pro_id = n.id
        WHERE n.referred_by = r.id AND x.status = 'not_counted'
          AND x.why IN ('same_person', 'repeat_customer', 'too_close', 'new_account')) AS referral_pattern,
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
        public.flag_if('referral_pattern', p.referral_pattern, 2),
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


-- --- What he is told ------------------------------------------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('referral_earned.title', 627, NULL, 'You have earned a credit of {amount}', 'technician'),
  ('referral_earned.body',  628, NULL, '{name} has done 3 good first jobs. The credit is taken off what you owe Pechkas.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
-- Unused (English only), filled so an older file can be run again: the same as since D10.
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 627 AND 628 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-launch', '*/10 * * * *', 'SELECT public.launch_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.launch_cutoff_day(),
  public.launch_until(uuid, text),
  public.launch_applies(uuid, text, timestamptz),
  public.repeat_pair(uuid, uuid, uuid),
  public.job_launch_rate(),
  public.trial_launch_mark(),
  public.trade_launch_mark(),
  public.referral_code(uuid),
  public.promo_free(uuid),
  public.referral_review(uuid),
  public.launch_clock(),
  public.set_referrer(text),
  public.my_launch(),
  public.admin_launch(),
  public.admin_set_app_link(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.set_referrer(text),
  public.my_launch(),
  public.admin_launch(),
  public.admin_set_app_link(text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261117100000_launch_offers')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- The owner's safety check: an approved technician with no first-job record gets no launch rate, and
-- nothing else changes for him. None are expected (nobody real can sign in before D20); test accounts may show.
SELECT r.full_name AS "Approved technician with no first-job record (none expected)",
       r.applied_at::date AS "Applied",
       'Gets no launch rate. Nothing else changes. Tell Claude if this is a real technician.' AS "What it means"
FROM public.pros r
WHERE r.status = 'approved' AND NOT EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.pro_id = r.id)
ORDER BY r.applied_at;
