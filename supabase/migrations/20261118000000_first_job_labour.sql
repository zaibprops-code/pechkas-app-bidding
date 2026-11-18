-- =============================================================================
-- A104 (the owner, 18 November 2026): the price limit on a new technician's
-- first jobs is on his WORK, not on parts.
--
--   1. His offer on a first job may say how much of his price is parts (with a
--      shop receipt at the finish). The limit is checked on the price less
--      those parts, when he offers and again when she chooses.
--   2. A new price during a first job whose work is over the limit is NOT
--      refused. He is told before he sends it, her card says it is more than
--      Pechkas allows new technicians, and if she agrees the job goes on but
--      does not count as one of his 3 first jobs. If she declines, the visit
--      fee rule applies as on any job.
--   3. At the finish, work = the final price less the parts on the receipt.
--      Over the limit, the job is finished and paid as normal and does not
--      count as a first job ('over_limit').
--
-- The limit each first job is held to is the one in force when it was given
-- to him (trial_jobs.cap_paisa), so a later change by the office does not
-- reach back. Older copies of the app send no parts: the whole price counts,
-- as before. No money moves differently: commission is still on the price
-- less the parts on the receipt.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

-- --- Where the parts and the limit are kept ---------------------------------------------------------

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS parts_paisa bigint
  CHECK (parts_paisa IS NULL OR (parts_paisa > 0 AND parts_paisa % 100 = 0));
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS parts_paisa bigint
  CHECK (parts_paisa IS NULL OR (parts_paisa > 0 AND parts_paisa % 100 = 0));
ALTER TABLE public.job_changes ADD COLUMN IF NOT EXISTS over_first_limit boolean NOT NULL DEFAULT false;
ALTER TABLE public.trial_jobs ADD COLUMN IF NOT EXISTS cap_paisa bigint;
ALTER TABLE public.trial_jobs ADD COLUMN IF NOT EXISTS over_limit boolean NOT NULL DEFAULT false;

ALTER TABLE public.trial_jobs DROP CONSTRAINT IF EXISTS trial_jobs_why_check;
ALTER TABLE public.trial_jobs ADD CONSTRAINT trial_jobs_why_check
  CHECK (why IN ('not_done', 'answers', 'works_no', 'no_answers', 'photos', 'claim', 'no_payment',
                 'payment_case', 'same_person', 'phone_not_checked', 'repeat_customer', 'too_close',
                 'new_account', 'no_pin', 'over_limit'));

/** A first job keeps the limit in force on the day it was given to him. */
CREATE OR REPLACE FUNCTION public.trial_job_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.cap_paisa := coalesce(NEW.cap_paisa, nullif(public.setting('trial_price_cap_paisa'), 0));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trial_job_cap ON public.trial_jobs;
CREATE TRIGGER trial_job_cap BEFORE INSERT ON public.trial_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trial_job_cap();

/** She agreed to a new price over the limit: that first job will not count. Whoever approved it. */
CREATE OR REPLACE FUNCTION public.change_over_first_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' AND NEW.over_first_limit THEN
    UPDATE public.trial_jobs SET over_limit = true WHERE job_id = NEW.job_id AND pro_id = NEW.pro_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS change_over_first_limit ON public.job_changes;
CREATE TRIGGER change_over_first_limit AFTER UPDATE OF status ON public.job_changes
  FOR EACH ROW EXECUTE FUNCTION public.change_over_first_limit();


-- --- The limit's sentence --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trial_cap_why(p_pro uuid, p_trade text, p_price bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.trade_level(p_pro, p_trade) <> 'trial' THEN NULL
    WHEN public.setting('trial_price_cap_paisa') = 0 THEN 'Pechkas has not set the price limit for first jobs yet, so no first-job offers can be made.'
    WHEN p_price > public.setting('trial_price_cap_paisa') THEN 'On your first jobs your work can come to at most ' || public.rs(public.setting('trial_price_cap_paisa'))
                                                               || '. Parts with a shop receipt are not counted: say them in the parts box.'
  END;
