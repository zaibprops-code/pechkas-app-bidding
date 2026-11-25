/**
 * Jobs near him, a search that widens, and the automatic choice (migration jobs_near_him).
 *
 * What must hold: nobody goes online without a fresh position; a new job
 * reaches the technicians near its pin first, and the reach grows evenly
 * until it is all of Islamabad, each technician it comes to told once; a
 * technician with no position and no home area is still reached through
 * his sectors; his home area stands in for an old position; the customer
 * sees how many have looked and their first letters, never who; he sees
 * how far a job is in a straight line; the automatic choice takes the
 * first offer at her price and no other; old positions are forgotten; and
 * the migration runs twice.
 */
import { as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e8';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`; // 1 km from the job
const ASAD = `${P}444444-4444-4444-8444-444444444444`; // about 20 km away
const KAMRAN = `${P}555555-5555-4555-8555-555555555555`; // no position, works in F-11
const DANISH = `${P}666666-6666-4666-8666-666666666666`; // in Lahore

for (const [id, phone, role, name] of [
  [AYESHA, '923008111111', 'customer', 'Ayesha'],
  [SARA, '923008222222', 'customer', 'Sara'],
  [BILAL, '923008333333', 'pro', 'Bilal'],
  [ASAD, '923008444444', 'pro', 'Asad'],
  [KAMRAN, '923008555555', 'pro', 'Kamran'],
  [DANISH, '923008666666', 'pro', 'Danish'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full, sector] of [[BILAL, 'Bilal Ahmed', 'F-11'], [ASAD, 'Asad Mehmood', 'G-9'], [KAMRAN, 'Kamran Ali', 'F-11'], [DANISH, 'Danish Iqbal', 'G-9']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, $3, 'approved', false)`, [id, full, `{${sector}}`]);
}
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
// Risky work (D37) is its own test.
await setup(`UPDATE public.job_types SET risky = false WHERE trade = 'ac'`);
await setup(`UPDATE public.trades SET something_else_risky = false WHERE slug = 'ac'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[BILAL, 'bilal'], [ASAD, 'asad'], [KAMRAN, 'kamran'], [DANISH, 'danish'], [AYESHA, 'ayesha']]) {
  await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
}
const told = async (who, job) => Number((await setup(`SELECT count(*) AS n FROM public.push_log WHERE user_id = $1 AND job_id = $2 AND kind IN ('new_job', 'job_again')`, [who, job])).rows[0].n);
const sees = async (job, who) => (await setup(`SELECT public.pro_may_see_as($1, $2) AS b`, [job, who])).rows[0].b;
const JOB = { lat: 33.684, lng: 72.99 };
async function post(customer = AYESHA, price = 300000) {
  const r = await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'The AC is not cooling at all',
    p_offer_paisa => $1, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_lat => $2, p_lng => $3, p_media => '[]'::jsonb)`, [price, JOB.lat, JOB.lng]);
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
}
const ago = (job, minutes) => setup(`UPDATE public.jobs SET announced_at = now() - make_interval(mins => $2) WHERE id = $1`, [job, minutes]);

// =============================================================================
heading('Online needs where he is');

{
  const r = await call(BILAL, `SELECT public.pro_set_online(true)`);
  ok('no position: he cannot go online', r?.ok === false && r.field === 'location', JSON.stringify(r));
  ok('and the refusal says why', /location/i.test(r?.why ?? ''));
  ok('a customer cannot send a position', (await call(AYESHA, `SELECT public.pro_here(33.69, 72.99, 10)`))?.ok === false);
  ok('a position outside Pakistan is refused', (await call(BILAL, `SELECT public.pro_here(51.5, -0.1, 10)`))?.field === 'location');
  ok('he sends where he is', (await call(BILAL, `SELECT public.pro_here(33.693, 72.99, 12)`))?.ok === true);
  ok('then he goes online', (await call(BILAL, `SELECT public.pro_set_online(true)`))?.online === true);
  ok('going offline never needs a position', (await call(KAMRAN, `SELECT public.pro_set_online(false)`))?.ok === true);
  ok('only his latest position is kept', (await call(BILAL, `SELECT public.pro_here(33.6935, 72.99, 12)`))?.ok === true
    && Number((await setup(`SELECT count(*) AS n FROM public.pro_positions WHERE pro_id = $1`, [BILAL])).rows[0].n) === 1);
  await call(ASAD, `SELECT public.pro_here(33.86, 73.0, 15)`); // about 20 km north
  await call(ASAD, `SELECT public.pro_set_online(true)`);
  await call(DANISH, `SELECT public.pro_here(31.52, 74.35, 15)`); // Lahore
  await call(DANISH, `SELECT public.pro_set_online(true)`);
  // Kamran has no position and no home area: online the old way, through his sectors.
  await setup(`UPDATE public.pros SET online = true WHERE id = $1`, [KAMRAN]);
  denied('nobody reads positions directly', await as('authenticated', BILAL, `SELECT * FROM public.pro_positions`));
}

// =============================================================================
heading('A new job reaches those near it first');

const j1 = await post();
{
  ok('Bilal, 1 km away, sees it', await sees(j1, BILAL));
  ok('Asad, 20 km away, does not yet', !(await sees(j1, ASAD)));
  ok('Danish, in Lahore, does not', !(await sees(j1, DANISH)));
  ok('Kamran, with no position, sees it through his sector', await sees(j1, KAMRAN));
  ok('Bilal was told', (await told(BILAL, j1)) === 1);
  ok('Asad was not', (await told(ASAD, j1)) === 0);
  const feed = await call(ASAD, `SELECT public.pro_feed()`);
  ok('it is not in Asad’s list', !JSON.stringify(feed ?? []).includes(j1));
  ok('he cannot offer on it', (await call(ASAD, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j1]))?.ok === false);
}

// =============================================================================
heading('The reach grows evenly, and each technician is told once');

{
  const reach = async () => Number((await setup(`SELECT public.reach_at($1, now()) AS r`, [j1])).rows[0].r);
  ok('it starts at 5 km', (await reach()) >= 5000 && (await reach()) < 6000, String(await reach()));
  await ago(j1, 5);
  ok('after 5 of 8 minutes it is about 27 km', Math.abs((await reach()) - 26875) < 300, String(await reach()));
  ok('Asad sees it now', await sees(j1, ASAD));
  const n = Number((await setup(`SELECT public.widen_reach() AS n`)).rows[0].n);
  ok('the clock tells him', n >= 1 && (await told(ASAD, j1)) === 1, String(n));
  await setup(`SELECT public.widen_reach()`);
  ok('once', (await told(ASAD, j1)) === 1);
  ok('Bilal is not told again', (await told(BILAL, j1)) === 1);
  ok('Danish still does not see it', !(await sees(j1, DANISH)));
  await ago(j1, 9);
  ok('after 8 minutes it is all of Islamabad: everyone in the trade sees it', await sees(j1, DANISH));
  await setup(`SELECT public.widen_reach()`);
  ok('and is told', (await told(DANISH, j1)) === 1);
  await setup(`SELECT public.widen_reach()`);
  ok('once', (await told(DANISH, j1)) === 1);
  ok('an offline technician is not told', (await setup(`SELECT count(*)::int AS n FROM public.push_log WHERE job_id = $1 AND user_id = $2`, [j1, SARA])).rows[0].n === 0);
}

// =============================================================================
heading('His home area stands in for an old position');

{
  const j2 = await post(SARA);
  ok('Asad, 20 km away, does not see a new job', !(await sees(j2, ASAD)));
  await setup(`UPDATE public.pro_positions SET at = now() - interval '4 hours' WHERE pro_id = $1`, [ASAD]);
  ok('a customer has no home area', (await call(SARA, `SELECT public.set_home_area(33.69, 72.99)`))?.ok === false);
  ok('he sets his home area near the job', (await call(ASAD, `SELECT public.set_home_area(33.688, 72.995)`))?.ok === true);
  ok('his old position no longer counts: his home area does', await sees(j2, ASAD));
  await setup(`UPDATE public.pro_positions SET at = now() WHERE pro_id = $1`, [ASAD]);
  ok('a fresh position counts again', !(await sees(j2, ASAD)));
}

// =============================================================================
heading('What each side is shown');

const j3 = await post();
{
  const d = await call(BILAL, `SELECT public.pro_distances()`);
  ok('he is told how far the job is, in a straight line', d && Math.abs(d[j3] - 1000) < 150, JSON.stringify(d));
  ok('a customer gets no distances', JSON.stringify(await call(AYESHA, `SELECT public.pro_distances()`)) === '{}');
  ok('a technician who cannot see a job cannot mark it seen', (await call(DANISH, `SELECT public.pro_saw_job($1)`, [j3]))?.ok === false);
  ok('Bilal opens it', (await call(BILAL, `SELECT public.pro_saw_job($1)`, [j3]))?.ok === true);
  await call(BILAL, `SELECT public.pro_saw_job($1)`, [j3]);
  await call(KAMRAN, `SELECT public.pro_saw_job($1)`, [j3]);
  const s = await call(AYESHA, `SELECT public.job_search($1)`, [j3]);
  ok('she sees two have looked, counted once each', s?.seen === 2, JSON.stringify(s));
  ok('with their first letters only', JSON.stringify(s.letters) === JSON.stringify(['K', 'B']), JSON.stringify(s.letters));
  ok('never a name', !/Bilal|Kamran|Ahmed/.test(JSON.stringify(s)));
  ok('and the reach, as numbers', s.reach_m >= 5000 && s.full === false && s.full_m === 40000);
  ok('nobody else sees her search', (await call(SARA, `SELECT public.job_search($1)`, [j3])) == null);
  denied('nobody reads who looked directly', await as('authenticated', AYESHA, `SELECT * FROM public.job_views`));
}

// =============================================================================
heading('The automatic choice');

{
  const j4 = await post(AYESHA, 300000);
  ok('it is off by default', (await call(AYESHA, `SELECT public.job_search($1)`, [j4]))?.auto_choose === false);
  ok('nobody else can switch it on', (await call(SARA, `SELECT public.set_auto_choose($1, true)`, [j4]))?.ok === false);
  ok('she switches it on', (await call(AYESHA, `SELECT public.set_auto_choose($1, true)`, [j4]))?.auto_choose === true);
  const higher = await call(KAMRAN, `SELECT public.make_offer($1, 350000, 30, NULL)`, [j4]);
  ok('an offer above her price is made', higher?.ok === true, JSON.stringify(higher));
  ok('and is not chosen for her', (await setup(`SELECT status FROM public.jobs WHERE id = $1`, [j4])).rows[0].status === 'open');
  const at = await call(BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j4]);
  ok('an offer at her price is made', at?.ok === true, JSON.stringify(at));
  const job = (await setup(`SELECT status, pro_id, agreed_paisa FROM public.jobs WHERE id = $1`, [j4])).rows[0];
  ok('and is chosen for her, at once', job.status === 'assigned' && job.pro_id === BILAL && Number(job.agreed_paisa) === 300000, JSON.stringify(job));
  ok('the other offer is closed', (await setup(`SELECT status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [j4, KAMRAN])).rows[0].status !== 'pending');

  const j5 = await post(AYESHA, 300000);
  await call(KAMRAN, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j5]);
  ok('with it off, an offer at her price waits for her', (await setup(`SELECT status FROM public.jobs WHERE id = $1`, [j5])).rows[0].status === 'open');
  const r = await call(AYESHA, `SELECT public.set_auto_choose($1, true)`, [j5]);
  ok('switching it on takes the offer already waiting', r?.ok === true && (await setup(`SELECT pro_id FROM public.jobs WHERE id = $1`, [j5])).rows[0].pro_id === KAMRAN, JSON.stringify(r));
  ok('it cannot be switched on a job no longer open', (await call(AYESHA, `SELECT public.set_auto_choose($1, true)`, [j5]))?.ok === false);
}

