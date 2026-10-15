-- =============================================================================
--  MONEY AND TRUST (phase 5)
--
--  Run after 20261021000000_doing_the_job.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - PARTS at the end of a job: he says what he spent, with the shop's
--     receipt, and commission is on the rest — the labour — only;
--   - the LEDGER: every rupee owed and paid is a transaction whose lines add
--     up to nothing, written once and never changed. Nobody's balance is
--     stored; it is the sum of the ledger;
--   - COMMISSION, 10% of the labour, rounded down, owed when a job is done.
--     20% of it is set aside as the guarantee reserve. A visit fee carries
--     none: it is petrol;
--   - the CREDIT LIMIT: a technician who owes more than it cannot offer on
--     new jobs until he pays;
--   - PAYING: outside the app (JazzCash, Easypaisa, bank, cash). The office
--     records each payment with its reference; a mistake is undone with a
--     reversal, never by editing;
--   - RATINGS, both ways, hidden until both have rated or two days have
--     passed. A technician shows "New" until he has `rating_min_count`;
--   - PROBLEMS, GUARANTEE CLAIMS and the EMERGENCY BUTTON, all to the
--     office's queue, the emergency to the owner's phone at once.
--
--  Version 1 still holds nobody's money. Cash goes from the customer to the
--  technician; the ledger only records what he owes Pechkas.
-- =============================================================================

BEGIN;


-- --- Numbers the owner chose ---------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('reserve_bps', 2000, 'basis_points',
     'The share of each commission set aside as the guarantee reserve, to pay for redoing failed work. 2000 = 20%.'),
  ('rating_min_count', 3, 'count',
     'Ratings a technician needs before customers see his stars instead of "New".'),
  ('rating_days', 14, 'days',
     'How long after a job either side may rate it.')
ON CONFLICT (key) DO NOTHING;


-- --- Parts ---------------------------------------------------------------------------

ALTER TABLE public.job_photos DROP CONSTRAINT IF EXISTS job_photos_stage_check;
ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_stage_check
  CHECK (stage IN ('before', 'after', 'change', 'receipt'));

-- Fixed when the job ends, like collect_paisa: what of the price was parts,
-- and the commission on the rest.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS parts_paisa bigint
  CHECK (parts_paisa IS NULL OR (parts_paisa >= 0 AND parts_paisa % 100 = 0));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS commission_paisa bigint
  CHECK (commission_paisa IS NULL OR commission_paisa >= 0);

/** 10% of the labour, rounded DOWN: the odd paisa stay with the technician. The same as packages/shared. */
CREATE OR REPLACE FUNCTION public.commission_on(p_labour bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (greatest(p_labour, 0) * public.setting('commission_bps')) / 10000;
$$;


-- --- The ledger ------------------------------------------------------------------------

-- No foreign keys on purpose: a customer deleting their account deletes
-- their jobs, and the money record must outlive them. The job number and
-- the technician's name are copied in.
CREATE TABLE IF NOT EXISTS public.ledger_txns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A retry can never post twice: 'commission:<job>', 'settle:<form key>'.
  idempotency_key text NOT NULL UNIQUE,
  kind            text NOT NULL CHECK (kind IN ('commission', 'settlement', 'reversal')),
  job_id          uuid,
  job_ref         text,
  pro_id          uuid,
  pro_name        text,
  method          text CHECK (method IN ('jazzcash', 'easypaisa', 'bank', 'cash')),
  reference       text CHECK (reference IS NULL OR length(reference) <= 80),
  memo            text CHECK (memo IS NULL OR length(memo) <= 300),
  reverses        uuid UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  created_by_name text
);
ALTER TABLE public.ledger_txns ENABLE ROW LEVEL SECURITY;

-- Each line moves money into (+) or out of (−) one account. The accounts:
--   pro_owes   what one technician owes Pechkas
--   commission Pechkas' earnings
--   reserve    set aside for redoing failed work
--   received   money that reached Pechkas
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id           bigserial PRIMARY KEY,
  txn_id       uuid NOT NULL REFERENCES public.ledger_txns(id),
  account      text NOT NULL CHECK (account IN ('pro_owes', 'commission', 'reserve', 'received')),
  pro_id       uuid,
  amount_paisa bigint NOT NULL CHECK (amount_paisa <> 0),
  CHECK ((account = 'pro_owes') = (pro_id IS NOT NULL))
);
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ledger_entries_pro ON public.ledger_entries (pro_id) WHERE pro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_txn ON public.ledger_entries (txn_id);

/** Written once. Not the office, not the owner, not this file run again. */
CREATE OR REPLACE FUNCTION public.ledger_written_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'The ledger is written once and never changed. Record a reversal instead.';
END;
$$;

DROP TRIGGER IF EXISTS ledger_txns_once ON public.ledger_txns;
CREATE TRIGGER ledger_txns_once BEFORE UPDATE OR DELETE ON public.ledger_txns
  FOR EACH ROW EXECUTE FUNCTION public.ledger_written_once();
