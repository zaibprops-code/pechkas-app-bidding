-- =============================================================================
-- The office answers in the app (the owner, 25 November 2026).
--
-- A customer or technician who taps Report (or "Get help with this job")
-- used to be told "the office will call you". The owner takes no calls, so
-- the office now answers in writing, inside the app:
--
--   admin_answer_problem(id, answer)
--                  the office's answer to one report, written for the person
--                  who sent it (500 letters, no CNIC). It can be corrected;
--                  the latest is shown. The person is told by a notification
--                  that says only that the office answered and the job number
--                  — never the answer itself, which stays in the app.
--   my_reports(job)
--                  the asker's own reports (one job, or all from the last 90
--                  days and any still open): what they wrote, when, whether
--                  the office has answered, and the answer. Never the
--                  office's own closing note, which is its record.
--
-- report() is the same as before; only its refusals no longer promise a
-- call. The office's internal "what was done about it" (office_note) is
-- unchanged and is still never shown to anybody outside the office.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS answered_at timestamptz;
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS answered_by_name text;
ALTER TABLE public.problems DROP CONSTRAINT IF EXISTS problems_answer_check;
ALTER TABLE public.problems ADD CONSTRAINT problems_answer_check CHECK (answer IS NULL OR length(answer) <= 500);
CREATE INDEX IF NOT EXISTS problems_from ON public.problems (from_id, created_at DESC);

-- English only (the owner's decision); `ur` holds the same words, as every
-- technician's line must have one for the older migrations to run again.
INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('office_answer.title', 700, 'The Pechkas office has answered you', 'The Pechkas office has answered you', 'both'),
  ('office_answer.body',  701, 'About {ref}. Open Help in the Pechkas app to read it.', 'About {ref}. Open Help in the Pechkas app to read it.', 'both')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;

/** The office's answer to one report, for the person who sent it. */
CREATE OR REPLACE FUNCTION public.admin_answer_problem(p_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_answer text := nullif(btrim(regexp_replace(coalesce(p_answer, ''), '[ \t]+', ' ', 'g')), '');
  v_row    public.problems%ROWTYPE;
  v_job    public.jobs%ROWTYPE;
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
  PERFORM public.log_job(v_row.job_id, 'problem_answered', jsonb_build_object('by', 'office'));
  SELECT * INTO v_job FROM public.jobs WHERE id = v_row.job_id;
  -- Only that the office answered, and the job number: the answer stays in the app.
  PERFORM public.tell(v_row.from_id, 'office_answer', v_row.job_id, '/help', public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The asker's own reports and the office's answers: one job's, or the last 90 days' and any still open. */
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
      'kind', pr.kind, 'body', CASE WHEN pr.kind = 'emergency' THEN NULL ELSE pr.body END,
      'at', pr.created_at, 'open', pr.status = 'open',
      'answer', pr.answer, 'answered_at', pr.answered_at
    ) ORDER BY pr.created_at DESC), '[]'::jsonb)
  FROM public.problems pr
  JOIN public.jobs j ON j.id = pr.job_id
  WHERE auth.uid() IS NOT NULL
    AND pr.from_id = auth.uid()
    AND (CASE WHEN p_job IS NOT NULL THEN pr.job_id = p_job
              ELSE pr.created_at > now() - interval '90 days' OR pr.status = 'open' END);
$$;

/** The office's list, now with its answers. */
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
          'job', jsonb_build_object('id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status, 'stage', j.stage,
                                    'address', j.house || ', ' || j.street || ', ' || j.sector,
                                    'job_lat', j.lat, 'job_lng', j.lng, 'finished_at', j.finished_at,
                                    'collect_paisa', j.collect_paisa),
          'customer', jsonb_build_object('name', p.first_name, 'phone', public.phone_of(u.id)),
          'pro', CASE WHEN j.pro_id IS NOT NULL THEN jsonb_build_object('name', r.full_name, 'phone', public.phone_of(ru.id)) END
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

/** Report a problem or a guarantee claim. The same rules as before; the refusals no longer promise a call. */
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
      RETURN public.refuse('It has been more than a day. Please message the Pechkas office on WhatsApp.');
    END IF;
  ELSIF p_kind = 'guarantee' THEN
    IF v_side <> 'customer' OR v_job.status <> 'done' THEN
      RETURN public.refuse('Only a finished job has a guarantee.');
    END IF;
    IF v_job.finished_at < now() - make_interval(days => public.setting('guarantee_days')::integer) THEN
      RETURN public.refuse('The guarantee lasts ' || public.setting('guarantee_days') || ' days, and this job is older. Please message the Pechkas office on WhatsApp.');
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

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_answer_problem(uuid, text), public.my_reports(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_answer_problem(uuid, text), public.my_reports(uuid) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261129000000_office_answers')
ON CONFLICT (name) DO NOTHING;

COMMIT;
