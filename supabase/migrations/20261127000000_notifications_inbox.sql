-- =============================================================================
-- Notifications: what Pechkas told you (the owner, 25 November 2026).
--
-- The Notifications page was a list of the 22 things Pechkas may tell you.
-- Now it shows what Pechkas actually did tell you, as big apps do: the last
-- 90 days, newest first, 30 at a time, unread ones marked, a tap opening the
-- job. Every notification was already copied into push_log when it was sent
-- (even to a phone with notifications switched off), so nothing new is
-- collected but one thing: when you opened it (read_at).
--
--   my_notifications(before, limit, unread)
--                  her own, from the last 90 days only; title, words, time,
--                  read or not, the job's number and kind of work, which side
--                  of the job she is on, and — for an offer, a new price or a
--                  new job — what has become of it since ("You chose Asad",
--                  "Approved", "Taken by someone else"), so an old request
--                  never looks as if it still waits. `unread` counts the
--                  same 90 days.
--   mark_notifications_read(ids)
--                  marks her own as read; NULL marks all of them.
--   my_unread_notifications()
--                  the number for the menu.
--
-- What the office keeps is unchanged: push_log rows older than 90 days stay
-- as the record (the office's proof in a nobody-home dispute); they are only
-- no longer shown. The words are the same ones that went to the lock screen,
-- so they never carry an address or a phone number.
--
-- Safe to run twice.
-- =============================================================================

BEGIN;

ALTER TABLE public.push_log ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS push_log_inbox ON public.push_log (user_id, created_at DESC, id DESC);

/** Her notifications, newest first, a page at a time, from the last 90 days. */
CREATE OR REPLACE FUNCTION public.my_notifications(p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 30, p_unread boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT l.* FROM public.push_log l
    WHERE l.user_id = auth.uid()
      AND l.created_at > now() - interval '90 days'
  ),
  page AS (
    SELECT m.* FROM mine m
    WHERE (p_before_id IS NULL OR m.id < p_before_id)
      AND (NOT coalesce(p_unread, false) OR m.read_at IS NULL)
    ORDER BY m.id DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 50) + 1
  ),
  shown AS (SELECT * FROM page ORDER BY id DESC LIMIT least(greatest(coalesce(p_limit, 30), 1), 50))
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at,
        'read', n.read_at IS NOT NULL,
        'job_id', n.job_id, 'ref', j.ref, 'trade', j.trade,
        'side', CASE WHEN j.customer_id = auth.uid() THEN 'customer' WHEN j.id IS NOT NULL THEN 'pro' END,
        'state', CASE
          -- An offer to her: what she did about it.
          WHEN n.kind = 'offer' AND j.customer_id = auth.uid() THEN
            CASE WHEN j.status IN ('assigned', 'done', 'stopped') THEN 'chose'
                 WHEN j.status = 'cancelled' THEN 'closed' END
          -- A new price: what was decided, whoever decided it.
          WHEN n.kind = 'change' AND j.customer_id = auth.uid() THEN
            (SELECT c.status FROM public.job_changes c
             WHERE c.job_id = j.id AND c.created_at <= n.created_at + interval '1 minute'
             ORDER BY c.created_at DESC LIMIT 1)
          -- A job for him: still open to him, offered on, his, or gone.
          WHEN n.kind IN ('new_job', 'job_again', 'asked_again') AND j.customer_id IS DISTINCT FROM auth.uid() THEN
            CASE WHEN j.pro_id = auth.uid() AND j.status <> 'open' THEN 'yours'
                 WHEN j.status = 'open' AND EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = auth.uid()
                                                     AND o.status = 'pending' AND o.expires_at > now()) THEN 'offered'
                 WHEN j.status = 'open' AND public.pro_may_see_as(j.id, auth.uid()) THEN 'open'
                 ELSE 'gone' END
        END,
        'chose', CASE WHEN n.kind = 'offer' AND j.customer_id = auth.uid() AND j.status IN ('assigned', 'done', 'stopped')
                      THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END
      ) ORDER BY n.id DESC)
      FROM shown n LEFT JOIN public.jobs j ON j.id = n.job_id), '[]'::jsonb),
    'more', (SELECT count(*) FROM page) > least(greatest(coalesce(p_limit, 30), 1), 50),
    'unread', (SELECT count(*) FROM mine WHERE mine.read_at IS NULL)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

/** Marks her own notifications read: these, or (NULL) all of them. */
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids bigint[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Sign in first.');
  END IF;
  UPDATE public.push_log l SET read_at = now()
  WHERE l.user_id = auth.uid() AND l.read_at IS NULL
    AND (p_ids IS NULL OR l.id = ANY (p_ids));
  RETURN jsonb_build_object('ok', true, 'unread', public.my_unread_notifications());
END;
$$;

/** How many of her last 90 days' notifications she has not opened. */
CREATE OR REPLACE FUNCTION public.my_unread_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM public.push_log l
  WHERE l.user_id = auth.uid() AND l.read_at IS NULL AND l.created_at > now() - interval '90 days';
$$;

-- --- Who may call what --------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.my_notifications(bigint, integer, boolean), public.mark_notifications_read(bigint[]),
  public.my_unread_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_notifications(bigint, integer, boolean), public.mark_notifications_read(bigint[]),
  public.my_unread_notifications() TO authenticated;

INSERT INTO public.applied_migrations (name)
VALUES ('20261127000000_notifications_inbox')
ON CONFLICT (name) DO NOTHING;

COMMIT;
