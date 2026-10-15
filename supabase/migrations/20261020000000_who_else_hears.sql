-- =============================================================================
--  WHO ELSE HEARS (phase 3b, second part)
--
--  Run after 20261019000000_notifications.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - every word a notification can say, in one table, `push_words`, Roman
--     Urdu beside English. `npm run words` prints them all, with the screen
--     words, into docs/ROMAN_URDU.md for the owner to read;
--   - a technician whose offer was live is told when the customer chose
--     somebody else, or when the job was cancelled — instead of watching it
--     vanish;
--   - the office is told on a phone when a job has had no offer for
--     `escalate_minutes`: the "Pechkas will call you" the customer was
--     promised. Once per job. Sent to the mobile number each office person
--     sets in the admin panel, through the same app.
--
--  The rule about what a notification may say is unchanged: trade, sector,
--  first name, price, job number. Never an address, a landmark, a gate
--  note or a phone number.
-- =============================================================================

BEGIN;


-- --- The words -------------------------------------------------------------------------

-- `ur` is NULL for a message only ever sent to a customer or the office:
-- their side of the app is English. {name} is filled in when it is sent; a
-- slot nobody filled stays visible as {name} rather than vanishing.
CREATE TABLE IF NOT EXISTS public.push_words (
  key  text PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  ur   text,
  en   text NOT NULL,
  sort smallint NOT NULL
);
ALTER TABLE public.push_words ENABLE ROW LEVEL SECURITY;

INSERT INTO public.push_words (key, sort, ur, en) VALUES
  -- To a technician who is online, when a job he could take is posted.
  ('new_job.title',     10, 'Naya kaam: {trade} · {sector}', 'New job: {trade} · {sector}'),
  ('new_job.body',      11, '{customer} · {price} · {when}. Offer bhejne ke liye kholein.', '{customer} · {price} · {when}. Open it to send your offer.'),
  ('when.now',          12, 'Abhi', 'As soon as possible'),
  ('when.today',        13, 'Aaj', 'Today'),
  ('when.tomorrow',     14, 'Kal', 'Tomorrow'),
  ('part.morning',      15, 'subah', 'morning'),
  ('part.afternoon',    16, 'dopahar', 'afternoon'),
  ('part.evening',      17, 'shaam', 'evening'),

  -- To the customer, when an offer arrives.
  ('offer.title',       20, NULL, 'New offer on {ref}: {price}'),
  ('offer.same',        21, NULL, '{pro} took your price{eta}. Open the app to choose.'),
  ('offer.counter',     22, NULL, '{pro} asks {price}{eta}. Open the app to choose.'),
  ('offer.eta',         23, NULL, ' and can be there in {minutes} minutes'),

  -- To the technician the customer chose.
  ('chosen.title',      30, 'Aap chun liye gaye: {ref}', 'You were chosen: {ref}'),
  ('chosen.body',       31, '{customer} ne {price} par aap ko chuna. Pata aur number app mein hain.', '{customer} chose you at {price}. The address and number are in the app.'),

  -- To a technician whose offer was live, when somebody else was chosen.
  ('not_chosen.title',  40, 'Customer ne kisi aur ko chuna: {ref}', 'The customer chose someone else: {ref}'),
  ('not_chosen.body',   41, 'Is dafa nahi. Offer bhejne ka shukriya, naye kaam aate rahenge.', 'Not this time. Thank you for your offer; more jobs will come.'),

  -- To a technician whose offer was live, when the job was called off.
  ('offer_closed.title', 50, 'Kaam cancel: {ref}', 'Job cancelled: {ref}'),
  ('offer_closed.body',  51, 'Yeh kaam cancel ho gaya. Aap ki offer band ho gayi.', 'This job was cancelled. Your offer is closed.'),

  -- To the technician who was going, when the job was called off.
  ('cancelled.title',   60, 'Kaam cancel: {ref}', 'Job cancelled: {ref}'),
  ('cancelled.body',    61, 'Mat jayein. {sector} ka {trade} kaam ab nahi hai, app se hata diya gaya.', 'Do not go. The {trade} job in {sector} is off, and it has left your app.'),

  -- When the office places a job by hand: the technician, then the customer.
  ('office_gave.title', 70, 'Pechkas ne aap ko kaam diya: {ref}', 'Pechkas gave you a job: {ref}'),
  ('office_gave.body',  71, '{trade} · {sector} · {price}. Pata aur number app mein hain.', '{trade} · {sector} · {price}. The address and number are in the app.'),
  ('office_assigned.title', 72, NULL, '{pro} is your technician for {ref}'),
  ('office_assigned.body',  73, NULL, 'Pechkas arranged it at {price}. His name and number are in the app.'),

  -- To the customer, when the office cancels their job. Never the office's
  -- reason itself: that stays in the app.
  ('office_cancelled.title', 80, NULL, 'Pechkas cancelled {ref}'),
  ('office_cancelled.body',  81, NULL, 'Open the app to see why. Nobody will come for this job.'),

  -- To the office, when a job has waited with no offer.
  ('needs_you.title',   90, NULL, 'No offers yet on {ref}'),
  ('needs_you.body',    91, NULL, '{trade} · {sector} · {price}, waiting {minutes} minutes. Ring round, or place it by hand in the admin panel.')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort;


