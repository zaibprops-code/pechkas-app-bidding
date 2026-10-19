-- =============================================================================
--  Declining one offer
-- =============================================================================
--
--  A customer can now say "No thanks" to one technician's offer while the job
--  is still open, the way a rider turns a driver down on inDrive. Before this
--  she could only let it run out, or choose somebody else.
--
--  The rules, chosen for the owner and written down in docs/OWNER.md:
--
--    · Only her own job, only while it is open, only an offer that is live.
--      The job row is locked first, the same lock choose_offer() takes, so a
--      decline and a choice racing each other cannot both happen.
--    · The offer becomes 'declined'. It leaves her list at once.
--    · He is told, once: "Your offer was not taken." — the trade, the sector
--      and the job number, nothing else, like every other notification. It
--      frees him to stop waiting on it.
--    · He cannot offer on that job again, and it leaves his feed. That is in
--      pro_may_see_as(), the one rule for what a technician may see, so the
--      feed, a new offer, the job's files and its notifications all stop
--      together — for that one job only. It is not a block: her other jobs
--      reach him as before.
--    · The decline goes in the job's history, with his first name and the
--      price, so the office can see it.
--
--  Safe to run twice.

BEGIN;

-- --- The new state -----------------------------------------------------------------------

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_status_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_status_check
  CHECK (status IN ('pending', 'withdrawn', 'accepted', 'rejected', 'declined'));


-- --- What a technician may see, now without a job that turned him down --------------------

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
        (j.status = 'open' AND j.trade = ANY (r.trades) AND j.sector = ANY (r.sectors)
         AND (j.preferred_pro_id IS NULL OR j.preferred_pro_id = r.id OR j.preferred_until <= now())
         AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = r.id)
         -- She said no to his offer on this job: it is closed to him.
         AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = r.id AND o.status = 'declined'))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
$$;


-- --- Saying no ---------------------------------------------------------------------------

/**
 * The customer turns down one live offer on her own open job. Refusals are
 * returned, never raised, and say nothing about anybody else's job: an
 * offer that is not hers reads exactly like one that has closed.
 */
CREATE OR REPLACE FUNCTION public.decline_offer(p_offer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
  v_job    public.jobs%ROWTYPE;
  v_offer  public.offers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;

  SELECT job_id INTO v_job_id FROM public.offers WHERE id = p_offer;
  IF v_job_id IS NULL THEN
    RETURN public.refuse('This offer is no longer open.');
  END IF;

  -- The same lock as choose_offer(): one of the two goes first.
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id FOR UPDATE;
  IF v_job.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN public.refuse('This offer is no longer open.');
  END IF;
  IF v_job.status <> 'open' THEN
    RETURN public.refuse('This job is no longer waiting for offers.');
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer FOR UPDATE;
  IF v_offer.status <> 'pending' OR v_offer.expires_at <= now() THEN
    RETURN public.refuse('This offer has already closed.');
  END IF;

  UPDATE public.offers SET status = 'declined', updated_at = now() WHERE id = p_offer;

  PERFORM public.log_job(v_job.id, 'offer_declined', jsonb_build_object(
    'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_offer.pro_id), 'A technician'),
    'price_paisa', v_offer.price_paisa));

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Telling him -------------------------------------------------------------------------

/**
 * An offer changes. Becoming live tells the customer. Being turned down
 * while it was live tells the technician why: she said no to it, somebody
 * else was chosen, or the job was called off. An offer that had already run
 * out, or that he took back himself, tells nobody — he has already moved on.
 */
CREATE OR REPLACE FUNCTION public.on_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs%ROWTYPE;
  v_vars jsonb;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  v_vars := public.job_vars(v_job);

  IF NEW.status = 'declined' AND TG_OP = 'UPDATE' AND OLD.status = 'pending' THEN
    PERFORM public.tell(NEW.pro_id, 'declined', v_job.id, '/pro', v_vars);
    RETURN NULL;
  END IF;

  IF NEW.status = 'rejected' AND TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
    IF v_job.status = 'assigned' AND v_job.pro_id IS DISTINCT FROM NEW.pro_id THEN
      PERFORM public.tell(NEW.pro_id, 'not_chosen', v_job.id, '/pro', v_vars);
    ELSIF v_job.status = 'cancelled' THEN
      PERFORM public.tell(NEW.pro_id, 'offer_closed', v_job.id, '/pro', v_vars);
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.status <> 'pending' OR v_job.status <> 'open' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
    RETURN NULL;
  END IF;

  v_vars := v_vars || jsonb_build_object(
    'price', public.rs(NEW.price_paisa),
    'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = NEW.pro_id), 'A technician'),
    'eta', CASE WHEN NEW.eta_minutes IS NULL THEN ''
                ELSE public.say('offer.eta', 'en', jsonb_build_object('minutes', NEW.eta_minutes)) END
  );
  PERFORM public.tell(v_job.customer_id, 'offer', v_job.id, '/jobs', v_vars,
                      CASE WHEN NEW.price_paisa = v_job.offered_paisa THEN 'offer.same' ELSE 'offer.counter' END);
  RETURN NULL;
END;
$$;

-- `ur` is never read since the English-only change, but an older migration,
-- run a second time, still insists a technician's line has one. So it holds
-- the English too, rather than a Roman Urdu line nobody would ever see.
INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('declined.title', 45, 'Your offer was not taken: {ref}', 'Your offer was not taken: {ref}', 'technician'),
  ('declined.body',  46, 'The customer chose not to take your offer for the {trade} job in {sector}. Thank you; more jobs will come.',
                         'The customer chose not to take your offer for the {trade} job in {sector}. Thank you; more jobs will come.', 'technician')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;


-- --- Who may call what ------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.decline_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_offer(uuid) TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261028000000_declining_an_offer')
ON CONFLICT (name) DO NOTHING;

COMMIT;