DROP TRIGGER IF EXISTS ledger_txns_no_truncate ON public.ledger_txns;
CREATE TRIGGER ledger_txns_no_truncate BEFORE TRUNCATE ON public.ledger_txns
  FOR EACH STATEMENT EXECUTE FUNCTION public.ledger_written_once();
DROP TRIGGER IF EXISTS ledger_entries_once ON public.ledger_entries;
CREATE TRIGGER ledger_entries_once BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_written_once();
DROP TRIGGER IF EXISTS ledger_entries_no_truncate ON public.ledger_entries;
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON public.ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.ledger_written_once();

/** Checked when the transaction commits: every transaction's lines add up to nothing. */
CREATE OR REPLACE FUNCTION public.ledger_balances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (SELECT sum(e.amount_paisa) FROM public.ledger_entries e WHERE e.txn_id = NEW.txn_id) <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % does not add up to nothing.', NEW.txn_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_balances ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_balances AFTER INSERT ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ledger_balances();

/**
 * Posts one transaction. Lines: [{account, pro_id?, amount}]. Returns its id,
 * or NULL when that key was already posted — a retry changes nothing.
 */
CREATE OR REPLACE FUNCTION public.post_txn(
  p_key text, p_kind text, p_job uuid, p_pro uuid, p_lines jsonb,
  p_method text DEFAULT NULL, p_reference text DEFAULT NULL, p_memo text DEFAULT NULL, p_reverses uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id  uuid;
  v_sum bigint;
BEGIN
  SELECT coalesce(sum((l ->> 'amount')::bigint), 0) INTO v_sum FROM jsonb_array_elements(p_lines) AS l;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'Ledger lines must add up to nothing; these add up to %.', v_sum;
  END IF;
  INSERT INTO public.ledger_txns (idempotency_key, kind, job_id, job_ref, pro_id, pro_name, method, reference, memo, reverses, created_by, created_by_name)
  VALUES (p_key, p_kind, p_job, (SELECT ref FROM public.jobs WHERE id = p_job), p_pro,
          (SELECT full_name FROM public.pros WHERE id = p_pro), p_method, p_reference, p_memo, p_reverses,
          auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.ledger_entries (txn_id, account, pro_id, amount_paisa)
  SELECT v_id, l ->> 'account', nullif(l ->> 'pro_id', '')::uuid, (l ->> 'amount')::bigint
  FROM jsonb_array_elements(p_lines) AS l
  WHERE (l ->> 'amount')::bigint <> 0;
  RETURN v_id;
END;
$$;

/** What one technician owes Pechkas now: the sum of his lines, never a stored figure. */
CREATE OR REPLACE FUNCTION public.pro_owed(p_pro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(e.amount_paisa), 0)::bigint FROM public.ledger_entries e
  WHERE e.account = 'pro_owes' AND e.pro_id = p_pro;
$$;


-- --- Commission, when a job is done ------------------------------------------------------

/**
 * Done: he owes the commission on the labour. 80% of it is Pechkas'
 * earnings and 20% the guarantee reserve. Posted by the database the moment
 * the job is done, once — the key is the job — whoever marked it.
 */
CREATE OR REPLACE FUNCTION public.on_job_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      bigint := coalesce(NEW.commission_paisa, 0);
  v_r      bigint;
  v_before bigint;
  v_after  bigint;
BEGIN
  IF NEW.status <> 'done' OR OLD.status IS NOT DISTINCT FROM 'done' OR v_c <= 0 OR NEW.pro_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_r := (v_c * public.setting('reserve_bps')) / 10000;
  v_before := public.pro_owed(NEW.pro_id);
  PERFORM public.post_txn('commission:' || NEW.id, 'commission', NEW.id, NEW.pro_id, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', NEW.pro_id, 'amount', v_c),
    jsonb_build_object('account', 'commission', 'amount', -(v_c - v_r)),
    jsonb_build_object('account', 'reserve', 'amount', -v_r)
  ));
  v_after := public.pro_owed(NEW.pro_id);
  -- Told once, the moment he crosses the line, not on every job after.
  IF v_before <= public.setting('credit_limit_paisa') AND v_after > public.setting('credit_limit_paisa') THEN
    PERFORM public.tell(NEW.pro_id, 'over_limit', NEW.id, '/pro/money',
      public.job_vars(NEW) || jsonb_build_object('owed', public.rs(v_after)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_done_commission ON public.jobs;
CREATE TRIGGER job_done_commission AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_done();


-- --- Finishing, now with parts ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.finish_work(uuid, jsonb);

/**
 * Done: a photo of the finished work, and what of the price was parts —
 * with the shop's receipt if anything. Commission is on the rest.
 */
CREATE OR REPLACE FUNCTION public.finish_work(p_job uuid, p_photos jsonb, p_parts_paisa bigint DEFAULT 0, p_receipt text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_problem text;
  v_parts   bigint := coalesce(p_parts_paisa, 0);
  v_comm    bigint;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'working' THEN
    RETURN public.refuse('Start the job first.', 'stage');
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_changes WHERE job_id = p_job AND status = 'pending') THEN
    RETURN public.refuse('The customer has not answered the new price yet.', 'stage');
  END IF;
  IF v_parts < 0 OR v_parts % 100 <> 0 THEN
    RETURN public.refuse('Write what the parts cost in whole rupees.', 'parts');
  END IF;
  IF v_parts >= v_job.agreed_paisa THEN
    RETURN public.refuse('Parts cannot be the whole price. Some of it is your work.', 'parts');
  END IF;
  IF v_parts > 0 THEN
    v_problem := public.own_uploads(jsonb_build_array(p_receipt), 1);
    IF v_problem IS NOT NULL THEN
      RETURN public.refuse('Take a photo of the shop receipt for the parts.', 'receipt');
    END IF;
  ELSIF p_receipt IS NOT NULL THEN
    RETURN public.refuse('Write what the parts cost, or leave out the receipt.', 'parts');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;
  IF p_receipt IS NOT NULL AND p_photos ? p_receipt THEN
    RETURN public.refuse('Use a separate photo for the receipt.', 'receipt');
  END IF;

  v_comm := public.commission_on(v_job.agreed_paisa - v_parts);
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'after', x FROM jsonb_array_elements_text(p_photos) AS x;
  IF p_receipt IS NOT NULL THEN
    INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'receipt', p_receipt);
  END IF;
  UPDATE public.jobs
  SET status = 'done', finished_at = now(), collect_paisa = agreed_paisa,
      parts_paisa = v_parts, commission_paisa = v_comm, updated_at = now()
  WHERE id = p_job;
  RETURN jsonb_build_object('ok', true, 'collect_paisa', v_job.agreed_paisa, 'parts_paisa', v_parts,
                            'commission_paisa', v_comm, 'keeps_paisa', v_job.agreed_paisa - v_comm);
END;
$$;


-- --- The credit limit, on offers ------------------------------------------------------------

/** The same offer as before, refused while he owes more than the credit limit. */
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
  v_owed   bigint;
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

/** The feed, now also saying what he owes and whether that stops him offering. */
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


-- --- Ratings --------------------------------------------------------------------------------

-- One each way per job. Stars only — and words if they want — never a
-- number anybody made up.
CREATE TABLE IF NOT EXISTS public.ratings (
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  side       text NOT NULL CHECK (side IN ('customer', 'pro')),
  from_id    uuid,
  to_id      uuid,
  stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  words      text CHECK (words IS NULL OR length(words) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, side)
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ratings_to ON public.ratings (to_id, side);

/**
 * A rating is seen once both have rated, or two days after the job — so
 * neither can wait to see the other's and answer it.
 */
CREATE OR REPLACE FUNCTION public.rating_revealed(p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT count(*) FROM public.ratings r WHERE r.job_id = p_job) = 2
      OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job AND j.finished_at < now() - interval '48 hours');
$$;

/** A technician's stars from customers, as anyone may see them: NULL — "New" — until there are enough. */
CREATE OR REPLACE FUNCTION public.pro_rating(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'count', count(*),
    'avg', CASE WHEN count(*) >= public.setting('rating_min_count') THEN round(avg(x.stars)::numeric, 1) END,
    'jobs_done', (SELECT count(*) FROM public.jobs d WHERE d.pro_id = p_pro AND d.status = 'done')
  )
  FROM public.ratings x
  WHERE x.to_id = p_pro AND x.side = 'customer' AND public.rating_revealed(x.job_id);
$$;

/** Either side rates the other, once, within `rating_days` of the end. */
CREATE OR REPLACE FUNCTION public.rate_job(p_job uuid, p_stars integer, p_words text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_side  text;
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  v_side := CASE WHEN v_job.customer_id = auth.uid() THEN 'customer'
                 WHEN v_job.pro_id = auth.uid() THEN 'pro' END;
  IF v_job.id IS NULL OR v_side IS NULL OR v_job.status NOT IN ('done', 'stopped') THEN
    RETURN public.refuse('There is no finished job of yours here.');
  END IF;
  IF v_job.finished_at < now() - make_interval(days => public.setting('rating_days')::integer) THEN
    RETURN public.refuse('It is too long ago to rate this job.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ratings WHERE job_id = p_job AND side = v_side) THEN
    RETURN public.refuse('You have already rated this job.');
  END IF;
  IF p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 5 THEN
    RETURN public.refuse('Choose from one to five stars.', 'stars');
  END IF;
  IF length(coalesce(v_words, '')) > 300 OR public.looks_like_cnic(v_words)
     OR coalesce(v_words, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Keep it short, and no phone or CNIC numbers.', 'words');
  END IF;
  INSERT INTO public.ratings (job_id, side, from_id, to_id, stars, words)
  VALUES (p_job, v_side, auth.uid(), CASE WHEN v_side = 'customer' THEN v_job.pro_id ELSE v_job.customer_id END, p_stars, v_words);
  PERFORM public.log_job(p_job, 'rated', jsonb_build_object('stars', p_stars));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The live offers, now with each technician's stars (or "New") and jobs done. */
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


-- --- Problems, guarantee claims and the emergency button ----------------------------------

CREATE TABLE IF NOT EXISTS public.problems (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  from_id        uuid,
  side           text NOT NULL CHECK (side IN ('customer', 'pro')),
  kind           text NOT NULL CHECK (kind IN ('problem', 'guarantee', 'emergency')),
  body           text CHECK (body IS NULL OR length(body) <= 500),
  lat            double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng            double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  mistake        boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  office_note    text CHECK (office_note IS NULL OR length(office_note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz,
  closed_by_name text
);
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS problems_open ON public.problems (status, created_at DESC);
CREATE INDEX IF NOT EXISTS problems_job ON public.problems (job_id);

/** "The customer, Ayesha" / "The technician, Bilal": who pressed it, first name only. */
CREATE OR REPLACE FUNCTION public.who_said(p_job public.jobs, p_side text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_side = 'customer'
              THEN 'The customer, ' || coalesce((SELECT first_name FROM public.profiles WHERE id = p_job.customer_id), 'unnamed')
              ELSE 'The technician, ' || coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = p_job.pro_id), 'unnamed') END;
$$;

/**
 * Either side tells the office something is wrong, while the job is on or
 * for a day after; or the customer claims the guarantee on a finished job
 * within `guarantee_days`. One open at a time per person, job and kind.
 */
CREATE OR REPLACE FUNCTION public.report(p_job uuid, p_kind text, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_side text;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job FOR UPDATE;
  v_side := CASE WHEN v_job.customer_id = auth.uid() THEN 'customer'
                 WHEN v_job.pro_id = auth.uid() THEN 'pro' END;
  IF v_job.id IS NULL OR v_side IS NULL OR v_job.status NOT IN ('assigned', 'done', 'stopped') THEN
    RETURN public.refuse('There is no job of yours here to report.');
  END IF;
  IF p_kind = 'problem' THEN
    IF v_job.status <> 'assigned' AND v_job.finished_at < now() - interval '24 hours' THEN
      RETURN public.refuse('It has been more than a day. Please call the Pechkas office.');
    END IF;
  ELSIF p_kind = 'guarantee' THEN
    IF v_side <> 'customer' OR v_job.status <> 'done' THEN
      RETURN public.refuse('Only a finished job has a guarantee.');
    END IF;
    IF v_job.finished_at < now() - make_interval(days => public.setting('guarantee_days')::integer) THEN
      RETURN public.refuse('The guarantee lasts ' || public.setting('guarantee_days') || ' days, and this job is older. Please call the Pechkas office.');
    END IF;
  ELSE
    RETURN public.refuse('Unknown kind of report.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.problems WHERE job_id = p_job AND from_id = auth.uid() AND kind = p_kind AND status = 'open') THEN
    RETURN public.refuse('You have already told us. The office will call you.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 THEN
    RETURN public.refuse('Tell us what is wrong, in a few words.', 'problem');
  END IF;
  IF length(v_text) > 500 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Please keep it shorter, and no CNIC numbers.', 'problem');
  END IF;

  INSERT INTO public.problems (job_id, from_id, side, kind, body) VALUES (p_job, auth.uid(), v_side, p_kind, v_text);
  PERFORM public.log_job(p_job, p_kind, jsonb_build_object('text', v_text));
  -- The customer's card remembers she has told us.
  IF p_kind = 'problem' AND v_side = 'customer' THEN
    UPDATE public.jobs SET problem_text = v_text, problem_at = now() WHERE id = p_job AND problem_at IS NULL;
  END IF;
  PERFORM public.tell_office(
    CASE WHEN p_kind = 'guarantee' THEN 'guarantee' WHEN v_side = 'pro' THEN 'pro_problem' ELSE 'problem' END,
    p_job, public.job_vars(v_job) || jsonb_build_object(
      'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id), 'The technician')));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Phase 4's "something is wrong" button, now one kind of report. */
CREATE OR REPLACE FUNCTION public.report_problem(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.report(p_job, 'problem', p_text);
$$;

/**
 * The emergency button, on a job that is on (or ended within two hours).
 * Recorded and the owner's phone told AT ONCE, before anything else; where
 * the phone is follows a moment later, if it can be found. A second press
 * within a minute is the same emergency, not a second alarm.
 */
CREATE OR REPLACE FUNCTION public.emergency(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_side text;
  v_id   uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  v_side := CASE WHEN v_job.customer_id = auth.uid() THEN 'customer'
                 WHEN v_job.pro_id = auth.uid() THEN 'pro' END;
  IF v_job.id IS NULL OR v_side IS NULL
     OR NOT (v_job.status = 'assigned' OR (v_job.status IN ('done', 'stopped') AND v_job.finished_at > now() - interval '2 hours')) THEN
    RETURN public.refuse('Call the numbers on this screen. This job is not on any more, so Pechkas was not alerted.');
  END IF;
  SELECT id INTO v_id FROM public.problems
  WHERE job_id = p_job AND from_id = auth.uid() AND kind = 'emergency' AND created_at > now() - interval '1 minute';
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'again', true);
  END IF;
  INSERT INTO public.problems (job_id, from_id, side, kind, body)
  VALUES (p_job, auth.uid(), v_side, 'emergency', 'Emergency button pressed')
  RETURNING id INTO v_id;
  PERFORM public.log_job(p_job, 'emergency');
  PERFORM public.tell_office('emergency', p_job, public.job_vars(v_job) || jsonb_build_object('who', public.who_said(v_job, v_side)));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

/** Where the phone was when the emergency button was pressed. Only the presser, only for ten minutes. */
CREATE OR REPLACE FUNCTION public.emergency_where(p_id uuid, p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RETURN public.refuse('That is not a place.');
  END IF;
  UPDATE public.problems SET lat = p_lat, lng = p_lng
  WHERE id = p_id AND from_id = auth.uid() AND kind = 'emergency' AND created_at > now() - interval '10 minutes';
  IF NOT FOUND THEN
    RETURN public.refuse('That emergency is not yours, or is too old.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** "I pressed it by mistake." The office is told that too, so nobody rushes for nothing. */
CREATE OR REPLACE FUNCTION public.emergency_mistake(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p   public.problems%ROWTYPE;
  v_job public.jobs%ROWTYPE;
BEGIN
  UPDATE public.problems SET mistake = true
  WHERE id = p_id AND from_id = auth.uid() AND kind = 'emergency' AND NOT mistake
  RETURNING * INTO v_p;
  IF v_p.id IS NULL THEN
    RETURN public.refuse('That emergency is not yours.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_p.job_id;
  PERFORM public.log_job(v_p.job_id, 'emergency_mistake');
  PERFORM public.tell_office('emergency_mistake', v_p.job_id, public.job_vars(v_job) || jsonb_build_object('who', public.who_said(v_job, v_p.side)));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- What each side sees, with the new parts ----------------------------------------------

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
      'status', j.status, 'stage', j.stage, 'cancelled_by', j.cancelled_by, 'cancel_reason', j.cancel_reason,
      'created_at', j.created_at,
      'live_offers', (SELECT count(*) FROM public.offers o JOIN public.pros r ON r.id = o.pro_id
                      WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now() AND r.status = 'approved'),
      'agreed_paisa', j.agreed_paisa,
      'start_code', CASE WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived') THEN j.start_code END,
      'code_locked', j.code_locked_at IS NOT NULL,
      'pro', CASE
               WHEN j.status = 'assigned' THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', u.phone, 'years', r.years)
                 FROM public.pros r JOIN auth.users u ON u.id = r.id WHERE r.id = j.pro_id)
               WHEN j.status IN ('done', 'stopped') THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'years', r.years)
                 FROM public.pros r WHERE r.id = j.pro_id)
             END,
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

/** What he finished in the last day, with what to collect, the parts, and whether he has rated the customer. */
CREATE OR REPLACE FUNCTION public.pro_finished()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
      'status', j.status, 'collect_paisa', j.collect_paisa, 'finished_at', j.finished_at,
      'parts_paisa', j.parts_paisa, 'commission_paisa', j.commission_paisa,
      'customer_first_name', p.first_name,
      'my_rating', (SELECT x.stars FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'pro'),
      'can_rate', NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'pro')
    ) ORDER BY j.finished_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE j.pro_id = auth.uid() AND j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '24 hours';
$$;

/**
 * The technician's money: what he owes now, whether that stops him
 * offering, how to pay, this month's work, his stars, and every line of his
 * account. Every figure is a sum of real rows.
 */
CREATE OR REPLACE FUNCTION public.pro_money()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_owed  bigint;
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'why', 'Only a technician has an account with Pechkas.');
  END IF;
  v_owed := public.pro_owed(v_me);
  RETURN jsonb_build_object(
    'ok', true,
    'owed_paisa', v_owed,
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'blocked', v_owed > public.setting('credit_limit_paisa'),
    'commission_bps', public.setting('commission_bps'),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'month', (SELECT jsonb_build_object(
                'jobs', count(*),
                'collected_paisa', coalesce(sum(j.collect_paisa), 0),
                'parts_paisa', coalesce(sum(j.parts_paisa), 0),
                'commission_paisa', coalesce(sum(j.commission_paisa), 0))
              FROM public.jobs j
              WHERE j.pro_id = v_me AND j.status = 'done' AND j.finished_at >= v_month),
    'rating', public.pro_rating(v_me),
    'comments', coalesce((
      SELECT jsonb_agg(c ORDER BY c ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at,
                                  'ref', (SELECT ref FROM public.jobs WHERE id = x.job_id)) AS c
        FROM public.ratings x
        WHERE x.to_id = v_me AND x.side = 'customer' AND public.rating_revealed(x.job_id)
        ORDER BY x.created_at DESC LIMIT 5) s), '[]'::jsonb),
    'lines', coalesce((
      SELECT jsonb_agg(l ORDER BY l ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('kind', t.kind, 'ref', t.job_ref, 'amount_paisa', e.amount_paisa,
                                  'method', t.method, 'reference', t.reference, 'at', t.created_at) AS l
        FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id
        WHERE e.account = 'pro_owes' AND e.pro_id = v_me
        ORDER BY t.created_at DESC LIMIT 30) s), '[]'::jsonb)
  );
END;
$$;


-- --- Where technicians pay -------------------------------------------------------------

-- What the office types in the admin panel ("JazzCash 03xx…, name"). Empty
-- means the app says "ask the office" rather than inventing an account.
CREATE TABLE IF NOT EXISTS public.office_info (
  key             text PRIMARY KEY CHECK (key IN ('pay_to')),
  value           text NOT NULL CHECK (length(value) BETWEEN 3 AND 300),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by_name text
);
ALTER TABLE public.office_info ENABLE ROW LEVEL SECURITY;


-- --- The office's money ------------------------------------------------------------------

/** Every technician with an account: what he owes, and whether that stops him. Plus the totals. */
CREATE OR REPLACE FUNCTION public.admin_money()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'totals', (SELECT jsonb_build_object(
                 'owed_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'pro_owes'), 0),
                 'commission_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'commission'), 0),
                 'reserve_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'reserve'), 0),
                 'received_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'received'), 0))
               FROM public.ledger_entries e),
    'pros', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'full_name', r.full_name, 'phone', u.phone, 'status', r.status,
          'owed_paisa', public.pro_owed(r.id),
          'blocked', public.pro_owed(r.id) > public.setting('credit_limit_paisa'),
          'jobs_done', (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done'),
          'last_paid_at', (SELECT max(t.created_at) FROM public.ledger_txns t WHERE t.pro_id = r.id AND t.kind = 'settlement'),
          'rating', public.pro_rating(r.id)
        ) ORDER BY public.pro_owed(r.id) DESC, r.full_name)
      FROM public.pros r LEFT JOIN auth.users u ON u.id = r.id
      WHERE r.status IN ('approved', 'suspended') OR public.pro_owed(r.id) <> 0), '[]'::jsonb)
  ) END;
$$;

/** One technician's account, line by line, newest first. */
CREATE OR REPLACE FUNCTION public.admin_ledger(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(l ORDER BY l ->> 'at' DESC) FROM (
      SELECT jsonb_build_object(
          'txn', t.id, 'kind', t.kind, 'ref', t.job_ref, 'amount_paisa', e.amount_paisa,
          'method', t.method, 'reference', t.reference, 'memo', t.memo, 'at', t.created_at,
          'by', t.created_by_name,
          'reversed', EXISTS (SELECT 1 FROM public.ledger_txns x WHERE x.reverses = t.id)) AS l
      FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id
      WHERE e.account = 'pro_owes' AND e.pro_id = p_pro
      ORDER BY t.created_at DESC LIMIT 200) s), '[]'::jsonb) END;
$$;

/**
 * The office records money a technician paid. The form sends its own key,
 * so a double tap or a retry on bad signal records it once. More than he
 * owes is refused: that is a typing mistake far more often than a gift.
 */
CREATE OR REPLACE FUNCTION public.admin_settle(p_pro uuid, p_amount_paisa bigint, p_method text, p_reference text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref  text := nullif(btrim(coalesce(p_reference, '')), '');
  v_owed bigint;
  v_id   uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_key IS NULL OR length(p_key) < 8 OR length(p_key) > 80 THEN
    RETURN public.refuse('Refresh the page and try again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro) THEN
    RETURN public.refuse('Choose a technician.', 'pro');
  END IF;
  -- Serialise payments for one technician, so two at once cannot both pass the check below.
  PERFORM pg_advisory_xact_lock(hashtext('settle:' || p_pro::text));
  IF EXISTS (SELECT 1 FROM public.ledger_txns WHERE idempotency_key = 'settle:' || p_key) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF p_amount_paisa IS NULL OR p_amount_paisa <= 0 OR p_amount_paisa % 100 <> 0 THEN
    RETURN public.refuse('Write the amount in whole rupees.', 'amount');
  END IF;
  v_owed := public.pro_owed(p_pro);
  IF p_amount_paisa > v_owed THEN
    RETURN public.refuse('That is more than he owes (' || public.rs(greatest(v_owed, 0)) || '). Check the amount.', 'amount');
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('jazzcash', 'easypaisa', 'bank', 'cash') THEN
    RETURN public.refuse('Choose how he paid.', 'method');
  END IF;
  IF v_ref IS NULL OR length(v_ref) < 3 OR length(v_ref) > 80 THEN
    RETURN public.refuse('Write the transaction ID, or for cash who received it.', 'reference');
  END IF;

  v_id := public.post_txn('settle:' || p_key, 'settlement', NULL, p_pro, jsonb_build_array(
    jsonb_build_object('account', 'received', 'amount', p_amount_paisa),
    jsonb_build_object('account', 'pro_owes', 'pro_id', p_pro, 'amount', -p_amount_paisa)
  ), p_method, v_ref);
  PERFORM public.tell(p_pro, 'settled', NULL, '/pro/money',
    jsonb_build_object('amount', public.rs(p_amount_paisa), 'owed', public.rs(public.pro_owed(p_pro))));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

/** A mistake is undone by its opposite, with the reason. The original stays, marked. */
CREATE OR REPLACE FUNCTION public.admin_reverse(p_txn uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t      public.ledger_txns%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_lines  jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_t FROM public.ledger_txns WHERE id = p_txn;
  IF v_t.id IS NULL OR v_t.kind = 'reversal' THEN
    RETURN public.refuse('There is nothing to undo there.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ledger_txns WHERE reverses = p_txn) THEN
    RETURN public.refuse('That has already been undone.');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 300 THEN
    RETURN public.refuse('Write why, so the record makes sense later.', 'reason');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
  INTO v_lines FROM public.ledger_entries e WHERE e.txn_id = p_txn;
  PERFORM public.post_txn('reverse:' || p_txn, 'reversal', v_t.job_id, v_t.pro_id, v_lines, NULL, NULL, v_reason, p_txn);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Where technicians are told to pay. Typed by the office; shown to technicians exactly as typed. */
CREATE OR REPLACE FUNCTION public.admin_set_pay_to(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_text IS NULL THEN
    DELETE FROM public.office_info WHERE key = 'pay_to';
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF length(v_text) < 3 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Keep it short, and never a CNIC number.', 'pay_to');
  END IF;
  INSERT INTO public.office_info (key, value, updated_at, updated_by_name)
  VALUES ('pay_to', v_text, now(), (SELECT name FROM public.staff WHERE id = auth.uid()))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by_name = EXCLUDED.updated_by_name;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The queue: problems, guarantee claims and emergencies, with what the office needs to ring. */
CREATE OR REPLACE FUNCTION public.admin_problems(p_status text DEFAULT 'open')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(x ORDER BY (x ->> 'urgent')::boolean DESC, x ->> 'created_at' DESC) FROM (
      SELECT jsonb_build_object(
          'id', pr.id, 'kind', pr.kind, 'side', pr.side, 'body', pr.body, 'lat', pr.lat, 'lng', pr.lng,
          'mistake', pr.mistake, 'status', pr.status, 'office_note', pr.office_note,
          'created_at', pr.created_at, 'closed_at', pr.closed_at, 'closed_by', pr.closed_by_name,
          'urgent', pr.kind = 'emergency' AND NOT pr.mistake AND pr.status = 'open',
          'job', jsonb_build_object('id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status, 'stage', j.stage,
                                    'address', j.house || ', ' || j.street || ', ' || j.sector,
                                    'job_lat', j.lat, 'job_lng', j.lng, 'finished_at', j.finished_at,
                                    'collect_paisa', j.collect_paisa),
          'customer', jsonb_build_object('name', p.first_name, 'phone', u.phone),
          'pro', CASE WHEN j.pro_id IS NOT NULL THEN jsonb_build_object('name', r.full_name, 'phone', ru.phone) END
        ) AS x
      FROM public.problems pr
      JOIN public.jobs j ON j.id = pr.job_id
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN auth.users u ON u.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      LEFT JOIN auth.users ru ON ru.id = j.pro_id
      WHERE pr.status = coalesce(p_status, 'open')
      ORDER BY pr.created_at DESC LIMIT 200) s), '[]'::jsonb) END;
$$;

/** Closed with a note of what was done. Nobody's problem is closed in silence. */
CREATE OR REPLACE FUNCTION public.admin_close_problem(p_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_job  uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 3 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what was done about it.', 'note');
  END IF;
  UPDATE public.problems
  SET status = 'closed', office_note = v_note, closed_at = now(),
      closed_by_name = (SELECT name FROM public.staff WHERE id = auth.uid())
  WHERE id = p_id AND status = 'open'
  RETURNING job_id INTO v_job;
  IF v_job IS NULL THEN
    RETURN public.refuse('That is already closed.');
  END IF;
  PERFORM public.log_job(v_job, 'problem_closed', jsonb_build_object('note', v_note));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- The job list: open problems now say why a job needs you --------------------------------

CREATE OR REPLACE FUNCTION public.admin_jobs(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, trade text, title text, description text, offered_paisa bigint,
  list_paisa bigint, when_kind text, when_part text,
  sector text, street text, house text, landmark text, lat double precision, lng double precision,
  power text, parts text, gate_note text, status text, cancelled_by text, cancel_reason text,
  created_at timestamptz, customer_name text, customer_phone text, media jsonb,
  live_offers integer, needs_you boolean, why text, agreed_paisa bigint, assigned_by text,
  pro_name text, pro_phone text, stage text, collect_paisa bigint, code_locked boolean,
  problem_text text, finished_at timestamptz
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
         w.why IS NOT NULL,
         w.why,
         j.agreed_paisa, j.assigned_by,
         r.full_name, ru.phone, j.stage, j.collect_paisa, j.code_locked_at IS NOT NULL,
         j.problem_text, j.finished_at
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

/** One job's whole record for the office, now with ratings, problems and its money. */
CREATE OR REPLACE FUNCTION public.admin_job_detail(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor, 'what', e.what, 'detail', e.detail) ORDER BY e.id)
                        FROM public.job_events e WHERE e.job_id = p_job), '[]'::jsonb),
    'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('at', m.created_at,
                                   'from', CASE WHEN m.sender_id = j.customer_id THEN 'customer' WHEN m.sender_id = j.pro_id THEN 'pro' ELSE 'gone' END,
                                   'body', m.body) ORDER BY m.id)
                          FROM public.job_messages m WHERE m.job_id = p_job), '[]'::jsonb),
    'photos', public.photos_of(p_job),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('from_paisa', c.from_paisa, 'price_paisa', c.price_paisa, 'reason', c.reason,
                                  'photo', c.photo_path, 'status', c.status, 'at', c.created_at) ORDER BY c.created_at)
                         FROM public.job_changes c WHERE c.job_id = p_job), '[]'::jsonb),
    'money', jsonb_build_object('collect_paisa', j.collect_paisa, 'parts_paisa', j.parts_paisa, 'commission_paisa', j.commission_paisa),
    -- The office sees both ratings at once: hiding them is to stop the two
    -- answering each other, not to keep anything from Pechkas.
    'ratings', coalesce((SELECT jsonb_agg(jsonb_build_object('side', x.side, 'stars', x.stars, 'words', x.words, 'at', x.created_at))
                         FROM public.ratings x WHERE x.job_id = p_job), '[]'::jsonb),
    'problems', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'side', x.side, 'body', x.body, 'status', x.status,
                                  'office_note', x.office_note, 'mistake', x.mistake, 'at', x.created_at) ORDER BY x.created_at)
                          FROM public.problems x WHERE x.job_id = p_job), '[]'::jsonb)
  ) END
  FROM public.jobs j WHERE j.id = p_job;
