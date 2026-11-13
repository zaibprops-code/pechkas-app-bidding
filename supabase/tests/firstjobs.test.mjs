/**
 * His first jobs: approval by rule, trade by trade (migration first_jobs, the
 * owner's decision D37).
 *
 * What must hold: nobody watches a trial and the office is not in any routine
 * step. A technician is approved as a person by rule (a number checked by SMS,
 * his photo, the rules quiz); his first three jobs in a trade are his trial
 * (basic kinds only, one at a time, at or under the price cap, "New on
 * Pechkas" on his offer); the customer confirms his photo at her door and
 * answers four questions; a job counts only when the answers are yes, the
 * photos are in, no claim stands, the commission is paid and the customer is
 * a real, separate person; three good jobs AND verified identity approve the
 * trade. A safety report or "not the man in the photo" pauses at once; two
 * "no"s pause by rule; he appeals in writing. Risky kinds open to him only
 * after a clean record and a check by somebody the app picks, who is paid as
 * a credit and answers for whom he passed; where nobody can check, risky
 * kinds are closed to customers, who may ask to be told. Technicians approved
 * before D37 work as before until sorted by their record. Every new table is
 * unreadable; notifications carry no address; it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e7';
const id = (n) => `${P}${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const AYESHA = id(1);
const SARA = id(2);
const HINA = id(3);
const NIDA = id(4);
const ZARA = id(5);
const MARIAM = id(6);
const BILAL = id(7); // approved before D37, AC and UPS
const ASAD = id(8); // approved before D37, AC
const IMRAN = id(9); // new, AC and UPS
const FAISAL = `${P}aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`; // new, AC
const KHALID = `${P}bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`; // new, signed in by email: no number checked
const OWNER = `${P}cccccc-cccc-4ccc-8ccc-cccccccccccc`;
const CLERK = `${P}dddddd-dddd-4ddd-8ddd-dddddddddddd`;
const OWNER_PHONE = `${P}eeeeee-eeee-4eee-8eee-eeeeeeeeeeee`;
const NEWBIE = `${P}ffffff-ffff-4fff-8fff-ffffffffffff`; // a customer whose account is a day old

for (const [who, phone, email, role, name] of [
  [AYESHA, '923007441111', null, 'customer', 'Ayesha'],
  [SARA, '923007442222', null, 'customer', 'Sara'],
  [HINA, '923007443333', null, 'customer', 'Hina'],
  [NIDA, '923007444444', null, 'customer', 'Nida'],
  [ZARA, '923007445555', null, 'customer', 'Zara'],
  [MARIAM, '923007446666', null, 'customer', 'Mariam'],
  [NEWBIE, '923007449999', null, 'customer', 'Rabia'],
  [BILAL, '923007447777', null, 'pro', 'Bilal'],
  [ASAD, '923007448888', null, 'pro', 'Asad'],
  [IMRAN, '923007440001', null, 'pro', 'Imran'],
  [FAISAL, '923007440002', null, 'pro', 'Faisal'],
  [KHALID, null, 'khalid@example.com', 'pro', 'Khalid'],
  [OWNER, null, 'owner@example.com', null, null],
  [CLERK, null, 'clerk@example.com', null, null],
  [OWNER_PHONE, '923009999998', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [who, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name, created_at) VALUES ($1, $2, $3, now() - interval '200 days')`, [who, role, name]);
}
await setup(`UPDATE public.profiles SET created_at = now() - interval '1 day' WHERE id = $1`, [NEWBIE]);
// Approved before D37, by hand, the old way.
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac,ups}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Asad Mehmood', '{ac}', 9, '{F-11}', 'approved', true)`, [ASAD]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.pros SET online = true`);
await setup(`INSERT INTO public.staff (id, name, role, active) VALUES ($1, 'Clerk', 'office', true)`, [CLERK]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
const PEOPLE = [[AYESHA, 'ayesha'], [SARA, 'sara'], [HINA, 'hina'], [NIDA, 'nida'], [ZARA, 'zara'], [MARIAM, 'mariam'], [NEWBIE, 'rabia'],
  [BILAL, 'bilal'], [ASAD, 'asad'], [IMRAN, 'imran'], [FAISAL, 'faisal'], [OWNER_PHONE, 'zohaib']];
for (const [who, name] of PEOPLE) await me(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
await me(OWNER, `SELECT public.admin_set_alert_phone('923009999998')`);

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
  const name = `${who}/file-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (j) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [j])).rows[0];
const trade = async (pro, t) => (await setup(`SELECT * FROM public.pro_trades WHERE pro_id = $1 AND trade = $2`, [pro, t])).rows[0];
const level = async (pro, t) => (await setup(`SELECT public.trade_level($1, $2) AS l`, [pro, t])).rows[0].l;
const trial = async (j) => (await setup(`SELECT * FROM public.trial_jobs WHERE job_id = $1`, [j])).rows[0];
const clock = async () => (await setup(`SELECT public.first_jobs_clock() AS c`)).rows[0].c;
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const typeId = async (t, name) => (await setup(`SELECT id FROM public.job_types WHERE trade = $1 AND name = $2`, [t, name])).rows[0].id;
const SERVICE = await typeId('ac', 'General service (indoor and outdoor unit)');
const GAS = await typeId('ac', 'Gas top-up');
const LEAK = await typeId('ac', 'Water leaking from indoor unit');
const setting = (key, value) => me(OWNER, `SELECT public.admin_set_setting($1, $2)`, [key, value]);

// Homes about a kilometre apart, along a line through F-11.
const HOME = {
  [AYESHA]: [33.6800, 73.0000], [SARA]: [33.6890, 73.0000], [HINA]: [33.6980, 73.0000], [NIDA]: [33.7070, 73.0000],
  [ZARA]: [33.7160, 73.0000], [MARIAM]: [33.7250, 73.0000], [NEWBIE]: [33.7340, 73.0000], [OWNER_PHONE]: [33.7430, 73.0000],
};
let n = 0;
async function post(customer, type = SERVICE, price = 250000, where = HOME[customer]) {
  n += 1;
  const r = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => $1, p_description => $2,
    p_offer_paisa => $3, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_lat => $4, p_lng => $5, p_media => '[]'::jsonb)`,
  [type, `AC number ${n} is not cooling`, price, where?.[0] ?? null, where?.[1] ?? null])).value;
  return r;
}
const offer = (pro, j, price = 250000) => me(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [j, price]);
const offerId = async (pro, j) => (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [j, pro])).rows[0]?.id;
const choose = async (customer, pro, j) => (await me(customer, `SELECT public.choose_offer($1)`, [await offerId(pro, j)])).value;
async function arrive(pro, j) {
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [j]);
  await me(pro, `SELECT public.tech_step($1, 'on_way')`, [j]);
}
const start = async (pro, j) => (await me(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [j, (await job(j)).start_code, JSON.stringify([await upload(pro)])])).value;
const finish = async (pro, j) => (await me(pro, `SELECT public.finish_work($1, $2::jsonb, 0, NULL)`, [j, JSON.stringify([await upload(pro)])])).value;
const ANSWER = `SELECT public.answer_trial($1, $2, $3, $4)`;
const face = (customer, j, yes = true) => me(customer, `SELECT public.customer_face_answer($1, $2)`, [j, yes]);
let settled = 0;
const pay = async (pro) => {
  const due = await owed(pro);
  if (due <= 0) return;
  settled += 1;
  const r = (await me(OWNER, `SELECT public.admin_settle($1, $2, 'jazzcash', 'TX99', $3)`, [pro, due, `firstjobs-${settled}`])).value;
  if (!r?.ok) throw new Error(`settle failed: ${JSON.stringify(r)}`);
};
/** A whole job, start to finish: offered, chosen, the door, the work, her yes. */
async function wholeJob(pro, customer, { type = SERVICE, price = 250000, answers = [true, true, true], where } = {}) {
  const posted = await post(customer, type, price, where);
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  const o = (await offer(pro, posted.id, price)).value;
  if (!o?.ok) throw new Error(`offer failed: ${JSON.stringify(o)}`);
  const c = await choose(customer, pro, posted.id);
  if (!c?.ok) throw new Error(`choose failed: ${JSON.stringify(c)}`);
  await arrive(pro, posted.id);
  if ((await job(posted.id)).face_confirmed_at === null && (await setup(`SELECT 1 FROM public.pro_faces WHERE pro_id = $1`, [pro])).rows.length) {
    await face(customer, posted.id, true);
  }
  const s = await start(pro, posted.id);
  if (!s?.ok) throw new Error(`start failed: ${JSON.stringify(s)}`);
  const f = await finish(pro, posted.id);
  if (!f?.ok) throw new Error(`finish failed: ${JSON.stringify(f)}`);
  if (answers && (await trial(posted.id))) await me(customer, ANSWER, [posted.id, ...answers]);
  const y = (await me(customer, `SELECT public.confirm_work($1)`, [posted.id])).value;
  if (!y?.ok) throw new Error(`confirm failed: ${JSON.stringify(y)}`);
  return posted.id;
}
const APPLY = `SELECT public.apply_as_pro($1, $2::text[], $3, $4::text[], $5)`;

