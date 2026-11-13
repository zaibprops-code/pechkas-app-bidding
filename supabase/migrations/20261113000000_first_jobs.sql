-- =============================================================================
--  His first jobs: approval by rule, trade by trade (the owner's decision D37)
-- =============================================================================
--
--  Decided 13 November 2026, under the owner's standing rule: the app decides
--  by rule, nobody watches a trial, and a person is needed only for an
--  exception (a safety report, a dispute, an appeal).
--
--  BEFORE ANY JOB a technician has a number checked by SMS, a face photo on
--  his profile, the rules quiz and, per trade, the safety quiz. A quiz that is
--  switched off asks nothing; the safety quizzes stay off until a qualified
--  person has checked them. Passing those approves the PERSON by rule.
--
--  HIS FIRST 3 JOBS IN A TRADE ARE HIS TRIAL: basic job types only, one job at
--  a time, at or under the trial price cap, "New on Pechkas" on his offer. The
--  customer answers four questions (on time, explained the work, left it clean,
--  it works). A trial job is GOOD when all four are yes, the before and after
--  photos are on record, no guarantee claim stands against it, its commission
--  is paid, and the customer is a real, separate person (`trial_customer_why`).
--  Three good jobs AND verified identity approve the trade. Until identity can
--  be verified he stays on trial limits however many good jobs he has.
--
--  PAUSES BY RULE: a safety report pauses the trade at once; a "no" at the
--  door ("this is not the man in the photo") pauses every trade. Two "It works:
--  no" during the trial pause the trade; so do two trial jobs with a "no" on
--  any of the other three questions. He appeals in writing; the office decides.
--
--  RISKY JOB TYPES open to him only after a clean record AND a checked job: an
--  approved technician the app picks comes too, checks the work, and is paid a
--  fee as a credit against what he owes Pechkas. If a man he passed turns out
--  bad, it is on the checker's record and he is not picked again. Where nobody
--  can check, risky types are closed to customers in that sector, and they can
--  ask to be told when they open. The owner may arrange an outside assessor by
--  email, once per trade: the one human step here, because nobody yet exists
--  to do it.
--
--  IDENTITY is a plug-in: `identity_checks` holds a service's result (never a
--  CNIC number or image), written only by the service through `identity_result`.
--  Technicians approved before D37 keep "identity seen by Pechkas staff on
--  [date]" until the service has been live for the owner's deadline.
--
--  TECHNICIANS APPROVED BEFORE D37 ('legacy') work exactly as before until the
--  owner sets the two record numbers; then `sort_legacy()` sorts them by their
--  own finished jobs.
--
--  Every number the owner types in starts at 0, "not set", and whatever needs
--  it waits or is refused until it is set.
--
--  Safe to run twice.
-- =============================================================================

BEGIN;

-- --- Settings: 0 is "not set" --------------------------------------------------------------------

INSERT INTO public.settings (key, value, unit, meaning) VALUES
  ('trial_jobs', 3, 'count', 'Good jobs that approve a trade (D37). Locked: the owner''s rule.'),
  ('trial_price_cap_paisa', 0, 'paisa', 'Highest price a technician on trial may take a job for (D37). 0 = not set: nobody on trial can offer.'),
  ('trial_customer_gap_m', 0, 'count', 'Metres between the homes of the customers whose jobs count for one technician''s trial (D37). 0 = not set: no trial job counts yet.'),
  ('quiz_pass_bps', 0, 'basis_points', 'Share of right answers that passes a quiz (D37). 0 = not set: no quiz can be taken.'),
  ('quiz_retake_days', 0, 'days', 'Days before a failed quiz may be taken again (D37). 0 = not set: no retake yet.'),
  ('risky_clean_jobs', 0, 'count', 'Clean finished jobs in a trade before his first checked risky job (D37). 0 = not set: nobody can unlock risky work.'),
  ('risky_clean_days', 0, 'days', 'Days, at least, between his first clean job in a trade and his first checked risky job (D37). 0 = not set.'),
  ('risky_claim_free_days', 0, 'days', 'Days with no guarantee claim found against him before a checked risky job (D37). 0 = not set.'),
  ('risky_retry_days', 0, 'days', 'Days after a checked job that did not pass before he may be checked again (D37). 0 = not set.'),
  ('checker_fee_paisa', 0, 'paisa', 'What Pechkas pays a technician for checking another''s first risky job (D37). 0 = not set: no checked job can be arranged.'),
  ('checker_answer_minutes', 0, 'minutes', 'How long a checker has to say yes before the app asks the next (D37). 0 = not set.'),
  ('checker_accountable_days', 0, 'days', 'Days after a pass in which a claim or safety report on the man he passed goes on the checker''s record (D37). 0 = not set.'),
  ('legacy_basic_jobs', 0, 'count', 'Clean finished jobs in a trade that keep a technician approved before D37 approved in it (D37). 0 = not set: nobody is sorted yet.'),
  ('legacy_risky_jobs', 0, 'count', 'Clean finished risky jobs that keep his risky work open (D37). 0 = not set: nobody is sorted yet.'),
  ('identity_legacy_days', 0, 'days', 'Days after the identity service goes live before an identity seen by Pechkas staff stops counting (D37). 0 = not set: no deadline yet.')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_limits (key, lo, hi) VALUES
  ('trial_price_cap_paisa', 100000, 5000000),
  ('trial_customer_gap_m', 100, 5000),
  ('quiz_pass_bps', 5000, 10000),
  ('quiz_retake_days', 1, 30),
  ('risky_clean_jobs', 3, 100),
  ('risky_clean_days', 7, 365),
  ('risky_claim_free_days', 14, 365),
  ('risky_retry_days', 7, 180),
  ('checker_fee_paisa', 20000, 1000000),
  ('checker_answer_minutes', 30, 1440),
  ('checker_accountable_days', 7, 180),
  ('legacy_basic_jobs', 1, 50),
  ('legacy_risky_jobs', 1, 100),
  ('identity_legacy_days', 7, 180)
ON CONFLICT (key) DO NOTHING;
-- The three good jobs are the owner's rule, not a dial.
DELETE FROM public.setting_limits WHERE key = 'trial_jobs';


-- --- Job types: basic or risky -------------------------------------------------------------------

ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS risky boolean NOT NULL DEFAULT false;
-- "Something else" (no job type) is risky in every trade that has risky work, and in UPS.
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS something_else_risky boolean NOT NULL DEFAULT false;
-- A trade with no job types of its own that opens only to somebody whose risky work is
-- unlocked in another: UPS and inverter, through Electrician (fix a).
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS opens_with text REFERENCES public.trades(slug);

UPDATE public.job_types t SET risky = r.trade IS NOT NULL
FROM public.job_types x
LEFT JOIN (VALUES
  ('ac', 'Gas top-up'), ('ac', 'Split AC installation'), ('ac', 'Split AC uninstallation'),
  ('ac', 'Stabiliser fitting'), ('ac', 'Dismantle and refit (shifting house)'), ('ac', 'PCB or electrical fault diagnosis'),
  ('electrician', 'DB or breaker fault'), ('electrician', 'Water motor automatic switch'),
  ('electrician', 'New socket or light point'), ('electrician', 'UPS or inverter connection'),
  ('electrician', 'Generator or solar changeover switch'), ('electrician', 'Wiring fault tracing'),
  ('electrician', 'Rewiring a room or a house'),
  ('plumber', 'Geyser installation'), ('plumber', 'Geyser service and descaling'), ('plumber', 'Geyser repair'),
  ('plumber', 'Water motor or pump fitting'), ('plumber', 'Water motor repair'),
  -- Solar: the two panel cleanings are basic (fix a): the danger is his own fall, and the
  -- technician rules say how to work on a roof.
  ('solar', 'System check and written report'), ('solar', 'Full maintenance service'), ('solar', 'Inverter or wiring fault'),
  ('appliances', 'Fridge or freezer repair')
) AS r(trade, name) ON r.trade = x.trade AND r.name = x.name
WHERE t.id = x.id;

UPDATE public.trades SET something_else_risky = slug IN ('ac', 'electrician', 'plumber', 'solar', 'appliances', 'ups');
UPDATE public.trades SET opens_with = CASE WHEN slug = 'ups' THEN 'electrician' END;

-- Gas cookers and gas ovens are not taken: the oven job is electric only, here and on the website.
UPDATE public.job_types SET name = 'Microwave or electric oven repair'
WHERE trade = 'appliances' AND name = 'Microwave or oven repair'
  AND NOT EXISTS (SELECT 1 FROM public.job_types x WHERE x.trade = 'appliances' AND x.name = 'Microwave or electric oven repair');
-- Running the older migrations again puts the old name back beside the new one: it goes, unless a job used it.
DELETE FROM public.job_types t
WHERE t.trade = 'appliances' AND t.name = 'Microwave or oven repair'
  AND EXISTS (SELECT 1 FROM public.job_types x WHERE x.trade = 'appliances' AND x.name = 'Microwave or electric oven repair')
  AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_type_id = t.id);


-- --- People ----------------------------------------------------------------------------------------

/** Is the person asking the owner, and switched on? Some exceptions are his alone. */
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = auth.uid() AND s.active AND s.role = 'owner');
$$;

-- How he came to be approved: by the app's rule, or by hand (before D37, or in the SQL editor).
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS approved_how text CHECK (approved_how IN ('rule', 'hand'));
-- The day Pechkas staff saw his identity the old way. Stands until the deadline after the service goes live.
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS identity_seen_on date;
-- When the office last turned him down. Applying again then waits for a person, not the rule.
ALTER TABLE public.pros ADD COLUMN IF NOT EXISTS rejected_at timestamptz;


-- --- Trades per technician ---------------------------------------------------------------------------

/**
 * What each technician may do in each trade he applied for. `pros.trades` stays
 * what he wrote. `legacy` is a trade approved before D37 (or by hand): it works
 * as before until `sort_legacy()` sorts it by his record.
 */
CREATE TABLE IF NOT EXISTS public.pro_trades (
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade        text NOT NULL REFERENCES public.trades(slug),
  status       text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'approved', 'paused', 'stopped', 'legacy')),
  risky        text NOT NULL DEFAULT 'locked' CHECK (risky IN ('locked', 'unlocked')),
  paused_from  text CHECK (paused_from IN ('trial', 'approved', 'legacy')),
  pause_reason text CHECK (pause_reason IN ('safety', 'face', 'works_no', 'answers')),
  paused_at    timestamptz,
  pause_ref    uuid,
  approved_at  timestamptz,
  approved_by  text CHECK (approved_by IN ('trial', 'record')),
  risky_at     timestamptz,
  note         text CHECK (note IS NULL OR length(note) <= 300),
  since        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pro_id, trade)
);
ALTER TABLE public.pro_trades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_trades FROM anon, authenticated;

/** Every change to a trade, written once. */
CREATE TABLE IF NOT EXISTS public.pro_trade_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade      text NOT NULL,
  old_status text,
  new_status text NOT NULL,
  risky      text,
  note       text,
  at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pro_trade_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_trade_events FROM anon, authenticated;
DROP TRIGGER IF EXISTS pro_trade_events_once ON public.pro_trade_events;
CREATE TRIGGER pro_trade_events_once BEFORE UPDATE ON public.pro_trade_events
  FOR EACH ROW EXECUTE FUNCTION public.written_once();

CREATE OR REPLACE FUNCTION public.log_pro_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.risky IS DISTINCT FROM OLD.risky THEN
    INSERT INTO public.pro_trade_events (pro_id, trade, old_status, new_status, risky, note)
    VALUES (NEW.pro_id, NEW.trade, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, NEW.risky, NEW.note);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS pro_trade_logged ON public.pro_trades;
CREATE TRIGGER pro_trade_logged AFTER INSERT OR UPDATE ON public.pro_trades
  FOR EACH ROW EXECUTE FUNCTION public.log_pro_trade();


-- --- His face ---------------------------------------------------------------------------------------

/** The photo the customer checks at her door. Locked once his first job is given to him (fix b). */
CREATE TABLE IF NOT EXISTS public.pro_faces (
  pro_id    uuid PRIMARY KEY REFERENCES public.pros(id) ON DELETE CASCADE,
  path      text NOT NULL UNIQUE,
  set_at    timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz
);
ALTER TABLE public.pro_faces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_faces FROM anon, authenticated;

/** A new photo after the lock: a written exception the owner approves. */
CREATE TABLE IF NOT EXISTS public.face_changes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  path       text NOT NULL,
  reason     text NOT NULL CHECK (length(reason) BETWEEN 10 AND 300),
  asked_at   timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'refused')),
  decided_at timestamptz,
  by_name    text,
  note       text CHECK (note IS NULL OR length(note) <= 300)
);
ALTER TABLE public.face_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.face_changes FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS face_changes_one_waiting ON public.face_changes (pro_id) WHERE status = 'waiting';

-- The customer's answer at the door.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS face_confirmed_at timestamptz;


-- --- Identity: a service plugged in later --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.identity_service (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_on       boolean NOT NULL DEFAULT false,
  service     text CHECK (service IS NULL OR length(service) BETWEEN 2 AND 80),
  live_since  timestamptz,
  changed_at  timestamptz,
  changed_by  text
);
ALTER TABLE public.identity_service ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_service FROM anon, authenticated;
INSERT INTO public.identity_service (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

/**
 * One row per attempt. What the service says, never what it saw: no CNIC
 * number, no card image, no face match score. `reference` is the service's own.
 */
CREATE TABLE IF NOT EXISTS public.identity_checks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  service    text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  reference  text CHECK (reference IS NULL OR length(reference) <= 120),
  started_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
ALTER TABLE public.identity_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_checks FROM anon, authenticated;


-- --- Quizzes ----------------------------------------------------------------------------------------

/**
 * `rules` for everybody, `safety:<trade>` per trade. Off until its questions
 * are in and, for a safety quiz, a qualified person has checked them.
 * Questions are in Urdu, with the English beside them for the office.
 */
CREATE TABLE IF NOT EXISTS public.quizzes (
  key        text PRIMARY KEY CHECK (key = 'rules' OR key ~ '^safety:[a-z][a-z0-9-]*$'),
  trade      text REFERENCES public.trades(slug),
  is_on      boolean NOT NULL DEFAULT false,
  draw       smallint NOT NULL DEFAULT 10 CHECK (draw BETWEEN 3 AND 40),
  checked_by text CHECK (checked_by IS NULL OR length(checked_by) BETWEEN 3 AND 120),
  checked_on date,
  CHECK ((key = 'rules') = (trade IS NULL))
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quizzes FROM anon, authenticated;
INSERT INTO public.quizzes (key, trade) VALUES ('rules', NULL) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.quizzes (key, trade) SELECT 'safety:' || slug, slug FROM public.trades ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id      integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  quiz    text NOT NULL REFERENCES public.quizzes(key) ON DELETE CASCADE,
  qkey    text NOT NULL UNIQUE,
  ur      text NOT NULL,
  en      text NOT NULL,
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 5),
  answer  smallint NOT NULL CHECK (answer >= 0),
  active  boolean NOT NULL DEFAULT true,
  CHECK (answer < jsonb_array_length(options))
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_questions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  quiz        text NOT NULL REFERENCES public.quizzes(key),
  questions   integer[] NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  correct     smallint,
  pass_bps    integer,
  passed      boolean
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_attempts FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS quiz_attempts_pro ON public.quiz_attempts (pro_id, quiz);


-- --- Trial jobs ------------------------------------------------------------------------------------

/**
 * Every job he is given while a trade is on trial, and why it did or did not
 * count. `open` while the job is on, `waiting` once done until every
 * condition is known, then `good` or `not_counted` with the reason.
 */
CREATE TABLE IF NOT EXISTS public.trial_jobs (
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pro_id      uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade       text NOT NULL,
  customer_id uuid NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'good', 'not_counted')),
  why         text CHECK (why IN ('not_done', 'answers', 'works_no', 'no_answers', 'photos', 'claim', 'no_payment',
                                  'payment_case', 'same_person', 'phone_not_checked', 'repeat_customer', 'too_close',
                                  'new_account', 'no_pin')),
  on_time     boolean,
  explained   boolean,
  clean       boolean,
  answered_at timestamptz,
  works_no    smallint NOT NULL DEFAULT 0,
  -- A pause lifted on appeal forgives the answers behind it: they never pause him again.
  forgiven    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  PRIMARY KEY (job_id, pro_id)
);
ALTER TABLE public.trial_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_jobs FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS trial_jobs_pro ON public.trial_jobs (pro_id, trade);


-- --- Safety reports and appeals ------------------------------------------------------------------------

/**
 * A safety report about him: from a customer, from the "not the man in the
 * photo" answer at her door, or from a checker who found his work unsafe.
 * Each pauses work at once and reaches the office as a written item.
 */
CREATE TABLE IF NOT EXISTS public.safety_reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade      text,
  kind       text NOT NULL CHECK (kind IN ('safety', 'face', 'unsafe_check')),
  job_id     uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  -- Who said it. Deleted with that account's own words.
  from_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  words      text CHECK (words IS NULL OR length(words) <= 500),
  photo      text,
  at         timestamptz NOT NULL DEFAULT now(),
  his_side   text CHECK (his_side IS NULL OR length(his_side) <= 500),
  his_side_at timestamptz,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'not_upheld', 'false')),
  decided_at timestamptz,
  by_name    text,
  note       text CHECK (note IS NULL OR length(note) <= 500)
);
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.safety_reports FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS safety_reports_one_per_job ON public.safety_reports (job_id, pro_id, kind) WHERE job_id IS NOT NULL;

/** His appeal against a pause by rule (two "It works: no", or two jobs with a "no"). */
CREATE TABLE IF NOT EXISTS public.trade_appeals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade      text NOT NULL,
  reason     text NOT NULL,
  paused_at  timestamptz NOT NULL,
  words      text NOT NULL CHECK (length(words) BETWEEN 10 AND 500),
  at         timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'lifted', 'kept')),
  decided_at timestamptz,
  by_name    text,
  note       text CHECK (note IS NULL OR length(note) <= 500),
  UNIQUE (pro_id, trade, paused_at)
);
ALTER TABLE public.trade_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trade_appeals FROM anon, authenticated;


-- --- Checked risky jobs -----------------------------------------------------------------------------

/**
 * His first risky job in a trade, checked by somebody. `app`: an approved
 * technician the app picked, paid a fee. `outside`: an assessor the owner
 * arranged by email, recorded by the owner (status `ready` until a job).
 */
CREATE TABLE IF NOT EXISTS public.risk_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id       uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  trade        text NOT NULL REFERENCES public.trades(slug),
  kind         text NOT NULL CHECK (kind IN ('app', 'outside')),
  job_id       uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  checker_id   uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  checker_name text,
  declined     uuid[] NOT NULL DEFAULT '{}',
  status       text NOT NULL CHECK (status IN ('ready', 'asked', 'accepted', 'passed', 'not_yet', 'unsafe', 'none', 'cancelled')),
  asked_at     timestamptz,
  answer_by    timestamptz,
  accepted_at  timestamptz,
  items        jsonb,
  note         text CHECK (note IS NULL OR length(note) <= 500),
  reported_at  timestamptz,
  fee_txn      uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  by_name      text
);
ALTER TABLE public.risk_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.risk_checks FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS risk_checks_one_live ON public.risk_checks (pro_id, trade)
  WHERE status IN ('ready', 'asked', 'accepted');
CREATE UNIQUE INDEX IF NOT EXISTS risk_checks_one_per_job ON public.risk_checks (job_id)
  WHERE job_id IS NOT NULL AND status IN ('asked', 'accepted');

/** What a checker looks at. The same list for every job in a trade. */
CREATE TABLE IF NOT EXISTS public.check_items (
  key   text PRIMARY KEY CHECK (key ~ '^[a-z]+:[a-z_]+$'),
  trade text REFERENCES public.trades(slug),
  sort  smallint NOT NULL,
  item  text NOT NULL
);
ALTER TABLE public.check_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.check_items FROM anon, authenticated;
INSERT INTO public.check_items (key, trade, sort, item) VALUES
  ('all:explained',     NULL, 1, 'Explained the fault, and the cost of any parts, before starting'),
  ('all:tools',         NULL, 2, 'Used the right tools, ladder and protection'),
  ('all:tested',        NULL, 3, 'Tested that it works, with the household watching'),
  ('all:clean',         NULL, 4, 'Left the place clean'),
  ('electrician:dead',  'electrician', 10, 'Switched the power off and tested the circuit dead before touching any wire'),
  ('electrician:rating','electrician', 11, 'Used the right cable size and breaker, and kept the earth connected'),
  ('electrician:heat',  'electrician', 12, 'Checked that nothing is heating up under load'),
  ('ac:isolate',        'ac', 10, 'Switched the AC off at its breaker before opening it'),
  ('ac:leak',           'ac', 11, 'Checked the refrigerant joints for leaks before adding gas'),
  ('ac:wiring',         'ac', 12, 'Left the wiring and stabiliser connections safe and tidy'),
  ('plumber:gas_joint', 'plumber', 10, 'Leak-tested a gas geyser''s gas joint with soapy water, never a flame'),
  ('plumber:flue',      'plumber', 11, 'Checked the room''s ventilation and the geyser''s flue'),
  ('plumber:earth',     'plumber', 12, 'Kept a water motor''s wiring dry and earthed'),
  ('solar:dc',          'solar', 10, 'Isolated the panels'' DC side before connecting anything'),
  ('solar:battery',     'solar', 11, 'Handled batteries safely: terminals covered, no sparks'),
  ('appliances:unplug', 'appliances', 10, 'Unplugged the appliance before opening it'),
  ('appliances:gas',    'appliances', 11, 'Handled the refrigerant safely and checked for leaks')
ON CONFLICT (key) DO UPDATE SET trade = EXCLUDED.trade, sort = EXCLUDED.sort, item = EXCLUDED.item;

