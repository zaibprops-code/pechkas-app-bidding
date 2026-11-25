/**
 * Late is measured from Google's minutes, and jobs run 7am to 10pm (migration late_from_minutes, A116).
 *
 * What must hold: an offer on an as-soon-as-possible job names no time; when
 * she chooses him the job is due at that moment plus Google's minutes, or the
 * office's fallback when Google gave none, never before the day opens; a
 * Google answer in the first five minutes replaces the fallback; he is late
 * 15 minutes after he was due, a possible no-show the office's minutes after
 * it, and every rule that read the two-hour window reads that instead — her
 * cancelling, "find another", the no-show clock, a late arrival, "I'm running
 * late" and "nobody home"; a job with a window keeps the old rules; a job that
 * goes back to everyone loses the time of the man who left; today's jobs stop
 * an hour before the day closes; and the migration runs twice.
 */
import { as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'ea';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
for (const [id, phone, role, name] of [[AYESHA, '923009411111', 'customer', 'Ayesha'], [BILAL, '923009433333', 'pro', 'Bilal'], [ASAD, '923009444444', 'pro', 'Asad']]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, name] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Khan']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, name]);
}
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
await setup(`UPDATE public.job_types SET risky = false WHERE trade = 'ac'`);
await setup(`UPDATE public.trades SET something_else_risky = false WHERE slug = 'ac'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
const pkHour = async () => Number((await setup(`SELECT extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0].h);
/** Today while a job can still be for today, else tomorrow: what the app sends. */
const asapDay = async () => (await setup(`SELECT CASE WHEN extract(hour FROM now() AT TIME ZONE 'Asia/Karachi') < public.last_post_hour()
  THEN (now() AT TIME ZONE 'Asia/Karachi')::date ELSE (now() AT TIME ZONE 'Asia/Karachi')::date + 1 END::text AS d`)).rows[0].d;

let n = 0;
async function post(day) {
  n += 1;
  const d = day ?? (await asapDay());
  return call(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'today', p_when_part => NULL, p_when_date => $2::date, p_when_from => NULL,
    p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12', p_lat => 33.684, p_lng => 72.99, p_media => '[]'::jsonb)`,
    [`AC number ${n} is not cooling`, d]);
}
const offerOf = async (job, pro = BILAL) => (await setup(`SELECT * FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [job, pro])).rows[0];
const jobRow = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const mine = async (id) => (await call(AYESHA, `SELECT public.my_jobs()`)).find((j) => j.id === id);
const his = async (id, pro = BILAL) => (await call(pro, `SELECT public.pro_my_jobs()`)).find((j) => j.id === id);
const minutes = (a, b) => Math.round((new Date(a) - new Date(b)) / 60000);
const routeAsks = async () => (await setup(`SELECT id FROM net.sent WHERE url LIKE '%routes.googleapis.com%' ORDER BY id`)).rows;
const answer = (id, secs) => setup(`INSERT INTO net._http_response (id, status_code, content) VALUES ($1, 200, $2)`,
  [id, JSON.stringify({ routes: [{ duration: `${secs}s`, distanceMeters: 3000, polyline: { encodedPolyline: 'a~l~F' } }] })]);
/** Moves his due time so that it was `ago` minutes ago. */
const dueAgo = (id, ago) => setup(`UPDATE public.jobs SET due_at = now() - make_interval(mins => $2) WHERE id = $1`, [id, ago]);

async function chosenJob({ pro = BILAL, others = [] } = {}) {
  const p = await post();
  if (!p?.ok) throw new Error(JSON.stringify(p));
  for (const who of [pro, ...others]) {
    const r = await call(who, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, NULL)`, [p.id]);
    if (!r?.ok) throw new Error(JSON.stringify(r));
  }
  const c = await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(p.id, pro)).id]);
  if (!c?.ok) throw new Error(JSON.stringify(c));
  return p.id;
}

await call(BILAL, `SELECT public.pro_here(33.70, 72.99, 10)`);
await call(ASAD, `SELECT public.pro_here(33.69, 72.98, 10)`);

// =============================================================================
heading('An offer names no time; she chooses; he is due');

