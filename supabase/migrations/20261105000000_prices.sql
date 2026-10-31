-- =============================================================================
--  Prices: what jobs really go for
-- =============================================================================
--
--  The owner's decision. Pechkas keeps a record of what every finished job
--  went for and uses it — carefully:
--
--    · price_record keeps, for every finished job, the kind of job, the
--      sector, the day, the customer's first price, the agreed price and
--      what of it was parts. No name, no phone, no address, no technician:
--      it is anonymous, and so it stays when an account is deleted (the
--      jobs themselves go with the customer). The privacy page says so.
--    · A RANGE is the middle half of the price for the WORK (agreed minus
--      parts) of one kind of job, finished in the last price_window_days
--      (90). Older jobs drop out, so it follows prices as they change.
--      Nothing is shown below price_min_jobs (10) jobs of that kind —
--      never below 10 whatever the setting says — because a "range" of two
--      jobs is one customer's price. "Something else" never has one. The
--      ends are rounded out to the nearest Rs 100.
--    · Customers see it on Post a job, under the usual Pechkas price, with
--      the count. Technicians see it in the offer sheet while
--      price_range_to_pros is 1, with their own last price for that kind of
--      job. The office sees all of it in the Prices report.
--    · A technician whose price for the work was more than
--      flag_price_over_bps (50%) above the top of the range on
--      flag_price_over_jobs (3) jobs is a FLAG for the office. A flag only.
--
--  Safe to run twice.

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('price_min_jobs', 10, 'count',
     'How many finished jobs of one kind there must be, in the last price_window_days, before anybody is shown a price range for it. Never below 10.'),
  ('price_window_days', 90, 'days',
     'How far back price ranges look. Older jobs stop counting, so ranges follow prices as they change.'),
  ('price_range_to_pros', 1, 'count',
     '1: technicians see the price range in the offer sheet. 0: only customers and the office see it.'),
  ('flag_price_over_bps', 5000, 'basis_points',
     'A job counts towards the price flag when the price for the work was more than this much above the top of its range.'),
  ('flag_price_over_jobs', 3, 'count',
     'How many such jobs, within flag_days, make the price flag.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('price_min_jobs',       10,   100),
  ('price_window_days',    30,   365),
  ('price_range_to_pros',  0,    1),
  ('flag_price_over_bps',  1000, 10000),
  ('flag_price_over_jobs', 1,    20)
ON CONFLICT (key) DO NOTHING;


-- --- The record --------------------------------------------------------------------------

-- No foreign keys on purpose: it outlives the job, the customer and the
-- technician. Nothing in it says who anybody was.
CREATE TABLE IF NOT EXISTS public.price_record (
  job_id          uuid PRIMARY KEY,
  trade           text NOT NULL,
  job_type_id     integer,
  sector          text NOT NULL,
  done_on         date NOT NULL,
  customer_paisa  bigint NOT NULL CHECK (customer_paisa > 0),
  agreed_paisa    bigint NOT NULL CHECK (agreed_paisa > 0),
  parts_paisa     bigint NOT NULL DEFAULT 0 CHECK (parts_paisa >= 0),
  labour_paisa    bigint NOT NULL CHECK (labour_paisa > 0),
  list_paisa      bigint,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_record ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_record FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS price_record_kind ON public.price_record (job_type_id, done_on);

/** One finished job into the record. Never raises: a record that cannot be written is no reason to undo a finished job. */
CREATE OR REPLACE FUNCTION public.record_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done'
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

DROP TRIGGER IF EXISTS job_done_price ON public.jobs;
CREATE TRIGGER job_done_price AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.record_price();

-- Everything already finished.
INSERT INTO public.price_record
  (job_id, trade, job_type_id, sector, done_on, customer_paisa, agreed_paisa, parts_paisa, labour_paisa, list_paisa)
SELECT j.id, j.trade, j.job_type_id, j.sector,
       (coalesce(j.finished_at, j.updated_at) AT TIME ZONE 'Asia/Karachi')::date,
       j.offered_paisa, j.agreed_paisa, coalesce(j.parts_paisa, 0),
       j.agreed_paisa - coalesce(j.parts_paisa, 0),
       t.list_paisa
FROM public.jobs j LEFT JOIN public.job_types t ON t.id = j.job_type_id
WHERE j.status = 'done' AND j.agreed_paisa IS NOT NULL AND j.agreed_paisa - coalesce(j.parts_paisa, 0) > 0
ON CONFLICT (job_id) DO NOTHING;


-- --- Ranges ------------------------------------------------------------------------------

/**
 * The middle half of the price for the work, for one kind of job, or NULL
 * when there are too few jobs to say anything honest. Granted to nobody:
 * the functions below decide who may see it.
 */
CREATE OR REPLACE FUNCTION public.price_range_of(p_type integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH r AS (
    SELECT p.labour_paisa FROM public.price_record p
    WHERE p_type IS NOT NULL AND p.job_type_id = p_type
      AND p.done_on > (now() AT TIME ZONE 'Asia/Karachi')::date - public.setting('price_window_days')::integer
  ), s AS (
    SELECT count(*) AS n,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY r.labour_paisa) AS lo,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY r.labour_paisa) AS hi
    FROM r
  )
  SELECT CASE WHEN s.n >= greatest(public.setting('price_min_jobs'), 10) THEN
    jsonb_build_object(
      'n', s.n,
      'low_paisa', greatest((floor(s.lo / 10000) * 10000)::bigint, 10000),
      'high_paisa', (ceil(s.hi / 10000) * 10000)::bigint,
      'days', public.setting('price_window_days'))
  END
  FROM s;
$$;

/** For Post a job: every kind of job that has a range, keyed by its id. Signed-in people only. */
CREATE OR REPLACE FUNCTION public.price_ranges()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'days', public.setting('price_window_days'),
    'ranges', coalesce((
      SELECT jsonb_object_agg(t.id::text, x.r)
      FROM public.job_types t, LATERAL (SELECT public.price_range_of(t.id) AS r) x
      WHERE x.r IS NOT NULL), '{}'::jsonb));
