/**
 * A faster Post a job (migration fast_posting).
 *
 * What must hold: a job's lowest price is the office's share of its usual
 * price, rounded up to Rs 50 and never below min_offer_paisa; the office can
 * change the share only within its range; a job with no usual price keeps the
 * old floor; every part of Islamabad takes jobs (Bahria Town and DHA too), a
 * place in Rawalpindi does not, and says so; app_lists() hands the phone the
 * same floors; and the migration runs twice.
 */
import { as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e7';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923007711111')`, [AYESHA]);
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Ayesha')`, [AYESHA]);
await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@example.com')`, [OWNER]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
// Risky work (D37) is its own test; here a geyser service is plain work.
await setup(`UPDATE public.job_types SET risky = false WHERE trade = 'plumber'`);
await setup(`UPDATE public.trades SET something_else_risky = false WHERE slug = 'plumber'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
const geyser = (await setup(`SELECT id, list_paisa FROM public.job_types WHERE trade = 'plumber' AND name = 'Geyser service and descaling'`)).rows[0];
const post = (type, price, sector = 'F-11', trade = 'plumber') => call(AYESHA, `SELECT public.post_job(p_trade => $1, p_job_type => $2, p_description => 'The geyser is not heating',
    p_offer_paisa => $3, p_when_kind => 'now', p_when_part => NULL, p_sector => $4, p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`, [trade, type, price, sector]);

// =============================================================================
heading('The lowest price is a share of the usual price');

{
  ok('the geyser service has a usual price of Rs 2,000', Number(geyser.list_paisa) === 200000, JSON.stringify(geyser));
  const floor = Number((await setup(`SELECT public.price_floor($1) AS f`, [geyser.id])).rows[0].f);
  ok('its floor is 60%: Rs 1,200', floor === 120000, String(floor));
  const low = await post(geyser.id, 115000);
  ok('Rs 1,150 is refused', low?.ok === false && low.field === 'offer', JSON.stringify(low));
  ok('and the refusal names the lowest', /Rs 1,200/.test(low?.why ?? ''), low?.why);
  ok('Rs 1,200 posts', (await post(geyser.id, 120000))?.ok === true);
  const other = await post(null, 100000);
  ok('“Something else” keeps the old floor of Rs 1,000', other?.ok === true, JSON.stringify(other));
  ok('and nothing below it', (await post(null, 90000))?.field === 'offer');
  const small = (await setup(`SELECT id, list_paisa FROM public.job_types WHERE list_paisa IS NOT NULL ORDER BY list_paisa LIMIT 1`)).rows[0];
  const f = Number((await setup(`SELECT public.price_floor($1) AS f`, [small.id])).rows[0].f);
  ok('a cheap job never goes below min_offer_paisa', f >= 100000, `${small.list_paisa} → ${f}`);
  ok('every floor is a whole Rs 50', (await setup(`SELECT bool_and(public.price_floor(id) % 5000 = 0) AS b FROM public.job_types`)).rows[0].b === true);
}

// =============================================================================
heading('The office changes the share, within its range');

{
  const set = (v) => call(OWNER, `SELECT public.admin_set_setting('min_price_bps', $1)`, [v]);
  ok('a customer cannot change it', (await call(AYESHA, `SELECT public.admin_set_setting('min_price_bps', 1000)`))?.ok !== true);
  ok('below 30% is refused', (await set(2000))?.ok === false);
  ok('above 100% is refused', (await set(12000))?.ok === false);
  ok('80% is accepted', (await set(8000))?.ok === true);
  ok('and the floor follows: Rs 1,600', Number((await setup(`SELECT public.price_floor($1) AS f`, [geyser.id])).rows[0].f) === 160000);
  ok('Rs 1,500 is now refused', (await post(geyser.id, 150000))?.field === 'offer');
  ok('the change is on record', (await setup(`SELECT count(*)::int AS n FROM public.setting_changes WHERE key = 'min_price_bps'`)).rows[0].n === 1);
  await set(6000);
}

// =============================================================================
heading('Anywhere in Islamabad, nowhere else yet');

{
  await setup(`UPDATE public.sectors SET live = false WHERE name IN ('G-13', 'Bahria Town', 'DHA')`);
  ok('a sector with nobody "live" in it still takes a job', (await post(geyser.id, 200000, 'G-13'))?.ok === true);
  ok('Bahria Town counts as Islamabad', (await post(geyser.id, 200000, 'Bahria Town'))?.ok === true);
  ok('so does DHA', (await post(geyser.id, 200000, 'DHA'))?.ok === true);
  const pindi = await post(geyser.id, 200000, 'Satellite Town');
  ok('Satellite Town, Rawalpindi is refused', pindi?.ok === false && pindi.field === 'sector', JSON.stringify(pindi));
  ok('and the refusal says Islamabad only', /Islamabad only/.test(pindi?.why ?? ''), pindi?.why);
  ok('a made-up place is refused', (await post(geyser.id, 200000, 'Narnia'))?.field === 'sector');
  const asked = await call(AYESHA, `SELECT public.ask_for_sector('plumber', 'Rawalpindi')`);
  ok('she can ask to be told when Pechkas comes to Rawalpindi', asked?.ok === true, JSON.stringify(asked));
}

// =============================================================================
heading('What the phone is told');

{
  const lists = (await as('anon', null, `SELECT public.app_lists() AS l`)).rows[0].l;
  const g = lists.job_types.find((t) => t.id === geyser.id);
  ok('every job type carries its floor', Number(g?.floor_paisa) === 120000, JSON.stringify(g));
  ok('the share is there', Number(lists.min_price_bps) === 6000);
  ok('Islamabad’s places are listed, Bahria Town and DHA among them', ['F-11', 'G-13', 'Bahria Town', 'DHA'].every((x) => lists.islamabad_sectors.includes(x)));
  ok('Rawalpindi’s are not', !lists.islamabad_sectors.includes('Satellite Town') && !lists.islamabad_sectors.includes('Saddar'));
  ok('older copies still get the live sectors', Array.isArray(lists.live_sectors));
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261202000000_fast_posting.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', Number((await setup(`SELECT public.price_floor($1) AS f`, [geyser.id])).rows[0].f) === 120000);
  ok('and the office’s setting was not reset', (await setup(`SELECT value FROM public.settings WHERE key = 'min_price_bps'`)).rows[0].value == 6000);
}

report();
