-- =============================================================================
-- Everything with the office happens inside the app (the owner, 25 November
-- 2026): no call and no WhatsApp, either way.
--
--   write_to_office(job, text)
--                  a customer or technician writes to the office, about one
--                  of their jobs or about nothing in particular. It lands on
--                  the office's Problems page with every report, and the
--                  office's phones are told (who wrote, never the words).
--   admin_write_to(job, side, user, text)
--                  the office writes first — to the customer or technician
--                  of a job, or to one person — where it used to ring them.
--                  They are told that the office wrote; the words stay in the
--                  app.
--   office_jobs()  the asker's recent jobs, for "About which job?".
--
-- A message need not be about a job, so problems.job_id may now be empty,
-- and problems.kind gains 'message' (they wrote) and 'office' (the office
-- wrote first). my_reports(), admin_problems() and admin_answer_problem()
-- follow. Every refusal that sent somebody to "call the Pechkas office" now
-- says to write to it in the app, and the office's own alerts no longer say
-- "call them": the functions below are the same as before in every other
-- word.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

ALTER TABLE public.problems ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.problems DROP CONSTRAINT IF EXISTS problems_kind_check;
ALTER TABLE public.problems ADD CONSTRAINT problems_kind_check
  CHECK (kind IN ('problem', 'guarantee', 'emergency', 'message', 'office'));

-- --- What the notifications say ---------------------------------------------------------------

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('office_message.title', 702, NULL, 'A message for the office', 'office'),
  ('office_message.body',  703, NULL, 'From {who}{about}. Open Problems in the admin panel to answer it.', 'office'),
  ('office_wrote.title',   704, 'The Pechkas office has written to you', 'The Pechkas office has written to you', 'both'),
  ('office_wrote.body',    705, 'Open the Pechkas app to read it.', 'Open the Pechkas app to read it.', 'both'),
  ('office_answer.title',  700, 'The Pechkas office has answered you', 'The Pechkas office has answered you', 'both'),
  ('office_answer.body',   701, 'Open the Pechkas app to read it.', 'Open the Pechkas app to read it.', 'both')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;

-- Nobody is sent to a call, and the office is not told to ring anybody.
UPDATE public.push_words SET en = v.en, ur = CASE WHEN public.push_words.ur IS NULL THEN NULL ELSE v.en END
FROM (VALUES
  ('arrival_unchecked_pro.body', 'Your time for this job has passed and your arrival could not be checked. At the door, tap Check my location again, or write to the Pechkas office in the app.'),
  ('no_show_pro.body',           'Your time for this job has passed. Tap I have arrived if you are there, or write to the Pechkas office in the app.'),
  ('dispute_open.body',          'You and {other} disagree about whether the work is finished. Pechkas will look at both sides'' photos and decide; you see it in the app.'),
  ('change_unanswered.body',     'The technician says the customer answered at the door, but nothing was tapped. Look at the job, then decide in Visit fees.'),
  ('code_locked.body',           'Too many wrong codes were entered. Check the job, then unlock it in the admin panel.'),
  ('emergency_mistake.body',     '{who} says the emergency button was pressed by mistake. Check it in the admin panel.'),
  ('guarantee.body',             '{customer} reports that the work has failed. Open Problems in the admin panel and answer them in the app.'),
  ('needs_you.body',             '{trade} · {sector} · {price}, waiting {minutes} minutes. Assign it in the admin panel.'),
  ('pro_problem.body',           'The technician reports a problem. Open Problems in the admin panel and answer him in the app.'),
  ('problem.body',               '{customer} reports a problem. Open Problems in the admin panel and answer them in the app.')
) AS v(key, en)
WHERE public.push_words.key = v.key;

-- --- Writing to the office ----------------------------------------------------------------------

/** Which side somebody is on for a job of theirs, or (no job) the mode they are in. */
CREATE OR REPLACE FUNCTION public.office_side(p_user uuid, p_job uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_job IS NOT NULL THEN
      (SELECT CASE WHEN j.customer_id = p_user THEN 'customer'
                   WHEN j.pro_id = p_user OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = j.id AND a.pro_id = p_user) THEN 'pro' END
       FROM public.jobs j WHERE j.id = p_job)
    ELSE (SELECT CASE WHEN p.role = 'pro' THEN 'pro' ELSE 'customer' END FROM public.profiles p WHERE p.id = p_user)
  END;
$$;

