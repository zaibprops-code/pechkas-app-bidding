-- =============================================================================
--  BIDDING (phase 3)
--
--  Run after 20261017000000_posting_a_job.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - a technician going online, and the jobs he may see: his trades, his
--     sectors, open. Never the street, the house, the phone or a surname;
--   - his offer: the customer's price, or his own, with when he can come;
--   - the customer seeing the live offers on their own job and choosing one;
--   - only then, the address and the customer's number for that one
--     technician, and his number for the customer;
--   - for the office: jobs nobody has offered on, and placing one by hand.
--
--  TWO TECHNICIANS CAN NEVER WIN THE SAME JOB. choose_offer() and
--  admin_assign() lock the job row, check it is still open, and only then
--  assign, in one transaction.
-- =============================================================================

BEGIN;


-- --- Settings ----------------------------------------------------------------------

-- 20000 basis points is 200%. The foundations capped basis points at 100%
-- for commission; this one setting is allowed past it.
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_check
  CHECK (unit <> 'basis_points' OR value <= 10000 OR key = 'max_counter_bps');

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('max_counter_bps', 20000, 'basis_points',
     'The most a technician may ask, as a share of what the customer offered. 20000 = twice the offer. Stops absurd counter-offers; the customer still decides.')
ON CONFLICT (key) DO NOTHING;


-- --- Technicians going online ----------------------------------------------------------

ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS online boolean NOT NULL DEFAULT false;
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;


-- --- Jobs get a technician --------------------------------------------------------------

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('open', 'assigned', 'cancelled'));

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pro_id uuid REFERENCES public.pros(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS agreed_paisa bigint CHECK (agreed_paisa IS NULL OR (agreed_paisa > 0 AND agreed_paisa % 100 = 0));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS assigned_by text CHECK (assigned_by IN ('customer', 'office'));
CREATE INDEX IF NOT EXISTS jobs_pro ON public.jobs (pro_id, status);


-- --- Offers ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  price_paisa bigint NOT NULL CHECK (price_paisa > 0 AND price_paisa % 100 = 0),
  -- How soon he can be there, for a job wanted now. NULL for a job booked
  -- for later: he is offering to come at the time asked.
  eta_minutes smallint CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 5 AND 480),
  note        text CHECK (note IS NULL OR length(note) <= 200),
  -- pending until the customer decides; an offer past expires_at is simply
  -- no longer live, which every function checks, so no timer is needed.
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'withdrawn', 'accepted', 'rejected')),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, pro_id)
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS offers_job ON public.offers (job_id, status);


-- --- Who may see which job ---------------------------------------------------------------

/**
 * May the asker see this open job in his feed? Approved, and the job is in
 * one of his trades and one of his sectors. One rule, used by the feed, by
 * making an offer, and by the storage policy for the job's files, so the
 * three can never disagree.
 */
CREATE OR REPLACE FUNCTION public.pro_may_see(p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.pros r ON r.id = auth.uid()
    WHERE j.id = p_job
      AND r.status = 'approved'
      AND (
        (j.status = 'open' AND j.trade = ANY (r.trades) AND j.sector = ANY (r.sectors))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
$$;

/** May the asker open this stored file? Used by the storage policy below. */
CREATE OR REPLACE FUNCTION public.pro_may_see_file(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_media m WHERE m.path = p_name AND public.pro_may_see(m.job_id)
  );
$$;

-- The customer, the office, and now a technician who may see that job. The
-- rule itself is pro_may_see(), not written out a second time here.
DROP POLICY IF EXISTS "job media: read own folder, or the office" ON storage.objects;
DROP POLICY IF EXISTS "job media: read own folder, the office, or a technician who may see the job" ON storage.objects;
CREATE POLICY "job media: read own folder, the office, or a technician who may see the job" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff()
      OR public.pro_may_see_file(name)
    )
  );


-- --- The technician's side -----------------------------------------------------------------

/** Online or not. Only an approved technician has a switch at all. */
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
  UPDATE public.pros SET online = coalesce(p_online, false), last_seen_at = now() WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'online', coalesce(p_online, false));
END;
$$;

/**
 * The jobs a technician may offer on, newest first, with his own offer on
 * each if he made one. Sector, never the street, house or phone; the
 * customer's first name only. Empty while he is offline.
 */
