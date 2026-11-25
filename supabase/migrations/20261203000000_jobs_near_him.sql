-- =============================================================================
-- Jobs near him, a search that widens, and the automatic choice
-- (the owner's decisions of 25 November 2026, A114 and A115; Part 2a).
--
--   1. A technician needs location on to go online (only while the app is
--      open; never in the background). The phone sends where he is with
--      pro_here(); pro_set_online(true) refuses without a position from the
--      last 10 minutes (field 'location'). Only his latest position is kept,
--      and forget_positions() deletes it after `position_fresh_minutes` x 2.
--      A customer never sees it: she sees "about 3 km away", nothing more.
--      His HOME AREA (set_home_area) stands in when his last position is
--      older than `position_fresh_minutes`.
--
--   2. Which open jobs he may see is still pro_may_see_as() — the one rule —
--      but "the job is in one of his sectors" became within_reach(): the
--      job's pin within the job's REACH of where he is (or his home area).
--      The reach starts at `search_start_m` (5 km) when the job is announced
--      and grows evenly to `search_full_m` (40 km: all of Islamabad, Bahria
--      Town and DHA too) over `search_full_minutes` (8); once full, every
--      technician in the trade may see it. A job with no pin (older copies),
--      or a technician with no position and no home area, falls back to his
--      sectors, as before.
--
--   3. widen_reach() (pg_cron, every minute) tells the online technicians
--      the growing reach has just come to, once each (push_log is the
--      record of who was told), with the same 'new_job' notification.
--
--   4. job_views: pro_saw_job() when he opens a job. job_search() gives the
--      customer her own job's search: the reach now, when it becomes all of
--      Islamabad, how many technicians have seen it and their first
--      letters (never a name, a face or a place), and the automatic choice.
--      pro_distances() gives him, for each job in his list, the straight
--      line from where he is — "about 3 km", never a route.
--
--   5. The automatic choice (off by default): set_auto_choose(job, on). While
--      it is on, the first live offer AT HER PRICE is chosen for her, by
--      choose_offer() itself, with every rule it keeps (the lock, the gate,
--      the trial limits, a checker for risky work).
--
-- The new numbers are the office's to change (setting_limits). Safe to run twice.
-- =============================================================================

BEGIN;

-- --- The numbers ----------------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('search_start_m', 5000, 'count', 'Metres around a new job that technicians are told about first.'),
  ('search_full_m', 40000, 'count', 'Metres that count as all of Islamabad (Bahria Town and DHA too): from here on every technician in the trade sees the job.'),
  ('search_full_minutes', 8, 'minutes', 'Minutes for the search to grow evenly from search_start_m to search_full_m.'),
  ('position_fresh_minutes', 180, 'minutes', 'How long a technician''s last position counts for; after that his home area does.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('search_start_m', 1000, 20000),
  ('search_full_m', 10000, 80000),
  ('search_full_minutes', 2, 60),
  ('position_fresh_minutes', 15, 720)
ON CONFLICT (key) DO UPDATE SET lo = excluded.lo, hi = excluded.hi;

-- --- Where he is, and his home area -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pro_positions (
  pro_id   uuid PRIMARY KEY REFERENCES public.pros(id) ON DELETE CASCADE,
  lat      double precision NOT NULL,
  lng      double precision NOT NULL,
  accuracy integer,
  at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pro_positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_positions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS home_lat double precision;
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS home_lng double precision;

/** Where an approved technician is now: only the latest is kept. */
CREATE OR REPLACE FUNCTION public.pro_here(p_lat double precision, p_lng double precision, p_accuracy integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician sends where he is.');
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN 23 AND 37.5 OR p_lng NOT BETWEEN 60 AND 78 THEN
    RETURN public.refuse('Your location did not come through. Try again.', 'location');
  END IF;
  INSERT INTO public.pro_positions (pro_id, lat, lng, accuracy, at)
  VALUES (auth.uid(), p_lat, p_lng, p_accuracy, now())
  ON CONFLICT (pro_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, at = excluded.at;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** His home area: where he usually starts from, used when his last position is old. Only the office sees it. */
CREATE OR REPLACE FUNCTION public.set_home_area(p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid()) THEN
    RETURN public.refuse('Only a technician has a home area.');
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN 23 AND 37.5 OR p_lng NOT BETWEEN 60 AND 78 THEN
    RETURN public.refuse('That place did not come through. Try again.', 'location');
  END IF;
  UPDATE public.pros SET home_lat = p_lat, home_lng = p_lng WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Online needs a position from the last 10 minutes; offline never does. */
CREATE OR REPLACE FUNCTION public.pro_set_online(p_online boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can go online.');
  END IF;
  IF coalesce(p_online, false)
     AND NOT EXISTS (SELECT 1 FROM public.pro_positions WHERE pro_id = auth.uid() AND at > now() - interval '10 minutes') THEN
    RETURN public.refuse('Pechkas needs your location to show you jobs near you. Allow location, then go online.', 'location');
  END IF;
  UPDATE public.pros SET online = coalesce(p_online, false), last_seen_at = now() WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'online', coalesce(p_online, false));
END;
$$;

/** A position is kept only as long as it is useful. */
CREATE OR REPLACE FUNCTION public.forget_positions()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH gone AS (
    DELETE FROM public.pro_positions WHERE at < now() - make_interval(mins => 2 * public.setting('position_fresh_minutes')::integer) RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;

/** Where he counts as being: his position while fresh, else his home area, else nowhere (NULL). */
CREATE OR REPLACE FUNCTION public.pro_point(p_pro uuid, OUT lat double precision, OUT lng double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.lat, x.lng FROM (
    SELECT p.lat, p.lng, 1 AS rank FROM public.pro_positions p
    WHERE p.pro_id = p_pro AND p.at > now() - make_interval(mins => public.setting('position_fresh_minutes')::integer)
    UNION ALL
    SELECT r.home_lat, r.home_lng, 2 FROM public.pros r WHERE r.id = p_pro AND r.home_lat IS NOT NULL AND r.home_lng IS NOT NULL
  ) x ORDER BY x.rank LIMIT 1;
$$;

-- --- How far a job reaches ----------------------------------------------------------------------

/** The metres a job reaches at a moment: search_start_m at its announcement, growing evenly to search_full_m. */
CREATE OR REPLACE FUNCTION public.reach_at(p_job uuid, p_at timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN public.setting('search_full_minutes') <= 0 THEN public.setting('search_full_m')::integer
         ELSE least(public.setting('search_full_m'),
                    public.setting('search_start_m')
                    + (public.setting('search_full_m') - public.setting('search_start_m'))
                      * greatest(0, extract(epoch FROM p_at - coalesce(j.announced_at, j.created_at)) / 60.0)
                      / public.setting('search_full_minutes'))::integer END
  FROM public.jobs j WHERE j.id = p_job;
$$;

/** Within the job's reach of him now — or, with no pin or no place for him, in one of his sectors. */
CREATE OR REPLACE FUNCTION public.within_reach(p_job uuid, p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN j.lat IS NULL OR j.lng IS NULL THEN j.sector = ANY (r.sectors)
    WHEN public.reach_at(j.id, now()) >= public.setting('search_full_m') THEN true
    WHEN pt.lat IS NULL THEN j.sector = ANY (r.sectors)
    ELSE public.distance_m(pt.lat, pt.lng, j.lat, j.lng) <= public.reach_at(j.id, now())
  END
  FROM public.jobs j
  JOIN public.pros r ON r.id = p_pro
  LEFT JOIN LATERAL public.pro_point(p_pro) pt ON true
  WHERE j.id = p_job;
$$;

/**
 * The one rule for what a technician may see (D37's version, first_jobs),
 * with "in one of his sectors" replaced by within_reach(). Nothing else changed.
 */
CREATE OR REPLACE FUNCTION public.pro_may_see_as(p_job uuid, p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.pros r ON r.id = p_pro
    WHERE j.id = p_job
      AND r.status = 'approved'
      AND (
        (j.status = 'open' AND public.within_reach(j.id, r.id)
         -- D37: his trade, its level, the trial limits and a checked job: pro_gate() is the one rule.
         AND public.pro_gate(r.id, j.trade, j.job_type_id, j.sector, j.customer_id, j.id) IS NULL
         AND (j.preferred_pro_id IS NULL OR j.preferred_pro_id = r.id OR j.preferred_until <= now())
         AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = r.id)
         -- She said no to his offer on this job: it is closed to him.
         AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = r.id AND o.status = 'declined')
         -- Paused by the office (D11): no new jobs reach him; jobs he has go on.
         AND NOT public.pro_paused(r.id)
         -- He withdrew from this job, or she replaced him on it: it is closed to him for good.
         AND NOT EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = j.id AND a.pro_id = r.id)
         -- A guarantee repair never goes to the man whose work it is redoing.
         AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.id = j.guarantee_of AND c.pro_id = r.id))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
        -- D37: a checker who said yes, while the job is on.
        OR (j.status = 'assigned' AND EXISTS (SELECT 1 FROM public.risk_checks k
                                              WHERE k.job_id = j.id AND k.checker_id = r.id AND k.status = 'accepted'))
      )
  );
$$;

/** Every minute: the online technicians the growing reach has just come to, told once each. */
CREATE OR REPLACE FUNCTION public.widen_reach()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_pro  uuid;
  v_vars jsonb;
  v_n    integer := 0;
BEGIN
  FOR v_job IN
    SELECT * FROM public.jobs j
    WHERE j.status = 'open' AND j.lat IS NOT NULL
      AND coalesce(j.announced_at, j.created_at) > now() - interval '12 hours'
      -- Still growing, or full within the last two minutes.
      AND public.reach_at(j.id, now() - interval '2 minutes') < public.setting('search_full_m')
  LOOP
    v_vars := public.job_vars(v_job) || jsonb_build_object('price', public.rs(v_job.offered_paisa));
    FOR v_pro IN
      SELECT r.id FROM public.pros r
      WHERE r.online
        AND r.id <> v_job.customer_id
        AND public.pro_may_see_as(v_job.id, r.id)
        AND NOT EXISTS (SELECT 1 FROM public.push_log l
                        WHERE l.user_id = r.id AND l.job_id = v_job.id AND l.kind IN ('new_job', 'job_again', 'asked_again'))
      ORDER BY r.last_seen_at DESC NULLS LAST
      LIMIT 100
    LOOP
      PERFORM public.tell(v_pro, 'new_job', v_job.id, '/pro', v_vars);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- --- Who has looked, and the customer's view of her search -----------------------------------------

CREATE TABLE IF NOT EXISTS public.job_views (
  job_id   uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id   uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, pro_id)
);
ALTER TABLE public.job_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_views FROM PUBLIC, anon, authenticated;

/** He opened the job: counted once. Only a job he may see. */
CREATE OR REPLACE FUNCTION public.pro_saw_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.pro_may_see_as(p_job, auth.uid()) THEN
    RETURN public.refuse('This job is not open to you.');
  END IF;
  INSERT INTO public.job_views (job_id, pro_id) VALUES (p_job, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS auto_choose boolean NOT NULL DEFAULT false;

/** Her own open job's search, as the waiting screen draws it. Counts and first letters only. */
CREATE OR REPLACE FUNCTION public.job_search(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reach_m', public.reach_at(j.id, now()),
    'start_m', public.setting('search_start_m'),
    'full_m', public.setting('search_full_m'),
    'full', public.reach_at(j.id, now()) >= public.setting('search_full_m'),
    'announced_at', coalesce(j.announced_at, j.created_at),
    'full_at', coalesce(j.announced_at, j.created_at) + make_interval(mins => public.setting('search_full_minutes')::integer),
    'seen', (SELECT count(*) FROM public.job_views v WHERE v.job_id = j.id),
    'letters', coalesce((SELECT jsonb_agg(x.l ORDER BY x.first_at DESC) FROM (
                  SELECT upper(left(coalesce(nullif(btrim(p.first_name), ''), split_part(r.full_name, ' ', 1)), 1)) AS l, v.first_at
                  FROM public.job_views v JOIN public.pros r ON r.id = v.pro_id LEFT JOIN public.profiles p ON p.id = v.pro_id
                  WHERE v.job_id = j.id ORDER BY v.first_at DESC LIMIT 4) x), '[]'::jsonb),
    'auto_choose', j.auto_choose,
    'price_paisa', j.offered_paisa,
    'has_pin', j.lat IS NOT NULL
  )
  FROM public.jobs j
  WHERE j.id = p_job AND j.customer_id = auth.uid();
$$;

/** For each job in his list, the straight line from where he counts as being, in metres. Never a route. */
CREATE OR REPLACE FUNCTION public.pro_distances()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(j.id, public.distance_m(pt.lat, pt.lng, j.lat, j.lng)), '{}'::jsonb)
  FROM public.pro_point(auth.uid()) pt
  JOIN public.jobs j ON j.lat IS NOT NULL AND j.status IN ('open', 'assigned')
  WHERE pt.lat IS NOT NULL AND public.pro_may_see_as(j.id, auth.uid());
$$;

-- --- The automatic choice ------------------------------------------------------------------------

/** Her switch: choose the first technician who accepts her price. Off by default; only while the job is open. */
CREATE OR REPLACE FUNCTION public.set_auto_choose(p_job uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer uuid;
BEGIN
  UPDATE public.jobs SET auto_choose = coalesce(p_on, false), updated_at = now()
  WHERE id = p_job AND customer_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;
  -- Switched on with an offer at her price already waiting: that one, the oldest.
  IF coalesce(p_on, false) THEN
    SELECT o.id INTO v_offer FROM public.offers o JOIN public.jobs j ON j.id = o.job_id
    WHERE o.job_id = p_job AND o.status = 'pending' AND o.expires_at > now() AND o.price_paisa = j.offered_paisa
    ORDER BY o.created_at LIMIT 1;
    IF v_offer IS NOT NULL THEN
      RETURN public.choose_offer(v_offer) || jsonb_build_object('chosen', v_offer);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'auto_choose', coalesce(p_on, false));
END;
$$;

/**
 * A live offer at her price on a job with the automatic choice on: chosen
 * for her, by choose_offer() as her, so every rule it keeps still applies.
 * Who is asking is put back afterwards. Nothing here may undo the offer.
 */
CREATE OR REPLACE FUNCTION public.auto_choose_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs%ROWTYPE;
  v_claims  text := current_setting('request.jwt.claims', true);
  v_sub     text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF NOT coalesce(v_job.auto_choose, false) OR v_job.status <> 'open' OR NEW.price_paisa <> v_job.offered_paisa THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_job.customer_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_job.customer_id::text, true);
    PERFORM public.choose_offer(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_choose_offer: %', SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS offers_auto_choose ON public.offers;
CREATE TRIGGER offers_auto_choose AFTER INSERT OR UPDATE OF price_paisa, status, expires_at ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.auto_choose_offer();

-- --- Clocks ------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-widen-reach', '* * * * *', 'SELECT public.widen_reach()');
  PERFORM cron.schedule('pechkas-forget-positions', '17 * * * *', 'SELECT public.forget_positions()');
END;
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pro_here(double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_home_area(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_positions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pro_point(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reach_at(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.within_reach(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.widen_reach() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pro_saw_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_search(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pro_distances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_auto_choose(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_choose_offer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_here(double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_home_area(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_saw_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_search(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_distances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_auto_choose(uuid, boolean) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261203000000_jobs_near_him')
ON CONFLICT (name) DO NOTHING;

COMMIT;
