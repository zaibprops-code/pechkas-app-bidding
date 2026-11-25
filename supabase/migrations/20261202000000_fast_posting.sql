-- =============================================================================
-- A faster Post a job (the owner, 25 November 2026).
--
-- Three steps (the problem, where on the map, the price) and always "as soon
-- as possible". The database changes underneath are two:
--
--   1. The lowest price for a job is a share of its usual price,
--      `min_price_bps` (60%), which the office may change in Settings between
--      30% and 100%. `price_floor(job type)` is the one rule: that share of the
--      usual price, rounded UP to a whole Rs 50 (one tap of the stepper), and
--      never below `min_offer_paisa`. A job with no usual price ("Something
--      else") keeps `min_offer_paisa`. post_job() refuses below it, with
--      field 'offer'; app_lists() hands every job type its floor so the
--      phone's − stops at the same figure.
--
--   2. Every part of Islamabad takes jobs, not only the "live" sectors:
--      `sectors.city` says which city a place is in, and post_job() refuses
--      only a place outside Islamabad ("Pechkas works in Islamabad only, for
--      now"). Bahria Town and DHA count as Islamabad (the owner's decision).
--      Rawalpindi's places stay on the list so ask_for_sector() can record
--      who asked. `live` is no longer a posting rule; older copies of the app
--      still offer only the live sectors, which is a subset and still true.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

-- --- The lowest price -------------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('min_price_bps', 6000, 'basis_points',
     'The lowest price a customer may set for a job, as a share of its usual price. 6000 = 60%: Rs 1,200 for a Rs 2,000 job. Rounded up to a whole Rs 50, and never below min_offer_paisa.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES ('min_price_bps', 3000, 10000)
ON CONFLICT (key) DO UPDATE SET lo = excluded.lo, hi = excluded.hi;

/** The lowest price a customer may set for this kind of job, in paisa. */
CREATE OR REPLACE FUNCTION public.price_floor(p_job_type integer)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(
    public.setting('min_offer_paisa'),
    coalesce((SELECT ceil(j.list_paisa * public.setting('min_price_bps') / 10000.0 / 5000.0)::bigint * 5000
              FROM public.job_types j WHERE j.id = p_job_type AND j.list_paisa IS NOT NULL), 0));
$$;

-- --- Which city a place is in -----------------------------------------------------------------

ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'islamabad';
ALTER TABLE public.sectors DROP CONSTRAINT IF EXISTS sectors_city_check;
ALTER TABLE public.sectors ADD CONSTRAINT sectors_city_check CHECK (city IN ('islamabad', 'rawalpindi'));
UPDATE public.sectors SET city = 'rawalpindi'
WHERE name IN ('Rawalpindi', 'Saddar', 'Chaklala', 'Satellite Town', 'Westridge') AND city <> 'rawalpindi';

/** What the post form needs, public: trades, places, prices and their floors. */
CREATE OR REPLACE FUNCTION public.app_lists()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'trades',  (SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name) ORDER BY t.sort) FROM public.trades t),
    'sectors', (SELECT jsonb_agg(s.name ORDER BY s.sort) FROM public.sectors s),
    'live_sectors', (SELECT coalesce(jsonb_agg(s.name ORDER BY s.sort), '[]'::jsonb) FROM public.sectors s WHERE s.live),
    'islamabad_sectors', (SELECT coalesce(jsonb_agg(s.name ORDER BY s.sort), '[]'::jsonb) FROM public.sectors s WHERE s.city = 'islamabad'),
    'job_types', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'trade', j.trade, 'name', j.name, 'list_paisa', j.list_paisa,
                                                      'floor_paisa', public.price_floor(j.id)) ORDER BY j.trade, j.sort) FROM public.job_types j),
    'min_offer_paisa', public.setting('min_offer_paisa'),
    'min_price_bps', public.setting('min_price_bps'),
    'visit_fee_min_paisa', public.setting('visit_fee_min_paisa'),
    'visit_fee_max_paisa', public.setting('visit_fee_max_paisa')
  );
$$;

-- --- Posting ------------------------------------------------------------------------------------

