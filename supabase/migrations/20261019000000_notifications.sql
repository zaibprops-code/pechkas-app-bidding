-- =============================================================================
--  NOTIFICATIONS (phase 3b)
--
--  Run after 20261018000000_bidding.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - each phone's push address ("token"), saved by the app once the person
--     has said yes to notifications, and nothing else about the phone;
--   - the database itself sends the notification, through Expo's free push
--     service, the moment something happens. Not the app: an app that has to
--     remember to send one is an app that one day forgets.
--
--  Who is told what:
--   - a new job → every approved technician who is ONLINE and could offer on
--     it (pro_may_see_as(), the same rule as his list);
--   - a new offer → the customer;
--   - a technician chosen → that technician; and the customer as well when
--     the office placed it, because they did not choose;
--   - a job with a technician called off → the technician; and the customer
--     as well when the office called it off.
--
--  WHAT A NOTIFICATION MAY SAY. It passes through Expo's and Google's
--  servers and sits on a lock screen anybody can read. So: the trade, the
--  sector, a first name, a price, the job number. NEVER a street, a house,
--  a landmark, a gate note or a phone number. Those stay in the app, behind
--  the sign-in. The tests check every message sent.
--
--  A notification that cannot be sent must never stop the job, the offer or
--  the choice from happening. Every send is caught and written down instead.
-- =============================================================================

BEGIN;


-- --- The database's way of making a web request --------------------------------------
--
-- pg_net is Supabase's own extension for it. It queues the request and sends
-- it after the change is saved, so a job that fails to post sends nothing.
DO $$
BEGIN
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  END IF;
END
$$;


-- --- Phones --------------------------------------------------------------------------

-- One row per phone. The token is Expo's address for that phone's app; it is
-- the key, so a phone that signs in as somebody else moves to them and stops
-- receiving the first person's notifications.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  token      text PRIMARY KEY CHECK (token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('android', 'ios')),
  -- The language the technician reads his screens in, so the notification
  -- matches them. Customers' notifications are English, like their screens.
  lang       text NOT NULL DEFAULT 'en' CHECK (lang IN ('ur', 'en')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS push_tokens_user ON public.push_tokens (user_id, updated_at DESC);

-- What was sent, to whom, and whether it went. For the owner, in the Table
-- Editor, when somebody says "I never got told". Nobody else can read it.
CREATE TABLE IF NOT EXISTS public.push_log (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  job_id     uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phones     integer NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  request_id bigint,
  problem    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS push_log_recent ON public.push_log (created_at DESC);


/** The app saves this phone's push address, once the person has said yes. */
CREATE OR REPLACE FUNCTION public.save_push_token(p_token text, p_platform text, p_lang text DEFAULT 'en')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF p_token IS NULL OR p_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,200}\]$' THEN
    RETURN public.refuse('That is not a notification address.');
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('android', 'ios') THEN
    RETURN public.refuse('Unknown phone type.');
  END IF;

  INSERT INTO public.push_tokens (token, user_id, platform, lang, updated_at)
  VALUES (p_token, auth.uid(), p_platform, CASE WHEN p_lang = 'ur' THEN 'ur' ELSE 'en' END, now())
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, lang = EXCLUDED.lang, updated_at = now();

  -- A person with a drawer of old phones is told on the five newest.
  DELETE FROM public.push_tokens
  WHERE user_id = auth.uid()
    AND token NOT IN (SELECT token FROM public.push_tokens WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 5);

  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Signing out: this phone stops being told about this person's jobs. */
CREATE OR REPLACE FUNCTION public.forget_push_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- One rule for who may see a job, for anybody --------------------------------------
--
-- The same rule as before, now able to answer for a technician who is not the
-- one asking: a notification is sent on behalf of nobody. pro_may_see() is
-- this with the asker filled in, so the list, the offer, the files and the
-- notification still cannot disagree. Granted to nobody: a person may ask
-- about themselves, never about someone else.
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
        (j.status = 'open' AND j.trade = ANY (r.trades) AND j.sector = ANY (r.sectors))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.pro_may_see(p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pro_may_see_as(p_job, auth.uid());
$$;


-- --- Sending -------------------------------------------------------------------------

/** Rs 5,500 from 550000 paisa. */
CREATE OR REPLACE FUNCTION public.rs(p_paisa bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'Rs ' || to_char(p_paisa / 100, 'FM999,999,999');
$$;

/**
 * Tells one person, on each of their phones, in each phone's language.
 * Writes down what it sent, or why it could not. Never raises: a
 * notification that will not go is not a reason to undo the job.
 */
CREATE OR REPLACE FUNCTION public.send_push(
  p_user  uuid,
  p_kind  text,
  p_job   uuid,
  p_url   text,
  p_title_en text, p_body_en text,
  p_title_ur text DEFAULT NULL, p_body_ur text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_messages jsonb;
  v_phones   integer;
  v_request  bigint;
  v_problem  text;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', CASE WHEN t.lang = 'ur' AND p_title_ur IS NOT NULL THEN p_title_ur ELSE p_title_en END,
           'body', CASE WHEN t.lang = 'ur' AND p_body_ur IS NOT NULL THEN p_body_ur ELSE p_body_en END,
           'data', jsonb_build_object('url', p_url),
           'sound', 'default',
           'priority', 'high',
           'channelId', 'jobs',
           -- A new job is stale in half an hour; anything else keeps a day.
           'ttl', CASE WHEN p_kind = 'new_job' THEN 1800 ELSE 86400 END
         )), '[]'::jsonb),
         count(*)
  INTO v_messages, v_phones
  FROM public.push_tokens t
  WHERE t.user_id = p_user;

  IF v_phones > 0 THEN
    BEGIN
      v_request := net.http_post(
        url => 'https://exp.host/--/api/v2/push/send',
        body => v_messages,
        headers => '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        timeout_milliseconds => 10000
      );
    EXCEPTION WHEN OTHERS THEN
      v_problem := left(SQLERRM, 300);
    END;
  ELSE
    v_problem := 'no phone has said yes to notifications';
  END IF;

  INSERT INTO public.push_log (kind, job_id, user_id, phones, title, body, request_id, problem)
  VALUES (p_kind, p_job, p_user, v_phones, p_title_en, p_body_en, v_request, v_problem);