/** A man he passed turned out bad within the time he answers for. He is not picked again. */
CREATE TABLE IF NOT EXISTS public.checker_strikes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checker_id  uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  check_id    uuid NOT NULL REFERENCES public.risk_checks(id) ON DELETE CASCADE,
  cause       text NOT NULL CHECK (cause IN ('claim', 'safety')),
  cause_id    uuid NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  lifted_at   timestamptz,
  lifted_by   text,
  lift_note   text CHECK (lift_note IS NULL OR length(lift_note) <= 300),
  UNIQUE (check_id, cause, cause_id)
);
ALTER TABLE public.checker_strikes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checker_strikes FROM anon, authenticated;

-- A checker's photos sit beside the job's own.
ALTER TABLE public.job_photos DROP CONSTRAINT IF EXISTS job_photos_stage_check;
ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_stage_check
  CHECK (stage IN ('before', 'after', 'change', 'receipt', 'video', 'fix', 'gate', 'check'));

-- The checker's fee: a credit to him, a cost to Pechkas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.ledger_txns'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%kind = ANY%' LOOP
    EXECUTE format('ALTER TABLE public.ledger_txns DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.ledger_entries'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%account = ANY%' LOOP
    EXECUTE format('ALTER TABLE public.ledger_entries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.ledger_txns ADD CONSTRAINT ledger_txns_kind_check
  CHECK (kind IN ('commission', 'settlement', 'reversal', 'guarantee_pay', 'guarantee_charge', 'payout',
                  'visit_fee_cover', 'visit_fee_refund', 'checker_fee'));
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_account_check
  CHECK (account IN ('pro_owes', 'commission', 'reserve', 'received', 'checks'));

-- The same job back to others when no checker can come, or it was not the man in the photo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.job_assignments'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%ended = ANY%' LOOP
    EXECUTE format('ALTER TABLE public.job_assignments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.job_assignments ADD CONSTRAINT job_assignments_ended_check
  CHECK (ended IN ('withdrawn', 'late_withdrawal', 'replaced', 'no_checker', 'not_the_man'));


-- --- Closed job types: who asked to be told ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.type_asks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trade       text NOT NULL REFERENCES public.trades(slug),
  job_type_id integer REFERENCES public.job_types(id) ON DELETE CASCADE,
  sector      text NOT NULL,
  asked_at    timestamptz NOT NULL DEFAULT now(),
  told_at     timestamptz
);
ALTER TABLE public.type_asks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.type_asks FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS type_asks_once ON public.type_asks (customer_id, trade, coalesce(job_type_id, 0), sector);


-- --- The rules every door asks ---------------------------------------------------------------------

/** Is his identity good enough to leave trial limits? A service's "verified", or staff's old check in time. */
CREATE OR REPLACE FUNCTION public.identity_ok(p_pro uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.identity_checks c WHERE c.pro_id = p_pro AND c.status = 'verified')
      OR EXISTS (SELECT 1 FROM public.pros r CROSS JOIN public.identity_service s
                 WHERE r.id = p_pro AND r.identity_seen_on IS NOT NULL
                   AND (NOT s.is_on OR s.live_since IS NULL OR public.setting('identity_legacy_days') = 0
                        OR public.pk_day(now()) <= public.pk_day(s.live_since) + public.setting('identity_legacy_days')::integer));
$$;

/** What may truthfully be said about who he is. Never "identity checked" unless a service checked it. */
CREATE OR REPLACE FUNCTION public.identity_line(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.identity_checks c WHERE c.pro_id = p_pro AND c.status = 'verified')
      THEN jsonb_build_object('kind', 'verified', 'on',
             (SELECT public.pk_day(max(c.decided_at)) FROM public.identity_checks c WHERE c.pro_id = p_pro AND c.status = 'verified'))
    WHEN public.identity_ok(p_pro)
      THEN jsonb_build_object('kind', 'staff', 'on', (SELECT r.identity_seen_on FROM public.pros r WHERE r.id = p_pro))
    WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_pro AND coalesce(u.phone, '') <> '')
      THEN jsonb_build_object('kind', 'phone')
    ELSE jsonb_build_object('kind', 'none') END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_on(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT q.is_on FROM public.quizzes q WHERE q.key = p_key), false);
$$;

/** A quiz that is switched off asks nothing. One that is on must have been passed. */
CREATE OR REPLACE FUNCTION public.quiz_ok(p_pro uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT public.quiz_on(p_key)
      OR EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.pro_id = p_pro AND a.quiz = p_key AND a.passed);
$$;

/** Is this kind of job risky? "Something else" is, wherever its trade says so. */
CREATE OR REPLACE FUNCTION public.job_type_risky(p_trade text, p_type integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_type IS NULL THEN coalesce((SELECT t.something_else_risky FROM public.trades t WHERE t.slug = p_trade), false)
              ELSE coalesce((SELECT t.risky FROM public.job_types t WHERE t.id = p_type), false) END;
$$;

/** A guarantee claim that went his customer's way. */
CREATE OR REPLACE FUNCTION public.claim_covered(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_status IN ('coming', 'checking', 'fixed', 'replacing');
$$;

/**
 * What he may take in a trade today, the one rule:
 *   none  — nothing (not approved, a trade he does not hold, paused, or a step missing);
 *   trial — basic job types, one job at a time, at or under the trial price cap;
 *   basic — every basic job; a risky one only as a checked job;
 *   full  — everything in the trade.
 */
CREATE OR REPLACE FUNCTION public.trade_level(p_pro uuid, p_trade text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t      public.pro_trades;
  v_with   text;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.pros WHERE id = p_pro;
  IF v_status IS DISTINCT FROM 'approved' THEN
    RETURN 'none';
  END IF;
  SELECT * INTO v_t FROM public.pro_trades WHERE pro_id = p_pro AND trade = p_trade;
  IF v_t.pro_id IS NULL OR v_t.status IN ('paused', 'stopped') THEN
    RETURN 'none';
  END IF;
  -- Approved before D37: as before, until sorted by his record. Past the identity deadline, trial limits.
  IF v_t.status = 'legacy' THEN
    RETURN CASE WHEN public.identity_ok(p_pro) THEN 'full' ELSE 'trial' END;
  END IF;
  -- UPS and inverter: all of it is risky, and it opens only with risky Electrician work (fix a).
  SELECT opens_with INTO v_with FROM public.trades WHERE slug = p_trade;
  IF v_with IS NOT NULL THEN
    RETURN CASE WHEN public.trade_level(p_pro, v_with) = 'full' THEN 'full' ELSE 'none' END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = p_pro)
     OR NOT public.quiz_ok(p_pro, 'rules') OR NOT public.quiz_ok(p_pro, 'safety:' || p_trade) THEN
    RETURN 'none';
  END IF;
  -- However many good jobs, no verified identity means trial limits.
  IF v_t.status = 'trial' OR NOT public.identity_ok(p_pro) THEN
    RETURN 'trial';
  END IF;
  RETURN CASE WHEN v_t.risky = 'unlocked' THEN 'full' ELSE 'basic' END;
END;
$$;

/** His clean record in a trade: finished, his own price, no claim found against it, no low stars. */
CREATE OR REPLACE FUNCTION public.clean_record(p_pro uuid, p_trade text)
RETURNS TABLE (n bigint, risky_n bigint, first_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*), count(*) FILTER (WHERE public.job_type_risky(j.trade, j.job_type_id)), min(j.finished_at)
  FROM public.jobs j
  WHERE j.pro_id = p_pro AND j.trade = p_trade AND j.status = 'done' AND NOT j.paid_by_pechkas
    AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND public.claim_covered(c.status))
    AND NOT EXISTS (SELECT 1 FROM public.ratings x WHERE x.job_id = j.id AND x.side = 'customer' AND x.stars <= 2);
$$;

/**
 * Has he earned a checked risky job in this trade? Approved with verified
 * identity, the trade's safety quiz switched on and passed, a clean record
 * long enough, no claim found against him lately, no check under way, and
 * every number the owner sets for this already set.
 */
CREATE OR REPLACE FUNCTION public.risk_ready(p_pro uuid, p_trade text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n     bigint;
  v_first timestamptz;
BEGIN
  IF public.trade_level(p_pro, p_trade) <> 'basic' THEN
    RETURN false;
  END IF;
  IF public.setting('risky_clean_jobs') = 0 OR public.setting('risky_clean_days') = 0
     OR public.setting('risky_claim_free_days') = 0 OR public.setting('risky_retry_days') = 0
     OR public.setting('checker_fee_paisa') = 0 OR public.setting('checker_answer_minutes') = 0
     OR public.setting('checker_accountable_days') = 0 THEN
    RETURN false;
  END IF;
  -- The checked safety quiz is part of the bar for risky work: off means not yet.
  IF NOT public.quiz_on('safety:' || p_trade) OR NOT public.quiz_ok(p_pro, 'safety:' || p_trade) THEN
    RETURN false;
  END IF;
  SELECT c.n, c.first_at INTO v_n, v_first FROM public.clean_record(p_pro, p_trade) c;
  IF v_n < public.setting('risky_clean_jobs')
     OR v_first > now() - make_interval(days => public.setting('risky_clean_days')::integer) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.guarantee_claims c JOIN public.jobs j ON j.id = c.job_id
             WHERE c.pro_id = p_pro AND j.trade = p_trade AND public.claim_covered(c.status)
               AND c.created_at > now() - make_interval(days => public.setting('risky_claim_free_days')::integer)) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = p_pro AND k.trade = p_trade
             AND (k.status IN ('asked', 'accepted')
                  OR (k.status IN ('not_yet', 'unsafe')
                      AND k.reported_at > now() - make_interval(days => public.setting('risky_retry_days')::integer)))) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

/**
 * Who the app asks to check his first risky job: approved in the trade with
 * risky work unlocked (never one approved before D37 and not yet sorted),
 * verified, serving the sector, free of strikes, a pause and an overdue fee,
 * never twice for the same man, and never anybody who has worked for one of
 * his customers. The least-used first.
 */
CREATE OR REPLACE FUNCTION public.pick_checker(p_pro uuid, p_trade text, p_sector text, p_customer uuid, p_skip uuid[])
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.pros c
  JOIN public.pro_trades t ON t.pro_id = c.id AND t.trade = p_trade AND t.status = 'approved' AND t.risky = 'unlocked'
  WHERE c.status = 'approved' AND c.id <> p_pro AND c.id IS DISTINCT FROM p_customer
    AND NOT (c.id = ANY (coalesce(p_skip, '{}'::uuid[])))
    AND p_sector = ANY (c.sectors)
    AND public.trade_level(c.id, p_trade) = 'full'
    AND NOT public.pro_paused(c.id) AND NOT public.pay_blocked(c.id)
    AND NOT EXISTS (SELECT 1 FROM public.checker_strikes s WHERE s.checker_id = c.id AND s.lifted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = p_pro AND k.checker_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.jobs a JOIN public.jobs b ON b.customer_id = a.customer_id
                    WHERE a.pro_id = c.id AND b.pro_id = p_pro
                      AND a.status IN ('assigned', 'done', 'stopped') AND b.status IN ('assigned', 'done', 'stopped'))
    AND (p_customer IS NULL OR NOT EXISTS (SELECT 1 FROM public.blocks bl WHERE bl.customer_id = p_customer AND bl.pro_id = c.id))
  ORDER BY (SELECT count(*) FROM public.risk_checks k WHERE k.checker_id = c.id), random()
  LIMIT 1;
$$;

/** Could his first risky job be checked here, now: an assessor arranged, or a checker the app could pick? */
CREATE OR REPLACE FUNCTION public.check_possible(p_pro uuid, p_trade text, p_sector text, p_customer uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = p_pro AND k.trade = p_trade AND k.kind = 'outside' AND k.status = 'ready') THEN
    RETURN public.trade_level(p_pro, p_trade) = 'basic';
  END IF;
  RETURN public.risk_ready(p_pro, p_trade) AND public.pick_checker(p_pro, p_trade, p_sector, p_customer, '{}') IS NOT NULL;
END;
$$;

/** Would this job be his checked job? */
CREATE OR REPLACE FUNCTION public.needs_check(p_pro uuid, p_trade text, p_type integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.trade_level(p_pro, p_trade) = 'basic' AND public.job_type_risky(p_trade, p_type);
$$;

/**
 * May he take this job? NULL for yes, otherwise why not. Every door asks it:
 * the feed, an offer, her choosing him, the office by hand, "ask for him
 * again". The price cap is the offer's, and is checked where a price is.
 */
CREATE OR REPLACE FUNCTION public.pro_gate(p_pro uuid, p_trade text, p_type integer, p_sector text, p_customer uuid, p_job uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_level text := public.trade_level(p_pro, p_trade);
  v_risky boolean := public.job_type_risky(p_trade, p_type);
BEGIN
  IF v_level = 'none' THEN
    RETURN 'trade';
  END IF;
  IF v_level = 'trial' THEN
    IF v_risky THEN
      RETURN 'risky';
    END IF;
    -- "Something else" opens on approval, even where it is not risky.
    IF p_type IS NULL THEN
      RETURN 'something_else';
    END IF;
    IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.pro_id = p_pro AND j.status = 'assigned' AND j.id IS DISTINCT FROM p_job) THEN
      RETURN 'one_job';
    END IF;
    RETURN NULL;
  END IF;
  IF v_level = 'basic' AND v_risky AND NOT public.check_possible(p_pro, p_trade, p_sector, p_customer) THEN
    RETURN 'risky';
  END IF;
  RETURN NULL;
END;
$$;

/** The trial's price cap, for an offer at this price. NULL when it is within it. */
CREATE OR REPLACE FUNCTION public.trial_cap_why(p_pro uuid, p_trade text, p_price bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.trade_level(p_pro, p_trade) <> 'trial' THEN NULL
    WHEN public.setting('trial_price_cap_paisa') = 0 THEN 'Pechkas has not set the price limit for first jobs yet, so no first-job offers can be made.'
    WHEN p_price > public.setting('trial_price_cap_paisa') THEN 'On your first jobs you can offer at most ' || public.rs(public.setting('trial_price_cap_paisa')) || '.'
  END;
$$;

/** Can a customer here post this kind of job? Basic work always; risky work only where somebody can do it. */
CREATE OR REPLACE FUNCTION public.type_open(p_trade text, p_type integer, p_sector text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT public.job_type_risky(p_trade, p_type)
      OR EXISTS (SELECT 1 FROM public.pros r
                 WHERE r.status = 'approved' AND p_sector = ANY (r.sectors)
                   AND (public.trade_level(r.id, p_trade) = 'full'
                        OR EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = r.id AND k.trade = p_trade
                                   AND k.kind = 'outside' AND k.status = 'ready')));
$$;


-- --- His trades follow his application ---------------------------------------------------------------

/**
 * Applying puts each trade on trial. Approved outside the app's rule — before
 * D37, inserted as approved, or approved by hand in the SQL editor — is
 * `legacy`: it works as before until sorted, and his identity counts as seen
 * by Pechkas staff on the day of the latest check on record (or of approval).
 */
CREATE OR REPLACE FUNCTION public.sync_pro_trades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_by_hand boolean := NEW.status = 'approved' AND coalesce(current_setting('pechkas.by_rule', true), '') <> 'on'
                       AND (TG_OP = 'INSERT' OR OLD.status IN ('applied', 'rejected'));
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.pros SET rejected_at = now() WHERE id = NEW.id;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'suspended' THEN
    v_by_hand := true;
  END IF;
  IF v_by_hand THEN
    UPDATE public.pros
    SET approved_how = 'hand',
        identity_seen_on = coalesce(identity_seen_on,
          (SELECT max(c.checked_on) FROM public.pro_checks c WHERE c.pro_id = NEW.id AND c.step = 'identity'),
          public.pk_day(coalesce(NEW.decided_at, now())))
    WHERE id = NEW.id;
    INSERT INTO public.pro_trades AS pt (pro_id, trade, status, note)
    SELECT NEW.id, t, 'legacy', 'Approved by hand, outside the first-jobs rules.' FROM unnest(NEW.trades) AS t
    WHERE EXISTS (SELECT 1 FROM public.trades x WHERE x.slug = t)
    ON CONFLICT (pro_id, trade) DO UPDATE SET status = 'legacy', note = EXCLUDED.note
      WHERE pt.status = 'trial'
        AND NOT EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.pro_id = NEW.id AND x.trade = pt.trade);
  END IF;
  INSERT INTO public.pro_trades (pro_id, trade, status)
  SELECT NEW.id, t, 'trial' FROM unnest(NEW.trades) AS t
  WHERE EXISTS (SELECT 1 FROM public.trades x WHERE x.slug = t)
  ON CONFLICT (pro_id, trade) DO NOTHING;
  DELETE FROM public.pro_trades x
  WHERE x.pro_id = NEW.id AND x.status = 'trial' AND NOT (x.trade = ANY (NEW.trades))
    AND NOT EXISTS (SELECT 1 FROM public.trial_jobs t WHERE t.pro_id = x.pro_id AND t.trade = x.trade);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS pro_trades_synced ON public.pros;
CREATE TRIGGER pro_trades_synced AFTER INSERT OR UPDATE OF trades, status ON public.pros
  FOR EACH ROW EXECUTE FUNCTION public.sync_pro_trades();

-- Before D37: everybody approved or suspended is legacy; everybody else on trial. First run only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.applied_migrations WHERE name = '20261113000000_first_jobs') THEN
    UPDATE public.pros r
    SET approved_how = 'hand',
        identity_seen_on = coalesce((SELECT max(c.checked_on) FROM public.pro_checks c WHERE c.pro_id = r.id AND c.step = 'identity'),
                                    public.pk_day(coalesce(r.decided_at, now())))
    WHERE r.status IN ('approved', 'suspended');
    INSERT INTO public.pro_trades (pro_id, trade, status, note)
    SELECT r.id, t, CASE WHEN r.status IN ('approved', 'suspended') THEN 'legacy' ELSE 'trial' END,
           CASE WHEN r.status IN ('approved', 'suspended') THEN 'Approved before the first-jobs rules.' END
    FROM public.pros r CROSS JOIN LATERAL unnest(r.trades) AS t
    WHERE EXISTS (SELECT 1 FROM public.trades x WHERE x.slug = t)
    ON CONFLICT (pro_id, trade) DO NOTHING;
  END IF;
END $$;


-- --- Approving by rule ---------------------------------------------------------------------------------

/** The person: number checked by SMS, his photo, the rules quiz. Somebody the office turned down waits for a person. */
CREATE OR REPLACE FUNCTION public.person_ready_why(p_pro uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_pro AND coalesce(u.phone, '') <> '') THEN 'phone'
    WHEN NOT EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = p_pro) THEN 'face'
    WHEN NOT public.quiz_ok(p_pro, 'rules') THEN 'rules'
  END;
$$;

CREATE OR REPLACE FUNCTION public.promote_person(p_pro uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros r WHERE r.id = p_pro AND r.status = 'applied' AND r.rejected_at IS NULL)
     OR public.person_ready_why(p_pro) IS NOT NULL THEN
    RETURN false;
  END IF;
  PERFORM set_config('pechkas.by_rule', 'on', true);
  UPDATE public.pros SET status = 'approved', approved_how = 'rule', status_reason = NULL,
         decided_at = now(), decided_by = NULL, updated_at = now()
  WHERE id = p_pro;
  PERFORM set_config('pechkas.by_rule', 'off', true);
  PERFORM public.tell(p_pro, 'pro_ready', NULL, '/pro', '{}'::jsonb);
  RETURN true;
END;
$$;

/** A trade on trial: three good jobs and verified identity approve it. */
CREATE OR REPLACE FUNCTION public.promote_trade(p_pro uuid, p_trade text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pro_trades t WHERE t.pro_id = p_pro AND t.trade = p_trade AND t.status = 'trial')
     OR (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = p_trade AND x.status = 'good')
        < public.setting('trial_jobs')
     OR NOT public.identity_ok(p_pro) THEN
    RETURN false;
  END IF;
  UPDATE public.pro_trades SET status = 'approved', approved_at = now(), approved_by = 'trial',
         note = 'Three good jobs.', since = now()
  WHERE pro_id = p_pro AND trade = p_trade;
  PERFORM public.tell(p_pro, 'trade_approved', NULL, '/pro',
                      jsonb_build_object('trade', (SELECT name FROM public.trades WHERE slug = p_trade)));
  RETURN true;
END;
$$;


-- --- Pauses -----------------------------------------------------------------------------------------

