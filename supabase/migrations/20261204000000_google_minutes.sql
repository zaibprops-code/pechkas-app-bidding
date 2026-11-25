-- =============================================================================
-- Minutes from Google Maps on every offer, and his route while he comes
-- (the owner's decision A115, 25 November 2026; Part 2b).
--
--   1. When a technician makes or renews an offer, where his phone is (his
--      position from the last 10 minutes, never his home area) is put on the
--      offer, with the straight line to her pin. Pechkas then asks Google's
--      Routes service for the driving time and distance: ask_route() queues
--      the request with pg_net, collect_routes() reads the answers. He never
--      types how long he will take.
--   2. The key is Supabase's to keep: Vault, secret name `google_routes_key`.
--      routes_key() reads it; nothing returns it, and the app never has it.
--      Without it nothing is asked and every screen shows only the straight
--      line ("about 2 km") — never a made-up number of minutes.
--   3. offer_extras(job) gives the customer, for each live offer on her own
--      job: the minutes (Google's, or NULL), the road and straight distances,
--      his finished jobs on Pechkas. Never where he is.
--   4. When she chooses, his minutes and distance at that moment are kept on
--      the job (chosen_eta_seconds, chosen_distance_m): Part 2c measures
--      lateness from them.
--   5. While he is ON HIS WAY (stage on_way, after he tapped it), job_live(job)
--      gives her his position on the map — like a ride app — and fresh
--      minutes, asked of Google at most every `route_every_seconds` (120).
--      Before he sets off and once he has arrived, she sees nothing of where
--      he is. The phone sends his position every 15 s while he is on his
--      way and the app is open; the same one row (pro_positions) is kept.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('route_every_seconds', 120, 'count', 'While a technician is on his way, at most how often (seconds) Google is asked for fresh minutes. Each ask is one paid request after the free 10,000 a month.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES ('route_every_seconds', 60, 900)
ON CONFLICT (key) DO UPDATE SET lo = excluded.lo, hi = excluded.hi;

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS from_lat double precision;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS from_lng double precision;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS distance_m integer;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS eta_seconds integer;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS route_m integer;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS eta_at timestamptz;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS chosen_eta_seconds integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS chosen_distance_m integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS live_eta_seconds integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS live_route_m integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS live_polyline text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS live_eta_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS live_asked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.route_requests (
  request_id bigint PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('offer', 'job')),
  ref        uuid NOT NULL,
  asked_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.route_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.route_requests FROM PUBLIC, anon, authenticated;

/** The Google Routes key from Supabase Vault, or NULL. Never returned to anybody. */
CREATE OR REPLACE FUNCTION public.routes_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v USING 'google_routes_key';
  RETURN nullif(btrim(coalesce(v, '')), '');
END;
$$;

/** Asks Google for the driving time and distance between two points. Queued; answered by collect_routes(). Never raises. */
CREATE OR REPLACE FUNCTION public.ask_route(p_kind text, p_ref uuid, p_from_lat double precision, p_from_lng double precision,
                                            p_to_lat double precision, p_to_lng double precision)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := public.routes_key();
  v_id  bigint;
BEGIN
  IF v_key IS NULL OR p_from_lat IS NULL OR p_to_lat IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_id := net.http_post(
      url => 'https://routes.googleapis.com/directions/v2:computeRoutes',
      body => jsonb_build_object(
        'origin', jsonb_build_object('location', jsonb_build_object('latLng', jsonb_build_object('latitude', p_from_lat, 'longitude', p_from_lng))),
        'destination', jsonb_build_object('location', jsonb_build_object('latLng', jsonb_build_object('latitude', p_to_lat, 'longitude', p_to_lng))),
        'travelMode', 'DRIVE',
        'routingPreference', 'TRAFFIC_AWARE'),
      headers => jsonb_build_object('Content-Type', 'application/json', 'X-Goog-Api-Key', v_key,
                                    'X-Goog-FieldMask', 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'),
      timeout_milliseconds => 8000);
    INSERT INTO public.route_requests (request_id, kind, ref) VALUES (v_id, p_kind, p_ref) ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ask_route: %', SQLERRM;
    RETURN NULL;
  END;
  RETURN v_id;
END;
$$;

/** Reads Google's answers and puts them where they belong. Never raises; old unanswered asks are dropped. */
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

/** An offer made or renewed: where his phone is, the straight line, and a question to Google. */
CREATE OR REPLACE FUNCTION public.offer_where()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pos public.pro_positions%ROWTYPE;
  v_job public.jobs%ROWTYPE;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  -- make_offer() renews in place (INSERT … ON CONFLICT DO UPDATE): the insert
  -- that becomes an update leaves the asking to the update's own turn here.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.offers WHERE job_id = NEW.job_id AND pro_id = NEW.pro_id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_pos FROM public.pro_positions WHERE pro_id = NEW.pro_id AND at > now() - interval '10 minutes';
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF v_pos.pro_id IS NULL OR v_job.lat IS NULL THEN
    RETURN NEW;
  END IF;
  -- Asked again only when he has moved, or the minutes are half an hour old.
  IF TG_OP = 'UPDATE' AND NEW.from_lat IS NOT NULL AND NEW.eta_at > now() - interval '30 minutes'
     AND public.distance_m(NEW.from_lat, NEW.from_lng, v_pos.lat, v_pos.lng) < 300 THEN
    RETURN NEW;
  END IF;
  NEW.from_lat := v_pos.lat;
  NEW.from_lng := v_pos.lng;
  NEW.distance_m := public.distance_m(v_pos.lat, v_pos.lng, v_job.lat, v_job.lng);
  NEW.eta_seconds := NULL;
  NEW.route_m := NULL;
  NEW.eta_at := NULL;
  PERFORM public.ask_route('offer', NEW.id, v_pos.lat, v_pos.lng, v_job.lat, v_job.lng);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_where ON public.offers;
CREATE TRIGGER offers_where BEFORE INSERT OR UPDATE OF price_paisa, expires_at, status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offer_where();

/** She chose him: his minutes and distance at that moment are kept on the job (Part 2c measures from them). */
CREATE OR REPLACE FUNCTION public.offer_chosen_eta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    UPDATE public.jobs SET chosen_eta_seconds = NEW.eta_seconds, chosen_distance_m = coalesce(NEW.route_m, NEW.distance_m)
    WHERE id = NEW.job_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS offers_chosen_eta ON public.offers;
CREATE TRIGGER offers_chosen_eta AFTER UPDATE OF status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offer_chosen_eta();

/** For each live offer on her own job: minutes, distances, his finished jobs. Never where he is. */
CREATE OR REPLACE FUNCTION public.offer_extras(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job AND customer_id = auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM public.collect_routes();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'offer_id', o.id,
      'eta_seconds', o.eta_seconds,
      'route_m', o.route_m,
      'distance_m', o.distance_m,
      'jobs_done', (SELECT count(*) FROM public.jobs d WHERE d.pro_id = o.pro_id AND d.status = 'done')
    ) ORDER BY o.eta_seconds NULLS LAST, o.distance_m NULLS LAST)
    FROM public.offers o
    WHERE o.job_id = p_job AND o.status = 'pending' AND o.expires_at > now()), '[]'::jsonb);
END;
$$;

/**
 * While he is on his way to her: where he is, and fresh minutes (Google's,
 * asked at most every route_every_seconds). Only her own job, only between
 * "On my way" and arriving, only a position from the last 3 minutes.
 */
CREATE OR REPLACE FUNCTION public.job_live(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pos public.pro_positions%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  IF v_job.id IS NULL OR v_job.status <> 'assigned' OR v_job.stage IS DISTINCT FROM 'on_way' THEN
    RETURN jsonb_build_object('live', false);
  END IF;
  SELECT * INTO v_pos FROM public.pro_positions WHERE pro_id = v_job.pro_id AND at > now() - interval '3 minutes';
  IF v_pos.pro_id IS NULL OR v_job.lat IS NULL THEN
    RETURN jsonb_build_object('live', false, 'chosen_eta_seconds', v_job.chosen_eta_seconds);
  END IF;
  PERFORM public.collect_routes();
  IF v_job.live_asked_at IS NULL OR v_job.live_asked_at < now() - make_interval(secs => public.setting('route_every_seconds')::integer) THEN
    UPDATE public.jobs SET live_asked_at = now() WHERE id = v_job.id;
    PERFORM public.ask_route('job', v_job.id, v_pos.lat, v_pos.lng, v_job.lat, v_job.lng);
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  RETURN jsonb_build_object(
    'live', true,
    'lat', v_pos.lat, 'lng', v_pos.lng, 'at', v_pos.at,
    'distance_m', public.distance_m(v_pos.lat, v_pos.lng, v_job.lat, v_job.lng),
    'eta_seconds', v_job.live_eta_seconds,
    'route_m', v_job.live_route_m,
    'polyline', v_job.live_polyline,
    'eta_at', v_job.live_eta_at,
    'chosen_eta_seconds', v_job.chosen_eta_seconds);
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-collect-routes', '* * * * *', 'SELECT public.collect_routes()');
END;
$$;

REVOKE ALL ON FUNCTION public.routes_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ask_route(text, uuid, double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collect_routes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offer_where() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offer_chosen_eta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offer_extras(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_live(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_extras(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_live(uuid) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261204000000_google_minutes')
ON CONFLICT (name) DO NOTHING;

COMMIT;