/** A customer or technician writes to the office, about one of their jobs or about nothing in particular. */
CREATE OR REPLACE FUNCTION public.write_to_office(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_side text;
  v_job  public.jobs%ROWTYPE;
  v_id   uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Sign in first.');
  END IF;
  v_side := public.office_side(auth.uid(), p_job);
  IF v_side IS NULL THEN
    RETURN public.refuse(CASE WHEN p_job IS NULL THEN 'Finish setting up your account first.' ELSE 'That is not one of your jobs.' END, 'job');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 THEN
    RETURN public.refuse('Write what you need, in a few words.', 'text');
  END IF;
  IF length(v_text) > 500 THEN
    RETURN public.refuse('Keep it to 500 letters.', 'text');
  END IF;
  IF public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'text');
  END IF;
  -- A person writes; a flood is not a conversation. The office answers each one.
  IF (SELECT count(*) FROM public.problems WHERE from_id = auth.uid() AND kind = 'message' AND created_at > now() - interval '1 day') >= 10 THEN
    RETURN public.refuse('You have written 10 times today. The office answers each message here; please wait for it.', 'text');
  END IF;

  INSERT INTO public.problems (job_id, from_id, side, kind, body)
  VALUES (p_job, auth.uid(), v_side, 'message', v_text)
  RETURNING id INTO v_id;
  v_name := CASE WHEN v_side = 'pro' THEN 'the technician ' || coalesce((SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = auth.uid()), '')
                 ELSE 'the customer ' || coalesce((SELECT p.first_name FROM public.profiles p WHERE p.id = auth.uid()), '') END;
  IF p_job IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
    PERFORM public.log_job(p_job, 'office_message', jsonb_build_object('side', v_side));
  END IF;
  -- Who wrote and the job number, never the words.
  PERFORM public.tell_office('office_message', p_job, jsonb_build_object(
    'who', btrim(v_name), 'about', CASE WHEN p_job IS NOT NULL THEN ' about ' || v_job.ref ELSE '' END));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

/** The asker's jobs of the last 60 days, newest first, for "About which job?". */
CREATE OR REPLACE FUNCTION public.office_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(x.o ORDER BY x.at DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status,
                              'trade', coalesce((SELECT t.name FROM public.trades t WHERE t.slug = j.trade), j.trade)) AS o,
           j.created_at AS at
    FROM public.jobs j
    WHERE auth.uid() IS NOT NULL
      AND (j.customer_id = auth.uid() OR j.pro_id = auth.uid())
      AND j.created_at > now() - interval '60 days'
    ORDER BY j.created_at DESC
    LIMIT 8) x;
$$;

/** The office writes first: to a job's customer or technician, or to one person. */
CREATE OR REPLACE FUNCTION public.admin_write_to(p_job uuid, p_side text, p_user uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text := nullif(btrim(regexp_replace(coalesce(p_text, ''), '[ \t]+', ' ', 'g')), '');
  v_user uuid := p_user;
  v_side text;
  v_job  public.jobs%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_job IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
    IF v_job.id IS NULL THEN
      RETURN public.refuse('That job no longer exists.');
    END IF;
    IF v_user IS NULL THEN
      v_user := CASE p_side WHEN 'customer' THEN v_job.customer_id WHEN 'pro' THEN v_job.pro_id END;
    END IF;
  END IF;
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user) THEN
    RETURN public.refuse('There is nobody to write to: the account may have been deleted.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 3 THEN
    RETURN public.refuse('Write what they will read in the app.', 'text');
  END IF;
  IF length(v_text) > 500 THEN
    RETURN public.refuse('Keep it to 500 letters.', 'text');
  END IF;
  IF public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'text');
  END IF;
  v_side := coalesce(public.office_side(v_user, p_job), public.office_side(v_user, NULL), 'customer');
  INSERT INTO public.problems (job_id, from_id, side, kind, body, answer, answered_at, answered_by_name, status, closed_at, closed_by_name, office_note)
  VALUES (p_job, v_user, v_side, 'office', NULL, v_text, now(), (SELECT name FROM public.staff WHERE id = auth.uid()),
          'closed', now(), (SELECT name FROM public.staff WHERE id = auth.uid()), 'The office wrote first.');
  IF p_job IS NOT NULL THEN
    PERFORM public.log_job(p_job, 'office_wrote', jsonb_build_object('side', v_side));
  END IF;
  -- That the office wrote, never the words: they stay in the app.
  PERFORM public.tell(v_user, 'office_wrote', p_job, '/office', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The office's answer to one report or message, for the person who sent it. */
CREATE OR REPLACE FUNCTION public.admin_answer_problem(p_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_answer text := nullif(btrim(regexp_replace(coalesce(p_answer, ''), '[ \t]+', ' ', 'g')), '');
  v_row    public.problems%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_answer IS NULL OR length(v_answer) < 3 THEN
    RETURN public.refuse('Write the answer they will read in the app.', 'answer');
  END IF;
  IF length(v_answer) > 500 THEN
    RETURN public.refuse('Keep the answer to 500 letters.', 'answer');
  END IF;
  IF public.looks_like_cnic(v_answer) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'answer');
  END IF;
  SELECT * INTO v_row FROM public.problems WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN public.refuse('That report no longer exists.');
  END IF;
  IF v_row.from_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_row.from_id) THEN
    RETURN public.refuse('The person who sent this has deleted their account, so nobody can read an answer.');
  END IF;
  UPDATE public.problems
  SET answer = v_answer, answered_at = now(),
      answered_by_name = (SELECT name FROM public.staff WHERE id = auth.uid())
  WHERE id = p_id;
  IF v_row.job_id IS NOT NULL THEN
    PERFORM public.log_job(v_row.job_id, 'problem_answered', jsonb_build_object('by', 'office'));
  END IF;
  -- Only that the office answered: the answer stays in the app.
  PERFORM public.tell(v_row.from_id, 'office_answer', v_row.job_id, '/office', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The asker's reports and messages, and the office's answers: one job's, or the last 90 days' and any still open. */
CREATE OR REPLACE FUNCTION public.my_reports(p_job uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'job_id', pr.job_id, 'ref', j.ref,
      'trade', coalesce((SELECT t.name FROM public.trades t WHERE t.slug = j.trade), j.trade),
      'kind', pr.kind, 'body', CASE WHEN pr.kind IN ('emergency', 'office') THEN NULL ELSE pr.body END,
      'at', pr.created_at, 'open', pr.status = 'open',
      'answer', pr.answer, 'answered_at', pr.answered_at
    ) ORDER BY coalesce(pr.answered_at, pr.created_at) DESC), '[]'::jsonb)
  FROM public.problems pr
  LEFT JOIN public.jobs j ON j.id = pr.job_id
  WHERE auth.uid() IS NOT NULL
    AND pr.from_id = auth.uid()
    AND (CASE WHEN p_job IS NOT NULL THEN pr.job_id = p_job
              ELSE pr.created_at > now() - interval '90 days' OR pr.status = 'open' END);