/** Stops new work in one trade, or in all of them (NULL). Jobs he has go on. Offers waiting are withdrawn. */
CREATE OR REPLACE FUNCTION public.pause_trade(p_pro uuid, p_trade text, p_reason text, p_ref uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.pro_trades
  SET paused_from = CASE WHEN status = 'paused' THEN paused_from ELSE status END,
      status = 'paused', pause_reason = p_reason, pause_ref = p_ref,
      paused_at = CASE WHEN status = 'paused' THEN paused_at ELSE now() END,
      note = CASE p_reason WHEN 'safety' THEN 'Paused: a safety report.' WHEN 'face' THEN 'Paused: not the man in the photo.'
                           WHEN 'works_no' THEN 'Paused: two "It works: no" on first jobs.'
                           ELSE 'Paused: two first jobs with a "no".' END,
      since = now()
  WHERE pro_id = p_pro AND (p_trade IS NULL OR trade = p_trade) AND status IN ('trial', 'approved', 'legacy', 'paused')
    -- A pause by rule never overwrites one for a safety report.
    AND NOT (status = 'paused' AND pause_reason IN ('safety', 'face') AND p_reason IN ('works_no', 'answers'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    UPDATE public.offers o SET status = 'withdrawn', updated_at = now()
    FROM public.jobs j
    WHERE o.job_id = j.id AND o.pro_id = p_pro AND o.status = 'pending' AND j.status = 'open'
      AND (p_trade IS NULL OR j.trade = p_trade);
    IF p_trade IS NULL THEN
      PERFORM public.tell(p_pro, 'all_paused', NULL, '/pro', '{}'::jsonb);
    ELSE
      PERFORM public.tell(p_pro, 'trade_paused', NULL, '/pro',
                          jsonb_build_object('trade', (SELECT name FROM public.trades WHERE slug = p_trade)));
    END IF;
  END IF;
  RETURN v_n;
END;
$$;

/** Lifts the pauses this decision was about: back to where each trade was. */
CREATE OR REPLACE FUNCTION public.lift_pause(p_pro uuid, p_trade text, p_ref uuid, p_paused_at timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.pro_trades
  SET status = coalesce(paused_from, 'trial'), paused_from = NULL, pause_reason = NULL, pause_ref = NULL, paused_at = NULL,
      note = 'Pause lifted.', since = now()
  WHERE pro_id = p_pro AND status = 'paused'
    AND (p_trade IS NULL OR trade = p_trade)
    AND (p_ref IS NULL OR pause_ref = p_ref)
    AND (p_paused_at IS NULL OR paused_at = p_paused_at);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    -- Whatever paused him is answered: the same "no"s never pause him again.
    UPDATE public.trial_jobs SET forgiven = true
    WHERE pro_id = p_pro AND (p_trade IS NULL OR trade = p_trade) AND NOT forgiven;
    PERFORM public.tell(p_pro, 'trade_unpaused', NULL, '/pro', '{}'::jsonb);
  END IF;
  RETURN v_n;
END;
$$;

/** Two "It works: no", or two trial jobs with a "no" on another question, pause a trade on trial. */
CREATE OR REPLACE FUNCTION public.trial_pause_check(p_pro uuid, p_trade text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pro_trades t WHERE t.pro_id = p_pro AND t.trade = p_trade AND t.status = 'trial') THEN
    RETURN;
  END IF;
  IF (SELECT coalesce(sum(x.works_no), 0) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = p_trade AND NOT x.forgiven) >= 2 THEN
    PERFORM public.pause_trade(p_pro, p_trade, 'works_no', NULL);
  ELSIF (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = p_trade AND NOT x.forgiven
         AND (x.on_time = false OR x.explained = false OR x.clean = false)) >= 2 THEN
    PERFORM public.pause_trade(p_pro, p_trade, 'answers', NULL);
  END IF;
END;
$$;


-- --- Counting a trial job --------------------------------------------------------------------------------

/**
 * Is the customer a real, separate person? NULL if so. A checked number of
 * her own, not his; not somebody he already has a good job for; her home a
 * real distance from the others; and an account older than his application,
 * or one with a finished job from somebody else.
 */
CREATE OR REPLACE FUNCTION public.trial_customer_why(p_job uuid, p_pro uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job       public.jobs;
  v_phone     text;
  v_pro_phone text;
  v_gap       bigint := public.setting('trial_customer_gap_m');
  v_joined    timestamptz;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  IF v_job.customer_id = p_pro THEN
    RETURN 'same_person';
  END IF;
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_job.customer_id;
  IF coalesce(v_phone, '') = '' THEN
    RETURN 'phone_not_checked';
  END IF;
  SELECT phone INTO v_pro_phone FROM auth.users WHERE id = p_pro;
  IF v_phone = v_pro_phone THEN
    RETURN 'same_person';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trial_jobs g JOIN auth.users u ON u.id = g.customer_id
             WHERE g.pro_id = p_pro AND g.status = 'good' AND g.job_id <> p_job
               AND (g.customer_id = v_job.customer_id OR u.phone = v_phone)) THEN
    RETURN 'repeat_customer';
  END IF;
  IF v_job.lat IS NULL OR v_job.lng IS NULL THEN
    RETURN 'no_pin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trial_jobs g JOIN public.jobs x ON x.id = g.job_id
             WHERE g.pro_id = p_pro AND g.status = 'good' AND g.job_id <> p_job
               AND (x.lat IS NULL OR x.lng IS NULL OR public.distance_m(x.lat, x.lng, v_job.lat, v_job.lng) < v_gap)) THEN
    RETURN 'too_close';
  END IF;
  v_joined := coalesce((SELECT min(e.at) FROM public.pro_trade_events e WHERE e.pro_id = p_pro),
                       (SELECT r.applied_at FROM public.pros r WHERE r.id = p_pro));
  IF NOT ((SELECT p.created_at FROM public.profiles p WHERE p.id = v_job.customer_id) < v_joined
          OR EXISTS (SELECT 1 FROM public.jobs o WHERE o.customer_id = v_job.customer_id AND o.status = 'done'
                     AND o.id <> p_job AND o.pro_id IS DISTINCT FROM p_pro)) THEN
    RETURN 'new_account';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trial_set(p_job uuid, p_pro uuid, p_status text, p_why text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.trial_jobs SET status = p_status, why = p_why, decided_at = now()
  WHERE job_id = p_job AND pro_id = p_pro;
$$;

/**
 * Looks at one trial job again. A covered claim stops it counting even after
 * it counted, and a trade it approved goes back to trial. Anything not yet
 * known (her answers, a claim being decided, his commission) waits.
 */
CREATE OR REPLACE FUNCTION public.trial_review(p_job uuid, p_pro uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.trial_jobs;
  v_job public.jobs;
  v_txn uuid;
  v_why text;
BEGIN
  SELECT * INTO v_row FROM public.trial_jobs WHERE job_id = p_job AND pro_id = p_pro FOR UPDATE;
  IF v_row.status IS NULL OR v_row.status NOT IN ('waiting', 'good') THEN
    RETURN v_row.status;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;

  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND public.claim_covered(c.status)) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'claim');
    IF v_row.status = 'good' THEN
      UPDATE public.pro_trades SET status = 'trial', approved_at = NULL, approved_by = NULL,
             note = 'Back on trial: a guarantee claim on a first job.', since = now()
      WHERE pro_id = p_pro AND trade = v_row.trade AND status = 'approved' AND approved_by = 'trial'
        AND (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = p_pro AND x.trade = v_row.trade AND x.status = 'good')
            < public.setting('trial_jobs');
    END IF;
    RETURN 'not_counted';
  END IF;
  IF v_row.status = 'good' THEN
    RETURN 'good';
  END IF;

  IF v_job.paid_by_pechkas THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  IF v_row.answered_at IS NULL THEN
    IF v_job.finished_at < now() - interval '2 days' THEN
      PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_answers');
      RETURN 'not_counted';
    END IF;
    RETURN 'waiting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'before')
     OR NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.job_id = p_job AND p.pro_id = p_pro AND p.stage = 'after') THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'photos');
    RETURN 'not_counted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cases x WHERE x.job_id = p_job) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'payment_case');
    RETURN 'not_counted';
  END IF;
  -- A claim still being decided: wait for it.
  IF EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = p_job AND c.status <> 'not_covered') THEN
    RETURN 'waiting';
  END IF;
  -- Real payment: the commission on it is posted, not reversed, and paid.
  SELECT t.id INTO v_txn FROM public.ledger_txns t WHERE t.idempotency_key = 'commission:' || p_job;
  IF v_txn IS NULL OR EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = v_txn) THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', 'no_payment');
    RETURN 'not_counted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pay_fees(p_pro) f WHERE f.txn = v_txn AND f.status = 'paid') THEN
    RETURN 'waiting';
  END IF;
  -- The distance between homes is the owner's number: until it is set, nothing counts.
  IF public.setting('trial_customer_gap_m') = 0 THEN
    RETURN 'waiting';
  END IF;
  v_why := public.trial_customer_why(p_job, p_pro);
  IF v_why IS NOT NULL THEN
    PERFORM public.trial_set(p_job, p_pro, 'not_counted', v_why);
    RETURN 'not_counted';
  END IF;
  PERFORM public.trial_set(p_job, p_pro, 'good', NULL);
  PERFORM public.promote_trade(p_pro, v_row.trade);
  RETURN 'good';
END;
$$;


-- --- A job given to him, and its end ------------------------------------------------------------------

/**
 * Given a job: his photo is locked (fix b), and a trade on trial records the
 * job as one of its first. The job ending closes the record and any check.
 */
CREATE OR REPLACE FUNCTION public.on_job_first_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'assigned' AND OLD.status IS DISTINCT FROM 'assigned' AND NEW.pro_id IS NOT NULL THEN
    UPDATE public.pro_faces SET locked_at = now() WHERE pro_id = NEW.pro_id AND locked_at IS NULL;
    IF EXISTS (SELECT 1 FROM public.pro_trades t WHERE t.pro_id = NEW.pro_id AND t.trade = NEW.trade AND t.status = 'trial') THEN
      INSERT INTO public.trial_jobs (job_id, pro_id, trade, customer_id)
      VALUES (NEW.id, NEW.pro_id, NEW.trade, NEW.customer_id)
      ON CONFLICT (job_id, pro_id) DO NOTHING;
    END IF;
  ELSIF OLD.status = 'assigned' AND NEW.status IS DISTINCT FROM 'assigned' AND OLD.pro_id IS NOT NULL THEN
    UPDATE public.trial_jobs SET status = CASE WHEN NEW.status = 'done' THEN 'waiting' ELSE 'not_counted' END,
           why = CASE WHEN NEW.status = 'done' THEN NULL ELSE 'not_done' END,
           decided_at = CASE WHEN NEW.status = 'done' THEN NULL ELSE now() END
    WHERE job_id = NEW.id AND pro_id = OLD.pro_id AND status = 'open';
    -- A check that never began ends with the job; one that began may still be reported.
    -- An assessor the owner arranged waits for his next risky job.
    UPDATE public.risk_checks
    SET status = CASE WHEN kind = 'outside' THEN 'ready' ELSE 'cancelled' END,
        job_id = CASE WHEN kind = 'outside' THEN NULL ELSE job_id END
    WHERE job_id = NEW.id AND pro_id = OLD.pro_id
      AND (status = 'asked' OR (status = 'accepted' AND NEW.status NOT IN ('done', 'stopped')));
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_first_jobs ON public.jobs;
CREATE TRIGGER job_first_jobs AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_job_first_jobs();

/** "Not finished yet" on a trial job: that job does not count, and two of them pause the trade. */
CREATE OR REPLACE FUNCTION public.on_check_first_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.trial_jobs;
BEGIN
  IF NEW.answer = 'not_finished' AND (TG_OP = 'INSERT' OR OLD.answer IS DISTINCT FROM 'not_finished') THEN
    UPDATE public.trial_jobs x SET works_no = x.works_no + 1,
           status = CASE WHEN x.status IN ('open', 'waiting') THEN 'not_counted' ELSE x.status END,
           why = CASE WHEN x.status IN ('open', 'waiting') THEN 'works_no' ELSE x.why END,
           decided_at = now()
    FROM public.jobs j
    WHERE j.id = NEW.job_id AND x.job_id = j.id AND x.pro_id = j.pro_id
    RETURNING x.* INTO v_row;
    IF v_row.pro_id IS NOT NULL THEN
      PERFORM public.trial_pause_check(v_row.pro_id, v_row.trade);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_check_first_jobs ON public.job_checks;
CREATE TRIGGER job_check_first_jobs AFTER INSERT OR UPDATE OF answer ON public.job_checks
  FOR EACH ROW EXECUTE FUNCTION public.on_check_first_jobs();


-- --- His photo -------------------------------------------------------------------------------------------

/** Is this an upload of his own, really in storage, and not already used for something else? */
CREATE OR REPLACE FUNCTION public.fresh_upload(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_path IS NOT NULL AND split_part(p_path, '/', 1) = auth.uid()::text AND p_path !~ '\.\.'
     AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'job-media' AND o.name = p_path)
     AND NOT EXISTS (SELECT 1 FROM public.job_photos p WHERE p.path = p_path)
     AND NOT EXISTS (SELECT 1 FROM public.job_media m WHERE m.path = p_path)
     AND NOT EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.path = p_path)
     AND NOT EXISTS (SELECT 1 FROM public.face_changes c WHERE c.path = p_path);
$$;