{
  const p = await post();
  ok('she posts as soon as possible', p?.ok === true, JSON.stringify(p));
  const r = await call(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, NULL)`, [p.id]);
  ok('he offers without naming any time', r?.ok === true, JSON.stringify(r));
  const bad = await call(ASAD, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, 9::smallint)`, [p.id]);
  ok('an older copy naming a time that is not a window is still refused', bad?.ok === false && bad.field === 'arrive', JSON.stringify(bad));
  ok('minutes typed by hand are refused', (await call(ASAD, `SELECT public.make_offer($1, 300000, NULL, 20, NULL, NULL)`, [p.id]))?.ok === false);
  await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(p.id)).id]);
  const j = await jobRow(p.id);
  const open = (await setup(`SELECT public.day_open_at($1::date) AS t`, [j.when_date])).rows[0].t;
  const from = new Date(Math.max(new Date(j.assigned_at), new Date(open)));
  ok('without Google\'s minutes he is due 60 minutes after she chose him (the office\'s fallback)', minutes(j.due_at, from) === 60, `${j.due_at} ${from}`);
  ok('the job keeps no window', j.when_from === null);
  const m = await mine(p.id);
  ok('her screen gets the due time', m.due_at && minutes(m.due_at, j.due_at) === 0, JSON.stringify(m.due_at));
  ok('and that it is not Google\'s', m.due_by_google === false);
  ok('late from 15 minutes after it', minutes(m.late_from, m.due_at) === 15);
  const h = await his(p.id);
  ok('his screen gets the same two times', minutes(h.due_at, j.due_at) === 0 && minutes(h.late_from, j.due_at) === 15, JSON.stringify(h));
  ok('he is not late yet', h.late === false && m.pro_late === false);
  ok('cancelling now is normal: he has not set off', m.cancel_kind_now === 'normal', m.cancel_kind_now);
}

// =============================================================================
heading('With Google: due at her choice plus Google\'s minutes');

await setup(`INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('google_routes_key', 'test-key-not-real')`);
{
  const p = await post();
  await call(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, NULL)`, [p.id]);
  const asks = await routeAsks();
  await answer(asks[asks.length - 1].id, 1200);
  await call(AYESHA, `SELECT public.offer_extras($1)`, [p.id]);
  await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(p.id)).id]);
  const j = await jobRow(p.id);
  const open = (await setup(`SELECT public.day_open_at($1::date) AS t`, [j.when_date])).rows[0].t;
  const from = new Date(Math.max(new Date(j.assigned_at), new Date(open)));
  ok('20 minutes from Google: due 20 minutes after she chose him', minutes(j.due_at, from) === 20 && j.chosen_eta_seconds === 1200, `${j.due_at} ${from}`);
  ok('and her screen says the time is Google\'s', (await mine(p.id)).due_by_google === true);
}
{
  const p = await post();
  await call(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, NULL)`, [p.id]);
  const asks = await routeAsks();
  await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(p.id)).id]);
  const before = await jobRow(p.id);
  ok('chosen before Google answered: the fallback', before.chosen_eta_seconds === null);
  await answer(asks[asks.length - 1].id, 900);
  await setup(`SELECT public.collect_routes()`);
  const after = await jobRow(p.id);
  ok('Google\'s answer a minute later takes its place', after.chosen_eta_seconds === 900 && minutes(after.due_at, before.due_at) === -45, `${before.due_at} → ${after.due_at}`);
}
await setup(`DELETE FROM vault.decrypted_secrets WHERE name = 'google_routes_key'`);

// =============================================================================
heading('Late at 15 minutes, a possible no-show at the office\'s minutes');