$$;

/** The office's list: reports, messages and what it wrote, with the person even when there is no job. */
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
          'answer', pr.answer, 'answered_at', pr.answered_at, 'answered_by', pr.answered_by_name,
          'can_answer', pr.from_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users fu WHERE fu.id = pr.from_id),
          'urgent', pr.kind = 'emergency' AND NOT pr.mistake AND pr.status = 'open',
          'person', jsonb_build_object(
            'name', CASE WHEN pr.side = 'pro' THEN (SELECT r2.full_name FROM public.pros r2 WHERE r2.id = pr.from_id)
                         ELSE (SELECT p2.first_name FROM public.profiles p2 WHERE p2.id = pr.from_id) END),
          'job', CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status, 'stage', j.stage,
                                    'address', j.house || ', ' || j.street || ', ' || j.sector,
                                    'job_lat', j.lat, 'job_lng', j.lng, 'finished_at', j.finished_at,
                                    'collect_paisa', j.collect_paisa) END,
          'customer', CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('name', p.first_name) END,
          'pro', CASE WHEN j.pro_id IS NOT NULL THEN jsonb_build_object('name', r.full_name) END
        ) AS x
      FROM public.problems pr
      LEFT JOIN public.jobs j ON j.id = pr.job_id
      LEFT JOIN public.profiles p ON p.id = j.customer_id
      LEFT JOIN public.pros r ON r.id = j.pro_id
      WHERE pr.status = coalesce(p_status, 'open')
      ORDER BY pr.created_at DESC LIMIT 200) s), '[]'::jsonb) END;
$$;

-- admin_raise_cap: the same as before, only its words no longer send anybody to a call or WhatsApp.
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
    RETURN public.refuse('That is more than three times the first limit (' || public.rs(v_first) || '). Check the figure; for more, write to the customer in the app first.', 'cap');
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

