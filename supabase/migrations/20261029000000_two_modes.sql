-- =============================================================================
--  Two modes: one account, customer or technician
-- =============================================================================
--
--  Like inDrive, where the same account is a passenger or a driver, a person
--  now chooses how they are using Pechkas — and can switch, from the menu.
--  Before this the first choice was for good: a technician who wanted his
--  own tap fixed was told to sign up again with another number.
--
--  `profiles.role` keeps its name and now means the mode in use: the side of
--  the app this phone shows. Nothing about a job ever read it — every job
--  function works out who is asking from the job's own customer_id and
--  pro_id — so a job's rules are the same whichever mode anybody is in. The
--  three places that did read it are dealt with below: posting a job and
--  asking for a sector still need customer mode, and the office's flag list
--  now finds a customer by the jobs they posted, not by the mode they are in.
--
--  The rules for switching, written down in docs/OWNER.md:
--
--    · To technician mode only with an application on record. Without one
--      the answer is `field: 'apply'`, and the app opens the application.
--    · Never out of the middle of something. A customer with a job still
--      waiting for offers or a technician on the way cannot switch to the
--      other side; nor can a technician with a job he has been chosen for.
--      Somebody would be left waiting with nobody watching the screen.
--    · Leaving technician mode is going off duty: he goes offline, offers
--      still waiting for an answer are taken back, and a job a customer
--      asked for him by name goes to everyone at once, and she is told.
--    · An approved technician stays approved. The mode is the screen; his
--      record is the owner's and does not change.
--
--  Safe to run twice.

BEGIN;

-- --- Switching ----------------------------------------------------------------------------

/**
 * Change the mode this account is in. Refusals are returned, never raised,
 * each with the `field` the app needs: 'apply' (no application yet), 'job'
 * (something is still on), 'account' (not set up yet).
 */
CREATE OR REPLACE FUNCTION public.switch_mode(p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_now  text;
  v_ref  text;
  v_job  uuid;
  v_took integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('customer', 'pro') THEN
    RETURN public.refuse('Choose one of the two.', 'mode');
  END IF;

  -- Locked, so two taps from two phones signed in as one person take turns.
  SELECT role INTO v_now FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF v_now IS NULL THEN
    RETURN public.refuse('Finish setting up your account first.', 'account');
  END IF;
  IF v_now = p_mode THEN
    RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'changed', false);
  END IF;

  IF p_mode = 'pro' THEN
    -- The job first: an application would not change that answer.
    SELECT ref INTO v_ref FROM public.jobs
    WHERE customer_id = v_me AND status IN ('open', 'assigned')
    ORDER BY created_at DESC LIMIT 1;
    IF v_ref IS NOT NULL THEN
      RETURN public.refuse(format(
        'Your job %s is still on. Switch when it is finished, or cancel it first.', v_ref), 'job');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_me) THEN
      RETURN public.refuse('Apply to work with Pechkas first.', 'apply');
    END IF;
  ELSE
    SELECT ref INTO v_ref FROM public.jobs
    WHERE pro_id = v_me AND status = 'assigned'
    ORDER BY created_at DESC LIMIT 1;
    IF v_ref IS NOT NULL THEN
      RETURN public.refuse(format(
        'You are on job %s. Finish it first, or call the office if you cannot.', v_ref), 'job');
    END IF;

    -- Off duty.
    UPDATE public.pros SET online = false, last_seen_at = now() WHERE id = v_me;
    -- A job held for him by name goes to everyone now; pass_asked() tells her.
    FOR v_job IN
      SELECT id FROM public.jobs
      WHERE preferred_pro_id = v_me AND status = 'open' AND preferred_released_at IS NULL
    LOOP
      PERFORM public.pass_asked(v_job);
    END LOOP;
    -- Offers still waiting are taken back: nobody can choose a man who has gone.
    UPDATE public.offers SET status = 'withdrawn', updated_at = now()
    WHERE pro_id = v_me AND status = 'pending';
    GET DIAGNOSTICS v_took = ROW_COUNT;
  END IF;

  UPDATE public.profiles SET role = p_mode, updated_at = now() WHERE id = v_me;
  RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'changed', true, 'offers_taken_back', v_took);
END;
$$;


-- --- The first choice ---------------------------------------------------------------------

/**
 * The first thing a new account does: say how they are here and give a
 * first name. Once there is a mode, changing it is switch_mode()'s job —
 * this would skip every check that one makes.
 */
