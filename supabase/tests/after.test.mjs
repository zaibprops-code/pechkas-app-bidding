/**
 * Phase 7: after launch.
 *
 * What must hold: a returning customer's job costs the technician 7% of the
 * labour, never more than he was shown, and a first job with somebody is
 * still 10%. "Ask again" gives one technician a job alone for a few minutes
 * and then everybody — once, whoever opens it — and while it is his, no
 * other technician's feed, offer or notification can reach it. The demand
 * report and the fraud flags are the office's only, count real rows, and a
 * flag never changes anybody's account.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'f1111111-1111-4111-8111-111111111111';
const SARA = 'f2222222-2222-4222-8222-222222222222';
const BILAL = 'f3333333-3333-4333-8333-333333333333';
const ASAD = 'f4444444-4444-4444-8444-444444444444';
const KAMRAN = 'f5555555-5555-4555-8555-555555555555';
const NADIA = 'f6666666-6666-4666-8666-666666666666';
const OWNER = 'f9999999-9999-4999-8999-999999999999';

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [NADIA, '923006666666', null, 'customer', 'Nadia'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [KAMRAN, '923005555555', null, 'pro', 'Kamran'],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood'], [KAMRAN, 'Kamran Shah']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
// This file posts far more jobs than one real customer would in a day.
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name, lang] of [[AYESHA, 'ayesha', 'en'], [SARA, 'sara', 'en'], [BILAL, 'bilal', 'ur'], [ASAD, 'asad', 'en'], [KAMRAN, 'kamran', 'en']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', $2)`, [token(name), lang]);
}

let seen = 0;
const all = [];
async function sent() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  const m = rows.flatMap((r) => r.body);
  all.push(...m);
  return m;
}
const to = (m, name) => m.filter((x) => x.to === token(name));
let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/photo-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);

let n = 0;
async function post(customer, { price = 400000, trade = 'ac', sector = 'F-11' } = {}) {
  n += 1;
  const r = (await me(customer, `SELECT public.post_job(p_trade => $3, p_job_type => NULL, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => $4, p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`Job number ${n} needs a look`, price, trade, sector])).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r;
}
/** Posted, offered on by `pro` at the customer's price, and chosen. */
async function chosen(pro, customer, price = 400000) {
  const j = await post(customer, { price });
  await setup(`UPDATE public.jobs SET preferred_until = now() - interval '1 second' WHERE id = $1 AND preferred_pro_id IS NOT NULL`, [j.id]);
  const o = (await me(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [j.id, price])).value;
  if (!o?.ok) throw new Error(`offer failed: ${JSON.stringify(o)}`);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [j.id, pro])).rows[0].id;
  await me(customer, `SELECT public.choose_offer($1)`, [offer]);
  return j;
}
/** All the way to arrived at the gate. */
async function arrived(pro, customer, price) {
  const j = await chosen(pro, customer, price);
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [j.id]);
  await me(pro, `SELECT public.tech_step($1, 'on_way')`, [j.id]);
  return j;
}
async function working(pro, customer, price) {
  const j = await arrived(pro, customer, price);
  const r = (await me(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [j.id, (await job(j.id)).start_code, JSON.stringify([await upload(pro)])])).value;
  if (!r?.ok) throw new Error(`start failed: ${JSON.stringify(r)}`);
  return j;
}
const FINISH = `SELECT public.finish_work($1, $2::jsonb, $3, $4)`;
async function done(pro, customer, price, parts = 0) {
  const j = await working(pro, customer, price);
  const r = (await me(pro, FINISH, [j.id, JSON.stringify([await upload(pro)]), parts, parts ? await upload(pro) : null])).value;
  if (!r?.ok) throw new Error(`finish failed: ${JSON.stringify(r)}`);
  await sent();
  return { ...j, finish: r };
}

// =============================================================================
heading('The repeat fee: 7% of the labour for a returning customer');

