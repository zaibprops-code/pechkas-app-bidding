-- =============================================================================
--  ACCOUNTS AND TECHNICIANS (phase 1)
--
--  Run after 20261015000000_foundations.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  What it adds:
--   - the office: who may use the admin panel (`staff`);
--   - everybody who signs in with a phone number (`profiles`), as a customer
--     or as a technician;
--   - a technician's application, and the checks the owner made before
--     approving him (`pros`, `pro_checks`);
--   - the lists of trades and sectors the app offers.
--
--  Nobody reads any of these tables directly. The app and the admin panel ask
--  the functions at the bottom, each of which checks who is asking and says
--  exactly what comes back.
--
--  NO CNIC. Not the number, not a photograph of the card, not in a note.
--  `pro_checks` records THAT identity was checked, when, how and by whom.
--  The functions refuse any text shaped like a CNIC number.
-- =============================================================================

BEGIN;


-- --- Lists the app offers ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trades (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  name text NOT NULL,
  sort smallint NOT NULL
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

INSERT INTO public.trades (slug, name, sort) VALUES
  ('ac',          'AC',                 1),
  ('electrician', 'Electrician',        2),
  ('plumber',     'Plumber',            3),
  ('cctv',        'CCTV',               4),
  ('wifi',        'Wi-Fi and internet', 5),
  ('ups',         'UPS and inverter',   6),
  ('solar',       'Solar',              7),
  ('appliances',  'Home appliances',    8),
  ('carpentry',   'Carpentry',          9),
  ('painting',    'Painting',          10),
  ('computers',   'Computers',         11)
ON CONFLICT (slug) DO NOTHING;

-- Every place the website knows (src/data/areas.js in zaibprops-code/Pechkas),
-- in the same order: the sectors Pechkas works in first.
CREATE TABLE IF NOT EXISTS public.sectors (
  name text PRIMARY KEY,
  sort smallint NOT NULL
);
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

INSERT INTO public.sectors (name, sort)
SELECT name, ord::smallint
FROM unnest(ARRAY[
  'F-11', 'E-11', 'G-13', 'DHA', 'Bahria Town', 'F-10', 'G-11',
  'F-6', 'F-7', 'F-8', 'F-12',
  'G-6', 'G-7', 'G-8', 'G-9', 'G-10', 'G-14', 'G-15', 'G-16',
  'E-7', 'E-8', 'E-9',
  'H-8', 'H-9', 'H-13',
  'I-8', 'I-9', 'I-10', 'I-11', 'I-14',
  'D-12', 'B-17', 'C-15',
  'Gulberg Greens', 'Gulberg Residencia',
  'PWD', 'Soan Gardens', 'Media Town', 'Korang Town',
  'Ghauri Town', 'Pakistan Town', 'Chak Shahzad', 'Bani Gala',
  'Tarnol', 'Golra', 'Sangjani', 'Naval Anchorage',
  'Rawalpindi', 'Saddar', 'Chaklala', 'Satellite Town', 'Westridge'
]) WITH ORDINALITY AS t(name, ord)
ON CONFLICT (name) DO NOTHING;


-- --- The office -----------------------------------------------------------------

/**
 * Who may use the admin panel. Each person has their own login (email and
 * password, created by the owner in Supabase), so one person can be switched
 * off without changing anything for anybody else.
 */
CREATE TABLE IF NOT EXISTS public.staff (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  role       text NOT NULL DEFAULT 'office' CHECK (role IN ('owner', 'office')),
  -- Switching this off locks them out on their very next tap.
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

/** Is the person asking on the staff list, and switched on, right now? */
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s WHERE s.id = auth.uid() AND s.active
  );
$$;


-- --- People who sign in with a phone number ---------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('customer', 'pro')),
  -- The only name a customer gives, and the only name of a customer a
  -- technician will ever see.
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- --- Technicians ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pros (
  id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- His full name, for the owner. Customers will only ever see the first.
  full_name     text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 3 AND 80),
  trades        text[] NOT NULL CHECK (cardinality(trades) BETWEEN 1 AND 6),
  years         smallint NOT NULL CHECK (years BETWEEN 0 AND 60),
  sectors       text[] NOT NULL CHECK (cardinality(sectors) BETWEEN 1 AND 20),
  about         text CHECK (about IS NULL OR length(about) <= 300),
  status        text NOT NULL DEFAULT 'applied'
                  CHECK (status IN ('applied', 'approved', 'rejected', 'suspended')),
  -- Why he was turned down or suspended. Shown to him, so it is written to him.
  status_reason text CHECK (status_reason IS NULL OR length(status_reason) <= 300),
  decided_at    timestamptz,
  decided_by    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pros ENABLE ROW LEVEL SECURITY;