// =============================================================================
heading('The office’s numbers, and forgetting');

{
  const OWNER = `${P}999999-9999-4999-8999-999999999999`;
  await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner8@example.com')`, [OWNER]);
  await setup(`SELECT public.make_owner('owner8@example.com', 'Zohaib')`);
  ok('the office can widen the first circle', (await call(OWNER, `SELECT public.admin_set_setting('search_start_m', 8000)`))?.ok === true);
  ok('but not past its range', (await call(OWNER, `SELECT public.admin_set_setting('search_start_m', 50000)`))?.ok === false);
  ok('nor make the search take hours', (await call(OWNER, `SELECT public.admin_set_setting('search_full_minutes', 600)`))?.ok === false);
  await setup(`UPDATE public.pro_positions SET at = now() - interval '7 hours' WHERE pro_id = $1`, [DANISH]);
  ok('old positions are forgotten', Number((await setup(`SELECT public.forget_positions() AS n`)).rows[0].n) === 1
    && (await setup(`SELECT count(*)::int AS n FROM public.pro_positions WHERE pro_id = $1`, [DANISH])).rows[0].n === 0);
  ok('a fresh one is kept', (await setup(`SELECT count(*)::int AS n FROM public.pro_positions WHERE pro_id = $1`, [BILAL])).rows[0].n === 1);
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261203000000_jobs_near_him.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', await sees(j3, BILAL));
  ok('and the office’s numbers were kept', (await setup(`SELECT value FROM public.settings WHERE key = 'search_start_m'`)).rows[0].value == 8000);
}

report();