/** His face, taken with the app's camera. Free to change until his first job is given to him. */
CREATE OR REPLACE FUNCTION public.set_my_face(p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid()) THEN
    RETURN public.refuse('Apply as a technician first.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pro_faces WHERE pro_id = auth.uid() AND locked_at IS NOT NULL) THEN
    RETURN public.refuse('Your photo is locked since your first job, because customers check it at the door. To change it, ask Pechkas and say why.', 'face');
  END IF;
  IF NOT public.fresh_upload(p_path) THEN
    RETURN public.refuse('The photo did not finish uploading. Try again.', 'face');
  END IF;
  INSERT INTO public.pro_faces (pro_id, path) VALUES (auth.uid(), p_path)
  ON CONFLICT (pro_id) DO UPDATE SET path = EXCLUDED.path, set_at = now();
  PERFORM public.promote_person(auth.uid());
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** After the lock: a new photo and the reason, for the owner to approve or not. */
CREATE OR REPLACE FUNCTION public.pro_face_change(p_path text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pro_faces WHERE pro_id = auth.uid() AND locked_at IS NOT NULL) THEN
    RETURN public.refuse('Your photo is not locked: change it yourself.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.face_changes WHERE pro_id = auth.uid() AND status = 'waiting') THEN
    RETURN public.refuse('Your last request is still waiting for the owner.');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 OR length(v_reason) > 300 THEN
    RETURN public.refuse('Say why, in a sentence.', 'reason');
  END IF;
  IF public.looks_like_cnic(v_reason) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'reason');
  END IF;
  IF NOT public.fresh_upload(p_path) THEN
    RETURN public.refuse('The photo did not finish uploading. Try again.', 'face');
  END IF;
  INSERT INTO public.face_changes (pro_id, path, reason) VALUES (auth.uid(), p_path, v_reason);
  PERFORM public.tell_office('face_change_office', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_face_change(p_change uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c    public.face_changes;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can approve a new photo.');
  END IF;
  SELECT * INTO v_c FROM public.face_changes WHERE id = p_change FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status <> 'waiting' THEN
    RETURN public.refuse('This request has already been decided.');
  END IF;
  IF v_note IS NULL OR length(v_note) > 300 THEN
    RETURN public.refuse('Write what you decided and why. He will read it.', 'note');
  END IF;
  UPDATE public.face_changes SET status = CASE WHEN p_approve THEN 'approved' ELSE 'refused' END,
         decided_at = now(), by_name = (SELECT name FROM public.staff WHERE id = auth.uid()), note = v_note
  WHERE id = p_change;
  IF p_approve THEN
    UPDATE public.pro_faces SET path = v_c.path, set_at = now() WHERE pro_id = v_c.pro_id;
  END IF;
  PERFORM public.tell(v_c.pro_id, 'face_change_decided', NULL, '/pro', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- At her door: "Yes, this is the man in the photo" -----------------------------------------------------

/**
 * At her door, before she gives him the start code. Yes lets him start. No stops the job,
 * gives it back to other technicians, pauses all his work, and reaches the
 * office as a written item.
 */
CREATE OR REPLACE FUNCTION public.customer_face_answer(p_job uuid, p_yes boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs;
  v_report uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid() FOR UPDATE;
  -- At her door: he has tapped Arrived, and the work has not started.
  IF v_job.id IS NULL OR v_job.status <> 'assigned' OR v_job.stage IS DISTINCT FROM 'arrived' THEN
    RETURN public.refuse('This is answered at your door, once he has arrived and before the work starts.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = v_job.pro_id) THEN
    RETURN public.refuse('There is no photo of him to check.');
  END IF;
  IF p_yes IS NULL THEN
    RETURN public.refuse('Say whether it is him.', 'answer');
  END IF;
  IF p_yes THEN
    UPDATE public.jobs SET face_confirmed_at = now(), updated_at = now() WHERE id = p_job;
    PERFORM public.log_job(p_job, 'face_confirmed');
    RETURN jsonb_build_object('ok', true);
  END IF;
  INSERT INTO public.safety_reports (pro_id, trade, kind, job_id, from_id, words)
  VALUES (v_job.pro_id, NULL, 'face', p_job, auth.uid(), 'The customer said the man at her door was not the man in the photo.')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_report;
  PERFORM public.log_job(p_job, 'face_no');
  PERFORM public.pause_trade(v_job.pro_id, NULL, 'face', v_report);
  PERFORM public.reopen_job(p_job, 'not_the_man', 'The customer said this was not the man in the photo.');
  PERFORM public.tell_office('face_no_office', p_job, public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true, 'reopened', true);
END;
$$;


-- --- Her four questions on a first job -----------------------------------------------------------------

/** On time, explained the work, left it clean. "It works" is her Yes or "Not finished yet". */
CREATE OR REPLACE FUNCTION public.answer_trial(p_job uuid, p_on_time boolean, p_explained boolean, p_clean boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
  v_row public.trial_jobs;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  SELECT * INTO v_row FROM public.trial_jobs x WHERE x.job_id = p_job AND x.customer_id = auth.uid() FOR UPDATE;
  IF v_job.id IS NULL OR v_row.job_id IS NULL THEN
    RETURN public.refuse('There are no questions for this job.');
  END IF;
  IF v_row.answered_at IS NOT NULL THEN
    RETURN public.refuse('You have already answered. Thank you.');
  END IF;
  IF NOT ((v_job.status = 'assigned' AND v_job.stage = 'checking')
          OR (v_job.status = 'done' AND v_job.finished_at > now() - interval '2 days')) THEN
    RETURN public.refuse('These questions are asked once the work is finished, for two days.');
  END IF;
  IF p_on_time IS NULL OR p_explained IS NULL OR p_clean IS NULL THEN
    RETURN public.refuse('Answer all three, yes or no.', 'answers');
  END IF;
  UPDATE public.trial_jobs SET on_time = p_on_time, explained = p_explained, clean = p_clean, answered_at = now(),
         status = CASE WHEN (p_on_time AND p_explained AND p_clean) OR status NOT IN ('open', 'waiting') THEN status ELSE 'not_counted' END,
         why = CASE WHEN (p_on_time AND p_explained AND p_clean) OR status NOT IN ('open', 'waiting') THEN why ELSE 'answers' END,
         decided_at = CASE WHEN (p_on_time AND p_explained AND p_clean) THEN decided_at ELSE now() END
  WHERE job_id = v_row.job_id AND pro_id = v_row.pro_id;
  PERFORM public.log_job(p_job, 'trial_answers', jsonb_build_object('on_time', p_on_time, 'explained', p_explained, 'clean', p_clean));
  PERFORM public.trial_pause_check(v_row.pro_id, v_row.trade);
  IF v_job.status = 'done' THEN
    PERFORM public.trial_review(p_job, v_row.pro_id);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- A safety report ----------------------------------------------------------------------------------

/** From the customer, during the job or within its guarantee. Pauses his trade at once. */
CREATE OR REPLACE FUNCTION public.report_safety(p_job uuid, p_words text, p_photo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs;
  v_words  text := nullif(btrim(coalesce(p_words, '')), '');
  v_report uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job AND customer_id = auth.uid();
  IF v_job.id IS NULL OR v_job.pro_id IS NULL
     OR NOT (v_job.status = 'assigned'
             OR (v_job.status IN ('done', 'stopped')
                 AND v_job.finished_at > now() - make_interval(days => public.guarantee_days_of(p_job)))) THEN
    RETURN public.refuse('A safety report can be made during the job or within its guarantee.');
  END IF;
  IF v_words IS NULL OR length(v_words) < 10 OR length(v_words) > 500 THEN
    RETURN public.refuse('Say what was unsafe, in a sentence or two.', 'words');
  END IF;
  IF public.looks_like_cnic(v_words) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'words');
  END IF;
  IF p_photo IS NOT NULL AND NOT public.fresh_upload(p_photo) THEN
    RETURN public.refuse('The photo did not finish uploading. Try again.', 'photo');
  END IF;
  INSERT INTO public.safety_reports (pro_id, trade, kind, job_id, from_id, words, photo)
  VALUES (v_job.pro_id, v_job.trade, 'safety', p_job, auth.uid(), v_words, p_photo)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_report;
  IF v_report IS NULL THEN
    RETURN public.refuse('You have already reported this job. Pechkas is looking at it.');
  END IF;
  PERFORM public.log_job(p_job, 'safety_report');
  PERFORM public.pause_trade(v_job.pro_id, v_job.trade, 'safety', v_report);
  PERFORM public.tell_office('safety_office', p_job, public.job_vars(v_job));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** His side of a report about him, once, in writing. */
CREATE OR REPLACE FUNCTION public.pro_safety_reply(p_report uuid, p_words text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.safety_reports s WHERE s.id = p_report AND s.pro_id = auth.uid()
                 AND s.status = 'open' AND s.his_side IS NULL) THEN
    RETURN public.refuse('This report has been decided, or you have already answered.');
  END IF;
  IF v_words IS NULL OR length(v_words) < 10 OR length(v_words) > 500 THEN
    RETURN public.refuse('Write your side, in a sentence or more.', 'words');
  END IF;
  IF public.looks_like_cnic(v_words) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'words');
  END IF;
  UPDATE public.safety_reports SET his_side = v_words, his_side_at = now() WHERE id = p_report;
  PERFORM public.tell_office('appeal_office', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * The office decides a report: upheld (a safety report stops that trade for
 * good; "not the man" suspends him), not upheld, or false — which lifts the
 * pause and puts a flag on whoever made it.
 */
CREATE OR REPLACE FUNCTION public.admin_safety_decide(p_report uuid, p_outcome text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r    public.safety_reports;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.staff WHERE id = auth.uid() AND active;
  IF v_name IS NULL THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_r FROM public.safety_reports WHERE id = p_report FOR UPDATE;
  IF v_r.id IS NULL OR v_r.status <> 'open' THEN
    RETURN public.refuse('This report has already been decided.');
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('upheld', 'not_upheld', 'false') THEN
    RETURN public.refuse('Choose what you found.', 'outcome');
  END IF;
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write what you found. He will read it.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  UPDATE public.safety_reports SET status = p_outcome, decided_at = now(), by_name = v_name, note = v_note WHERE id = p_report;
  IF p_outcome = 'upheld' THEN
    IF v_r.kind = 'face' THEN
      UPDATE public.pros SET status = 'suspended', status_reason = left('The man at a customer''s door was not the man in your photo. ' || v_note, 300),
             decided_at = now(), decided_by = auth.uid(), updated_at = now()
      WHERE id = v_r.pro_id AND status = 'approved';
    ELSE
      UPDATE public.pro_trades SET status = 'stopped', note = 'Stopped: a safety report was upheld.', since = now()
      WHERE pro_id = v_r.pro_id AND pause_ref = p_report AND status = 'paused';
    END IF;
  ELSE
    PERFORM public.lift_pause(v_r.pro_id, NULL, p_report, NULL);
  END IF;
  PERFORM public.tell(v_r.pro_id, 'safety_decided', NULL, '/pro', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- A pause by rule: his appeal --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pro_appeal(p_trade text, p_words text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t     public.pro_trades;
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
BEGIN
  SELECT * INTO v_t FROM public.pro_trades WHERE pro_id = auth.uid() AND trade = p_trade FOR UPDATE;
  IF v_t.status IS DISTINCT FROM 'paused' THEN
    RETURN public.refuse('This work is not paused.');
  END IF;
  IF v_t.pause_reason IN ('safety', 'face') THEN
    RETURN public.refuse('Write your side on the report itself.', 'report');
  END IF;
  IF EXISTS (SELECT 1 FROM public.trade_appeals a WHERE a.pro_id = auth.uid() AND a.trade = p_trade AND a.paused_at = v_t.paused_at) THEN
    RETURN public.refuse('You have already appealed this pause. Pechkas will answer in the app.');
  END IF;
  IF v_words IS NULL OR length(v_words) < 10 OR length(v_words) > 500 THEN
    RETURN public.refuse('Write why the pause is wrong, in a sentence or more.', 'words');
  END IF;
  IF public.looks_like_cnic(v_words) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'words');
  END IF;
  INSERT INTO public.trade_appeals (pro_id, trade, reason, paused_at, words)
  VALUES (auth.uid(), p_trade, v_t.pause_reason, v_t.paused_at, v_words);
  PERFORM public.tell_office('appeal_office', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trade_appeal(p_appeal uuid, p_lift boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a    public.trade_appeals;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.staff WHERE id = auth.uid() AND active;
  IF v_name IS NULL THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_a FROM public.trade_appeals WHERE id = p_appeal FOR UPDATE;
  IF v_a.id IS NULL OR v_a.status <> 'waiting' THEN
    RETURN public.refuse('This appeal has already been answered.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 500 THEN
    RETURN public.refuse('Write your answer. He will read it.', 'note');
  END IF;
  UPDATE public.trade_appeals SET status = CASE WHEN p_lift THEN 'lifted' ELSE 'kept' END,
         decided_at = now(), by_name = v_name, note = v_note
  WHERE id = p_appeal;
  IF p_lift THEN
    PERFORM public.lift_pause(v_a.pro_id, v_a.trade, NULL, v_a.paused_at);
  END IF;
  PERFORM public.tell(v_a.pro_id, 'pause_appeal_decided', NULL, '/pro', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Quizzes --------------------------------------------------------------------------------------------

/** Questions drawn at random from the pool; never the answers. Resumes one started in the last hour. */
CREATE OR REPLACE FUNCTION public.start_quiz(p_quiz text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q    public.quizzes;
  v_try  public.quiz_attempts;
  v_last public.quiz_attempts;
  v_ids  integer[];
BEGIN
  SELECT * INTO v_q FROM public.quizzes WHERE key = p_quiz;
  IF v_q.key IS NULL OR NOT v_q.is_on THEN
    RETURN public.refuse('This quiz is not open.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status IN ('applied', 'approved')) THEN
    RETURN public.refuse('Apply as a technician first.');
  END IF;
  IF v_q.trade IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pro_trades WHERE pro_id = auth.uid() AND trade = v_q.trade) THEN
    RETURN public.refuse('This quiz is for a trade you have not applied for.');
  END IF;
  IF public.setting('quiz_pass_bps') = 0 THEN
    RETURN public.refuse('Pechkas has not set the pass mark yet. Try again later.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.pro_id = auth.uid() AND a.quiz = p_quiz AND a.passed) THEN
    RETURN public.refuse('You have passed this quiz already.');
  END IF;
  SELECT * INTO v_try FROM public.quiz_attempts a
  WHERE a.pro_id = auth.uid() AND a.quiz = p_quiz AND a.finished_at IS NULL AND a.started_at > now() - interval '1 hour'
  ORDER BY a.started_at DESC LIMIT 1;
  IF v_try.id IS NULL THEN
    SELECT * INTO v_last FROM public.quiz_attempts a
    WHERE a.pro_id = auth.uid() AND a.quiz = p_quiz AND a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 1;
    IF v_last.id IS NOT NULL THEN
      IF public.setting('quiz_retake_days') = 0 THEN
        RETURN public.refuse('Pechkas has not set when a quiz can be taken again yet.', 'retake');
      END IF;
      IF v_last.finished_at > now() - make_interval(days => public.setting('quiz_retake_days')::integer) THEN
        RETURN public.refuse('You can take it again from ' || to_char((v_last.finished_at + make_interval(days => public.setting('quiz_retake_days')::integer))
                             AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || '.', 'retake');
      END IF;
    END IF;
    SELECT array_agg(x.id) INTO v_ids FROM (
      SELECT q.id FROM public.quiz_questions q WHERE q.quiz = p_quiz AND q.active ORDER BY random() LIMIT v_q.draw) x;
    IF coalesce(cardinality(v_ids), 0) < v_q.draw THEN
      RETURN public.refuse('This quiz is not ready yet.');
    END IF;
    INSERT INTO public.quiz_attempts (pro_id, quiz, questions) VALUES (auth.uid(), p_quiz, v_ids) RETURNING * INTO v_try;
  END IF;
  RETURN jsonb_build_object('ok', true, 'attempt', v_try.id, 'questions', (
    SELECT jsonb_agg(jsonb_build_object('id', q.id, 'ur', q.ur, 'en', q.en,
                                        'options', q.options) ORDER BY o.n)
    FROM unnest(v_try.questions) WITH ORDINALITY AS o(id, n) JOIN public.quiz_questions q ON q.id = o.id));
END;
$$;

/** His answers, in the order the questions came: the number of each chosen option, from 0. */
CREATE OR REPLACE FUNCTION public.finish_quiz(p_attempt uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_try     public.quiz_attempts;
  v_right   integer;
  v_pass    integer := public.setting('quiz_pass_bps');
  v_passed  boolean;
  v_trade   text;
BEGIN
  SELECT * INTO v_try FROM public.quiz_attempts WHERE id = p_attempt AND pro_id = auth.uid() FOR UPDATE;
  IF v_try.id IS NULL OR v_try.finished_at IS NOT NULL THEN
    RETURN public.refuse('This quiz has already been marked.');
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) <> cardinality(v_try.questions) THEN
    RETURN public.refuse('Answer every question.', 'answers');
  END IF;
  SELECT count(*) INTO v_right
  FROM unnest(v_try.questions) WITH ORDINALITY AS o(id, n)
  JOIN public.quiz_questions q ON q.id = o.id
  WHERE jsonb_typeof(p_answers -> (o.n::integer - 1)) = 'number' AND (p_answers ->> (o.n::integer - 1))::numeric = q.answer;
  v_passed := v_pass > 0 AND v_right * 10000 >= cardinality(v_try.questions) * v_pass;
  UPDATE public.quiz_attempts SET finished_at = now(), correct = v_right, pass_bps = v_pass, passed = v_passed WHERE id = p_attempt;
  IF v_passed THEN
    PERFORM public.promote_person(auth.uid());
  END IF;
  RETURN jsonb_build_object('ok', true, 'passed', v_passed, 'correct', v_right, 'of', cardinality(v_try.questions),
                            'again_from', CASE WHEN NOT v_passed AND public.setting('quiz_retake_days') > 0
                                               THEN now() + make_interval(days => public.setting('quiz_retake_days')::integer) END);
END;
$$;

/** Switching a quiz on: enough questions, and for a safety quiz the qualified person who checked them. */
CREATE OR REPLACE FUNCTION public.admin_set_quiz(p_quiz text, p_on boolean, p_checked_by text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q  public.quizzes;
  v_by text := nullif(btrim(coalesce(p_checked_by, '')), '');
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can switch a quiz on or off.');
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE key = p_quiz FOR UPDATE;
  IF v_q.key IS NULL THEN
    RETURN public.refuse('There is no such quiz.');
  END IF;
  IF coalesce(p_on, false) THEN
    IF (SELECT count(*) FROM public.quiz_questions q WHERE q.quiz = p_quiz AND q.active) < 2 * v_q.draw THEN
      RETURN public.refuse('This quiz needs at least ' || 2 * v_q.draw || ' questions before it can be switched on.');
    END IF;
    IF v_q.trade IS NOT NULL AND (v_by IS NULL OR length(v_by) < 3) THEN
      RETURN public.refuse('Write the name and qualification of the person who checked the safety questions.', 'checked_by');
    END IF;
  END IF;
  UPDATE public.quizzes SET is_on = coalesce(p_on, false),
         checked_by = CASE WHEN coalesce(p_on, false) AND v_by IS NOT NULL THEN left(v_by, 120) ELSE checked_by END,
         checked_on = CASE WHEN coalesce(p_on, false) AND v_by IS NOT NULL THEN public.pk_day(now()) ELSE checked_on END
  WHERE key = p_quiz;
  INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
  VALUES ('quiz:' || p_quiz, CASE WHEN v_q.is_on THEN 1 ELSE 0 END, CASE WHEN coalesce(p_on, false) THEN 1 ELSE 0 END,
          auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Identity: the plug-in ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_identity_service(p_on boolean, p_service text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s   public.identity_service;
  v_svc text := nullif(btrim(coalesce(p_service, '')), '');
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can switch the identity service on or off.');
  END IF;
  SELECT * INTO v_s FROM public.identity_service WHERE id = 1 FOR UPDATE;
  IF coalesce(p_on, false) AND coalesce(v_svc, v_s.service) IS NULL THEN
    RETURN public.refuse('Write the name of the identity service.', 'service');
  END IF;
  UPDATE public.identity_service
  SET is_on = coalesce(p_on, false), service = coalesce(v_svc, service),
      live_since = CASE WHEN coalesce(p_on, false) THEN coalesce(live_since, now()) ELSE live_since END,
      changed_at = now(), changed_by = (SELECT name FROM public.staff WHERE id = auth.uid())
  WHERE id = 1;
  INSERT INTO public.setting_changes (key, old_value, new_value, by_id, by_name)
  VALUES ('identity_service', CASE WHEN v_s.is_on THEN 1 ELSE 0 END, CASE WHEN coalesce(p_on, false) THEN 1 ELSE 0 END,
          auth.uid(), (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** He asks to be verified. The service's own screens take it from here, outside this database. */
CREATE OR REPLACE FUNCTION public.identity_start()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s  public.identity_service;
  v_id uuid;
BEGIN
  SELECT * INTO v_s FROM public.identity_service WHERE id = 1;
  IF NOT v_s.is_on THEN
    RETURN public.refuse('Identity checks are not available yet.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status IN ('applied', 'approved')) THEN
    RETURN public.refuse('Apply as a technician first.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_checks c WHERE c.pro_id = auth.uid() AND c.status = 'verified') THEN
    RETURN public.refuse('Your identity is verified already.');
  END IF;
  SELECT c.id INTO v_id FROM public.identity_checks c
  WHERE c.pro_id = auth.uid() AND c.status = 'pending' AND c.started_at > now() - interval '1 day'
  ORDER BY c.started_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.identity_checks (pro_id, service) VALUES (auth.uid(), v_s.service) RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'check_id', v_id, 'service', v_s.service);
END;
$$;

/**
 * The service's answer. Called only with the service-role key, from the small
 * server function that checks the service's signature. Takes a result and the
 * service's reference, never a card number or image.
 */
CREATE OR REPLACE FUNCTION public.identity_result(p_check uuid, p_status text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c     public.identity_checks;
  v_trade text;
BEGIN
  SELECT * INTO v_c FROM public.identity_checks WHERE id = p_check FOR UPDATE;
  IF v_c.id IS NULL OR v_c.status <> 'pending' THEN
    RETURN public.refuse('No such check waiting.');
  END IF;
  IF p_status NOT IN ('verified', 'failed') THEN
    RETURN public.refuse('The result is verified or failed.', 'status');
  END IF;
  IF p_reference IS NULL OR length(p_reference) > 120 OR public.looks_like_cnic(p_reference) THEN
    RETURN public.refuse('The reference must be the service''s own, never a card number.', 'reference');
  END IF;
  UPDATE public.identity_checks SET status = p_status, reference = p_reference, decided_at = now() WHERE id = p_check;
  IF p_status = 'verified' THEN
    FOR v_trade IN SELECT t.trade FROM public.pro_trades t WHERE t.pro_id = v_c.pro_id AND t.status = 'trial' LOOP
      PERFORM public.promote_trade(v_c.pro_id, v_trade);
    END LOOP;
  END IF;
  PERFORM public.tell(v_c.pro_id, CASE WHEN p_status = 'verified' THEN 'identity_verified' ELSE 'identity_failed' END,
                      NULL, '/pro', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- His first risky job, checked ------------------------------------------------------------------------

/** When the checker must have said yes: a few hours, never later than an hour before the visit. */
CREATE OR REPLACE FUNCTION public.check_answer_by(p_start timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT greatest(now() + interval '15 minutes',
                  least(now() + make_interval(mins => public.setting('checker_answer_minutes')::integer),
                        coalesce(p_start - interval '1 hour', 'infinity'::timestamptz)));
$$;

/** Arranges the check as she chooses him: the assessor the owner arranged, or a checker the app picks. */
CREATE OR REPLACE FUNCTION public.arrange_check(p_job uuid, p_pro uuid, p_start timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job     public.jobs;
  v_checker uuid;
  v_id      uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  UPDATE public.risk_checks SET job_id = p_job, status = 'asked', asked_at = now(),
         answer_by = greatest(now() + interval '15 minutes', coalesce(p_start - interval '1 hour', now() + interval '1 day'))
  WHERE pro_id = p_pro AND trade = v_job.trade AND kind = 'outside' AND status = 'ready'
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    PERFORM public.tell_office('outside_office', p_job, public.job_vars(v_job));
    RETURN v_id;
  END IF;
  IF NOT public.risk_ready(p_pro, v_job.trade) THEN
    RETURN NULL;
  END IF;
  v_checker := public.pick_checker(p_pro, v_job.trade, v_job.sector, v_job.customer_id, '{}');
  IF v_checker IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.risk_checks (pro_id, trade, kind, job_id, checker_id, checker_name, status, asked_at, answer_by)
  VALUES (p_pro, v_job.trade, 'app', p_job, v_checker, (SELECT full_name FROM public.pros WHERE id = v_checker),
          'asked', now(), public.check_answer_by(p_start))
  RETURNING id INTO v_id;
  PERFORM public.tell(v_checker, 'check_asked', p_job, '/pro',
                      public.job_vars(v_job) || jsonb_build_object('amount', public.rs(public.setting('checker_fee_paisa'))));
  RETURN v_id;
END;
$$;

/** The checker said no, or did not answer: the next one. Nobody left: the job goes back to others. */
CREATE OR REPLACE FUNCTION public.check_next(p_check uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k    public.risk_checks;
  v_job  public.jobs;
  v_next uuid;
BEGIN
  SELECT * INTO v_k FROM public.risk_checks WHERE id = p_check FOR UPDATE;
  IF v_k.status <> 'asked' THEN
    RETURN v_k.status;
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_k.job_id FOR UPDATE;
  IF v_k.kind = 'app' THEN
    v_next := public.pick_checker(v_k.pro_id, v_k.trade, v_job.sector, v_job.customer_id,
                                  v_k.declined || ARRAY[v_k.checker_id]);
  END IF;
  IF v_next IS NOT NULL AND v_job.status = 'assigned' THEN
    UPDATE public.risk_checks SET declined = declined || ARRAY[checker_id], checker_id = v_next,
           checker_name = (SELECT full_name FROM public.pros WHERE id = v_next), asked_at = now(),
           answer_by = public.check_answer_by(public.window_start(v_job.when_date, v_job.when_from))
    WHERE id = p_check;
    PERFORM public.tell(v_next, 'check_asked', v_job.id, '/pro',
                        public.job_vars(v_job) || jsonb_build_object('amount', public.rs(public.setting('checker_fee_paisa'))));
    RETURN 'asked';
  END IF;
  -- Nobody can come. Nobody is at fault: the same job goes back to other technicians.
  IF v_k.kind = 'app' THEN
    UPDATE public.risk_checks SET status = 'none', declined = declined || ARRAY[checker_id] WHERE id = p_check;
  ELSE
    UPDATE public.risk_checks SET status = 'ready', job_id = NULL, asked_at = NULL, answer_by = NULL WHERE id = p_check;
  END IF;
  IF v_job.status = 'assigned' AND v_job.pro_id = v_k.pro_id AND v_job.stage IN ('chosen', 'on_way', 'arrived') THEN
    PERFORM public.reopen_job(v_job.id, 'no_checker', 'No checker could come for his first checked job.');
    PERFORM public.tell(v_job.customer_id, 'check_none', v_job.id, '/jobs', public.job_vars(v_job));
    PERFORM public.tell(v_k.pro_id, 'check_none_pro', v_job.id, '/pro', public.job_vars(v_job));
  END IF;
  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.checker_answer(p_check uuid, p_yes boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k public.risk_checks;
BEGIN
  SELECT * INTO v_k FROM public.risk_checks WHERE id = p_check AND checker_id = auth.uid() AND kind = 'app' FOR UPDATE;
  IF v_k.id IS NULL OR v_k.status <> 'asked' OR v_k.answer_by <= now() THEN
    RETURN public.refuse('This request is no longer waiting for you.');
  END IF;
  IF p_yes IS NULL THEN
    RETURN public.refuse('Say yes or no.', 'answer');
  END IF;
  IF p_yes THEN
    UPDATE public.risk_checks SET status = 'accepted', accepted_at = now() WHERE id = p_check;
    PERFORM public.log_job(v_k.job_id, 'checker_accepted');
    PERFORM public.tell(v_k.pro_id, 'check_found', v_k.job_id, '/pro', public.job_vars((SELECT j FROM public.jobs j WHERE j.id = v_k.job_id)));
  ELSE
    PERFORM public.check_next(p_check);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Unlocks risky work, or not, from what a check found. "Unsafe" is a safety report. */
CREATE OR REPLACE FUNCTION public.check_outcome(p_check uuid, p_result text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k      public.risk_checks;
  v_report uuid;
BEGIN
  SELECT * INTO v_k FROM public.risk_checks WHERE id = p_check;
  IF p_result = 'passed' THEN
    UPDATE public.pro_trades SET risky = 'unlocked', risky_at = now(), note = 'Risky work open: a checked job passed.'
    WHERE pro_id = v_k.pro_id AND trade = v_k.trade;
    PERFORM public.tell(v_k.pro_id, 'risky_open', v_k.job_id, '/pro',
                        jsonb_build_object('trade', (SELECT name FROM public.trades WHERE slug = v_k.trade)));
  ELSIF p_result = 'not_yet' THEN
    PERFORM public.tell(v_k.pro_id, 'check_not_yet', v_k.job_id, '/pro', '{}'::jsonb);
  ELSE
    INSERT INTO public.safety_reports (pro_id, trade, kind, job_id, from_id, words)
    VALUES (v_k.pro_id, v_k.trade, 'unsafe_check', v_k.job_id, v_k.checker_id, coalesce(p_note, 'The checker found the work unsafe.'))
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_report;
    PERFORM public.pause_trade(v_k.pro_id, v_k.trade, 'safety', v_report);
    PERFORM public.tell_office('safety_office', v_k.job_id, public.job_vars((SELECT j FROM public.jobs j WHERE j.id = v_k.job_id)));
  END IF;
END;
$$;

/** The checker's findings: every item, photos, and his verdict. Pechkas pays him as a credit. */
CREATE OR REPLACE FUNCTION public.checker_report(p_check uuid, p_result text, p_items jsonb, p_photos jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k       public.risk_checks;
  v_job     public.jobs;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_problem text;
  v_missing integer;
  v_fee     bigint := public.setting('checker_fee_paisa');
  v_txn     uuid;
BEGIN
  SELECT * INTO v_k FROM public.risk_checks WHERE id = p_check AND checker_id = auth.uid() AND kind = 'app' FOR UPDATE;
  IF v_k.id IS NULL OR v_k.status <> 'accepted' THEN
    RETURN public.refuse('This check is not waiting for your report.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_k.job_id;
  IF NOT ((v_job.status = 'assigned' AND v_job.stage IN ('working', 'checking'))
          OR (v_job.status IN ('done', 'stopped') AND v_job.finished_at > now() - interval '2 days')) THEN
    RETURN public.refuse('Report once the work has started, and within two days of its end.', 'stage');
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('passed', 'not_yet', 'unsafe') THEN
    RETURN public.refuse('Choose what you found.', 'result');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'object' THEN
    RETURN public.refuse('Answer every item on the list.', 'items');
  END IF;
  SELECT count(*) INTO v_missing FROM public.check_items i
  WHERE (i.trade IS NULL OR i.trade = v_k.trade) AND jsonb_typeof(p_items -> i.key) IS DISTINCT FROM 'boolean';
  IF v_missing > 0 THEN
    RETURN public.refuse('Answer every item on the list.', 'items');
  END IF;
  IF p_result = 'passed' AND EXISTS (SELECT 1 FROM public.check_items i
                                     WHERE (i.trade IS NULL OR i.trade = v_k.trade) AND (p_items ->> i.key)::boolean = false) THEN
    RETURN public.refuse('He cannot pass with an item answered no.', 'result');
  END IF;
  IF p_result <> 'passed' AND (v_note IS NULL OR length(v_note) < 10) THEN
    RETURN public.refuse('Write what was wrong, in a sentence or more.', 'note');
  END IF;
  IF length(coalesce(v_note, '')) > 500 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Keep the note short, and never write a CNIC number.', 'note');
  END IF;
  v_problem := public.own_uploads(p_photos, 1);
  IF v_problem IS NOT NULL THEN
    RETURN public.refuse(v_problem, 'photos');
  END IF;
  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT v_k.job_id, auth.uid(), 'check', x FROM jsonb_array_elements_text(p_photos) AS x;
  v_txn := public.post_txn('checker_fee:' || p_check, 'checker_fee', v_k.job_id, auth.uid(),
                           jsonb_build_array(jsonb_build_object('account', 'pro_owes', 'pro_id', auth.uid()::text, 'amount', -v_fee),
                                             jsonb_build_object('account', 'checks', 'amount', v_fee)),
                           NULL, NULL, 'Checked a first risky job');
  UPDATE public.risk_checks SET status = p_result, items = p_items, note = v_note, reported_at = now(), fee_txn = v_txn
  WHERE id = p_check;
  PERFORM public.log_job(v_k.job_id, 'checked', jsonb_build_object('result', p_result));
  PERFORM public.check_outcome(p_check, p_result, v_note);
  PERFORM public.tell(auth.uid(), 'check_paid', v_k.job_id, '/pro',
                      public.job_vars(v_job) || jsonb_build_object('amount', public.rs(v_fee)));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/**
 * Where nobody can check yet, the owner arranges an assessor by email, once a
 * trade: the one human step, because no approved technician exists to do it.
 */
CREATE OR REPLACE FUNCTION public.admin_outside_check(p_pro uuid, p_trade text, p_assessor text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_who text := nullif(btrim(coalesce(p_assessor, '')), '');
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can arrange an outside assessor.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pro_trades t JOIN public.pros r ON r.id = t.pro_id
             WHERE t.trade = p_trade AND t.status = 'approved' AND t.risky = 'unlocked' AND r.status = 'approved') THEN
    RETURN public.refuse('Somebody in this trade can check already: the app will pick him.');
  END IF;
  IF NOT public.risk_ready(p_pro, p_trade) THEN
    RETURN public.refuse('He has not earned a checked job in this trade yet.');
  END IF;
  IF v_who IS NULL OR length(v_who) < 3 OR length(v_who) > 120 THEN
    RETURN public.refuse('Write the assessor''s name and qualification.', 'assessor');
  END IF;
  INSERT INTO public.risk_checks (pro_id, trade, kind, checker_name, status, note, by_name)
  VALUES (p_pro, p_trade, 'outside', v_who, 'ready', left(nullif(btrim(coalesce(p_note, '')), ''), 500),
          (SELECT name FROM public.staff WHERE id = auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** The assessor has agreed the day by email: the visit may start. */
CREATE OR REPLACE FUNCTION public.admin_outside_confirm(p_check uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can do this.');
  END IF;
  UPDATE public.risk_checks SET status = 'accepted', accepted_at = now()
  WHERE id = p_check AND kind = 'outside' AND status = 'asked';
  IF NOT FOUND THEN
    RETURN public.refuse('This check is not waiting for the assessor.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_outside_result(p_check uuid, p_result text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k    public.risk_checks;
  v_job  public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can do this.');
  END IF;
  SELECT * INTO v_k FROM public.risk_checks WHERE id = p_check AND kind = 'outside' FOR UPDATE;
  IF v_k.id IS NULL OR v_k.status <> 'accepted' THEN
    RETURN public.refuse('This check is not waiting for a result.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_k.job_id;
  IF NOT ((v_job.status = 'assigned' AND v_job.stage IN ('working', 'checking')) OR v_job.status IN ('done', 'stopped')) THEN
    RETURN public.refuse('The work has not started yet.');
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('passed', 'not_yet', 'unsafe') THEN
    RETURN public.refuse('Choose what the assessor found.', 'result');
  END IF;
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 500 OR public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Write what the assessor reported, in a sentence or more.', 'note');
  END IF;
  UPDATE public.risk_checks SET status = p_result, note = v_note, reported_at = now() WHERE id = p_check;
  PERFORM public.log_job(v_k.job_id, 'checked', jsonb_build_object('result', p_result, 'outside', true));
  PERFORM public.check_outcome(p_check, p_result, v_note);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_outside(p_check uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RETURN public.refuse('Only the owner can do this.');
  END IF;
  UPDATE public.risk_checks SET status = 'cancelled' WHERE id = p_check AND kind = 'outside' AND status = 'ready';
  IF NOT FOUND THEN
    RETURN public.refuse('Only an assessor not yet given a job can be cancelled.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_lift_strike(p_strike uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 300 THEN
    RETURN public.refuse('Write why.', 'note');
  END IF;
  UPDATE public.checker_strikes SET lifted_at = now(), lifted_by = (SELECT name FROM public.staff WHERE id = auth.uid()), lift_note = v_note
  WHERE id = p_strike AND lifted_at IS NULL;
  IF NOT FOUND THEN
    RETURN public.refuse('This has already been lifted.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Closed job types ----------------------------------------------------------------------------------

/** Which kinds of job a customer here cannot post yet. "Something else" is `job_type_id` null. */
CREATE OR REPLACE FUNCTION public.job_types_closed(p_sector text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('trade', x.trade, 'job_type_id', x.id,
                                               'asked', EXISTS (SELECT 1 FROM public.type_asks a
                                                                WHERE a.customer_id = auth.uid() AND a.trade = x.trade
                                                                  AND a.job_type_id IS NOT DISTINCT FROM x.id AND a.sector = p_sector))
                            ORDER BY x.trade, x.id NULLS LAST), '[]'::jsonb)
  FROM (SELECT t.trade, t.id FROM public.job_types t
        UNION ALL SELECT s.slug, NULL::integer FROM public.trades s) x
  WHERE auth.uid() IS NOT NULL AND public.job_type_risky(x.trade, x.id) AND NOT public.type_open(x.trade, x.id, p_sector);
$$;

/** "Tell me when it is": counted per job type and sector, and she is told when it opens. */
CREATE OR REPLACE FUNCTION public.tell_me_when(p_trade text, p_type integer, p_sector text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trades WHERE slug = p_trade)
     OR (p_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.job_types WHERE id = p_type AND trade = p_trade))
     OR NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = p_sector) THEN
    RETURN public.refuse('Choose the kind of job and your sector.');
  END IF;
  IF public.type_open(p_trade, p_type, p_sector) THEN
    RETURN public.refuse('This kind of job is available: you can post it now.', 'open');
  END IF;
  INSERT INTO public.type_asks (customer_id, trade, job_type_id, sector) VALUES (auth.uid(), p_trade, p_type, p_sector)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

/** Gas cookers and gas ovens are not taken: the office closes such a job with that reason. */
CREATE OR REPLACE FUNCTION public.admin_close_not_covered(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status NOT IN ('open', 'assigned') THEN
    RETURN public.refuse('Only an open job, or one not started, can be closed this way.');
  END IF;
  IF v_job.status = 'assigned' AND v_job.stage NOT IN ('chosen', 'on_way', 'arrived') THEN
    RETURN public.refuse('The work has started: this one needs deciding as a dispute.');
  END IF;
  UPDATE public.jobs
  SET status = 'cancelled', cancelled_by = 'office', cancel_for = 'other',
      cancel_reason = 'Pechkas does not take gas cooker or gas oven work. Please contact the maker or a gas company.', updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  PERFORM public.log_job(p_job, 'not_covered_gas');
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- --- Technicians approved before D37: sorted by their own record --------------------------------------

/**
 * Once the owner has set both numbers: enough clean finished jobs in a trade
 * keeps it approved, enough clean risky ones keeps risky work open, and the
 * rest starts as new. UPS follows Electrician. Paused trades wait.
 */
CREATE OR REPLACE FUNCTION public.sort_legacy()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_t    public.pro_trades;
  v_n    bigint;
  v_rn   bigint;
  v_with text;
  v_done integer := 0;
BEGIN
  IF public.setting('legacy_basic_jobs') = 0 OR public.setting('legacy_risky_jobs') = 0 THEN
    RETURN 0;
  END IF;
  FOR v_t IN SELECT * FROM public.pro_trades WHERE status = 'legacy' FOR UPDATE LOOP
    SELECT c.n, c.risky_n INTO v_n, v_rn FROM public.clean_record(v_t.pro_id, v_t.trade) c;
    SELECT opens_with INTO v_with FROM public.trades WHERE slug = v_t.trade;
    IF v_with IS NOT NULL THEN
      UPDATE public.pro_trades SET status = 'approved', approved_at = now(), approved_by = 'record',
             note = 'Sorted by record: follows his ' || (SELECT name FROM public.trades WHERE slug = v_with) || ' work.', since = now()
      WHERE pro_id = v_t.pro_id AND trade = v_t.trade;
    ELSIF v_n >= public.setting('legacy_basic_jobs') THEN
      UPDATE public.pro_trades SET status = 'approved', approved_at = now(), approved_by = 'record',
             risky = CASE WHEN v_rn >= public.setting('legacy_risky_jobs') THEN 'unlocked' ELSE 'locked' END,
             risky_at = CASE WHEN v_rn >= public.setting('legacy_risky_jobs') THEN now() END,
             note = 'Sorted by record: ' || v_n || ' clean jobs, ' || v_rn || ' of them risky.', since = now()
      WHERE pro_id = v_t.pro_id AND trade = v_t.trade;
    ELSE
      UPDATE public.pro_trades SET status = 'trial', note = 'Sorted by record: ' || v_n || ' clean jobs, so he starts as new.', since = now()
      WHERE pro_id = v_t.pro_id AND trade = v_t.trade;
    END IF;
    PERFORM public.tell(v_t.pro_id, 'trade_sorted', NULL, '/pro',
                        jsonb_build_object('trade', (SELECT name FROM public.trades WHERE slug = v_t.trade)));
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$$;


-- --- The clock --------------------------------------------------------------------------------------

/**
 * Every ten minutes: people ready to start, trial jobs whose last condition
 * has arrived, trades whose identity just came good, checkers who did not
 * answer, checkers whose man turned out bad, the pre-D37 sort, and customers
 * waiting to hear that a kind of job has opened.
 */
CREATE OR REPLACE FUNCTION public.first_jobs_clock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id     uuid;
  v_row    record;
  v_people integer := 0;
  v_good   integer := 0;
  v_checks integer := 0;
  v_strike integer := 0;
  v_told   integer := 0;
  v_sorted integer;
BEGIN
  FOR v_id IN SELECT r.id FROM public.pros r WHERE r.status = 'applied' AND r.rejected_at IS NULL LOOP
    IF public.promote_person(v_id) THEN
      v_people := v_people + 1;
    END IF;
  END LOOP;

  FOR v_row IN SELECT x.job_id, x.pro_id FROM public.trial_jobs x JOIN public.jobs j ON j.id = x.job_id
               WHERE x.status = 'waiting'
                  -- A good job is looked at again while a claim on it could still be made.
                  OR (x.status = 'good' AND j.finished_at > now() - make_interval(days => public.guarantee_days_of(j.id) + 1))
               ORDER BY j.finished_at, x.job_id LOOP
    IF public.trial_review(v_row.job_id, v_row.pro_id) = 'good' THEN
      v_good := v_good + 1;
    END IF;
  END LOOP;
  FOR v_row IN SELECT t.pro_id, t.trade FROM public.pro_trades t WHERE t.status = 'trial' LOOP
    PERFORM public.promote_trade(v_row.pro_id, v_row.trade);
  END LOOP;

  -- A checker who has not answered in time: the next one.
  FOR v_id IN SELECT k.id FROM public.risk_checks k WHERE k.status = 'asked' AND k.answer_by <= now() LOOP
    PERFORM public.check_next(v_id);
    v_checks := v_checks + 1;
  END LOOP;
  -- A checker who never reported, two days after the job: no fee, and nothing held against the man.
  UPDATE public.risk_checks k SET status = 'none'
  FROM public.jobs j
  WHERE k.job_id = j.id AND k.kind = 'app' AND k.status = 'accepted' AND j.status IN ('done', 'stopped')
    AND j.finished_at < now() - interval '2 days';

  -- A man he passed, within the time a checker answers for: a covered claim, or an upheld report, on risky work.
  INSERT INTO public.checker_strikes (checker_id, check_id, cause, cause_id)
  SELECT k.checker_id, k.id, 'claim', c.id
  FROM public.risk_checks k
  JOIN public.jobs j ON j.pro_id = k.pro_id AND j.trade = k.trade
  JOIN public.guarantee_claims c ON c.job_id = j.id
  WHERE k.kind = 'app' AND k.status = 'passed' AND k.checker_id IS NOT NULL
    AND public.claim_covered(c.status) AND public.job_type_risky(j.trade, j.job_type_id)
    AND c.created_at BETWEEN k.reported_at AND k.reported_at + make_interval(days => public.setting('checker_accountable_days')::integer)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_strike = ROW_COUNT;
  INSERT INTO public.checker_strikes (checker_id, check_id, cause, cause_id)
  SELECT k.checker_id, k.id, 'safety', s.id
  FROM public.risk_checks k
  JOIN public.safety_reports s ON s.pro_id = k.pro_id AND s.trade = k.trade AND s.kind IN ('safety', 'unsafe_check') AND s.status = 'upheld'
  WHERE k.kind = 'app' AND k.status = 'passed' AND k.checker_id IS NOT NULL
    AND s.at BETWEEN k.reported_at AND k.reported_at + make_interval(days => public.setting('checker_accountable_days')::integer)
    AND (s.job_id IS NULL OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = s.job_id AND public.job_type_risky(j.trade, j.job_type_id)))
  ON CONFLICT DO NOTHING;

  v_sorted := public.sort_legacy();

  FOR v_row IN SELECT a.id, a.customer_id, a.trade, a.sector FROM public.type_asks a
               WHERE a.told_at IS NULL AND public.type_open(a.trade, a.job_type_id, a.sector) LOOP
    UPDATE public.type_asks SET told_at = now() WHERE id = v_row.id;
    PERFORM public.tell(v_row.customer_id, 'type_open', NULL, '/',
                        jsonb_build_object('trade', (SELECT name FROM public.trades WHERE slug = v_row.trade), 'sector', v_row.sector));
    v_told := v_told + 1;
  END LOOP;

  RETURN jsonb_build_object('people', v_people, 'good', v_good, 'checks', v_checks, 'strikes', v_strike,
                            'sorted', v_sorted, 'told', v_told);
END;
$$;


-- --- What each side reads -----------------------------------------------------------------------------

/** One quiz, as he sees it: open or not, passed, and when he may try again. */
CREATE OR REPLACE FUNCTION public.quiz_view(p_pro uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'key', p_key, 'on', public.quiz_on(p_key),
    'passed', EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.pro_id = p_pro AND a.quiz = p_key AND a.passed),
    'again_from', (SELECT a.finished_at + make_interval(days => public.setting('quiz_retake_days')::integer)
                   FROM public.quiz_attempts a WHERE a.pro_id = p_pro AND a.quiz = p_key AND a.finished_at IS NOT NULL AND NOT a.passed
                     AND public.setting('quiz_retake_days') > 0
                     AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts b WHERE b.pro_id = p_pro AND b.quiz = p_key AND b.passed)
                   ORDER BY a.finished_at DESC LIMIT 1));
$$;

/** His own position: the steps before any job, each trade, its first jobs, pauses and checks. */
CREATE OR REPLACE FUNCTION public.my_trades()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
    'status', r.status,
    'phone_checked', EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.id AND coalesce(u.phone, '') <> ''),
    'face', (SELECT jsonb_build_object('path', f.path, 'locked', f.locked_at IS NOT NULL) FROM public.pro_faces f WHERE f.pro_id = r.id),
    'face_change', (SELECT jsonb_build_object('status', c.status, 'note', c.note, 'at', c.asked_at)
                    FROM public.face_changes c WHERE c.pro_id = r.id ORDER BY c.asked_at DESC LIMIT 1),
    'missing', public.person_ready_why(r.id),
    'identity', public.identity_line(r.id),
    'identity_ok', public.identity_ok(r.id),
    'identity_service', (SELECT s.is_on FROM public.identity_service s WHERE s.id = 1),
    'identity_pending', EXISTS (SELECT 1 FROM public.identity_checks c WHERE c.pro_id = r.id AND c.status = 'pending'),
    'rules_quiz', public.quiz_view(r.id, 'rules'),
    'trial_jobs_needed', public.setting('trial_jobs'),
    'price_cap_paisa', nullif(public.setting('trial_price_cap_paisa'), 0),
    'trades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'trade', t.trade, 'name', tr.name, 'status', t.status, 'level', public.trade_level(r.id, t.trade),
          'risky', t.risky, 'has_risky', tr.something_else_risky OR EXISTS (SELECT 1 FROM public.job_types y WHERE y.trade = t.trade AND y.risky),
          'opens_with', tr.opens_with,
          'safety_quiz', public.quiz_view(r.id, 'safety:' || t.trade),
          'good', (SELECT count(*) FROM public.trial_jobs x WHERE x.pro_id = r.id AND x.trade = t.trade AND x.status = 'good'),
          'first_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'status', x.status, 'why', x.why,
                                                                      'answered', x.answered_at IS NOT NULL) ORDER BY x.created_at)
                                  FROM public.trial_jobs x JOIN public.jobs j ON j.id = x.job_id
                                  WHERE x.pro_id = r.id AND x.trade = t.trade), '[]'::jsonb),
          'pause_reason', t.pause_reason, 'paused_at', t.paused_at,
          'appeal', (SELECT jsonb_build_object('status', a.status, 'note', a.note, 'at', a.at)
                     FROM public.trade_appeals a WHERE a.pro_id = r.id AND a.trade = t.trade AND a.paused_at = t.paused_at),
          'can_appeal', t.status = 'paused' AND t.pause_reason IN ('works_no', 'answers')
                        AND NOT EXISTS (SELECT 1 FROM public.trade_appeals a WHERE a.pro_id = r.id AND a.trade = t.trade AND a.paused_at = t.paused_at),
          'risk_ready', public.risk_ready(r.id, t.trade),
          'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind, 'note', CASE WHEN k.status IN ('not_yet', 'unsafe') THEN k.note END,
                                              'at', coalesce(k.reported_at, k.created_at))
                    FROM public.risk_checks k WHERE k.pro_id = r.id AND k.trade = t.trade ORDER BY k.created_at DESC LIMIT 1))
        ORDER BY tr.sort)
      FROM public.pro_trades t JOIN public.trades tr ON tr.slug = t.trade
      WHERE t.pro_id = r.id), '[]'::jsonb),
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'trade', s.trade, 'ref', (SELECT j.ref FROM public.jobs j WHERE j.id = s.job_id),
                                          'at', s.at, 'status', s.status, 'his_side', s.his_side,
                                          'note', CASE WHEN s.status <> 'open' THEN s.note END) ORDER BY s.at DESC)
      FROM public.safety_reports s WHERE s.pro_id = r.id), '[]'::jsonb)
  ) END
  FROM (SELECT 1) one LEFT JOIN public.pros r ON r.id = auth.uid();
$$;

/**
 * The checks he is asked to do. The address only once he has said yes, and
 * only while the job is on; the customer's first name; the other man's first name.
 */
CREATE OR REPLACE FUNCTION public.my_checks()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'status', k.status, 'answer_by', k.answer_by, 'trade', k.trade,
      'trade_name', (SELECT t.name FROM public.trades t WHERE t.slug = k.trade),
      'job_id', j.id, 'ref', j.ref, 'title', j.title, 'sector', j.sector,
      'when_date', j.when_date, 'when_from', j.when_from, 'stage', j.stage, 'job_status', j.status,
      'pro', split_part(r.full_name, ' ', 1), 'customer', p.first_name,
      'fee_paisa', public.setting('checker_fee_paisa'),
      'street', CASE WHEN k.status = 'accepted' AND j.status = 'assigned' THEN j.street END,
      'house', CASE WHEN k.status = 'accepted' AND j.status = 'assigned' THEN j.house END,
      'landmark', CASE WHEN k.status = 'accepted' AND j.status = 'assigned' THEN j.landmark END,
      'lat', CASE WHEN k.status = 'accepted' AND j.status = 'assigned' THEN j.lat END,
      'lng', CASE WHEN k.status = 'accepted' AND j.status = 'assigned' THEN j.lng END,
      'items', (SELECT jsonb_agg(jsonb_build_object('key', i.key, 'item', i.item) ORDER BY i.sort)
                FROM public.check_items i WHERE i.trade IS NULL OR i.trade = k.trade),
      'can_report', k.status = 'accepted'
                    AND ((j.status = 'assigned' AND j.stage IN ('working', 'checking'))
                         OR (j.status IN ('done', 'stopped') AND j.finished_at > now() - interval '2 days')),
      'result', CASE WHEN k.status IN ('passed', 'not_yet', 'unsafe') THEN k.status END
    ) ORDER BY k.asked_at DESC), '[]'::jsonb)
  FROM public.risk_checks k
  JOIN public.jobs j ON j.id = k.job_id
  JOIN public.pros r ON r.id = k.pro_id
  JOIN public.profiles p ON p.id = j.customer_id
  WHERE k.checker_id = auth.uid() AND k.kind = 'app'
    AND (k.status IN ('asked', 'accepted') OR k.reported_at > now() - interval '30 days');
$$;

/**
 * Everything that needs a person, as written items: safety reports and "not
 * the man", appeals, photo changes for the owner, trades where nobody can
 * check yet, and checks waiting on an assessor.
 */
CREATE OR REPLACE FUNCTION public.admin_exceptions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'is_owner', public.is_owner(),
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'kind', s.kind, 'pro_id', s.pro_id, 'pro', r.full_name, 'trade', s.trade,
          'trade_name', (SELECT t.name FROM public.trades t WHERE t.slug = s.trade),
          'ref', j.ref, 'job_id', j.id, 'job_status', j.status, 'from_side', CASE WHEN s.from_id = j.customer_id THEN 'customer' ELSE 'checker' END,
          'from', (SELECT p.first_name FROM public.profiles p WHERE p.id = s.from_id),
          'words', s.words, 'photo', s.photo, 'at', s.at, 'his_side', s.his_side, 'his_side_at', s.his_side_at,
          'his_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', x.ref, 'trade', x.trade, 'stage', x.stage, 'when_date', x.when_date))
                                FROM public.jobs x WHERE x.pro_id = s.pro_id AND x.status = 'assigned'), '[]'::jsonb))
        ORDER BY s.at)
      FROM public.safety_reports s JOIN public.pros r ON r.id = s.pro_id LEFT JOIN public.jobs j ON j.id = s.job_id
      WHERE s.status = 'open'), '[]'::jsonb),
    'appeals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'pro_id', a.pro_id, 'pro', r.full_name, 'trade', a.trade,
          'trade_name', (SELECT t.name FROM public.trades t WHERE t.slug = a.trade),
          'reason', a.reason, 'paused_at', a.paused_at, 'words', a.words, 'at', a.at,
          'first_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', j.ref, 'status', x.status, 'why', x.why, 'works_no', x.works_no,
                                                                      'on_time', x.on_time, 'explained', x.explained, 'clean', x.clean)
                                                   ORDER BY x.created_at)
                                  FROM public.trial_jobs x JOIN public.jobs j ON j.id = x.job_id
                                  WHERE x.pro_id = a.pro_id AND x.trade = a.trade), '[]'::jsonb))
        ORDER BY a.at)
      FROM public.trade_appeals a JOIN public.pros r ON r.id = a.pro_id
      WHERE a.status = 'waiting'), '[]'::jsonb),
    'face_changes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'pro_id', c.pro_id, 'pro', r.full_name, 'reason', c.reason,
                                          'new_path', c.path, 'old_path', f.path, 'at', c.asked_at) ORDER BY c.asked_at)
      FROM public.face_changes c JOIN public.pros r ON r.id = c.pro_id LEFT JOIN public.pro_faces f ON f.pro_id = c.pro_id
      WHERE c.status = 'waiting'), '[]'::jsonb),
    'need_assessor', coalesce((
      SELECT jsonb_agg(jsonb_build_object('pro_id', t.pro_id, 'pro', r.full_name, 'trade', t.trade, 'trade_name', tr.name,
                                          'sectors', to_jsonb(r.sectors)) ORDER BY tr.sort, r.full_name)
      FROM public.pro_trades t JOIN public.pros r ON r.id = t.pro_id JOIN public.trades tr ON tr.slug = t.trade
      WHERE public.risk_ready(t.pro_id, t.trade)
        AND NOT EXISTS (SELECT 1 FROM public.risk_checks k WHERE k.pro_id = t.pro_id AND k.trade = t.trade AND k.status IN ('ready', 'asked', 'accepted'))
        AND NOT EXISTS (SELECT 1 FROM public.pro_trades c JOIN public.pros cr ON cr.id = c.pro_id
                        WHERE c.trade = t.trade AND c.status = 'approved' AND c.risky = 'unlocked' AND cr.status = 'approved')), '[]'::jsonb),
    'outside', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'status', k.status, 'pro', r.full_name, 'trade', k.trade, 'assessor', k.checker_name,
                                          'ref', j.ref, 'job_status', j.status, 'stage', j.stage, 'sector', j.sector,
                                          'when_date', j.when_date, 'when_from', j.when_from, 'answer_by', k.answer_by)
                       ORDER BY k.created_at)
      FROM public.risk_checks k JOIN public.pros r ON r.id = k.pro_id LEFT JOIN public.jobs j ON j.id = k.job_id
      WHERE k.kind = 'outside' AND k.status IN ('ready', 'asked', 'accepted')), '[]'::jsonb)
  ) END;