// =============================================================================
heading('A stranger, and people reading what is not theirs');

for (const table of ['pro_trades', 'pro_trade_events', 'pro_faces', 'face_changes', 'identity_service', 'identity_checks', 'quizzes',
  'quiz_questions', 'quiz_attempts', 'trial_jobs', 'safety_reports', 'trade_appeals', 'risk_checks', 'check_items', 'checker_strikes', 'type_asks']) {
  nothing(`a stranger cannot read ${table}`, await as('anon', null, `SELECT * FROM public.${table}`));
  nothing(`nor can a signed-in technician read ${table}`, await as('authenticated', BILAL, `SELECT * FROM public.${table}`));
}
for (const [what, sql] of [
  ['set_my_face', `SELECT public.set_my_face('x')`], ['answer_trial', `SELECT public.answer_trial(gen_random_uuid(), true, true, true)`],
  ['start_quiz', `SELECT public.start_quiz('rules')`], ['my_trades', `SELECT public.my_trades()`],
  ['admin_exceptions', `SELECT public.admin_exceptions()`], ['job_types_closed', `SELECT public.job_types_closed('F-11')`],
  ['identity_result', `SELECT public.identity_result(gen_random_uuid(), 'verified', 'REF-1')`],
]) {
  denied(`a stranger cannot call ${what}`, await as('anon', null, sql));
}
for (const [what, sql] of [
  ['the clock', `SELECT public.first_jobs_clock()`], ['the sort', `SELECT public.sort_legacy()`],
  ['a pause', `SELECT public.pause_trade('${BILAL}', 'ac', 'safety', NULL)`], ['a promotion', `SELECT public.promote_person('${BILAL}')`],
  ['the identity result', `SELECT public.identity_result(gen_random_uuid(), 'verified', 'REF-1')`],
  ['the gate', `SELECT public.pro_gate('${BILAL}', 'ac', NULL, 'F-11', NULL, NULL)`],
]) {
  denied(`a signed-in technician cannot call ${what}`, await as('authenticated', BILAL, sql));
}

// =============================================================================
heading('Approved before D37: works exactly as before, until sorted');

ok('his trades are on record as legacy', (await trade(BILAL, 'ac'))?.status === 'legacy' && (await trade(BILAL, 'ups'))?.status === 'legacy');
ok('everything open to him, risky work and UPS too', (await level(BILAL, 'ac')) === 'full' && (await level(BILAL, 'ups')) === 'full');
ok('his identity counts as seen by Pechkas staff, with the day',
  (await setup(`SELECT public.identity_line($1) AS l`, [BILAL])).rows[0].l?.kind === 'staff');
{
  const g = await post(AYESHA, GAS, 550000);
  ok('a customer can post a gas top-up while somebody can do it', g?.ok === true, JSON.stringify(g));
  ok('he can offer on it', (await offer(BILAL, g.id, 550000)).value?.ok === true);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [g.id]);
}
ok('the oven job is electric only', (await setup(`SELECT count(*)::int AS n FROM public.job_types WHERE name = 'Microwave or electric oven repair'`)).rows[0].n === 1);
ok('panel cleaning is basic, the solar system check risky',
  (await setup(`SELECT bool_and(NOT risky) FILTER (WHERE name LIKE 'Panel cleaning%') AS c, bool_or(risky) FILTER (WHERE name = 'System check and written report') AS s FROM public.job_types WHERE trade = 'solar'`)).rows[0].c === true);

// =============================================================================
heading('A new technician: approved as a person by rule, never by the office');