EXCEPTION WHEN OTHERS THEN
  -- Even the log failing must not undo the job.
  NULL;
END;
$$;

/** "Abhi" / "As soon as possible", "Kal subah" / "Tomorrow morning": the words on his screen. */
CREATE OR REPLACE FUNCTION public.when_words(p_kind text, p_part text, p_lang text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_kind = 'now' THEN CASE WHEN p_lang = 'ur' THEN 'Abhi' ELSE 'As soon as possible' END
    ELSE btrim(
      CASE p_kind WHEN 'today' THEN CASE WHEN p_lang = 'ur' THEN 'Aaj' ELSE 'Today' END
                  ELSE CASE WHEN p_lang = 'ur' THEN 'Kal' ELSE 'Tomorrow' END END
      || ' ' ||
      coalesce(CASE p_part
        WHEN 'morning'   THEN CASE WHEN p_lang = 'ur' THEN 'subah' ELSE 'morning' END
        WHEN 'afternoon' THEN CASE WHEN p_lang = 'ur' THEN 'dopahar' ELSE 'afternoon' END
        WHEN 'evening'   THEN CASE WHEN p_lang = 'ur' THEN 'shaam' ELSE 'evening' END
      END, ''))
  END;
$$;


-- --- When to send ----------------------------------------------------------------------

/** A job is posted: every technician online who could offer on it. */
CREATE OR REPLACE FUNCTION public.on_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trade text;
  v_first text;
  v_pro   uuid;
BEGIN
  SELECT name INTO v_trade FROM public.trades WHERE slug = NEW.trade;
  SELECT first_name INTO v_first FROM public.profiles WHERE id = NEW.customer_id;
  v_trade := coalesce(v_trade, NEW.trade);

  FOR v_pro IN
    SELECT r.id FROM public.pros r
    WHERE r.online
      AND r.id <> NEW.customer_id
      AND public.pro_may_see_as(NEW.id, r.id)
    ORDER BY r.last_seen_at DESC NULLS LAST
    LIMIT 100
  LOOP
    PERFORM public.send_push(
      v_pro, 'new_job', NEW.id, '/pro',
      'New job: ' || v_trade || ' · ' || NEW.sector,
      coalesce(v_first || ' · ', '') || public.rs(NEW.offered_paisa) || ' · ' || public.when_words(NEW.when_kind, NEW.when_part, 'en') || '. Open it to send your offer.',
      'Naya kaam: ' || v_trade || ' · ' || NEW.sector,
      coalesce(v_first || ' · ', '') || public.rs(NEW.offered_paisa) || ' · ' || public.when_words(NEW.when_kind, NEW.when_part, 'ur') || '. Offer bhejne ke liye kholein.'
    );
  END LOOP;
  RETURN NULL;
END;
$$;

/** A technician chosen, or a chosen job called off. */
CREATE OR REPLACE FUNCTION public.on_job_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_first text;
  v_pro   text;
  v_trade text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  SELECT first_name INTO v_first FROM public.profiles WHERE id = NEW.customer_id;
  SELECT name INTO v_trade FROM public.trades WHERE slug = NEW.trade;
  v_trade := coalesce(v_trade, NEW.trade);

  IF OLD.status = 'open' AND NEW.status = 'assigned' AND NEW.pro_id IS NOT NULL THEN
    SELECT split_part(full_name, ' ', 1) INTO v_pro FROM public.pros WHERE id = NEW.pro_id;
    IF NEW.assigned_by = 'office' THEN
      PERFORM public.send_push(
        NEW.pro_id, 'chosen', NEW.id, '/pro',
        'Pechkas gave you a job: ' || NEW.ref,
        v_trade || ' · ' || NEW.sector || ' · ' || public.rs(NEW.agreed_paisa) || '. The address and number are in the app.',
        'Pechkas ne aap ko kaam diya: ' || NEW.ref,
        v_trade || ' · ' || NEW.sector || ' · ' || public.rs(NEW.agreed_paisa) || '. Pata aur number app mein hain.'
      );
      PERFORM public.send_push(
        NEW.customer_id, 'office_assigned', NEW.id, '/jobs',
        coalesce(v_pro, 'A technician') || ' is your technician for ' || NEW.ref,
        'Pechkas arranged it at ' || public.rs(NEW.agreed_paisa) || '. His name and number are in the app.'
      );
    ELSE
      PERFORM public.send_push(
        NEW.pro_id, 'chosen', NEW.id, '/pro',
        'You were chosen: ' || NEW.ref,
        coalesce(v_first, 'The customer') || ' chose you at ' || public.rs(NEW.agreed_paisa) || '. The address and number are in the app.',
        'Aap chun liye gaye: ' || NEW.ref,
        coalesce(v_first, 'Customer') || ' ne ' || public.rs(NEW.agreed_paisa) || ' par aap ko chuna. Pata aur number app mein hain.'
      );
    END IF;

  ELSIF OLD.status = 'assigned' AND NEW.status = 'cancelled' AND OLD.pro_id IS NOT NULL THEN
    PERFORM public.send_push(
      OLD.pro_id, 'cancelled', NEW.id, '/pro',
      'Job cancelled: ' || NEW.ref,
      'Do not go. The ' || v_trade || ' job in ' || NEW.sector || ' is off, and it has left your app.',
      'Kaam cancel: ' || NEW.ref,
      'Mat jayein. ' || NEW.sector || ' ka ' || v_trade || ' kaam ab nahi hai, app se hata diya gaya.'
    );
  END IF;

  -- The customer did not do this themselves, so they are told, whatever
  -- state it was in.
  IF NEW.status = 'cancelled' AND NEW.cancelled_by = 'office' THEN
    PERFORM public.send_push(
      NEW.customer_id, 'office_cancelled', NEW.id, '/jobs',
      'Pechkas cancelled ' || NEW.ref,
      -- Not the reason itself: the office typed it, and a lock screen is no
      -- place for anything the office might have written about a house.
      'Open the app to see why. Nobody will come for this job.'
    );
  END IF;
  RETURN NULL;
END;
$$;

/**
 * An offer arrives: the customer. Only when it becomes live — a new offer, or
 * one renewed after it ran out or was taken back — not each time he nudges
 * the price, or a customer would be buzzed ten times by one technician.
 */
CREATE OR REPLACE FUNCTION public.on_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pro text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF v_job.status <> 'open' THEN
    RETURN NULL;
  END IF;
  SELECT split_part(full_name, ' ', 1) INTO v_pro FROM public.pros WHERE id = NEW.pro_id;

  PERFORM public.send_push(
    v_job.customer_id, 'offer', v_job.id, '/jobs',
    'New offer on ' || v_job.ref || ': ' || public.rs(NEW.price_paisa),
    coalesce(v_pro, 'A technician')
      || CASE WHEN NEW.price_paisa = v_job.offered_paisa THEN ' took your price' ELSE ' asks ' || public.rs(NEW.price_paisa) END
      || CASE WHEN NEW.eta_minutes IS NOT NULL THEN ' and can be there in ' || NEW.eta_minutes || ' minutes' ELSE '' END
      || '. Open the app to choose.'
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS push_job_posted ON public.jobs;
CREATE TRIGGER push_job_posted AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_posted();

DROP TRIGGER IF EXISTS push_job_changed ON public.jobs;
CREATE TRIGGER push_job_changed AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_changed();

DROP TRIGGER IF EXISTS push_offer ON public.offers;
CREATE TRIGGER push_offer AFTER INSERT OR UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.on_offer();


-- --- The office: who can be reached --------------------------------------------------------

-- One more column, and Postgres cannot change what a function returns in place.
DROP FUNCTION IF EXISTS public.admin_pros();

/** Approved technicians, for placing a job, and whether a notification can reach them. */
CREATE FUNCTION public.admin_pros()
RETURNS TABLE (id uuid, full_name text, phone text, trades text[], sectors text[], online boolean, last_seen_at timestamptz, notifications boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.full_name, u.phone, r.trades, r.sectors, r.online, r.last_seen_at,
         EXISTS (SELECT 1 FROM public.push_tokens t WHERE t.user_id = r.id)
  FROM public.pros r JOIN auth.users u ON u.id = r.id
  WHERE public.is_staff() AND r.status = 'approved'
  ORDER BY r.full_name;
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- send_push(), pro_may_see_as() and the trigger functions are granted to nobody.

GRANT EXECUTE ON FUNCTION
  public.save_push_token(text, text, text),
  public.forget_push_token(text),
  public.admin_pros()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261019000000_notifications')
ON CONFLICT (name) DO NOTHING;

COMMIT;
