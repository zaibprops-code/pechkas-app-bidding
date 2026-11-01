-- =============================================================================
--  The guarantee, finished: the office can raise what Pechkas pays, and a
--  charge is only final after the chance to appeal it
-- =============================================================================
--
--  The owner's decisions (November 2026), after the guarantee was built.
--
--  RAISE THE LIMIT
--    · A replacement repair is first offered at the original job's labour,
--      and no offer may go above that. If nobody takes it, the office can
--      raise the limit from Guarantee and disputes (admin_raise_cap). The
--      job is announced again at the new figure. Whatever is above the
--      original labour is Pechkas' own cost, from the reserve: the original
--      technician is never charged more than his original labour, and the
--      customer never pays anything.
--    · A replacement with no offers is now the office's to know about:
--      nudge_no_offers() tells the office's phones instead of asking the
--      customer to raise a price she is not paying. raise_price() refuses
--      a Pechkas-paid job outright, and my_jobs() says can_raise = false.
--    · A replacement nobody took by 8pm closes as before, but she is told
--      to choose another day on her claim, never "Book again" — that would
--      post a job she would pay for.
--
--  A CHARGE IS FINAL ONLY AFTER THE CHANCE TO APPEAL
--    · When a replacement is finished and the original technician is the
--      one responsible (he ignored the claim, missed the visit he accepted,
--      or refused it and the office ruled against him), the charge is
--      RECORDED, not posted: charge_paisa and charge_due, appeal_days (7)
--      from now. He is told the amount and the date.
--    · He may appeal until charge_due. charge_clock() posts the charge to
--      the ledger at charge_due if he has not appealed. If he has, nothing
--      is posted until the office decides: upheld posts it then; cancelled
--      posts nothing at all.
--    · Posted, it is added to what he owes like any other line. Not enough
--      in his balance means more debt; past the credit limit his new
--      offers stop (make_offer already says so) until he pays through Pay
--      Pechkas. He is told once, when he crosses the line.
--    · A charge already posted by the previous migration keeps its old
--      appeal: within appeal_days of being posted, cancelled by reversal.
--
--  Every financial or legal promise here is, in the owner's words,
--  "subject to lawyer review"; the terms carry the markers.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;


-- --- What the claim now remembers -----------------------------------------------------------

ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS charge_due         timestamptz;
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS first_cap_paisa    bigint;
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS cap_raised_at      timestamptz;
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS cap_raised_by_name text;
ALTER TABLE public.guarantee_claims ADD COLUMN IF NOT EXISTS cap_note           text;
ALTER TABLE public.guarantee_claims DROP CONSTRAINT IF EXISTS guarantee_claims_cap_note_check;
ALTER TABLE public.guarantee_claims ADD CONSTRAINT guarantee_claims_cap_note_check
  CHECK (cap_note IS NULL OR length(cap_note) <= 300);

-- Charges waiting for their date, for the clock.
CREATE INDEX IF NOT EXISTS guarantee_claims_charge_due ON public.guarantee_claims (charge_due)
  WHERE charge_txn IS NULL AND charge_paisa > 0;

-- The first limit of a replacement already booked, so the office's page can
-- say how far it has been raised.
UPDATE public.guarantee_claims c SET first_cap_paisa = j.pay_cap_paisa
FROM public.jobs j
WHERE j.id = c.replacement_job_id AND c.first_cap_paisa IS NULL;


-- --- A replacement nobody offers on -------------------------------------------------------

/** Raise her price — but never on a repair Pechkas is paying for: that limit is the office's. */
CREATE OR REPLACE FUNCTION public.raise_price(p_job uuid, p_add_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'open' THEN
    RETURN public.refuse('This job is no longer waiting for offers.', 'raise');
  END IF;
  IF v_job.paid_by_pechkas THEN
    RETURN public.refuse('Pechkas is paying for this repair, so there is no price for you to raise. The office has been told nobody has offered yet.', 'raise');
  END IF;
  IF p_add_paisa IS NULL OR p_add_paisa NOT IN (20000, 50000, 100000) THEN
    RETURN public.refuse('Raise it by Rs 200, Rs 500 or Rs 1,000.', 'raise');
  END IF;
  IF EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = p_job AND o.status = 'pending' AND o.expires_at > now()) THEN
    RETURN public.refuse('A technician has already offered. Choose an offer, or wait for it to run out.', 'raise');
  END IF;
  IF v_job.raises >= public.setting('max_raises') THEN
    RETURN public.refuse('You have raised the price on this job ' || public.setting('max_raises') || ' times already. Choose another day, or keep waiting.', 'raise');
  END IF;
  IF v_job.offered_paisa + p_add_paisa > 50000000 THEN
    RETURN public.refuse('For work this size, call Pechkas first.', 'raise');
  END IF;

  UPDATE public.jobs
  SET offered_paisa = offered_paisa + p_add_paisa, raises = raises + 1,
      announced_at = now(), nudged_at = NULL, needs_you_told_at = NULL
  WHERE id = p_job
  RETURNING * INTO v_job;
  PERFORM public.log_job(p_job, 'price_raised', jsonb_build_object('to', v_job.offered_paisa, 'by', p_add_paisa));
  PERFORM public.announce_again(v_job);
  RETURN jsonb_build_object('ok', true, 'offered_paisa', v_job.offered_paisa,
                            'raises_left', greatest(public.setting('max_raises') - v_job.raises, 0));