$$;


-- --- The words for the new notifications -------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('settled.title',     200, 'Pechkas ko {amount} mil gaye', 'Pechkas received {amount}', 'technician'),
  ('settled.body',      201, 'Ab aap ka baqaya {owed} hai. Shukriya.', 'You now owe {owed}. Thank you.', 'technician'),
  ('over_limit.title',  210, 'Pechkas ka baqaya: {owed}', 'You owe Pechkas {owed}', 'technician'),
  ('over_limit.body',   211, 'Nayi offer bhejne se pehle baqaya ada karein. Tareeqa app mein hai.', 'Pay it before you can send new offers. How to pay is in the app.', 'technician'),
  ('emergency.title',   220, NULL, 'EMERGENCY on {ref}', 'office'),
  ('emergency.body',    221, NULL, '{who} pressed the emergency button. Open the admin panel now for the address and where they are.', 'office'),
  ('emergency_mistake.title', 230, NULL, 'False alarm on {ref}', 'office'),
  ('emergency_mistake.body',  231, NULL, '{who} says the emergency button was pressed by mistake. Ring to make sure.', 'office'),
  ('guarantee.title',   240, NULL, 'Guarantee claim on {ref}', 'office'),
  ('guarantee.body',    241, NULL, '{customer} says the work has failed. Ring them, then arrange the repair.', 'office'),
  ('pro_problem.title', 250, NULL, 'Problem reported by {pro} on {ref}', 'office'),
  ('pro_problem.body',  251, NULL, 'The technician says something is wrong. Open the admin panel and ring him.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;


-- --- Who may call what ------------------------------------------------------------------------
--
-- commission_on(), post_txn(), pro_owed(), rating_revealed(), pro_rating()
-- and who_said() are granted to nobody: a person sees money and stars only
-- through the functions below, which say whose.

GRANT EXECUTE ON FUNCTION
  public.finish_work(uuid, jsonb, bigint, text),
  public.rate_job(uuid, integer, text),
  public.report(uuid, text, text),
  public.emergency(uuid),
  public.emergency_where(uuid, double precision, double precision),
  public.emergency_mistake(uuid),
  public.pro_money(),
  public.admin_money(),
  public.admin_ledger(uuid),
  public.admin_settle(uuid, bigint, text, text, text),
  public.admin_reverse(uuid, text),
  public.admin_set_pay_to(text),
  public.admin_problems(text),
  public.admin_close_problem(uuid, text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261022000000_money_and_trust')
ON CONFLICT (name) DO NOTHING;

COMMIT;
