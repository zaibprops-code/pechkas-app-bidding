-- =============================================================================
-- My jobs, Past: a customer's finished jobs, twenty at a time, searched and
-- filtered here rather than on the phone (the owner, 24 November 2026).
--
-- my_jobs() hands the phone every job she ever posted, with everything about
-- each one, and the screens ask again every few seconds. That is right for
-- the jobs still happening and wrong for a customer with a hundred finished
-- ones. Past now asks these two instead:
--
--   my_history(…)        one page of her finished jobs — done, stopped (a
--                        visit fee only) or cancelled — newest first, with a
--                        search and three filters, and how many match in all;
--   my_history_facets()  what the filters may offer: the kinds of work she has
--                        actually had, with counts; the days and months she
--                        had a job; what is still under guarantee.
--
-- Both read only the asker's own jobs (customer_id = auth.uid()) and name
-- every field that comes back: no street, house, landmark, pin, gate note or
-- phone — a list of past jobs needs none of them, and the job's own screen
-- still reads my_jobs(). The technician is a first name, and only on a job
-- he worked on (done or stopped), as my_jobs() says it.
--
-- A job's day is when it ended: finished, else cancelled, else posted; on
-- Pakistan's clock (pk_day). The guarantee is guarantee_days_of(), the one
-- rule. What she paid is collect_paisa, fixed when the job ended; a repair
-- Pechkas paid for is "free", never Rs 0.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

/** Her finished jobs, one row each, with the few things Past shows. */
CREATE OR REPLACE FUNCTION public.history_rows(p_customer uuid)
RETURNS TABLE (
  id uuid, ref text, trade text, trade_name text, title text, job_type_id integer,
  status text, cancelled_by text, stop_reason text, paid_by_pechkas boolean,
  at timestamptz, day date, pro text, paid_paisa bigint, guarantee_until timestamptz,
  can_rate boolean, my_rating smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.ref, j.trade, t.name, j.title, j.job_type_id,
         j.status, j.cancelled_by, j.stop_reason, j.paid_by_pechkas,
         x.at, public.pk_day(x.at),
         CASE WHEN j.status IN ('done', 'stopped') THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END,
         CASE WHEN j.status IN ('done', 'stopped') AND NOT j.paid_by_pechkas THEN j.collect_paisa END,
         CASE WHEN j.status = 'done' THEN j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) END,
         j.status IN ('done', 'stopped')
           AND j.finished_at > now() - make_interval(days => public.setting('rating_days')::integer)
           AND NOT EXISTS (SELECT 1 FROM public.ratings g WHERE g.job_id = j.id AND g.side = 'customer'),
         (SELECT g.stars FROM public.ratings g WHERE g.job_id = j.id AND g.side = 'customer')
  FROM public.jobs j
  LEFT JOIN public.trades t ON t.slug = j.trade
  LEFT JOIN public.cancellations c ON c.job_id = j.id
  CROSS JOIN LATERAL (SELECT coalesce(j.finished_at, c.cancelled_at, j.created_at) AS at) x
  WHERE j.customer_id = p_customer
    AND j.status IN ('done', 'stopped', 'cancelled');
$$;

/**
 * One page of her finished jobs. Every word of the search must appear in the
 * job's title, number, kind of work or technician's first name. p_what is
 * all | done | covered (still under guarantee) | fee (visit fee only) |
 * cancelled | nobody (nobody took it). p_from / p_to are days, either may be
 * left out. The next page starts after p_before / p_before_id, the last row
 * of this one. `found` is how many match in all, for "Show 23 jobs".
 */
