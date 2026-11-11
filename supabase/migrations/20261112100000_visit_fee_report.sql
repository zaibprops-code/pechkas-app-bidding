-- =============================================================================
--  Visit fees: the totals, and the commission Pechkas chose not to take (D13)
-- =============================================================================
--
--  The owner's decision D13 (11 November 2026): Pechkas takes NO commission on
--  a visit fee, and the technician keeps all of it — exactly what A36 already
--  built, so nothing about money changes here. What is added is a report, so
--  the decision can be looked at again with real numbers.
--
--  visit_fee_report() puts every fee in ONE place, by where it stands today:
--
--    paid         the customer paid him                       (status paid)
--    outstanding  not paid yet, or he says she has not        (due, unpaid)
--    disputed     she disagrees; the office has not decided   (disputed)
--    waived       nobody pays it; any money paid goes back    (waived)
--    covered      Pechkas paid him: a guarantee repair, or a fee she did not pay
--
--  so recorded = paid + outstanding + disputed + waived + covered, by count and
--  by rupees, every month and in total, and a fee can never be counted twice.
--  "Kept by technicians" is paid + covered. "Potential commission" is 10% (the
--  locked commission_bps) of what customers actually PAID, rounded down per fee
--  like a real commission: what Pechkas would have earned. It is a figure on a
--  report and nothing else — never a ledger line, never a balance, never a
--  share of anybody's money. Pechkas' real commission on visit fees is 0.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;

/** Where every visit fee stands, by the month it was recorded (Pakistan's clock), and in total. For the office only. */
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
      'refunded_paisa', coalesce(sum(a) FILTER (WHERE status = 'waived' AND refund IN ('returned', 'charged')), 0),
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

REVOKE ALL ON FUNCTION public.visit_fee_report() FROM PUBLIC, anon, authenticated;

/** The office's Visit fees page, now with the report (unchanged otherwise). */
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

GRANT EXECUTE ON FUNCTION public.admin_visit_fees() TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261112100000_visit_fee_report')
ON CONFLICT (name) DO NOTHING;

COMMIT;