{
  const first = await done(BILAL, AYESHA, 550000);
  ok('Ayesha\'s first job with Bilal: 10% of Rs 5,500 is Rs 550', first.finish.commission_bps === 1000 && first.finish.commission_paisa === 55000, JSON.stringify(first.finish));

  const next = await post(AYESHA, { price: 123400 });
  const feed = (await me(BILAL, `SELECT public.pro_feed()`)).value;
  const seenByBilal = feed?.jobs.find((x) => x.id === next.id);
  ok('his feed says she is a returning customer, and his share is 7%', seenByBilal?.repeat === true && seenByBilal?.commission_bps === 700, JSON.stringify(seenByBilal));
  const seenByAsad = (await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs.find((x) => x.id === next.id);
  ok('for Asad, who has never worked for her, it is 10%', seenByAsad?.repeat === false && seenByAsad?.commission_bps === 1000);
  ok('the feed still says the standard and the returning share', feed?.commission_bps === 1000 && feed?.repeat_commission_bps === 700);

  await me(BILAL, `SELECT public.make_offer($1, 123400, 20, NULL)`, [next.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [next.id, BILAL])).rows[0].id;
  await me(AYESHA, `SELECT public.choose_offer($1)`, [offer]);
  const mine = ((await me(BILAL, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === next.id);
  ok('chosen, he is shown what he keeps at 7%: Rs 1,234 less Rs 86.38', mine?.commission_bps === 700 && mine?.keeps_paisa === 123400 - 8638, JSON.stringify(mine));

  await me(BILAL, `SELECT public.tech_step($1, 'chosen')`, [next.id]);
  await me(BILAL, `SELECT public.tech_step($1, 'on_way')`, [next.id]);
  await me(BILAL, `SELECT public.start_work($1, $2, $3::jsonb)`, [next.id, (await job(next.id)).start_code, JSON.stringify([await upload(BILAL)])]);
  const before = await owed(BILAL);
  const r = (await me(BILAL, FINISH, [next.id, JSON.stringify([await upload(BILAL)]), 0, null])).value;
  ok('done: 7% of Rs 1,234, rounded DOWN, is 8,638 paisa', r?.commission_bps === 700 && r?.commission_paisa === 8638, JSON.stringify(r));
  const row = await job(next.id);
  ok('the share is fixed on the job with the commission', row.commission_bps === 700 && Number(row.commission_paisa) === 8638);
  ok('and the ledger is owed exactly that', (await owed(BILAL)) - before === 8638);
  ok('the office sees the share on the job', (await me(OWNER, `SELECT public.admin_job_detail($1)`, [next.id])).value?.money?.commission_bps === 700);

  const withParts = await done(BILAL, AYESHA, 500000, 200000);
  ok('with parts, 7% is of the labour only: Rs 3,000 → Rs 210', withParts.finish.commission_paisa === 21000 && withParts.finish.commission_bps === 700);

  const sara = await done(BILAL, SARA, 500000);
  ok('Sara\'s first job with Bilal is 10%, whatever Ayesha did', sara.finish.commission_bps === 1000 && sara.finish.commission_paisa === 50000);

  // A stopped job is not "used before": nothing was done.
  const stop = await working(ASAD, NADIA, 300000);
  await me(ASAD, `SELECT public.ask_change($1, 600000, 'The compressor has gone', $2)`, [stop.id, await upload(ASAD)]);
  const change = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1`, [stop.id])).rows[0].id;
  await me(NADIA, `SELECT public.decide_change($1, false)`, [change]);
  const after = await done(ASAD, NADIA, 300000);
  ok('a job that stopped at the door does not make her a returning customer', after.finish.commission_bps === 1000);

  // The breaking test: if the rule ever stops asking "done", every pair is "returning".
  denied('nobody can call the rate directly', await as('authenticated', BILAL, `SELECT public.commission_rate($1, $2, NULL)`, [AYESHA, BILAL]));
}

// =============================================================================
heading('Ask again: his alone for a few minutes, then everyone');

const done1 = (await setup(`SELECT id FROM public.jobs WHERE customer_id = $1 AND pro_id = $2 AND status = 'done' ORDER BY created_at LIMIT 1`, [AYESHA, BILAL])).rows[0].id;
const ASK = `SELECT public.ask_again($1)`;
{
  ok('Sara cannot ask again on Ayesha\'s job', (await me(SARA, ASK, [done1])).value?.ok === false);
  const open = await post(AYESHA);
  ok('nor on a job that is not finished', (await me(AYESHA, ASK, [open.id])).value?.ok === false);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [open.id]);
  denied('a stranger cannot ask at all', await as('anon', null, ASK, [done1]));

  const r = (await me(AYESHA, ASK, [done1])).value;
  ok('Ayesha asks for Bilal again: his first name, and how long he has', r?.ok === true && r?.first_name === 'Bilal' && r?.minutes === 10 && r?.online === true, JSON.stringify(r));
  nothing('nobody can read who asked for whom', await as('authenticated', AYESHA, `SELECT * FROM public.asked_for`));
  await sent();

  const plumbing = await post(AYESHA, { trade: 'plumber' });
  ok('a job in another trade is not held for him', (await job(plumbing.id)).preferred_pro_id === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [plumbing.id]);

  const held = await post(AYESHA, { price: 450000 });
  const row = await job(held.id);
  ok('her next AC job is held for Bilal', row.preferred_pro_id === BILAL && row.preferred_until > new Date());
  ok('for ten minutes', Math.abs(new Date(row.preferred_until) - new Date(row.created_at) - 600000) < 2000);
  ok('the request is used up', (await setup(`SELECT count(*)::int AS n FROM public.asked_for WHERE customer_id = $1`, [AYESHA])).rows[0].n === 0);
  let m = await sent();
  ok('Bilal is told, in Roman Urdu, that she asked for him', to(m, 'bilal').some((x) => /dobara aap ko bulaya/.test(x.title) && /10 minute/.test(x.body)), JSON.stringify(to(m, 'bilal')));
  ok('nobody else is told', to(m, 'asad').length === 0 && to(m, 'kamran').length === 0);
  const bilalFeed = (await me(BILAL, `SELECT public.pro_feed()`)).value?.jobs ?? [];
  ok('it is at the top of his feed, marked as asked for him', bilalFeed[0]?.id === held.id && bilalFeed[0]?.asked_you === true && bilalFeed[0]?.asked_until);
  ok('Asad\'s feed does not have it', !((await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === held.id));
  ok('Asad cannot offer on it', (await me(ASAD, `SELECT public.make_offer($1, 450000, 20, NULL)`, [held.id])).value?.ok === false);
  const mine = ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === held.id);
  ok('Ayesha sees it is with Bilal first, and until when', mine?.preferred?.first_name === 'Bilal' && mine?.preferred?.until);
  ok('and that she can ask for him again on the finished job', ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === done1)?.can_ask_again === true);

  ok('the clock does nothing before the time is up', Number((await setup(`SELECT public.release_preferred() AS n`)).rows[0].n) === 0 && (await sent()).length === 0);
  await setup(`UPDATE public.jobs SET preferred_until = now() - interval '1 second' WHERE id = $1`, [held.id]);
  ok('the moment the time is up, Asad can see it, before the clock has even run', ((await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === held.id));
  ok('the clock opens it to everyone', Number((await setup(`SELECT public.release_preferred() AS n`)).rows[0].n) === 1);
  m = await sent();
  ok('Asad and Kamran are told about a new job', to(m, 'asad').some((x) => /New job/.test(x.title)) && to(m, 'kamran').length === 1);
  ok('Bilal is not told about it twice', to(m, 'bilal').length === 0);
  ok('and the clock does it once', Number((await setup(`SELECT public.release_preferred() AS n`)).rows[0].n) === 0 && (await sent()).length === 0);
  ok('Asad can now offer', (await me(ASAD, `SELECT public.make_offer($1, 450000, 20, NULL)`, [held.id])).value?.ok === true);
  ok('it is in the job\'s history', (await setup(`SELECT count(*)::int AS n FROM public.job_events WHERE job_id = $1 AND what IN ('asked_first', 'opened_to_all')`, [held.id])).rows[0].n === 2);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [held.id]);
  await sent();
}
{
  await me(AYESHA, ASK, [done1]);
  const held = await post(AYESHA);
  await sent();
  ok('Sara cannot open Ayesha\'s held job', (await me(SARA, `SELECT public.release_now($1)`, [held.id])).value?.ok === false);
  ok('nor can Asad pass on a job not asked of him', (await me(ASAD, `SELECT public.pass_asked($1)`, [held.id])).value?.ok === false);
  ok('Ayesha: "ask everyone now"', (await me(AYESHA, `SELECT public.release_now($1)`, [held.id])).value?.ok === true);
  const m = await sent();
  ok('everyone else is told at once', to(m, 'asad').length === 1 && to(m, 'kamran').length === 1 && to(m, 'bilal').length === 0);
  const card = ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === held.id);
  ok('her card no longer says it is with Bilal, but remembers she asked for him', !card?.preferred && card?.asked_for === 'Bilal');
  ok('pressing it again tells nobody twice', (await me(AYESHA, `SELECT public.release_now($1)`, [held.id])).value?.ok === true && (await sent()).length === 0);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [held.id]);
  await sent();
}
{
  await me(AYESHA, ASK, [done1]);
  const held = await post(AYESHA);
  await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [held.id]);
  await sent();
  ok('Bilal cannot come: he passes', (await me(BILAL, `SELECT public.pass_asked($1)`, [held.id])).value?.ok === true);
  const m = await sent();
  ok('Ayesha is told he cannot, and that it has gone to everyone', to(m, 'ayesha').some((x) => x.title === 'Bilal cannot take ' + held.ref && /every checked technician/.test(x.body)), JSON.stringify(to(m, 'ayesha')));
  ok('Asad and Kamran are told', to(m, 'asad').length === 1 && to(m, 'kamran').length === 1);
  ok('his offer is taken back', (await setup(`SELECT status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [held.id, BILAL])).rows[0].status === 'withdrawn');
  ok('passing twice is refused', (await me(BILAL, `SELECT public.pass_asked($1)`, [held.id])).value?.ok === false);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [held.id]);
  await sent();
}
{
  // Chosen while held: the clock must leave it alone.
  await me(AYESHA, ASK, [done1]);
  const held = await post(AYESHA);
  await me(BILAL, `SELECT public.make_offer($1, 400000, 20, NULL)`, [held.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [held.id, BILAL])).rows[0].id;
  ok('she chooses Bilal inside the ten minutes', (await me(AYESHA, `SELECT public.choose_offer($1)`, [offer])).value?.ok === true);
  await sent();
  await setup(`UPDATE public.jobs SET preferred_until = now() - interval '1 second' WHERE id = $1`, [held.id]);
  ok('when the time is up, a job already given is not announced', Number((await setup(`SELECT public.release_preferred() AS n`)).rows[0].n) === 0 && (await sent()).length === 0);
  ok('and Asad still cannot see it', !((await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === held.id));
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [held.id]);
  await sent();
}
{
  await setup(`UPDATE public.pros SET online = false WHERE id = $1`, [BILAL]);
  await me(AYESHA, ASK, [done1]);
  const j = await post(AYESHA);
  const m = await sent();
  ok('Bilal offline: not held for a man who is not working, everyone is told', (await job(j.id)).preferred_pro_id === null && to(m, 'asad').length === 1);
  ok('and her card says nobody was asked first', ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === j.id)?.asked_for === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
  await setup(`UPDATE public.pros SET online = true WHERE id = $1`, [BILAL]);

  await me(AYESHA, ASK, [done1]);
  const e11 = await post(AYESHA, { sector: 'E-11' });
  ok('a sector he does not work in: not held', (await job(e11.id)).preferred_pro_id === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [e11.id]);

  await me(AYESHA, ASK, [done1]);
  await setup(`UPDATE public.asked_for SET asked_at = now() - interval '61 minutes' WHERE customer_id = $1`, [AYESHA]);
  const late = await post(AYESHA);
  ok('a request more than an hour old is forgotten', (await job(late.id)).preferred_pro_id === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [late.id]);

  await me(AYESHA, ASK, [done1]);
  await me(AYESHA, `SELECT public.forget_ask_again()`);
  const all2 = await post(AYESHA);
  ok('"ask everyone instead" forgets it', (await job(all2.id)).preferred_pro_id === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [all2.id]);

  await me(AYESHA, ASK, [done1]);
  await setup(`SELECT public.post_txn('test:over', 'commission', NULL, $1::uuid, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', $2::text, 'amount', 500000),
    jsonb_build_object('account', 'commission', 'amount', -500000)))`, [BILAL, BILAL]);
  const over = await post(AYESHA);
  ok('over the credit limit he could not offer, so it is not held for him', (await job(over.id)).preferred_pro_id === null);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [over.id]);
  await setup(`SELECT public.post_txn('test:over-back', 'reversal', NULL, $1::uuid, jsonb_build_array(
    jsonb_build_object('account', 'pro_owes', 'pro_id', $2::text, 'amount', -500000),
    jsonb_build_object('account', 'commission', 'amount', 500000)))`, [BILAL, BILAL]);

  await setup(`UPDATE public.pros SET status = 'suspended' WHERE id = $1`, [BILAL]);
  ok('a suspended technician cannot be asked for', (await me(AYESHA, ASK, [done1])).value?.ok === false);
  ok('and her card stops offering it', ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === done1)?.can_ask_again === false);
  await setup(`UPDATE public.pros SET status = 'approved' WHERE id = $1`, [BILAL]);
  await sent();
}

