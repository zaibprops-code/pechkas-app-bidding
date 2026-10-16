-- =============================================================================
--  SIGNING IN WITH AN EMAIL CODE
--
--  Run after 20261024000000_settings_and_blocks.sql, in the Supabase SQL
--  editor. Running it a second time does no harm.
--
--  Supabase does the signing in: it emails a code, exactly as it texts one.
--  What changes here is the NUMBER. Everybody who signs in with a mobile
--  number has one Supabase has checked by SMS. Somebody who signs in with
--  an email has none, and the chosen technician still has to ring the
--  customer — so they type one, it is kept on their profile, and it is
--  marked as not checked wherever the office sees it. Once real SMS codes
--  are live it can be checked too.
--
--  The office's own alerts still go ONLY to a number checked by SMS: a
--  typed number is not proof of anything, and nobody may type the owner's
--  number and start receiving his alerts.
-- =============================================================================

BEGIN;


-- --- The number to ring -------------------------------------------------------------------

-- Stored like Supabase stores a checked one: 92 and ten digits, no plus.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text
  CHECK (phone IS NULL OR phone ~ '^923[0-9]{9}$');

/** True when Supabase checked this person's number by SMS: they signed in with it. */
CREATE OR REPLACE FUNCTION public.phone_checked(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT nullif(u.phone, '') IS NOT NULL FROM auth.users u WHERE u.id = p_user), false);
$$;

/**
 * The number to ring: the one checked by SMS if there is one, otherwise the
 * one they typed. Every function that hands a number to somebody — the
 * customer, the chosen technician, the office — asks this, so a person who
 * signed in by email can still be rung.
 */
CREATE OR REPLACE FUNCTION public.phone_of(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT nullif(u.phone, '') FROM auth.users u WHERE u.id = p_user),
    (SELECT p.phone FROM public.profiles p WHERE p.id = p_user));
$$;

/** 0300 1234567, +92 300…, 92300…, 300…: all become 923001234567, anything else NULL. The same rule as pakistaniMobile(). */
CREATE OR REPLACE FUNCTION public.tidy_mobile(p_typed text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN d ~ '^923[0-9]{9}$' THEN d
    WHEN d ~ '^03[0-9]{9}$' THEN '92' || substr(d, 2)
    WHEN d ~ '^3[0-9]{9}$' THEN '92' || d
  END
  FROM (SELECT CASE WHEN coalesce(p_typed, '') ~ '^[ +0-9().-]*$'
                    THEN regexp_replace(coalesce(p_typed, ''), '[^0-9]', '', 'g') END AS d) x;
$$;

/**
 * An email account gives the number to ring. Not for a number Supabase has
 * already checked: that one is the account itself.
 */
CREATE OR REPLACE FUNCTION public.set_my_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone text := public.tidy_mobile(p_phone);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF public.phone_checked(auth.uid()) THEN
    RETURN public.refuse('You signed in with your mobile number, so that is the number used.', 'phone');
  END IF;
  IF v_phone IS NULL THEN
    RETURN public.refuse('Write a Pakistani mobile number, like 0300 1234567.', 'phone');
  END IF;
  UPDATE public.profiles SET phone = v_phone, updated_at = now() WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'phone', v_phone);
END;
$$;

/**
 * Nobody posts a job or applies without a number to ring. The screens ask
 * for it first; this is the lock behind them, for every path in.
 */
CREATE OR REPLACE FUNCTION public.needs_a_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_who uuid;
BEGIN
  -- Each branch names its own table's column: a jobs row has no id of the
  -- person, a pros row has no customer_id.
  IF TG_TABLE_NAME = 'jobs' THEN
    v_who := NEW.customer_id;
  ELSE
    v_who := NEW.id;
  END IF;
  IF public.phone_of(v_who) IS NULL THEN
    RAISE EXCEPTION 'Add your mobile number first: Me, then Mobile number.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_needs_phone ON public.jobs;
CREATE TRIGGER job_needs_phone BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.needs_a_phone();
DROP TRIGGER IF EXISTS pro_needs_phone ON public.pros;
CREATE TRIGGER pro_needs_phone BEFORE INSERT ON public.pros
  FOR EACH ROW EXECUTE FUNCTION public.needs_a_phone();

/** The typed numbers nobody has checked, so the admin panel can mark them wherever one appears. */
CREATE OR REPLACE FUNCTION public.admin_unchecked_phones()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(DISTINCT p.phone) FROM public.profiles p
    WHERE p.phone IS NOT NULL AND NOT public.phone_checked(p.id)), '[]'::jsonb) END;
$$;


-- --- The account, saying how they signed in --------------------------------------------------

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
    -- How they signed in, and the number the other side will call. An
    -- email account must type one before it can post or apply.
    'email',         (SELECT nullif(u.email, '') FROM auth.users u WHERE u.id = auth.uid()),
    'phone',         public.phone_of(auth.uid()),
    'phone_checked', public.phone_checked(auth.uid()),
    'needs_phone',   public.phone_of(auth.uid()) IS NULL,
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


