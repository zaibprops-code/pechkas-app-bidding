/**
 * Two modes: one account, customer or technician.
 *
 * What must hold: technician mode needs an application on record; nobody
 * switches out of the middle of a job, on either side; leaving technician
 * mode takes him off duty (offline, waiting offers taken back, a job held
 * for him by name opened to everyone); an approved technician stays
 * approved; posting still needs customer mode; and the office's flags find
 * a customer by the jobs they posted, whatever mode they are in today.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'e1111111-1111-4111-8111-111111111111'; // customer
const SARA = 'e2222222-2222-4222-8222-222222222222'; // customer
const KAMRAN = 'e3333333-3333-4333-8333-333333333333'; // customer, never applied
const BILAL = 'e4444444-4444-4444-8444-444444444444'; // approved technician, AC, F-11
const ASAD = 'e5555555-5555-4555-8555-555555555555'; // approved technician, AC, F-11
const NEWBIE = 'e6666666-6666-4666-8666-666666666666'; // signed in, not set up
const OWNER = 'e9999999-9999-4999-8999-999999999999';

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [KAMRAN, '923005555555', null, 'customer', 'Kamran'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [NEWBIE, '923006666666', null, null, null],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const SWITCH = `SELECT public.switch_mode($1)`;
const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1, p_offer_paisa => 250000,
  p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => NULL, p_lat => NULL, p_lng => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`;
const OFFER = `SELECT public.make_offer($1, $2, $3, $4)`;
const roleOf = async (id) => (await setup(`SELECT role FROM public.profiles WHERE id = $1`, [id])).rows[0]?.role;
const proOf = async (id) => (await setup(`SELECT status, online FROM public.pros WHERE id = $1`, [id])).rows[0];
const offerOf = async (job, pro) => (await setup(`SELECT id, status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [job, pro])).rows[0];

// =============================================================================
heading('Who may switch, and to what');

denied('a stranger cannot', await as('anon', null, SWITCH, ['pro']));
{
  const r = (await call(NEWBIE, SWITCH, ['pro'])).value;
  ok('an account not set up yet is told to finish first', r?.ok === false && r?.field === 'account', JSON.stringify(r));
}
ok('a made-up mode is refused', (await call(AYESHA, SWITCH, ['boss'])).value?.field === 'mode');
{
  const r = (await call(KAMRAN, SWITCH, ['pro'])).value;
  ok('technician mode without an application sends him to apply', r?.ok === false && r?.field === 'apply', JSON.stringify(r));
  ok('and leaves him a customer', (await roleOf(KAMRAN)) === 'customer');
}
{
  const r = (await call(AYESHA, SWITCH, ['customer'])).value;
  ok('switching to the mode you are in changes nothing', r?.ok === true && r?.changed === false, JSON.stringify(r));
}

// =============================================================================
heading('Leaving technician mode is going off duty');

const ayeshas = (await call(AYESHA, POST, ['AC not cooling'])).value;
const saras = (await call(SARA, POST, ['Bedroom AC leaking'])).value;
ok('two jobs posted', ayeshas?.ok && saras?.ok, JSON.stringify([ayeshas, saras]));
ok('Bilal offers on Ayesha\'s', (await call(BILAL, OFFER, [ayeshas.id, 250000, 20, null])).value?.ok === true);
// Sara asked for Bilal by name: her job is held for him for ten minutes.
await setup(`UPDATE public.jobs SET preferred_pro_id = $2, preferred_until = now() + interval '10 minutes' WHERE id = $1`, [saras.id, BILAL]);
ok('Asad cannot see Sara\'s job while it is held for Bilal', (await call(ASAD, `SELECT public.pro_may_see($1)`, [saras.id])).value === false);

{
  const r = (await call(BILAL, SWITCH, ['customer'])).value;
  ok('Bilal switches to customer mode', r?.ok === true && r?.changed === true, JSON.stringify(r));
  ok('and is told one waiting offer was taken back', r?.offers_taken_back === 1, JSON.stringify(r));
}
ok('his mode is customer', (await roleOf(BILAL)) === 'customer');
ok('he is offline', (await proOf(BILAL)).online === false);
ok('he is still approved: the mode is the screen, not his record', (await proOf(BILAL)).status === 'approved');
ok('his offer to Ayesha is taken back', (await offerOf(ayeshas.id, BILAL)).status === 'withdrawn');
ok('it is gone from her list', ((await call(AYESHA, `SELECT public.job_offers($1)`, [ayeshas.id])).value ?? []).length === 0);
{
  const row = (await setup(`SELECT preferred_released_at FROM public.jobs WHERE id = $1`, [saras.id])).rows[0];
  ok('the job held for him goes to everyone', row.preferred_released_at !== null);
  ok('Asad can see it now', (await call(ASAD, `SELECT public.pro_may_see($1)`, [saras.id])).value === true);
  const { rows } = await setup(`SELECT detail FROM public.job_events WHERE job_id = $1 AND what = 'opened_to_all'`, [saras.id]);
  ok('the history says he passed', rows.length === 1 && rows[0].detail?.why === 'pro', JSON.stringify(rows));
}
ok('his feed is empty while he is a customer', ((await call(BILAL, `SELECT public.pro_feed()`)).value?.jobs ?? []).length === 0);

// =============================================================================
heading('A technician in customer mode books a repair');

{
  const kamrans = (await call(KAMRAN, POST, ['Kitchen AC'])).value;
  const r = (await call(KAMRAN, SWITCH, ['pro'])).value;
  ok('a customer with a job on hears about the job before the application', r?.field === 'job', JSON.stringify(r));
  await call(KAMRAN, `SELECT public.cancel_job($1, NULL)`, [kamrans.id]);
  ok('and once it is called off, about the application', (await call(KAMRAN, SWITCH, ['pro'])).value?.field === 'apply');
}

const bilals = (await call(BILAL, POST, ['My own AC at home'])).value;
ok('Bilal posts a job of his own', bilals?.ok === true, JSON.stringify(bilals));
{
  const r = (await call(BILAL, SWITCH, ['pro'])).value;
  ok('he cannot go back to technician mode while it waits for offers', r?.ok === false && r?.field === 'job', JSON.stringify(r));
  ok('and is told which job', /PK-\d+/.test(r?.why ?? ''), r?.why);
}
ok('he cannot offer on his own job', (await call(BILAL, OFFER, [bilals.id, 250000, 20, null])).value?.ok === false);
ok('Asad offers on it', (await call(ASAD, OFFER, [bilals.id, 250000, 20, null])).value?.ok === true);
ok('Bilal chooses Asad', (await call(BILAL, `SELECT public.choose_offer($1)`, [(await offerOf(bilals.id, ASAD)).id])).value?.ok === true);
{
  const r = (await call(ASAD, SWITCH, ['customer'])).value;
  ok('Asad cannot leave technician mode while he is on a job', r?.ok === false && r?.field === 'job', JSON.stringify(r));
  ok('his mode is unchanged', (await roleOf(ASAD)) === 'pro');
}
ok('Bilal still cannot switch while a technician is coming to him', (await call(BILAL, SWITCH, ['pro'])).value?.field === 'job');
ok('Bilal calls the job off', (await call(BILAL, `SELECT public.cancel_job($1, NULL)`, [bilals.id])).value?.ok === true);
{
  const r = (await call(BILAL, SWITCH, ['pro'])).value;
  ok('with nothing on, he goes back to technician mode', r?.ok === true && r?.changed === true, JSON.stringify(r));
  ok('still approved', (await proOf(BILAL)).status === 'approved');
  ok('and still offline until he says otherwise', (await proOf(BILAL)).online === false);
}
ok('in technician mode he cannot post a job', (await call(BILAL, POST, ['Another one'])).value?.ok === false);
ok('Asad, with his job gone, may switch', (await call(ASAD, SWITCH, ['customer'])).value?.ok === true);

// =============================================================================
heading('The first choice is not a back door');

{
  const r = (await call(BILAL, `SELECT public.start_as('customer', 'Bilal')`)).value;
  ok('a technician cannot change mode by starting again', r?.ok === false && r?.field === 'role', JSON.stringify(r));
  ok('and is told where the switch is', /menu/i.test(r?.why ?? ''), r?.why);
}
{
  const r = (await call(KAMRAN, `SELECT public.start_as('pro', 'Kamran')`)).value;
  ok('nor can a customer skip the application that way', r?.ok === false && (await roleOf(KAMRAN)) === 'customer', JSON.stringify(r));
}
ok('starting again in the same mode only updates the name', (await call(AYESHA, `SELECT public.start_as('customer', 'Ayesha B')`)).value?.ok === true
  && (await setup(`SELECT first_name FROM public.profiles WHERE id = $1`, [AYESHA])).rows[0].first_name === 'Ayesha B');
ok('a new account still starts normally', (await call(NEWBIE, `SELECT public.start_as('customer', 'Hina')`)).value?.ok === true);

// =============================================================================
heading('The office finds a customer by what they booked');

await setup(`UPDATE public.settings SET value = 1 WHERE key = 'flag_customer_cancels'`);
{
  const people = (await call(OWNER, `SELECT public.admin_flags()`)).value?.people ?? [];
  const asCustomer = people.find((p) => p.id === BILAL && p.side === 'customer');
  ok('Bilal, in technician mode, is on the customer list for the job he called off', Boolean(asCustomer), JSON.stringify(people));
}
ok('a note on him as a customer is accepted', (await call(OWNER, `SELECT public.admin_note_flag('customer', $1, 'Called off his own AC job')`, [BILAL])).value?.ok === true);
ok('a note on somebody as a technician needs an application', (await call(OWNER, `SELECT public.admin_note_flag('pro', $1, 'Never applied')`, [KAMRAN])).value?.ok === false);
ok('a customer still gets no flags at all', (await call(AYESHA, `SELECT public.admin_flags()`)).value === null);

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261029000000_two_modes.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('running it a second time works', error === null, error);
  ok('and leaves everybody in the mode they chose', (await roleOf(BILAL)) === 'pro' && (await roleOf(ASAD)) === 'customer');
}

report();
