-- =============================================================================
-- The screens exactly as the approved mocks (the owner, 25 November 2026).
--
--   1. Her waiting screen shows the technicians near her on the map, as the
--      mock does: job_search() now gives `near` — online, approved
--      technicians who may see this job right now (pro_may_see_as(), the one
--      rule) and have a position from the last 10 minutes — as points
--      rounded to about 100 m, never a name, at most 30; `near_count`; the
--      first letters of up to four of them; the job's usual price; and how
--      many times she may still raise it. The owner chose to show them; the
--      privacy page, the technician agreement and the store answers say so.
--   2. His job list shows Google's minutes and road km for each job, as the
--      mock does (the owner's choice, knowing each is a paid request):
--      pro_nearby() gives, for every job he may see, the straight line, and
--      Google's minutes from `feed_routes`, asked again only when he has
--      moved 300 m or the minutes are `feed_route_minutes` (10, office
--      5–60) old, at most 5 new asks each time it is read. Without the key
--      nothing is asked and only the straight line is shown. pro_distances()
--      stays for older copies.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('feed_route_minutes', 10, 'minutes', 'How old Google''s minutes for a job in a technician''s list may get before they are asked again (each ask is a paid request after the free 10,000 a month).')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES ('feed_route_minutes', 5, 60)
ON CONFLICT (key) DO UPDATE SET lo = excluded.lo, hi = excluded.hi;

ALTER TABLE public.route_requests DROP CONSTRAINT IF EXISTS route_requests_kind_check;
ALTER TABLE public.route_requests ADD CONSTRAINT route_requests_kind_check CHECK (kind IN ('offer', 'job', 'feed'));

CREATE TABLE IF NOT EXISTS public.feed_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  from_lat    double precision NOT NULL,
  from_lng    double precision NOT NULL,
  asked_at    timestamptz NOT NULL DEFAULT now(),
  eta_seconds integer,
  route_m     integer,
  answered_at timestamptz,
  UNIQUE (pro_id, job_id)
);
ALTER TABLE public.feed_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_routes FROM PUBLIC, anon, authenticated;