// =============================================================================
heading('Demand: what nobody took, and where people are asking');

{
  const ASKS = `SELECT public.ask_for_sector($1, $2)`;
  ok('a live sector is refused: post the job instead', (await me(SARA, ASKS, ['ac', 'F-11'])).value?.field === 'sector');
  ok('a made-up sector is refused', (await me(SARA, ASKS, ['ac', 'Z-99'])).value?.field === 'sector');
  ok('a made-up trade is refused', (await me(SARA, ASKS, ['jetpacks', 'G-9'])).value?.field === 'trade');
  ok('a technician cannot ask', (await me(BILAL, ASKS, ['ac', 'G-9'])).value?.ok === false);
  denied('a stranger cannot ask', await as('anon', null, ASKS, ['ac', 'G-9']));
  ok('Sara is in G-9 and needs AC work', (await me(SARA, ASKS, ['ac', 'G-9'])).value?.ok === true);
  ok('asking twice is one line, not two', (await me(SARA, ASKS, ['ac', 'G-9'])).value?.ok === true
     && (await setup(`SELECT count(*)::int AS n FROM public.sector_asks WHERE customer_id = $1`, [SARA])).rows[0].n === 1);
  await me(SARA, ASKS, ['plumber', 'G-9']);
  await me(NADIA, ASKS, ['ac', 'G-9']);
  await me(NADIA, ASKS, ['electrician', 'DHA']);
  nothing('nobody can read the asks', await as('authenticated', SARA, `SELECT * FROM public.sector_asks`));

  // A job nobody offered on, and one the office placed by hand.
  const lonely = await post(NADIA, { trade: 'ac', sector: 'G-13' });
  await setup(`UPDATE public.jobs SET created_at = now() - interval '30 minutes' WHERE id = $1`, [lonely.id]);
  const byHand = await post(NADIA, { trade: 'ac', sector: 'G-13' });
  await me(OWNER, `SELECT public.admin_assign($1, $2, 400000)`, [byHand.id, ASAD]);
  const young = await post(NADIA, { trade: 'ac', sector: 'G-13' });

  ok('a customer gets nothing from the report', (await me(SARA, `SELECT public.admin_demand(30)`)).value === null);
  ok('a technician gets nothing', (await me(BILAL, `SELECT public.admin_demand(30)`)).value === null);
  denied('a stranger cannot ask for it', await as('anon', null, `SELECT public.admin_demand(30)`));
  const d = (await me(OWNER, `SELECT public.admin_demand(30)`)).value;
  const g13 = d?.served.find((x) => x.sector === 'G-13' && x.trade === 'ac');
  ok('G-13 AC: three posted', g13?.posted === 3, JSON.stringify(g13));
  ok('two had no offer: the old one and the one placed by hand — not the one still young', g13?.nobody_offered === 2);
  ok('one placed by hand', g13?.by_hand === 1);
  ok('and nobody covers it', g13?.pros === 0);
  ok('it is first on the list', d?.served[0]?.sector === 'G-13');
  ok('F-11 AC: three technicians cover it', d?.served.find((x) => x.sector === 'F-11' && x.trade === 'ac')?.pros === 3);
  ok('live sectors and trades with nobody at all are listed', d?.uncovered.some((x) => x.sector === 'G-13' && x.trade === 'ac')
     && d?.uncovered.some((x) => x.sector === 'F-11' && x.trade === 'plumber') && !d?.uncovered.some((x) => x.sector === 'F-11' && x.trade === 'ac'));
  const g9 = d?.asked.find((x) => x.sector === 'G-9');
  ok('G-9: two people asked, for AC twice and plumbing once', g9?.people === 2 && g9?.trades?.AC === 2 && g9?.trades?.Plumber === 1, JSON.stringify(g9));
  ok('G-9 comes before DHA', d?.asked[0]?.sector === 'G-9' && d?.asked[1]?.sector === 'DHA');
  await setup(`UPDATE public.pros SET sectors = '{F-11,G-9}' WHERE id = $1`, [KAMRAN]);
  ok('and it says who already works there', (await me(OWNER, `SELECT public.admin_demand(30)`)).value?.asked.find((x) => x.sector === 'G-9')?.pros === 1);
  await setup(`UPDATE public.sector_asks SET asked_at = now() - interval '40 days' WHERE sector = 'DHA'`);
  ok('an ask older than the window drops out', !(await me(OWNER, `SELECT public.admin_demand(30)`)).value?.asked.some((x) => x.sector === 'DHA'));
  for (const id of [lonely.id, young.id]) await me(NADIA, `SELECT public.cancel_job($1, NULL)`, [id]);
  await me(OWNER, `SELECT public.admin_cancel_job($1, 'Test over')`, [byHand.id]);
  await sent();
}

