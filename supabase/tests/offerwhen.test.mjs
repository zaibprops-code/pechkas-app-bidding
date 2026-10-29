/**
 * The customer chooses the day; the technician says when he will come.
 *
 * What must hold: a job can be posted with a day and no time — today only
 * while a technician could still come. An offer on it must name one of the
 * seven windows, on that day, never one that has started; minutes are
 * refused. Choosing the offer makes his window the job's, so the customer,
 * the technician and the office all see it. Jobs from older copies — wanted
 * now, or with a time the customer chose — still take offers the old way. A
 * job whose day has passed leaves the list. And the migration runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'f1111111-1111-4111-8111-111111111111';
const BILAL = 'f3333333-3333-4333-8333-333333333333';
const ASAD = 'f4444444-4444-4444-8444-444444444444';
for (const [id, phone, role, name] of [
  [AYESHA, '923001111181', 'customer', 'Ayesha'],
  [BILAL, '923003333383', 'pro', 'Bilal'],
  [ASAD, '923004444484', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved')`, [id, full]);
}
await setup(`UPDATE public.settings SET value = 100 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, n] of [[AYESHA, 'ayesha-w'], [BILAL, 'bilal-w'], [ASAD, 'asad-w']]) await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(n)]);
for (const who of [BILAL, ASAD]) await call(who, `SELECT public.pro_set_online(true)`);

const now = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const plus = async (n) => (await setup(`SELECT ($1::date + $2::int)::text AS d`, [now.d, n])).rows[0].d;

const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC not cooling at all', p_offer_paisa => 250000,
  p_when_kind => $1, p_when_part => $2, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $3::date, p_when_from => $4::smallint)`;
const post = async (kind, part, date, from) => (await call(AYESHA, POST, [kind, part, date, from])).value;
const OFFER = `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_eta_minutes => $3, p_note => NULL, p_arrive_from => $4::smallint)`;
const offer = async (who, job, eta, from, price = 250000) => (await call(who, OFFER, [job, price, eta, from])).value;
const job = async (id) => (await setup(`SELECT when_kind, when_part, when_date::text AS when_date, when_from FROM public.jobs WHERE id = $1`, [id])).rows[0];

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

// =============================================================================
heading('A day is enough');
const in2 = await plus(2);
const sat = await post('today', null, in2, null);
ok('a job for a day, with no time, is taken', sat?.ok === true, JSON.stringify(sat));
const row = await job(sat.id);
ok('it keeps the day and no time', row.when_date === in2 && row.when_from === null && row.when_part === null && row.when_kind === 'later', JSON.stringify(row));
const label = (await setup(`SELECT to_char($1::date, 'Dy FMDD Mon') AS l`, [in2])).rows[0].l;
const told = (await sentSince()).map((m) => m.body).join(' | ');
ok('the technicians are told the day, with no time after it', told.includes(`· ${label}.`), told);
if (now.h >= 20) {
  const late = await post('today', null, now.d, null);
  ok('today is refused once the last window has started', late?.ok === false && late?.field === 'when', JSON.stringify(late));
} else {
  ok('today is taken while a technician could still come', (await post('today', null, now.d, null))?.ok === true);
}
ok('a day too far ahead is still refused', (await post('today', null, await plus(7), null))?.field === 'when');

// =============================================================================
heading('He says when he will come');
const noTime = await offer(BILAL, sat.id, null, null);
ok('an offer with no time is refused, beside the time', noTime?.ok === false && noTime?.field === 'arrive', JSON.stringify(noTime));
const minutes = await offer(BILAL, sat.id, 30, null);
ok('minutes are refused for a job on a day', minutes?.ok === false && minutes?.field === 'arrive', JSON.stringify(minutes));
ok('a window that is not one of the seven is refused', (await offer(BILAL, sat.id, null, 9))?.field === 'arrive');
ok('Bilal: 2–4pm', (await offer(BILAL, sat.id, null, 14))?.ok === true);
ok('Asad: 10am–12pm, a little dearer', (await offer(ASAD, sat.id, null, 10, 280000))?.ok === true);
const list = (await call(AYESHA, `SELECT public.job_offers($1)`, [sat.id])).value;
ok('the customer sees each offer\'s time', JSON.stringify(list.map((o) => [o.pro_first_name, o.arrive_from]).sort()) === JSON.stringify([['Asad', 10], ['Bilal', 14]]), JSON.stringify(list));
const feed = (await call(BILAL, `SELECT public.pro_feed()`)).value;
ok('and Bilal sees his own', feed.jobs.find((j) => j.id === sat.id)?.my_offer?.arrive_from === 14);
ok('he can change it', (await offer(BILAL, sat.id, null, 16))?.ok === true && (await setup(`SELECT arrive_from FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [sat.id, BILAL])).rows[0].arrive_from === 16);

if (now.h >= 8 && now.h < 20) {
  const today = await post('today', null, now.d, null);
  const started = Math.max(8, now.h - (now.h % 2));
  ok('a window that has already started today is refused', (await offer(BILAL, today.id, null, started))?.field === 'arrive');
  const later = [10, 12, 14, 16, 18, 20].find((w) => w > now.h);
  ok('a later one today is taken', (await offer(BILAL, today.id, null, later))?.ok === true);
}

// =============================================================================
heading('Choosing makes his time the job\'s');
const bilals = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [sat.id, BILAL])).rows[0].id;
ok('Ayesha chooses Bilal', (await call(AYESHA, `SELECT public.choose_offer($1)`, [bilals])).value?.ok === true);
const after = await job(sat.id);
ok('the job now has his 4–6pm, in the afternoon... evening', after.when_from === 16 && after.when_part === 'evening', JSON.stringify(after));
const mine = (await call(AYESHA, `SELECT public.my_jobs()`)).value.find((j) => j.id === sat.id);
ok('her job says it', mine?.when_from === 16 && mine?.when_date === in2);
const his = (await call(BILAL, `SELECT public.pro_my_jobs()`)).value.find((j) => j.id === sat.id);
ok('his job says it', his?.when_from === 16);

// =============================================================================
heading('Jobs from older copies');
const asap = await post('now', null, null, null);
ok('a job wanted now still posts', asap?.ok === true);
ok('and still takes minutes', (await offer(BILAL, asap.id, 30, null))?.ok === true);
ok('not a window', (await offer(ASAD, asap.id, null, 14))?.field === 'eta');
const chosenTime = await post('today', null, await plus(3), 12);
ok('a job whose customer chose the time still posts', chosenTime?.ok === true);
ok('and takes an offer with no time', (await offer(BILAL, chosenTime.id, null, null))?.ok === true);
ok('but not one with a time of his own', (await offer(ASAD, chosenTime.id, null, 14))?.field === 'eta');
const oldStyle = await post('tomorrow', 'morning', null, null);
ok('today / tomorrow with a part of the day still posts', oldStyle?.ok === true);
ok('and takes an offer with no time', (await offer(BILAL, oldStyle.id, null, null))?.ok === true);

// =============================================================================
heading('A day that has passed');
const gone = await post('today', null, await plus(1), null);
await setup(`UPDATE public.jobs SET when_date = when_date - 3, created_at = now() - interval '1 hour' WHERE id = $1`, [gone.id]);
const feed2 = (await call(ASAD, `SELECT public.pro_feed()`)).value;
ok('it leaves the list, even when posted an hour ago', !feed2.jobs.some((j) => j.id === gone.id));
ok('and an offer on it is refused', (await offer(ASAD, gone.id, null, 14))?.ok === false);

// =============================================================================
heading('Run a second time');
let twice = null;
try {
  await db.exec(await readFile(join(MIGRATIONS, '20261102000000_offer_says_when.sql'), 'utf8'));
} catch (e) {
  twice = e.message;
}
ok('the migration runs again without complaint', twice === null, twice);
ok('and an offer still needs a time after it', (await offer(ASAD, (await post('today', null, in2, null)).id, null, null))?.field === 'arrive');

report();