$$;


-- --- His offer: parts may be said on a first job ----------------------------------------------------

-- The new offer takes the parts as its THIRD argument, with no default, so a call
-- without them can only reach the older five-argument make_offer, which now hands
-- over with no parts. Two functions, never ambiguous, and an older migration run a
-- second time only puts back the older one beside this.
CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
  p_parts_paisa bigint,
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
  v_gate   text;
  v_cap    text;
  v_parts  bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can make offers.');
  END IF;
  -- D36: read his position under the same lock as every payment, fee and reversal.
  PERFORM public.pay_lock(auth.uid());
  v_owed := public.pro_owed(auth.uid());
  IF v_owed > public.setting('credit_limit_paisa') THEN
    RETURN public.refuse('You owe Pechkas ' || public.rs(v_owed) || '. Pay it to make new offers.', 'owed');
  END IF;
  IF public.pay_blocked(auth.uid()) THEN
    RETURN public.refuse('Your new offers have stopped: ' || public.rs((public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint)
                         || ' you owe Pechkas is overdue. Pay it from My account and they start again.', 'overdue');
  END IF;
  -- A guarantee claim on his work that he has let run out stops new offers.
  IF public.claim_blocks(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('Your new offers have stopped until you answer the guarantee claim on your earlier job.', 'guarantee');
  END IF;

  -- A5: paused by rule after two payments not received in full. No end date: the office lifts it.
  IF public.pay_paused(auth.uid()) THEN
    RETURN public.refuse('Your new offers are paused: twice in ' || public.setting('claim_strike_days')
                         || ' days, Pechkas did not receive the full amount of a payment. Open My account to read why and to write to Pechkas.', 'pay_paused');
  END IF;
  -- Paused by the office (D11): told until when.
  IF public.pro_pause_until(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('The Pechkas office has paused your new offers until '
                         || to_char(public.pro_pause_until(auth.uid()) AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || ', '
                         || public.pk_clock(public.pro_pause_until(auth.uid())) || '.', 'paused');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  -- D37: his first jobs: one at a time, and only the kinds open to him.
  IF v_job.id IS NOT NULL AND v_job.status = 'open' THEN
    v_gate := public.pro_gate(auth.uid(), v_job.trade, v_job.job_type_id, v_job.sector, v_job.customer_id, v_job.id);
    IF v_gate = 'one_job' THEN
      RETURN public.refuse('On your first jobs you hold one job at a time. Finish the one you have first.', 'trial');
    END IF;
    IF v_gate IN ('risky', 'something_else') THEN
      RETURN public.refuse('This kind of job is not open to you yet.', 'trial');
    END IF;
  END IF;
  IF v_job.id IS NULL OR v_job.status <> 'open' OR NOT public.pro_may_see(p_job) OR v_job.customer_id = auth.uid() THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  v_max := (v_job.offered_paisa * public.setting('max_counter_bps')) / 10000;
  -- A guarantee repair is paid by Pechkas, up to what the original work was worth.
  IF v_job.paid_by_pechkas THEN
    v_max := least(v_max, v_job.pay_cap_paisa);
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 THEN
    RETURN public.refuse('Offer a price in whole rupees.', 'price');
  END IF;
  IF p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('That is below the lowest price for any job.', 'price');
  END IF;
  IF p_price_paisa > v_max THEN
    RETURN public.refuse('At most Rs ' || to_char(v_max / 100, 'FM999,999,999') || ' for this job.', 'price');
  END IF;
  -- D37, A104: the limit on his first jobs is on his WORK. Parts he says are in the price (with a
  -- shop receipt at the finish) are taken off first. Said only on a first job; anywhere else parts
  -- are said at the finish, as always. An older copy sends none: the whole price counts, as before.
  IF public.trade_level(auth.uid(), v_job.trade) = 'trial' AND coalesce(p_parts_paisa, 0) > 0 THEN
    IF p_parts_paisa % 100 <> 0 THEN
      RETURN public.refuse('Write the parts in whole rupees.', 'parts');
    END IF;
    IF p_parts_paisa >= p_price_paisa THEN
      RETURN public.refuse('Parts cannot be the whole price. Some of it is your work.', 'parts');
    END IF;
    v_parts := p_parts_paisa;
  END IF;
  v_cap := public.trial_cap_why(auth.uid(), v_job.trade, p_price_paisa - coalesce(v_parts, 0));
  IF v_cap IS NOT NULL THEN
    RETURN public.refuse(v_cap, 'price');
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
  -- 'rejected' is not a refusal any more: on an open job it means somebody else was chosen and
  -- the job came back (D11), so he may offer again. The man who left it is shut out above.
  IF v_status = 'accepted' THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  INSERT INTO public.offers AS o (job_id, pro_id, price_paisa, parts_paisa, eta_minutes, arrive_from, note, status, expires_at)
  VALUES (p_job, auth.uid(), p_price_paisa, v_parts, p_eta_minutes, p_arrive_from, v_note, 'pending',
          now() + make_interval(mins => public.setting('offer_minutes')::integer))
  ON CONFLICT (job_id, pro_id) DO UPDATE SET
    price_paisa = EXCLUDED.price_paisa,
    parts_paisa = EXCLUDED.parts_paisa,
    eta_minutes = EXCLUDED.eta_minutes,
    arrive_from = EXCLUDED.arrive_from,
    note = EXCLUDED.note,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
  p_eta_minutes integer DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_arrive_from smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.make_offer(p_job, p_price_paisa, NULL::bigint, p_eta_minutes, p_note, p_arrive_from);
$$;


-- --- Her choosing: the same limit, on the same work -------------------------------------------------

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
  v_trade    text;
  v_type     integer;
  v_sector   text;
  v_when     date;
  v_from     smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT job_id INTO v_job FROM public.offers WHERE id = p_offer;
  IF v_job IS NULL THEN
    RETURN public.refuse('That offer is no longer there.');
  END IF;

  -- The lock. Whoever gets here second waits, then sees the job taken.
  SELECT customer_id, status, trade, job_type_id, sector, when_date, when_from
  INTO v_customer, v_status, v_trade, v_type, v_sector, v_when, v_from
  FROM public.jobs WHERE id = v_job FOR UPDATE;
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
  -- D37: his trade, its level, the trial limits and the price cap, at the moment she taps.
  IF public.pro_gate(v_offer.pro_id, v_trade, v_type, v_sector, v_customer, v_job) IS NOT NULL
     OR public.trial_cap_why(v_offer.pro_id, v_trade, v_offer.price_paisa - coalesce(v_offer.parts_paisa, 0)) IS NOT NULL THEN
    RETURN public.refuse('That technician is not available for this job any more. Choose another.');
  END IF;
  -- His first risky job: somebody to check it, arranged now, or he cannot take it.
  IF public.needs_check(v_offer.pro_id, v_trade, v_type)
     AND public.arrange_check(v_job, v_offer.pro_id, public.window_start(v_when, coalesce(v_offer.arrive_from, v_from))) IS NULL THEN
    RETURN public.refuse('That technician cannot take this job right now. Choose another.');
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
      -- A104: on a first job, the parts he says are in his price (with a shop receipt).
      'parts_paisa', o.parts_paisa,
      'is_counter', o.price_paisa <> j.offered_paisa,
      'eta_minutes', o.eta_minutes,
      'arrive_from', o.arrive_from,
      'note', o.note,
      'expires_at', o.expires_at,
      'created_at', o.created_at,
      'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
      'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
      'new_on_pechkas', EXISTS (SELECT 1 FROM public.pro_trades x WHERE x.pro_id = r.id AND x.trade = j.trade AND x.status = 'trial'),
      'photo', (SELECT f.path FROM public.pro_faces f WHERE f.pro_id = r.id),
      'identity', public.identity_line(r.id),
      'checked_visit', public.needs_check(r.id, j.trade, j.job_type_id)
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

-- His own offer, with its parts, so changing it starts from what he said.
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
    -- D36: an overdue fee stops new offers on its own.
    'pay_blocked', public.pay_blocked(auth.uid()),
    'overdue_paisa', (public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint,
    -- Paused by the office (D11): until when, and the office's reason.
    'paused_until', public.pro_pause_until(auth.uid()),
    'pause_note', (SELECT l.note FROM public.pro_pause_log l WHERE l.pro_id = auth.uid() AND l.action = 'pause'
                   AND public.pro_pause_until(auth.uid()) IS NOT NULL ORDER BY l.at DESC LIMIT 1),
    -- A5: paused by rule for payments, with no end date.
    'pay_pause', public.pay_pause_view(auth.uid()),
    'guarantee_block', (SELECT jsonb_build_object('claim_id', c.id, 'ref', j.ref, 'customer', p.first_name,
                                                   'can_answer', c.status = 'waiting' OR (c.why_replacing = 'no_answer' AND c.replacement_job_id IS NULL))
                        FROM public.guarantee_claims c JOIN public.jobs j ON j.id = c.job_id JOIN public.profiles p ON p.id = c.customer_id
                        WHERE c.id = public.claim_blocks(auth.uid())),
    'open_claims', (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = auth.uid() AND c.status IN ('waiting', 'coming')),
    'jobs', CASE WHEN NOT v_online THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
          'description', j.description, 'offered_paisa', j.offered_paisa,
          'list_paisa', t.list_paisa, 'when_kind', j.when_kind, 'when_part', j.when_part,
          'when_date', j.when_date, 'when_from', j.when_from,
          'sector', j.sector, 'power', j.power, 'parts', j.parts,
          'customer_first_name', p.first_name, 'created_at', j.created_at,
          'paid_by_pechkas', j.paid_by_pechkas, 'pay_cap_paisa', j.pay_cap_paisa,
          'visit_fee_paisa', public.visit_fee(j.id),
          'asked_you', coalesce(j.preferred_pro_id = auth.uid() AND j.preferred_until > now(), false),
          'asked_until', CASE WHEN j.preferred_pro_id = auth.uid() AND j.preferred_until > now() THEN j.preferred_until END,
          'repeat', public.repeat_pair(j.customer_id, auth.uid(), j.id),
          -- A99: the launch rate if she chose him now, and until when.
          'launch', public.launch_applies(auth.uid(), j.trade, now()),
          'launch_until', CASE WHEN public.launch_applies(auth.uid(), j.trade, now()) THEN public.launch_until(auth.uid(), j.trade) END,
          'commission_bps', public.commission_rate(j.customer_id, auth.uid(), j.id),
          'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                             FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
          'my_offer', (SELECT jsonb_build_object('price_paisa', o.price_paisa, 'parts_paisa', o.parts_paisa, 'eta_minutes', o.eta_minutes, 'arrive_from', o.arrive_from,
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


-- --- A new price during a first job: allowed over the limit, but then it does not count -------------

-- The same shape as the offer: parts third and required in the new one; the older
-- four-argument call hands over with no parts.
CREATE OR REPLACE FUNCTION public.ask_change(p_job uuid, p_price_paisa bigint, p_parts_paisa bigint, p_reason text, p_photo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_problem text;
  v_id      uuid;
  v_parts   bigint;
  v_cap     bigint;
  v_over    boolean := false;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  -- The start code is the customer's: entered, it proves he is at her door.
  -- A visit fee can only follow a new price, so it can only follow a real visit.
  IF v_job.stage IS DISTINCT FROM 'working' THEN
    RETURN public.refuse(CASE WHEN v_job.stage = 'arrived'
                              THEN 'Enter the customer''s start code first. A new price can be asked once she has let you in.'
                              ELSE 'A new price can only be asked at the house.' END, 'stage');
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_changes WHERE job_id = p_job AND status = 'pending') THEN
    RETURN public.refuse('The customer has not answered the last one yet.', 'stage');
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 OR p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('Write the new price in whole rupees.', 'price');
  END IF;
  IF p_price_paisa = v_job.agreed_paisa THEN
    RETURN public.refuse('That is the price already agreed.', 'price');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RETURN public.refuse('Say why: what did you find?', 'reason');
  END IF;
  IF length(v_reason) > 300 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Keep the reason short.', 'reason');
  END IF;
  -- A104: on a first job the limit is on his work. A new price over it is NOT refused: she may
  -- agree, knowing it is more than Pechkas allows new technicians, and the job then goes ahead
  -- but does not count as one of his first jobs (trial_review, 'over_limit').
  SELECT coalesce(x.cap_paisa, nullif(public.setting('trial_price_cap_paisa'), 0)) INTO v_cap
  FROM public.trial_jobs x WHERE x.job_id = p_job AND x.pro_id = auth.uid() AND x.status = 'open';
  IF FOUND THEN
    IF coalesce(p_parts_paisa, 0) > 0 THEN
      IF p_parts_paisa % 100 <> 0 THEN
        RETURN public.refuse('Write the parts in whole rupees.', 'parts');
      END IF;
      IF p_parts_paisa >= p_price_paisa THEN
        RETURN public.refuse('Parts cannot be the whole price. Some of it is your work.', 'parts');
      END IF;
      v_parts := p_parts_paisa;
    END IF;
    v_over := v_cap IS NOT NULL AND p_price_paisa - coalesce(v_parts, 0) > v_cap;
  END IF;
  v_problem := public.own_uploads(jsonb_build_array(p_photo), 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;

  INSERT INTO public.job_changes (job_id, pro_id, from_paisa, price_paisa, parts_paisa, over_first_limit, reason, photo_path)
  VALUES (p_job, auth.uid(), v_job.agreed_paisa, p_price_paisa, v_parts, v_over, v_reason, p_photo)
  RETURNING id INTO v_id;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path) VALUES (p_job, auth.uid(), 'change', p_photo);
  PERFORM public.log_job(p_job, 'change_asked', jsonb_build_object('from_paisa', v_job.agreed_paisa, 'price_paisa', p_price_paisa, 'reason', v_reason,
                                                                    'parts_paisa', v_parts, 'over_first_limit', v_over));
  IF v_job.paid_by_pechkas THEN
    -- Pechkas pays for a guarantee repair, so the office answers, never the customer.
    PERFORM public.tell_office('change_office', p_job, public.job_vars(v_job));
    PERFORM public.tell(v_job.customer_id, 'change_to_office', p_job, '/jobs', public.job_vars(v_job));
  ELSE
    PERFORM public.tell(v_job.customer_id, 'change', p_job, '/jobs',
      public.job_vars(v_job) || jsonb_build_object(
        'pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_job.pro_id),
        'price', public.rs(p_price_paisa), 'was', public.rs(v_job.agreed_paisa)));
  END IF;
  RETURN jsonb_build_object('ok', true, 'over_first_limit', v_over);
END;
$$;

CREATE OR REPLACE FUNCTION public.ask_change(p_job uuid, p_price_paisa bigint, p_reason text, p_photo text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.ask_change(p_job, p_price_paisa, NULL::bigint, p_reason, p_photo);
$$;

CREATE OR REPLACE FUNCTION public.pending_change(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', c.id, 'from_paisa', c.from_paisa, 'price_paisa', c.price_paisa,
                            'reason', c.reason, 'photo', c.photo_path, 'created_at', c.created_at,
                            'pro_says_no_at', c.pro_says_no_at, 'office_decides', j.paid_by_pechkas,
                            -- A104: what of it is parts, and whether it is more than Pechkas allows a new technician.
                            'parts_paisa', c.parts_paisa, 'over_first_limit', c.over_first_limit)
  FROM public.job_changes c JOIN public.jobs j ON j.id = c.job_id
  WHERE c.job_id = p_job AND c.status = 'pending';
$$;


-- --- Counting a first job: work over the limit does not count --------------------------------------

CREATE OR REPLACE FUNCTION public.trial_review(p_job uuid, p_pro uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.trial_jobs;
  v_job public.jobs;
  v_txn uuid;
  v_why text;
BEGIN
  SELECT * INTO v_row FROM public.trial_jobs WHERE job_id = p_job AND pro_id = p_pro FOR UPDATE;
  IF v_row.status IS NULL OR v_row.status NOT IN ('waiting', 'good') THEN
    RETURN v_row.status;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;

  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND public.claim_covered(c.status)) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'claim');
    IF v_row.status = 'good' THEN
      UPDATE public.pro_trades SET status = 'trial', approved_at = NULL, approved_by = NULL,
             note = 'Back on trial: a guarantee claim on a first job.', since = now()
      WHERE pro_id = p_pro AND trade = v_row.trade AND status = 'approved' AND approved_by = 'trial'
        AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = v_row.trade AND x.status = 'good')
            < public.setting('trial_jobs');
    END IF;
    RETURN 'not_counted';
  END IF;
  IF v_row.status = 'good' THEN
    RETURN 'good';
  END IF;

  -- A104: a first job whose WORK went over the limit does not count: a new price over it that she
  -- agreed to, or work that came to more at the finish (the price less the parts on the receipt).
  IF v_row.over_limit
     OR (coalesce(v_row.cap_paisa, nullif(public.setting('trial_price_cap_paisa'), 0)) IS NOT NULL
         AND v_job.agreed_paisa IS NOT NULL
         AND v_job.agreed_paisa - coalesce(v_job.parts_paisa, 0) > coalesce(v_row.cap_paisa, public.setting('trial_price_cap_paisa'))) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'over_limit');
    RETURN 'not_counted';
  END IF;

  IF v_job.paid_by_pechkas THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  IF v_row.answered_at IS NULL THEN
    IF v_job.finished_at < now() - interval '2 days' THEN
      PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_answers');
      RETURN 'not_counted';
    END IF;
    RETURN 'waiting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'before')
     OR NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'after') THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'photos');
    RETURN 'not_counted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cases x WHERE x.job_id = p_job) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'payment_case');
    RETURN 'not_counted';
  END IF;
  -- A claim still being decided: wait for it.
  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND c.status <> 'not_covered') THEN
    RETURN 'waiting';
  END IF;
  -- Real payment: the commission on it is posted, not reversed, and paid.
  SELECT t.id INTO v_txn FROM public.ledger_txns t WHERE t.idempotency_key = 'commission:' || p_job;
  IF v_txn IS NULL OR EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = v_txn) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  -- A5: paid, and by money that is final. His own "I have paid" is final after claim_final_days.
  IF NOT public.fee_paid_final(p_pro, v_txn) THEN
    RETURN 'waiting';
  END IF;
  -- The distance between homes is the owner's number: until it is set, nothing counts.
  IF public.setting('trial_customer_gap_m') = 0 THEN
    RETURN 'waiting';
  END IF;
  v_why := public.trial_customer_why(p_job, p_pro);
  IF v_why IS NOT NULL THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', v_why);
    RETURN 'not_counted';
  END IF;
  PERFORM public.trial_set(p_job, p_pro, 'good', NULL);
  PERFORM public.promote_trade(p_pro, v_row.trade);
  RETURN 'good';
END;
$$;


-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.trial_job_cap(), public.change_over_first_limit(),
  public.make_offer(uuid, bigint, bigint, integer, text, smallint),
  public.ask_change(uuid, bigint, bigint, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.make_offer(uuid, bigint, bigint, integer, text, smallint),
  public.ask_change(uuid, bigint, bigint, text, text)
TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261118000000_first_job_labour')
ON CONFLICT (name) DO NOTHING;

COMMIT;