$$;

/** One technician's first-jobs record, for the office. */
CREATE OR REPLACE FUNCTION public.admin_pro_trades(p_pro uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'identity', public.identity_line(p_pro),
    'identity_checks', coalesce((SELECT jsonb_agg(jsonb_build_object('service', c.service, 'status', c.status, 'reference', c.reference,
                                                                     'started_at', c.started_at, 'decided_at', c.decided_at) ORDER BY c.started_at DESC)
                                 FROM public.identity_checks c WHERE c.pro_id = p_pro), '[]'::jsonb),
    'face', (SELECT jsonb_build_object('path', f.path, 'set_at', f.set_at, 'locked_at', f.locked_at) FROM public.pro_faces f WHERE f.pro_id = p_pro),
    'missing', public.person_ready_why(p_pro),
    'approved_how', (SELECT r.approved_how FROM public.pros r WHERE r.id = p_pro),
    'quizzes', coalesce((SELECT jsonb_agg(jsonb_build_object('quiz', a.quiz, 'started_at', a.started_at, 'finished_at', a.finished_at,
                                                             'correct', a.correct, 'of', cardinality(a.questions), 'passed', a.passed) ORDER BY a.started_at DESC)
                         FROM public.quiz_attempts a WHERE a.pro_id = p_pro), '[]'::jsonb),
    'trades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'trade', t.trade, 'name', tr.name, 'status', t.status, 'level', public.trade_level(p_pro, t.trade), 'risky', t.risky,
          'note', t.note, 'since', t.since, 'pause_reason', t.pause_reason, 'approved_by', t.approved_by,
          'risk_ready', public.risk_ready(p_pro, t.trade),
          'first_jobs', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('ref', j.ref) ORDER BY x.created_at)
                                  FROM public.trial_jobs x JOIN public.jobs j ON j.id = x.job_id
                                  WHERE x.pro_id = p_pro AND x.trade = t.trade), '[]'::jsonb),
          'history', coalesce((SELECT jsonb_agg(jsonb_build_object('from', e.old_status, 'to', e.new_status, 'risky', e.risky, 'note', e.note, 'at', e.at)
                                                ORDER BY e.at DESC, e.id DESC)
                               FROM public.pro_trade_events e WHERE e.pro_id = p_pro AND e.trade = t.trade), '[]'::jsonb))
        ORDER BY tr.sort)
      FROM public.pro_trades t JOIN public.trades tr ON tr.slug = t.trade WHERE t.pro_id = p_pro), '[]'::jsonb),
    'checks', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'trade', k.trade, 'kind', k.kind, 'status', k.status,
                                                            'checker', k.checker_name, 'ref', (SELECT j.ref FROM public.jobs j WHERE j.id = k.job_id),
                                                            'note', k.note, 'items', k.items, 'at', coalesce(k.reported_at, k.created_at))
                                         ORDER BY k.created_at DESC)
                        FROM public.risk_checks k WHERE k.pro_id = p_pro), '[]'::jsonb),
    'checked_others', coalesce((SELECT jsonb_agg(jsonb_build_object('trade', k.trade, 'status', k.status,
                                                                    'pro', (SELECT r.full_name FROM public.pros r WHERE r.id = k.pro_id),
                                                                    'at', coalesce(k.reported_at, k.asked_at)) ORDER BY k.asked_at DESC)
                                FROM public.risk_checks k WHERE k.checker_id = p_pro), '[]'::jsonb),
    'strikes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'cause', s.cause, 'at', s.at, 'lifted_at', s.lifted_at, 'lift_note', s.lift_note))
                         FROM public.checker_strikes s WHERE s.checker_id = p_pro), '[]'::jsonb),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'from_id' ORDER BY s.at DESC) FROM public.safety_reports s WHERE s.pro_id = p_pro), '[]'::jsonb)
  ) END;
