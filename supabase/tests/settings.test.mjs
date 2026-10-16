/**
 * Phase 8: the settings screen and blocking.
 *
 * What must hold: the office can change a setting only within the range
 * written in the migration, never a money setting or the guarantee, and
 * every change is written down for good with who made it. A sector cannot
 * be opened with nobody to send. A customer who blocks a technician never
 * has a job of hers reach him again — not his feed, not an offer, not a
 * notification, not "ask again" — and he is never told.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'a1111111-1111-4111-8111-111111111111';
const SARA = 'a2222222-2222-4222-8222-222222222222';
const NADIA = 'a6666666-6666-4666-8666-666666666666';
const BILAL = 'a3333333-3333-4333-8333-333333333333';
const ASAD = 'a4444444-4444-4444-8444-444444444444';
const OWNER = 'a9999999-9999-4999-8999-999999999999';
const CLERK = 'a8888888-8888-4888-8888-888888888888';

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [NADIA, '923006666666', null, 'customer', 'Nadia'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [OWNER, null, 'owner@example.com', null, null],
  [CLERK, null, 'clerk@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
// A second office login, switched off, to prove switching off works here too.
await setup(`INSERT INTO public.staff (id, name, role, active) VALUES ($1, 'Former clerk', 'office', false)`, [CLERK]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name, lang] of [[AYESHA, 'ayesha', 'en'], [SARA, 'sara', 'en'], [BILAL, 'bilal', 'ur'], [ASAD, 'asad', 'en']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', $2)`, [token(name), lang]);
}
let seen = 0;
async function sent() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}
const to = (m, name) => m.filter((x) => x.to === token(name));
const value = async (key) => Number((await setup(`SELECT value FROM public.settings WHERE key = $1`, [key])).rows[0].value);
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];

let n = 0;
async function post(customer, { price = 400000, sector = 'F-11' } = {}) {
  n += 1;
  return (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => $3, p_street => 'Street 34',
    p_house => 'House 12', p_media => '[]'::jsonb)`, [`Job number ${n} needs a look`, price, sector])).value;
}
async function chosen(pro, customer) {
  const j = await post(customer);
  await me(pro, `SELECT public.make_offer($1, 400000, 20, NULL)`, [j.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [j.id, pro])).rows[0].id;
  await me(customer, `SELECT public.choose_offer($1)`, [offer]);
  return j;
}
/** Done, quickly: the rules of finishing are phase 4's tests, not these. */
async function done(pro, customer) {
  const j = await chosen(pro, customer);
  await setup(`UPDATE public.jobs SET status = 'done', finished_at = now(), collect_paisa = agreed_paisa, parts_paisa = 0, commission_paisa = 0 WHERE id = $1`, [j.id]);
  return j;
}
const SET = `SELECT public.admin_set_setting($1, $2)`;

// =============================================================================
heading('The settings screen: only the office, only within range');