{
  const id = await chosenJob();
  await dueAgo(id, -20);
  await call(BILAL, `SELECT public.tech_step($1, 'chosen')`, [id]);
  ok('on his way, her cancelling would be late', (await mine(id)).cancel_kind_now === 'late', (await mine(id)).cancel_kind_now);
  await dueAgo(id, -240);
  ok('but an On my way tapped hours before he is due does not count', (await mine(id)).cancel_kind_now === 'normal');
  await dueAgo(id, 10);
  ok('10 minutes past his time: not late yet', (await his(id)).late === false && (await mine(id)).pro_late === false);
  await dueAgo(id, 16);
  ok('16 minutes past: he is late, on both screens', (await his(id)).late === true && (await mine(id)).pro_late === true);
  ok('and her cancelling would be his lateness', (await mine(id)).cancel_kind_now === 'pro_late');
  ok('the no-show clock does nothing yet', (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n === 0);
  await dueAgo(id, 61);
  ok('61 minutes past: a possible no-show if she cancelled', (await mine(id)).cancel_kind_now === 'no_show');
  ok('the clock finds it', (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n === 1);
  const i = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [id])).rows[0];
  ok('a potential no-show, counted from his due time', i?.kind === 'no_show' && i.status === 'potential' && i.minutes_late === 61, JSON.stringify(i));
  ok('she is told', (await setup(`SELECT count(*)::int AS n FROM public.push_log WHERE user_id = $1 AND kind = 'no_show_customer' AND job_id = $2`, [AYESHA, id])).rows[0].n === 1);
}
{
  const id = await chosenJob();
  await setup(`UPDATE public.settings SET value = 90 WHERE key = 'no_show_minutes'`);
  await dueAgo(id, 61);
  ok('the office\'s 90 minutes: not a no-show at 61', (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n === 0);
  await setup(`UPDATE public.settings SET value = 60 WHERE key = 'no_show_minutes'`);
  await setup(`UPDATE public.pro_incidents SET status = 'dismissed' WHERE status = 'potential'`);
}

// =============================================================================
heading('Arriving late is measured from his due time');

{
  const id = await chosenJob();
  await dueAgo(id, 10);
  await setup(`UPDATE public.jobs SET stage = 'arrived', arrived_at = now(), arrival_review_status = 'verified', arrival_verified_at = now() WHERE id = $1`, [id]);
  ok('10 minutes after his time is on time', (await setup(`SELECT count(*)::int AS n FROM public.pro_incidents WHERE job_id = $1`, [id])).rows[0].n === 0);
}
{
  const id = await chosenJob();
  await dueAgo(id, 25);
  await setup(`UPDATE public.jobs SET stage = 'arrived', arrived_at = now(), arrival_review_status = 'verified', arrival_verified_at = now() WHERE id = $1`, [id]);
  const i = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [id])).rows[0];
  ok('25 minutes after it is a late arrival of 25 minutes', i?.kind === 'late_arrival' && i.minutes_late === 25, JSON.stringify(i));
  ok('he is told in the new words', (await setup(`SELECT body FROM public.push_log WHERE user_id = $1 AND kind = 'late_arrival_pro' AND job_id = $2`, [BILAL, id])).rows[0]?.body?.includes('after you were due'));
  ok('her cancelling at the door would be his lateness', (await mine(id)).cancel_kind_now === 'pro_late');
  const r = await call(BILAL, `SELECT public.pro_cannot_get_in($1, 'guard')`, [id]);
  ok('"nobody home" needs no window to have started', r?.ok === true, JSON.stringify(r));
  const nh = (await setup(`SELECT * FROM public.not_home_reports WHERE job_id = $1`, [id])).rows[0];
  ok('and records that he came late', nh?.pro_was_late === true && nh.minutes_late === 25, JSON.stringify(nh));
}

// =============================================================================
heading('"I\'m running late", her cancelling, and "find another"');

{
  const id = await chosenJob({ others: [ASAD] });
  const due = (await jobRow(id)).due_at;
  const tooLate = await call(BILAL, `SELECT public.pro_running_late($1, $2::timestamptz + interval '3 hours')`, [id, due]);
  ok('he cannot name a time more than 2 hours after he was due', tooLate?.ok === false && tooLate.field === 'eta' && !/office/i.test(tooLate.why), JSON.stringify(tooLate));
  ok('he can name one within them', (await call(BILAL, `SELECT public.pro_running_late($1, $2::timestamptz + interval '30 minutes')`, [id, due]))?.ok === true);
  await dueAgo(id, 20);
  const r = await call(AYESHA, `SELECT public.customer_find_another($1)`, [id]);
  ok('20 minutes past his time she finds another: his lateness', r?.ok === true && r.kind === 'pro_late', JSON.stringify(r));
  const i = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1 AND pro_id = $2`, [id, BILAL])).rows[0];
  ok('on his record, 20 minutes', i?.kind === 'late_arrival' && i.minutes_late === 20, JSON.stringify(i));
  const back = await jobRow(id);
  ok('the job goes back without his time', back.status === 'open' && back.due_at === null && back.chosen_eta_seconds === null, JSON.stringify(back.due_at));
  await call(ASAD, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, NULL)`, [id]);
  await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(id, ASAD)).id]);
  const again = await jobRow(id);
  ok('the next man is given his own time', again.pro_id === ASAD && again.due_at && minutes(again.due_at, new Date()) > 50, String(again.due_at));
}
{
  const id = await chosenJob();
  await dueAgo(id, 30);
  ok('she cancels 30 minutes past his time', (await call(AYESHA, `SELECT public.cancel_job($1, 'pro_late', NULL)`, [id]))?.ok === true);
  const c = (await setup(`SELECT * FROM public.cancellations WHERE job_id = $1`, [id])).rows[0];
  ok('recorded as his lateness, never against her', c?.category === 'pro_late', JSON.stringify(c));
  ok('with his due time on the record', c.window_start !== null);
}