ok('Imran applies for AC and UPS', (await me(IMRAN, APPLY, ['Imran Khan', ['ac', 'ups'], 5, ['F-11'], null])).value?.ok === true);
ok('Faisal applies for AC', (await me(FAISAL, APPLY, ['Faisal Raza', ['ac'], 3, ['F-11'], null])).value?.ok === true);
await setup(`UPDATE public.pros SET online = true WHERE id IN ($1, $2)`, [IMRAN, FAISAL]);
ok('his trades start on trial', (await trade(IMRAN, 'ac'))?.status === 'trial');
{
  const r = (await me(OWNER, `SELECT public.admin_decide($1, 'approve', null)`, [IMRAN])).value;
  ok('the office cannot approve him: it is the rule', r?.ok === false && r?.field === 'automatic', JSON.stringify(r));
}
ok('the clock does not approve him without his photo', (await clock()).people === 0);
ok('his phone says what is missing', (await me(IMRAN, `SELECT public.my_trades()`)).value?.missing === 'face');
{
  const r = (await me(IMRAN, `SELECT public.set_my_face($1)`, [`${FAISAL}/not-mine.jpg`])).value;
  ok('somebody else\'s file is not his face', r?.ok === false && r?.field === 'face');
}
ok('his photo goes in', (await me(IMRAN, `SELECT public.set_my_face($1)`, [await upload(IMRAN)])).value?.ok === true);
ok('and with the rules quiz still off, he is approved by rule at once',
  (await setup(`SELECT status, approved_how FROM public.pros WHERE id = $1`, [IMRAN])).rows[0]?.approved_how === 'rule');
ok('he is told he can start', to(await sent(), 'imran').some((m) => /start taking jobs/.test(m.title)));
ok('Faisal too', (await me(FAISAL, `SELECT public.set_my_face($1)`, [await upload(FAISAL)])).value?.ok === true);
ok('his AC trade is on trial', (await level(IMRAN, 'ac')) === 'trial');
ok('UPS stays shut until his Electrician risky work is open', (await level(IMRAN, 'ups')) === 'none');
{
  await me(KHALID, `SELECT public.start_as('pro', 'Khalid')`);
  await me(KHALID, `SELECT public.set_my_phone('0333 4444444')`);
  await me(KHALID, APPLY, ['Khalid Mahmood', ['plumber'], 4, ['F-11'], null]);
  await me(KHALID, `SELECT public.set_my_face($1)`, [await upload(KHALID)]);
  ok('a typed number is not a checked one: Khalid waits', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [KHALID])).rows[0]?.status === 'applied');
  ok('and is told why', (await me(KHALID, `SELECT public.my_trades()`)).value?.missing === 'phone');
}
{
  // Approved by hand in the SQL editor: outside the rule, so legacy, like the old way.
  await setup(`INSERT INTO auth.users (id, phone) VALUES ('${P}123456-1234-4123-8123-123456789012', '923001231234')`);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ('${P}123456-1234-4123-8123-123456789012', 'pro', 'Hand')`);
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ('${P}123456-1234-4123-8123-123456789012', 'Hand Approved', '{cctv}', 2, '{F-11}', 'applied')`);
  await setup(`UPDATE public.pros SET status = 'approved' WHERE id = '${P}123456-1234-4123-8123-123456789012'`);
  ok('approving by hand in the SQL editor is on record as by hand',
    (await trade(`${P}123456-1234-4123-8123-123456789012`, 'cctv'))?.status === 'legacy');
}

// =============================================================================
heading('His first jobs: basic kinds, one at a time, under the cap');

{
  const j = await post(AYESHA);
  const r = (await offer(IMRAN, j.id)).value;
  ok('with the price cap not set, no first-job offer can be made', r?.ok === false && r?.field === 'price' && /not set/.test(r?.why ?? ''), JSON.stringify(r));
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
}
ok('the clerk cannot set the cap… actually anybody in the office may set an unlocked setting',
  (await setting('trial_price_cap_paisa', 400000)).value?.ok === true);
{
  const j = await post(AYESHA, SERVICE, 450000);
  const r = (await offer(IMRAN, j.id, 450000)).value;
  ok('above the cap is refused, saying the cap', r?.ok === false && r?.field === 'price' && /4,000/.test(r?.why ?? ''), JSON.stringify(r));
  ok('at the cap is fine', (await offer(IMRAN, j.id, 400000)).value?.ok === true);
  const offers = (await me(AYESHA, `SELECT public.job_offers($1)`, [j.id])).value ?? [];
  const his = offers.find((o) => o.pro_first_name === 'Imran');
  ok('she sees "New on Pechkas" on his offer, his photo, and only "phone number checked"',
    his?.new_on_pechkas === true && typeof his?.photo === 'string' && his?.identity?.kind === 'phone', JSON.stringify(his));
  ok('she may read his photo while his offer waits', (await me(AYESHA, `SELECT public.customer_may_see_file($1)`, [his.photo])).value === true);
  ok('a stranger customer may not', (await me(SARA, `SELECT public.customer_may_see_file($1)`, [his.photo])).value === false);
  await me(AYESHA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
}
{
  const g = await post(SARA, GAS, 550000);
  ok('a risky kind is not in his feed', !((await me(IMRAN, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === g.id));
  const r = (await offer(IMRAN, g.id, 400000)).value;
  ok('and an offer on it is refused, plainly', r?.ok === false && r?.field === 'trial', JSON.stringify(r));
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [g.id]);
  const s = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Something odd', p_offer_paisa => 200000,
    p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 1', p_house => 'House 1', p_lat => 33.69, p_lng => 73.0, p_media => '[]'::jsonb)`)).value;
  ok('so is "Something else"', (await offer(IMRAN, s.id, 200000)).value?.field === 'trial');
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [s.id]);
}
let first;
{
  const a = await post(AYESHA);
  const b = await post(SARA);
  ok('he offers on two basic jobs', (await offer(IMRAN, a.id, 250000)).value?.ok === true && (await offer(IMRAN, b.id, 250000)).value?.ok === true);
  ok('Ayesha chooses him', (await choose(AYESHA, IMRAN, a.id))?.ok === true);
  ok('the job is on record as a first job', (await trial(a.id))?.status === 'open');
  const r = await choose(SARA, IMRAN, b.id);
  ok('Sara cannot also have him: one job at a time', r?.ok === false, JSON.stringify(r));
  const c = await post(HINA);
  ok('nor can he offer on a third', (await offer(IMRAN, c.id, 250000)).value?.why?.includes('one job at a time'));
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [b.id]);
  await me(HINA, `SELECT public.cancel_job($1, NULL)`, [c.id]);
  first = a.id;
}
{
  const r = (await me(IMRAN, `SELECT public.set_my_face($1)`, [await upload(IMRAN)])).value;
  ok('his photo locked when the job was given to him', r?.ok === false && r?.field === 'face', JSON.stringify(r));
}

// =============================================================================
heading('At her door: "Yes, this is the man in the photo"');

ok('she cannot answer before he has arrived', (await face(AYESHA, first, true)).value?.ok === false);
await arrive(IMRAN, first);
{
  const r = await start(IMRAN, first);
  ok('he cannot start before she confirms his photo', r?.ok === false && r?.field === 'face', JSON.stringify(r));
  const mine = ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === first);
  ok('her job asks her, and shows his photo', mine?.face_needed === true && typeof mine?.pro_photo === 'string' && mine?.new_on_pechkas === true);
  ok('Sara cannot answer for Ayesha', (await face(SARA, first, true)).value?.ok === false);
  ok('Ayesha says yes', (await face(AYESHA, first, true)).value?.ok === true);
  ok('now he starts', (await start(IMRAN, first))?.ok === true);
}