-- --- Every number handed to somebody now comes from phone_of() ------------------------------
--
-- The same functions as before with one change each: u.phone, which is empty
-- for an email account, became public.phone_of(…). The office's alerts
-- (admin_alerts, alert_needs_you, tell_office) are deliberately left on the
-- checked number.

CREATE OR REPLACE FUNCTION public.my_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title,
      'description', j.description, 'offered_paisa', j.offered_paisa,
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'status', j.status, 'stage', j.stage, 'cancelled_by', j.cancelled_by, 'cancel_reason', j.cancel_reason,
      'created_at', j.created_at,
      'live_offers', (SELECT count(*) FROM public.offers o JOIN public.pros r ON r.id = o.pro_id
                      WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now() AND r.status = 'approved'),
      'agreed_paisa', j.agreed_paisa,
      'start_code', CASE WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived') THEN j.start_code END,
      'code_locked', j.code_locked_at IS NOT NULL,
      'pro', CASE
               WHEN j.status = 'assigned' THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'phone', public.phone_of(u.id), 'years', r.years)
                 FROM public.pros r JOIN auth.users u ON u.id = r.id WHERE r.id = j.pro_id)
               WHEN j.status IN ('done', 'stopped') THEN (
                 SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'years', r.years)
                 FROM public.pros r WHERE r.id = j.pro_id)
             END,
      'preferred', CASE WHEN j.status = 'open' AND j.preferred_pro_id IS NOT NULL AND j.preferred_until > now() THEN (
                     SELECT jsonb_build_object('first_name', split_part(r.full_name, ' ', 1), 'until', j.preferred_until)
                     FROM public.pros r WHERE r.id = j.preferred_pro_id) END,
      -- Whom it was held for at all, so the screen can tell "he passed / time
      -- ran out" from "he was not working, so it was never held".
      'asked_for', (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.preferred_pro_id),
      'can_ask_again', j.status = 'done'
                       AND EXISTS (SELECT 1 FROM public.pros r WHERE r.id = j.pro_id AND r.status = 'approved')
                       AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'blocked', j.pro_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = j.pro_id),
      'can_block', j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled'),
      -- Only his first name, only for the block button: a cancelled job's
      -- card otherwise says nothing about the man who was going to come.
      'block_name', CASE WHEN j.pro_id IS NOT NULL AND j.status IN ('done', 'stopped', 'cancelled')
                         THEN (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = j.pro_id) END,
      'change', CASE WHEN j.status = 'assigned' THEN public.pending_change(j.id) END,
      'visit_fee_paisa', CASE WHEN j.status = 'assigned' THEN public.visit_fee(j.id) END,
      'collect_paisa', j.collect_paisa,
      'parts_paisa', j.parts_paisa,
      'finished_at', j.finished_at,
      'photos', public.photos_of(j.id),
      'can_report', j.status IN ('done', 'stopped') AND j.problem_at IS NULL AND j.finished_at > now() - interval '24 hours',
      'problem_at', j.problem_at,
      'my_rating', (SELECT x.stars FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'can_rate', j.status IN ('done', 'stopped')
                  AND j.finished_at > now() - make_interval(days => public.setting('rating_days')::integer)
                  AND NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer'),
      'guarantee_until', CASE WHEN j.status = 'done'
                              THEN j.finished_at + make_interval(days => public.setting('guarantee_days')::integer) END,
      'claim_open', EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open'),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.created_at DESC), '[]'::jsonb)
  FROM public.jobs j
  WHERE j.customer_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.pro_my_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'ref', j.ref, 'trade', j.trade, 'title', j.title, 'description', j.description,
      'agreed_paisa', j.agreed_paisa,
      'commission_bps', c.bps,
      'repeat', c.bps <> public.setting('commission_bps'),
      'keeps_paisa', j.agreed_paisa - public.commission_at(j.agreed_paisa, c.bps),
      'when_kind', j.when_kind, 'when_part', j.when_part,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'lat', j.lat, 'lng', j.lng, 'power', j.power, 'parts', j.parts, 'gate_note', j.gate_note,
      'customer_first_name', p.first_name, 'customer_phone', public.phone_of(u.id),
      'assigned_at', j.assigned_at,
      'stage', j.stage,
      'code_locked', j.code_locked_at IS NOT NULL,
      'code_tries_left', greatest(public.setting('code_tries') - j.code_tries, 0),
      'change', public.pending_change(j.id),
      'visit_fee_paisa', public.visit_fee(j.id),
      'photos', public.photos_of(j.id),
      'media', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                         FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;

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
  SELECT r.id, r.full_name, p.first_name, public.phone_of(u.id),
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

CREATE OR REPLACE FUNCTION public.admin_blocks(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'customer', p.first_name, 'phone', public.phone_of(u.id), 'ref', j.ref, 'reason', b.reason, 'at', b.created_at
      ) ORDER BY b.created_at DESC)
    FROM public.blocks b
    JOIN public.profiles p ON p.id = b.customer_id
    LEFT JOIN auth.users u ON u.id = b.customer_id
    LEFT JOIN public.jobs j ON j.id = b.from_job
    WHERE b.pro_id = p_pro), '[]'::jsonb) END;
$$;

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
    WHERE c.role = 'customer'
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