$$;

/** The office's set-up page for first jobs: every number, the quizzes, the identity switch, who can check. */
CREATE OR REPLACE FUNCTION public.admin_first_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.is_staff() THEN NULL ELSE jsonb_build_object(
    'is_owner', public.is_owner(),
    'identity', (SELECT jsonb_build_object('on', s.is_on, 'service', s.service, 'live_since', s.live_since,
                                           'deadline', CASE WHEN s.live_since IS NOT NULL AND public.setting('identity_legacy_days') > 0
                                                            THEN public.pk_day(s.live_since) + public.setting('identity_legacy_days')::integer END)
                 FROM public.identity_service s WHERE s.id = 1),
    'settings', (SELECT jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'unit', s.unit, 'meaning', s.meaning,
                                                     'set', s.value > 0, 'lo', l.lo, 'hi', l.hi) ORDER BY s.key)
                 FROM public.settings s LEFT JOIN public.setting_limits l ON l.key = s.key
                 WHERE s.key IN ('trial_jobs', 'trial_price_cap_paisa', 'trial_customer_gap_m', 'quiz_pass_bps', 'quiz_retake_days',
                                 'risky_clean_jobs', 'risky_clean_days', 'risky_claim_free_days', 'risky_retry_days',
                                 'checker_fee_paisa', 'checker_answer_minutes', 'checker_accountable_days',
                                 'legacy_basic_jobs', 'legacy_risky_jobs', 'identity_legacy_days')),
    'quizzes', (SELECT jsonb_agg(jsonb_build_object('key', q.key, 'trade', q.trade, 'on', q.is_on, 'draw', q.draw,
                                                    'questions', (SELECT count(*) FROM public.quiz_questions x WHERE x.quiz = q.key AND x.active),
                                                    'checked_by', q.checked_by, 'checked_on', q.checked_on) ORDER BY q.key)
                FROM public.quizzes q),
    'trades', (SELECT jsonb_agg(jsonb_build_object(
                   'slug', t.slug, 'name', t.name, 'opens_with', t.opens_with,
                   'risky_types', (SELECT count(*) FROM public.job_types y WHERE y.trade = t.slug AND y.risky)
                                  + CASE WHEN t.something_else_risky THEN 1 ELSE 0 END,
                   'trial', (SELECT count(*) FROM public.pro_trades x WHERE x.trade = t.slug AND x.status = 'trial'),
                   'approved', (SELECT count(*) FROM public.pro_trades x WHERE x.trade = t.slug AND x.status = 'approved'),
                   'legacy', (SELECT count(*) FROM public.pro_trades x WHERE x.trade = t.slug AND x.status = 'legacy'),
                   'checkers', (SELECT count(*) FROM public.pro_trades x JOIN public.pros r ON r.id = x.pro_id
                                WHERE x.trade = t.slug AND x.status = 'approved' AND x.risky = 'unlocked' AND r.status = 'approved'))
                 ORDER BY t.sort) FROM public.trades t)
  ) END;
$$;


-- --- The one visibility rule: what he may take, and the checker he said yes to ----------------------

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
        (j.status = 'open' AND j.sector = ANY (r.sectors)
         -- D37: his trade, its level, the trial limits and a checked job: pro_gate() is the one rule.
         AND public.pro_gate(r.id, j.trade, j.job_type_id, j.sector, j.customer_id, j.id) IS NULL
         AND (j.preferred_pro_id IS NULL OR j.preferred_pro_id = r.id OR j.preferred_until <= now())
         AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = j.customer_id AND b.pro_id = r.id)
         -- She said no to his offer on this job: it is closed to him.
         AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.pro_id = r.id AND o.status = 'declined')
         -- Paused by the office (D11): no new jobs reach him; jobs he has go on.
         AND NOT public.pro_paused(r.id)
         -- He withdrew from this job, or she replaced him on it: it is closed to him for good.
         AND NOT EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = j.id AND a.pro_id = r.id)
         -- A guarantee repair never goes to the man whose work it is redoing.
         AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.id = j.guarantee_of AND c.pro_id = r.id))
        OR (j.status = 'assigned' AND j.pro_id = r.id)
        -- D37: a checker who said yes, while the job is on.
        OR (j.status = 'assigned' AND EXISTS (SELECT 1 FROM public.risk_checks k
                                              WHERE k.job_id = j.id AND k.checker_id = r.id AND k.status = 'accepted'))
      )
  );
$$;



-- --- Offers: the trial limits, said plainly ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.make_offer(
  p_job         uuid,
  p_price_paisa bigint,
  p_eta_minutes integer DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_arrive_from smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.jobs%ROWTYPE;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_max    bigint;
  v_owed   bigint;
  v_today  date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_hour   integer := extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::integer;
  v_gate   text;
  v_cap    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = auth.uid() AND status = 'approved') THEN
    RETURN public.refuse('Only an approved technician can make offers.');
  END IF;
  -- D36: read his position under the same lock as every payment, fee and reversal.
  PERFORM public.pay_lock(auth.uid());
  v_owed := public.pro_owed(auth.uid());
  IF v_owed > public.setting('credit_limit_paisa') THEN
    RETURN public.refuse('You owe Pechkas ' || public.rs(v_owed) || '. Pay it to make new offers.', 'owed');
  END IF;
  IF public.pay_blocked(auth.uid()) THEN
    RETURN public.refuse('Your new offers have stopped: ' || public.rs((public.pay_state(auth.uid()) ->> 'overdue_paisa')::bigint)
                         || ' you owe Pechkas is overdue. Pay it from My account and they start again.', 'overdue');
  END IF;
  -- A guarantee claim on his work that he has let run out stops new offers.
  IF public.claim_blocks(auth.uid()) IS NOT NULL THEN
    RETURN public.refuse('Your new offers have stopped until you answer the guarantee claim on your earlier job.', 'guarantee');
  END IF;

  -- Paused by the office (D11): told until when.
  IF public.pro_paused(auth.uid()) THEN
    RETURN public.refuse('The Pechkas office has paused your new offers until '
                         || to_char(public.pro_pause_until(auth.uid()) AT TIME ZONE 'Asia/Karachi', 'FMDy FMDD Mon') || ', '
                         || public.pk_clock(public.pro_pause_until(auth.uid())) || '.', 'paused');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job;
  -- D37: his first jobs: one at a time, and only the kinds open to him.
  IF v_job.id IS NOT NULL AND v_job.status = 'open' THEN
    v_gate := public.pro_gate(auth.uid(), v_job.trade, v_job.job_type_id, v_job.sector, v_job.customer_id, v_job.id);
    IF v_gate = 'one_job' THEN
      RETURN public.refuse('On your first jobs you hold one job at a time. Finish the one you have first.', 'trial');
    END IF;
    IF v_gate IN ('risky', 'something_else') THEN
      RETURN public.refuse('This kind of job is not open to you yet.', 'trial');
    END IF;
  END IF;
  IF v_job.id IS NULL OR v_job.status <> 'open' OR NOT public.pro_may_see(p_job) OR v_job.customer_id = auth.uid() THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  v_max := (v_job.offered_paisa * public.setting('max_counter_bps')) / 10000;
  -- A guarantee repair is paid by Pechkas, up to what the original work was worth.
  IF v_job.paid_by_pechkas THEN
    v_max := least(v_max, v_job.pay_cap_paisa);
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 THEN
    RETURN public.refuse('Offer a price in whole rupees.', 'price');
  END IF;
  IF p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('That is below the lowest price for any job.', 'price');
  END IF;
  IF p_price_paisa > v_max THEN
    RETURN public.refuse('At most Rs ' || to_char(v_max / 100, 'FM999,999,999') || ' for this job.', 'price');
  END IF;
  -- D37: the price cap on his first jobs.
  v_cap := public.trial_cap_why(auth.uid(), v_job.trade, p_price_paisa);
  IF v_cap IS NOT NULL THEN
    RETURN public.refuse(v_cap, 'price');
  END IF;

  -- When he will come. A job wanted now (older copies): how many minutes.
  -- A job whose customer chose the time or the part of the day (older
  -- copies): nothing to say. A job
  -- with only a day — every job the app posts now: the two hours he will
  -- arrive in, on that day, not one that has already started.
  IF v_job.when_kind = 'now' THEN
    IF p_eta_minutes IS NULL OR p_eta_minutes NOT BETWEEN 5 AND 480 THEN
      RETURN public.refuse('Say how soon you can be there.', 'eta');
    END IF;
    IF p_arrive_from IS NOT NULL THEN
      RETURN public.refuse('Say how soon you can be there.', 'eta');
    END IF;
  ELSIF v_job.when_from IS NOT NULL OR v_job.when_part IS NOT NULL OR v_job.when_date IS NULL THEN
    IF p_eta_minutes IS NOT NULL OR p_arrive_from IS NOT NULL THEN
      RETURN public.refuse('This job already has a time; no arrival time needed.', 'eta');
    END IF;
  ELSE
    IF p_eta_minutes IS NOT NULL THEN
      RETURN public.refuse('Say when you will arrive, not how many minutes.', 'arrive');
    END IF;
    IF v_job.when_date < v_today THEN
      RETURN public.refuse('This job is no longer open.');
    END IF;
    IF p_arrive_from IS NULL OR p_arrive_from NOT IN (8, 10, 12, 14, 16, 18, 20) THEN
      RETURN public.refuse('Say when you will arrive.', 'arrive');
    END IF;
    IF v_job.when_date = v_today AND p_arrive_from <= v_hour THEN
      RETURN public.refuse('That time has already started. Choose a later one.', 'arrive');
    END IF;
  END IF;

  IF length(coalesce(v_note, '')) > 200 THEN
    RETURN public.refuse('Keep the note short.', 'note');
  END IF;
  IF public.looks_like_cnic(v_note) THEN
    RETURN public.refuse('Never write a CNIC number here.', 'note');
  END IF;
  IF coalesce(v_note, '') ~ '(\+?92|0)\s*3[0-9]{2}[\s-]*[0-9]{7}' THEN
    RETURN public.refuse('Do not write your number. The customer gets it when they choose you.', 'note');
  END IF;

  SELECT status INTO v_status FROM public.offers WHERE job_id = p_job AND pro_id = auth.uid();
  -- 'rejected' is not a refusal any more: on an open job it means somebody else was chosen and
  -- the job came back (D11), so he may offer again. The man who left it is shut out above.
  IF v_status = 'accepted' THEN
    RETURN public.refuse('This job is no longer open.');
  END IF;

  INSERT INTO public.offers AS o (job_id, pro_id, price_paisa, eta_minutes, arrive_from, note, status, expires_at)
  VALUES (p_job, auth.uid(), p_price_paisa, p_eta_minutes, p_arrive_from, v_note, 'pending',
          now() + make_interval(mins => public.setting('offer_minutes')::integer))
  ON CONFLICT (job_id, pro_id) DO UPDATE SET
    price_paisa = EXCLUDED.price_paisa,
    eta_minutes = EXCLUDED.eta_minutes,
    arrive_from = EXCLUDED.arrive_from,
    note = EXCLUDED.note,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;



-- --- Her choosing: checked again as she taps, and his checked job arranged --------------------------