CREATE OR REPLACE FUNCTION public.start_as(p_role text, p_first_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_name text := btrim(coalesce(p_first_name, ''));
  v_old  text;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('customer', 'pro') THEN
    RETURN public.refuse('Choose one of the two.', 'role');
  END IF;
  IF length(v_name) < 1 THEN
    RETURN public.refuse('Please write your first name.', 'first_name');
  END IF;
  IF length(v_name) > 40 THEN
    RETURN public.refuse('That is longer than a first name.', 'first_name');
  END IF;

  SELECT role INTO v_old FROM public.profiles WHERE id = v_me;

  IF v_old IS NULL THEN
    INSERT INTO public.profiles (id, role, first_name) VALUES (v_me, p_role, v_name);
  ELSIF v_old <> p_role THEN
    RETURN public.refuse(CASE WHEN p_role = 'customer'
      THEN 'You already use Pechkas as a technician. To book a repair, open the menu and tap Customer mode.'
      ELSE 'You already use Pechkas as a customer. To work with us, open the menu and tap Technician mode.' END, 'role');
  ELSE
    UPDATE public.profiles SET first_name = v_name, updated_at = now() WHERE id = v_me;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', p_role);
END;
$$;


-- --- The office's flags: a customer is somebody who books --------------------------------

CREATE OR REPLACE FUNCTION public.admin_flags()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => public.setting('flag_days')::integer);
  v_min   bigint := public.setting('flag_min_jobs');
  v_rows  jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;

  WITH pro AS (
    SELECT r.id, r.full_name AS name, public.phone_of(u.id) AS phone, r.status,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since) AS finished,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'stopped' AND j.finished_at >= v_since) AS stopped,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status IN ('done', 'stopped') AND j.finished_at >= v_since
         AND EXISTS (SELECT 1 FROM public.job_changes c WHERE c.job_id = j.id)) AS raised,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         AND j.parts_paisa * 10000 >= j.collect_paisa * public.setting('flag_parts_bps')) AS parts,
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'code_wrong' AND e.at >= v_since) AS codes,
      (SELECT count(*) FROM public.job_events e JOIN public.jobs j ON j.id = e.job_id
         WHERE j.pro_id = r.id AND e.what = 'cancelled' AND e.at >= v_since) AS cancelled,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.pro_id = r.id AND x.side = 'customer' AND x.kind IN ('problem', 'guarantee') AND x.created_at >= v_since) AS complaints,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = r.id AND x.side = 'customer' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      (SELECT coalesce(max(n), 0) FROM (
         SELECT count(*) AS n FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         GROUP BY j.customer_id) g) AS same_customer,
      (SELECT count(*) FROM public.blocks b WHERE b.pro_id = r.id AND b.created_at >= v_since) AS blocked
    FROM public.pros r LEFT JOIN auth.users u ON u.id = r.id
    WHERE r.status IN ('approved', 'suspended')
  ),
  pro_flags AS (
    SELECT p.*, array_remove(ARRAY[
        CASE WHEN p.finished >= v_min AND p.stopped * 10000 >= p.finished * public.setting('flag_stopped_bps')
             THEN public.flag_if('stopped', p.stopped, 1, p.finished) END,
        CASE WHEN p.finished >= v_min AND p.raised * 10000 >= p.finished * public.setting('flag_raised_bps')
             THEN public.flag_if('raised', p.raised, 1, p.finished) END,
        public.flag_if('parts', p.parts, public.setting('flag_parts_jobs')),
        public.flag_if('codes', p.codes, public.setting('flag_code_wrong')),
        public.flag_if('cancelled', p.cancelled, public.setting('flag_cancelled')),
        public.flag_if('complaints', p.complaints, public.setting('flag_problems')),
        public.flag_if('low_stars', p.low_stars, public.setting('flag_low_stars')),
        public.flag_if('same_customer', p.same_customer, public.setting('flag_same_pair')),
        public.flag_if('blocked', p.blocked, public.setting('flag_blocked'))
      ], NULL) AS flags
    FROM pro p
  ),
  cust AS (
    SELECT c.id, c.first_name AS name, public.phone_of(u.id) AS phone,
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.cancelled_by = 'customer' AND j.updated_at >= v_since) AS cancels,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.side = 'pro' AND x.kind = 'problem' AND x.created_at >= v_since) AS reports,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = c.id AND x.side = 'pro' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars
    FROM public.profiles c LEFT JOIN auth.users u ON u.id = c.id
    -- Customer mode now, or ever posted a job: a technician who books a
    -- repair is still a customer for that job, whichever mode he is in today.
    WHERE c.role = 'customer' OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.customer_id = c.id)
  ),
  cust_flags AS (
    SELECT c.*, array_remove(ARRAY[
        public.flag_if('cancels', c.cancels, public.setting('flag_customer_cancels')),
        public.flag_if('reports', c.reports, public.setting('flag_problems')),
        public.flag_if('low_stars', c.low_stars, public.setting('flag_low_stars'))
      ], NULL) AS flags
    FROM cust c
  ),
  everyone AS (
    SELECT 'pro' AS side, id, name, phone, status, flags FROM pro_flags WHERE cardinality(flags) > 0
    UNION ALL
    SELECT 'customer', id, name, phone, NULL, flags FROM cust_flags WHERE cardinality(flags) > 0
  )
  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'checked_at') IS NOT NULL, jsonb_array_length(x -> 'flags') DESC, x ->> 'name'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
        'side', e.side, 'id', e.id, 'name', e.name, 'phone', e.phone, 'status', e.status,
        'flags', to_jsonb(e.flags),
        'checked_at', (SELECT max(n.at) FROM public.flag_notes n WHERE n.subject_id = e.id AND n.checked),
        'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('note', n.note, 'checked', n.checked, 'by', n.by_name, 'at', n.at) ORDER BY n.at DESC)
                           FROM public.flag_notes n WHERE n.subject_id = e.id), '[]'::jsonb)
      ) AS x
    FROM everyone e
  ) s;

  RETURN jsonb_build_object(
    'days', public.setting('flag_days'),
    'limits', (SELECT jsonb_object_agg(s.key, s.value) FROM public.settings s WHERE s.key LIKE 'flag\_%'),
    'people', v_rows
  );
END;
$$;

/**
 * The owner's note on a flagged person. A customer is anybody with an
 * account; a technician is anybody who applied — the mode they are in today
 * does not decide which list a note belongs to.
 */
CREATE OR REPLACE FUNCTION public.admin_note_flag(p_side text, p_id uuid, p_note text, p_checked boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_side IS NULL OR p_side NOT IN ('pro', 'customer')
     OR (p_side = 'customer' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id))
     OR (p_side = 'pro' AND NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_id)) THEN
    RETURN public.refuse('There is nobody like that.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 3 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found, in a few words.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  INSERT INTO public.flag_notes (side, subject_id, note, checked, by_name)
  VALUES (p_side, p_id, v_note, coalesce(p_checked, false), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Who may call what --------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.switch_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_mode(text) TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261029000000_two_modes')
ON CONFLICT (name) DO NOTHING;

COMMIT;