/**
 * One message in one language, with its {slots} filled. A slot can be given
 * per language as `name_ur` / `name_en`, for words that are themselves
 * translated ("Abhi" / "As soon as possible").
 */
CREATE OR REPLACE FUNCTION public.say(p_key text, p_lang text, p_vars jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_slot text;
BEGIN
  SELECT CASE WHEN p_lang = 'ur' AND w.ur IS NOT NULL THEN w.ur ELSE w.en END
  INTO v_text FROM public.push_words w WHERE w.key = p_key;
  IF v_text IS NULL THEN
    RETURN '{' || p_key || '}';
  END IF;
  FOR v_slot IN SELECT DISTINCT m[1] FROM regexp_matches(v_text, '\{([a-z_]+)\}', 'g') AS m LOOP
    v_text := replace(v_text, '{' || v_slot || '}',
                      coalesce(p_vars ->> (v_slot || '_' || p_lang), p_vars ->> v_slot, '{' || v_slot || '}'));
  END LOOP;
  RETURN v_text;
END;
$$;

/** "Abhi" / "As soon as possible", "Kal shaam" / "Tomorrow evening", from the table above. */
CREATE OR REPLACE FUNCTION public.when_words(p_kind text, p_part text, p_lang text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_kind = 'now' THEN public.say('when.now', p_lang)
    ELSE btrim(public.say('when.' || p_kind, p_lang) || ' ' ||
               CASE WHEN p_part IS NULL THEN '' ELSE public.say('part.' || p_part, p_lang) END)
  END;
$$;

/**
 * Tells one person: `<kind>.title` and `<kind>.body` from push_words, in each
 * of their phones' languages. send_push() does the sending and the log.
 */
CREATE OR REPLACE FUNCTION public.tell(
  p_user uuid, p_kind text, p_job uuid, p_url text, p_vars jsonb,
  p_body_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_body text := coalesce(p_body_key, p_kind || '.body');
BEGIN
  PERFORM public.send_push(
    p_user, p_kind, p_job, p_url,
    public.say(p_kind || '.title', 'en', p_vars), public.say(v_body, 'en', p_vars),
    public.say(p_kind || '.title', 'ur', p_vars), public.say(v_body, 'ur', p_vars)
  );
END;
$$;

/** The slots every message about a job may use. Nothing private is in here to leak. */
CREATE OR REPLACE FUNCTION public.job_vars(p_job public.jobs)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ref', p_job.ref,
    'trade', coalesce((SELECT name FROM public.trades WHERE slug = p_job.trade), p_job.trade),
    'sector', p_job.sector,
    'customer', coalesce((SELECT first_name FROM public.profiles WHERE id = p_job.customer_id), 'Customer'),
    'when_en', public.when_words(p_job.when_kind, p_job.when_part, 'en'),
    'when_ur', public.when_words(p_job.when_kind, p_job.when_part, 'ur')
  );
$$;


-- --- The same moments as before, now in the table's words ----------------------------------

CREATE OR REPLACE FUNCTION public.on_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vars jsonb := public.job_vars(NEW) || jsonb_build_object('price', public.rs(NEW.offered_paisa));
  v_pro  uuid;
BEGIN
  FOR v_pro IN
    SELECT r.id FROM public.pros r
    WHERE r.online
      AND r.id <> NEW.customer_id
      AND public.pro_may_see_as(NEW.id, r.id)
    ORDER BY r.last_seen_at DESC NULLS LAST
    LIMIT 100
  LOOP
    PERFORM public.tell(v_pro, 'new_job', NEW.id, '/pro', v_vars);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_job_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vars jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  v_vars := public.job_vars(NEW)
         || jsonb_build_object('price', public.rs(coalesce(NEW.agreed_paisa, NEW.offered_paisa)),
                               'pro', coalesce((SELECT split_part(full_name, ' ', 1) FROM public.pros WHERE id = NEW.pro_id), 'A technician'));

  IF OLD.status = 'open' AND NEW.status = 'assigned' AND NEW.pro_id IS NOT NULL THEN
    IF NEW.assigned_by = 'office' THEN
      PERFORM public.tell(NEW.pro_id, 'office_gave', NEW.id, '/pro', v_vars);
      PERFORM public.tell(NEW.customer_id, 'office_assigned', NEW.id, '/jobs', v_vars);
    ELSE
      PERFORM public.tell(NEW.pro_id, 'chosen', NEW.id, '/pro', v_vars);
    END IF;
  ELSIF OLD.status = 'assigned' AND NEW.status = 'cancelled' AND OLD.pro_id IS NOT NULL THEN
    PERFORM public.tell(OLD.pro_id, 'cancelled', NEW.id, '/pro', v_vars);
  END IF;

  IF NEW.status = 'cancelled' AND NEW.cancelled_by = 'office' THEN
    PERFORM public.tell(NEW.customer_id, 'office_cancelled', NEW.id, '/jobs', v_vars);
  END IF;
  RETURN NULL;
END;
$$;

/**
 * An offer changes. Becoming live tells the customer. Being turned down
 * while it was live tells the technician why: somebody else was chosen, or
 * the job was called off. An offer that had already run out, or that he
 * took back himself, tells nobody — he has already moved on.
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


-- --- The office's phone -----------------------------------------------------------------

-- The mobile number an office person signs in to the app with, in the form
-- Supabase stores it: 923001234567. Their alerts go to whatever phones are
-- signed in as that number and have said yes to notifications.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS alert_phone text
  CHECK (alert_phone IS NULL OR alert_phone ~ '^923[0-9]{9}$');

-- Told once per job, never every minute.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS needs_you_told_at timestamptz;

/** The asker's own alert number, and whether a phone signed in as it can be told. */
CREATE OR REPLACE FUNCTION public.admin_alerts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'alert_phone', s.alert_phone,
    'phones', (SELECT count(*) FROM public.push_tokens t JOIN auth.users u ON u.id = t.user_id
               WHERE s.alert_phone IS NOT NULL AND u.phone = s.alert_phone),
    'minutes', public.setting('escalate_minutes')
  ) END
  FROM public.staff s WHERE s.id = auth.uid();
$$;

/** Sets, changes or (with NULL) stops the asker's own alerts. Nobody else's. */
CREATE OR REPLACE FUNCTION public.admin_set_alert_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '^\+', ''), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^923[0-9]{9}$' THEN
    RETURN public.refuse('Write a Pakistani mobile number, like 0300 1234567.', 'phone');
  END IF;
  UPDATE public.staff SET alert_phone = v_phone WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Every minute: open jobs that have waited `escalate_minutes` with no live
 * offer, and have not been mentioned yet. Each is marked first and told
 * once. A job older than a day is not suddenly announced: that is a backlog
 * for the admin panel, not an alarm.
 */