/** Posts a job: the floor for its kind, anywhere in Islamabad. Otherwise as in_the_app. */
CREATE OR REPLACE FUNCTION public.post_job(
  p_trade       text,
  p_job_type    integer,
  p_description text,
  p_offer_paisa bigint,
  p_when_kind   text,
  p_when_part   text,
  p_sector      text,
  p_street      text,
  p_house       text,
  p_landmark    text DEFAULT NULL,
  p_lat         double precision DEFAULT NULL,
  p_lng         double precision DEFAULT NULL,
  p_power       text DEFAULT NULL,
  p_parts       text DEFAULT NULL,
  p_gate_note   text DEFAULT NULL,
  p_media       jsonb DEFAULT '[]'::jsonb,
  p_when_date   date DEFAULT NULL,
  p_when_from   smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_role   text;
  v_title  text;
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_street text := btrim(coalesce(p_street, ''));
  v_house  text := btrim(coalesce(p_house, ''));
  v_land   text := nullif(btrim(coalesce(p_landmark, '')), '');
  v_gate   text := nullif(btrim(coalesce(p_gate_note, '')), '');
  v_media  jsonb := coalesce(p_media, '[]'::jsonb);
  v_item   jsonb;
  v_job    uuid;
  v_ref    text;
  v_kind   text;
  v_path   text;
  -- Pakistan's own clock: "today" is the customer's today, not the server's.
  v_today  date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour   integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_wkind  text;
  v_wpart  text;
  v_wdate  date;
  v_wfrom  smallint;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
  IF v_role IS DISTINCT FROM 'customer' THEN
    RETURN public.refuse('Only a customer account can post a job.');
  END IF;

  -- What
  IF NOT EXISTS (SELECT 1 FROM public.trades WHERE slug = p_trade) THEN
    RETURN public.refuse('Choose what kind of work it is.', 'trade');
  END IF;
  IF p_job_type IS NOT NULL THEN
    SELECT name INTO v_title FROM public.job_types WHERE id = p_job_type AND trade = p_trade;
    IF v_title IS NULL THEN
      RETURN public.refuse('That job does not belong to this kind of work.', 'job_type');
    END IF;
  ELSE
    v_title := 'Something else';
  END IF;

  -- Show us
  IF jsonb_typeof(v_media) <> 'array' OR jsonb_array_length(v_media) > 6 THEN
    RETURN public.refuse('Too many files for one job.', 'media');
  END IF;
  IF length(coalesce(v_desc, '')) > 500 THEN
    RETURN public.refuse('Please keep the description under 500 letters.', 'description');
  END IF;
  IF jsonb_array_length(v_media) = 0 AND length(coalesce(v_desc, '')) < 10 THEN
    RETURN public.refuse('Show us what is wrong: a voice note, a video, a photo, or a few words.', 'media');
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'voice') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'video') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_media) m WHERE m->>'kind' = 'photo') > 4 THEN
    RETURN public.refuse('One voice note, one video and up to four photos.', 'media');
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_media) LOOP
    v_kind := v_item->>'kind';
    v_path := v_item->>'path';
    IF v_kind NOT IN ('voice', 'video', 'photo') OR v_path IS NULL
       OR v_path !~ ('^' || v_me::text || '/[A-Za-z0-9_-]{1,64}\.(m4a|mp4|aac|mp3|mov|3gp|jpg|jpeg|png|webp)$') THEN
      RETURN public.refuse('One of the files was not uploaded properly. Please add it again.', 'media');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'job-media' AND o.name = v_path) THEN
      RETURN public.refuse('One of the files did not finish uploading. Please try again.', 'media');
    END IF;
    IF EXISTS (SELECT 1 FROM public.job_media WHERE path = v_path) THEN
      RETURN public.refuse('That file already belongs to another job.', 'media');
    END IF;
  END LOOP;

  -- Price
  IF p_offer_paisa IS NULL OR p_offer_paisa % 100 <> 0 THEN
    RETURN public.refuse('Offer a price in whole rupees.', 'offer');
  END IF;
  IF p_offer_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('The lowest offer is Rs ' || to_char(public.setting('min_offer_paisa') / 100, 'FM999,999,999') || ': what it costs for somebody to come and look.', 'offer');
  END IF;
  -- The lowest for this job: a share of its usual price, set by the office (fast_posting).
  IF p_offer_paisa < public.price_floor(p_job_type) THEN
    RETURN public.refuse('The lowest for this job is Rs ' || to_char(public.price_floor(p_job_type) / 100, 'FM999,999,999') || '.', 'offer');
  END IF;
  IF p_offer_paisa > 50000000 THEN
    RETURN public.refuse('For work this size, write to the Pechkas office in the app first.', 'offer');
  END IF;

  -- When
  -- As soon as possible (older copies); a day, which is all the app asks
  -- now — the technician says in his offer when he will come; a day and a
  -- window (the copies that let the customer choose the time); or the older
  -- today / tomorrow with a part of the day.
  IF p_when_kind = 'now' THEN
    IF p_when_part IS NOT NULL OR p_when_date IS NOT NULL OR p_when_from IS NOT NULL THEN
      RETURN public.refuse('Choose when you want somebody.', 'when');
    END IF;
    v_wkind := 'now';
    v_wdate := v_today;
  ELSIF p_when_date IS NOT NULL THEN
    IF p_when_date < v_today OR p_when_date > v_today + 6 THEN
      RETURN public.refuse('Choose a day in the coming week.', 'when');
    END IF;
    IF p_when_from IS NOT NULL AND p_when_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Choose a time.', 'when');
    END IF;
    -- Today only while a technician could still come: the last window starts at 8pm.
    IF p_when_date = v_today AND coalesce(p_when_from, 20) <= v_hour THEN
      RETURN public.refuse(CASE WHEN p_when_from IS NULL THEN 'It is too late for today. Choose tomorrow or another day.'
                                ELSE 'That time has already started. Choose a later one.' END, 'when');
    END IF;
    v_wdate := p_when_date;
    v_wfrom := p_when_from;
    v_wkind := CASE WHEN p_when_date = v_today THEN 'today' WHEN p_when_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END;
    v_wpart := CASE WHEN p_when_from IS NULL THEN NULL WHEN p_when_from < 12 THEN 'morning' WHEN p_when_from < 16 THEN 'afternoon' ELSE 'evening' END;
  ELSIF p_when_kind IN ('today', 'tomorrow') AND p_when_part IN ('morning', 'afternoon', 'evening') AND p_when_from IS NULL THEN
    v_wkind := p_when_kind;
    v_wpart := p_when_part;
    v_wdate := v_today + CASE WHEN p_when_kind = 'tomorrow' THEN 1 ELSE 0 END;
  ELSE
    RETURN public.refuse('Choose when you want somebody.', 'when');
  END IF;

  -- Where
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector) THEN
    RETURN public.refuse('Choose your sector.', 'sector');
  END IF;
  -- Every part of Islamabad (Bahria Town and DHA count), nowhere else yet (the owner, 25 November 2026).
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector AND city = 'islamabad') THEN
    RETURN public.refuse('Pechkas works in Islamabad only, for now.', 'sector');
  END IF;
  -- D37: risky work only where somebody can do it.
  IF NOT public.type_open(p_trade, p_job_type, p_sector) THEN
    RETURN public.refuse('This kind of job is not available on Pechkas yet.', 'job_type');
  END IF;
  IF length(v_street) < 1 OR length(v_street) > 60 THEN
    RETURN public.refuse('Write your street.', 'street');
  END IF;
  IF length(v_house) < 1 OR length(v_house) > 60 THEN
    RETURN public.refuse('Write your house number.', 'house');
  END IF;
  IF length(coalesce(v_land, '')) > 120 THEN
    RETURN public.refuse('Please keep the landmark short.', 'landmark');
  END IF;
  IF (p_lat IS NULL) <> (p_lng IS NULL)
     OR (p_lat IS NOT NULL AND (p_lat NOT BETWEEN 23 AND 37.5 OR p_lng NOT BETWEEN 60 AND 78)) THEN
    RETURN public.refuse('Your location did not come through. Try again, or leave it out.', 'location');
  END IF;

  -- Good to know
  IF p_power IS NOT NULL AND p_power NOT IN ('on', 'off') THEN
    RETURN public.refuse('Say whether the electricity is on.', 'power');
  END IF;
  IF p_parts IS NOT NULL AND p_parts NOT IN ('pro_buys', 'customer_has') THEN
    RETURN public.refuse('Say who brings the parts.', 'parts');
  END IF;
  IF length(coalesce(v_gate, '')) > 120 THEN
    RETURN public.refuse('Please keep the note for the gate short.', 'gate_note');
  END IF;
  IF public.looks_like_cnic(v_desc) OR public.looks_like_cnic(v_land) OR public.looks_like_cnic(v_gate) THEN
    RETURN public.refuse('Please do not write a CNIC number here.', 'description');
  END IF;

  -- Floods
  IF (SELECT count(*) FROM public.jobs WHERE customer_id = v_me AND status = 'open') >= public.setting('max_open_jobs') THEN
    RETURN public.refuse('You already have ' || public.setting('max_open_jobs') || ' jobs open. Cancel one you no longer need first.');
  END IF;
  IF (SELECT count(*) FROM public.jobs WHERE customer_id = v_me AND created_at > now() - interval '24 hours') >= public.setting('max_posts_per_day') THEN
    RETURN public.refuse('That is a lot of jobs for one day. Please write to the Pechkas office in the app.');
  END IF;

  INSERT INTO public.jobs (
    customer_id, trade, job_type_id, title, description, offered_paisa,
    when_kind, when_part, when_date, when_from, sector, street, house, landmark, lat, lng,
    power, parts, gate_note
  ) VALUES (
    v_me, p_trade, p_job_type, v_title, v_desc, p_offer_paisa,
    v_wkind, v_wpart, v_wdate, v_wfrom, p_sector, v_street, v_house, v_land, p_lat, p_lng,
    p_power, p_parts, v_gate
  ) RETURNING id, ref INTO v_job, v_ref;

  INSERT INTO public.job_media (job_id, kind, path, seconds)
  SELECT v_job, m->>'kind', m->>'path',
         CASE WHEN (m->>'seconds') ~ '^[0-9]{1,3}$' THEN (m->>'seconds')::smallint END
  FROM jsonb_array_elements(v_media) m;

  RETURN jsonb_build_object('ok', true, 'id', v_job, 'ref', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.price_floor(integer) FROM PUBLIC, anon, authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261202000000_fast_posting')
ON CONFLICT (name) DO NOTHING;

COMMIT;
