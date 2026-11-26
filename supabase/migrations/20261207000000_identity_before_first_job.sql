-- =============================================================================
-- The identity check comes before a technician's first job (the owner, 26
-- November 2026, A119).
--
--   The owner chose the strongest check: an outside identity company checks
--   his CNIC against NADRA's records, with a live selfie matched to the card.
--   The company keeps the card picture; Pechkas keeps only "verified" or
--   "failed", when, and the company's own reference (A25, A88). Nothing here
--   names a company: the small server functions in supabase/functions/ talk
--   to it, and its key lives only in Supabase's secrets.
--
--   1. Once the owner switches the service on (Admin → Exceptions → First
--      jobs set-up), trade_level() gives NOTHING to a technician whose
--      identity is not verified: no feed, no offer, no job, whatever his
--      trades say. While it is off, nothing changes (first-job limits, as
--      before). Identity seen by Pechkas staff before D37 still counts until
--      the owner's deadline (A88).
--   2. Opening the company's page can cost Pechkas a paid check, so a
--      technician may open it three times a day at most (identity_opens).
--   3. identity_session() lets the server function remember the company's
--      session for a check, and identity_check_of() find the check again
--      from it, for companies whose answer names only their session. Both
--      are granted to the service role alone, like identity_result().
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.identity_opens (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pro_id uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_opens_pro ON public.identity_opens (pro_id, at);
ALTER TABLE public.identity_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_opens FROM anon, authenticated;

-- The company's own session id, never anything it saw.
ALTER TABLE public.identity_checks ADD COLUMN IF NOT EXISTS session_ref text;
DO $$ BEGIN
  ALTER TABLE public.identity_checks ADD CONSTRAINT identity_checks_session_ref_len CHECK (session_ref IS NULL OR length(session_ref) <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS identity_checks_session ON public.identity_checks (session_ref);

/** Is the identity service on, so that every technician must be verified before any job (A119)? */
CREATE OR REPLACE FUNCTION public.identity_needed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.is_on FROM public.identity_service s WHERE s.id = 1), false);
$$;

CREATE OR REPLACE FUNCTION public.trade_level(p_pro uuid, p_trade text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t      public.pro_trades;
  v_with   text;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.pros WHERE id = p_pro;
  IF v_status IS DISTINCT FROM 'approved' THEN
    RETURN 'none';
  END IF;
  SELECT * INTO v_t FROM public.pro_trades WHERE pro_id = p_pro AND trade = p_trade;
  IF v_t.pro_id IS NULL OR v_t.status IN ('paused', 'stopped') THEN
    RETURN 'none';
  END IF;
  -- A119: once the identity service is on, nobody takes any job until his identity is verified.
  IF public.identity_needed() AND NOT public.identity_ok(p_pro) THEN
    RETURN 'none';
  END IF;
  -- Approved before D37: as before, until sorted by his record. Past the identity deadline, see A119 above.
  IF v_t.status = 'legacy' THEN
    RETURN CASE WHEN public.identity_ok(p_pro) THEN 'full' ELSE 'trial' END;
  END IF;
  -- UPS and inverter: all of it is risky, and it opens only with risky Electrician work (fix a).
  SELECT opens_with INTO v_with FROM public.trades WHERE slug = p_trade;
  IF v_with IS NOT NULL THEN
    RETURN CASE WHEN public.trade_level(p_pro, v_with) = 'full' THEN 'full' ELSE 'none' END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = p_pro)
     OR NOT public.quiz_ok(p_pro, 'rules') OR NOT public.quiz_ok(p_pro, 'safety:' || p_trade) THEN
    RETURN 'none';
  END IF;
  -- However many good jobs, no verified identity means trial limits.
  IF v_t.status = 'trial' OR NOT public.identity_ok(p_pro) THEN
    RETURN 'trial';
  END IF;
  RETURN CASE WHEN v_t.risky = 'unlocked' THEN 'full' ELSE 'basic' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_start()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s  public.identity_service;
  v_id uuid;
BEGIN
  SELECT * INTO v_s FROM public.identity_service WHERE id = 1;
  IF NOT v_s.is_on THEN
    RETURN public.refuse('Identity checks are not available yet.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status IN ('applied', 'approved')) THEN
    RETURN public.refuse('Apply as a technician first.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_checks c WHERE c.pro_id = auth.uid() AND c.status = 'verified') THEN
    RETURN public.refuse('Your identity is verified already.');
  END IF;
  -- Every opening of the service's page can cost Pechkas a paid check, so three a day at most.
  -- The opening is recorded before the answer, so the count survives (a refusal, not a raise).
  IF (SELECT count(*) FROM public.identity_opens o WHERE o.pro_id = auth.uid() AND o.at > now() - interval '1 day') >= 3 THEN
    RETURN public.refuse('You have opened the identity check three times today. Try again tomorrow.', 'tries');
  END IF;
  INSERT INTO public.identity_opens (pro_id) VALUES (auth.uid());
  SELECT c.id INTO v_id FROM public.identity_checks c
  WHERE c.pro_id = auth.uid() AND c.status = 'pending' AND c.started_at > now() - interval '1 day'
  ORDER BY c.started_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.identity_checks (pro_id, service) VALUES (auth.uid(), v_s.service) RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'check_id', v_id, 'service', v_s.service);
END;
$$;

/** The server function remembers the company's session for a check still waiting. Service role only. */
CREATE OR REPLACE FUNCTION public.identity_session(p_check uuid, p_session text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := nullif(btrim(coalesce(p_session, '')), '');
BEGIN
  IF v_ref IS NULL OR length(v_ref) > 120 OR public.looks_like_cnic(v_ref) THEN
    RETURN public.refuse('The session must be the service''s own, never a card number.', 'session');
  END IF;
  UPDATE public.identity_checks SET session_ref = v_ref WHERE id = p_check AND status = 'pending';
  IF NOT FOUND THEN
    RETURN public.refuse('No such check waiting.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Which check a company's session belongs to. Service role only. */
CREATE OR REPLACE FUNCTION public.identity_check_of(p_session text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id FROM public.identity_checks c WHERE c.session_ref = p_session ORDER BY c.started_at DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.identity_needed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.identity_session(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.identity_check_of(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_session(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_check_of(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_start() TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261207000000_identity_before_first_job')
ON CONFLICT (name) DO NOTHING;

COMMIT;