-- admin_set_pause: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.admin_set_pause(p_paused boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old  boolean;
  v_note text := btrim(coalesce(p_note, ''));
  v_by   text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_paused IS NULL THEN
    RETURN public.refuse('Say whether the app is paused.');
  END IF;
  IF length(v_note) > 300 THEN
    RETURN public.refuse('Keep the note to 300 letters: one or two sentences.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  -- The same rule as an offer's note (make_offer).
  IF v_note ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Leave phone numbers out: people write to the office in the app.', 'note');
  END IF;
  SELECT paused INTO v_old FROM public.app_control WHERE id FOR UPDATE;
  v_by := (SELECT name FROM public.staff WHERE id = auth.uid());
  UPDATE public.app_control
  SET paused = p_paused, pause_note = v_note, changed_at = now(), changed_by = v_by
  WHERE id;
  IF v_old IS DISTINCT FROM p_paused THEN
    INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
    VALUES ('app:paused', CASE WHEN v_old THEN 1 ELSE 0 END, CASE WHEN p_paused THEN 1 ELSE 0 END, auth.uid(), v_by);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- apply_as_pro: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.apply_as_pro(
  p_full_name text,
  p_trades    text[],
  p_years     integer,
  p_sectors   text[],
  p_about     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_name   text := btrim(coalesce(p_full_name, ''));
  v_about  text := nullif(btrim(coalesce(p_about, '')), '');
  v_trades text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_trades, '{}')));
  v_secs   text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_sectors, '{}')));
  v_status text;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_me) THEN
    RETURN public.refuse('Start by telling us your first name.', 'first_name');
  END IF;

  IF length(v_name) < 3 OR length(v_name) > 80 THEN
    RETURN public.refuse('Please write your full name, as on your ID card.', 'full_name');
  END IF;
  IF cardinality(v_trades) = 0 THEN
    RETURN public.refuse('Choose at least one kind of work.', 'trades');
  END IF;
  IF cardinality(v_trades) > 6 THEN
    RETURN public.refuse('Choose the six you are best at.', 'trades');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_trades) t WHERE t NOT IN (SELECT slug FROM public.trades)) THEN
    RETURN public.refuse('One of those kinds of work is not on our list.', 'trades');
  END IF;
  IF p_years IS NULL OR p_years < 0 OR p_years > 60 THEN
    RETURN public.refuse('How many years have you done this work?', 'years');
  END IF;
  IF cardinality(v_secs) = 0 THEN
    RETURN public.refuse('Choose at least one area you can reach.', 'sectors');
  END IF;
  IF cardinality(v_secs) > 20 THEN
    RETURN public.refuse('Choose up to twenty areas.', 'sectors');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_secs) s WHERE s NOT IN (SELECT name FROM public.sectors)) THEN
    RETURN public.refuse('One of those areas is not on our list.', 'sectors');
  END IF;
  IF length(coalesce(v_about, '')) > 300 THEN
    RETURN public.refuse('Please keep this under 300 letters.', 'about');
  END IF;
  IF public.looks_like_cnic(v_name) OR public.looks_like_cnic(v_about) THEN
    RETURN public.refuse('Please do not write your CNIC number here. We check it in person.', 'about');
  END IF;

  SELECT status INTO v_status FROM public.pros WHERE id = v_me;

  IF v_status IN ('approved', 'suspended') THEN
    RETURN public.refuse('Your details are with Pechkas. Write to the office in the app to change them.');
  END IF;

  UPDATE public.profiles SET role = 'pro', updated_at = now() WHERE id = v_me;

  INSERT INTO public.pros AS r (id, full_name, trades, years, sectors, about)
  VALUES (v_me, v_name, v_trades, p_years, v_secs, v_about)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    trades = EXCLUDED.trades,
    years = EXCLUDED.years,
    sectors = EXCLUDED.sectors,
    about = EXCLUDED.about,
    -- Applying again after being turned down puts him back in the queue.
    status = 'applied',
    status_reason = NULL,
    decided_at = NULL,
    decided_by = NULL,
    applied_at = CASE WHEN r.status = 'rejected' THEN now() ELSE r.applied_at END,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'status', 'applied');
END;
$$;