// =============================================================================
heading('Fraud flags: the office looks, nothing happens by itself');

{
  // Kamran: three jobs cancelled after he was chosen; five wrong codes on another.
  for (let i = 0; i < 3; i += 1) {
    const j = await chosen(KAMRAN, SARA);
    await me(SARA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
  }
  const g = await arrived(KAMRAN, NADIA);
  for (let i = 0; i < 5; i += 1) {
    await me(KAMRAN, `SELECT public.start_work($1, '0000', $2::jsonb)`, [g.id, JSON.stringify([await upload(KAMRAN)])]);
  }
  // Asad: two of his three finished jobs ended with the customer refusing the new price.
  for (let i = 0; i < 2; i += 1) {
    const j = await working(ASAD, NADIA, 300000);
    await me(ASAD, `SELECT public.ask_change($1, 900000, 'It needs a new compressor', $2)`, [j.id, await upload(ASAD)]);
    const c = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1 AND status = 'pending'`, [j.id])).rows[0].id;
    await me(NADIA, `SELECT public.decide_change($1, false)`, [c]);
  }
  // Sara cancels two more, for five in all.
  for (let i = 0; i < 2; i += 1) {
    const j = await post(SARA);
    await me(SARA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
  }
  await sent();

  ok('a customer gets nothing', (await me(SARA, `SELECT public.admin_flags()`)).value === null);
  ok('a technician gets nothing', (await me(KAMRAN, `SELECT public.admin_flags()`)).value === null);
  denied('a stranger cannot ask for them', await as('anon', null, `SELECT public.admin_flags()`));
  nothing('nobody can read the notes', await as('authenticated', KAMRAN, `SELECT * FROM public.flag_notes`));

  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  const who = (id) => f?.people.find((x) => x.id === id);
  const kinds = (id) => (who(id)?.flags ?? []).map((x) => x.kind).sort().join(',');
  ok('Kamran: jobs cancelled after he was chosen, and wrong codes', kinds(KAMRAN) === 'cancelled,codes', JSON.stringify(who(KAMRAN)));
  ok('with the counts that tripped them', who(KAMRAN)?.flags.find((x) => x.kind === 'cancelled')?.n === 3 && who(KAMRAN)?.flags.find((x) => x.kind === 'codes')?.n === 5);
  // With the one Nadia refused in the repeat-fee section: three of his four.
  ok('Asad: three of his four finished jobs refused at the door, and new prices asked on them', kinds(ASAD) === 'raised,stopped'
     && who(ASAD)?.flags.find((x) => x.kind === 'stopped')?.n === 3 && who(ASAD)?.flags.find((x) => x.kind === 'stopped')?.of === 4, JSON.stringify(who(ASAD)));
  ok('Sara: five cancelled jobs', kinds(SARA) === 'cancels' && who(SARA)?.side === 'customer');
  ok('Bilal, with a clean record, is not listed', !who(BILAL));
  ok('Nadia, who refused prices she did not like, is not flagged for it', !who(NADIA));
  ok('Ayesha, who called off a dozen jobs in this file, is', kinds(AYESHA) === 'cancels');
  ok('the limits in force are shown with them', f?.limits?.flag_cancelled === 3 && f?.days === 60);

  ok('three jobs cancelled after choosing him do not make Sara a returning customer of Kamran\'s',
     Number((await setup(`SELECT public.commission_rate($1, $2, NULL) AS r`, [SARA, KAMRAN])).rows[0].r) === 1000);
  ok('flags change nothing: Kamran is still approved', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [KAMRAN])).rows[0].status === 'approved');
  const j = await post(AYESHA);
  ok('and can still offer', (await me(KAMRAN, `SELECT public.make_offer($1, 400000, 20, NULL)`, [j.id])).value?.ok === true);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [j.id]);

  const NOTE = `SELECT public.admin_note_flag($1, $2, $3, $4)`;
  ok('a technician cannot write a note', (await me(KAMRAN, NOTE, ['pro', KAMRAN, 'All fine', true])).value?.ok === false);
  // Put together at run time, as in accounts.test.mjs: not even a test may hold one.
  const fakeCnic = ['61101', '1234567', '1'].join('-');
  ok('a CNIC number in a note is refused', (await me(OWNER, NOTE, ['pro', KAMRAN, `CNIC ${fakeCnic} checked`, false])).value?.field === 'note');
  ok('calling Sara a technician is refused', (await me(OWNER, NOTE, ['pro', SARA, 'Rang her', false])).value?.ok === false);
  ok('the owner notes Kamran checked', (await me(OWNER, NOTE, ['pro', KAMRAN, 'Rang the customers: they found it cheaper elsewhere', true])).value?.ok === true);
  const f2 = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  const k2 = f2?.people.find((x) => x.id === KAMRAN);
  ok('his note is shown, with who wrote it', k2?.notes[0]?.by === 'Zohaib' && k2?.checked_at);
  ok('checked, he sinks to the bottom of the list', f2?.people[f2.people.length - 1]?.id === KAMRAN);
  ok('still flagged: a note is not a pardon', k2?.flags.length === 2);

  await setup(`UPDATE public.settings SET value = 4 WHERE key = 'flag_cancelled'`);
  ok('the limits are the settings: raise one and that flag goes', !(await me(OWNER, `SELECT public.admin_flags()`)).value?.people.find((x) => x.id === KAMRAN)?.flags.some((x) => x.kind === 'cancelled'));
  await setup(`UPDATE public.settings SET value = 3 WHERE key = 'flag_cancelled'`);
  await setup(`UPDATE public.job_events SET at = now() - interval '61 days' WHERE what = 'code_wrong'`);
  ok('and anything older than the window drops out', !(await me(OWNER, `SELECT public.admin_flags()`)).value?.people.find((x) => x.id === KAMRAN)?.flags.some((x) => x.kind === 'codes'));
}

// =============================================================================
heading('Nothing private ever leaves');

{
  const { rows } = await setup(`SELECT key, ur, who FROM public.push_words WHERE key LIKE 'asked_again.%' OR key LIKE 'pref_passed.%'`);
  ok('the technician\'s new message has Roman Urdu', rows.filter((r) => r.who === 'technician').length === 2 && rows.every((r) => r.who !== 'technician' || r.ur));
  ok('a fair number of messages were looked at', all.length > 30, String(all.length));
  for (const [what, re] of [['street', /Street 34/], ['house', /House 12/], ['landmark', /markaz/], ['gate note', /Rafiq/], ['phone number', /\b0?3\d{9}\b|923\d{9}/]]) {
    ok(`no notification names a ${what}`, !all.some((x) => re.test(`${x.title} ${x.body}`)));
  }
  ok('every slot was filled', !all.some((x) => /\{[a-z_]+\}/.test(`${x.title} ${x.body}`)));
}

report();