// =============================================================================
heading('A job with a window keeps the old rules');

{
  const p = await post();
  const day = (await jobRow(p.id)).when_date;
  const hour = await pkHour();
  const from = [8, 10, 12, 14, 16, 18, 20].find((w) => w > hour);
  if (from && (await asapDay()) === (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d`)).rows[0].d) {
    const r = await call(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL, NULL, $2::smallint)`, [p.id, from]);
    ok('an older copy may still name two hours', r?.ok === true, JSON.stringify(r));
    await call(AYESHA, `SELECT public.choose_offer($1)`, [(await offerOf(p.id)).id]);
    const j = await jobRow(p.id);
    ok('the window is his time, and no due time is set', j.when_from === from && j.due_at === null, JSON.stringify([j.when_from, j.due_at]));
    const w = (await setup(`SELECT public.window_start($1::date, $2::smallint) AS t`, [day, from])).rows[0].t;
    ok('late from 30 minutes into it, as before', minutes((await mine(p.id)).late_from, w) === 30);
  } else {
    ok('(no window left today to test an older copy with)', true);
  }
}

// =============================================================================
heading('Jobs run 7am to 10pm');

{
  ok('new jobs are for today until 9pm', (await setup(`SELECT public.last_post_hour() AS h`)).rows[0].h === 21);
  ok('a job nobody took closes at 10pm', (await setup(`SELECT public.day_closes_hour() AS h`)).rows[0].h === 22);
  const hour = await pkHour();
  if (hour >= 1) {
    await setup(`UPDATE public.settings SET value = $1 WHERE key = 'day_closes_hour'`, [hour]);
    const today = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d`)).rows[0].d;
    const r = await post(today);
    ok('an hour before the day closes, a job cannot be for today', r?.ok === false && r.field === 'when', JSON.stringify(r));
    await setup(`UPDATE public.settings SET value = 22 WHERE key = 'day_closes_hour'`);
  }
  if (hour < 22) {
    await setup(`UPDATE public.settings SET value = $1 WHERE key = 'day_opens_hour'`, [hour + 1]);
    const id = await chosenJob();
    const j = await jobRow(id);
    const open = (await setup(`SELECT public.day_open_at($1::date) AS t`, [j.when_date])).rows[0].t;
    ok('chosen before the day opens, he is due from the opening', minutes(j.due_at, open) === 60, `${j.due_at} ${open}`);
    await setup(`UPDATE public.settings SET value = 7 WHERE key = 'day_opens_hour'`);
  }
  const p = await post();
  await setup(`UPDATE public.jobs SET when_date = when_date - 1 WHERE id = $1`, [p.id]);
  await setup(`SELECT public.close_unclaimed()`);
  ok('a job nobody took on an earlier day is closed', (await jobRow(p.id)).status === 'cancelled');
}

// =============================================================================
heading('The office\'s numbers, and running twice');

{
  const OWNER = `${P}999999-9999-4999-8999-999999999999`;
  await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner10@example.com')`, [OWNER]);
  await setup(`SELECT public.make_owner('owner10@example.com', 'Zohaib')`);
  ok('the office can change when a no-show is flagged', (await call(OWNER, `SELECT public.admin_set_setting('no_show_minutes', 90)`))?.ok === true);
  ok('but not below 30 minutes', (await call(OWNER, `SELECT public.admin_set_setting('no_show_minutes', 10)`))?.ok === false);
  ok('and the fallback', (await call(OWNER, `SELECT public.admin_set_setting('due_fallback_minutes', 45)`))?.ok === true);
  ok('the 15 minutes is locked: the terms say it', (await call(OWNER, `SELECT public.admin_set_setting('late_grace_minutes', 30)`))?.ok === false);
  ok('the day\'s hours are locked', (await call(OWNER, `SELECT public.admin_set_setting('day_closes_hour', 23)`))?.ok === false);
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261205000000_late_from_minutes.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await setup(`SELECT value FROM public.settings WHERE key = 'no_show_minutes'`)).rows[0].value == 90);
}

report();