/**
 * What the owner checked before approving somebody. All three steps are
 * required before approval: identity (in person or by video call, never by a
 * photo of a card), a trial job, and the rules explained.
 */
CREATE TABLE IF NOT EXISTS public.pro_checks (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pro_id          uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  step            text NOT NULL CHECK (step IN ('identity', 'trial_job', 'rules')),
  method          text NOT NULL CHECK (method IN ('in_person', 'video_call')),
  checked_on      date NOT NULL,
  checked_by      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  -- Kept as text too, so the record still says who even after they leave.
  checked_by_name text NOT NULL,
  notes           text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pro_checks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pro_checks_pro ON public.pro_checks (pro_id);


-- --- Small helpers (not callable from outside) -----------------------------------

/** A refusal the app can put beside the right box. */
CREATE OR REPLACE FUNCTION public.refuse(p_why text, p_field text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('ok', false, 'why', p_why, 'field', p_field);
$$;

/** Does this text contain anything shaped like a CNIC number? */
CREATE OR REPLACE FUNCTION public.looks_like_cnic(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_text, '') ~ '[0-9]{5}[- ]?[0-9]{7}[- ]?[0-9]';
$$;


-- --- What the app may ask ------------------------------------------------------------

/** The trades and sectors to offer. Public: they are printed on the website too. */
CREATE OR REPLACE FUNCTION public.app_lists()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'trades',  (SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name) ORDER BY t.sort) FROM public.trades t),
    'sectors', (SELECT jsonb_agg(s.name ORDER BY s.sort) FROM public.sectors s)
  );
$$;

/**
 * Who am I, as far as Pechkas is concerned?
 *
 * Returns only the asker's own account: their role, first name, and — for a
 * technician — his own application and its status. Never anybody else's.
 */
CREATE OR REPLACE FUNCTION public.my_account()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'role',       p.role,
    'first_name', p.first_name,
    'is_staff',   public.is_staff(),
    'staff_name', (SELECT s.name FROM public.staff s WHERE s.id = auth.uid() AND s.active),
    'pro', (
      SELECT jsonb_build_object(
        'full_name', r.full_name, 'trades', r.trades, 'years', r.years,
        'sectors', r.sectors, 'about', r.about,
        'status', r.status, 'status_reason', r.status_reason
      )
      FROM public.pros r WHERE r.id = auth.uid()
    )
  )
  FROM (SELECT auth.uid() AS id) me
  LEFT JOIN public.profiles p ON p.id = me.id
  WHERE me.id IS NOT NULL;
$$;

/**
 * The first thing a new account does: say whether they are here to get
 * something fixed or to fix things, and give a first name.
 *
 * A technician can always become one later from a customer account; the
 * other way round is not offered, because a technician's record is the
 * owner's record of who he checked.
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
  IF p_role NOT IN ('customer', 'pro') THEN
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
  ELSIF v_old = 'pro' AND p_role = 'customer' THEN
    RETURN public.refuse('This number is registered as a technician. Use another number to book repairs.', 'role');
  ELSE
    UPDATE public.profiles SET role = p_role, first_name = v_name, updated_at = now() WHERE id = v_me;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', p_role);
END;
$$;

/**
 * A technician's application. He can change it freely until the owner has
 * approved him; after that his details are the owner's record and he asks
 * the office to change them.
 *
 * He cannot set his own status: there is no parameter for it.
 */
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
    RETURN public.refuse('Your details are with Pechkas. Call the office to change them.');
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