-- block_pro: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.block_pro(p_job uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  IF v_job.id IS NULL OR v_job.pro_id IS NULL THEN
    RETURN public.refuse('There is no technician on this job to block.');
  END IF;
  IF v_job.status NOT IN ('done', 'stopped', 'cancelled') THEN
    RETURN public.refuse('While the job is on, report a problem or write to the Pechkas office in the app instead.');
  END IF;
  IF length(coalesce(v_reason, '')) > 300 OR public.looks_like_cnic(v_reason)
     OR coalesce(v_reason, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Keep it short, and no phone or CNIC numbers.', 'reason');
  END IF;
  INSERT INTO public.blocks (customer_id, pro_id, from_job, reason)
  VALUES (auth.uid(), v_job.pro_id, p_job, v_reason)
  ON CONFLICT (customer_id, pro_id) DO NOTHING;
  UPDATE public.offers o SET status = 'withdrawn', updated_at = now()
  FROM public.jobs j
  WHERE o.job_id = j.id AND j.customer_id = auth.uid() AND o.pro_id = v_job.pro_id AND o.status = 'pending';
  DELETE FROM public.asked_for WHERE customer_id = auth.uid() AND pro_id = v_job.pro_id;
  PERFORM public.log_job(p_job, 'blocked');
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- cancel_job: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.cancel_job(p_job uuid, p_reason text DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_job.status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('This job is already closed.');
  END IF;
  -- At the door she may still say no; once she has let him start, it is the office's.
  IF v_job.status = 'assigned' AND v_job.stage NOT IN ('chosen', 'on_way', 'arrived') THEN
    RETURN public.refuse('He has already started. Please write to the Pechkas office in the app to stop the job now.');
  END IF;
  IF p_code IS NOT NULL AND p_code NOT IN ('fixed_myself', 'someone_else', 'plans_changed', 'pro_late', 'better_price', 'not_needed', 'other') THEN
    RETURN public.refuse('Choose a reason from the list.', 'reason');
  END IF;
  IF length(coalesce(v_reason, '')) > 200 OR public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Please keep the reason short.', 'reason');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'customer', cancel_reason = v_reason, cancel_code = p_code, updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true,
    'category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = p_job));
END;
$$;

-- customer_dispute_not_home: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.customer_dispute_not_home(p_job uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rep  public.not_home_reports%ROWTYPE;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT r.* INTO v_rep FROM public.not_home_reports r
  WHERE r.job_id = p_job AND r.customer_id = auth.uid()
    AND r.pro_id = (SELECT j.pro_id FROM public.jobs j WHERE j.id = p_job) FOR UPDATE;
  IF v_rep.id IS NULL THEN
    RETURN public.refuse('There is no such report.');
  END IF;
  IF v_rep.status <> 'submitted' OR v_rep.reason <> 'nobody_home' THEN
    RETURN public.refuse('This has already gone to the Pechkas office.');
  END IF;
  IF v_rep.submitted_at <= now() - interval '24 hours' THEN
    RETURN public.refuse('More than 24 hours have passed. Please write to the Pechkas office in the app.');
  END IF;
  IF v_text IS NULL OR length(v_text) < 5 OR length(v_text) > 300 OR public.looks_like_cnic(v_text) THEN
    RETURN public.refuse('Say what happened, in a sentence.', 'text');
  END IF;
  UPDATE public.not_home_reports
  SET status = 'disputed', status_before = 'submitted', customer_text = v_text, customer_said_at = now()
  WHERE id = v_rep.id;
  PERFORM public.log_job(p_job, 'not_home_disputed');
  PERFORM public.tell_office('not_home_disputed', p_job, (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = p_job));
  PERFORM public.tell(v_rep.pro_id, 'not_home_disputed_pro', p_job, '/pro/money', (SELECT public.job_vars(j) FROM public.jobs j WHERE j.id = p_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- customer_find_another: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.customer_find_another(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_start timestamptz;
  v_kind  text;
  v_pro   uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF NOT public.can_find_another(v_job) THEN
    RETURN public.refuse(CASE WHEN v_job.status = 'open' THEN 'This job is already open to other technicians.'
                              ELSE 'Your technician has arrived. Please write to the Pechkas office in the app.' END);
  END IF;
  v_pro := v_job.pro_id;
  v_start := public.window_start(v_job.when_date, v_job.when_from);
  -- What it counts as, exactly as her cancelling now would: his lateness (pro_late, no_show) is
  -- his; a late switch with no fault of his ('late') counts as her late cancellation unless he
  -- had said he was running late. Nothing against him before he is 30 minutes late.
  v_kind := public.cancel_kind(now(), v_start, v_job.on_way_at, public.arrival_at(v_job),
                               CASE WHEN v_job.stage = 'arrived' THEN 'on_way' ELSE v_job.stage END, true);
  IF v_kind IN ('pro_late', 'no_show') THEN
    INSERT INTO public.pro_incidents (job_id, pro_id, kind, status, window_start, minutes_late, how)
    VALUES (p_job, v_pro, CASE WHEN v_kind = 'no_show' THEN 'no_show' ELSE 'late_arrival' END,
            CASE WHEN v_kind = 'no_show' THEN 'potential' ELSE 'recorded' END, v_start,
            floor(extract(epoch FROM (now() - v_start)) / 60)::integer, 'replaced_waiting')
    ON CONFLICT (job_id, pro_id) DO NOTHING;
  END IF;
  PERFORM public.log_job(p_job, 'replaced', jsonb_build_object('kind', v_kind));
  v_job := public.reopen_job(p_job, 'replaced', NULL,
    CASE WHEN v_kind = 'late' AND v_job.eta_at IS NOT NULL THEN 'excused' ELSE v_kind END);
  PERFORM public.tell(v_pro, 'replaced_pro', p_job, '/pro', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true, 'day', v_job.when_date, 'kind', v_kind);
END;
$$;

-- customer_visit_fee: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.customer_visit_fee(p_job uuid, p_kind text, p_text text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee  public.visit_fees;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE job_id = p_job AND customer_id = auth.uid() FOR UPDATE;
  IF v_fee.id IS NULL OR v_fee.payer <> 'customer' THEN
    RETURN public.refuse('There is no visit fee for you on this job.');
  END IF;
  IF v_text IS NOT NULL AND (length(v_text) > 300 OR public.looks_like_cnic(v_text)) THEN
    RETURN public.refuse('Please keep it short.', 'text');
  END IF;
  IF p_kind = 'disagree' THEN
    IF v_fee.customer_said_at IS NOT NULL THEN
      RETURN public.refuse('You have already told us. The office will decide.');
    END IF;
    IF v_fee.status NOT IN ('due', 'paid', 'unpaid') OR v_fee.created_at <= now() - interval '24 hours' THEN
      RETURN public.refuse('This fee can no longer be questioned here. Write to the Pechkas office in the app.');
    END IF;
    IF v_text IS NULL OR length(v_text) < 5 THEN
      RETURN public.refuse('Tell us why, in a few words.', 'text');
    END IF;
  ELSIF p_kind = 'paid' THEN
    IF v_fee.status <> 'unpaid' THEN
      RETURN public.refuse('Nothing to answer here.');
    END IF;
  ELSE
    RETURN public.refuse('Choose what to tell us.');
  END IF;
  UPDATE public.visit_fees
  SET status = 'disputed', status_before = v_fee.status, customer_said = p_kind, customer_text = v_text, customer_said_at = now()
  WHERE id = v_fee.id RETURNING * INTO v_fee;
  PERFORM public.log_job(p_job, 'visit_fee_disputed', jsonb_build_object('kind', p_kind));
  PERFORM public.tell_office('fee_disputed_office', p_job, public.fee_vars(v_fee));
  PERFORM public.tell(v_fee.pro_id, 'fee_disputed_pro', p_job, '/pro', public.fee_vars(v_fee));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- no_post_while_fee_unpaid: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.no_post_while_fee_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
  v_owe bigint;
BEGIN
  IF NEW.paid_by_pechkas OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT j.ref INTO v_ref FROM public.visit_fees v JOIN public.jobs j ON j.id = v.job_id
  WHERE v.customer_id = NEW.customer_id AND v.cleared_at IS NULL
    AND (v.status = 'unpaid' OR (v.status = 'covered' AND v.covered_unpaid))
  LIMIT 1;
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'The visit fee on job % is still unpaid. Pay the technician, or open that job and tap "I have paid him", then post again.', v_ref;
  END IF;
  -- D35: only once she agreed, or the office decided, that she owes the rest. Never while disputed or unanswered.
  SELECT j.ref, c.agreed_paisa - greatest(c.received_paisa, c.reported_paisa) INTO v_ref, v_owe
  FROM public.payment_cases c JOIN public.jobs j ON j.id = c.job_id
  WHERE c.customer_id = NEW.customer_id AND c.status = 'owed' AND c.cleared_at IS NULL
  ORDER BY c.owed_at
  LIMIT 1;
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'You still owe the technician % for job %. Pay him and he will tell Pechkas, or write to the Pechkas office in the app, then post again.', public.rs(v_owe), v_ref;
  END IF;
  RETURN NEW;
END;
$$;

-- post_job: the same as before, only its words no longer send anybody to a call or WhatsApp.
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
  IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector AND live) THEN
    RETURN public.refuse('Pechkas does not work in ' || p_sector || ' yet, so nobody could honestly be promised.', 'sector');
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

-- pro_report_unpaid: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.pro_report_unpaid(p_job uuid, p_received_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_txn uuid;
  v_case public.payment_cases;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'done' OR v_job.paid_by_pechkas THEN
    RETURN public.refuse('You can report this only on a finished job the customer pays for.');
  END IF;
  IF v_job.finished_at < now() - make_interval(days => public.setting('unpaid_report_days')::integer) THEN
    RETURN public.refuse('The ' || public.setting('unpaid_report_days') || ' days to report this have passed. Write to the Pechkas office in the app.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cases WHERE job_id = p_job) THEN
    RETURN public.refuse('You have already reported this job. Its card shows where it has got to.');
  END IF;
  IF p_received_paisa IS NULL OR p_received_paisa < 0 OR p_received_paisa % 100 <> 0 OR p_received_paisa >= v_job.agreed_paisa THEN
    RETURN public.refuse('Write what you received in whole rupees, less than ' || public.rs(v_job.agreed_paisa) || '.', 'amount');
  END IF;
  PERFORM public.pay_lock(auth.uid());
  INSERT INTO public.payment_cases (job_id, pro_id, customer_id, agreed_paisa, parts_paisa, commission_bps, reserve_bps,
                                    reported_paisa, received_paisa, status, answer_due)
  VALUES (p_job, auth.uid(), v_job.customer_id, v_job.agreed_paisa, coalesce(v_job.parts_paisa, 0),
          coalesce(v_job.commission_bps, public.setting('commission_bps')::integer), public.setting('reserve_bps')::integer,
          p_received_paisa, 0, 'asked', now() + make_interval(days => public.setting('unpaid_answer_days')::integer))
  RETURNING * INTO v_case;
  -- Held: the commission posting reversed line for line, reserve included. Nothing to hold if there was none.
  SELECT t.id INTO v_txn FROM public.ledger_txns t
  WHERE t.idempotency_key = 'commission:' || p_job AND NOT EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = t.id);
  IF v_txn IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('account', e.account, 'pro_id', e.pro_id, 'amount', -e.amount_paisa))
    INTO v_lines FROM public.ledger_entries e WHERE e.txn_id = v_txn;
    v_txn := public.post_txn('reverse:' || v_txn, 'reversal', p_job, auth.uid(), v_lines, NULL, NULL,
                             'Held: the customer has not paid in full', v_txn);
    UPDATE public.payment_cases SET held_txn = v_txn WHERE id = v_case.id;
  END IF;
  PERFORM public.claims_to_office(p_job);
  PERFORM public.log_job(p_job, 'payment_reported', jsonb_build_object('received', p_received_paisa));
  PERFORM public.tell(v_job.customer_id, 'payment_question', p_job, '/jobs', public.payment_vars(v_case));
  RETURN jsonb_build_object('ok', true, 'id', v_case.id);
END;
$$;

-- pro_visit_fee: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.pro_visit_fee(p_job uuid, p_paid boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee public.visit_fees;
BEGIN
  SELECT * INTO v_fee FROM public.visit_fees WHERE job_id = p_job AND pro_id = auth.uid() FOR UPDATE;
  IF v_fee.id IS NULL OR v_fee.payer <> 'customer' THEN
    RETURN public.refuse('There is no visit fee for you to collect on this job.');
  END IF;
  IF p_paid IS NULL THEN
    RETURN public.refuse('Say whether you were paid.');
  END IF;
  -- The same answer twice changes nothing.
  IF (p_paid AND v_fee.status = 'paid') OR (NOT p_paid AND v_fee.status = 'unpaid') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF p_paid THEN
    IF NOT (v_fee.status IN ('due', 'unpaid') OR (v_fee.status = 'disputed' AND v_fee.customer_said = 'paid')) THEN
      RETURN public.refuse('The office is looking at this fee. It will tell you what it decides.');
    END IF;
    UPDATE public.visit_fees SET status = 'paid', paid_at = now(), status_before = NULL WHERE id = v_fee.id;
    PERFORM public.log_job(p_job, 'visit_fee_paid', jsonb_build_object('by', 'pro'));
  ELSE
    IF v_fee.status <> 'due' THEN
      RETURN public.refuse(CASE WHEN v_fee.status = 'paid' THEN 'You said you were paid. If that was a mistake, write to the Pechkas office in the app.'
                                ELSE 'The office is looking at this fee. It will tell you what it decides.' END);
    END IF;
    UPDATE public.visit_fees SET status = 'unpaid', unpaid_at = now() WHERE id = v_fee.id RETURNING * INTO v_fee;
    PERFORM public.log_job(p_job, 'visit_fee_unpaid', jsonb_build_object('by', 'pro'));
    PERFORM public.tell(v_fee.customer_id, 'fee_unpaid', p_job, '/jobs', public.fee_vars(v_fee));
    PERFORM public.tell_office('fee_unpaid_office', p_job, public.fee_vars(v_fee));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- pro_withdraw: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.pro_withdraw(p_job uuid, p_reason text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.jobs;
  v_kind text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_pro  uuid;
  v_vars jsonb;
  v_day  date;
BEGIN
  -- His, assigned and locked: if she cancelled first, this finds nothing.
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  v_kind := public.withdraw_kind(v_job);
  IF v_kind IS NULL THEN
    RETURN public.refuse('You have already arrived. Please write to the Pechkas office in the app.', 'stage');
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('emergency', 'vehicle', 'other_job', 'cannot_reach', 'unwell', 'other') THEN
    RETURN public.refuse('Choose the reason.', 'reason');
  END IF;
  IF p_reason = 'other' AND length(coalesce(v_note, '')) < 5 THEN
    RETURN public.refuse('Say why, in a few words.', 'note');
  END IF;
  IF length(coalesce(v_note, '')) > 200 OR public.looks_like_cnic(v_note)
     OR regexp_replace(coalesce(v_note, ''), '[^0-9]', '', 'g') ~ '[0-9]{7}' THEN
    RETURN public.refuse('Keep it short, with no phone numbers.', 'note');
  END IF;
  v_pro := v_job.pro_id;
  v_vars := public.job_vars(v_job) || jsonb_build_object('pro', (SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = v_pro));
  INSERT INTO public.pro_withdrawals (job_id, pro_id, window_start, stage, kind, reason, note)
  VALUES (p_job, v_pro, public.window_start(v_job.when_date, v_job.when_from), v_job.stage, v_kind, p_reason, v_note)
  ON CONFLICT (job_id, pro_id) DO NOTHING;
  PERFORM public.log_job(p_job, 'withdrawn', jsonb_build_object('kind', v_kind, 'reason', p_reason));
  v_day := v_job.when_date;
  v_job := public.reopen_job(p_job, CASE WHEN v_kind = 'late' THEN 'late_withdrawal' ELSE 'withdrawn' END, v_note);
  PERFORM public.tell(v_job.customer_id, 'pro_withdrew', p_job, '/jobs', v_vars,
                      CASE WHEN v_job.when_date IS DISTINCT FROM v_day THEN 'pro_withdrew.moved' END);
  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'day', v_job.when_date);
END;
$$;

-- raise_price: the same as before, only its words no longer send anybody to a call or WhatsApp.
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
    RETURN public.refuse('For work this size, write to the Pechkas office in the app first.', 'raise');
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

-- report: the same as before, only its words no longer send anybody to a call or WhatsApp.
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
      RETURN public.refuse('It has been more than a day. Please write to the Pechkas office in the app.');
    END IF;
  ELSIF p_kind = 'guarantee' THEN
    IF v_side <> 'customer' OR v_job.status <> 'done' THEN
      RETURN public.refuse('Only a finished job has a guarantee.');
    END IF;
    IF v_job.finished_at < now() - make_interval(days => public.setting('guarantee_days')::integer) THEN
      RETURN public.refuse('The guarantee lasts ' || public.setting('guarantee_days') || ' days, and this job is older. Please write to the Pechkas office in the app.');
    END IF;
  ELSE
    RETURN public.refuse('Unknown kind of report.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.problems WHERE job_id = p_job AND from_id = auth.uid() AND kind = p_kind AND status = 'open') THEN
    RETURN public.refuse('You have already told us. The office answers you here in the app.');
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

-- start_work: the same as before, only its words no longer send anybody to a call or WhatsApp.
CREATE OR REPLACE FUNCTION public.start_work(p_job uuid, p_code text, p_photos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_problem text;
  v_tries   integer;
BEGIN
  v_job := public.my_assigned_job(p_job);
  IF v_job.id IS NULL THEN
    RETURN public.refuse('This job is no longer yours.');
  END IF;
  IF v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('Tap Arrived first.', 'stage');
  END IF;
  -- D37: she confirms the photo before the work starts; a checked job waits for its checker.
  IF EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = v_job.pro_id) AND v_job.face_confirmed_at IS NULL THEN
    RETURN public.refuse('Ask the customer to confirm your photo in her app first.', 'face');
  END IF;
  IF EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.job_id = p_job AND k.status = 'asked') THEN
    RETURN public.refuse('Wait until your checker has said yes. The app is asking.', 'checker');
  END IF;
  IF v_job.code_locked_at IS NOT NULL THEN
    RETURN public.refuse('Too many wrong codes. The Pechkas office has been told and will unlock it.', 'code');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;

  IF p_code IS NULL OR btrim(p_code) <> v_job.start_code THEN
    v_tries := v_job.code_tries + 1;
    UPDATE public.jobs SET code_tries = v_tries,
           code_locked_at = CASE WHEN v_tries >= public.setting('code_tries') THEN now() END
    WHERE id = p_job;
    PERFORM public.log_job(p_job, 'code_wrong', jsonb_build_object('try', v_tries));
    IF v_tries >= public.setting('code_tries') THEN
      PERFORM public.log_job(p_job, 'code_locked');
      PERFORM public.tell_office('code_locked', p_job, public.job_vars(v_job));
      RETURN public.refuse('Too many wrong codes. The Pechkas office has been told and will unlock it.', 'code');
    END IF;
    RETURN public.refuse('That is not the code. Ask the customer to read it from the app.', 'code');
  END IF;

  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'before', x FROM jsonb_array_elements_text(p_photos) AS x;
  UPDATE public.jobs SET stage = 'working', started_at = now(), updated_at = now() WHERE id = p_job;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- switch_mode: the same as before, only its words no longer send anybody to a call or WhatsApp.
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
        'You are on job %s. Finish it first, or write to the office in the app if you cannot.', v_ref), 'job');
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

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.office_side(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_to_office(uuid, text), public.office_jobs(), public.admin_write_to(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_to_office(uuid, text), public.office_jobs(), public.admin_write_to(uuid, text, uuid, text)
  TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261130000000_in_the_app')
ON CONFLICT (name) DO NOTHING;

COMMIT;
