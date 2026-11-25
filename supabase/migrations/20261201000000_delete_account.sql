-- =============================================================================
-- Deleting an account, redesigned (the owner, 25 November 2026).
--
-- The app's Delete account page shows the person's own numbers — what goes
-- at once — and deleting waits while a job is on (the owner's yes): a
-- customer with a job still open or under way, or a technician chosen for a
-- job not yet finished, is asked to finish or cancel it first. Deleting in
-- the middle of a job used to wipe it, with the technician at the door.
--
--   delete_blocker(user)   the first job that stops a deletion, or NULL.
--   my_delete_summary()    the asker's numbers for the page, and the job in
--                          the way, if there is one.
--   delete_my_account()    the same as before, and refuses while a job is on.
--
-- The website's page for deleting without the app (pechkas.net/app/
-- delete-account) signs in with the same code as the app and calls the same
-- two functions, so the rule is one rule.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

/** The job that has to be finished or cancelled before this person can delete their account, or NULL. */
CREATE OR REPLACE FUNCTION public.delete_blocker(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id FROM public.jobs j
  WHERE (j.customer_id = p_user AND j.status IN ('open', 'assigned'))
     OR (j.pro_id = p_user AND j.status = 'assigned')
  ORDER BY j.created_at
  LIMIT 1;
$$;

/** What deleting would take from the asker, counted, and the job in the way. */
CREATE OR REPLACE FUNCTION public.my_delete_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  b AS (SELECT public.delete_blocker(me.id) AS job FROM me)
  SELECT jsonb_build_object(
    'name', (SELECT p.first_name FROM public.profiles p WHERE p.id = me.id),
    'since', (SELECT p.created_at FROM public.profiles p WHERE p.id = me.id),
    'pro', EXISTS (SELECT 1 FROM public.pros r WHERE r.id = me.id),
    'customer', jsonb_build_object(
      'jobs', (SELECT count(*) FROM public.jobs j WHERE j.customer_id = me.id),
      'media', (SELECT count(*) FROM public.job_media m JOIN public.jobs j ON j.id = m.job_id
                WHERE j.customer_id = me.id AND m.kind IN ('photo', 'video')),
      'voice', (SELECT count(*) FROM public.job_media m JOIN public.jobs j ON j.id = m.job_id
                WHERE j.customer_id = me.id AND m.kind = 'voice')),
    'technician', jsonb_build_object(
      'jobs', (SELECT count(*) FROM public.jobs j WHERE j.pro_id = me.id),
      'photos', (SELECT count(*) FROM public.job_photos x WHERE x.pro_id = me.id),
      'messages', (SELECT count(*) FROM public.job_messages x WHERE x.sender_id = me.id),
      'money_record', EXISTS (SELECT 1 FROM public.ledger_entries e WHERE e.account = 'pro_owes' AND e.pro_id = me.id)),
    'blocker', (SELECT jsonb_build_object(
                  'id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status, 'stage', j.stage,
                  'trade', j.trade,
                  'trade_name', coalesce((SELECT t.name FROM public.trades t WHERE t.slug = j.trade), j.trade),
                  'side', CASE WHEN j.customer_id = me.id THEN 'customer' ELSE 'pro' END,
                  'pro_name', CASE WHEN j.customer_id = me.id AND j.pro_id IS NOT NULL
                                   THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END)
                FROM b JOIN public.jobs j ON j.id = b.job),
    'staff', EXISTS (SELECT 1 FROM public.staff s WHERE s.id = me.id)
  )
  FROM me
  WHERE me.id IS NOT NULL;
$$;

/** Deletes the asker's account and everything that cascades from it — never in the middle of a job. */
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_job public.jobs%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  -- Staff are removed by the owner, not by themselves from a phone.
  IF EXISTS (SELECT 1 FROM public.staff WHERE id = v_me) THEN
    RETURN public.refuse('Office accounts are removed by the owner.');
  END IF;
  -- Never in the middle of a job: somebody may be at a door, or waiting for one.
  SELECT * INTO v_job FROM public.jobs WHERE id = public.delete_blocker(v_me);
  IF v_job.id IS NOT NULL THEN
    RETURN public.refuse('Finish or cancel ' || v_job.ref || ' first. Then you can delete your account.', 'job');
  END IF;
  DELETE FROM auth.users WHERE id = v_me;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.delete_blocker(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_delete_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_delete_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261201000000_delete_account')
ON CONFLICT (name) DO NOTHING;

COMMIT;