// =============================================================================
heading('Her four questions, and what makes a good job');

{
  ok('the questions wait until the work is finished', (await me(AYESHA, ANSWER, [first, true, true, true])).value?.ok === false);
  ok('he finishes', (await finish(IMRAN, first))?.ok === true);
  ok('her job says there are questions', ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === first)?.trial_questions === true);
  ok('three must be answered', (await me(AYESHA, ANSWER, [first, true, null, true])).value?.field === 'answers');
  ok('she answers yes to all three', (await me(AYESHA, ANSWER, [first, true, true, true])).value?.ok === true);
  ok('once', (await me(AYESHA, ANSWER, [first, true, true, true])).value?.ok === false);
  ok('"It works": yes', (await me(AYESHA, `SELECT public.confirm_work($1)`, [first])).value?.ok === true);
  ok('it waits for his commission to be paid', (await trial(first))?.status === 'waiting' && (await clock()) && (await trial(first))?.status === 'waiting');
  await pay(IMRAN);
  await clock();
  ok('paid, it still waits for the owner to set the distance between homes', (await trial(first))?.status === 'waiting');
  ok('the distance is set', (await setting('trial_customer_gap_m', 500)).value?.ok === true);
  await clock();
  ok('now it counts', (await trial(first))?.status === 'good');
}
{
  const second = await wholeJob(IMRAN, SARA);
  await pay(IMRAN);
  await clock();
  ok('a second customer a kilometre away counts', (await trial(second))?.status === 'good');
  const again = await wholeJob(IMRAN, SARA, { where: [33.70, 73.0] });
  await pay(IMRAN);
  await clock();
  ok('the same customer again does not', (await trial(again))?.status === 'not_counted' && (await trial(again))?.why === 'repeat_customer');
  const near = await wholeJob(IMRAN, HINA, { where: [33.6802, 73.0001] });
  await pay(IMRAN);
  await clock();
  ok('a home next door to a counted one does not', (await trial(near))?.why === 'too_close');
  await setup(`UPDATE public.profiles SET created_at = now() WHERE id = $1`, [NEWBIE]);
  const fresh = await wholeJob(IMRAN, NEWBIE);
  await pay(IMRAN);
  await clock();
  ok('an account made after he applied, with no other job, does not', (await trial(fresh))?.why === 'new_account');
  const third = await wholeJob(IMRAN, NIDA);
  await pay(IMRAN);
  await clock();
  ok('a third real customer counts', (await trial(third))?.status === 'good');
  ok('three good jobs, but no verified identity: still on trial limits',
    (await trade(IMRAN, 'ac'))?.status === 'trial' && (await level(IMRAN, 'ac')) === 'trial');
  const mine = (await me(IMRAN, `SELECT public.my_trades()`)).value;
  ok('his phone shows 3 of 3, and why the others did not count',
    mine?.trades?.find((t) => t.trade === 'ac')?.good === 3 && mine?.trades?.find((t) => t.trade === 'ac')?.first_jobs?.some((x) => x.why === 'too_close'));
}
{
  const j = await wholeJob(FAISAL, ZARA);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '3 days' WHERE id = $1`, [j]);
  await setup(`UPDATE public.trial_jobs SET answered_at = NULL, on_time = NULL, explained = NULL, clean = NULL WHERE job_id = $1`, [j]);
  await pay(FAISAL);
  await clock();
  ok('a job she never answered for, two days on, does not count', (await trial(j))?.why === 'no_answers');
}

// =============================================================================
heading('Identity: a service plugged in later, never a card number');

{
  ok('nothing to start while the service is off', (await me(IMRAN, `SELECT public.identity_start()`)).value?.ok === false);
  ok('the clerk cannot switch it on', (await me(CLERK, `SELECT public.admin_identity_service(true, 'Example ID')`)).value?.ok === false);
  ok('the owner can', (await me(OWNER, `SELECT public.admin_identity_service(true, 'Example ID')`)).value?.ok === true);
  const s = (await me(IMRAN, `SELECT public.identity_start()`)).value;
  ok('he starts a check', s?.ok === true && typeof s?.check_id === 'string');
  denied('he cannot write his own result', await as('authenticated', IMRAN, `SELECT public.identity_result($1, 'verified', 'REF-1')`, [s.check_id]));
  const fake = ['61101', '1234567', '1'].join('-');
  const bad = await call('service_role', null, `SELECT public.identity_result($1, 'verified', $2)`, [s.check_id, fake]);
  ok('a card number is never taken as the reference', bad.value?.ok === false && bad.value?.field === 'reference', JSON.stringify(bad));
  const r = await call('service_role', null, `SELECT public.identity_result($1, 'verified', 'EXAMPLE-REF-0042')`, [s.check_id]);
  ok('the service says verified', r.value?.ok === true, JSON.stringify(r));
  ok('and three good jobs with verified identity approve his AC trade', (await trade(IMRAN, 'ac'))?.status === 'approved' && (await level(IMRAN, 'ac')) === 'basic');
  ok('he is told', to(await sent(), 'imran').some((m) => /approved in AC/.test(m.title)));
  const line = (await setup(`SELECT public.identity_line($1) AS l`, [IMRAN])).rows[0].l;
  ok('what may be said of him now: verified, with the day', line?.kind === 'verified' && line?.on);
  ok('staff-seen identity still stands for Bilal: the owner has set no deadline', (await level(BILAL, 'ac')) === 'full');
  await setting('identity_legacy_days', 7);
  await setup(`UPDATE public.identity_service SET live_since = now() - interval '10 days'`);
  ok('past the deadline after the service went live, Bilal drops to trial limits by rule', (await level(BILAL, 'ac')) === 'trial');
  await setup(`UPDATE public.identity_service SET live_since = now()`);
  ok('within it, not', (await level(BILAL, 'ac')) === 'full');
}

// =============================================================================
heading('Pauses by rule, and his appeal');

{
  const a = await wholeJob(FAISAL, AYESHA, { answers: [false, true, true] });
  ok('a "no" on another question: that job does not count', (await trial(a))?.why === 'answers');
  ok('one is not a pause', (await trade(FAISAL, 'ac'))?.status === 'trial');
  const b = await wholeJob(FAISAL, SARA, { answers: [true, true, false] });
  ok('a second job with a "no" pauses his trade', (await trade(FAISAL, 'ac'))?.status === 'paused' && (await trade(FAISAL, 'ac'))?.pause_reason === 'answers');
  ok('he is told', to(await sent(), 'faisal').some((m) => /paused/.test(m.title)));
  const j = await post(HINA);
  ok('paused, he can offer on nothing', (await offer(FAISAL, j.id)).value?.ok === false);
  await me(HINA, `SELECT public.cancel_job($1, NULL)`, [j.id]);
  ok('an appeal needs words', (await me(FAISAL, `SELECT public.pro_appeal('ac', 'no')`)).value?.field === 'words');
  ok('he appeals in writing', (await me(FAISAL, `SELECT public.pro_appeal('ac', 'The second customer was angry about the price, not the work.')`)).value?.ok === true);
  ok('once', (await me(FAISAL, `SELECT public.pro_appeal('ac', 'The second customer was angry about the price, not the work.')`)).value?.ok === false);
  const ex = (await me(OWNER, `SELECT public.admin_exceptions()`)).value;
  const ap = ex?.appeals?.find((x) => x.pro === 'Faisal Raza');
  ok('it reaches the office as a written item, with his first jobs beside it', ap && ap.first_jobs?.length >= 2);
  ok('the office is told on its phone', to(await sent(), 'zohaib').some((m) => /written to Pechkas/.test(m.title)));
  ok('a customer cannot decide it', (await me(AYESHA, `SELECT public.admin_trade_appeal($1, true, 'Lifted after reading.')`, [ap.id])).value?.ok === false);
  ok('the office lifts it, with a note he reads', (await me(CLERK, `SELECT public.admin_trade_appeal($1, true, 'Read both answers; the price was the complaint.')`, [ap.id])).value?.ok === true);
  ok('his trade is back on trial', (await trade(FAISAL, 'ac'))?.status === 'trial');
  void b;
}
{
  // Two "It works: no" during the trial pause the trade.
  for (const [customer, round] of [[NIDA, 1], [ZARA, 2]]) {
    const p = await post(customer);
    await offer(FAISAL, p.id);
    await choose(customer, FAISAL, p.id);
    await arrive(FAISAL, p.id);
    await face(customer, p.id, true);
    await start(FAISAL, p.id);
    await finish(FAISAL, p.id);
    const r = (await me(customer, `SELECT public.not_finished($1, 'not_working', 'Still warm air', NULL)`, [p.id])).value;
    ok(`"It works: no" number ${round} is taken`, r?.ok === true, JSON.stringify(r));
    ok(`that job does not count`, (await trial(p.id))?.why === 'works_no');
    if (round === 1) ok('one does not pause him', (await trade(FAISAL, 'ac'))?.status === 'trial');
    else ok('two pause the trade', (await trade(FAISAL, 'ac'))?.status === 'paused' && (await trade(FAISAL, 'ac'))?.pause_reason === 'works_no');
    ok('the job itself goes on: he fixes it, she confirms', (await finish(FAISAL, p.id))?.ok === true
      && (await me(customer, `SELECT public.confirm_work($1)`, [p.id])).value?.ok === true);
  }
}

// =============================================================================
heading('A safety report, and "not the man in the photo"');

{
  const p = await post(MARIAM);
  await offer(BILAL, p.id);
  const other = await post(OWNER_PHONE);
  await offer(BILAL, other.id);
  await choose(MARIAM, BILAL, p.id);
  ok('a report needs words', (await me(MARIAM, `SELECT public.report_safety($1, 'bad')`, [p.id])).value?.field === 'words');
  ok('nobody else can report her job', (await me(AYESHA, `SELECT public.report_safety($1, 'He left the wires bare near the sink.')`, [p.id])).value?.ok === false);
  ok('Mariam reports it', (await me(MARIAM, `SELECT public.report_safety($1, 'He left the wires bare near the sink.')`, [p.id])).value?.ok === true);
  ok('his AC work is paused at once', (await trade(BILAL, 'ac'))?.status === 'paused' && (await trade(BILAL, 'ac'))?.pause_reason === 'safety');
  ok('his waiting offer elsewhere is withdrawn', (await setup(`SELECT status FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [other.id, BILAL])).rows[0]?.status === 'withdrawn');
  ok('the job he has goes on', (await job(p.id)).status === 'assigned');
  const m = await sent();
  ok('the office is told, by job number only', to(m, 'zohaib').some((x) => /Safety report/.test(x.title)));
  const ex = (await me(CLERK, `SELECT public.admin_exceptions()`)).value;
  const ref = (await job(p.id)).ref;
  const rep = ex?.reports?.find((x) => x.ref === ref);
  ok('the office reads it in Exceptions, with her words and his jobs', rep?.words?.includes('wires') && Array.isArray(rep?.his_jobs));
  ok('he writes his side, once', (await me(BILAL, `SELECT public.pro_safety_reply($1, 'The wires were the old ones, I showed her.')`, [rep.id])).value?.ok === true);
  ok('decided needs a note', (await me(CLERK, `SELECT public.admin_safety_decide($1, 'false', '')`, [rep.id])).value?.field === 'note');
  ok('the office finds it false', (await me(CLERK, `SELECT public.admin_safety_decide($1, 'false', 'Photos show the old wiring, not his work.')`, [rep.id])).value?.ok === true);
  ok('his work is back', (await trade(BILAL, 'ac'))?.status === 'legacy');
  const flags = (await me(OWNER, `SELECT public.admin_flags()`)).value?.people ?? [];
  ok('and she carries a flag for a false report', flags.some((x) => x.id === MARIAM && x.flags.some((f) => f.kind === 'false_reports')));
  await me(MARIAM, `SELECT public.cancel_job($1, NULL)`, [p.id]);
  await me(OWNER_PHONE, `SELECT public.cancel_job($1, NULL)`, [other.id]);
}
{
  await setup(`UPDATE public.pro_trades SET status = 'trial', pause_reason = NULL, paused_from = NULL, paused_at = NULL WHERE pro_id = $1`, [FAISAL]);
  const p = await post(HINA);
  await offer(FAISAL, p.id);
  await choose(HINA, FAISAL, p.id);
  await arrive(FAISAL, p.id);
  const r = (await face(HINA, p.id, false)).value;
  ok('"not the man in the photo" stops the job and gives it back to others', r?.ok === true && (await job(p.id)).status === 'open');
  ok('every trade of his is paused', (await trade(FAISAL, 'ac'))?.status === 'paused' && (await trade(FAISAL, 'ac'))?.pause_reason === 'face');
  ok('he is shut out of that job for good', (await offer(FAISAL, p.id)).value?.ok === false);
  ok('the office is told', to(await sent(), 'zohaib').some((x) => /Not the man in the photo/.test(x.title)));
  const rep = (await me(OWNER, `SELECT public.admin_exceptions()`)).value?.reports?.find((x) => x.kind === 'face');
  ok('upheld, he is suspended', (await me(OWNER, `SELECT public.admin_safety_decide($1, 'upheld', 'Account was used by his cousin; confirmed in writing.')`, [rep.id])).value?.ok === true
    && (await setup(`SELECT status FROM public.pros WHERE id = $1`, [FAISAL])).rows[0].status === 'suspended');
  await me(HINA, `SELECT public.cancel_job($1, NULL)`, [p.id]);
}