END;
$$;

/**
 * Nobody has offered since the job was announced. Her own job: she is told
 * and may raise her price or move the day. A repair Pechkas pays for: the
 * office is told instead, because only the office can raise that limit.
 */
CREATE OR REPLACE FUNCTION public.nudge_no_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_n   integer := 0;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j SET nudged_at = now()
    WHERE j.status = 'open'
      AND j.nudged_at IS NULL
      AND (j.preferred_until IS NULL OR j.preferred_until <= now())
      AND j.announced_at <= now() - make_interval(mins => (CASE WHEN j.when_kind = 'now' OR j.when_date <= (now() AT TIME ZONE 'Asia/Karachi')::date
                                                                 THEN public.setting('nudge_today_minutes')
                                                                 ELSE public.setting('nudge_later_minutes') END)::integer)
      AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.updated_at >= j.announced_at)
    RETURNING j.*
  LOOP
    IF v_job.paid_by_pechkas THEN
      PERFORM public.tell_office('replacement_waiting', v_job.id,
        public.job_vars(v_job) || jsonb_build_object('cap', public.rs(v_job.pay_cap_paisa)));
    ELSE
      PERFORM public.tell(v_job.customer_id, 'no_offers', v_job.id, '/jobs', public.job_vars(v_job));
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * 8pm on its day with nobody chosen: closed. Her own job: "Book again".
 * A replacement: she chooses another day on her claim (the trigger frees
 * the claim for that), and the office is told.
 */
CREATE OR REPLACE FUNCTION public.close_unclaimed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_job   public.jobs%ROWTYPE;
  v_n     integer := 0;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j
    SET status = 'cancelled', cancelled_by = 'nobody', cancel_reason = 'No technician was free for this job.', updated_at = now()
    WHERE j.status = 'open'
      AND CASE WHEN j.when_kind = 'now' OR j.when_date IS NULL
               THEN j.created_at < now() - interval '24 hours'
               ELSE j.when_date < v_today OR (j.when_date = v_today AND v_hour >= 20) END
    RETURNING j.*
  LOOP
    IF v_job.paid_by_pechkas THEN
      PERFORM public.tell(v_job.customer_id, 'replacement_unclaimed', v_job.id, '/jobs', public.job_vars(v_job));
      PERFORM public.tell_office('replacement_unclaimed_office', v_job.id, public.job_vars(v_job));
    ELSE
      PERFORM public.tell(v_job.customer_id, 'unclaimed', v_job.id, '/jobs', public.job_vars(v_job));
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * The office raises what Pechkas will pay for a replacement nobody has
 * taken. Upwards only, whole rupees, at most three times the first limit
 * (a typing guard, not a policy), with a reason on record. The job is
 * announced again at the new figure. The extra is Pechkas' cost: the
 * original technician's charge stays capped at his original labour.
 */