CREATE OR REPLACE FUNCTION public.my_history(
  p_q text DEFAULT NULL,
  p_what text DEFAULT 'all',
  p_trade text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH words AS (
    SELECT array_remove(regexp_split_to_array(lower(left(trim(coalesce(p_q, '')), 60)), '\s+'), '') AS w
  ),
  matching AS (
    SELECT h.* FROM public.history_rows(auth.uid()) h, words
    WHERE (p_trade IS NULL OR h.trade = p_trade)
      AND (p_from IS NULL OR h.day >= p_from)
      AND (p_to IS NULL OR h.day <= p_to)
      AND CASE coalesce(p_what, 'all')
            WHEN 'done' THEN h.status = 'done'
            WHEN 'covered' THEN h.status = 'done' AND h.guarantee_until > now()
            WHEN 'fee' THEN h.status = 'stopped'
            WHEN 'cancelled' THEN h.status = 'cancelled' AND h.cancelled_by IS DISTINCT FROM 'nobody'
            WHEN 'nobody' THEN h.status = 'cancelled' AND h.cancelled_by = 'nobody'
            ELSE true
          END
      AND NOT EXISTS (
        SELECT 1 FROM unnest(words.w) AS q(word)
        WHERE position(q.word IN lower(concat_ws(' ', h.title, h.ref, h.trade_name, h.trade, h.pro))) = 0
      )
  ),
  page AS (
    SELECT m.* FROM matching m
    WHERE p_before IS NULL OR (m.at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    ORDER BY m.at DESC, m.id DESC
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 50) + 1
  ),
  shown AS (
    SELECT * FROM page ORDER BY at DESC, id DESC LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  SELECT jsonb_build_object(
    'jobs', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'ref', s.ref, 'trade', s.trade, 'title', s.title, 'job_type_id', s.job_type_id,
        'status', s.status, 'cancelled_by', s.cancelled_by, 'stop_reason', s.stop_reason,
        'free', s.paid_by_pechkas, 'at', s.at, 'day', s.day, 'pro', s.pro, 'paid_paisa', s.paid_paisa,
        'guarantee_until', s.guarantee_until, 'covered', coalesce(s.guarantee_until > now(), false),
        'can_rate', s.can_rate, 'my_rating', s.my_rating
      ) ORDER BY s.at DESC, s.id DESC) FROM shown s), '[]'::jsonb),
    'more', (SELECT count(*) FROM page) > least(greatest(coalesce(p_limit, 20), 1), 50),
    'found', (SELECT count(*) FROM matching)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

/** What the filters may offer: only what is in her own finished jobs. */
CREATE OR REPLACE FUNCTION public.my_history_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH h AS (SELECT * FROM public.history_rows(auth.uid()))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM h),
    'since', (SELECT min(h.day) FROM h),
    'trades', coalesce((SELECT jsonb_agg(jsonb_build_object('trade', x.trade, 'n', x.n) ORDER BY x.n DESC, x.trade)
                        FROM (SELECT h.trade, count(*) AS n FROM h GROUP BY h.trade) x), '[]'::jsonb),
    'days', coalesce((SELECT jsonb_agg(DISTINCT h.day) FROM h), '[]'::jsonb),
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('month', x.month, 'n', x.n, 'paid_paisa', x.paid) ORDER BY x.month DESC)
                        FROM (SELECT to_char(h.day, 'YYYY-MM') AS month, count(*) AS n, coalesce(sum(h.paid_paisa), 0) AS paid
                              FROM h GROUP BY 1) x), '[]'::jsonb),
    'what', jsonb_build_object(
      'done', (SELECT count(*) FROM h WHERE h.status = 'done'),
      'covered', (SELECT count(*) FROM h WHERE h.status = 'done' AND h.guarantee_until > now()),
      'fee', (SELECT count(*) FROM h WHERE h.status = 'stopped'),
      'cancelled', (SELECT count(*) FROM h WHERE h.status = 'cancelled' AND h.cancelled_by IS DISTINCT FROM 'nobody'),
      'nobody', (SELECT count(*) FROM h WHERE h.status = 'cancelled' AND h.cancelled_by = 'nobody')),
    'covered', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'trade', h.trade,
                                                            'pro', h.pro, 'until', h.guarantee_until) ORDER BY h.guarantee_until)
                         FROM h WHERE h.status = 'done' AND h.guarantee_until > now()), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.history_rows(uuid),
  public.my_history(text, text, text, date, date, timestamptz, uuid, integer),
  public.my_history_facets()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.my_history(text, text, text, date, date, timestamptz, uuid, integer),
  public.my_history_facets()
TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261124000000_job_history')
ON CONFLICT (name) DO NOTHING;

COMMIT;