// =============================================================================
heading('Photo changes after the lock: the owner\'s exception');

{
  ok('a reason is needed', (await me(IMRAN, `SELECT public.pro_face_change($1, 'new')`, [await upload(IMRAN)])).value?.field === 'reason');
  const path = await upload(IMRAN);
  ok('he asks, with a reason', (await me(IMRAN, `SELECT public.pro_face_change($1, 'My old photo had a beard I have since shaved.')`, [path])).value?.ok === true);
  const c = (await me(OWNER, `SELECT public.admin_exceptions()`)).value?.face_changes?.[0];
  ok('the clerk cannot approve it', (await me(CLERK, `SELECT public.admin_face_change($1, true, 'Looks like him.')`, [c.id])).value?.ok === false);
  ok('the owner can', (await me(OWNER, `SELECT public.admin_face_change($1, true, 'Same man, compared with his jobs.')`, [c.id])).value?.ok === true);
  ok('his photo is the new one, still locked', (await setup(`SELECT path, locked_at FROM public.pro_faces WHERE pro_id = $1`, [IMRAN])).rows[0]?.path === path);
}

// =============================================================================
heading('Sorting the technicians approved before D37, and closed kinds of job');

{
  // Asad: three clean jobs, one a gas top-up. Bilal: one. Customers Bilal and Imran never shared.
  for (const [customer, type, where] of [[MARIAM, SERVICE, [33.80, 73.0]], [MARIAM, LEAK, [33.80, 73.0]], [OWNER_PHONE, GAS, [33.81, 73.0]]]) {
    await wholeJob(ASAD, customer, { type, price: type === GAS ? 550000 : 250000, where });
  }
  // Bilal: three clean jobs, none risky, for customers Asad has never worked for.
  for (const customer of [AYESHA, SARA, HINA]) await wholeJob(BILAL, customer);
  ok('nothing is sorted while the owner\'s numbers are not set', (await clock()).sorted === 0);
  await setting('legacy_basic_jobs', 3);
  await setting('legacy_risky_jobs', 1);
  const c = await clock();
  ok('once both are set, the clock sorts them', c.sorted >= 3, JSON.stringify(c));
  ok('Asad: approved by his record, risky work open', (await trade(ASAD, 'ac'))?.status === 'approved' && (await trade(ASAD, 'ac'))?.risky === 'unlocked');
  ok('Bilal: approved by his record, risky work still locked', (await trade(BILAL, 'ac'))?.status === 'approved' && (await trade(BILAL, 'ac'))?.risky === 'locked');
  ok('Faisal, never approved before D37, is not touched', (await trade(FAISAL, 'ac'))?.status === 'paused');
  ok('and his UPS now follows his Electrician work, which he does not have', (await level(BILAL, 'ups')) === 'none');
  ok('they are told', to(await sent(), 'asad').some((m) => /sorted by your record/.test(m.title)));
  ok('Asad needs his photo now, like everybody', (await level(ASAD, 'ac')) === 'none');
  await me(ASAD, `SELECT public.set_my_face($1)`, [await upload(ASAD)]);
  ok('with it, everything in AC is open to him', (await level(ASAD, 'ac')) === 'full');
}
{
  await setup(`UPDATE public.pro_faces SET path = path WHERE pro_id = $1`, [ASAD]);
  await setup(`UPDATE public.pros SET sectors = '{E-11}' WHERE id = $1`, [ASAD]);
  const closed = (await me(AYESHA, `SELECT public.job_types_closed('F-11')`)).value ?? [];
  ok('with nobody able to do it in F-11, a gas top-up is closed there', closed.some((x) => x.job_type_id === GAS));
  ok('basic work never is', !closed.some((x) => x.job_type_id === SERVICE));
  const r = await post(AYESHA, GAS, 550000);
  ok('posting it is refused, in the owner\'s words', r?.ok === false && r?.field === 'job_type' && r?.why === 'This kind of job is not available on Pechkas yet.');
  ok('"Tell me when it is"', (await me(AYESHA, `SELECT public.tell_me_when('ac', $1, 'F-11')`, [GAS])).value?.ok === true);
  ok('twice is still one', (await me(AYESHA, `SELECT public.tell_me_when('ac', $1, 'F-11')`, [GAS])).value?.ok === true);
  ok('Sara asks too', (await me(SARA, `SELECT public.tell_me_when('ac', $1, 'F-11')`, [GAS])).value?.ok === true);
  ok('an open kind cannot be asked about', (await me(SARA, `SELECT public.tell_me_when('ac', $1, 'F-11')`, [SERVICE])).value?.field === 'open');
  const d = (await me(OWNER, `SELECT public.admin_demand(30)`)).value?.closed_asks ?? [];
  ok('the office sees the count per kind and sector', d.some((x) => x.job_type === 'Gas top-up' && x.sector === 'F-11' && Number(x.people) === 2 && x.open_now === false));
  await setup(`UPDATE public.pros SET sectors = '{F-11}' WHERE id = $1`, [ASAD]);
  await clock();
  ok('when it opens, they are told', to(await sent(), 'ayesha').some((m) => /asked about is open in F-11/.test(m.title)));
}

