-- =============================================================================
--  A day and a time, the technician's profile, and "Book again"
-- =============================================================================
--
--  Three things the owner asked for, so the app works like a home-services
--  app and not only a ride app:
--
--    · A DAY AND A TIME. A job could only be wanted now, today or tomorrow,
--      morning, afternoon or evening. Now it can be booked for any day of
--      the coming week (today and the six after it) in a two-hour window,
--      8–10am to 8–10pm. The day is kept as a date (`when_date`), so a job
--      booked for Saturday still says Saturday on Friday — "tomorrow" said
--      the night before used to stay "tomorrow" for ever. `when_kind` and
--      `when_part` are still filled in (today / tomorrow / later, and the part
--      of the day the window falls in), so nothing that reads them changes.
--      Copies of the app from before keep posting the old way and get a
--      date worked out for them. A job booked for a later day stays in the
--      technicians' list until its day has passed, not only for two days.
--
--    · THE TECHNICIAN'S PROFILE. A customer choosing between offers can open
--      each one: first name, years in the trade, his trades, the checks
--      Pechkas did and since when, jobs done, his rating — "New" until there
--      are enough — and the last five things customers wrote about him,
--      without their names. Only for the customer whose job he offered on,
--      and never his surname or his number. public.offer_profile() names
--      every field that comes back.
--
--    · BOOK AGAIN. my_jobs() now also gives a customer her own job's job
--      type and pin, so a finished job can be posted again in one tap.
--
--  Safe to run twice.

BEGIN;

-- --- The day and the window ---------------------------------------------------------------

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS when_date date;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS when_from smallint;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_when_kind_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_when_kind_check CHECK (when_kind IN ('now', 'today', 'tomorrow', 'later'));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_when_from_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_when_from_check CHECK (when_from IS NULL OR when_from IN (8, 10, 12, 14, 16, 18, 20));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_later_has_a_day;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_later_has_a_day CHECK (when_kind <> 'later' OR (when_date IS NOT NULL AND when_from IS NOT NULL));

-- Jobs posted before this have no date: the day they meant, in Pakistan.
UPDATE public.jobs
SET when_date = (created_at AT TIME ZONE 'Asia/Karachi')::date + CASE WHEN when_kind = 'tomorrow' THEN 1 ELSE 0 END
WHERE when_date IS NULL;

/** "10am–12pm": the window a job was booked for. The app's WINDOWS in packages/shared say the same. */
CREATE OR REPLACE FUNCTION public.window_text(p_from smallint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_from
    WHEN 8 THEN '8–10am' WHEN 10 THEN '10am–12pm' WHEN 12 THEN '12–2pm' WHEN 14 THEN '2–4pm'
    WHEN 16 THEN '4–6pm' WHEN 18 THEN '6–8pm' WHEN 20 THEN '8–10pm'
  END;
$$;

/** When a job is wanted, in a notification's words: "Today, 10am–12pm", "Sat 1 Nov, 6–8pm", "As soon as possible". */
CREATE OR REPLACE FUNCTION public.when_text(p_job public.jobs)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_job.when_kind = 'now' THEN public.say('when.now', 'en')
    WHEN p_job.when_from IS NULL OR p_job.when_date IS NULL THEN public.when_words(p_job.when_kind, p_job.when_part, 'en')
    ELSE CASE
           WHEN p_job.when_date = (now() AT TIME ZONE 'Asia/Karachi')::date THEN public.say('when.today', 'en')
           WHEN p_job.when_date = (now() AT TIME ZONE 'Asia/Karachi')::date + 1 THEN public.say('when.tomorrow', 'en')
           ELSE to_char(p_job.when_date, 'Dy FMDD Mon')
         END || ', ' || public.window_text(p_job.when_from)
  END;
$$;

CREATE OR REPLACE FUNCTION public.job_vars(p_job public.jobs)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ref', p_job.ref,
    'trade', coalesce((SELECT name FROM public.trades WHERE slug = p_job.trade), p_job.trade),
    'sector', p_job.sector,
    'customer', coalesce((SELECT first_name FROM public.profiles WHERE id = p_job.customer_id), 'Customer'),
    'when_en', public.when_text(p_job),
    'when_ur', public.when_words(p_job.when_kind, p_job.when_part, 'ur')
  );
$$;

