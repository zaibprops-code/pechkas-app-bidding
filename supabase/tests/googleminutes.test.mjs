/**
 * Minutes from Google Maps on offers, and his route while he comes (migration google_minutes).
 *
 * What must hold: an offer carries where his phone was and the straight
 * line to her pin; without the key nothing is asked and no minutes are
 * made up; with it, Google is asked once and its answer reaches the offer;
 * she sees minutes and distances for offers on her own job only, never his
 * position and never the key; choosing keeps his minutes on the job; while
 * he is on his way, and only then, she sees where he is, with fresh minutes
 * asked no more often than the setting; a failed answer changes nothing;
 * and the migration runs twice.
 */
import { as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e9';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
for (const [id, phone, role, name] of [[AYESHA, '923009111111', 'customer', 'Ayesha'], [SARA, '923009222222', 'customer', 'Sara'], [BILAL, '923009333333', 'pro', 'Bilal']]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
await setup(`UPDATE public.job_types SET risky = false WHERE trade = 'ac'`);
await setup(`UPDATE public.trades SET something_else_risky = false WHERE slug = 'ac'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
async function post() {
  const r = await call(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'The AC is not cooling at all',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_lat => 33.684, p_lng => 72.99, p_media => '[]'::jsonb)`);
  if (!r?.ok) throw new Error(JSON.stringify(r));
  return r.id;
}
const routeAsks = async () => (await setup(`SELECT id, url, headers, body FROM net.sent WHERE url LIKE '%routes.googleapis.com%' ORDER BY id`)).rows;
const answer = (id, secs, metres, status = 200) =>
  setup(`INSERT INTO net._http_response (id, status_code, content) VALUES ($1, $2, $3)`,
    [id, status, status === 200 ? JSON.stringify({ routes: [{ duration: `${secs}s`, distanceMeters: metres, polyline: { encodedPolyline: 'a~l~Fjk~uOwHJy@P' } }] }) : '{"error":{"code":403}}']);
const offerOf = async (job) => (await setup(`SELECT * FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [job, BILAL])).rows[0];

await call(BILAL, `SELECT public.pro_here(33.70, 72.99, 10)`); // about 1.8 km north of her pin

// =============================================================================
heading('Without the key: the straight line, and no made-up minutes');

const j1 = await post();
{
  const r = await call(BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j1]);
  ok('he makes an offer', r?.ok === true, JSON.stringify(r));
  const o = await offerOf(j1);
  ok('it carries where his phone was', Math.abs(o.from_lat - 33.70) < 1e-6);
  ok('and the straight line to her pin', Math.abs(o.distance_m - 1780) < 60, String(o.distance_m));
  ok('no minutes', o.eta_seconds === null);
  ok('and Google was not asked', (await routeAsks()).length === 0);
  const x = await call(AYESHA, `SELECT public.offer_extras($1)`, [j1]);
  ok('she sees the distance, and no minutes', x.length === 1 && x[0].eta_seconds === null && x[0].distance_m === o.distance_m, JSON.stringify(x));
  ok('never where he is', !/33\.7|from_lat/.test(JSON.stringify(x)));
}

// =============================================================================
heading('With the key: Google is asked, and its answer reaches the offer');

await setup(`INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('google_routes_key', 'test-key-not-real')`);
const j2 = await post();
{
  await call(BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j2]);
  const asks = await routeAsks();
  ok('Google is asked once', asks.length === 1, JSON.stringify(asks.map((a) => a.url)));
  ok('with the key in the header, never in the address', asks[0].headers['X-Goog-Api-Key'] === 'test-key-not-real' && !asks[0].url.includes('test-key'));
  ok('for driving, with traffic', asks[0].body.travelMode === 'DRIVE' && asks[0].body.routingPreference === 'TRAFFIC_AWARE');
  ok('from where he is to her pin', asks[0].body.origin.location.latLng.latitude === 33.7 && asks[0].body.destination.location.latLng.latitude === 33.684);
  await answer(asks[0].id, 540, 2100);
  const x = await call(AYESHA, `SELECT public.offer_extras($1)`, [j2]);
  ok('she sees 9 minutes and 2.1 km of road', x[0].eta_seconds === 540 && x[0].route_m === 2100, JSON.stringify(x));
  ok('and his finished jobs', x[0].jobs_done === 0);
  ok('never the key', !JSON.stringify(x).includes('test-key'));
  ok('the answer is used once', (await setup(`SELECT count(*)::int AS n FROM public.route_requests`)).rows[0].n === 0);
  ok('another customer sees nothing of her offers', JSON.stringify(await call(SARA, `SELECT public.offer_extras($1)`, [j2])) === '[]');
  await call(BILAL, `SELECT public.make_offer($1, 310000, 30, NULL)`, [j2]);
  ok('changing his price without moving does not ask again', (await routeAsks()).length === 1);
  ok('and keeps the minutes', (await offerOf(j2)).eta_seconds === 540);
  denied('nobody reads the asks directly', await as('authenticated', AYESHA, `SELECT * FROM public.route_requests`));
}

// =============================================================================
heading('A failed answer changes nothing');

const j3 = await post();
{
  await call(BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j3]);
  const asks = await routeAsks();
  await answer(asks[asks.length - 1].id, 0, 0, 403);
  const x = await call(AYESHA, `SELECT public.offer_extras($1)`, [j3]);
  ok('no minutes are shown', x[0].eta_seconds === null && x[0].distance_m > 0, JSON.stringify(x));
  ok('and the ask is cleared', (await setup(`SELECT count(*)::int AS n FROM public.route_requests`)).rows[0].n === 0);
}

// =============================================================================
heading('She chooses: his minutes are kept on the job');

{
  const id = (await offerOf(j2)).id;
  const r = await call(AYESHA, `SELECT public.choose_offer($1)`, [id]);
  ok('she chooses Bilal', r?.ok === true, JSON.stringify(r));
  const j = (await setup(`SELECT chosen_eta_seconds, chosen_distance_m FROM public.jobs WHERE id = $1`, [j2])).rows[0];
  ok('9 minutes and 2.1 km are kept', j.chosen_eta_seconds === 540 && j.chosen_distance_m === 2100, JSON.stringify(j));
}

// =============================================================================
heading('While he is on his way, and only then');

{
  const live = () => call(AYESHA, `SELECT public.job_live($1)`, [j2]);
  ok('before he sets off she sees nothing of where he is', (await live())?.live === false);
  await setup(`UPDATE public.jobs SET stage = 'on_way' WHERE id = $1`, [j2]);
  await call(BILAL, `SELECT public.pro_here(33.692, 72.99, 8)`);
  const before = (await routeAsks()).length;
  const a = await live();
  ok('on his way: where he is', a?.live === true && Math.abs(a.lat - 33.692) < 1e-6, JSON.stringify(a));
  ok('and the straight line', a.distance_m > 800 && a.distance_m < 950, String(a.distance_m));
  ok('Google is asked for fresh minutes', (await routeAsks()).length === before + 1);
  const asks = await routeAsks();
  await answer(asks[asks.length - 1].id, 240, 1000);
  const b = await live();
  ok('she sees 4 minutes and the road', b.eta_seconds === 240 && b.route_m === 1000 && Boolean(b.polyline), JSON.stringify(b));
  ok('and the minutes he had when she chose him', b.chosen_eta_seconds === 540);
  await live();
  ok('not asked again within two minutes', (await routeAsks()).length === before + 1);
  await setup(`UPDATE public.jobs SET live_asked_at = now() - interval '3 minutes' WHERE id = $1`, [j2]);
  await live();
  ok('asked again after two minutes', (await routeAsks()).length === before + 2);
  ok('another customer sees nothing', (await call(SARA, `SELECT public.job_live($1)`, [j2]))?.live === false);
  await setup(`UPDATE public.pro_positions SET at = now() - interval '4 minutes' WHERE pro_id = $1`, [BILAL]);
  ok('an old position is not shown', (await live())?.live === false);
  await setup(`UPDATE public.pro_positions SET at = now() WHERE pro_id = $1`, [BILAL]);
  await setup(`UPDATE public.jobs SET stage = 'arrived' WHERE id = $1`, [j2]);
  ok('once he has arrived she sees nothing of where he is', (await live())?.live === false);
}

// =============================================================================
heading('The office’s number, and running twice');

{
  const OWNER = `${P}999999-9999-4999-8999-999999999999`;
  await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner9@example.com')`, [OWNER]);
  await setup(`SELECT public.make_owner('owner9@example.com', 'Zohaib')`);
  ok('the office can ask Google less often', (await call(OWNER, `SELECT public.admin_set_setting('route_every_seconds', 300)`))?.ok === true);
  ok('but not more than once a minute', (await call(OWNER, `SELECT public.admin_set_setting('route_every_seconds', 10)`))?.ok === false);
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261204000000_google_minutes.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await offerOf(j1)).distance_m > 0);
}

report();