{
  ok('a customer gets nothing', (await me(AYESHA, `SELECT public.admin_settings()`)).value === null);
  ok('a technician gets nothing', (await me(BILAL, `SELECT public.admin_settings()`)).value === null);
  denied('a stranger cannot ask', await as('anon', null, `SELECT public.admin_settings()`));
  ok('a switched-off office login gets nothing', (await me(CLERK, `SELECT public.admin_settings()`)).value === null);
  const s = (await me(OWNER, `SELECT public.admin_settings()`)).value;
  const row = (k) => s?.settings.find((x) => x.key === k);
  ok('the owner sees every setting', s?.settings.length >= 30, String(s?.settings.length));
  ok('the offer time can be changed, from 5 to 60 minutes', row('offer_minutes')?.editable === true && row('offer_minutes')?.lo === 5 && row('offer_minutes')?.hi === 60);
  for (const k of ['commission_bps', 'repeat_commission_bps', 'credit_limit_paisa', 'reserve_bps', 'guarantee_days']) {
    ok(`${k} is shown but locked`, row(k)?.editable === false);
  }
  ok('the sectors are listed with who works there', s?.sectors.find((x) => x.name === 'F-11')?.pros === 2 && s?.sectors.find((x) => x.name === 'G-9')?.pros === 0);
}
{
  for (const [k, v] of [['commission_bps', 500], ['repeat_commission_bps', 0], ['credit_limit_paisa', 10000000], ['reserve_bps', 0], ['guarantee_days', 7]]) {
    const before = await value(k);
    const r = (await me(OWNER, SET, [k, v])).value;
    ok(`the owner cannot change ${k} from the panel`, r?.ok === false && (await value(k)) === before, JSON.stringify(r));
  }
  ok('a technician cannot change a setting', (await me(BILAL, SET, ['offer_minutes', 20])).value?.ok === false);
  ok('nor a switched-off office login', (await me(CLERK, SET, ['offer_minutes', 20])).value?.ok === false && (await value('offer_minutes')) === 10);
  denied('nor a stranger', await as('anon', null, SET, ['offer_minutes', 20]));
  denied('nobody can write the settings table directly', await as('authenticated', OWNER, `UPDATE public.settings SET value = 1 WHERE key = 'commission_bps'`));
  ok('below the range is refused', (await me(OWNER, SET, ['offer_minutes', 4])).value?.field === 'value');
  ok('above it too', (await me(OWNER, SET, ['offer_minutes', 61])).value?.field === 'value');
  ok('a made-up setting is refused', (await me(OWNER, SET, ['free_money', 1])).value?.ok === false);
  ok('20 minutes is accepted', (await me(OWNER, SET, ['offer_minutes', 20])).value?.ok === true && (await value('offer_minutes')) === 20);
  const log = (await setup(`SELECT * FROM public.setting_changes WHERE key = 'offer_minutes'`)).rows;
  ok('and written down: 10 → 20, by Zohaib', log.length === 1 && Number(log[0].old_value) === 10 && Number(log[0].new_value) === 20 && log[0].by_name === 'Zohaib');
  ok('setting the same value again records nothing', (await me(OWNER, SET, ['offer_minutes', 20])).value?.same === true
     && (await setup(`SELECT count(*)::int AS n FROM public.setting_changes WHERE key = 'offer_minutes'`)).rows[0].n === 1);
  const j = await post(AYESHA);
  await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [j.id]);
  const life = (await setup(`SELECT extract(epoch FROM expires_at - created_at)::int AS s FROM public.offers WHERE job_id = $1`, [j.id])).rows[0].s;
  ok('a new offer now lives 20 minutes', Math.abs(life - 1200) < 5, String(life));
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [j.id]);

  ok('half a rupee is refused', (await me(OWNER, SET, ['visit_fee_min_paisa', 30050])).value?.field === 'value');
  ok('the smallest visit fee cannot pass the largest', (await me(OWNER, SET, ['visit_fee_min_paisa', 150000])).value?.field === 'value');
  ok('nor the largest fall below the smallest', (await me(OWNER, SET, ['visit_fee_max_paisa', 20000])).value?.field === 'value');
  ok('Rs 400 to Rs 1,000 is fine', (await me(OWNER, SET, ['visit_fee_min_paisa', 40000])).value?.ok === true);
  ok('the posting screen is told the new fee', (await me(AYESHA, `SELECT public.app_lists()`)).value?.visit_fee_min_paisa === 40000);
  ok('a flag limit can be changed', (await me(OWNER, SET, ['flag_cancelled', 5])).value?.ok === true && (await value('flag_cancelled')) === 5);

  const any = (await setup(`SELECT id FROM public.setting_changes LIMIT 1`)).rows[0].id;
  for (const [what, sql] of [['nobody can change the record of changes, not the database owner', `UPDATE public.setting_changes SET by_name = 'x' WHERE id = ${any}`], ['nor delete from it', `DELETE FROM public.setting_changes WHERE id = ${any}`]]) {
    const r = await setup(sql).then(() => 'allowed', (e) => e.message);
    ok(what, /written once/.test(r), r);
  }
  nothing('nobody can read the record directly', await as('authenticated', OWNER, `SELECT * FROM public.setting_changes`));
  ok('the screen shows the last changes', (await me(OWNER, `SELECT public.admin_settings()`)).value?.changes.length === 3);
}