-- post_job() takes the day and the window as two more arguments at the end.
-- The old one goes: two versions side by side would make every call ambiguous.
DROP FUNCTION IF EXISTS public.post_job(text, integer, text, bigint, text, text, text, text, text, text,
                                        double precision, double precision, text, text, text, jsonb);

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
  -- Three ways in: as soon as possible; a day and a two-hour window (the
  -- app since it could book a day); or the older today / tomorrow with a
  -- part of the day, which copies of the app from before still send.
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
    IF p_when_from IS NULL OR p_when_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Choose a time.', 'when');
    END IF;
    IF p_when_date = v_today AND p_when_from <= v_hour THEN
      RETURN public.refuse('That time has already started. Choose a later one.', 'when');
    END IF;
    v_wdate := p_when_date;
    v_wfrom := p_when_from;
    v_wkind := CASE WHEN p_when_date = v_today THEN 'today' WHEN p_when_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END;
    v_wpart := CASE WHEN p_when_from < 12 THEN 'morning' WHEN p_when_from < 16 THEN 'afternoon' ELSE 'evening' END;
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
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'eta_minutes', o.eta_minutes,
                                                 'note', o.note, 'status', o.status, 'expires_at', o.expires_at,
                                                 'live', o.status = 'pending' AND o.expires_at > now())
                       FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = auth.uid())
        ) ORDER BY coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false) DESC, j.created_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.job_types t ON t.id = j.job_type_id
      WHERE j.status = 'open'
        -- Two days for a job wanted now, today or tomorrow; one booked for a
        -- later day stays until its day has passed.
        AND (j.created_at > now() - interval '48 hours'
             OR (j.when_from IS NOT NULL AND j.when_date >= (now() AT TIME ZONE 'Asia/Karachi')::date))
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
      'repeat', c.bps <> public.setting('commission_bps'),
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
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

-- --- What a customer's own jobs say (the day, the window, and what Book again needs) -------

CREATE OR REPLACE FUNCTION public.my_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
      'description', j.description, 'offered_paisa', j.offered_paisa,
      'when_kind', j.when_kind, 'when_part', j.when_part, 'when_date', j.when_date, 'when_from', j.when_from,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'job_type_id', j.job_type_id, 'lat', j.lat, 'lng', j.lng,
      'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'status', j.status, 'stage', j.stage, 'cancelled_by', j.cancelled_by, 'cancel_reason', j.cancel_reason,
      'created_at', j.created_at,
      'live_offers', (SELECT count(*) FROM public.offers o JOIN public.pros r ON r.id = o.pro_id
                      WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now() AND r.status = 'approved'),
      'agreed_paisa', j.agreed_paisa,
      'start_code', CASE WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived') THEN j.start_code END,
      'code_locked', j.code_locked_at IS NOT NULL,
      'pro', CASE
               WHEN j.status = 'assigned' THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', public.phone_of(u.id), 'years', r.years)
                 FROM public.pros r JOIN auth.users u ON u.id = r.id WHERE r.id = j.pro_id)
               WHEN j.status IN ('done', 'stopped') THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'years', r.years)
                 FROM public.pros r WHERE r.id = j.pro_id)
             END,
      'preferred', CASE WHEN j.status = 'open' AND j.preferred_pro_id IS NOT NULL AND j.preferred_until > now() THEN (
                     SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'until', j.preferred_until)
                     FROM public.pros r WHERE r.id = j.preferred_pro_id) END,
      -- Whom it was held for at all, so the screen can tell "he passed / time
      -- ran out" from "he was not working, so it was never held".
      'asked_for', (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.preferred_pro_id),
      'can_ask_again', j.status = 'done'
                       AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = j.pro_id AND r.status = 'approved')
                       AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'blocked', j.pro_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'can_block', j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled'),
      -- Only his first name, only for the block button: a cancelled job's
      -- card otherwise says nothing about the man who was going to come.
      'block_name', CASE WHEN j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled')
                         THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END,
      'change', CASE WHEN j.status = 'assigned' THEN public.pending_change(j.id) END,
      'visit_fee_paisa', CASE WHEN j.status = 'assigned' THEN public.visit_fee(j.id) END,
      'collect_paisa', j.collect_paisa,
      'parts_paisa', j.parts_paisa,
      'finished_at', j.finished_at,
      'photos', public.photos_of(j.id),
      'can_report', j.status IN ('done', 'stopped') AND j.problem_at IS NULL AND j.finished_at > now() - interval '24 hours',
      'problem_at', j.problem_at,
      'my_rating', (SELECT x.stars FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'can_rate', j.status IN ('done', 'stopped')
                  AND j.finished_at > now() - make_interval(days => public.setting('rating_days')::integer)
                  AND NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'guarantee_until', CASE WHEN j.status = 'done'
                              THEN j.finished_at + make_interval(days => public.setting('guarantee_days')::integer) END,
      'claim_open', EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open'),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

-- admin_jobs() returns a table, and a table cannot grow columns in place.
DROP FUNCTION IF EXISTS public.admin_jobs(text);

CREATE OR REPLACE FUNCTION public.admin_jobs(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, trade text, title text, description text, offered_paisa bigint,
  list_paisa bigint, when_kind text, when_part text,
  sector text, street text, house text, landmark text, lat double precision, lng double precision,
  power text, parts text, gate_note text, status text, cancelled_by text, cancel_reason text,
  created_at timestamptz, customer_name text, customer_phone text, media jsonb,
  live_offers integer, needs_you boolean, why text, agreed_paisa bigint, assigned_by text,
  pro_name text, pro_phone text, stage text, collect_paisa bigint, code_locked boolean,
  problem_text text, finished_at timestamptz, when_date date, when_from smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.ref, j.trade, j.title, j.description, j.offered_paisa,
         t.list_paisa, j.when_kind, j.when_part,
         j.sector, j.street, j.house, j.landmark, j.lat, j.lng,
         j.power, j.parts, j.gate_note, j.status, j.cancelled_by, j.cancel_reason,
         j.created_at, p.first_name, public.phone_of(u.id),
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                   FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
         live.n,
         w.why IS NOT NULL,
         w.why,
         j.agreed_paisa, j.assigned_by,
         r.full_name, public.phone_of(ru.id), j.stage, j.collect_paisa, j.code_locked_at IS NOT NULL,
         j.problem_text, j.finished_at, j.when_date, j.when_from
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  LEFT JOIN public.job_types t ON t.id = j.job_type_id
  LEFT JOIN public.pros r ON r.id = j.pro_id
  LEFT JOIN auth.users ru ON ru.id = j.pro_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n FROM public.offers o
    WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()
  ) live
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind = 'emergency' AND NOT x.mistake) THEN 'EMERGENCY'
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind = 'guarantee') THEN 'Guarantee claim'
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind <> 'guarantee') THEN 'Problem reported'
      WHEN j.status = 'assigned' AND j.code_locked_at IS NOT NULL THEN 'Start code locked'
      WHEN j.status = 'assigned' AND j.stage = 'on_way' AND j.on_way_at < now() - interval '3 hours' THEN 'On the way for over 3 hours'
      WHEN j.status = 'assigned' AND j.stage = 'working' AND j.started_at < now() - interval '10 hours' THEN 'Working for over 10 hours'
      WHEN j.status = 'open' AND live.n = 0 AND j.created_at < now() - make_interval(mins => public.setting('escalate_minutes')::integer) THEN 'No offers'
    END AS why
  ) w
  WHERE public.is_staff()
    AND (p_status IS NULL
         OR j.status = p_status
         OR (p_status = 'finished' AND j.status IN ('done', 'stopped')))
  ORDER BY j.created_at DESC
  LIMIT 200;
