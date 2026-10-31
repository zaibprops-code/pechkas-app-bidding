/**
 * When nobody offers.
 *
 * What must hold: the customer is told once, 20 minutes after a job for
 * today is announced (3 hours for a later day), never when somebody has
 * offered and never while the job is held for the technician she asked
 * for. She may raise her price by Rs 200, 500 or 1,000, at most 3 times,
 * only upwards and only while no offer is waiting; or move it to another
 * day. Either one tells the technicians again and starts the clock again.
 * A job nobody took closes at 8pm on its day, cancelled by "nobody", and
 * she is told. The office's phone is no longer told. And it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'b8111111-1111-4111-8111-111111111111';
const SARA = 'b8222222-2222-4222-8222-222222222222';
const BILAL = 'b8333333-3333-4333-8333-333333333333';
for (const [id, phone, role, name] of [
  [AYESHA, '923001111168', 'customer', 'Ayesha'],
  [SARA, '923002222268', 'customer', 'Sara'],
  [BILAL, '923003333368', 'pro', 'Bilal'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved')`, [BILAL]);
await setup(`UPDATE public.settings SET value = 100 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, n] of [[AYESHA, 'ayesha-no'], [BILAL, 'bilal-no']]) await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(n)]);
await call(BILAL, `SELECT public.pro_set_online(true)`);

const now = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const plus = async (n) => (await setup(`SELECT ($1::date + $2::int)::text AS d`, [now.d, n])).rows[0].d;
// "Today" can only be posted before 8pm; after it, tomorrow plays today's part and the clock is moved by hand.
const soon = now.h < 20 ? now.d : await plus(1);

const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC not cooling at all', p_offer_paisa => 150000,
  p_when_kind => 'today', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`;
const post = async (date, who = AYESHA) => (await call(who, POST, [date])).value;
const back = (id, minutes) => setup(`UPDATE public.jobs SET announced_at = now() - make_interval(mins => $2) WHERE id = $1`, [id, minutes]);
const job = async (id) => (await setup(`SELECT status, offered_paisa, raises, nudged_at, when_date::text AS when_date, cancelled_by, cancel_reason FROM public.jobs WHERE id = $1`, [id])).rows[0];
const nudge = async () => (await setup(`SELECT public.nudge_no_offers() AS n`)).rows[0].n;

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

// =============================================================================
heading('She is told once when nobody offers');
const a = await post(soon);
ok('a job is posted', a?.ok === true, JSON.stringify(a));
await sentSince();
await back(a.id, 15);
await nudge();
ok('not after 15 minutes', (await job(a.id)).nudged_at === null && (await sentSince()).length === 0);
if (soon === now.d) {
  await back(a.id, 21);
  await nudge();
  const told = await sentSince();
  ok('after 20 minutes on a job for today, she is told', told.some((m) => m.to === token('ayesha-no') && m.title.startsWith('No offers yet')), JSON.stringify(told));
  ok('and only she is', told.every((m) => m.to === token('ayesha-no')));
}
await back(a.id, 200);
await nudge();
const again = await sentSince();
// The owner's rule: the customer is never told a place. Who can take her job is the
// database's business, and a sector in the message only makes her anxious.
{
  const { rows } = await setup(`SELECT en FROM public.push_words WHERE key LIKE 'no_offers.%' OR key LIKE 'unclaimed.%'`);
  ok('her messages name no sector', rows.length === 4 && rows.every((r) => !r.en.includes('{sector}')), JSON.stringify(rows));
}
ok('only once, however long it waits', soon === now.d ? again.length === 0 : again.some((m) => m.title.startsWith('No offers yet')));
await nudge();
ok('and not a second time', (await sentSince()).length === 0);

const later = await post(await plus(3));
await back(later.id, 60);
await nudge();
ok('a job for a later day waits longer than an hour', (await job(later.id)).nudged_at === null);
await back(later.id, 181);
await nudge();
ok('after 3 hours she is told', (await job(later.id)).nudged_at !== null);

const offered = await post(await plus(2));
ok('Bilal offers on another job', (await call(BILAL, `SELECT public.make_offer(p_job => $1, p_price_paisa => 150000, p_eta_minutes => NULL, p_note => NULL, p_arrive_from => 12::smallint)`, [offered.id])).value?.ok === true);
await back(offered.id, 500);
await setup(`UPDATE public.offers SET updated_at = now() WHERE job_id = $1`, [offered.id]);
await nudge();
ok('a job somebody has offered on is never nudged', (await job(offered.id)).nudged_at === null);

const held = await post(await plus(2));
await setup(`UPDATE public.jobs SET preferred_pro_id = $2, preferred_until = now() + interval '5 minutes' WHERE id = $1`, [held.id, BILAL]);
await back(held.id, 500);
await nudge();
ok('nor one still held for the technician she asked for', (await job(held.id)).nudged_at === null);

// =============================================================================
heading('She raises her price');
const RAISE = `SELECT public.raise_price($1, $2)`;
await sentSince();
ok('another customer cannot', (await call(SARA, RAISE, [later.id, 50000])).value?.ok === false && (await job(later.id)).offered_paisa === 150000);
ok('a step that is not one of the three is refused', (await call(AYESHA, RAISE, [later.id, 30000])).value?.field === 'raise');
ok('nor downwards', (await call(AYESHA, RAISE, [later.id, -20000])).value?.field === 'raise');
const r1 = (await call(AYESHA, RAISE, [later.id, 50000])).value;
ok('Rs 500 more is taken', r1?.ok === true && (await job(later.id)).offered_paisa === 200000, JSON.stringify(r1));
ok('the reminder starts again', (await job(later.id)).nudged_at === null);
const toPros = await sentSince();
ok('Bilal is told the new price', toPros.some((m) => m.to === token('bilal-no') && m.title.includes('Rs 2,000')), JSON.stringify(toPros));
ok('with no street, house or number', toPros.every((m) => !/Street 34|House 12|0300/.test(JSON.stringify(m))));
ok('a second and third raise are taken', (await call(AYESHA, RAISE, [later.id, 20000])).value?.ok === true && (await call(AYESHA, RAISE, [later.id, 100000])).value?.ok === true);
const r4 = (await call(AYESHA, RAISE, [later.id, 20000])).value;
ok('a fourth is refused', r4?.ok === false && r4?.field === 'raise' && (await job(later.id)).offered_paisa === 320000, JSON.stringify(r4));
ok('while an offer is waiting, she cannot raise', (await call(AYESHA, RAISE, [offered.id, 20000])).value?.field === 'raise');
const mine = (await call(AYESHA, `SELECT public.my_jobs()`)).value;
const seenLater = mine.find((j) => j.id === later.id);
ok('her job says no raises are left', seenLater?.raises_left === 0 && seenLater?.can_raise === false);
ok('and that she can still move it', seenLater?.can_move === true);
ok('her job with an offer cannot be raised or moved', mine.find((j) => j.id === offered.id)?.can_raise === false && mine.find((j) => j.id === offered.id)?.can_move === false);

heading('She chooses another day');
const DAY = `SELECT public.change_day($1, $2::date)`;
await sentSince();
const moved = (await call(AYESHA, DAY, [later.id, await plus(5)])).value;
ok('a day in the coming week is taken', moved?.ok === true && (await job(later.id)).when_date === await plus(5), JSON.stringify(moved));
ok('Bilal is told again', (await sentSince()).some((m) => m.to === token('bilal-no')));
ok('a day too far is refused', (await call(AYESHA, DAY, [later.id, await plus(7)])).value?.field === 'day');
ok('yesterday is refused', (await call(AYESHA, DAY, [later.id, await plus(-1)])).value?.field === 'day');
ok('another customer cannot', (await call(SARA, DAY, [later.id, await plus(2)])).value?.ok === false);
ok('a job with an offer waiting cannot be moved', (await call(AYESHA, DAY, [offered.id, await plus(4)])).value?.field === 'day');

// =============================================================================
heading('A job nobody took closes itself');
const stale = await post(await plus(1));
await setup(`UPDATE public.jobs SET when_date = $2::date - 1 WHERE id = $1`, [stale.id, now.d]);
await sentSince();
await setup(`SELECT public.close_unclaimed()`);
const closed = await job(stale.id);
ok('a job whose day has passed is closed, by nobody', closed.status === 'cancelled' && closed.cancelled_by === 'nobody' && closed.cancel_reason === 'No technician was free for this job.', JSON.stringify(closed));
const told = await sentSince();
ok('she is told no technician was free', told.some((m) => m.to === token('ayesha-no') && m.title.startsWith('No technician was free')));
ok('a job for a later day stays open', (await job(later.id)).status === 'open');
const assigned = await post(await plus(2));
await setup(`UPDATE public.jobs SET status = 'assigned', pro_id = $2, agreed_paisa = 150000, when_date = $3::date - 1 WHERE id = $1`, [assigned.id, BILAL, now.d]);
await setup(`SELECT public.close_unclaimed()`);
ok('a job with a technician chosen is never closed', (await job(assigned.id)).status === 'assigned');

heading('The office is no longer told');
const jobs = (await setup(`SELECT jobname FROM cron.job`)).rows.map((r) => r.jobname);
ok('the reminder and the closing run on the clock', jobs.includes('pechkas-no-offers') && jobs.includes('pechkas-close-unclaimed'));
ok('the office alert does not', !jobs.includes('pechkas-needs-you'));

heading('Run a second time');
let twice = null;
try {
  await db.exec(await readFile(join(MIGRATIONS, '20261104000000_when_nobody_offers.sql'), 'utf8'));
} catch (e) {
  twice = e.message;
}
ok('the migration runs again without complaint', twice === null, twice);
ok('and raising is still limited after it', (await call(AYESHA, RAISE, [later.id, 20000])).value?.ok === false);

report();