// =============================================================================
heading('Sectors: opened only where somebody works');

{
  const SECTOR = `SELECT public.admin_set_sector($1, $2)`;
  ok('a technician cannot open a sector', (await me(BILAL, SECTOR, ['G-9', true])).value?.ok === false);
  ok('G-9 cannot open with nobody approved there', (await me(OWNER, SECTOR, ['G-9', true])).value?.field === 'sector');
  ok('so a job there is still refused', (await post(AYESHA, { sector: 'G-9' }))?.field === 'sector');
  await setup(`UPDATE public.pros SET sectors = '{F-11,G-9}' WHERE id = $1`, [ASAD]);
  ok('with Asad working there, it opens', (await me(OWNER, SECTOR, ['G-9', true])).value?.ok === true);
  const g9 = await post(AYESHA, { sector: 'G-9' });
  ok('and a job there posts', g9?.ok === true);
  ok('the app lists it as live', (await me(AYESHA, `SELECT public.app_lists()`)).value?.live_sectors.includes('G-9'));
  const kept = await post(AYESHA);
  ok('closing F-11', (await me(OWNER, SECTOR, ['F-11', false])).value?.ok === true);
  ok('stops new jobs there', (await post(AYESHA))?.field === 'sector');
  ok('but leaves the job already posted as it was', (await job(kept.id)).status === 'open');
  ok('both changes are written down', (await setup(`SELECT count(*)::int AS n FROM public.setting_changes WHERE key LIKE 'sector:%'`)).rows[0].n === 2);
  await me(OWNER, SECTOR, ['F-11', true]);
  for (const id of [g9.id, kept.id]) await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [id]);
}

// =============================================================================
heading('Blocking: he never sees her jobs again, and is not told');