$$;

-- --- The technician's profile, for the customer choosing ----------------------------------

/**
 * One offer's technician, as the customer whose job it is may see him before
 * choosing: first name, years, trades, which checks Pechkas did and since
 * when, jobs done, his rating (NULL, shown as "New", until there are enough),
 * how many jobs he has done for this customer, and the last five things
 * customers wrote about him — words and stars only, never who wrote them.
 * Never his surname, his number or his sectors. Anybody else gets NULL.
 */
CREATE OR REPLACE FUNCTION public.offer_profile(p_offer uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'first_name', split_part(r.full_name, ' ', 1),
    'years', r.years,
    'trades', (SELECT coalesce(jsonb_agg(t.name ORDER BY t.sort), '[]'::jsonb) FROM public.trades t WHERE t.slug = ANY (r.trades)),
    'checked_since', r.decided_at,
    'checks', (SELECT coalesce(jsonb_agg(DISTINCT c.step), '[]'::jsonb) FROM public.pro_checks c WHERE c.pro_id = r.id),
    'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
    'rating_count', (public.pro_rating(r.id) ->> 'count')::integer,
    'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
    'done_for_you', (SELECT count(*) FROM public.jobs d WHERE d.pro_id = r.id AND d.customer_id = auth.uid() AND d.status = 'done'),
    'words', (SELECT coalesce(jsonb_agg(s.w ORDER BY s.at DESC), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at, 'trade', tt.name) AS w, x.created_at AS at
                FROM public.ratings x
                JOIN public.jobs xj ON xj.id = x.job_id
                LEFT JOIN public.trades tt ON tt.slug = xj.trade
                WHERE x.to_id = r.id AND x.side = 'customer'
                  AND nullif(btrim(coalesce(x.words, '')), '') IS NOT NULL
                  AND public.rating_revealed(x.job_id)
                ORDER BY x.created_at DESC
                LIMIT 5) s)
  )
  FROM public.offers o
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.pros r ON r.id = o.pro_id
  WHERE o.id = p_offer
    AND j.customer_id = auth.uid()
    AND r.status = 'approved';
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- window_text() and when_text() are granted to nobody: they are only used
-- inside the functions above.

GRANT EXECUTE ON FUNCTION
  public.post_job(text, integer, text, bigint, text, text, text, text, text, text,
                  double precision, double precision, text, text, text, jsonb, date, smallint),
  public.admin_jobs(text),
  public.offer_profile(uuid)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261101000000_days_profiles_again')
ON CONFLICT (name) DO NOTHING;

COMMIT;
