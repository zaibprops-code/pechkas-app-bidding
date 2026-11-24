-- =============================================================================
-- A finished job's own page (the owner, 25 November 2026).
--
-- Tapping a job in My jobs, Past opens one clean page: what she paid, the
-- guarantee, who came, and — behind "See every step" — what happened, to the
-- minute. my_jobs() already says most of it. This file adds the rest:
--
--   my_job_story(job)   her own job only. The steps, from the job's record
--                       (job_events), each a fixed kind the screen puts into
--                       words — never the office's notes, never his refusal
--                       reason, never a coordinate; when he arrived, started
--                       and finished, and how long the work took; the new
--                       prices he asked for and what became of them; the
--                       words she gave with her stars; how a cancellation
--                       was recorded; the job a free repair was for, and the
--                       repair a claim led to; and his note to her.
--   pro_set_note(job, note)
--                       the technician's optional note for the customer —
--                       "clean the filters every three months" — written as
--                       he finishes, or within a day of the job ending. No
--                       phone number, no CNIC, 300 letters at most; empty
--                       takes it away. She reads it on the job's page; it is
--                       never in a notification.
--
-- Both are refusals that return { ok, why, field }, like every other.
-- Safe to run twice.
-- =============================================================================

BEGIN;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pro_note text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pro_note_at timestamptz;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_pro_note_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_pro_note_check CHECK (pro_note IS NULL OR length(pro_note) <= 300);

/**
 * His note for the customer. Only on his own job, while he is finishing it
 * (working, checking, or with the office) or within a day of it ending.
 */