CREATE OR REPLACE FUNCTION public.alert_needs_you()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job   public.jobs%ROWTYPE;
  v_staff uuid;
  v_n     integer := 0;
  v_vars  jsonb;
BEGIN
  FOR v_job IN
    UPDATE public.jobs j SET needs_you_told_at = now()
    WHERE j.id IN (
      SELECT x.id FROM public.jobs x
      WHERE x.status = 'open'
        AND x.needs_you_told_at IS NULL
        AND x.created_at < now() - make_interval(mins => public.setting('escalate_minutes')::integer)
        AND x.created_at > now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = x.id AND o.status = 'pending' AND o.expires_at > now())
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j.*
  LOOP
    v_n := v_n + 1;
    v_vars := public.job_vars(v_job) || jsonb_build_object(
      'price', public.rs(v_job.offered_paisa),
      'minutes', floor(extract(epoch FROM now() - v_job.created_at) / 60)::integer
    );
    FOR v_staff IN
      SELECT DISTINCT u.id FROM public.staff s JOIN auth.users u ON u.phone = s.alert_phone
      WHERE s.active AND s.alert_phone IS NOT NULL
    LOOP
      PERFORM public.tell(v_staff, 'needs_you', v_job.id, '/', v_vars);
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- pg_cron is Supabase's clock: it runs alert_needs_you() every minute.
-- Scheduling under the same name again replaces it, so a rerun is harmless.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-needs-you', '* * * * *', 'SELECT public.alert_needs_you()');
END
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- say(), tell(), job_vars() and alert_needs_you() are granted to nobody.

GRANT EXECUTE ON FUNCTION
  public.admin_alerts(),
  public.admin_set_alert_phone(text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261020000000_who_else_hears')
ON CONFLICT (name) DO NOTHING;

COMMIT;