END;
$$;

/**
 * For the technician's offer sheet: the range for this kind of job (while
 * the office shows it to technicians) and his own last price for it. Only
 * for a job he may see — the feed's own rule.
 */
CREATE OR REPLACE FUNCTION public.pro_price_help(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_type integer;
  v_last jsonb;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.pro_may_see(p_job), false) THEN
    RETURN public.refuse('This job is not open to you.');
  END IF;
  SELECT j.job_type_id INTO v_type FROM public.jobs j WHERE j.id = p_job;

  IF v_type IS NOT NULL THEN
    SELECT jsonb_build_object(
        'agreed_paisa', j.agreed_paisa,
        'parts_paisa', coalesce(j.parts_paisa, 0),
        'labour_paisa', j.agreed_paisa - coalesce(j.parts_paisa, 0),
        'done_on', (j.finished_at AT TIME ZONE 'Asia/Karachi')::date,
        'ref', j.ref)
    INTO v_last
    FROM public.jobs j
    WHERE j.pro_id = v_me AND j.status = 'done' AND j.job_type_id = v_type AND j.id <> p_job
      AND j.agreed_paisa IS NOT NULL
    ORDER BY j.finished_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'range', CASE WHEN public.setting('price_range_to_pros') = 1 THEN public.price_range_of(v_type) END,
    'last', v_last);
END;
$$;


-- --- The office's report -----------------------------------------------------------------

/**
 * What each kind of job really went for in the window, beside the usual
 * Pechkas price. Counts and prices of real finished jobs, nothing else.
 * "Something else" is one line per trade, and never shown to anybody else.
 */
CREATE OR REPLACE FUNCTION public.admin_prices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := public.setting('price_window_days')::integer;
  v_from date := (now() AT TIME ZONE 'Asia/Karachi')::date - public.setting('price_window_days')::integer;
  v_rows jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;

  WITH r AS (
    SELECT p.* FROM public.price_record p WHERE p.done_on > v_from
  ), g AS (
    SELECT r.trade, r.job_type_id,
           count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.labour_paisa) AS mid,
           min(r.labour_paisa) AS cheapest,
           max(r.labour_paisa) AS dearest,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.customer_paisa) AS asked,
           sum(r.parts_paisa) FILTER (WHERE r.parts_paisa > 0) AS parts,
           count(*) FILTER (WHERE r.parts_paisa > 0) AS with_parts
    FROM r
    GROUP BY r.trade, r.job_type_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'trade', g.trade,
      'trade_name', tr.name,
      'job_type_id', g.job_type_id,
      'name', coalesce(t.name, 'Something else, or not sure'),
      'list_paisa', t.list_paisa,
      'n', g.n,
      'median_paisa', round(g.mid)::bigint,
      'cheapest_paisa', g.cheapest,
      'dearest_paisa', g.dearest,
      'asked_paisa', round(g.asked)::bigint,
      'with_parts', g.with_parts,
      'range', public.price_range_of(g.job_type_id)
    ) ORDER BY tr.sort, t.sort NULLS LAST), '[]'::jsonb)
  INTO v_rows
  FROM g
  JOIN public.trades tr ON tr.slug = g.trade
  LEFT JOIN public.job_types t ON t.id = g.job_type_id;

  RETURN jsonb_build_object(
    'days', v_days,
    'min_jobs', greatest(public.setting('price_min_jobs'), 10),
    'to_pros', public.setting('price_range_to_pros') = 1,
    'all_time', (SELECT count(*) FROM public.price_record),
    'kinds', v_rows);
END;
$$;


-- --- The flag ----------------------------------------------------------------------------

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
               > (x.pr ->> 'high_paisa')::bigint * (10000 + public.setting('flag_price_over_bps'))) AS price_over
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
        public.flag_if('price_over', p.price_over, public.setting('flag_price_over_jobs'))
      ], NULL) AS flags
    FROM pro p
  ),
  cust AS (
    SELECT c.id, c.first_name AS name, public.phone_of(u.id) AS phone,
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.cancelled_by = 'customer' AND j.updated_at >= v_since) AS cancels,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.side = 'pro' AND x.kind = 'problem' AND x.created_at >= v_since) AS reports,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = c.id AND x.side = 'pro' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars
    FROM public.profiles c LEFT JOIN auth.users u ON u.id = c.id
    -- Customer mode now, or ever posted a job: a technician who books a
    -- repair is still a customer for that job, whichever mode he is in today.
    WHERE c.role = 'customer' OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.customer_id = c.id)
  ),
  cust_flags AS (
    SELECT c.*, array_remove(ARRAY[
        public.flag_if('cancels', c.cancels, public.setting('flag_customer_cancels')),
        public.flag_if('reports', c.reports, public.setting('flag_problems')),
        public.flag_if('low_stars', c.low_stars, public.setting('flag_low_stars'))
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


REVOKE ALL ON FUNCTION public.price_range_of(integer), public.record_price() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_ranges(), public.pro_price_help(uuid), public.admin_prices() TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261105000000_prices')
ON CONFLICT (name) DO NOTHING;

COMMIT;