CREATE OR REPLACE FUNCTION public.choose_offer(p_offer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job      uuid;
  v_customer uuid;
  v_status   text;
  v_offer    public.offers%ROWTYPE;
  v_trade    text;
  v_type     integer;
  v_sector   text;
  v_when     date;
  v_from     smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN public.refuse('Please sign in again.');
  END IF;
  SELECT job_id INTO v_job FROM public.offers WHERE id = p_offer;
  IF v_job IS NULL THEN
    RETURN public.refuse('That offer is no longer there.');
  END IF;

  -- The lock. Whoever gets here second waits, then sees the job taken.
  SELECT customer_id, status, trade, job_type_id, sector, when_date, when_from
  INTO v_customer, v_status, v_trade, v_type, v_sector, v_when, v_from
  FROM public.jobs WHERE id = v_job FOR UPDATE;
  IF v_customer IS DISTINCT FROM auth.uid() THEN
    RETURN public.refuse('That offer is no longer there.');
  END IF;
  IF v_status <> 'open' THEN
    RETURN public.refuse('This job already has a technician, or was cancelled.');
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer FOR UPDATE;
  IF v_offer.status <> 'pending' OR v_offer.expires_at <= now() THEN
    RETURN public.refuse('That offer has run out. Choose another, or wait for new ones.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = v_offer.pro_id AND status = 'approved') THEN
    RETURN public.refuse('That technician is not available any more. Choose another.');
  END IF;
  -- D37: his trade, its level, the trial limits and the price cap, at the moment she taps.
  IF public.pro_gate(v_offer.pro_id, v_trade, v_type, v_sector, v_customer, v_job) IS NOT NULL
     OR public.trial_cap_why(v_offer.pro_id, v_trade, v_offer.price_paisa) IS NOT NULL THEN
    RETURN public.refuse('That technician is not available for this job any more. Choose another.');
  END IF;
  -- His first risky job: somebody to check it, arranged now, or he cannot take it.
  IF public.needs_check(v_offer.pro_id, v_trade, v_type)
     AND public.arrange_check(v_job, v_offer.pro_id, public.window_start(v_when, coalesce(v_offer.arrive_from, v_from))) IS NULL THEN
    RETURN public.refuse('That technician cannot take this job right now. Choose another.');
  END IF;

  UPDATE public.jobs
  SET status = 'assigned', pro_id = v_offer.pro_id, agreed_paisa = v_offer.price_paisa,
      assigned_at = now(), assigned_by = 'customer', updated_at = now()
  WHERE id = v_job;
  UPDATE public.offers SET status = 'accepted', updated_at = now() WHERE id = p_offer;
  UPDATE public.offers SET status = 'rejected', updated_at = now()
  WHERE job_id = v_job AND id <> p_offer AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$$;



-- --- The office by hand: never past the rules -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_assign(p_job uuid, p_pro uuid, p_price_paisa bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_j      public.jobs;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN public.refuse('Only the office can do this.');
  END IF;
  SELECT status INTO v_status FROM public.jobs WHERE id = p_job FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN public.refuse('There is no such job.');
  END IF;
  IF v_status <> 'open' THEN
    RETURN public.refuse('This job already has a technician, or was cancelled.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro AND status = 'approved') THEN
    RETURN public.refuse('Choose an approved technician.', 'pro');
  END IF;
  -- D37: his trade and its level, the trial limits; a checked job only through her own choice.
  SELECT * INTO v_j FROM public.jobs WHERE id = p_job;
  IF public.pro_gate(p_pro, v_j.trade, v_j.job_type_id, v_j.sector, v_j.customer_id, p_job) IS NOT NULL
     OR public.needs_check(p_pro, v_j.trade, v_j.job_type_id) THEN
    RETURN public.refuse('He cannot take this kind of job yet.', 'pro');
  END IF;
  IF public.trial_cap_why(p_pro, v_j.trade, p_price_paisa) IS NOT NULL THEN
    RETURN public.refuse(public.trial_cap_why(p_pro, v_j.trade, p_price_paisa), 'price');
  END IF;
  IF p_price_paisa IS NULL OR p_price_paisa % 100 <> 0 OR p_price_paisa < public.setting('min_offer_paisa') THEN
    RETURN public.refuse('Write the price agreed, in whole rupees, at least the lowest offer.', 'price');
  END IF;

  UPDATE public.jobs
  SET status = 'assigned', pro_id = p_pro, agreed_paisa = p_price_paisa,
      assigned_at = now(), assigned_by = 'office', updated_at = now()
  WHERE id = p_job;
  UPDATE public.offers SET status = 'rejected', updated_at = now() WHERE job_id = p_job AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$$;



-- --- "Ask for him again": only if he could take it --------------------------------------------------

CREATE OR REPLACE FUNCTION public.job_preferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ask public.asked_for%ROWTYPE;
BEGIN
  DELETE FROM public.asked_for
  WHERE customer_id = NEW.customer_id AND trade = NEW.trade
  RETURNING * INTO v_ask;
  NEW.preferred_pro_id := NULL;
  NEW.preferred_until := NULL;
  NEW.preferred_released_at := NULL;
  IF v_ask.pro_id IS NULL OR v_ask.asked_at < now() - interval '1 hour' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pros r
             WHERE r.id = v_ask.pro_id AND r.status = 'approved' AND r.online AND r.id <> NEW.customer_id
               AND NEW.sector = ANY (r.sectors)
               AND public.pro_gate(r.id, NEW.trade, NEW.job_type_id, NEW.sector, NEW.customer_id, NULL) IS NULL
               AND NOT public.needs_check(r.id, NEW.trade, NEW.job_type_id)
               AND public.pro_owed(r.id) <= public.setting('credit_limit_paisa')
               AND NOT public.pro_paused(r.id)
               AND NOT public.pay_blocked(r.id)
               AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.customer_id = NEW.customer_id AND b.pro_id = r.id)) THEN
    NEW.preferred_pro_id := v_ask.pro_id;
    NEW.preferred_until := now() + make_interval(mins => public.setting('prefer_minutes')::integer);
  END IF;
  RETURN NEW;
END;
$$;



-- --- Starting: her answer at the door, and his checker ----------------------------------------------

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
    RETURN public.refuse('Too many wrong codes. Call the Pechkas office.', 'code');
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
      RETURN public.refuse('Too many wrong codes. Call the Pechkas office.', 'code');
    END IF;
    RETURN public.refuse('That is not the code. Ask the customer to read it from the app.', 'code');
  END IF;

  INSERT INTO public.job_photos (job_id, pro_id, stage, path)
  SELECT p_job, auth.uid(), 'before', x FROM jsonb_array_elements_text(p_photos) AS x;
  UPDATE public.jobs SET stage = 'working', started_at = now(), updated_at = now() WHERE id = p_job;
  RETURN jsonb_build_object('ok', true);
END;
$$;



-- --- Posting: a closed kind of job is said so -------------------------------------------------------

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
    RETURN public.refuse('For work this size, call Pechkas first.', 'offer');
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
    RETURN public.refuse('That is a lot of jobs for one day. Please call Pechkas.');
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



-- --- Offers she reads: "New on Pechkas", his photo, what is known of him ----------------------------

CREATE OR REPLACE FUNCTION public.job_offers(p_job uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'pro_first_name', split_part(r.full_name, ' ', 1),
      'years', r.years,
      'price_paisa', o.price_paisa,
      'is_counter', o.price_paisa <> j.offered_paisa,
      'eta_minutes', o.eta_minutes,
      'arrive_from', o.arrive_from,
      'note', o.note,
      'expires_at', o.expires_at,
      'created_at', o.created_at,
      'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
      'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
      'new_on_pechkas', EXISTS (SELECT 1 FROM public.pro_trades x WHERE x.pro_id = r.id AND x.trade = j.trade AND x.status = 'trial'),
      'photo', (SELECT f.path FROM public.pro_faces f WHERE f.pro_id = r.id),
      'identity', public.identity_line(r.id),
      'checked_visit', public.needs_check(r.id, j.trade, j.job_type_id)
    ) ORDER BY o.created_at), '[]'::jsonb)
  FROM public.offers o
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.pros r ON r.id = o.pro_id
  WHERE o.job_id = p_job
    AND j.customer_id = auth.uid()
    AND j.status = 'open'
    AND o.status = 'pending'
    AND o.expires_at > now()
    AND r.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.offer_profile(p_offer uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'first_name', split_part(r.full_name, ' ', 1),
    'years', r.years,
    -- D37: the trades he may work in, and those he is new in.
    'trades', (SELECT coalesce(jsonb_agg(t.name ORDER BY t.sort), '[]'::jsonb) FROM public.trades t WHERE public.trade_level(r.id, t.slug) <> 'none'),
    'new_in', (SELECT coalesce(jsonb_agg(t.name ORDER BY t.sort), '[]'::jsonb)
               FROM public.pro_trades x JOIN public.trades t ON t.slug = x.trade WHERE x.pro_id = r.id AND x.status = 'trial'),
    'identity', public.identity_line(r.id),
    'photo', (SELECT f.path FROM public.pro_faces f WHERE f.pro_id = r.id),
    'checked_since', r.decided_at,
    'checks', (SELECT coalesce(jsonb_agg(DISTINCT c.step), '[]'::jsonb) FROM public.pro_checks c WHERE c.pro_id = r.id),
    'rating', (public.pro_rating(r.id) ->> 'avg')::numeric,
    'rating_count', (public.pro_rating(r.id) ->> 'count')::integer,
    'jobs_done', (public.pro_rating(r.id) ->> 'jobs_done')::integer,
    'done_for_you', (SELECT count(*) FROM public.jobs d WHERE d.pro_id = r.id AND d.customer_id = auth.uid() AND d.status = 'done'),
    'words', (SELECT coalesce(jsonb_agg(s.w ORDER BY s.at DESC), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('stars', x.stars, 'words', x.words, 'at', x.created_at, 'trade', tt.name) AS w, x.created_at AS at
                FROM public.ratings x
                JOIN public.jobs xj ON xj.id = x.job_id
                LEFT JOIN public.trades tt ON tt.slug = xj.trade
                WHERE x.to_id = r.id AND x.side = 'customer'
                  AND nullif(btrim(coalesce(x.words, '')), '') IS NOT NULL
                  AND public.rating_revealed(x.job_id)
                ORDER BY x.created_at DESC
                LIMIT 5) s)
  )
  FROM public.offers o
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.pros r ON r.id = o.pro_id
  WHERE o.id = p_offer
    AND j.customer_id = auth.uid()
    AND r.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.customer_may_see_file(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_photos p JOIN public.jobs j ON j.id = p.job_id
    WHERE p.path = p_name AND j.customer_id = auth.uid()
  )
  -- D37: the photo of a man offering on her open job, or given her job.
  OR EXISTS (
    SELECT 1 FROM public.pro_faces f
    WHERE f.path = p_name
      AND (EXISTS (SELECT 1 FROM public.offers o JOIN public.jobs j ON j.id = o.job_id
                   WHERE o.pro_id = f.pro_id AND j.customer_id = auth.uid() AND j.status = 'open' AND o.status = 'pending')
           OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.pro_id = f.pro_id AND j.customer_id = auth.uid()))
  );
$$;



-- --- Her job: the photo, the door, the questions, the check, a safety report ------------------------

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
      'when_kind', j.when_kind, 'when_part', j.when_part, 'when_date', j.when_date, 'when_from', j.when_from,
      'sector', j.sector, 'street', j.street, 'house', j.house, 'landmark', j.landmark,
      'job_type_id', j.job_type_id, 'lat', j.lat, 'lng', j.lng,
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
    ) || jsonb_build_object(
      -- Nobody has offered yet (when_nobody_offers): what she may do about it.
      'list_paisa', (SELECT t.list_paisa FROM public.job_types t WHERE t.id = j.job_type_id),
      'nudged', j.status = 'open' AND j.nudged_at IS NOT NULL,
      'raises_left', greatest(public.setting('max_raises') - j.raises, 0),
      'can_raise', j.status = 'open' AND j.raises < public.setting('max_raises') AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now()),
      'can_move', j.status = 'open' AND j.when_kind <> 'now' AND j.when_from IS NULL AND j.when_part IS NULL AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) || jsonb_build_object(
      -- He says finished, she checks (checks_and_guarantee).
      'checking_at', j.checking_at,
      'check_due', CASE WHEN j.stage = 'checking' THEN j.checking_at + make_interval(hours => public.setting('check_hours')::integer) END,
      'not_finished', j.not_finished,
      'checks', coalesce((SELECT jsonb_agg(jsonb_build_object('round', k.round, 'answer', k.answer, 'reason', public.check_reason_text(k.reason),
                                                              'note', k.note, 'photo', k.photo, 'pro_reply', k.pro_reply) ORDER BY k.round)
                          FROM public.job_checks k WHERE k.job_id = j.id AND k.answer IS NOT NULL), '[]'::jsonb),
      'disputed', j.stage = 'disputed',
      'dispute_outcome', j.dispute_outcome, 'dispute_note', j.dispute_note,
      'confirmed_by', j.confirmed_by,
      'paid_by_pechkas', j.paid_by_pechkas,
      'guarantee_of_ref', (SELECT o.ref FROM public.guarantee_claims c JOIN public.jobs o ON o.id = c.job_id WHERE c.id = j.guarantee_of),
      'guarantee_days', CASE WHEN j.status = 'done' THEN public.guarantee_days_of(j.id) END,
      'guarantee_until', CASE WHEN j.status = 'done' THEN j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) END,
      'claim', public.claim_for_customer(j.id),
      'can_claim', j.status = 'done' AND j.finished_at + make_interval(days => public.guarantee_days_of(j.id)) > now()
                   AND NOT EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered')),
      'claim_open', EXISTS (SELECT 1 FROM public.guarantee_claims c WHERE c.job_id = j.id AND c.status NOT IN ('fixed', 'not_covered'))
                    OR EXISTS (SELECT 1 FROM public.problems x WHERE x.job_id = j.id AND x.kind = 'guarantee' AND x.status = 'open')
    ) || jsonb_build_object(
      -- A repair Pechkas pays for has no price for her to raise (guarantee_followups).
      'can_raise', j.status = 'open' AND NOT j.paid_by_pechkas AND j.raises < public.setting('max_raises')
                   AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id AND o.status = 'pending' AND o.expires_at > now())
    ) || jsonb_build_object(
      -- The visit fee (visit_fee): the figure she is shown before choosing,
      -- fixed when she chooses, and what happened to it after.
      'visit_fee_paisa', CASE WHEN j.status IN ('open', 'assigned') THEN public.visit_fee(j.id) END,
      'stop_reason', j.stop_reason,
      'visit_fee', public.visit_fee_view(j.id, 'customer')
    ) || jsonb_build_object(
      -- Cancelling (cancellations): whether she may, what it would count as
      -- right now, whether he is late or has not come, and how it was recorded.
      'window_start', public.window_start(j.when_date, j.when_from),
      'can_cancel', j.status = 'open' OR (j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')),
      'cancel_kind_now', CASE
        WHEN j.status = 'open' THEN 'before_choosing'
        WHEN j.status = 'assigned' AND j.stage IN ('chosen', 'on_way', 'arrived')
          THEN public.cancel_kind(now(), public.window_start(j.when_date, j.when_from), j.on_way_at, public.arrival_at(j),
                                  CASE WHEN j.stage = 'arrived' AND public.arrival_at(j) IS NULL THEN 'on_way' ELSE j.stage END, true) END,
      'pro_late', j.status = 'assigned' AND (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL))
                  AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
      'no_show', EXISTS (SELECT 1 FROM public.pro_incidents i WHERE i.job_id = j.id AND i.pro_id = j.pro_id AND i.kind = 'no_show' AND i.status = 'potential'),
      'cancel_code', j.cancel_code,
      'cancel_category', (SELECT c.category FROM public.cancellations c WHERE c.job_id = j.id),
      -- He cannot get in (D34): being asked, "I'm coming", and "I was home".
      'not_home', public.not_home_view(j.id, 'customer'),
      -- Said to her only when the location check verified it; never his coordinates.
      'arrival_verified', j.arrival_review_status = 'verified'
    ) || jsonb_build_object(
      -- A technician who cannot come (D11): find another, his estimate, and what came before.
      'can_find_another', public.can_find_another(j),
      'eta_at', CASE WHEN j.status = 'assigned' THEN j.eta_at END,
      'reopened', (SELECT jsonb_build_object('ended', a.ended, 'at', a.ended_at,
                                             'pro', (SELECT split_part(r.full_name, ' ', 1) FROM public.pros r WHERE r.id = a.pro_id))
                   FROM public.job_assignments a WHERE a.job_id = j.id ORDER BY a.ended_at DESC LIMIT 1),
      'technicians_before', (SELECT count(*) FROM public.job_assignments a WHERE a.job_id = j.id),
      -- D35: he says he was not paid in full.
      'payment', public.payment_view(j.id, 'customer')
    ) || jsonb_build_object(
      -- D37: his photo and her answer at the door, his first jobs, a checked job, her safety report.
      'pro_photo', CASE WHEN j.status IN ('assigned', 'done', 'stopped') THEN (SELECT f.path FROM public.pro_faces f WHERE f.pro_id = j.pro_id) END,
      'face_needed', j.status = 'assigned' AND j.stage = 'arrived' AND j.face_confirmed_at IS NULL
                     AND EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = j.pro_id),
      'face_confirmed', j.face_confirmed_at IS NOT NULL,
      'new_on_pechkas', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id),
      'trial_questions', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id AND x.answered_at IS NULL
                                 AND ((j.status = 'assigned' AND j.stage = 'checking')
                                      OR (j.status = 'done' AND j.finished_at > now() - interval '2 days'))),
      'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind,
                                          'checker', CASE WHEN k.kind = 'app' THEN split_part(k.checker_name, ' ', 1) END)
                FROM public.risk_checks k WHERE k.job_id = j.id AND k.status IN ('asked', 'accepted', 'passed', 'not_yet', 'unsafe')
                ORDER BY k.created_at DESC LIMIT 1),
      'safety_report', (SELECT jsonb_build_object('status', s.status, 'at', s.at) FROM public.safety_reports s
                        WHERE s.job_id = j.id AND s.from_id = auth.uid() AND s.kind = 'safety' LIMIT 1),
      'can_report_safety', j.pro_id IS NOT NULL
                           AND (j.status = 'assigned' OR (j.status IN ('done', 'stopped')
                                AND j.finished_at > now() - make_interval(days => public.guarantee_days_of(j.id))))
                           AND NOT EXISTS (SELECT 1 FROM public.safety_reports s WHERE s.job_id = j.id AND s.from_id = auth.uid() AND s.kind = 'safety')
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
      'when_kind', j.when_kind, 'when_part', j.when_part, 'when_date', j.when_date, 'when_from', j.when_from,
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
    ) || jsonb_build_object(
      'checking_at', j.checking_at,
      'check_due', CASE WHEN j.stage = 'checking' THEN j.checking_at + make_interval(hours => public.setting('check_hours')::integer) END,
      'not_finished', j.not_finished,
      'last_check', (SELECT jsonb_build_object('round', k.round, 'reason', public.check_reason_text(k.reason), 'note', k.note,
                                               'photo', k.photo, 'pro_reply', k.pro_reply, 'can_reply', k.pro_reply IS NULL)
                     FROM public.job_checks k WHERE k.job_id = j.id AND k.answer = 'not_finished' ORDER BY k.round DESC LIMIT 1),
      'dispute_outcome', j.dispute_outcome, 'dispute_note', j.dispute_note,
      'paid_by_pechkas', j.paid_by_pechkas,
      'keeps_paisa', CASE WHEN j.paid_by_pechkas THEN j.agreed_paisa ELSE j.agreed_paisa - public.commission_at(j.agreed_paisa, c.bps) END,
      'commission_bps', CASE WHEN j.paid_by_pechkas THEN 0 ELSE c.bps END
    ) || jsonb_build_object(
      'can_ask_change', j.stage = 'working',
      'window_start', public.window_start(j.when_date, j.when_from),
      'late', (j.stage IN ('chosen', 'on_way') OR (j.stage = 'arrived' AND public.arrival_at(j) IS NULL)) AND public.window_start(j.when_date, j.when_from) + interval '30 minutes' <= now(),
      -- He cannot get in (D34): from when he may ask, and where it stands.
      'not_home_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'nobody_home') END,
      'guard_from', CASE WHEN j.stage = 'arrived' THEN public.not_home_from(j, 'guard') END,
      'not_home', public.not_home_view(j.id, 'pro'),
      -- His own arrival check: the result and the distance, never coordinates.
      'arrival', public.arrival_view(j)
    ) || jsonb_build_object(
      -- "I can't come" and "I'm running late" (D11): whether he may, what it would count as now, and his estimate.
      'withdraw_kind_now', public.withdraw_kind(j),
      'late_withdrawals_at', public.setting('flag_late_withdrawals'),
      'flag_days', public.setting('flag_days'),
      'eta_at', j.eta_at,
      'etas_left', greatest(0, 2 - (SELECT count(*) FROM public.eta_reports e WHERE e.job_id = j.id AND e.pro_id = j.pro_id)),
      'eta_latest', CASE WHEN public.window_start(j.when_date, j.when_from) IS NOT NULL
                         THEN public.window_start(j.when_date, j.when_from) + interval '4 hours' ELSE now() + interval '3 hours' END
    ) || jsonb_build_object(
      -- D37: her answer at the door, his first jobs, his checker.
      'face_needed', j.face_confirmed_at IS NULL AND EXISTS (SELECT 1 FROM public.pro_faces f WHERE f.pro_id = j.pro_id),
      'first_job', EXISTS (SELECT 1 FROM public.trial_jobs x WHERE x.job_id = j.id AND x.pro_id = j.pro_id),
      'check', (SELECT jsonb_build_object('status', k.status, 'kind', k.kind,
                                          'checker', CASE WHEN k.kind = 'app' THEN split_part(k.checker_name, ' ', 1) END)
                FROM public.risk_checks k WHERE k.job_id = j.id AND k.pro_id = j.pro_id AND k.status IN ('asked', 'accepted') LIMIT 1)
    ) ORDER BY j.assigned_at DESC), '[]'::jsonb)
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = j.customer_id
  JOIN public.pros r ON r.id = auth.uid() AND r.status = 'approved'
  CROSS JOIN LATERAL (SELECT public.commission_rate(j.customer_id, j.pro_id, j.id) AS bps) c
  WHERE j.pro_id = auth.uid() AND j.status = 'assigned';
$$;



-- --- Approving: the app's rule, and the office only after it turned somebody down -------------------

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
    -- D37: approval is the app's rule. Only somebody the office turned down before,
    -- who has applied again, waits for a person, and then only once the same steps are done.
    IF NOT EXISTS (SELECT 1 FROM public.pros WHERE id = p_pro AND rejected_at IS NOT NULL) THEN
      RETURN public.refuse('Approval is by rule now: he is approved by himself once his number is checked, his photo is in and he has passed the rules quiz.', 'automatic');
    END IF;
    IF public.person_ready_why(p_pro) IS NOT NULL THEN
      RETURN public.refuse('He has not finished the steps before his first job yet.', 'checks');
    END IF;
    v_next := 'approved';
    v_reason := NULL;
    PERFORM set_config('pechkas.by_rule', 'on', true);
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
      decided_by = auth.uid(), updated_at = now(),
      approved_how = CASE WHEN p_decision = 'approve' THEN 'rule' ELSE approved_how END
  WHERE id = p_pro;
  PERFORM set_config('pechkas.by_rule', 'off', true);

  RETURN jsonb_build_object('ok', true, 'status', v_next);
END;
$$;



-- --- D36: a checker's fee is a credit that pays what he owes ----------------------------------------

