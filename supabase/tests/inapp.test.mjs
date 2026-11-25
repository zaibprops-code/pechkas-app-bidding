/**
 * Everything with the office happens inside the app (migration in_the_app).
 *
 * What must hold: a customer or technician can write to the office about a
 * job of theirs or about nothing, never about somebody else's job; the
 * office is told who wrote but never the words; the office can answer, and
 * can write first, and the person reads both in the app with a notification
 * that carries no words; and no refusal, notification or office alert in
 * the whole database tells anybody to call or WhatsApp the office.
 */
import { as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e6';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007611111', null, 'customer', 'Ayesha'],
  [SARA, '923007612222', null, 'customer', 'Sara'],
  [BILAL, '923007613333', null, 'pro', 'Bilal'],
  [OWNER, '923007619999', 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
// The owner's phone receives the office's alerts.
await setup(`UPDATE public.staff SET alert_phone = '923007619999' WHERE id = $1`, [OWNER]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
async function onJob(customer) {
  const r = (await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Not cooling',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  await setup(`SET session_replication_role = replica`);
  await setup(`UPDATE public.jobs SET status = 'assigned', stage = 'working', pro_id = $2, agreed_paisa = 300000 WHERE id = $1`, [r.id, BILAL]);
  await setup(`SET session_replication_role = DEFAULT`);
  return r.id;
}
const WRITE = `SELECT public.write_to_office($1, $2)`;
const mine = async (who, job = null) => (await call(who, `SELECT public.my_reports($1)`, [job])).value;
const pushes = async (who, kind) => (await setup(`SELECT title, body FROM public.push_log WHERE user_id = $1 AND kind = $2`, [who, kind])).rows;

const j1 = await onJob(AYESHA);
const j2 = await onJob(SARA);

// =============================================================================
heading('Writing to the office');

{
  ok('about nothing in particular', (await call(AYESHA, WRITE, [null, 'Do you work in G-10 yet?'])).value?.ok === true);
  ok('about her own job', (await call(AYESHA, WRITE, [j1, 'Can he come an hour later?'])).value?.ok === true);
  ok('the technician about his job', (await call(BILAL, WRITE, [j1, 'The customer asked me to come later'])).value?.ok === true);
  const other = (await call(AYESHA, WRITE, [j2, 'About Sara\'s job'])).value;
  ok('never about somebody else\'s job', other?.ok === false && other.field === 'job', JSON.stringify(other));
  ok('a few words at least', (await call(AYESHA, WRITE, [null, 'hi'])).value?.field === 'text');
  ok('no CNIC', (await call(AYESHA, WRITE, [null, ['My CNIC 61101', '1234567', '1'].join('-')])).value?.ok === false);
  denied('a stranger cannot write', await as('anon', null, WRITE, [null, 'Hello there office']));

  const list = await mine(AYESHA);
  ok('she sees her own messages, waiting', list.filter((x) => x.kind === 'message').length === 2 && list.every((x) => x.answer === null));
  ok('one without a job has no job number', list.some((x) => x.kind === 'message' && x.job_id === null && x.ref === null));
  ok('she never sees his', !JSON.stringify(list).includes('asked me to come later'));
  ok('the job\'s own list has only that job\'s', (await mine(AYESHA, j1)).every((x) => x.job_id === j1));

  const alerts = await pushes(OWNER, 'office_message');
  ok('the office\'s phone is told', alerts.length === 3, JSON.stringify(alerts));
  ok('who wrote and the job number', alerts.some((a) => /customer Ayesha about PK-/.test(a.body)) && alerts.some((a) => /technician Bilal/.test(a.body)), JSON.stringify(alerts.map((a) => a.body)));
  ok('never the words', !alerts.some((a) => /G-10|later/.test(a.title + a.body)));

  const office = (await call(OWNER, `SELECT public.admin_problems('open')`)).value;
  const g10 = office.find((p) => /G-10/.test(p.body ?? ''));
  ok('the office sees a message with no job, and who wrote it', g10 && g10.job === null && g10.person.name === 'Ayesha' && g10.kind === 'message', JSON.stringify(g10));
  ok('the office\'s list carries no phone number', !/9230076/.test(JSON.stringify(office)));
}

// =============================================================================
heading('The office answers, and writes first');

{
  const g10 = (await setup(`SELECT id FROM public.problems WHERE body = 'Do you work in G-10 yet?'`)).rows[0].id;
  ok('it answers a message with no job', (await call(OWNER, `SELECT public.admin_answer_problem($1, $2)`, [g10, 'Not yet. We will tell you when we do.'])).value?.ok === true);
  ok('she reads it', (await mine(AYESHA)).some((x) => /Not yet/.test(x.answer ?? '')));
  const told = await pushes(AYESHA, 'office_answer');
  ok('she is told, with no words', told.length === 1 && !/Not yet/.test(told[0].title + told[0].body), JSON.stringify(told));

  ok('only the office writes first', (await call(AYESHA, `SELECT public.admin_write_to($1, 'pro', NULL, $2)`, [j1, 'Hello'])).value?.ok === false);
  const w = (await call(OWNER, `SELECT public.admin_write_to($1, 'pro', NULL, $2)`, [j1, 'Please send the start photo again, it did not come through.'])).value;
  ok('the office writes to a job\'s technician', w?.ok === true, JSON.stringify(w));
  const his = await mine(BILAL, j1);
  ok('he reads it on the job', his.some((x) => x.kind === 'office' && /start photo/.test(x.answer ?? '') && x.body === null), JSON.stringify(his));
  ok('she does not', !JSON.stringify(await mine(AYESHA)).includes('start photo'));
  const note = await pushes(BILAL, 'office_wrote');
  ok('he is told the office wrote, with no words', note.length === 1 && !/photo/.test(note[0].title + note[0].body), JSON.stringify(note));
  ok('to one person, with no job', (await call(OWNER, `SELECT public.admin_write_to(NULL, NULL, $1, $2)`, [SARA, 'Welcome to Pechkas.'])).value?.ok === true
    && (await mine(SARA)).some((x) => x.kind === 'office' && x.job_id === null));
  ok('nobody to write to is refused', (await call(OWNER, `SELECT public.admin_write_to(NULL, NULL, NULL, 'Hello there')`)).value?.ok === false);
  nothing('nobody reads the table directly', await as('authenticated', AYESHA, `SELECT * FROM public.problems`));
}

// =============================================================================
heading('Nothing sends anybody to a call or WhatsApp');

{
  const calls = (await setup(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* '(call|ring|phone) (the )?(pechkas )?office|call pechkas|on whatsapp|whatsapp the office|office will (call|ring)|calls? you\\.'`)).rows.map((r) => r.proname);
  ok('no function tells anybody to call or WhatsApp the office', calls.length === 0, calls.join(', '));
  const words = (await setup(`SELECT key, en FROM public.push_words
    WHERE en ~* '(call|ring)( the)? (pechkas )?office|whatsapp|call (them|her|him|the technician|the customer|technicians)|ring (her|him|them)|and call you|call to confirm'`)).rows;
  ok('no notification or office alert says to call or WhatsApp', words.length === 0, JSON.stringify(words));
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261130000000_in_the_app.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await mine(AYESHA)).length >= 2);
}

report();