/**
 * Deletes the asker's account and everything attached to it. Both app stores
 * require this to be possible from inside the app.
 */
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  -- Staff are removed by the owner, not by themselves from a phone.
  IF EXISTS (SELECT 1 FROM public.staff WHERE id = v_me) THEN
    RETURN public.refuse('Office accounts are removed by the owner.');
  END IF;
  DELETE FROM auth.users WHERE id = v_me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- What the office may ask ------------------------------------------------------------
--
-- Every one of these asks is_staff() first. Being signed in is not enough.

/** Applications, newest first, with the phone number to ring and the checks made. */
CREATE OR REPLACE FUNCTION public.admin_applications(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, full_name text, first_name text, phone text,
  trades text[], years smallint, sectors text[], about text,
  status text, status_reason text, applied_at timestamptz, decided_at timestamptz,
  checks jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.full_name, p.first_name, u.phone,
         r.trades, r.years, r.sectors, r.about,
         r.status, r.status_reason, r.applied_at, r.decided_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'step', c.step, 'method', c.method, 'checked_on', c.checked_on,
                    'checked_by', c.checked_by_name, 'notes', c.notes)
                  ORDER BY c.created_at)
           FROM public.pro_checks c WHERE c.pro_id = r.id
         ), '[]'::jsonb)
  FROM public.pros r
  JOIN public.profiles p ON p.id = r.id
  JOIN auth.users u ON u.id = r.id
  WHERE public.is_staff()
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.applied_at DESC;
$$;

/** Records one check the owner made. */
CREATE OR REPLACE FUNCTION public.admin_record_check(
  p_pro        uuid,
  p_step       text,
  p_method     text,
  p_checked_on date,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff text;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  SELECT name INTO v_staff FROM public.staff WHERE id = auth.uid() AND active;
  IF v_staff IS NULL THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro) THEN
    RETURN public.refuse('There is no such application.');
  END IF;
  IF p_step NOT IN ('identity', 'trial_job', 'rules') THEN
    RETURN public.refuse('Choose which check this was.', 'step');
  END IF;
  IF p_method NOT IN ('in_person', 'video_call') THEN
    RETURN public.refuse('Say whether it was in person or by video call.', 'method');
  END IF;
  IF p_checked_on IS NULL OR p_checked_on > current_date THEN
    RETURN public.refuse('The date cannot be in the future.', 'checked_on');
  END IF;
  IF p_checked_on < current_date - 365 THEN
    RETURN public.refuse('A check more than a year old needs doing again.', 'checked_on');
  END IF;
  IF length(coalesce(v_notes, '')) > 500 THEN
    RETURN public.refuse('Please keep the note under 500 letters.', 'notes');
  END IF;
  IF public.looks_like_cnic(v_notes) THEN
    RETURN public.refuse('Never write a CNIC number down. Record only that you checked it.', 'notes');
  END IF;

  INSERT INTO public.pro_checks (pro_id, step, method, checked_on, checked_by, checked_by_name, notes)
  VALUES (p_pro, p_step, p_method, p_checked_on, auth.uid(), v_staff, v_notes);

  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Approve, turn down, suspend or reinstate a technician.
 *
 * Approval needs all three checks on record. Turning down and suspending
 * need a reason, because he is shown it.
 */