/** Her waiting screen (Search.tsx): the search, and the technicians near her, as the mock shows. */
CREATE OR REPLACE FUNCTION public.job_search(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH j AS (SELECT * FROM public.jobs WHERE id = p_job AND customer_id = auth.uid()),
  near AS (
    SELECT r.id, round(pp.lat::numeric, 3)::double precision AS lat, round(pp.lng::numeric, 3)::double precision AS lng,
           upper(left(coalesce(nullif(btrim(pf.first_name), ''), split_part(r.full_name, ' ', 1)), 1)) AS l
    FROM j
    JOIN public.pros r ON r.status = 'approved' AND r.online
    JOIN public.pro_positions pp ON pp.pro_id = r.id AND pp.at > now() - interval '10 minutes'
    LEFT JOIN public.profiles pf ON pf.id = r.id
    WHERE j.status = 'open' AND r.id <> j.customer_id AND public.pro_may_see_as(j.id, r.id)
    ORDER BY public.distance_m(pp.lat, pp.lng, j.lat, j.lng) NULLS LAST
    LIMIT 30
  )
  SELECT jsonb_build_object(
    'reach_m', public.reach_at(j.id, now()),
    'start_m', public.setting('search_start_m'),
    'full_m', public.setting('search_full_m'),
    'full', public.reach_at(j.id, now()) >= public.setting('search_full_m'),
    'announced_at', coalesce(j.announced_at, j.created_at),
    'full_at', coalesce(j.announced_at, j.created_at) + make_interval(mins => public.setting('search_full_minutes')::integer),
    'nudge_at', coalesce(j.announced_at, j.created_at) + make_interval(mins => public.setting('nudge_today_minutes')::integer),
    'seen', (SELECT count(*) FROM public.job_views v WHERE v.job_id = j.id),
    'letters', coalesce((SELECT jsonb_agg(x.l ORDER BY x.first_at DESC) FROM (
                  SELECT upper(left(coalesce(nullif(btrim(p.first_name), ''), split_part(r.full_name, ' ', 1)), 1)) AS l, v.first_at
                  FROM public.job_views v JOIN public.pros r ON r.id = v.pro_id LEFT JOIN public.profiles p ON p.id = v.pro_id
                  WHERE v.job_id = j.id ORDER BY v.first_at DESC LIMIT 4) x), '[]'::jsonb),
    'near', coalesce((SELECT jsonb_agg(jsonb_build_object('lat', n.lat, 'lng', n.lng)) FROM near n), '[]'::jsonb),
    'near_count', (SELECT count(*) FROM near),
    'near_letters', coalesce((SELECT jsonb_agg(x.l) FROM (SELECT n.l FROM near n LIMIT 4) x), '[]'::jsonb),
    'auto_choose', j.auto_choose,
    'price_paisa', j.offered_paisa,
    'usual_paisa', (SELECT t.list_paisa FROM public.job_types t WHERE t.id = j.job_type_id),
    'raises_left', greatest(public.setting('max_raises') - coalesce(j.raises, 0), 0),
    'can_raise', NOT coalesce(j.paid_by_pechkas, false),
    'has_pin', j.lat IS NOT NULL
  )
  FROM j;
$$;

/**
 * His job list (Work.tsx): for each job he may see, the straight line from
 * where he is, and Google's minutes and road km when it has answered. Asks
 * Google again only for a job whose minutes are old or that he has moved
 * 300 m from, five at most each time.
 */
CREATE OR REPLACE FUNCTION public.pro_nearby()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pt   record;
  v_job  record;
  v_id   uuid;
  v_n    integer := 0;
BEGIN
  SELECT * INTO v_pt FROM public.pro_point(auth.uid());
  IF v_pt.lat IS NULL THEN
    RETURN jsonb_build_object('jobs', '{}'::jsonb, 'start_m', public.setting('search_start_m'));
  END IF;
  PERFORM public.collect_routes();
  -- Only his live position is a place to measure minutes from, never his home area.
  IF EXISTS (SELECT 1 FROM public.pro_positions p WHERE p.pro_id = auth.uid() AND p.at > now() - interval '10 minutes')
     AND public.routes_key() IS NOT NULL THEN
    FOR v_job IN
      SELECT j.id, j.lat, j.lng FROM public.jobs j
      LEFT JOIN public.feed_routes f ON f.job_id = j.id AND f.pro_id = auth.uid()
      WHERE j.status = 'open' AND j.lat IS NOT NULL AND public.pro_may_see_as(j.id, auth.uid())
        AND (f.id IS NULL OR f.asked_at < now() - make_interval(mins => public.setting('feed_route_minutes')::integer)
             OR public.distance_m(f.from_lat, f.from_lng, v_pt.lat, v_pt.lng) >= 300)
      ORDER BY public.distance_m(v_pt.lat, v_pt.lng, j.lat, j.lng)
      LIMIT 5
    LOOP
      INSERT INTO public.feed_routes AS f (pro_id, job_id, from_lat, from_lng, asked_at)
      VALUES (auth.uid(), v_job.id, v_pt.lat, v_pt.lng, now())
      ON CONFLICT (pro_id, job_id) DO UPDATE SET from_lat = excluded.from_lat, from_lng = excluded.from_lng, asked_at = now()
      RETURNING f.id INTO v_id;
      PERFORM public.ask_route('feed', v_id, v_pt.lat, v_pt.lng, v_job.lat, v_job.lng);
      v_n := v_n + 1;
    END LOOP;
  END IF;
  RETURN jsonb_build_object(
    'start_m', public.setting('search_start_m'),
    'jobs', coalesce((
      SELECT jsonb_object_agg(j.id, jsonb_build_object(
        'distance_m', public.distance_m(v_pt.lat, v_pt.lng, j.lat, j.lng),
        'eta_seconds', f.eta_seconds,
        'route_m', f.route_m))
      FROM public.jobs j
      LEFT JOIN public.feed_routes f ON f.job_id = j.id AND f.pro_id = auth.uid()
      WHERE j.lat IS NOT NULL AND j.status IN ('open', 'assigned') AND public.pro_may_see_as(j.id, auth.uid())), '{}'::jsonb));
END;
$$;

/** Old minutes in his list are forgotten once the job is no longer open. */
CREATE OR REPLACE FUNCTION public.forget_feed_routes()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH d AS (DELETE FROM public.feed_routes f
             USING public.jobs j WHERE j.id = f.job_id AND (j.status <> 'open' OR f.asked_at < now() - interval '1 day')
             RETURNING 1)
  SELECT count(*)::integer FROM d;
$$;
SELECT cron.schedule('pechkas-forget-feed-routes', '17 * * * *', 'SELECT public.forget_feed_routes()');

-- collect_routes: copied from 20261204000000_google_minutes.sql; only the lines about time changed.
CREATE OR REPLACE FUNCTION public.collect_routes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req  record;
  v_body jsonb;
  v_secs integer;
  v_m    integer;
  v_line text;
  v_n    integer := 0;
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RETURN 0;
  END IF;
  FOR v_req IN
    EXECUTE 'SELECT q.request_id, q.kind, q.ref, r.status_code, r.content
             FROM public.route_requests q JOIN net._http_response r ON r.id = q.request_id'
  LOOP
    BEGIN
      v_secs := NULL; v_m := NULL; v_line := NULL;
      IF v_req.status_code = 200 THEN
        v_body := v_req.content::jsonb;
        v_secs := nullif(regexp_replace(coalesce(v_body #>> '{routes,0,duration}', ''), '[^0-9]', '', 'g'), '')::integer;
        v_m := (v_body #>> '{routes,0,distanceMeters}')::integer;
        v_line := v_body #>> '{routes,0,polyline,encodedPolyline}';
      END IF;
      IF v_secs IS NOT NULL THEN
        IF v_req.kind = 'offer' THEN
          UPDATE public.offers SET eta_seconds = v_secs, route_m = v_m, eta_at = now() WHERE id = v_req.ref;
        ELSIF v_req.kind = 'feed' THEN
          UPDATE public.feed_routes SET eta_seconds = v_secs, route_m = v_m, answered_at = now() WHERE id = v_req.ref;
        ELSE
          UPDATE public.jobs SET live_eta_seconds = v_secs, live_route_m = v_m, live_polyline = left(v_line, 20000), live_eta_at = now() WHERE id = v_req.ref;
        END IF;
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'collect_routes: %', SQLERRM;
    END;
    DELETE FROM public.route_requests WHERE request_id = v_req.request_id;
  END LOOP;
  DELETE FROM public.route_requests WHERE asked_at < now() - interval '15 minutes';
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.pro_nearby() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_feed_routes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_nearby() TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_search(uuid) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261206000000_as_the_mocks')
ON CONFLICT (name) DO NOTHING;

COMMIT;