CREATE OR REPLACE FUNCTION public.pro_feed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_online boolean;
BEGIN
  SELECT online INTO v_online FROM public.pros WHERE id = auth.uid() AND status = 'approved';
  IF v_online IS NULL THEN
    RETURN jsonb_build_object('approved', false, 'online', false, 'jobs', '[]'::jsonb);
  END IF;
  UPDATE public.pros SET last_seen_at = now() WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'approved', true,
    'online', v_online,
    'commission_bps', public.setting('commission_bps'),
    'min_offer_paisa', public.setting('min_offer_paisa'),
    'max_counter_bps', public.setting('max_counter_bps'),
    'jobs', CASE WHEN NOT v_online THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'description', j.description, 'offered_paisa', j.offered_paisa,
          'list_paisa', t.list_paisa, 'when_kind', j.when_kind, 'when_part', j.when_part,
          'sector', j.sector, 'power', j.power, 'parts', j.parts,
          'customer_first_name', p.first_name, 'created_at', j.created_at,
          'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                             FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'eta_minutes', o.eta_minutes,
                                                 'note', o.note, 'status', o.status, 'expires_at', o.expires_at,
                                                 'live', o.status = 'pending' AND o.expires_at > now())
                       FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = auth.uid())
        ) ORDER BY j.created_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.job_types t ON t.id = j.job_type_id
      WHERE j.status = 'open'
        AND j.created_at > now() - interval '48 hours'
        AND j.customer_id <> auth.uid()
        AND public.pro_may_see(j.id)
    ), '[]'::jsonb) END
  );
END;
$$;

/**
 * A technician's offer on a job: the customer's own price, or his. Making
 * it again replaces his earlier one and restarts its clock.
 */
CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
  p_eta_minutes integer DEFAULT NULL,
  p_note        text DEFAULT NULL
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can make offers.');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  -- A job he may not see and a job that does not exist get the same answer.
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

  IF v_job.when_kind = 'now' AND (p_eta_minutes IS NULL OR p_eta_minutes NOT BETWEEN 5 AND 480) THEN
    RETURN public.refuse('Say how soon you can be there.', 'eta');
  END IF;
  IF v_job.when_kind <> 'now' AND p_eta_minutes IS NOT NULL THEN
    RETURN public.refuse('This job is booked for later; no arrival time needed.', 'eta');
  END IF;

  IF length(coalesce(v_note, '')) > 200 THEN
    RETURN public.refuse('Keep the note short.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  -- Numbers are swapped by the app once the customer chooses him; one
  -- written into the note would go round that.
  IF coalesce(v_note, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Do not write your number. The customer gets it when they choose you.', 'note');
  END IF;

  SELECT status INTO v_status FROM public.offers WHERE job_id = p_job AND pro_id = auth.uid();
  IF v_status IN ('accepted', 'rejected') THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  INSERT INTO public.offers AS o (job_id, pro_id, price_paisa, eta_minutes, note, status, expires_at)
  VALUES (p_job, auth.uid(), p_price_paisa, p_eta_minutes, v_note, 'pending',
          now() + make_interval(mins => public.setting('offer_minutes')::integer))
  ON CONFLICT (job_id, pro_id) DO UPDATE SET
    price_paisa = EXCLUDED.price_paisa,
    eta_minutes = EXCLUDED.eta_minutes,
    note = EXCLUDED.note,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

/** He takes his offer back, before the customer has chosen. */
CREATE OR REPLACE FUNCTION public.withdraw_offer(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.offers SET status = 'withdrawn', updated_at = now()
  WHERE job_id = p_job AND pro_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RETURN public.refuse('There is no offer of yours to take back.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The jobs a technician has been chosen for, with what he needs to get
 * there: the address, landmark, location, gate note, and the customer's
 * first name and number. Only while the job is his and still on.
 */
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
      'keeps_paisa', j.agreed_paisa - (j.agreed_paisa * public.setting('commission_bps')) / 10000,
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'lat', j.lat, 'lng', j.lng, 'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'customer_first_name', p.first_name, 'customer_phone', u.phone,
      'assigned_at', j.assigned_at,
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;


-- --- The customer's side -------------------------------------------------------------------

/**
 * The live offers on one of the asker's own jobs. A technician's first name,
 * his years of experience and that Pechkas met him; never his surname or
 * number, until he is chosen.
 */
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
      'note', o.note,
      'expires_at', o.expires_at,
      'created_at', o.created_at
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

/** The customer chooses one offer. Everything else on the job is turned down. */
CREATE OR REPLACE FUNCTION public.choose_offer(p_offer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job      uuid;
  v_customer uuid;
  v_status   text;
  v_offer    public.offers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT job_id INTO v_job FROM public.offers WHERE id = p_offer;
  IF v_job IS NULL THEN
    RETURN public.refuse('That offer is no longer there.');
  END IF;

  -- The lock. Whoever gets here second waits, then sees the job taken.
  SELECT customer_id, status INTO v_customer, v_status FROM public.jobs WHERE id = v_job FOR UPDATE;
  IF v_customer IS DISTINCT FROM auth.uid() THEN
    RETURN public.refuse('That offer is no longer there.');
  END IF;
  IF v_status <> 'open' THEN
    RETURN public.refuse('This job already has a technician, or was cancelled.');
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer FOR UPDATE;
  IF v_offer.status <> 'pending' OR v_offer.expires_at <= now() THEN
    RETURN public.refuse('That offer has run out. Choose another, or wait for new ones.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_offer.pro_id AND status = 'approved') THEN
    RETURN public.refuse('That technician is not available any more. Choose another.');
  END IF;

  UPDATE public.jobs
  SET status = 'assigned', pro_id = v_offer.pro_id, agreed_paisa = v_offer.price_paisa,
      assigned_at = now(), assigned_by = 'customer', updated_at = now()
  WHERE id = v_job;
  UPDATE public.offers SET status = 'accepted', updated_at = now() WHERE id = p_offer;
  UPDATE public.offers SET status = 'rejected', updated_at = now()
  WHERE job_id = v_job AND id <> p_offer AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The asker's own jobs, now with the live offer count and, once chosen, the technician. */
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
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'status', j.status, 'cancelled_by', j.cancelled_by, 'cancel_reason', j.cancel_reason,
      'created_at', j.created_at,
      'live_offers', (SELECT count(*) FROM public.offers o JOIN public.pros r ON r.id = o.pro_id
                      WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now() AND r.status = 'approved'),
      'agreed_paisa', j.agreed_paisa,
      -- The technician's name and number reach the customer only once he
      -- is theirs, and only while the job is on.
      'pro', CASE WHEN j.status = 'assigned' THEN (
               SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', u.phone, 'years', r.years)
               FROM public.pros r JOIN auth.users u ON u.id = r.id WHERE r.id = j.pro_id)
             END,
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

/** A customer calls off their own job: still open, or already given to a technician. */
CREATE OR REPLACE FUNCTION public.cancel_job(p_job uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT status INTO v_status FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('This job is already closed.');
  END IF;
  IF length(coalesce(v_reason, '')) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'customer', cancel_reason = v_reason, updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The office ------------------------------------------------------------------------------

-- The list changes shape (offers, the chosen technician, "needs you"), and
-- Postgres cannot change what a function returns in place.
DROP FUNCTION IF EXISTS public.admin_jobs(text);

/**
 * Every job, for the office only. `needs_you` marks a job that has sat open
 * longer than `escalate_minutes` with no live offer: the owner rings round
 * and places it by hand.
 */
CREATE FUNCTION public.admin_jobs(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, trade text, title text, description text, offered_paisa bigint,
  list_paisa bigint, when_kind text, when_part text,
  sector text, street text, house text, landmark text, lat double precision, lng double precision,
  power text, parts text, gate_note text, status text, cancelled_by text, cancel_reason text,
  created_at timestamptz, customer_name text, customer_phone text, media jsonb,
  live_offers integer, needs_you boolean, agreed_paisa bigint, assigned_by text,
  pro_name text, pro_phone text
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
         j.created_at, p.first_name, u.phone,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                   FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
         live.n,
         j.status = 'open' AND live.n = 0 AND j.created_at < now() - make_interval(mins => public.setting('escalate_minutes')::integer),
         j.agreed_paisa, j.assigned_by,
         r.full_name, ru.phone
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
  WHERE public.is_staff()
    AND (p_status IS NULL OR j.status = p_status)
  ORDER BY j.created_at DESC
  LIMIT 200;
$$;

/** The office places a job with a technician it rang, at the price agreed on the phone. */
CREATE OR REPLACE FUNCTION public.admin_assign(p_job uuid, p_pro uuid, p_price_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT status INTO v_status FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_status <> 'open' THEN
    RETURN public.refuse('This job already has a technician, or was cancelled.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro AND status = 'approved') THEN
    RETURN public.refuse('Choose an approved technician.', 'pro');
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 OR p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('Write the price agreed, in whole rupees, at least the lowest offer.', 'price');
  END IF;

  UPDATE public.jobs
  SET status = 'assigned', pro_id = p_pro, agreed_paisa = p_price_paisa,
      assigned_at = now(), assigned_by = 'office', updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The office calls off a job: open, or already with a technician — a no-show,
 * a customer who rang to cancel. The technician loses the address at once.
 */
CREATE OR REPLACE FUNCTION public.admin_cancel_job(p_job uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT status INTO v_status FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('This job is already closed.');
  END IF;
  IF v_reason IS NULL THEN
    RETURN public.refuse('Write the reason. The customer will see it.', 'reason');
  END IF;
  IF length(v_reason) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'office', cancel_reason = v_reason, updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Approved technicians, for the office to choose from when placing a job. */
CREATE OR REPLACE FUNCTION public.admin_pros()
RETURNS TABLE (id uuid, full_name text, phone text, trades text[], sectors text[], online boolean, last_seen_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.full_name, u.phone, r.trades, r.sectors, r.online, r.last_seen_at
  FROM public.pros r JOIN auth.users u ON u.id = r.id
  WHERE public.is_staff() AND r.status = 'approved'
  ORDER BY r.full_name;
$$;


-- --- Who may call what ------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION
  public.pro_may_see(uuid),
  public.pro_may_see_file(text),
  public.pro_set_online(boolean),
  public.pro_feed(),
  public.make_offer(uuid, bigint, integer, text),
  public.withdraw_offer(uuid),
  public.pro_my_jobs(),
  public.job_offers(uuid),
  public.choose_offer(uuid),
  public.admin_jobs(text),
  public.admin_assign(uuid, uuid, bigint),
  public.admin_pros()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261018000000_bidding')
ON CONFLICT (name) DO NOTHING;

COMMIT;