CREATE OR REPLACE FUNCTION public.admin_decide(p_pro uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_next   text;
  v_missing text[];
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;

  -- Lock his row, so two people deciding at once cannot both win.
  SELECT status INTO v_status FROM public.pros WHERE id = p_pro FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such application.');
  END IF;

  IF length(coalesce(v_reason, '')) > 300 THEN
    RETURN public.refuse('Please keep the reason under 300 letters.', 'reason');
  END IF;
  IF public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Never write a CNIC number down.', 'reason');
  END IF;

  IF p_decision = 'approve' THEN
    IF v_status NOT IN ('applied') THEN
      RETURN public.refuse('Only a waiting application can be approved.');
    END IF;
    -- `need.step`, spelled out: a bare `step` inside the subquery would mean
    -- c.step, compare the column with itself, and approve everybody.
    SELECT array_agg(need.step ORDER BY need.step) INTO v_missing
    FROM unnest(ARRAY['identity', 'trial_job', 'rules']) AS need(step)
    WHERE NOT EXISTS (SELECT 1 FROM public.pro_checks c WHERE c.pro_id = p_pro AND c.step = need.step);
    IF v_missing IS NOT NULL THEN
      RETURN public.refuse('Record these checks first: ' || array_to_string(v_missing, ', ') || '.', 'checks');
    END IF;
    v_next := 'approved';
    v_reason := NULL;
  ELSIF p_decision = 'reject' THEN
    IF v_status NOT IN ('applied') THEN
      RETURN public.refuse('Only a waiting application can be turned down.');
    END IF;
    IF v_reason IS NULL THEN
      RETURN public.refuse('Write the reason. He will be shown it.', 'reason');
    END IF;
    v_next := 'rejected';
  ELSIF p_decision = 'suspend' THEN
    IF v_status <> 'approved' THEN
      RETURN public.refuse('Only an approved technician can be suspended.');
    END IF;
    IF v_reason IS NULL THEN
      RETURN public.refuse('Write the reason. He will be shown it.', 'reason');
    END IF;
    v_next := 'suspended';
  ELSIF p_decision = 'reinstate' THEN
    IF v_status <> 'suspended' THEN
      RETURN public.refuse('Only a suspended technician can be reinstated.');
    END IF;
    v_next := 'approved';
    v_reason := NULL;
  ELSE
    RETURN public.refuse('Unknown decision.', 'decision');
  END IF;

  UPDATE public.pros
  SET status = v_next, status_reason = v_reason, decided_at = now(),
      decided_by = auth.uid(), updated_at = now()
  WHERE id = p_pro;

  RETURN jsonb_build_object('ok', true, 'status', v_next);
END;
$$;

/**
 * Puts somebody on the staff list as the owner. Run by hand, once, in the
 * Supabase SQL editor, after creating their login (docs/OWNER.md). Nobody
 * can call it from the app or the admin panel: it is granted to no one.
 */
CREATE OR REPLACE FUNCTION public.make_owner(p_email text, p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_id IS NULL THEN
    RETURN 'No login with that email yet. Create it first: Authentication, Users, Add user.';
  END IF;
  INSERT INTO public.staff (id, name, role, active)
  VALUES (v_id, btrim(p_name), 'owner', true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = 'owner', active = true;
  RETURN 'Done. ' || btrim(p_name) || ' can now sign in to the admin panel.';
END;
$$;


-- --- Who may call what ----------------------------------------------------------------
--
-- The foundations migration closed everything. These open exactly what is
-- meant to be open, and nothing else.

REVOKE ALL ON FUNCTION public.refuse(text, text), public.looks_like_cnic(text),
  public.make_owner(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.app_lists() TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.is_staff(),
  public.my_account(),
  public.start_as(text, text),
  public.apply_as_pro(text, text[], integer, text[], text),
  public.delete_my_account(),
  public.admin_applications(text),
  public.admin_record_check(uuid, text, text, date, text),
  public.admin_decide(uuid, text, text)
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261016000000_accounts_and_technicians')
ON CONFLICT (name) DO NOTHING;

COMMIT;