CREATE OR REPLACE FUNCTION public.pay_items(p_pro uuid)
RETURNS TABLE (txn uuid, kind text, posted_at timestamptz, amount bigint, side text, live boolean,
               payable boolean, clock_from timestamptz, ref text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.kind, t.created_at, abs(s.amount),
         CASE WHEN t.kind IN ('commission', 'guarantee_charge', 'visit_fee_refund') THEN 'fee'
              WHEN t.kind = 'payout' THEN 'payout' ELSE 'credit' END,
         NOT EXISTS (SELECT 1 FROM public.ledger_txns r WHERE r.reverses = t.id),
         CASE WHEN t.kind = 'visit_fee_refund'
              THEN coalesce((SELECT v.refund_finalized_at IS NOT NULL FROM public.visit_fees v WHERE v.refund_txn = t.id), true)
              ELSE true END,
         CASE WHEN t.kind = 'visit_fee_refund'
              THEN coalesce((SELECT v.refund_finalized_at FROM public.visit_fees v WHERE v.refund_txn = t.id), t.created_at)
              ELSE t.created_at END,
         t.job_ref
  FROM public.ledger_txns t
  CROSS JOIN LATERAL (SELECT sum(e.amount_paisa) AS amount FROM public.ledger_entries e
                      WHERE e.txn_id = t.id AND e.account = 'pro_owes' AND e.pro_id = p_pro) s
  WHERE s.amount IS NOT NULL AND s.amount <> 0
    AND ((t.kind IN ('commission', 'guarantee_charge', 'visit_fee_refund', 'payout') AND s.amount > 0)
      OR (t.kind IN ('settlement', 'guarantee_pay', 'visit_fee_cover', 'checker_fee') AND s.amount < 0));
$$;



-- --- Demand: by what each man may take, and the closed kinds people asked for -----------------------

CREATE OR REPLACE FUNCTION public.admin_demand(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
BEGIN
  IF NOT public.is_staff() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'days', v_days,
    'served', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'nobody_offered')::integer DESC, (x ->> 'posted')::integer DESC, x ->> 'sector', x ->> 'trade')
      FROM (
        SELECT jsonb_build_object(
            'sector', j.sector, 'trade', j.trade, 'trade_name', t.name,
            'posted', count(*),
            -- No offer at all, and either the office had to place it or it
            -- waited `escalate_minutes` first. One cancelled a minute after
            -- posting tells us nothing about who was available.
            'nobody_offered', count(*) FILTER (
               WHERE NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.job_id = j.id)
                 AND (j.assigned_by = 'office'
                      OR CASE WHEN j.status = 'open' THEN now() ELSE coalesce(j.assigned_at, j.updated_at) END - j.created_at
                         >= make_interval(mins => public.setting('escalate_minutes')::integer))),
            'by_hand', count(*) FILTER (WHERE j.assigned_by = 'office'),
            'done', count(*) FILTER (WHERE j.status = 'done'),
            'cancelled', count(*) FILTER (WHERE j.status = 'cancelled'),
            'pros', (SELECT count(*) FROM public.pros r WHERE public.trade_level(r.id, j.trade) <> 'none' AND j.sector = ANY (r.sectors))
          ) AS x
        FROM public.jobs j JOIN public.trades t ON t.slug = j.trade
        WHERE j.created_at >= v_since
        GROUP BY j.sector, j.trade, t.name
      ) s), '[]'::jsonb),
    'uncovered', coalesce((
      SELECT jsonb_agg(jsonb_build_object('sector', s.name, 'trade', t.slug, 'trade_name', t.name) ORDER BY s.sort, t.sort)
      FROM public.sectors s CROSS JOIN public.trades t
      WHERE s.live
        AND NOT EXISTS (SELECT 1 FROM public.pros r WHERE public.trade_level(r.id, t.slug) <> 'none' AND s.name = ANY (r.sectors))
    ), '[]'::jsonb),
    -- D37: "Tell me when it is", per kind of job and sector, all time.
    'closed_asks', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'people')::integer DESC, x ->> 'trade_name', x ->> 'sector')
      FROM (
        SELECT jsonb_build_object(
            'trade', a.trade, 'trade_name', t.name, 'job_type_id', a.job_type_id,
            'job_type', coalesce(y.name, 'Something else'), 'sector', a.sector,
            'people', count(*), 'waiting', count(*) FILTER (WHERE a.told_at IS NULL), 'last_at', max(a.asked_at),
            'open_now', public.type_open(a.trade, a.job_type_id, a.sector)
          ) AS x
        FROM public.type_asks a JOIN public.trades t ON t.slug = a.trade LEFT JOIN public.job_types y ON y.id = a.job_type_id
        GROUP BY a.trade, t.name, a.job_type_id, y.name, a.sector
      ) s), '[]'::jsonb),
    'asked', coalesce((
      SELECT jsonb_agg(x ORDER BY (x ->> 'people')::integer DESC, x ->> 'sector')
      FROM (
        SELECT jsonb_build_object(
            'sector', a.sector,
            'people', count(DISTINCT a.customer_id),
            'last_at', max(a.asked_at),
            'trades', (SELECT jsonb_object_agg(b.trade_name, b.n) FROM (
                         SELECT t.name AS trade_name, count(*) AS n FROM public.sector_asks z JOIN public.trades t ON t.slug = z.trade
                         WHERE z.sector = a.sector AND z.asked_at >= v_since GROUP BY t.name) b),
            'pros', (SELECT count(*) FROM public.pros r WHERE r.status = 'approved' AND a.sector = ANY (r.sectors))
          ) AS x
        FROM public.sector_asks a
        WHERE a.asked_at >= v_since
        GROUP BY a.sector
      ) s), '[]'::jsonb)
  );
END;
$$;



-- --- Flags: a checker whose man turned out bad; a customer whose report was found false -------------

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
      -- His own lateness only (cancellations): never a customer changing her mind.
      (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'late_arrival'
         AND i.status <> 'dismissed' AND i.detected_at >= v_since) AS late_arrivals,
      (SELECT count(*) FROM public.pro_incidents i WHERE i.pro_id = r.id AND i.kind = 'no_show'
         AND i.status = 'confirmed' AND i.detected_at >= v_since) AS no_shows,
      -- "Nobody home" reports he made (D34), except those still disputed.
      (SELECT count(*) FROM public.not_home_reports x WHERE x.pro_id = r.id AND x.reason = 'nobody_home'
         AND x.status IN ('submitted', 'confirmed', 'rejected') AND x.submitted_at >= v_since) AS not_home_reports,
      -- Arrivals tapped but never verified, nor approved by the office, nor proved by the start code.
      (SELECT count(*) FROM public.jobs x WHERE x.pro_id = r.id AND x.arrival_review_status IN ('pending', 'rejected')
         AND x.arrived_at >= v_since)
      + (SELECT count(*) FROM public.job_assignments x WHERE x.pro_id = r.id AND x.arrival_review_status IN ('pending', 'rejected')
         AND x.arrived_at >= v_since) AS unverified_arrivals,
      -- "I can't come" within 2 hours of his time, or after it began (D11).
      (SELECT count(*) FROM public.pro_withdrawals x WHERE x.pro_id = r.id AND x.kind = 'late' AND x.at >= v_since) AS late_withdrawals,
      -- D36: a fee past its grace, his new offers stopped.
      CASE WHEN public.pay_blocked(r.id) THEN 1 ELSE 0 END AS overdue,
      -- D35: his not-paid reports, and any the office found false.
      (SELECT count(*) FROM public.payment_cases x WHERE x.pro_id = r.id AND x.created_at >= v_since) AS unpaid_reports,
      (SELECT count(*) FROM public.payment_cases x WHERE x.pro_id = r.id AND x.false_report AND x.office_at >= v_since) AS false_unpaid,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.pro_id = r.id AND x.side = 'customer' AND x.kind IN ('problem', 'guarantee') AND x.created_at >= v_since) AS complaints,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = r.id AND x.side = 'customer' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      (SELECT coalesce(max(n), 0) FROM (
         SELECT count(*) AS n FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         GROUP BY j.customer_id) g) AS same_customer,
      (SELECT count(*) FROM public.blocks b WHERE b.pro_id = r.id AND b.created_at >= v_since) AS blocked,
      -- Jobs where his price for the work was well above what jobs of that
      -- kind usually go for. Only kinds with a range at all count.
      (SELECT count(*) FROM public.jobs j, LATERAL (SELECT public.price_range_of(j.job_type_id) AS pr) x
         WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since AND x.pr IS NOT NULL
           AND (j.agreed_paisa - coalesce(j.parts_paisa, 0)) * 10000
               > (x.pr ->> 'high_paisa')::bigint * (10000 + public.setting('flag_price_over_bps'))) AS price_over,
      -- Finished jobs that closed by the clock, nobody having checked them.
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since
         AND j.confirmed_by = 'clock') AS unchecked,
      (SELECT count(*) FROM public.jobs j WHERE j.pro_id = r.id AND j.status = 'done' AND j.finished_at >= v_since) AS done_jobs,
      -- Guarantee claims on his work, except those the office found not covered.
      (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = r.id AND c.status <> 'not_covered'
         AND c.created_at >= now() - interval '60 days') AS claims60,
      (SELECT count(*) FROM public.guarantee_claims c WHERE c.pro_id = r.id AND c.status <> 'not_covered'
         AND c.created_at >= now() - interval '90 days') AS claims90,
      -- D37: a man he passed as a checker turned out bad.
      (SELECT count(*) FROM public.checker_strikes s WHERE s.checker_id = r.id AND s.lifted_at IS NULL) AS checker_strikes
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
        public.flag_if('late_arrivals', p.late_arrivals, public.setting('flag_late_arrivals')),
        public.flag_if('no_shows', p.no_shows, public.setting('flag_no_shows')),
        public.flag_if('not_home_reports', p.not_home_reports, public.setting('flag_not_home_reports')),
        public.flag_if('unverified_arrivals', p.unverified_arrivals, public.setting('flag_unverified_arrivals')),
        public.flag_if('late_withdrawals', p.late_withdrawals, public.setting('flag_late_withdrawals')),
        public.flag_if('overdue', p.overdue, 1),
        public.flag_if('unpaid_reports', p.unpaid_reports, public.setting('flag_unpaid_reports')),
        public.flag_if('false_unpaid', p.false_unpaid, 1),
        public.flag_if('checker_strike', p.checker_strikes, 1),
        public.flag_if('complaints', p.complaints, public.setting('flag_problems')),
        public.flag_if('low_stars', p.low_stars, public.setting('flag_low_stars')),
        public.flag_if('same_customer', p.same_customer, public.setting('flag_same_pair')),
        public.flag_if('blocked', p.blocked, public.setting('flag_blocked')),
        public.flag_if('price_over', p.price_over, public.setting('flag_price_over_jobs')),
        CASE WHEN p.unchecked >= public.setting('flag_unchecked_jobs')
                  AND p.unchecked * 10000 >= p.done_jobs * public.setting('flag_unchecked_bps')
             THEN public.flag_if('unchecked', p.unchecked, 1, p.done_jobs) END,
        CASE WHEN p.claims90 >= public.setting('flag_guarantee_review')
             THEN public.flag_if('guarantee_review', p.claims90, public.setting('flag_guarantee_review'))
             ELSE public.flag_if('guarantee', p.claims60, public.setting('flag_guarantee_jobs')) END
      ], NULL) AS flags
    FROM pro p
  ),
  cust AS (
    SELECT c.id, c.first_name AS name, public.phone_of(u.id) AS phone,
      -- Late cancellations only: at the door, within 2 hours, or once he was on his way.
      (SELECT count(*) FROM public.cancellations x WHERE x.customer_id = c.id AND x.category = 'late'
         AND x.cancelled_at >= v_since)
      -- "Find another technician" used just as late, with no fault of his and no warning from him (D11),
      -- counts the same: switching is never a way round the late-cancellation count.
      + (SELECT count(*) FROM public.job_assignments x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.ended = 'replaced' AND x.kind = 'late' AND x.ended_at >= v_since) AS late_cancels,
      -- Nobody home, confirmed by the office, and never when he was late (D34).
      (SELECT count(*) FROM public.not_home_reports x WHERE x.customer_id = c.id AND x.reason = 'nobody_home'
         AND x.status = 'confirmed' AND NOT x.pro_was_late AND x.submitted_at >= v_since) AS not_home,
      (SELECT count(*) FROM public.problems x JOIN public.jobs j ON j.id = x.job_id
         WHERE j.customer_id = c.id AND x.side = 'pro' AND x.kind = 'problem' AND x.created_at >= v_since) AS reports,
      (SELECT count(*) FROM public.ratings x WHERE x.to_id = c.id AND x.side = 'pro' AND x.stars <= 2 AND x.created_at >= v_since) AS low_stars,
      -- "Not finished yet" twice, and the office found the work finished.
      (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.dispute_outcome = 'done' AND j.disputed_at >= v_since) AS overruled,
      -- D35: jobs she agreed, or the office found, she had not paid in full. A report alone never counts.
      (SELECT count(*) FROM public.payment_cases x WHERE x.customer_id = c.id AND x.owed_at >= v_since) AS unpaid_jobs,
      -- D37 (point C): a safety report, or "It works: no", the office found false.
      (SELECT count(*) FROM public.safety_reports x WHERE x.from_id = c.id AND x.status = 'false' AND x.decided_at >= v_since)
      + (SELECT count(*) FROM public.jobs j WHERE j.customer_id = c.id AND j.dispute_outcome = 'done' AND j.disputed_at >= v_since
           AND EXISTS (SELECT 1 FROM public.trial_jobs t WHERE t.job_id = j.id)) AS false_reports
    FROM public.profiles c LEFT JOIN auth.users u ON u.id = c.id
    -- Customer mode now, or ever posted a job: a technician who books a
    -- repair is still a customer for that job, whichever mode he is in today.
    WHERE c.role = 'customer' OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.customer_id = c.id)
  ),
  cust_flags AS (
    SELECT c.*, array_remove(ARRAY[
        public.flag_if('late_cancels', c.late_cancels, public.setting('flag_late_cancels')),
        public.flag_if('not_home', c.not_home, public.setting('flag_not_home')),
        public.flag_if('reports', c.reports, public.setting('flag_problems')),
        public.flag_if('low_stars', c.low_stars, public.setting('flag_low_stars')),
        public.flag_if('overruled', c.overruled, public.setting('flag_overruled')),
        public.flag_if('unpaid_jobs', c.unpaid_jobs, public.setting('flag_unpaid_jobs')),
        public.flag_if('false_reports', c.false_reports, 1)
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
    'limits', (SELECT jsonb_object_agg(s.key, s.value) FROM public.settings s WHERE s.key LIKE 'flag\_%'
               AND s.key NOT IN ('flag_cancelled', 'flag_customer_cancels')),
    'people', v_rows
  );
END;
$$;



-- --- What people are told: a trade, a sector, a job number, an amount. Never a place or anybody's words ---

INSERT INTO public.push_words (key, sort, ur, en, who) VALUES
  ('pro_ready.title',            569, NULL, 'You can start taking jobs', 'technician'),
  ('pro_ready.body',             570, NULL, 'Open the app to see the first jobs open to you.', 'technician'),
  ('trade_approved.title',       571, NULL, 'You are approved in {trade}', 'technician'),
  ('trade_approved.body',        572, NULL, 'Three good jobs. Open the app to see what this opens.', 'technician'),
  ('trade_paused.title',         573, NULL, 'Your {trade} work is paused', 'technician'),
  ('trade_paused.body',          574, NULL, 'Jobs you have go on. Open the app to read why.', 'technician'),
  ('all_paused.title',           575, NULL, 'Your work on Pechkas is paused', 'technician'),
  ('all_paused.body',            576, NULL, 'Jobs you have go on. Open the app to read why.', 'technician'),
  ('trade_unpaused.title',       577, NULL, 'Your work is open again', 'technician'),
  ('trade_unpaused.body',        578, NULL, 'Open the app for the details.', 'technician'),
  ('trade_sorted.title',         579, NULL, 'Your {trade} work has been sorted by your record', 'technician'),
  ('trade_sorted.body',          580, NULL, 'Open the app to see what you can take.', 'technician'),
  ('pause_appeal_decided.title',       581, NULL, 'Pechkas has answered your appeal', 'technician'),
  ('pause_appeal_decided.body',        582, NULL, 'Open the app to read it.', 'technician'),
  ('safety_decided.title',       583, NULL, 'Pechkas has decided the report about you', 'technician'),
  ('safety_decided.body',        584, NULL, 'Open the app to read it.', 'technician'),
  ('face_change_decided.title',  585, NULL, 'Your photo request has been answered', 'technician'),
  ('face_change_decided.body',   586, NULL, 'Open the app to read it.', 'technician'),
  ('identity_verified.title',    587, NULL, 'Your identity is verified', 'technician'),
  ('identity_verified.body',     588, NULL, 'Open the app to see what this opens.', 'technician'),
  ('identity_failed.title',      589, NULL, 'Your identity could not be verified', 'technician'),
  ('identity_failed.body',       590, NULL, 'Open the app to try again.', 'technician'),
  ('check_asked.title',          591, NULL, 'Can you check a job? {ref}', 'technician'),
  ('check_asked.body',           592, NULL, '{trade}, {when_en}. Pechkas pays you {amount}. Open the app to answer.', 'technician'),
  ('check_found.title',          593, NULL, 'A checker is coming with you: {ref}', 'technician'),
  ('check_found.body',           594, NULL, 'Open the job for his name.', 'technician'),
  ('check_none.title',           595, NULL, 'Your job is open to other technicians again: {ref}', 'customer'),
  ('check_none.body',            596, NULL, 'The check this job needed could not be arranged in time. You owe nothing.', 'customer'),
  ('check_none_pro.title',       597, NULL, 'Your checked job could not go ahead: {ref}', 'technician'),
  ('check_none_pro.body',        598, NULL, 'No checker could come. Nothing is held against you.', 'technician'),
  ('risky_open.title',           599, NULL, 'Risky work in {trade} is open to you', 'technician'),
  ('risky_open.body',            600, NULL, 'Your checked job passed.', 'technician'),
  ('check_not_yet.title',        601, NULL, 'Your checked job did not pass yet', 'technician'),
  ('check_not_yet.body',         602, NULL, 'Open the app to read what the checker found.', 'technician'),
  ('check_paid.title',           603, NULL, 'Thank you for checking {ref}', 'technician'),
  ('check_paid.body',            604, NULL, '{amount} is credited to your Pechkas account.', 'technician'),
  ('face_no_office.title',       605, NULL, 'Not the man in the photo: {ref}', 'office'),
  ('face_no_office.body',        606, NULL, 'Open Exceptions in the office panel.', 'office'),
  ('safety_office.title',        607, NULL, 'Safety report: {ref}', 'office'),
  ('safety_office.body',         608, NULL, 'Open Exceptions in the office panel.', 'office'),
  ('appeal_office.title',        609, NULL, 'A technician has written to Pechkas', 'office'),
  ('appeal_office.body',         610, NULL, 'Open Exceptions in the office panel.', 'office'),
  ('face_change_office.title',   611, NULL, 'A photo change is waiting for the owner', 'office'),
  ('face_change_office.body',    612, NULL, 'Open Exceptions in the office panel.', 'office'),
  ('outside_office.title',       613, NULL, 'An assessor is needed: {ref}', 'office'),
  ('outside_office.body',        614, NULL, 'Open Exceptions to arrange it by email.', 'office'),
  ('type_open.title',            615, NULL, '{trade} work you asked about is open in {sector}', 'customer'),
  ('type_open.body',             616, NULL, 'You can post that job in the Pechkas app now.', 'customer')
ON CONFLICT (key) DO UPDATE SET ur = EXCLUDED.ur, en = EXCLUDED.en, sort = EXCLUDED.sort, who = EXCLUDED.who;
UPDATE public.push_words SET ur = en WHERE sort BETWEEN 569 AND 616 AND ur IS NULL;


-- --- The clock ---------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
  PERFORM cron.schedule('pechkas-first-jobs', '*/10 * * * *', 'SELECT public.first_jobs_clock()');
END $$;


-- --- Who may call what -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.is_owner(),
  public.identity_ok(uuid),
  public.identity_line(uuid),
  public.quiz_on(text),
  public.quiz_ok(uuid, text),
  public.quiz_view(uuid, text),
  public.job_type_risky(text, integer),
  public.claim_covered(text),
  public.trade_level(uuid, text),
  public.clean_record(uuid, text),
  public.risk_ready(uuid, text),
  public.pick_checker(uuid, text, text, uuid, uuid[]),
  public.check_possible(uuid, text, text, uuid),
  public.needs_check(uuid, text, integer),
  public.pro_gate(uuid, text, integer, text, uuid, uuid),
  public.trial_cap_why(uuid, text, bigint),
  public.type_open(text, integer, text),
  public.sync_pro_trades(),
  public.log_pro_trade(),
  public.person_ready_why(uuid),
  public.promote_person(uuid),
  public.promote_trade(uuid, text),
  public.pause_trade(uuid, text, text, uuid),
  public.lift_pause(uuid, text, uuid, timestamptz),
  public.trial_pause_check(uuid, text),
  public.trial_customer_why(uuid, uuid),
  public.trial_set(uuid, uuid, text, text),
  public.trial_review(uuid, uuid),
  public.on_job_first_jobs(),
  public.on_check_first_jobs(),
  public.fresh_upload(text),
  public.check_answer_by(timestamptz),
  public.arrange_check(uuid, uuid, timestamptz),
  public.check_next(uuid),
  public.check_outcome(uuid, text, text),
  public.sort_legacy(),
  public.first_jobs_clock(),
  public.identity_result(uuid, text, text),
  public.set_my_face(text),
  public.pro_face_change(text, text),
  public.admin_face_change(uuid, boolean, text),
  public.customer_face_answer(uuid, boolean),
  public.answer_trial(uuid, boolean, boolean, boolean),
  public.report_safety(uuid, text, text),
  public.pro_safety_reply(uuid, text),
  public.admin_safety_decide(uuid, text, text),
  public.pro_appeal(text, text),
  public.admin_trade_appeal(uuid, boolean, text),
  public.start_quiz(text),
  public.finish_quiz(uuid, jsonb),
  public.admin_set_quiz(text, boolean, text),
  public.admin_identity_service(boolean, text),
  public.identity_start(),
  public.checker_answer(uuid, boolean),
  public.checker_report(uuid, text, jsonb, jsonb, text),
  public.admin_outside_check(uuid, text, text, text),
  public.admin_outside_confirm(uuid),
  public.admin_outside_result(uuid, text, text),
  public.admin_cancel_outside(uuid),
  public.admin_lift_strike(uuid, text),
  public.job_types_closed(text),
  public.tell_me_when(text, integer, text),
  public.admin_close_not_covered(uuid),
  public.my_trades(),
  public.my_checks(),
  public.admin_exceptions(),
  public.admin_pro_trades(uuid),
  public.admin_first_jobs()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.set_my_face(text),
  public.pro_face_change(text, text),
  public.admin_face_change(uuid, boolean, text),
  public.customer_face_answer(uuid, boolean),
  public.answer_trial(uuid, boolean, boolean, boolean),
  public.report_safety(uuid, text, text),
  public.pro_safety_reply(uuid, text),
  public.admin_safety_decide(uuid, text, text),
  public.pro_appeal(text, text),
  public.admin_trade_appeal(uuid, boolean, text),
  public.start_quiz(text),
  public.finish_quiz(uuid, jsonb),
  public.admin_set_quiz(text, boolean, text),
  public.admin_identity_service(boolean, text),
  public.identity_start(),
  public.checker_answer(uuid, boolean),
  public.checker_report(uuid, text, jsonb, jsonb, text),
  public.admin_outside_check(uuid, text, text, text),
  public.admin_outside_confirm(uuid),
  public.admin_outside_result(uuid, text, text),
  public.admin_cancel_outside(uuid),
  public.admin_lift_strike(uuid, text),
  public.job_types_closed(text),
  public.tell_me_when(text, integer, text),
  public.admin_close_not_covered(uuid),
  public.my_trades(),
  public.my_checks(),
  public.admin_exceptions(),
  public.admin_pro_trades(uuid),
  public.admin_first_jobs()
TO authenticated;

-- The identity service's answer arrives only through the server function holding the service-role key.
GRANT EXECUTE ON FUNCTION public.identity_result(uuid, text, text) TO service_role;


INSERT INTO public.applied_migrations (name)
VALUES ('20261113000000_first_jobs')
ON CONFLICT (name) DO NOTHING;

COMMIT;
