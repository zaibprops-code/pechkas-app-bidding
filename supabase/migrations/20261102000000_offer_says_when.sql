-- =============================================================================
--  The customer chooses the day; the technician says when he will come
-- =============================================================================
--
--  The owner's decision, after the version that let a customer pick a
--  two-hour window: a customer does not know the technicians' days, and a
--  time nobody is free for gets no offers at all; and a home repair is not a
--  ride — nobody is waiting round the corner — so "as soon as possible" is
--  a promise that is broken more often than kept.
--
--    · A job now carries only its DAY: today (while a technician could still
--      come — the last window starts at 8pm), tomorrow, or a day of the
--      coming week. `when_part` and `when_from` stay empty.
--    · Every offer on such a job says the two hours HE will arrive in
--      (`offers.arrive_from`, the same seven windows), on that day, never
--      one that has already started. The customer compares price and time.
--    · Choosing an offer makes his time the job's: `when_from` (and the part
--      of the day) are copied from the offer as it is accepted, by a trigger,
--      so every screen and the office show "Sat 31 Oct, 2–4pm" from then on.
--    · A job for a day leaves the technicians' list the day after.
--
--  Copies of the app from before keep working: "now" with minutes, a
--  customer-chosen window, or today / tomorrow with a part of the day are
--  all still accepted, and offers on those jobs work as they did.
--
--  Safe to run twice.

BEGIN;

-- --- The job: a day is enough ----------------------------------------------------------------

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS arrive_from smallint;
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_arrive_from_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_arrive_from_check CHECK (arrive_from IS NULL OR arrive_from IN (8, 10, 12, 14, 16, 18, 20));

-- The first rule said a job not wanted now always has a part of the day.
-- Postgres named it itself, so it is found by what it says.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.jobs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%when_kind = ''now''%= (when_part IS NULL)%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_now_has_no_part;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_now_has_no_part CHECK (when_kind <> 'now' OR (when_part IS NULL AND when_from IS NULL));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_later_has_a_day;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_later_has_a_day CHECK (when_kind <> 'later' OR when_date IS NOT NULL);

-- post_job() keeps its arguments; only what it accepts changes.
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
  IF p_offer_paisa > 50000000 THEN
    RETURN public.refuse('For work this size, call Pechkas first.', 'offer');
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
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector AND live) THEN
    RETURN public.refuse('Pechkas does not work in ' || p_sector || ' yet, so nobody could honestly be promised.', 'sector');
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
    RETURN public.refuse('That is a lot of jobs for one day. Please call Pechkas.');
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

/** "Today", "Tomorrow, 2–4pm", "Sat 31 Oct", "As soon as possible": when a job is wanted, in a notification. */
CREATE OR REPLACE FUNCTION public.when_text(p_job public.jobs)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_job.when_kind = 'now' THEN public.say('when.now', 'en')
    WHEN p_job.when_date IS NULL THEN public.when_words(p_job.when_kind, p_job.when_part, 'en')
    ELSE CASE
           WHEN p_job.when_date = (now() AT TIME ZONE 'Asia/Karachi')::date THEN public.say('when.today', 'en')
           WHEN p_job.when_date = (now() AT TIME ZONE 'Asia/Karachi')::date + 1 THEN public.say('when.tomorrow', 'en')
           ELSE to_char(p_job.when_date, 'Dy FMDD Mon')
         END
         || CASE
              WHEN p_job.when_from IS NOT NULL THEN ', ' || public.window_text(p_job.when_from)
              WHEN p_job.when_part IS NOT NULL THEN ' ' || public.say('part.' || p_job.when_part, 'en')
              ELSE ''
            END
  END;
$$;


-- --- The offer: when he will come -----------------------------------------------------------

DROP FUNCTION IF EXISTS public.make_offer(uuid, bigint, integer, text);

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
  v_owed := public.pro_owed(auth.uid());
  IF v_owed > public.setting('credit_limit_paisa') THEN
    RETURN public.refuse('You owe Pechkas ' || public.rs(v_owed) || '. Pay it to make new offers.', 'owed');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  IF v_job.id IS NULL OR v_job.status <> 'open' OR NOT public.pro_may_see(p_job) OR v_job.customer_id = auth.uid() THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  v_max := (v_job.offered_paisa * public.setting('max_counter_bps')) / 10000;
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
  IF v_status IN ('accepted', 'rejected') THEN
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

CREATE OR REPLACE FUNCTION public.job_offers(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'pro_first_name', split_part(r.full_name, ' ', 1),
      'years', r.years,
      'price_paisa', o.price_paisa,
      'is_counter', o.price_paisa <> j.offered_paisa,
      'eta_minutes', o.eta_minutes,
      'arrive_from', o.arrive_from,
      'note', o.note,
      'expires_at', o.expires_at,
      'created_at', o.created_at,
      'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
      'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer
    ) ORDER BY o.created_at), '[]'::jsonb)
  FROM public.offers o
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.pros r ON r.id = o.pro_id
  WHERE o.job_id = p_job
    AND j.customer_id = auth.uid()
    AND j.status = 'open'
    AND o.status = 'pending'
    AND o.expires_at > now()
    AND r.status = 'approved';
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
    'jobs', CASE WHEN NOT v_online THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'description', j.description, 'offered_paisa', j.offered_paisa,
          'list_paisa', t.list_paisa, 'when_kind', j.when_kind, 'when_part', j.when_part,
          'when_date', j.when_date, 'when_from', j.when_from,
          'sector', j.sector, 'power', j.power, 'parts', j.parts,
          'customer_first_name', p.first_name, 'created_at', j.created_at,
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

/**
 * The moment an offer is accepted, his time becomes the job's — only for a
 * job that had a day and no time, and only once. Done here so choosing, by
 * the customer or any future path, cannot forget it.
 */
CREATE OR REPLACE FUNCTION public.offer_time_to_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' AND NEW.arrive_from IS NOT NULL THEN
    UPDATE public.jobs
    SET when_from = NEW.arrive_from,
        when_part = CASE WHEN NEW.arrive_from < 12 THEN 'morning' WHEN NEW.arrive_from < 16 THEN 'afternoon' ELSE 'evening' END
    WHERE id = NEW.job_id AND when_kind <> 'now' AND when_from IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offer_time_to_job ON public.offers;
CREATE TRIGGER offer_time_to_job AFTER UPDATE OF status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offer_time_to_job();


-- --- Who may call what ------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.make_offer(uuid, bigint, integer, text, smallint) TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261102000000_offer_says_when')
ON CONFLICT (name) DO NOTHING;

COMMIT;