CREATE OR REPLACE FUNCTION public.admin_raise_cap(p_claim uuid, p_cap_paisa bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_job   public.jobs;
  v_first bigint;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim AND status = 'replacing' FOR UPDATE;
  IF v_claim.id IS NULL OR v_claim.replacement_job_id IS NULL THEN
    RETURN public.refuse('There is no replacement repair waiting for offers on this claim.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_claim.replacement_job_id FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'open' OR NOT v_job.paid_by_pechkas THEN
    RETURN public.refuse('The replacement repair is no longer waiting for offers.');
  END IF;
  v_first := coalesce(v_claim.first_cap_paisa, v_job.pay_cap_paisa);
  IF p_cap_paisa IS NULL OR p_cap_paisa % 100 <> 0 THEN
    RETURN public.refuse('Write the new limit in whole rupees.', 'cap');
  END IF;
  IF p_cap_paisa <= v_job.pay_cap_paisa THEN
    RETURN public.refuse('The new limit must be more than ' || public.rs(v_job.pay_cap_paisa) || '.', 'cap');
  END IF;
  IF p_cap_paisa > v_first * 3 THEN
    RETURN public.refuse('That is more than three times the first limit (' || public.rs(v_first) || '). Check the figure; for more, ring the customer first.', 'cap');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 300 THEN
    RETURN public.refuse('Write why, in a sentence. It stays on the record.', 'note');
  END IF;

  UPDATE public.jobs
  SET pay_cap_paisa = p_cap_paisa, offered_paisa = p_cap_paisa,
      announced_at = now(), nudged_at = NULL, needs_you_told_at = NULL, updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  UPDATE public.guarantee_claims
  SET first_cap_paisa = v_first, cap_raised_at = now(), cap_note = v_note,
      cap_raised_by_name = (SELECT name FROM public.staff WHERE id = auth.uid())
  WHERE id = p_claim;
  PERFORM public.log_job(v_job.id, 'cap_raised', jsonb_build_object('to', p_cap_paisa, 'first', v_first, 'note', v_note));
  PERFORM public.log_job(v_claim.job_id, 'cap_raised', jsonb_build_object('to', p_cap_paisa, 'first', v_first, 'note', v_note));
  PERFORM public.announce_again(v_job);
  RETURN jsonb_build_object('ok', true, 'cap_paisa', p_cap_paisa);
END;
$$;

/**
 * She books the replacement repair: offered at the original labour, or the
 * limit the office last raised it to. Booking again after nobody took it
 * works too (it failed before: her photos were still the old job's).
 */
CREATE OR REPLACE FUNCTION public.book_replacement(p_claim uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_job   public.jobs;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour  integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_cap   bigint;
  v_new   uuid;
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND customer_id = auth.uid() AND status = 'replacing' AND replacement_job_id IS NULL
  FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This claim is not waiting for a day.');
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 6 OR (p_date = v_today AND v_hour >= 20) THEN
    RETURN public.refuse('Choose today (before 8pm) or a day in the coming week.', 'day');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_claim.job_id;
  -- The cap: what the original work was worth, and never below the lowest price.
  v_cap := greatest(coalesce(v_job.agreed_paisa, v_job.offered_paisa) - coalesce(v_job.parts_paisa, 0),
                    public.setting('min_offer_paisa'));
  v_cap := (v_cap / 100) * 100;
  -- Booked again after nobody took it: the limit the office last raised it to stands.
  v_cap := greatest(v_cap, coalesce((SELECT max(r.pay_cap_paisa) FROM public.jobs r WHERE r.guarantee_of = v_claim.id), 0));

  INSERT INTO public.jobs (customer_id, trade, job_type_id, title, description, offered_paisa,
                           when_kind, when_part, when_date, sector, street, house, landmark, lat, lng,
                           power, parts, gate_note, guarantee_of, paid_by_pechkas, pay_cap_paisa)
  VALUES (v_job.customer_id, v_job.trade, v_job.job_type_id, left('Guarantee repair: ' || v_job.title, 120),
          left(v_claim.description, 500), v_cap,
          CASE WHEN p_date = v_today THEN 'today' WHEN p_date = v_today + 1 THEN 'tomorrow' ELSE 'later' END,
          NULL, p_date, v_job.sector, v_job.street, v_job.house, v_job.landmark, v_job.lat, v_job.lng,
          v_job.power, v_job.parts, v_job.gate_note, v_claim.id, true, v_cap)
  RETURNING id INTO v_new;
  -- What she showed us is what the technicians see. Booked again after
  -- nobody took it: the earlier, closed replacement's copies move across,
  -- because a file belongs to one job.
  UPDATE public.job_media m SET job_id = v_new
  WHERE m.path IN (SELECT jsonb_array_elements_text(v_claim.media))
    AND m.job_id IN (SELECT r.id FROM public.jobs r WHERE r.guarantee_of = v_claim.id AND r.id <> v_new);
  INSERT INTO public.job_media (job_id, kind, path)
  SELECT v_new, CASE WHEN x ~* '\.(mp4|mov|m4v|webm)$' THEN 'video' ELSE 'photo' END, x
  FROM jsonb_array_elements_text(v_claim.media) AS x
  ON CONFLICT (path) DO NOTHING;
  UPDATE public.guarantee_claims SET replacement_job_id = v_new, first_cap_paisa = coalesce(first_cap_paisa, v_cap) WHERE id = p_claim;
  PERFORM public.log_job(v_claim.job_id, 'replacement_booked', jsonb_build_object('job', v_new));
  RETURN jsonb_build_object('ok', true, 'job_id', v_new);
END;
$$;

/** Her jobs, as before; can_raise is false on a repair Pechkas pays for. */
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
    ) || jsonb_build_object(
      -- Nobody has offered yet (when_nobody_offers): what she may do about it.
      'list_paisa', (SELECT t.list_paisa FROM public.job_types t WHERE t.id = j.job_type_id),
      'nudged', j.status = 'open' AND j.nudged_at IS NOT NULL,
      'raises_left', greatest(public.setting('max_raises') - j.raises, 0),
      'can_raise', j.status = 'open' AND j.raises < public.setting('max_raises') AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()),
      'can_move', j.status = 'open' AND j.when_kind <> 'now' AND j.when_from IS NULL AND j.when_part IS NULL AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) || jsonb_build_object(
      -- He says finished, she checks (checks_and_guarantee).
      'checking_at', j.checking_at,
      'check_due', CASE WHEN j.stage = 'checking' THEN j.checking_at + make_interval(hours => public.setting('check_hours')::integer) END,
      'not_finished', j.not_finished,
      'checks', coalesce((SELECT jsonb_agg(jsonb_build_object('round', k.round, 'answer', k.answer, 'reason', public.check_reason_text(k.reason),
                                                              'note', k.note, 'photo', k.photo, 'pro_reply', k.pro_reply) ORDER BY k.round)
                          FROM public.job_checks k WHERE k.job_id = j.id AND k.answer IS NOT NULL), '[]'::jsonb),
      'disputed', j.stage = 'disputed',
      'dispute_outcome', j.dispute_outcome, 'dispute_note', j.dispute_note,
      'confirmed_by', j.confirmed_by,
      'paid_by_pechkas', j.paid_by_pechkas,
      'guarantee_of_ref', (SELECT o.ref FROM public.guarantee_claims c JOIN public.jobs o ON o.id = c.job_id WHERE c.id = j.guarantee_of),
      'guarantee_days', CASE WHEN j.status = 'done' THEN public.guarantee_days_of(j.id) END,
      'guarantee_until', CASE WHEN j.status = 'done' THEN j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) END,
      'claim', public.claim_for_customer(j.id),
      'can_claim', j.status = 'done' AND j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) > now()
                   AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered')),
      'claim_open', EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered'))
                    OR EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open')
    ) || jsonb_build_object(
      -- A repair Pechkas pays for has no price for her to raise (guarantee_followups).
      'can_raise', j.status = 'open' AND NOT j.paid_by_pechkas AND j.raises < public.setting('max_raises')
                   AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;


-- --- A charge, recorded first and posted only after the chance to appeal ---------------------

/**
 * Posts a recorded charge to the ledger — at its date, or when the office
 * upholds an appeal. Once (the key is the claim). Not enough in his balance
 * simply means more owed; crossing the credit limit stops his new offers,
 * and he is told once, as with commission.
 */
CREATE OR REPLACE FUNCTION public.post_guarantee_charge(p_claim uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim  public.guarantee_claims;
  v_txn    uuid;
  v_before bigint;
  v_after  bigint;
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = p_claim FOR UPDATE;
  IF v_claim.id IS NULL OR v_claim.charge_txn IS NOT NULL OR coalesce(v_claim.charge_paisa, 0) <= 0 OR v_claim.pro_id IS NULL THEN
    RETURN v_claim.charge_txn;
  END IF;
  v_before := public.pro_owed(v_claim.pro_id);
  v_txn := public.post_txn('guarantee_charge:' || v_claim.id, 'guarantee_charge', v_claim.job_id, v_claim.pro_id, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', v_claim.pro_id, 'amount', v_claim.charge_paisa),
    jsonb_build_object('account', 'reserve', 'amount', -v_claim.charge_paisa)));
  UPDATE public.guarantee_claims SET charge_txn = v_txn, charged_at = now() WHERE id = p_claim RETURNING * INTO v_claim;
  PERFORM public.log_job(v_claim.job_id, 'claim_charged', jsonb_build_object('amount', v_claim.charge_paisa));
  PERFORM public.tell(v_claim.pro_id, 'claim_charged', v_claim.job_id, '/pro/money',
    public.claim_vars(v_claim) || jsonb_build_object('amount', public.rs(v_claim.charge_paisa)));
  v_after := public.pro_owed(v_claim.pro_id);
  IF v_before <= public.setting('credit_limit_paisa') AND v_after > public.setting('credit_limit_paisa') THEN
    PERFORM public.tell(v_claim.pro_id, 'over_limit', v_claim.job_id, '/pro/money',
      public.claim_vars(v_claim) || jsonb_build_object('owed', public.rs(v_after)));
  END IF;
  RETURN v_txn;
END;
$$;

/**
 * A replacement job that ends. Done: Pechkas pays the technician who did it
 * — first off what he owes Pechkas, and whatever is left over Pechkas owes
 * him — the claim is fixed, and when the original man is responsible his
 * charge is RECORDED: never more than his original labour, parts never,
 * posted only after appeal_days if he does not appeal. Stopped: the visit
 * fee is Pechkas' too. Stopped or cancelled: she chooses another day.
 */
CREATE OR REPLACE FUNCTION public.on_replacement_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim  public.guarantee_claims;
  v_orig   public.jobs;
  v_pay    bigint;
  v_charge bigint;
BEGIN
  IF NEW.guarantee_of IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('done', 'stopped', 'cancelled') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims WHERE id = NEW.guarantee_of FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.status IN ('stopped', 'cancelled') THEN
    IF NEW.status = 'stopped' AND NEW.pro_id IS NOT NULL THEN
      v_pay := public.visit_fee(NEW.id);
      PERFORM public.post_txn('guarantee_pay:' || NEW.id, 'guarantee_pay', NEW.id, NEW.pro_id, jsonb_build_array(
        jsonb_build_object('account', 'pro_owes', 'pro_id', NEW.pro_id, 'amount', -v_pay),
        jsonb_build_object('account', 'reserve', 'amount', v_pay)));
    END IF;
    UPDATE public.guarantee_claims SET replacement_job_id = NULL WHERE id = v_claim.id AND replacement_job_id = NEW.id;
    RETURN NULL;
  END IF;

  -- Done.
  v_pay := NEW.agreed_paisa;
  PERFORM public.post_txn('guarantee_pay:' || NEW.id, 'guarantee_pay', NEW.id, NEW.pro_id, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', NEW.pro_id, 'amount', -v_pay),
    jsonb_build_object('account', 'reserve', 'amount', v_pay)));
  UPDATE public.guarantee_claims SET status = 'fixed', closed_at = now(), closed_by = coalesce(NEW.confirmed_by, 'clock')
  WHERE id = v_claim.id;
  PERFORM public.tell(NEW.pro_id, 'guarantee_paid', NEW.id, '/pro/money',
    public.job_vars(NEW) || jsonb_build_object('amount', public.rs(v_pay)));

  IF v_claim.charge_original AND v_claim.pro_id IS NOT NULL AND v_claim.charge_paisa IS NULL THEN
    SELECT * INTO v_orig FROM public.jobs WHERE id = v_claim.job_id;
    -- What the repair's work cost, never more than the labour of his own job;
    -- a raised limit above that is Pechkas' cost, not his.
    v_charge := least(NEW.agreed_paisa - coalesce(NEW.parts_paisa, 0),
                      coalesce(v_orig.agreed_paisa, 0) - coalesce(v_orig.parts_paisa, 0));
    IF v_charge > 0 THEN
      UPDATE public.guarantee_claims
      SET charge_paisa = v_charge, charge_due = now() + make_interval(days => public.setting('appeal_days')::integer)
      WHERE id = v_claim.id RETURNING * INTO v_claim;
      PERFORM public.log_job(v_claim.job_id, 'charge_recorded', jsonb_build_object('amount', v_charge, 'due', v_claim.charge_due));
      PERFORM public.tell(v_claim.pro_id, 'charge_pending', v_claim.job_id, '/pro/claims',
        public.claim_vars(v_claim) || jsonb_build_object('amount', public.rs(v_charge),
          'date', to_char(v_claim.charge_due AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon')));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_replacement_done ON public.jobs;
CREATE TRIGGER job_replacement_done AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_replacement_done();

/** Every minute: charges whose date has come, with no appeal waiting, are posted. */
CREATE OR REPLACE FUNCTION public.charge_clock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR v_id IN
    SELECT c.id FROM public.guarantee_claims c
    WHERE c.charge_txn IS NULL AND c.charge_paisa > 0 AND c.charge_due <= now()
      AND c.appeal_at IS NULL
    ORDER BY c.charge_due
    LIMIT 200
  LOOP
    PERFORM public.post_guarantee_charge(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/**
 * One appeal against a charge: before its date (nothing is posted while
 * the office decides), or — for a charge the previous version posted at
 * once — within appeal_days of it.
 */
CREATE OR REPLACE FUNCTION public.appeal_charge(p_claim uuid, p_text text, p_photos jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND pro_id = auth.uid() AND coalesce(charge_paisa, 0) > 0 FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('There is no charge on this claim to appeal.');
  END IF;
  IF v_claim.appeal_at IS NOT NULL THEN
    RETURN public.refuse('You have already appealed. The office will decide.');
  END IF;
  IF (v_claim.charge_txn IS NULL AND v_claim.charge_due <= now())
     OR (v_claim.charge_txn IS NOT NULL AND (v_claim.charge_due IS NOT NULL
         OR v_claim.charged_at < now() - make_interval(days => public.setting('appeal_days')::integer))) THEN
    RETURN public.refuse('The time to appeal this charge has passed. It is final.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 10 OR length(v_text) > 500 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Explain why the charge is wrong, in a few sentences.', 'text');
  END IF;
  IF coalesce(jsonb_array_length(p_photos), 0) > 0 AND public.own_uploads(p_photos, 1) IS NOT NULL THEN
    RETURN public.refuse('A photo did not finish uploading. Try again.', 'photos');
  END IF;
  UPDATE public.guarantee_claims SET appeal_text = v_text, appeal_photos = coalesce(p_photos, '[]'::jsonb), appeal_at = now()
  WHERE id = p_claim RETURNING * INTO v_claim;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT v_claim.job_id, auth.uid(), 'fix', x FROM jsonb_array_elements_text(coalesce(p_photos, '[]'::jsonb)) AS x;
  PERFORM public.log_job(v_claim.job_id, 'appeal', jsonb_build_object('text', v_text));
  PERFORM public.tell_office('claim_office', v_claim.job_id, public.claim_vars(v_claim));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The office decides an appeal, once. Upheld: a charge still waiting is
 * posted now. Cancelled: a charge still waiting is never posted; one
 * already posted is reversed, never edited.
 */
CREATE OR REPLACE FUNCTION public.admin_decide_appeal(p_claim uuid, p_cancel boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.guarantee_claims;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_claim FROM public.guarantee_claims
  WHERE id = p_claim AND appeal_at IS NOT NULL AND appeal_outcome IS NULL FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN public.refuse('This appeal is not waiting for a decision.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write why, in a sentence. He will read it in the app.', 'note');
  END IF;
  UPDATE public.guarantee_claims
  SET appeal_outcome = CASE WHEN p_cancel THEN 'cancelled' ELSE 'upheld' END, appeal_note = v_note, appeal_decided_at = now()
  WHERE id = p_claim RETURNING * INTO v_claim;
  IF p_cancel AND v_claim.charge_txn IS NOT NULL THEN
    PERFORM public.post_txn('reverse:' || v_claim.charge_txn, 'reversal', v_claim.job_id, v_claim.pro_id,
      (SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
       FROM public.ledger_entries e WHERE e.txn_id = v_claim.charge_txn),
      NULL, NULL, 'Guarantee charge cancelled on appeal', v_claim.charge_txn);
  END IF;
  PERFORM public.log_job(v_claim.job_id, 'appeal_decided', jsonb_build_object('cancelled', p_cancel, 'note', v_note));
  PERFORM public.tell(v_claim.pro_id, 'appeal_decided', v_claim.job_id, '/pro/claims', public.claim_vars(v_claim));
  IF NOT p_cancel AND v_claim.charge_txn IS NULL THEN
    PERFORM public.post_guarantee_charge(p_claim);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- What each side reads -------------------------------------------------------------------

/**
 * His claims: the open ones, charges waiting for their date or recently
 * posted, and decisions. Before he accepts he gets the sector and her
 * first name; once he is coming, the address and her number.
 */
CREATE OR REPLACE FUNCTION public.pro_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'status', c.status, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
      'sector', j.sector, 'customer_first_name', p.first_name,
      'description', c.description, 'media', c.media, 'created_at', c.created_at, 'answer_due', c.answer_due,
      'late', c.status = 'waiting' AND c.answer_due <= now(),
      'can_answer', c.status = 'waiting' OR (c.status = 'replacing' AND c.why_replacing = 'no_answer' AND c.replacement_job_id IS NULL),
      'visit_date', c.visit_date, 'visit_from', c.visit_from,
      'visit_by', coalesce(c.answered_at, now()) + make_interval(hours => public.setting('claim_visit_hours')::integer),
      'street', CASE WHEN c.status = 'coming' THEN j.street END,
      'house', CASE WHEN c.status = 'coming' THEN j.house END,
      'landmark', CASE WHEN c.status = 'coming' THEN j.landmark END,
      'gate_note', CASE WHEN c.status = 'coming' THEN j.gate_note END,
      'lat', CASE WHEN c.status = 'coming' THEN j.lat END,
      'lng', CASE WHEN c.status = 'coming' THEN j.lng END,
      'customer_phone', CASE WHEN c.status = 'coming' THEN public.phone_of(u.id) END,
      'why_replacing', c.why_replacing, 'still_broken', c.still_broken,
      'office_note', CASE WHEN c.why_replacing = 'office' OR c.status = 'not_covered' THEN c.office_note END,
      'blocks', coalesce(public.claim_blocks(auth.uid()) = c.id, false)
    ) || jsonb_build_object(
      -- The charge: waiting for its date (pending), or posted (final).
      'charge_paisa', c.charge_paisa,
      'charge_due', c.charge_due,
      'charge_final', c.charge_txn IS NOT NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled',
      'charged_at', c.charged_at,
      'appeal_until', coalesce(c.charge_due, c.charged_at + make_interval(days => public.setting('appeal_days')::integer)),
      'can_appeal', coalesce(c.charge_paisa, 0) > 0 AND c.appeal_at IS NULL
                    AND ((c.charge_txn IS NULL AND c.charge_due > now())
                         OR (c.charge_txn IS NOT NULL AND c.charge_due IS NULL
                             AND c.charged_at > now() - make_interval(days => public.setting('appeal_days')::integer))),
      'appeal_at', c.appeal_at, 'appeal_text', c.appeal_text, 'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.guarantee_claims c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.profiles p ON p.id = c.customer_id
  LEFT JOIN auth.users u ON u.id = c.customer_id
  WHERE c.pro_id = auth.uid()
    AND (c.status NOT IN ('fixed', 'not_covered')
         OR (c.charge_paisa > 0 AND c.charge_txn IS NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled')
         OR (c.appeal_at IS NOT NULL AND (c.appeal_outcome IS NULL OR c.appeal_decided_at > now() - interval '30 days'))
         OR (c.charge_txn IS NOT NULL AND c.charged_at > now() - interval '30 days')
         OR c.closed_at > now() - interval '3 days');
$$;

/**
 * Everything waiting for a person: refused claims, repairs she says are
 * still broken, appeals, disputed jobs, replacements nobody has offered on
 * — and the rest, for reading.
 */
CREATE OR REPLACE FUNCTION public.admin_guarantee()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'claims', coalesce((
      SELECT jsonb_agg(x.claim ORDER BY x.needs DESC, x.created_at DESC)
      FROM (
        SELECT c.created_at,
               coalesce(c.status IN ('refused', 'disputed') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
                        OR (rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live), false) AS needs,
               jsonb_build_object(
                 'id', c.id, 'status', c.status, 'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
                 'customer', p.first_name, 'customer_phone', public.phone_of(c.customer_id),
                 'pro', r.full_name, 'pro_phone', public.phone_of(c.pro_id),
                 'finished_at', j.finished_at, 'guarantee_days', public.guarantee_days_of(j.id),
                 'original_labour_paisa', coalesce(j.agreed_paisa, 0) - coalesce(j.parts_paisa, 0),
                 'description', c.description, 'media', c.media, 'created_at', c.created_at, 'answer_due', c.answer_due,
                 'refuse_reason', c.refuse_reason, 'visit_date', c.visit_date, 'visit_from', c.visit_from,
                 'fixed_photos', c.fixed_photos, 'still_broken', c.still_broken,
                 'why_replacing', c.why_replacing, 'charge_original', c.charge_original,
                 'replacement_job_id', c.replacement_job_id, 'replacement_ref', rj.ref,
                 'block_lifted', c.block_lifted, 'blocking', coalesce(public.claim_blocks(c.pro_id) = c.id, false),
                 'office_note', c.office_note, 'decided_by_name', c.decided_by_name, 'decided_at', c.decided_at,
                 'closed_by', c.closed_by, 'closed_at', c.closed_at,
                 'photos', public.photos_of(j.id)
               ) || jsonb_build_object(
                 -- The replacement, and the office's limit on what Pechkas pays for it.
                 'replacement_status', rj.status,
                 'replacement_offers', rx.n,
                 'replacement_waiting', coalesce(rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live, false),
                 'cap_paisa', rj.pay_cap_paisa,
                 'first_cap_paisa', coalesce(c.first_cap_paisa, rj.pay_cap_paisa),
                 'max_cap_paisa', coalesce(c.first_cap_paisa, rj.pay_cap_paisa) * 3,
                 'can_raise_cap', coalesce(c.status = 'replacing' AND rj.status = 'open' AND rj.paid_by_pechkas, false),
                 'cap_raised_at', c.cap_raised_at, 'cap_raised_by_name', c.cap_raised_by_name, 'cap_note', c.cap_note,
                 -- The charge, recorded and then final.
                 'charge_paisa', c.charge_paisa, 'charge_due', c.charge_due, 'charged_at', c.charged_at,
                 'charge_final', c.charge_txn IS NOT NULL AND coalesce(c.appeal_outcome, '') <> 'cancelled',
                 'appeal_text', c.appeal_text, 'appeal_photos', c.appeal_photos, 'appeal_at', c.appeal_at,
                 'appeal_outcome', c.appeal_outcome, 'appeal_note', c.appeal_note,
                 'needs_you', coalesce(c.status IN ('refused', 'disputed') OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
                                       OR (rj.status = 'open' AND rj.nudged_at IS NOT NULL AND NOT rx.live), false)
               ) AS claim
        FROM public.guarantee_claims c
        JOIN public.jobs j ON j.id = c.job_id
        JOIN public.profiles p ON p.id = c.customer_id
        LEFT JOIN public.pros r ON r.id = c.pro_id
        LEFT JOIN public.jobs rj ON rj.id = c.replacement_job_id
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE o.status = 'pending' AND o.expires_at > now()) AS n,
                 coalesce(bool_or(o.status = 'pending' AND o.expires_at > now()), false) AS live
          FROM public.offers o WHERE o.job_id = rj.id) rx ON true
        WHERE c.status NOT IN ('fixed', 'not_covered') OR c.created_at > now() - interval '60 days'
           OR (c.charge_paisa > 0 AND c.charge_txn IS NULL) OR (c.appeal_at IS NOT NULL AND c.appeal_outcome IS NULL)
      ) x), '[]'::jsonb),
    'disputes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'sector', j.sector,
          'customer', p.first_name, 'customer_phone', public.phone_of(j.customer_id),
          'pro', r.full_name, 'pro_phone', public.phone_of(j.pro_id),
          'agreed_paisa', j.agreed_paisa, 'visit_fee_paisa', public.visit_fee(j.id), 'disputed_at', j.disputed_at,
          'stage', j.stage, 'status', j.status, 'outcome', j.dispute_outcome, 'note', j.dispute_note,
          'photos', public.photos_of(j.id),
          'checks', (SELECT jsonb_agg(jsonb_build_object('round', k.round, 'finished_at', k.finished_at, 'answer', k.answer,
                                                         'reason', public.check_reason_text(k.reason), 'note', k.note, 'photo', k.photo,
                                                         'pro_reply', k.pro_reply) ORDER BY k.round)
                     FROM public.job_checks k WHERE k.job_id = j.id)
        ) ORDER BY (j.stage = 'disputed') DESC, j.disputed_at DESC)
      FROM public.jobs j
      JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      WHERE j.disputed_at IS NOT NULL AND (j.stage = 'disputed' OR j.disputed_at > now() - interval '60 days')), '[]'::jsonb),
    'reserve_paisa', -coalesce((SELECT sum(e.amount_paisa) FROM public.ledger_entries e WHERE e.account = 'reserve'), 0),
    'charges_waiting_paisa', coalesce((SELECT sum(c.charge_paisa) FROM public.guarantee_claims c
                                        WHERE c.charge_paisa > 0 AND c.charge_txn IS NULL
                                          AND coalesce(c.appeal_outcome, '') <> 'cancelled'), 0)
  );
