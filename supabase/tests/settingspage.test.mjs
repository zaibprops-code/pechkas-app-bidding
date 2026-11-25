/**
 * The Settings page's numbers and name (migration settings_page).
 *
 * What must hold: each number is worked out from the asker's own rows only
 * — jobs done, still under guarantee, spent this year; a technician's jobs,
 * rating ("New", NULL, below rating_min_count) and what he kept this month
 * after Pechkas' share; his ratings show only revealed words, never who
 * wrote them; a customer may correct her first name, never to a number; a
 * stranger gets nothing; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'd7';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;

for (const [id, phone, role, name] of [
  [AYESHA, '923007211111', 'customer', 'Ayesha'],
  [SARA, '923007212222', 'customer', 'Sara'],
  [BILAL, '923007213333', 'pro', 'Bilal'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Not cooling', p_offer_paisa => 300000,
  p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`;
/** A finished job, set the quick way with the triggers off. */
async function finished(customer, how, pro, at, agreed, parts = 0, commission = 0, free = false) {
  const id = (await call(customer, POST)).value?.id;
  if (!id) throw new Error('post failed');
  await setup(`SET session_replication_role = replica`);
  await setup(`UPDATE public.jobs SET status = $2, pro_id = $3, finished_at = ${at}, agreed_paisa = $4, collect_paisa = $4,
    parts_paisa = $5, commission_paisa = $6, paid_by_pechkas = $7 WHERE id = $1`, [id, how, pro, agreed, parts, commission, free]);
  await setup(`SET session_replication_role = DEFAULT`);
  return id;
}
const now = `now()`;
const j1 = await finished(AYESHA, 'done', BILAL, now, 350000, 50000, 30000);
const j2 = await finished(AYESHA, 'done', BILAL, `now() - interval '60 days'`, 200000, 0, 20000);
await finished(AYESHA, 'stopped', BILAL, `now() - interval '1 day'`, 30000);
await finished(AYESHA, 'done', BILAL, `now() - interval '2 days'`, 150000, 0, 0, true);
await finished(AYESHA, 'done', BILAL, `now() - interval '400 days'`, 999900, 0, 0);
await finished(SARA, 'done', BILAL, now, 100000, 0, 10000);
const mine = async (who) => (await call(who, `SELECT public.my_settings()`)).value;

// =============================================================================
heading('A customer\'s numbers');

{
  const s = await mine(AYESHA);
  const year = new Date(Date.now() + 5 * 3600e3).getUTCFullYear();
  ok('since when', Boolean(s.since));
  ok('jobs done: her own four', s.customer.done === 4, JSON.stringify(s.customer));
  ok('still under guarantee: the fresh ones only', s.customer.covered >= 1 && s.customer.covered <= 2);
  ok('the year is Pakistan\'s', s.customer.year === year);
  // This year: 3,500 + 300 (the visit fee); the free repair is not hers; last year\'s is not this year\'s.
  const expect = 350000 + 30000 + (new Date(Date.now() - 60 * 864e5 + 5 * 3600e3).getUTCFullYear() === year ? 200000 : 0);
  ok('spent this year: what she paid, not a free repair, not last year', s.customer.spent_paisa === expect, `${s.customer.spent_paisa} vs ${expect}`);
  ok('a customer has no technician numbers', s.pro === null);
  ok('Sara sees only hers', (await mine(SARA)).customer.done === 1);
  denied('a stranger gets nothing', await as('anon', null, `SELECT public.my_settings()`));
}

// =============================================================================
heading('A technician\'s numbers');

{
  const s = await mine(BILAL);
  ok('jobs done, every customer\'s', s.pro.jobs_done === 5, String(s.pro.jobs_done));
  ok('New until enough ratings: no number', s.pro.rating === null);
  ok('his trade by name', JSON.stringify(s.pro.trades).includes('AC'), JSON.stringify(s.pro.trades));
  // This month: (3,500 − 500 − 300) + (1,000 − 100) + the free repair 1,500, if it fell this month.
  const month = (d) => new Date(Date.now() - d * 864e5 + 5 * 3600e3).toISOString().slice(0, 7);
  const m = month(0);
  const expect = 270000 + 90000 + (month(2) === m ? 150000 : 0);
  ok('kept this month: the work, after parts and Pechkas\' share', s.pro.kept_paisa === expect, `${s.pro.kept_paisa} vs ${expect}`);
}

// =============================================================================
heading('His ratings');

{
  await setup(`UPDATE public.settings SET value = 2 WHERE key = 'rating_min_count'`);
  for (const [job, from, stars, words] of [[j1, AYESHA, 5, 'On time and tidy.'], [j2, AYESHA, 4, null]]) {
    await setup(`INSERT INTO public.ratings (job_id, side, from_id, to_id, stars, words, created_at) VALUES ($1, 'customer', $2, $3, $4, $5, now() - interval '3 days')`, [job, from, BILAL, stars, words]);
  }
  // He has rated her too, so the job finished today is revealed at once (rating_revealed).
  await setup(`INSERT INTO public.ratings (job_id, side, from_id, to_id, stars) VALUES ($1, 'pro', $2, $3, 5)`, [j1, BILAL, AYESHA]);
  const r = (await call(BILAL, `SELECT public.my_ratings()`)).value;
  ok('a rating once there are enough', Number(r.rating) === 4.5 && r.count === 2, JSON.stringify(r));
  ok('only words that were written', r.words.length === 1 && r.words[0].words === 'On time and tidy.');
  ok('never who wrote them', !/Ayesha|d7111111/.test(JSON.stringify(r)));
  ok('the settings strip says the same', Number((await mine(BILAL)).pro.rating) === 4.5);
  ok('a customer has no ratings page', (await call(AYESHA, `SELECT public.my_ratings()`)).value === undefined || (await call(AYESHA, `SELECT public.my_ratings()`)).value === null);
}

// =============================================================================
heading('Her first name');

{
  const NAME = `SELECT public.set_my_name($1)`;
  ok('she can correct it', (await call(AYESHA, NAME, ['  Ayesha   Bibi '])).value?.ok === true);
  ok('kept tidy', (await setup(`SELECT first_name FROM public.profiles WHERE id = $1`, [AYESHA])).rows[0].first_name === 'Ayesha Bibi');
  const num = (await call(AYESHA, NAME, ['0300 1234567'])).value;
  ok('never a number', num?.ok === false && num.field === 'name');
  ok('never an email', (await call(AYESHA, NAME, ['a@b.com'])).value?.ok === false);
  ok('never empty', (await call(AYESHA, NAME, ['   '])).value?.ok === false);
  ok('40 letters at most', (await call(AYESHA, NAME, ['x'.repeat(41)])).value?.ok === false);
  ok('a refusal changes nothing', (await setup(`SELECT first_name FROM public.profiles WHERE id = $1`, [AYESHA])).rows[0].first_name === 'Ayesha Bibi');
  await call(BILAL, NAME, ['Bilal']);
  ok('a technician\'s approved full name is never touched', (await setup(`SELECT full_name FROM public.pros WHERE id = $1`, [BILAL])).rows[0].full_name === 'Bilal Ahmed');
  denied('a stranger cannot', await as('anon', null, `SELECT public.set_my_name('X')`));
}

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261128000000_settings_page.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('the file runs a second time', error === null, error);
  ok('and it still answers', (await mine(AYESHA)).customer.done === 4);
}

report();