// =============================================================================
heading('Quizzes: in Urdu, drawn from a pool, never the answers');

{
  const rows = [];
  for (let i = 1; i <= 22; i += 1) rows.push(`('safety:ac', 'q-ac-${i}', 'سوال ${i}', 'Question ${i}', '[{"ur":"ہاں","en":"Yes"},{"ur":"نہیں","en":"No"}]', ${i % 2})`);
  for (let i = 1; i <= 22; i += 1) rows.push(`('rules', 'q-rules-${i}', 'قاعدہ ${i}', 'Rule ${i}', '[{"ur":"ہاں","en":"Yes"},{"ur":"نہیں","en":"No"}]', ${i % 2})`);
  await setup(`INSERT INTO public.quiz_questions (quiz, qkey, ur, en, options, answer) VALUES ${rows.join(',')}`);
  ok('the clerk cannot switch a quiz on', (await me(CLERK, `SELECT public.admin_set_quiz('safety:ac', true, 'A. Engineer, HVAC')`)).value?.ok === false);
  ok('a safety quiz needs the qualified person who checked it', (await me(OWNER, `SELECT public.admin_set_quiz('safety:ac', true, NULL)`)).value?.field === 'checked_by');
  ok('the owner switches it on, naming him', (await me(OWNER, `SELECT public.admin_set_quiz('safety:ac', true, 'Arif Shah, HVAC engineer')`)).value?.ok === true);
  ok('switched on, Imran must pass it before more AC work', (await level(IMRAN, 'ac')) === 'none');
  const noMark = (await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value;
  ok('with no pass mark set, it cannot be taken', noMark?.ok === false && /pass mark/.test(noMark?.why ?? ''));
  await setting('quiz_pass_bps', 8000);
  const q = (await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value;
  ok('ten questions drawn, in Urdu with the English, no answers', q?.ok === true && q.questions.length === 10 && q.questions[0].ur && !('answer' in q.questions[0]));
  ok('the same attempt comes back if he reopens it', (await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value?.attempt === q.attempt);
  const keys = (await setup(`SELECT id, answer FROM public.quiz_questions WHERE id = ANY ($1::int[])`, [q.questions.map((x) => x.id)])).rows;
  const right = q.questions.map((x) => keys.find((k) => k.id === x.id).answer);
  const wrong = right.map((a, i) => (i < 3 ? 1 - a : a));
  const r1 = (await me(IMRAN, `SELECT public.finish_quiz($1, $2::jsonb)`, [q.attempt, JSON.stringify(wrong)])).value;
  ok('7 of 10 fails an 80% mark', r1?.ok === true && r1.passed === false && r1.correct === 7);
  const again = (await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value;
  ok('with no retake wait set, it cannot be retaken yet', again?.ok === false && again?.field === 'retake');
  await setting('quiz_retake_days', 3);
  ok('with one, it says from when', /You can take it again from/.test((await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value?.why ?? ''));
  await setup(`UPDATE public.quiz_attempts SET finished_at = now() - interval '4 days' WHERE pro_id = $1`, [IMRAN]);
  const q2 = (await me(IMRAN, `SELECT public.start_quiz('safety:ac')`)).value;
  const k2 = (await setup(`SELECT id, answer FROM public.quiz_questions WHERE id = ANY ($1::int[])`, [q2.questions.map((x) => x.id)])).rows;
  const r2 = (await me(IMRAN, `SELECT public.finish_quiz($1, $2::jsonb)`, [q2.attempt, JSON.stringify(q2.questions.map((x) => k2.find((k) => k.id === x.id).answer))])).value;
  ok('all right passes', r2?.passed === true);
  ok('and his AC work is back', (await level(IMRAN, 'ac')) === 'basic');
  for (const pro of [ASAD]) {
    const qa = (await me(pro, `SELECT public.start_quiz('safety:ac')`)).value;
    const ka = (await setup(`SELECT id, answer FROM public.quiz_questions WHERE id = ANY ($1::int[])`, [qa.questions.map((x) => x.id)])).rows;
    await me(pro, `SELECT public.finish_quiz($1, $2::jsonb)`, [qa.attempt, JSON.stringify(qa.questions.map((x) => ka.find((k) => k.id === x.id).answer))]);
  }
  ok('Asad passes it too', (await level(ASAD, 'ac')) === 'full');
}

// =============================================================================
heading('His first risky job, checked by somebody the app picks');

let checked;
{
  ok('not ready for risky work while the owner\'s numbers are not set', (await setup(`SELECT public.risk_ready($1, 'ac') AS r`, [IMRAN])).rows[0].r === false);
  for (const [k, v] of [['risky_clean_jobs', 3], ['risky_clean_days', 7], ['risky_claim_free_days', 30], ['risky_retry_days', 14],
    ['checker_fee_paisa', 100000], ['checker_answer_minutes', 240], ['checker_accountable_days', 30]]) {
    ok(`${k} is set`, (await setting(k, v)).value?.ok === true);
  }
  ok('a clean record that is too new is not enough', (await setup(`SELECT public.risk_ready($1, 'ac') AS r`, [IMRAN])).rows[0].r === false);
  await setup(`UPDATE public.jobs SET finished_at = finished_at - interval '10 days' WHERE pro_id = $1`, [IMRAN]);
  ok('old enough, it is', (await setup(`SELECT public.risk_ready($1, 'ac') AS r`, [IMRAN])).rows[0].r === true);
  const g = await post(ZARA, GAS, 550000);
  ok('a gas top-up is in his feed now, as a checked job', ((await me(IMRAN, `SELECT public.pro_feed()`)).value?.jobs ?? []).some((x) => x.id === g.id));
  ok('he offers', (await offer(IMRAN, g.id, 550000)).value?.ok === true);
  const his = ((await me(ZARA, `SELECT public.job_offers($1)`, [g.id])).value ?? []).find((o) => o.pro_first_name === 'Imran');
  ok('she sees it would be a checked visit', his?.checked_visit === true && his?.new_on_pechkas === false);
  ok('the office cannot hand it to him: a checked job is her choice', (await me(OWNER, `SELECT public.admin_assign($1, $2, 550000)`, [g.id, IMRAN])).value?.ok === false);
  ok('she chooses him', (await choose(ZARA, IMRAN, g.id))?.ok === true);
  const k = (await setup(`SELECT * FROM public.risk_checks WHERE job_id = $1`, [g.id])).rows[0];
  ok('the app picked Asad to check it', k?.checker_id === ASAD && k?.status === 'asked');
  const m = to(await sent(), 'asad').find((x) => /Can you check a job/.test(x.title));
  ok('Asad is asked, with the fee, and no address', m && /Rs 1,000/.test(m.body) && !/Street|House|markaz/.test(JSON.stringify(m)));
  const before = ((await me(ASAD, `SELECT public.my_checks()`)).value ?? [])[0];
  ok('before he says yes, no address', before && before.street === null && before.house === null);
  await arrive(IMRAN, g.id);
  await face(ZARA, g.id, true);
  ok('Imran cannot start until the checker has said yes', (await start(IMRAN, g.id))?.field === 'checker');
  ok('somebody else cannot answer for Asad', (await me(BILAL, `SELECT public.checker_answer($1, true)`, [k.id])).value?.ok === false);
  ok('Asad says yes', (await me(ASAD, `SELECT public.checker_answer($1, true)`, [k.id])).value?.ok === true);
  const after = ((await me(ASAD, `SELECT public.my_checks()`)).value ?? [])[0];
  ok('now he has the address, while the job is on', after?.street === 'Street 34');
  ok('Imran starts', (await start(IMRAN, g.id))?.ok === true);
  const items = Object.fromEntries((after.items ?? []).map((x) => [x.key, true]));
  ok('a pass with an item missing is refused', (await me(ASAD, `SELECT public.checker_report($1, 'passed', $2::jsonb, $3::jsonb)`, [k.id, JSON.stringify({ 'all:clean': true }), JSON.stringify([await upload(ASAD)])])).value?.field === 'items');
  const owedBefore = await owed(ASAD);
  ok('Asad reports a pass, with a photo', (await me(ASAD, `SELECT public.checker_report($1, 'passed', $2::jsonb, $3::jsonb)`, [k.id, JSON.stringify(items), JSON.stringify([await upload(ASAD)])])).value?.ok === true);
  ok('he is paid Rs 1,000 as a credit against what he owes', owedBefore - (await owed(ASAD)) === 100000);
  ok('Imran\'s risky AC work is open', (await level(IMRAN, 'ac')) === 'full');
  ok('the ledger still balances', Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries`)).rows[0].n) === 0);
  await finish(IMRAN, g.id);
  await me(ZARA, `SELECT public.confirm_work($1)`, [g.id]);
  checked = g.id;
}
{
  // A man he passed turns out bad within 30 days: on the checker's record.
  const claim = (await me(ZARA, `SELECT public.claim_guarantee($1, 'It is warm again after a week.', $2::jsonb)`, [checked, JSON.stringify([await upload(ZARA)])])).value;
  ok('a guarantee claim on the checked job', claim?.ok === true, JSON.stringify(claim));
  const c = (await setup(`SELECT id FROM public.guarantee_claims WHERE job_id = $1`, [checked])).rows[0].id;
  const tomorrow = (await setup(`SELECT (public.pk_day(now()) + 1)::text AS d`)).rows[0].d;
  const ans = (await me(IMRAN, `SELECT public.answer_claim($1, true, $2::date, 10::smallint)`, [c, tomorrow])).value;
  ok('he says he will come: the claim is his', ans?.ok === true, JSON.stringify(ans));
  await clock();
  ok('he took it as his: a strike against the checker', (await setup(`SELECT count(*)::int AS n FROM public.checker_strikes WHERE checker_id = $1`, [ASAD])).rows[0].n === 1);
  const flags = (await me(OWNER, `SELECT public.admin_flags()`)).value?.people ?? [];
  ok('a flag the office sees', flags.some((x) => x.id === ASAD && x.flags.some((f) => f.kind === 'checker_strike')));
  ok('and Asad is not picked again', (await setup(`SELECT public.pick_checker($1, 'ac', 'F-11', NULL, '{}') AS c`, [FAISAL])).rows[0].c === null);
}
{
  // With nobody left to check, a chosen checked job goes back to others.
  await me(BILAL, `SELECT public.set_my_face($1)`, [await upload(BILAL)]);
  await setup(`UPDATE public.jobs SET finished_at = finished_at - interval '10 days' WHERE pro_id = $1`, [BILAL]);
  const qb = (await me(BILAL, `SELECT public.start_quiz('safety:ac')`)).value;
  const kb = (await setup(`SELECT id, answer FROM public.quiz_questions WHERE id = ANY ($1::int[])`, [qb.questions.map((x) => x.id)])).rows;
  await me(BILAL, `SELECT public.finish_quiz($1, $2::jsonb)`, [qb.attempt, JSON.stringify(qb.questions.map((x) => kb.find((k) => k.id === x.id).answer))]);
  await setup(`DELETE FROM public.checker_strikes`);
  const g = await post(NIDA, GAS, 550000);
  ok('Bilal may offer: Asad could check him', (await offer(BILAL, g.id, 550000)).value?.ok === true);
  ok('she chooses Bilal', (await choose(NIDA, BILAL, g.id))?.ok === true);
  const k = (await setup(`SELECT * FROM public.risk_checks WHERE job_id = $1 AND pro_id = $2`, [g.id, BILAL])).rows[0];
  ok('Asad says no', (await me(ASAD, `SELECT public.checker_answer($1, false)`, [k.id])).value?.ok === true);
  ok('with nobody else to ask, her job is open to others again', (await job(g.id)).status === 'open');
  const m = await sent();
  ok('she is told, and owes nothing', to(m, 'nida').some((x) => /open to other technicians again/.test(x.title)));
  ok('he is told it is held against nobody', to(m, 'bilal').some((x) => /could not go ahead/.test(x.title)));
  await me(NIDA, `SELECT public.cancel_job($1, NULL)`, [g.id]);
}

// =============================================================================
heading('Where nobody can check: the owner\'s assessor, arranged by email');

{
  ok('not while somebody in the trade can check', (await me(OWNER, `SELECT public.admin_outside_check($1, 'ac', 'A. Assessor, HVAC', NULL)`, [BILAL])).value?.ok === false);
  ok('never by the clerk', (await me(CLERK, `SELECT public.admin_outside_check($1, 'ac', 'A. Assessor, HVAC', NULL)`, [BILAL])).value?.ok === false);
}

// =============================================================================
heading('Gas cookers and ovens are not taken');

{
  const p = (await me(AYESHA, `SELECT public.post_job(p_trade => 'appliances', p_job_type => NULL, p_description => 'Gas oven will not light', p_offer_paisa => 200000,
    p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 2', p_house => 'House 2', p_lat => 33.68, p_lng => 73.0, p_media => '[]'::jsonb)`)).value;
  if (p?.ok) {
    ok('a customer cannot close it this way', (await me(AYESHA, `SELECT public.admin_close_not_covered($1)`, [p.id])).value?.ok === false);
    ok('the office closes it with that reason', (await me(CLERK, `SELECT public.admin_close_not_covered($1)`, [p.id])).value?.ok === true);
    ok('she reads why', /gas cooker or gas oven/.test((await job(p.id)).cancel_reason));
  } else {
    ok('"Something else" in appliances is closed where nobody can do it', p?.field === 'job_type', JSON.stringify(p));
  }
}

// =============================================================================
heading('What reached phones');

{
  await sent();
  const text = JSON.stringify(all);
  ok('no notification carried a street, a house or a landmark', !/Street 34|House 12|markaz/.test(text));
  ok('nor anybody\'s words', !/wires bare|beard|angry about the price|warm air/.test(text));
}

// =============================================================================
heading('Runs twice');

{
  const sql = await readFile(join(MIGRATIONS, '20261113000000_first_jobs.sql'), 'utf8');
  let error = null;
  try {
    await db.exec(sql);
  } catch (e) {
    error = e.message;
  }
  ok('the migration runs a second time', error === null, error);
  ok('and leaves the sorted trades alone', (await trade(ASAD, 'ac'))?.status === 'approved');
}

report();