CREATE OR REPLACE FUNCTION public.admin_jobs(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, trade text, title text, description text, offered_paisa bigint,
  list_paisa bigint, when_kind text, when_part text,
  sector text, street text, house text, landmark text, lat double precision, lng double precision,
  power text, parts text, gate_note text, status text, cancelled_by text, cancel_reason text,
  created_at timestamptz, customer_name text, customer_phone text, media jsonb,
  live_offers integer, needs_you boolean, why text, agreed_paisa bigint, assigned_by text,
  pro_name text, pro_phone text, stage text, collect_paisa bigint, code_locked boolean,
  problem_text text, finished_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.ref, j.trade, j.title, j.description, j.offered_paisa,
         t.list_paisa, j.when_kind, j.when_part,
         j.sector, j.street, j.house, j.landmark, j.lat, j.lng,
         j.power, j.parts, j.gate_note, j.status, j.cancelled_by, j.cancel_reason,
         j.created_at, p.first_name, public.phone_of(u.id),
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'seconds', m.seconds) ORDER BY m.id)
                   FROM public.job_media m WHERE m.job_id = j.id), '[]'::jsonb),
         live.n,
         w.why IS NOT NULL,
         w.why,
         j.agreed_paisa, j.assigned_by,
         r.full_name, public.phone_of(ru.id), j.stage, j.collect_paisa, j.code_locked_at IS NOT NULL,
         j.problem_text, j.finished_at
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  LEFT JOIN public.job_types t ON t.id = j.job_type_id
  LEFT JOIN public.pros r ON r.id = j.pro_id
  LEFT JOIN auth.users ru ON ru.id = j.pro_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n FROM public.offers o
    WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()
  ) live
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind = 'emergency' AND NOT x.mistake) THEN 'EMERGENCY'
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind = 'guarantee') THEN 'Guarantee claim'
      WHEN EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.status = 'open' AND x.kind <> 'guarantee') THEN 'Problem reported'
      WHEN j.status = 'assigned' AND j.code_locked_at IS NOT NULL THEN 'Start code locked'
      WHEN j.status = 'assigned' AND j.stage = 'on_way' AND j.on_way_at < now() - interval '3 hours' THEN 'On the way for over 3 hours'
      WHEN j.status = 'assigned' AND j.stage = 'working' AND j.started_at < now() - interval '10 hours' THEN 'Working for over 10 hours'
      WHEN j.status = 'open' AND live.n = 0 AND j.created_at < now() - make_interval(mins => public.setting('escalate_minutes')::integer) THEN 'No offers'
    END AS why
  ) w
  WHERE public.is_staff()
    AND (p_status IS NULL
         OR j.status = p_status
         OR (p_status = 'finished' AND j.status IN ('done', 'stopped')))
  ORDER BY j.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.admin_money()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'credit_limit_paisa', public.setting('credit_limit_paisa'),
    'pay_to', (SELECT value FROM public.office_info WHERE key = 'pay_to'),
    'totals', (SELECT jsonb_build_object(
                 'owed_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'pro_owes'), 0),
                 'commission_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'commission'), 0),
                 'reserve_paisa', -coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'reserve'), 0),
                 'received_paisa', coalesce(sum(e.amount_paisa) FILTER (WHERE e.account = 'received'), 0))
               FROM public.ledger_entries e),
    'pros', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'full_name', r.full_name, 'phone', public.phone_of(u.id), 'status', r.status,
          'owed_paisa', public.pro_owed(r.id),
          'blocked', public.pro_owed(r.id) > public.setting('credit_limit_paisa'),
          'jobs_done', (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done'),
          'last_paid_at', (SELECT max(t.created_at) FROM public.ledger_txns t WHERE t.pro_id = r.id AND t.kind = 'settlement'),
          'rating', public.pro_rating(r.id)
        ) ORDER BY public.pro_owed(r.id) DESC, r.full_name)
      FROM public.pros r LEFT JOIN auth.users u ON u.id = r.id
      WHERE r.status IN ('approved', 'suspended') OR public.pro_owed(r.id) <> 0), '[]'::jsonb)
  ) END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_pros()
RETURNS TABLE (id uuid, full_name text, phone text, trades text[], sectors text[], online boolean, last_seen_at timestamptz, notifications boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.full_name, public.phone_of(u.id), r.trades, r.sectors, r.online, r.last_seen_at,
         EXISTS (SELECT 1 FROM public.push_tokens t WHERE t.user_id = r.id)
  FROM public.pros r JOIN auth.users u ON u.id = r.id
  WHERE public.is_staff() AND r.status = 'approved'
  ORDER BY r.full_name;
$$;


-- --- Who may call what ------------------------------------------------------------------------
--
-- phone_of(), phone_checked(), tidy_mobile() and needs_a_phone() are granted
-- to nobody: a person reads numbers only through the functions above.

GRANT EXECUTE ON FUNCTION
  public.set_my_phone(text),
  public.admin_unchecked_phones()
TO authenticated;


INSERT INTO public.applied_migrations (name)
VALUES ('20261025000000_email_sign_in')
ON CONFLICT (name) DO NOTHING;

COMMIT;
