-- =============================================================================
--  Two switches for the office: "please update" and "paused for work"
-- =============================================================================
--
--  Every big app has both, and Pechkas had neither:
--
--    · PLEASE UPDATE. When a change means an older copy of the app would
--      go wrong — a database change it does not understand — the office can
--      ask every phone older than a given edition to update before carrying
--      on. Each copy of the app knows its own edition (APP_EDITION in
--      packages/shared); the database only holds the lowest one still
--      allowed. 0, the start, asks nobody.
--
--    · PAUSED. While the owner runs a change in Supabase, or anything else
--      needs everyone to wait, the app shows one screen saying so, with the
--      office's own short note, instead of half-working. It does NOT switch
--      the database off: it only tells the app what to show. The office's
--      own logins still see the app, so it can be checked before switching
--      the pause off.
--
--  Neither one ever covers the emergency screen: the app leaves that and
--  the safety page alone, and both screens carry the emergency numbers.
--
--  Anybody may read the two switches — the app asks before anybody has
--  signed in — but only through public.app_status(), which names exactly
--  what comes back: the lowest edition, whether it is paused, and the note
--  while it is. Only the office may change them, and every change goes in
--  setting_changes with who made it.
--
--  Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_control (
  -- One row, always: true is the only id it can have.
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  min_edition integer NOT NULL DEFAULT 0 CHECK (min_edition BETWEEN 0 AND 10000),
  paused      boolean NOT NULL DEFAULT false,
  pause_note  text    NOT NULL DEFAULT '' CHECK (length(pause_note) <= 300),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text
);
ALTER TABLE public.app_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_control (id) VALUES (true) ON CONFLICT (id) DO NOTHING;


/**
 * What every copy of the app asks when it opens and when it comes back to
 * the front. Exactly three things, and the note only while paused.
 */
CREATE OR REPLACE FUNCTION public.app_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'min_edition', c.min_edition,
    'paused', c.paused,
    'note', CASE WHEN c.paused AND c.pause_note <> '' THEN c.pause_note END
  )
  FROM public.app_control c
  WHERE c.id;
$$;

/** The office's view: both switches, and who last moved them. */
CREATE OR REPLACE FUNCTION public.admin_app_control()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE (
    SELECT jsonb_build_object(
      'min_edition', c.min_edition, 'paused', c.paused, 'pause_note', c.pause_note,
      'changed_at', c.changed_at, 'changed_by', c.changed_by)
    FROM public.app_control c WHERE c.id
  ) END;
$$;

/**
 * Asks every copy older than p_edition to update first. 0 asks nobody.
 * Lowering it is always allowed: it is how a mistake is put right at once.
 */
CREATE OR REPLACE FUNCTION public.admin_set_min_edition(p_edition integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old integer;
  v_by  text;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF p_edition IS NULL OR p_edition < 0 OR p_edition > 10000 THEN
    RETURN public.refuse('That is not an edition of the app.', 'edition');
  END IF;
  SELECT min_edition INTO v_old FROM public.app_control WHERE id FOR UPDATE;
  IF v_old = p_edition THEN
    RETURN jsonb_build_object('ok', true, 'same', true);
  END IF;
  v_by := (SELECT name FROM public.staff WHERE id = auth.uid());
  UPDATE public.app_control SET min_edition = p_edition, changed_at = now(), changed_by = v_by WHERE id;
  INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
  VALUES ('app:min_edition', v_old, p_edition, auth.uid(), v_by);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Pauses the app, with a short note everybody will read, or lets it carry
 * on. The note is kept to one or two sentences and may not carry a phone
 * number or a CNIC: it is shown on every phone.
 */
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
    RETURN public.refuse('Leave phone numbers out: the screen already offers to call the office.', 'note');
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


-- --- Who may call what --------------------------------------------------------------------

REVOKE ALL ON TABLE public.app_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_status() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_app_control() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_app_control() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_min_edition(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_min_edition(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_pause(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pause(boolean, text) TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261031000000_update_and_pause')
ON CONFLICT (name) DO NOTHING;

COMMIT;
