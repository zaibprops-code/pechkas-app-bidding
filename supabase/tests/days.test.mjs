/**
 * A day and a time, the technician's profile, and Book again.
 *
 * What must hold: a job can be booked for today and the six days after it,
 * in a two-hour window from 8–10am to 8–10pm, never a window that has
 * already started and never further ahead; the old today / tomorrow way
 * still works and gets its date; the notification says the day and the
 * window. A booked job stays in a technician's list until its day. Only the
 * customer whose job he offered on may open his profile, and it names no
 * surname, number or customer, and shows only what customers wrote once it
 * is revealed. A customer's own job carries what "Book again" needs.
 * And the migration can be run a second time.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'e1111111-1111-4111-8111-111111111111'; // customer, F-11
const SARA = 'e2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'e3333333-3333-4333-8333-333333333333'; // AC, F-11
const STAFF = 'e5555555-5555-4555-8555-555555555555';

for (const [id, phone, role, name] of [
  [AYESHA, '923001111191', 'customer', 'Ayesha'],
  [SARA, '923002222292', 'customer', 'Sara'],
  [BILAL, '923003333393', 'pro', 'Bilal'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, decided_at) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', now() - interval '30 days')`, [BILAL]);
await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'office@pechkas.test')`, [STAFF]);
await setup(`INSERT INTO public.staff (id, name, active) VALUES ($1, 'Office', true)`, [STAFF]).catch(() => {});
for (const step of ['identity', 'trial_job', 'rules']) {
  await setup(`INSERT INTO public.pro_checks (pro_id, step, method, checked_on, checked_by_name) VALUES ($1, $2, 'in_person', current_date - 30, 'Zohaib')`, [BILAL, step]);
}

// Many posts from one customer here: lift the flood limits for the test only.
await setup(`UPDATE public.settings SET value = 100 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
await call(BILAL, `SELECT public.save_push_token($1, 'android', 'en')`, [token('bilal-days')]);
await call(BILAL, `SELECT public.pro_set_online(true)`);

const today = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const plus = async (n) => (await setup(`SELECT ($1::date + $2::int)::text AS d`, [today.d, n])).rows[0].d;

const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC not cooling at all', p_offer_paisa => 250000,
  p_when_kind => $1, p_when_part => $2, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $3::date, p_when_from => $4::smallint)`;
const post = async (kind, part, date, from, who = AYESHA) => (await call(who, POST, [kind, part, date, from])).value;
const row = async (id) => (await setup(`SELECT when_kind, when_part, when_date::text AS when_date, when_from FROM public.jobs WHERE id = $1`, [id])).rows[0];

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

// =============================================================================
heading('A day and a two-hour window');

const in3 = await plus(3);
const saturday = await post('today', null, in3, 10);
ok('a day three days ahead, 10am–12pm, is taken', saturday?.ok === true, JSON.stringify(saturday));
const sat = await row(saturday.id);
ok('it is kept as that date and window', sat.when_date === in3 && sat.when_from === 10, JSON.stringify(sat));
ok('and still reads as later, in the morning, for anything older', sat.when_kind === 'later' && sat.when_part === 'morning', JSON.stringify(sat));
const words = (await sentSince()).map((m) => m.body).join(' | ');
const label = (await setup(`SELECT to_char($1::date, 'Dy FMDD Mon') AS l`, [in3])).rows[0].l;
ok('the technician is told the day and the window', words.includes(`${label}, 10am–12pm`), words);

const tomorrow = await post('today', null, await plus(1), 18);
ok('tomorrow 6–8pm reads as tomorrow evening', JSON.stringify(await row(tomorrow.id)) === JSON.stringify({ when_kind: 'tomorrow', when_part: 'evening', when_date: await plus(1), when_from: 18 }));
ok('the last day of the week is allowed', (await post('today', null, await plus(6), 20))?.ok === true);

const refused = async (what, kind, part, date, from) => {
  const r = await post(kind, part, date, from);
  ok(what, r?.ok === false && r?.field === 'when', JSON.stringify(r));
};
await refused('a week and a day ahead is refused', 'today', null, await plus(7), 10);
await refused('yesterday is refused', 'today', null, await plus(-1), 10);
await refused('a window that is not one of the seven is refused', 'today', null, in3, 9);
await refused('a day with no window is refused', 'today', null, in3, null);
await refused('"now" with a day is refused', 'now', null, in3, 10);
if (today.h >= 8) await refused('a window that has already started today is refused', 'today', null, today.d, Math.min(20, today.h - (today.h % 2)));
if (today.h < 20) {
  const later = [8, 10, 12, 14, 16, 18, 20].find((h) => h > today.h);
  ok('a window later today is taken', (await post('today', null, today.d, later))?.ok === true);
}

heading('The old way still works');
const old = await post('tomorrow', 'morning', null, null);
ok('tomorrow morning, from an older copy of the app, is taken', old?.ok === true, JSON.stringify(old));
ok('and gets tomorrow\'s date', (await row(old.id)).when_date === await plus(1));
const now = await post('now', null, null, null);
ok('as soon as possible is taken and dated today', now?.ok === true && (await row(now.id)).when_date === today.d);

heading('A booked job stays in the list until its day');
await setup(`UPDATE public.jobs SET created_at = now() - interval '4 days' WHERE id = $1`, [saturday.id]);
await setup(`UPDATE public.jobs SET created_at = now() - interval '4 days', when_date = when_date - 4 WHERE id = $1`, [now.id]);
const feed = (await call(BILAL, `SELECT public.pro_feed()`)).value;
const ids = (feed?.jobs ?? []).map((j) => j.id);
ok('a job booked for a later day is still there after four days', ids.includes(saturday.id));
ok('one wanted now is gone after two days, as before', !ids.includes(now.id));
const inFeed = (feed?.jobs ?? []).find((j) => j.id === saturday.id);
ok('the feed carries the day and the window', inFeed?.when_date === in3 && inFeed?.when_from === 10, JSON.stringify(inFeed));
ok('and still no street, house or pin', inFeed && !('street' in inFeed) && !('house' in inFeed) && !('lat' in inFeed));

// =============================================================================
heading('The technician\'s profile, for the customer choosing');

ok('Bilal offers', (await call(BILAL, `SELECT public.make_offer($1, $2, $3, $4)`, [saturday.id, 250000, null, null])).value?.ok === true);
const offerId = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [saturday.id, BILAL])).rows[0].id;

// A finished job with written words, and one whose words are not revealed yet.
const done1 = (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status, pro_id, agreed_paisa, collect_paisa, finished_at, created_at)
  VALUES ($1, 'ac', 'Gas top-up', 250000, 'today', 'morning', 'F-11', 'Street 1', 'House 1', 'done', $2, 250000, 250000, now() - interval '5 days', now() - interval '6 days') RETURNING id`, [SARA, BILAL])).rows[0].id;
const done2 = (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status, pro_id, agreed_paisa, collect_paisa, finished_at, created_at)
  VALUES ($1, 'ac', 'Service', 200000, 'today', 'morning', 'F-11', 'Street 2', 'House 2', 'done', $2, 200000, 200000, now() - interval '1 hour', now() - interval '3 hours') RETURNING id`, [SARA, BILAL])).rows[0].id;
await setup(`INSERT INTO public.ratings (job_id, side, from_id, to_id, stars, words) VALUES ($1, 'customer', $2, $3, 5, 'On time and tidy, cooling well now.')`, [done1, SARA, BILAL]);
await setup(`INSERT INTO public.ratings (job_id, side, from_id, to_id, stars, words) VALUES ($1, 'customer', $2, $3, 2, 'Not revealed yet')`, [done2, SARA, BILAL]);

const profile = (await call(AYESHA, `SELECT public.offer_profile($1)`, [offerId])).value;
ok('the customer whose job it is sees his profile', profile?.first_name === 'Bilal' && profile?.years === 6, JSON.stringify(profile));
ok('with his trades and the checks Pechkas did', JSON.stringify(profile?.trades) === '["AC"]' && profile?.checks?.length === 3, JSON.stringify([profile?.trades, profile?.checks]));
ok('jobs done is a real count', profile?.jobs_done === 2, String(profile?.jobs_done));
ok('what a customer wrote is shown once revealed', profile?.words?.some((w) => w.words === 'On time and tidy, cooling well now.'));
ok('and not before', !profile?.words?.some((w) => w.words === 'Not revealed yet'));
const flat = JSON.stringify(profile);
ok('never his surname', !flat.includes('Ahmed'));
ok('never his number', !flat.includes('923003333393'));
ok('never who wrote it', !flat.includes('Sara') && !flat.includes(SARA));
ok('another customer gets nothing', (await call(SARA, `SELECT public.offer_profile($1)`, [offerId])).value === null);
ok('Bilal himself gets nothing', (await call(BILAL, `SELECT public.offer_profile($1)`, [offerId])).value === null);
ok('a stranger cannot ask at all', Boolean((await as('anon', null, `SELECT public.offer_profile($1)`, [offerId])).error));

// =============================================================================
heading('Book again');
const mine = (await call(AYESHA, `SELECT public.my_jobs()`)).value;
const again = mine.find((j) => j.id === saturday.id);
ok('her own job carries its job type, pin, day and window', again && 'job_type_id' in again && again.lat === 33.68 && again.lng === 72.99 && again.when_date === in3 && again.when_from === 10, JSON.stringify(again && { t: again.job_type_id, lat: again.lat, d: again.when_date, f: again.when_from }));
ok('another customer\'s jobs are not in her list', !mine.some((j) => j.id === done1));

heading('The office');
const isStaff = (await setup(`SELECT count(*)::int AS n FROM public.staff WHERE id = $1`, [STAFF])).rows[0].n === 1;
if (isStaff) {
  const office = await as('authenticated', STAFF, `SELECT id, when_date::text AS when_date, when_from FROM public.admin_jobs(NULL) WHERE id = $1`, [saturday.id]);
  ok('the office sees the day and the window', office.rows[0]?.when_date === in3 && office.rows[0]?.when_from === 10, JSON.stringify(office));
}

// =============================================================================
heading('Run a second time');
const file = join(MIGRATIONS, '20261101000000_days_profiles_again.sql');
let again2 = null;
try {
  await db.exec(await readFile(file, 'utf8'));
} catch (e) {
  again2 = e.message;
}
ok('the migration runs again without complaint', again2 === null, again2);
ok('and posting still works after it', (await post('today', null, in3, 14))?.ok === true);

report();
