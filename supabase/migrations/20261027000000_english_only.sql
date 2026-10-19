-- =============================================================================
--  ENGLISH ONLY
--
--  Run after 20261026000000_what_has_run.sql, in the Supabase SQL editor.
--  Running it a second time does no harm.
--
--  The owner's decision: every screen and every notification is in formal
--  English, for customers and technicians alike. Roman Urdu read as informal
--  and unofficial. Customers may still send a voice note in Urdu — that is
--  how they describe a fault, not how the app speaks.
--
--  1. Every phone hears English. A phone running an older app still asks
--     for 'ur' when it saves its token; the trigger stores 'en' whatever it
--     asks, so the old app cannot bring Roman Urdu back.
--  2. A new message no longer needs a Roman Urdu line: the rule that
--     demanded one for every technician's message is dropped. The old
--     lines stay in `push_words.ur`, unused — nothing can choose them once
--     every phone is 'en' — because clearing them would stop the older
--     migrations from being run a second time, which the owner is told to
--     do when an extension was missing.
--  3. The English is made more formal where it was chatty ("Carry on",
--     "Ring round").
-- =============================================================================

BEGIN;

-- 1. -------------------------------------------------------------------------

UPDATE public.push_tokens SET lang = 'en' WHERE lang IS DISTINCT FROM 'en';
ALTER TABLE public.push_tokens ALTER COLUMN lang SET DEFAULT 'en';

CREATE OR REPLACE FUNCTION public.push_tokens_english()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.lang := 'en';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_tokens_english ON public.push_tokens;
CREATE TRIGGER push_tokens_english
  BEFORE INSERT OR UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.push_tokens_english();

-- 2. -------------------------------------------------------------------------

ALTER TABLE public.push_words DROP CONSTRAINT IF EXISTS push_words_urdu;

-- 3. -------------------------------------------------------------------------

UPDATE public.push_words AS w SET en = v.en
FROM (VALUES
  ('new_job.body',        '{customer} · {price} · {when}. Open the app to send your offer.'),
  ('chosen.title',        'You have been chosen: {ref}'),
  ('chosen.body',         '{customer} accepted your offer of {price}. The address and phone number are in the app.'),
  ('not_chosen.title',    'Another technician was chosen: {ref}'),
  ('not_chosen.body',     'The customer chose another offer. Thank you for your offer.'),
  ('offer_closed.body',   'This job has been cancelled, and your offer is closed.'),
  ('cancelled.body',      'Please do not travel. The {trade} job in {sector} has been cancelled and removed from your app.'),
  ('office_gave.title',   'Pechkas has assigned you a job: {ref}'),
  ('office_gave.body',    '{trade} · {sector} · {price}. The address and phone number are in the app.'),
  ('offer.counter',       '{pro} offers {price}{eta}. Open the app to choose.'),
  ('office_assigned.body','Pechkas arranged it at {price}. The technician''s name and phone number are in the app.'),
  ('needs_you.body',      '{trade} · {sector} · {price}, waiting {minutes} minutes. Call technicians, or assign it in the admin panel.'),
  ('change.title',        '{pro} requests a new price: {price}'),
  ('change_ok.body',      '{customer} approved the new price for {ref}. You may continue the work.'),
  ('stopped.body',        '{customer} declined the new price. Please collect only the visit fee of {fee}.'),
  ('code_locked.body',    'Too many wrong codes were entered. Call the customer and the technician, then unlock it in the admin panel.'),
  ('problem.body',        '{customer} reports a problem. Open the admin panel and call them.'),
  ('settled.title',       'Payment received: {amount}'),
  ('settled.body',        'Your balance with Pechkas is now {owed}. Thank you.'),
  ('over_limit.title',    'Balance due to Pechkas: {owed}'),
  ('over_limit.body',     'Please clear this balance before sending new offers. Payment details are in the app.'),
  ('emergency_mistake.body', '{who} says the emergency button was pressed by mistake. Call to confirm.'),
  ('guarantee.body',      '{customer} reports that the work has failed. Call them, then arrange the repair.'),
  ('pro_problem.body',    'The technician reports a problem. Open the admin panel and call the technician.'),
  ('asked_again.title',   'A customer has asked for you again: {trade} · {sector}'),
  ('asked_again.body',    '{customer} · {price} · {when}. This job is reserved for you for {minutes} minutes; after that, every technician can see it.')
) AS v(key, en)
WHERE w.key = v.key;

INSERT INTO public.applied_migrations (name)
VALUES ('20261027000000_english_only')
ON CONFLICT (name) DO NOTHING;

COMMIT;
