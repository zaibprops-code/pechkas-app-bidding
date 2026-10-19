/**
 * Declining one offer.
 *
 * What must hold: only the customer whose job it is can say no, only to a
 * live offer on an open job, and only once. The technician is told, and the
 * message names no street, house or number. After that the job is closed to
 * him — his feed, a new offer, its files — but only that job: her others
 * still reach him. She can still choose somebody else. And the migration
 * can be run a second time, because the owner runs them by hand.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'd1111111-1111-4111-8111-111111111111'; // customer, F-11
const SARA = 'd2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'd3333333-3333-4333-8333-333333333333'; // AC, F-11
const ASAD = 'd4444444-4444-4444-8444-444444444444'; // AC, F-11

for (const [id, phone, role, name] of [
  [AYESHA, '923001111111', 'customer', 'Ayesha'],
  [SARA, '923002222222', 'customer', 'Sara'],
  [BILAL, '923003333333', 'pro', 'Bilal'],
  [ASAD, '923004444444', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved')`, [id, full]);
}

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[AYESHA, 'ayesha'], [BILAL, 'bilal'], [ASAD, 'asad']]) {
  await call('authenticated', who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
}
for (const who of [BILAL, ASAD]) await call('authenticated', who, `SELECT public.pro_set_online(true)`);

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1, p_offer_paisa => 250000,
  p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => 'Behind the markaz mosque', p_lat => 33.68, p_lng => 72.99, p_gate_note => 'Chowkidar Rafiq will open',
  p_media => '[]'::jsonb)`;
const OFFER = `SELECT public.make_offer($1, $2, $3, $4)`;
const DECLINE = `SELECT public.decline_offer($1)`;
const offerOf = async (job, pro) => (await setup(`SELECT id, status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [job, pro])).rows[0];

const job = (await call('authenticated', AYESHA, POST, ['AC not cooling at all'])).value;
const other = (await call('authenticated', AYESHA, POST, ['Second AC, the bedroom one'])).value;
ok('two jobs posted', job?.ok && other?.ok, JSON.stringify([job, other]));
ok('Bilal offers on the first', (await call('authenticated', BILAL, OFFER, [job.id, 250000, 15, null])).value?.ok === true);
ok('Asad offers on the first', (await call('authenticated', ASAD, OFFER, [job.id, 280000, 25, 'I bring my own gas gauge'])).value?.ok === true);
const bilals = await offerOf(job.id, BILAL);
const asads = await offerOf(job.id, ASAD);
await sentSince();

// =============================================================================
heading('Who may say no');

ok('a stranger cannot', Boolean((await as('anon', null, DECLINE, [bilals.id])).error));
ok('another customer cannot', (await call('authenticated', SARA, DECLINE, [bilals.id])).value?.ok === false);
ok('and is told nothing about whose it is', (await call('authenticated', SARA, DECLINE, [bilals.id])).value?.why === 'This offer is no longer open.');
ok('a technician cannot turn down another\'s offer', (await call('authenticated', ASAD, DECLINE, [bilals.id])).value?.ok === false);
ok('or his own', (await call('authenticated', BILAL, DECLINE, [bilals.id])).value?.ok === false);
ok('a made-up offer is refused, not raised', (await call('authenticated', AYESHA, DECLINE, ['00000000-0000-4000-8000-000000000000'])).value?.ok === false);
ok('none of that touched it', (await offerOf(job.id, BILAL)).status === 'pending');
ok('nobody was told anything', (await sentSince()).length === 0);

// =============================================================================
heading('Saying no');

ok('Ayesha turns Bilal down', (await call('authenticated', AYESHA, DECLINE, [bilals.id])).value?.ok === true);
ok('the offer is declined', (await offerOf(job.id, BILAL)).status === 'declined');
{
  const list = (await call('authenticated', AYESHA, `SELECT public.job_offers($1)`, [job.id])).value ?? [];
  ok('her list now has only Asad', list.length === 1 && list[0].pro_first_name === 'Asad', JSON.stringify(list));
  const mine = ((await call('authenticated', AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((j) => j.id === job.id);
  ok('her job counts one live offer', mine?.live_offers === 1, JSON.stringify(mine?.live_offers));
}
{
  const told = await sentSince();
  const his = told.filter((m) => m.to === token('bilal'));
  ok('Bilal is told once', his.length === 1, JSON.stringify(told));
  ok('that his offer was not taken, with the job number', /not taken/i.test(his[0]?.title ?? '') && /PK-/.test(his[0]?.title ?? ''), his[0]?.title);
  const words = JSON.stringify(his);
  ok('the message names no street, house, landmark or gate note', !/Street 34|House 12|markaz|Chowkidar/i.test(words), words);
  ok('nor any phone number', !/9230|0300/.test(words), words);
  ok('nobody else is told', told.every((m) => m.to === token('bilal')));
}
ok('saying no twice is refused', (await call('authenticated', AYESHA, DECLINE, [bilals.id])).value?.ok === false);
{
  const { rows } = await setup(`SELECT actor, detail FROM public.job_events WHERE job_id = $1 AND what = 'offer_declined'`, [job.id]);
  ok('it is in the job\'s history, as the customer\'s', rows.length === 1 && rows[0].actor === 'customer' && rows[0].detail?.pro === 'Bilal', JSON.stringify(rows));
}

// =============================================================================
heading('After no');

{
  const feed = (await call('authenticated', BILAL, `SELECT public.pro_feed()`)).value;
  const ids = (feed?.jobs ?? []).map((j) => j.id);
  ok('the job leaves Bilal\'s feed', !ids.includes(job.id), JSON.stringify(ids));
  ok('her other job is still in it: this is not a block', ids.includes(other.id), JSON.stringify(ids));
}
ok('he cannot offer on it again', (await call('authenticated', BILAL, OFFER, [job.id, 240000, 10, null])).value?.ok === false);
ok('the offer stays declined after trying', (await offerOf(job.id, BILAL)).status === 'declined');
ok('he may no longer see it, so not its files either', (await call('authenticated', BILAL, `SELECT public.pro_may_see($1)`, [job.id])).value === false);
ok('Asad still may', (await call('authenticated', ASAD, `SELECT public.pro_may_see($1)`, [job.id])).value === true);
ok('he can still offer on her other job', (await call('authenticated', BILAL, OFFER, [other.id, 250000, 15, null])).value?.ok === true);

// =============================================================================
heading('Closed offers, and choosing after');

await setup(`UPDATE public.offers SET expires_at = now() - interval '1 minute' WHERE job_id = $1 AND pro_id = $2`, [other.id, BILAL]);
ok('an offer that has run out cannot be turned down', (await call('authenticated', AYESHA, DECLINE, [(await offerOf(other.id, BILAL)).id])).value?.ok === false);
await sentSince();

ok('she can still choose Asad', (await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [asads.id])).value?.ok === true);
ok('Bilal is not told a second time when the job is taken', (await sentSince()).every((m) => m.to !== token('bilal')));
ok('once a technician is chosen, nothing can be turned down', (await call('authenticated', AYESHA, DECLINE, [asads.id])).value?.ok === false);
ok('Asad is still the one chosen', (await setup(`SELECT pro_id FROM public.jobs WHERE id = $1`, [job.id])).rows[0].pro_id === ASAD);

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261028000000_declining_an_offer.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('running it a second time works', error === null, error);
  ok('and leaves the declined offer as it was', (await offerOf(job.id, BILAL)).status === 'declined');
}

report();