CREATE OR REPLACE FUNCTION public.pro_set_note(p_job uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_job  public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs j WHERE j.id = p_job AND j.pro_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL
     OR NOT ((v_job.status = 'assigned' AND v_job.stage IN ('working', 'checking', 'disputed'))
             OR (v_job.status IN ('done', 'stopped') AND v_job.finished_at > now() - interval '24 hours')) THEN
    RETURN public.refuse('A note can be left only while you finish a job, or within a day of it ending.', 'note');
  END IF;
  IF length(coalesce(v_note, '')) > 300 THEN
    RETURN public.refuse('Keep the note to 300 letters.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  IF coalesce(v_note, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Do not write a phone number. The customer reaches you through Pechkas.', 'note');
  END IF;
  IF v_note IS NOT DISTINCT FROM v_job.pro_note THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  UPDATE public.jobs SET pro_note = v_note, pro_note_at = CASE WHEN v_note IS NULL THEN NULL ELSE now() END WHERE id = p_job;
  PERFORM public.log_job(p_job, 'pro_note', jsonb_build_object('text', v_note));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Everything her finished job's page shows that my_jobs() does not. Her own job only. */
CREATE OR REPLACE FUNCTION public.my_job_story(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    -- What happened, oldest first. Only these kinds, and only these fields:
    -- the screen turns each into words. Office notes and his reasons stay out.
    'steps', coalesce((
      SELECT jsonb_agg(x.item ORDER BY x.at, x.id) FROM (
        SELECT e.id, e.at, jsonb_strip_nulls(jsonb_build_object(
          'what', e.what,
          'at', e.at,
          'by', CASE WHEN e.detail->>'by' = 'office' THEN 'office' ELSE e.actor END,
          'name', CASE WHEN e.what = 'assigned'
                       THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = (e.detail->>'pro_id')::uuid) END,
          'paisa', CASE e.what
                     WHEN 'posted' THEN (e.detail->>'offered_paisa')::bigint
                     WHEN 'assigned' THEN (e.detail->>'agreed_paisa')::bigint
                     WHEN 'change_asked' THEN (e.detail->>'price_paisa')::bigint
                     WHEN 'change_approved' THEN (e.detail->>'price_paisa')::bigint
                     WHEN 'change_declined' THEN (e.detail->>'price_paisa')::bigint
                     WHEN 'price_raised' THEN (e.detail->>'to')::bigint
                   END,
          'text', CASE e.what
                    WHEN 'change_asked' THEN e.detail->>'reason'
                    WHEN 'not_finished' THEN public.check_reason_text(e.detail->>'reason')
                  END,
          'kind', CASE e.what
                    WHEN 'reopened' THEN e.detail->>'ended'
                    WHEN 'confirmed' THEN e.detail->>'by'
                    WHEN 'dispute_decided' THEN e.detail->>'outcome'
                    WHEN 'claim_closed' THEN e.detail->>'by'
                    WHEN 'claim_decided' THEN CASE WHEN (e.detail->>'covered')::boolean THEN 'covered' ELSE 'not_covered' END
                    WHEN 'cancelled' THEN j.cancelled_by
                  END,
          'day', CASE e.what WHEN 'day_changed' THEN e.detail->>'to' WHEN 'claim_coming' THEN e.detail->>'date' END,
          'eta', CASE WHEN e.what = 'running_late' THEN e.detail->>'eta' END
        )) AS item
        FROM public.job_events e
        WHERE e.job_id = j.id
          AND e.what IN ('posted', 'price_raised', 'day_changed', 'assigned', 'on_way', 'running_late', 'arrived',
                         'working', 'change_asked', 'change_approved', 'change_declined', 'change_withdrawn',
                         'checking', 'not_finished', 'disputed', 'dispute_decided', 'confirmed', 'done', 'stopped',
                         'cancelled', 'reopened', 'guarantee', 'claim_coming', 'claim_fixed', 'claim_still_broken',
                         'claim_refused', 'claim_no_answer', 'claim_missed_visit', 'claim_decided', 'claim_closed',
                         'replacement_booked')
      ) x), '[]'::jsonb),
    'posted_at', j.created_at,
    'chosen_at', j.assigned_at,
    'arrived_at', public.arrival_at(j),
    'started_at', j.started_at,
    'said_done_at', (SELECT max(e.at) FROM public.job_events e WHERE e.job_id = j.id AND e.what = 'checking'),
    'finished_at', j.finished_at,
    -- From the start code to "work finished": the work itself, not the waiting.
    'took_minutes', CASE WHEN j.status IN ('done', 'stopped') AND j.started_at IS NOT NULL THEN
                      greatest(0, floor(extract(epoch FROM coalesce(
                        (SELECT max(e.at) FROM public.job_events e WHERE e.job_id = j.id AND e.what = 'checking'),
                        j.finished_at) - j.started_at) / 60))::integer END,
    'first_paisa', coalesce((SELECT (e.detail->>'offered_paisa')::bigint FROM public.job_events e
                             WHERE e.job_id = j.id AND e.what = 'posted' ORDER BY e.at LIMIT 1), j.offered_paisa),
    -- The price agreed when she chose him, before any new price.
    'chosen_paisa', (SELECT (e.detail->>'agreed_paisa')::bigint FROM public.job_events e
                     WHERE e.job_id = j.id AND e.what = 'assigned' ORDER BY e.at DESC LIMIT 1),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('from_paisa', c.from_paisa, 'price_paisa', c.price_paisa,
                                                             'reason', c.reason, 'status', c.status,
                                                             'asked_at', c.created_at, 'decided_at', c.decided_at,
                                                             'by', (SELECT CASE WHEN e.detail->>'by' = 'office' THEN 'office' ELSE e.actor END
                                                                    FROM public.job_events e
                                                                    WHERE e.job_id = j.id AND e.what IN ('change_approved', 'change_declined')
                                                                      AND (e.detail->>'price_paisa')::bigint = c.price_paisa
                                                                      AND e.at >= c.created_at ORDER BY e.at LIMIT 1))
                                          ORDER BY c.created_at)
                         FROM public.job_changes c WHERE c.job_id = j.id AND c.pro_id = j.pro_id), '[]'::jsonb),
    'my_words', (SELECT g.words FROM public.ratings g WHERE g.job_id = j.id AND g.side = 'customer'),
    'offers', (SELECT count(*) FROM public.offers o WHERE o.job_id = j.id),
    'cancel', (SELECT jsonb_build_object('by', c.cancelled_by, 'category', c.category, 'at', c.cancelled_at,
                                         -- Her own words, or the office's reason she was already shown.
                                         'reason', c.reason_text)
               FROM public.cancellations c WHERE c.job_id = j.id),
    -- The man who came has deleted his account: the page says so rather than naming nobody.
    'pro_left', j.status IN ('done', 'stopped') AND j.pro_id IS NULL,
    'pro_note', CASE WHEN j.status IN ('done', 'stopped') THEN j.pro_note END,
    'pro_note_at', CASE WHEN j.status IN ('done', 'stopped') THEN j.pro_note_at END,
    -- Messages stay readable a day after the job (chat_side), then they are the office's record.
    'chat_until', CASE WHEN j.status IN ('done', 'stopped') AND j.pro_id IS NOT NULL THEN j.finished_at + interval '24 hours' END,
    -- A free repair: the job it put right.
    'original', (SELECT jsonb_build_object('id', o.id, 'ref', o.ref, 'finished_at', o.finished_at)
                 FROM public.guarantee_claims c JOIN public.jobs o ON o.id = c.job_id
                 WHERE c.id = j.guarantee_of AND o.customer_id = j.customer_id),
    -- Her claim on this job led to a repair by somebody else.
    'replacement', (SELECT jsonb_build_object('id', r.id, 'ref', r.ref, 'status', r.status, 'finished_at', r.finished_at,
                                              'pro', CASE WHEN r.status IN ('assigned', 'done', 'stopped')
                                                          THEN (SELECT split_part(p.full_name, ' ', 1) FROM public.pros p WHERE p.id = r.pro_id) END)
                    FROM public.guarantee_claims c JOIN public.jobs r ON r.id = c.replacement_job_id
                    WHERE c.job_id = j.id AND r.customer_id = j.customer_id
                    ORDER BY c.created_at DESC LIMIT 1),
    'claim_why', (SELECT c.why_replacing FROM public.guarantee_claims c WHERE c.job_id = j.id ORDER BY c.created_at DESC LIMIT 1)
  )
  FROM public.jobs j
  WHERE j.id = p_job AND j.customer_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pro_set_note(uuid, text), public.my_job_story(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_set_note(uuid, text), public.my_job_story(uuid) TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261126000000_job_story')
ON CONFLICT (name) DO NOTHING;

COMMIT;
