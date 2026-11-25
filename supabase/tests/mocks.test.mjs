/**
 * The screens as the approved mocks (migration as_the_mocks).
 *
 * What must hold: her waiting screen gets the technicians near her as points
 * rounded to about 100 m — only online, approved ones who may see her job,
 * with a recent position — never a name or an id, and only for her own open
 * job; it gets the usual price and the raises left. His list gets the
 * straight line to every job he may see, and Google's minutes once Google
 * has answered; Google is asked only when the minutes are old or he has
 * moved, five at most each time, and never without the key; and the
 * migration runs twice.
 */
import { as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'eb';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const KAMRAN = `${P}555555-5555-4555-8555-555555555555`;
for (const [id, phone, role, name] of [
  [AYESHA, '923009511111', 'customer', 'Ayesha'], [SARA, '923009522222', 'customer', 'Sara'],
  [BILAL, '923009533333', 'pro', 'Bilal'], [ASAD, '923009544444', 'pro', 'Asad'], [KAMRAN, '923009555555', 'pro', 'Kamran'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, name, online] of [[BILAL, 'Bilal Ahmed', true], [ASAD, 'Asad Khan', true], [KAMRAN, 'Kamran Ali', false]]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', $3)`, [id, name, online]);
}
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.job_types SET risky = false WHERE trade = 'ac'`);
await setup(`UPDATE public.trades SET something_else_risky = false WHERE slug = 'ac'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
const day = (await setup(`SELECT CASE WHEN extract(hour FROM now() AT TIME ZONE 'Asia/Karachi') < public.last_post_hour()
  THEN (now() AT TIME ZONE 'Asia/Karachi')::date ELSE (now() AT TIME ZONE 'Asia/Karachi')::date + 1 END::text AS d`)).rows[0].d;
const service = (await setup(`SELECT id, list_paisa FROM public.job_types WHERE trade = 'ac' AND list_paisa IS NOT NULL ORDER BY id LIMIT 1`)).rows[0];
async function post(who = AYESHA) {
  const r = await call(who, `SELECT public.post_job(p_trade => 'ac', p_job_type => $1, p_description => 'The AC is not cooling at all',
    p_offer_paisa => $2, p_when_kind => 'today', p_when_part => NULL, p_when_date => $3::date, p_when_from => NULL,
    p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12', p_lat => 33.684, p_lng => 72.99, p_media => '[]'::jsonb)`,
    [service.id, service.list_paisa, day]);
  if (!r?.ok) throw new Error(JSON.stringify(r));
  return r.id;
}
const routeAsks = async () => (await setup(`SELECT id, body FROM net.sent WHERE url LIKE '%routes.googleapis.com%' ORDER BY id`)).rows;
const answer = (id, secs, m) => setup(`INSERT INTO net._http_response (id, status_code, content) VALUES ($1, 200, $2)`,
  [id, JSON.stringify({ routes: [{ duration: `${secs}s`, distanceMeters: m, polyline: { encodedPolyline: 'a~l~F' } }] })]);

await call(BILAL, `SELECT public.pro_here(33.6912345, 72.9912345, 10)`);
await call(ASAD, `SELECT public.pro_here(33.69, 72.98, 10)`);
await setup(`INSERT INTO public.pro_positions (pro_id, lat, lng, accuracy) VALUES ($1, 33.685, 72.99, 10)`, [KAMRAN]);

// =============================================================================
heading('Her waiting screen: the technicians near her');

const job = await post();
{
  const s = await call(AYESHA, `SELECT public.job_search($1)`, [job]);
  ok('two technicians near her are online', s.near_count === 2 && s.near.length === 2, JSON.stringify(s.near));
  ok('their first letters', JSON.stringify([...s.near_letters].sort()) === '["A","B"]', JSON.stringify(s.near_letters));
  const b = s.near.find((n) => Math.abs(n.lat - 33.691) < 0.0006);
  ok('a point is rounded to about 100 m, never exact', b && b.lat === 33.691 && b.lng === 72.991, JSON.stringify(b));
  ok('no name, id or phone goes with the points', !/Bilal|Asad|ahmed|khan|9230|eb3333|eb4444/i.test(JSON.stringify(s.near)));
  ok('an offline technician is not on her map', s.near_count === 2);
  ok('the usual price and the raises left', s.usual_paisa === Number(service.list_paisa) && s.raises_left === 3, JSON.stringify([s.usual_paisa, s.raises_left]));
  ok('another customer gets nothing', (await call(SARA, `SELECT public.job_search($1)`, [job])) === null);
  await setup(`UPDATE public.pro_positions SET at = now() - interval '11 minutes' WHERE pro_id = $1`, [ASAD]);
  ok('a position older than 10 minutes is not shown', (await call(AYESHA, `SELECT public.job_search($1)`, [job])).near_count === 1);
  await setup(`UPDATE public.pro_positions SET at = now() WHERE pro_id = $1`, [ASAD]);
}

// =============================================================================
heading('His list: the straight line, then Google\'s minutes');

{
  const a = await call(BILAL, `SELECT public.pro_nearby()`);
  const mine = a.jobs[job];
  ok('without the key: the straight line to the job', mine && mine.distance_m > 700 && mine.distance_m < 1000, JSON.stringify(mine));
  ok('and no minutes', mine.eta_seconds === null);
  ok('Google is not asked', (await routeAsks()).length === 0);
  ok('his search starts at 5 km', a.start_m === 5000);

  await setup(`INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('google_routes_key', 'test-key-not-real')`);
  await call(BILAL, `SELECT public.pro_nearby()`);
  const asks = await routeAsks();
  ok('with the key, Google is asked for the job', asks.length === 1, String(asks.length));
  ok('from where he is to her pin', asks[0].body.destination.location.latLng.latitude === 33.684);
  await answer(asks[0].id, 420, 1300);
  const b = (await call(BILAL, `SELECT public.pro_nearby()`)).jobs[job];
  ok('the minutes reach his list', b.eta_seconds === 420 && b.route_m === 1300, JSON.stringify(b));
  ok('not asked again while fresh', (await routeAsks()).length === 1);
  await call(BILAL, `SELECT public.pro_here(33.70, 72.99, 10)`);
  await call(BILAL, `SELECT public.pro_nearby()`);
  ok('asked again once he has moved 300 m', (await routeAsks()).length === 2);
  await setup(`UPDATE public.feed_routes SET asked_at = now() - interval '11 minutes' WHERE pro_id = $1`, [BILAL]);
  await call(BILAL, `SELECT public.pro_nearby()`);
  ok('and once the minutes are 10 minutes old', (await routeAsks()).length === 3);
  for (let i = 0; i < 7; i += 1) await post(SARA);
  const before = (await routeAsks()).length;
  await call(BILAL, `SELECT public.pro_nearby()`);
  ok('five asks at most each time', (await routeAsks()).length - before === 5, String((await routeAsks()).length - before));
  const c = await call(SARA, `SELECT public.pro_nearby()`);
  ok('a customer has no list', JSON.stringify(c.jobs) === '{}');
  denied('nobody reads the minutes directly', await as('authenticated', BILAL, `SELECT * FROM public.feed_routes`));
}

// =============================================================================
heading('The office, and running twice');

{
  const OWNER = `${P}999999-9999-4999-8999-999999999999`;
  await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner11@example.com')`, [OWNER]);
  await setup(`SELECT public.make_owner('owner11@example.com', 'Zohaib')`);
  ok('the office can ask less often', (await call(OWNER, `SELECT public.admin_set_setting('feed_route_minutes', 20)`))?.ok === true);
  ok('but not more often than every 5 minutes', (await call(OWNER, `SELECT public.admin_set_setting('feed_route_minutes', 1)`))?.ok === false);
  await setup(`UPDATE public.jobs SET status = 'cancelled' WHERE customer_id = $1`, [SARA]);
  ok('minutes for jobs that closed are forgotten', (await setup(`SELECT public.forget_feed_routes() AS n`)).rows[0].n >= 5);
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261206000000_as_the_mocks.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await call(AYESHA, `SELECT public.job_search($1)`, [job])).near_count === 2);
}

report();