const BLOCK = `SELECT public.block_pro($1, $2)`;
{
  const finished = await done(BILAL, AYESHA);
  const onNow = await chosen(BILAL, AYESHA);
  const open = await post(AYESHA);
  ok('Sara cannot block on Ayesha\'s job', (await me(SARA, BLOCK, [finished.id, null])).value?.ok === false);
  ok('a job with no technician cannot be blocked from', (await me(AYESHA, BLOCK, [open.id, null])).value?.ok === false);
  ok('nor while the job is on: that is for the office', (await me(AYESHA, BLOCK, [onNow.id, null])).value?.ok === false);
  ok('a phone number in the reason is refused', (await me(AYESHA, BLOCK, [finished.id, 'Call me on 0300 1234567'])).value?.field === 'reason');
  denied('a stranger cannot block', await as('anon', null, BLOCK, [finished.id, null]));
  await setup(`UPDATE public.jobs SET status = 'done', finished_at = now(), collect_paisa = agreed_paisa WHERE id = $1`, [onNow.id]);

  await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [open.id]);
  await me(AYESHA, `SELECT public.ask_again($1)`, [finished.id]);
  await sent();
  ok('Ayesha blocks Bilal after the job', (await me(AYESHA, BLOCK, [finished.id, 'He was rude at the gate'])).value?.ok === true);
  ok('he is not told', to(await sent(), 'bilal').length === 0);
  ok('his live offer on her open job is taken back', (await setup(`SELECT status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [open.id, BILAL])).rows[0].status === 'withdrawn');
  ok('so she does not see it', ((await me(AYESHA, `SELECT public.job_offers($1)`, [open.id])).value ?? []).length === 0);
  ok('her "ask again" for him is forgotten', (await setup(`SELECT count(*)::int AS n FROM public.asked_for WHERE customer_id = $1`, [AYESHA])).rows[0].n === 0);
  ok('blocking twice is harmless', (await me(AYESHA, BLOCK, [onNow.id, null])).value?.ok === true
     && (await setup(`SELECT count(*)::int AS n FROM public.blocks WHERE customer_id = $1`, [AYESHA])).rows[0].n === 1);

  const next = await post(AYESHA);
  const m = await sent();
  ok('her next job does not buzz him', to(m, 'bilal').length === 0);
  ok('but does buzz Asad', to(m, 'asad').length === 1);
  ok('it is not in his feed', !((await me(BILAL, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === next.id));
  ok('he cannot offer on it', (await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [next.id])).value?.ok === false);
  ok('nor on the one he had offered on', (await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [open.id])).value?.ok === false);
  ok('she cannot ask for him again', (await me(AYESHA, `SELECT public.ask_again($1)`, [finished.id])).value?.ok === false);
  const card = ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === finished.id);
  ok('her card says he is blocked, and offers no "ask again"', card?.blocked === true && card?.can_ask_again === false && card?.can_block === true);
  // The hold must not reach him either, if somehow asked for.
  await setup(`INSERT INTO public.asked_for (customer_id, pro_id, trade) VALUES ($1, $2, 'ac')`, [AYESHA, BILAL]);
  const held = await post(AYESHA);
  ok('a job is never held for a man she blocked', (await job(held.id)).preferred_pro_id === null);

  const sara = await post(SARA);
  ok('Sara\'s jobs still reach him: a block is one customer\'s', ((await me(BILAL, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === sara.id));

  nothing('he cannot read the blocks', await as('authenticated', BILAL, `SELECT * FROM public.blocks`));
  nothing('nor can she', await as('authenticated', AYESHA, `SELECT * FROM public.blocks`));
  ok('he cannot ask who blocked him', (await me(BILAL, `SELECT public.admin_blocks($1)`, [BILAL])).value === null);
  const office = (await me(OWNER, `SELECT public.admin_blocks($1)`, [BILAL])).value;
  ok('the office can, with her first name, the job and her words', office?.[0]?.customer === 'Ayesha' && office?.[0]?.ref === finished.ref && office?.[0]?.reason === 'He was rude at the gate');
  ok('it is in the job\'s history', (await setup(`SELECT count(*)::int AS n FROM public.job_events WHERE job_id = $1 AND what = 'blocked'`, [finished.id])).rows[0].n === 1);

  ok('Sara cannot undo Ayesha\'s block', (await me(SARA, `SELECT public.unblock_pro($1)`, [finished.id])).value?.ok === false);
  ok('Ayesha undoes it', (await me(AYESHA, `SELECT public.unblock_pro($1)`, [finished.id])).value?.ok === true);
  ok('and her open jobs reach him again', ((await me(BILAL, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === next.id));
  for (const id of [open.id, next.id, held.id, sara.id]) await setup(`UPDATE public.jobs SET status = 'cancelled' WHERE id = $1`, [id]);

  // A cancelled job after he was chosen can be blocked from too.
  const gone = await chosen(ASAD, NADIA);
  await me(NADIA, `SELECT public.cancel_job($1, NULL)`, [gone.id]);
  ok('a job cancelled after he was chosen can be blocked from', (await me(NADIA, BLOCK, [gone.id, null])).value?.ok === true);
  const gonecard = ((await me(NADIA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === gone.id);
  ok('the button names him, and nothing else about him is on the card', gonecard?.block_name === 'Asad' && gonecard?.pro === null);
}

// =============================================================================
heading('Two blocks are a flag; deleting an account takes its blocks');

{
  const a = await done(BILAL, AYESHA);
  const s = await done(BILAL, SARA);
  await me(AYESHA, BLOCK, [a.id, null]);
  ok('one block is not a flag yet', !(await me(OWNER, `SELECT public.admin_flags()`)).value?.people.some((x) => x.id === BILAL));
  await me(SARA, BLOCK, [s.id, null]);
  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value?.people.find((x) => x.id === BILAL);
  ok('two customers blocking Bilal is', f?.flags.some((x) => x.kind === 'blocked' && x.n === 2), JSON.stringify(f));
  ok('and nothing happened to him', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved');
  ok('Sara deletes her account', (await me(SARA, `SELECT public.delete_my_account()`)).value?.ok === true);
  ok('and her block goes with it', (await setup(`SELECT count(*)::int AS n FROM public.blocks WHERE customer_id = $1`, [SARA])).rows[0].n === 0);
}

report();