END;
$$;


-- --- What the phones are told ---------------------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('charge_pending.title',               442, NULL, 'Guarantee repair: {amount} to be charged', 'technician'),
  ('charge_pending.body',                443, NULL, 'For job {ref}. It will be added to what you owe on {date} unless you appeal before then in Guarantee claims.', 'technician'),
  ('claim_charged.title',                436, NULL, 'Guarantee repair charged: {amount}', 'technician'),
  ('claim_charged.body',                 437, NULL, 'Added to what you owe for job {ref}. The charge is final.', 'technician'),
  ('appeal_decided.body',                439, NULL, 'Open Guarantee claims to read the decision.', 'technician'),
  ('replacement_waiting.title',          444, NULL, 'No offers on guarantee repair {ref}', 'office'),
  ('replacement_waiting.body',           445, NULL, 'Nobody has offered at {cap}. You can raise the limit in Guarantee and disputes.', 'office'),
  ('replacement_unclaimed.title',        446, NULL, 'No technician was free for your repair', 'customer'),
  ('replacement_unclaimed.body',         447, NULL, 'Open My jobs and choose another day on your guarantee claim. Pechkas still pays for the repair.', 'customer'),
  ('replacement_unclaimed_office.title', 448, NULL, 'Guarantee repair {ref} closed without a technician', 'office'),
  ('replacement_unclaimed_office.body',  449, NULL, 'The customer will choose another day. Consider raising the limit when she does.', 'office')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 436 AND 449 AND (ur IS NULL OR key IN ('claim_charged.body', 'appeal_decided.body'));


-- --- The clock ---------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-charge-clock', '* * * * *', 'SELECT public.charge_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.post_guarantee_charge(uuid), public.charge_clock(), public.on_replacement_done()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.admin_raise_cap(uuid, bigint, text),
  public.appeal_charge(uuid, text, jsonb),
  public.admin_decide_appeal(uuid, boolean, text),
  public.book_replacement(uuid, date),
  public.raise_price(uuid, bigint),
  public.pro_claims(),
  public.admin_guarantee(),
  public.my_jobs()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261107000000_guarantee_followups')
ON CONFLICT (name) DO NOTHING;

COMMIT;
