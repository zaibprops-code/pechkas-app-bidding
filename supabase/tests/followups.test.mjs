/**
 * The guarantee, finished (migration guarantee_followups).
 *
 * What must hold: a customer can never raise the price on a repair Pechkas
 * pays for; a replacement nobody offers on is the office's to know about;
 * only the office raises its limit — upwards, in whole rupees, at most three
 * times the first limit, with a reason — and the job is announced again;
 * the original technician is never charged more than his original labour,
 * however high the limit went. His charge is recorded first and added to
 * what he owes only after 7 days without an appeal, or when the office
 * upholds one; a cancelled appeal leaves nothing in the ledger. Crossing the
 * credit limit that way stops his offers. A replacement nobody took sends
 * her back to choose a day, never to "Book again". And it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'a9';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007221111', null, 'customer', 'Ayesha'],
  [SARA, '923007222222', null, 'customer', 'Sara'],
  [BILAL, '923007223333', null, 'pro', 'Bilal'],
  [ASAD, '923007224444', null, 'pro', 'Asad'],
  [OWNER, null, 'owner@example.com', null, null],
  [OWNER_PHONE, '923009999999', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[AYESHA, 'ayesha'], [SARA, 'sara'], [BILAL, 'bilal'], [ASAD, 'asad'], [OWNER_PHONE, 'zohaib']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
}
await me(OWNER, `SELECT public.admin_set_alert_phone('923009999999')`);

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
const upload = async (who, ext = 'jpg') => {
  files += 1;
  const name = `${who}/file-${files}.${ext}`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const canRead = async (who, name) => (await as('authenticated', who, `SELECT name FROM storage.objects WHERE name = $1`, [name])).rows.length === 1;
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const balanced = async () => Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries`)).rows[0].n) === 0;
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);

let n = 0;
/** A job for `pro` at `price`, taken all the way to working. */
async function working(pro, price, customer = AYESHA, jobType = null) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => $3, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`, price, jobType])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  await me(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [posted.id, price]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, pro])).rows[0]?.id;
  if (!offer) throw new Error('no offer');
  await me(customer, `SELECT public.choose_offer($1)`, [offer]);
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await me(pro, `SELECT public.tech_step($1, 'on_way')`, [posted.id]);
  const r = (await me(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [posted.id, (await job(posted.id)).start_code, JSON.stringify([await upload(pro)])])).value;
  if (!r?.ok) throw new Error(`start failed: ${JSON.stringify(r)}`);
  await sent();
  return posted;
}
const FINISH = `SELECT public.finish_work($1, $2::jsonb, $3, $4)`;
const finish = async (pro, id, parts = 0) =>
  (await me(pro, FINISH, [id, JSON.stringify([await upload(pro)]), parts, parts ? await upload(pro) : null])).value;
/** Finished, and checked by the customer. */
async function done(pro, price, customer = AYESHA, parts = 0, jobType = null) {
  const j = await working(pro, price, customer, jobType);
  const r = await finish(pro, j.id, parts);
  if (!r?.ok) throw new Error(`finish failed: ${JSON.stringify(r)}`);
  const c = (await me(customer, `SELECT public.confirm_work($1)`, [j.id])).value;
  if (!c?.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
  await sent();
  return j;
}

const CLAIM = `SELECT public.claim_guarantee($1, $2, $3::jsonb)`;
const ANSWER = `SELECT public.answer_claim($1, $2, $3::date, $4::smallint, $5)`;
const claimOf = async (jobId) => (await setup(`SELECT * FROM public.guarantee_claims WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`, [jobId])).rows[0];
const claims = async (who) => (await me(who, `SELECT public.pro_claims()`)).value ?? [];
const pk = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const plus = async (n) => (await setup(`SELECT ($1::date + $2::int)::text AS d`, [pk.d, n])).rows[0].d;
const tomorrow = await plus(1);
const typeId = async (name) => (await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND name LIKE $1`, [name])).rows[0].id;
const SERVICE = await typeId('General service%');
const INSTALL = await typeId('Split AC installation');
const offerAs = (pro, id, price) => me(pro, `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_eta_minutes => NULL, p_note => NULL, p_arrive_from => 10::smallint)`, [id, price]);
const canOffer = async (pro) => {
  const other = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Another AC job here', p_offer_paisa => 200000,
    p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3',
    p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`, [tomorrow])).value;
  return (await offerAs(pro, other.id, 200000)).value;
};

const reserve = async () => -Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries WHERE account = 'reserve'`)).rows[0].n);
const office = async (claimId) => (await me(OWNER, `SELECT public.admin_guarantee()`)).value?.claims?.find((x) => x.id === claimId);
const RAISE = `SELECT public.admin_raise_cap($1, $2, $3)`;

/** A claim on Bilal's job left unanswered, and the replacement she books for tomorrow. */
async function unanswered(price, parts) {
  const j = await done(BILAL, price, AYESHA, parts, INSTALL);
  const cl = (await me(AYESHA, CLAIM, [j.id, 'Not cooling at all again', JSON.stringify([await upload(AYESHA)])])).value;
  await setup(`UPDATE public.guarantee_claims SET created_at = now() - interval '25 hours', answer_due = now() - interval '1 hour', reminded = 2 WHERE id = $1`, [cl.claim_id]);
  await setup(`SELECT public.claim_clock()`);
  const b = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [cl.claim_id, tomorrow])).value;
  if (!b?.ok) throw new Error(`book failed: ${JSON.stringify(b)}`);
  await sent();
  return { job: j, claim: cl.claim_id, repl: b.job_id };
}
/** Asad takes the replacement at `price` and she confirms it works. */
async function asadFixes(id, price) {
  const r = (await offerAs(ASAD, id, price)).value;
  if (!r?.ok) throw new Error(`offer failed: ${JSON.stringify(r)}`);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [id, ASAD])).rows[0].id;
  await me(AYESHA, `SELECT public.choose_offer($1)`, [offer]);
  await me(ASAD, `SELECT public.tech_step($1, 'chosen')`, [id]);
  await me(ASAD, `SELECT public.tech_step($1, 'on_way')`, [id]);
  await me(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [id, (await job(id)).start_code, JSON.stringify([await upload(ASAD)])]);
  const f = await finish(ASAD, id);
  if (!f?.ok) throw new Error(`finish failed: ${JSON.stringify(f)}`);
  const c = (await me(AYESHA, `SELECT public.confirm_work($1)`, [id])).value;
  if (!c?.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
}

// =============================================================================
heading('A repair Pechkas pays for has no price for her to raise');
const a = await unanswered(550000, 150000); // his labour: Rs 4,000
ok('the replacement starts at his original labour, Rs 4,000', Number((await job(a.repl)).pay_cap_paisa) === 400000);
ok('raise_price refuses it', (await me(AYESHA, `SELECT public.raise_price($1, 20000)`, [a.repl])).value?.field === 'raise');
ok('the price did not move', Number((await job(a.repl)).offered_paisa) === 400000);
ok('her card offers no raise', (await mine(AYESHA, a.repl))?.can_raise === false);
{
  const own = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'An ordinary AC job', p_offer_paisa => 200000,
    p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3',
    p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`, [tomorrow])).value;
  ok('her own jobs still can', (await mine(SARA, own.id))?.can_raise === true);
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [own.id]);
}

heading('Nobody offers: the office is told, not her');
await setup(`UPDATE public.jobs SET announced_at = now() - interval '4 hours' WHERE id = $1`, [a.repl]);
await setup(`SELECT public.nudge_no_offers()`);
let m = await sent();
const replRef = (await job(a.repl)).ref;
ok('the owner\'s phone is told, with the limit', to(m, 'zohaib').some((x) => x.title === `No offers on guarantee repair ${replRef}` && /Rs 4,000/.test(x.body)), JSON.stringify(to(m, 'zohaib')));
ok('she is not asked to raise a price she is not paying', !to(m, 'ayesha').some((x) => /No offers yet/.test(x.title)));
let g = await office(a.claim);
ok('the office page marks it as needing you, with the limit and its ceiling', g?.replacement_waiting === true && g?.needs_you === true && g?.can_raise_cap === true
  && g?.cap_paisa === 400000 && g?.first_cap_paisa === 400000 && g?.max_cap_paisa === 1200000 && g?.replacement_offers === 0, JSON.stringify(g));

heading('The office raises the limit');
ok('a technician cannot', (await me(ASAD, RAISE, [a.claim, 500000, 'Nobody will go for this'])).value?.ok === false);
ok('nor the customer', (await me(AYESHA, RAISE, [a.claim, 500000, 'Please pay more'])).value?.ok === false);
nothing('nor a stranger', await as('anon', null, `SELECT public.admin_raise_cap('${a.claim}', 500000, 'Stranger')`));
ok('only upwards', (await me(OWNER, RAISE, [a.claim, 400000, 'Same again'])).value?.field === 'cap');
ok('in whole rupees', (await me(OWNER, RAISE, [a.claim, 450050, 'Odd paisa'])).value?.field === 'cap');
ok('not past three times the first limit — a typing guard', (await me(OWNER, RAISE, [a.claim, 1200100, 'Big job'])).value?.field === 'cap');
ok('with a reason', (await me(OWNER, RAISE, [a.claim, 500000, ''])).value?.field === 'note');
ok('the office raises it to Rs 5,000', (await me(OWNER, RAISE, [a.claim, 500000, 'Two technicians said Rs 4,000 is too low for this'])).value?.ok === true);
{
  const r = await job(a.repl);
  ok('the job now offers Rs 5,000, and its clock starts again', Number(r.pay_cap_paisa) === 500000 && Number(r.offered_paisa) === 500000 && r.nudged_at === null);
}
m = await sent();
ok('Asad is told it changed', to(m, 'asad').some((x) => /Rs 5,000/.test(x.title)), JSON.stringify(to(m, 'asad')));
ok('Bilal, whose work it is, is not', !to(m, 'bilal').length);
ok('she is not told anything about money', !to(m, 'ayesha').length);
g = await office(a.claim);
ok('the office page keeps who raised it and why', g?.cap_raised_by_name === 'Zohaib' && g?.cap_note?.startsWith('Two technicians') && g?.first_cap_paisa === 400000 && g?.cap_paisa === 500000 && g?.needs_you === false, JSON.stringify(g));
ok('an offer above the new limit is still refused', (await offerAs(ASAD, a.repl, 550000)).value?.field === 'price');

heading('He is never charged more than his original labour');
const bilalBefore = await owed(BILAL);
const asadBefore = await owed(ASAD);
const reserveBefore = await reserve();
await asadFixes(a.repl, 500000);
ok('Pechkas pays Asad the whole Rs 5,000: first off what he owes, the rest owed to him', (await owed(ASAD)) === asadBefore - 500000);
let c = await claimOf(a.job.id);
ok('Bilal\'s charge is Rs 4,000, his labour — the extra Rs 1,000 is Pechkas\' cost', Number(c.charge_paisa) === 400000);
ok('recorded, not yet added', c.charge_txn === null && (await owed(BILAL)) === bilalBefore);
ok('the customer paid nothing', Number((await job(a.repl)).collect_paisa) === 0);
ok('the reserve paid Rs 5,000', (await reserve()) === reserveBefore - 500000);
m = await sent();
ok('he is told the amount and the date', to(m, 'bilal').some((x) => x.title === 'Guarantee repair: Rs 4,000 to be charged' && /unless you appeal/.test(x.body)));
let pc = (await claims(BILAL)).find((x) => x.id === a.claim);
ok('his list shows the charge waiting, and that he may appeal', pc?.charge_paisa === 400000 && pc?.charge_final === false && pc?.can_appeal === true && pc?.charge_due);
await setup(`SELECT public.charge_clock()`);
ok('the clock leaves it alone before its date', (await owed(BILAL)) === bilalBefore);

heading('Seven days without an appeal: it is final');
await setup(`UPDATE public.settings SET value = $1 WHERE key = 'credit_limit_paisa'`, [bilalBefore + 100000]);
await setup(`UPDATE public.guarantee_claims SET charge_due = now() - interval '1 minute' WHERE id = $1`, [a.claim]);
ok('the clock posts one charge', Number((await setup(`SELECT public.charge_clock() AS n`)).rows[0].n) === 1);
ok('Rs 4,000 is added to what he owes', (await owed(BILAL)) === bilalBefore + 400000);
ok('the reserve gets it back', (await reserve()) === reserveBefore - 100000);
ok('the ledger adds up to nothing', await balanced());
await setup(`SELECT public.charge_clock()`);
ok('once', (await owed(BILAL)) === bilalBefore + 400000);
m = await sent();
ok('he is told it is final', to(m, 'bilal').some((x) => x.title === 'Guarantee repair charged: Rs 4,000' && /final/.test(x.body)));
ok('and, past the credit limit, that he owes Pechkas', to(m, 'bilal').some((x) => x.title.startsWith('Balance due to Pechkas')), JSON.stringify(to(m, 'bilal')));
ok('his new offers stop until he pays', (await canOffer(BILAL))?.field === 'owed');
pc = (await claims(BILAL)).find((x) => x.id === a.claim);
ok('his list says final, and no appeal now', pc?.charge_final === true && pc?.can_appeal === false);
ok('an appeal now is refused', (await me(BILAL, `SELECT public.appeal_charge($1, $2)`, [a.claim, 'I did not get the message in time'])).value?.ok === false);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

heading('An appeal the office upholds');
{
  const j = await done(BILAL, 400000, AYESHA, 0, INSTALL);
  const cl = (await me(AYESHA, CLAIM, [j.id, 'Leaking from the pipe again', JSON.stringify([await upload(AYESHA)])])).value;
  await me(BILAL, ANSWER, [cl.claim_id, false, null, null, 'That pipe was never part of my job']);
  ok('the office rules against him', (await me(OWNER, `SELECT public.admin_decide_claim($1, true, 'The leak is from the joint he made.')`, [cl.claim_id])).value?.ok === true);
  const b = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [cl.claim_id, tomorrow])).value;
  await asadFixes(b.job_id, 300000);
  const before = await owed(BILAL);
  ok('his Rs 3,000 charge is recorded', Number((await claimOf(j.id)).charge_paisa) === 300000 && (await owed(BILAL)) === before);
  ok('he appeals before the date', (await me(BILAL, `SELECT public.appeal_charge($1, $2)`, [cl.claim_id, 'The joint was sound when I left, here is my photo'])).value?.ok === true);
  await sent();
  ok('the office upholds it', (await me(OWNER, `SELECT public.admin_decide_appeal($1, false, 'Photos show the same joint leaking.')`, [cl.claim_id])).value?.ok === true);
  ok('and only then is it added', (await owed(BILAL)) === before + 300000 && (await claimOf(j.id)).charge_txn !== null);
  m = await sent();
  ok('he is told the decision and the charge', to(m, 'bilal').some((x) => /appeal/.test(x.title)) && to(m, 'bilal').some((x) => x.title === 'Guarantee repair charged: Rs 3,000'));
  ok('the ledger adds up to nothing', await balanced());
}

heading('A replacement nobody took sends her back to choose a day');
{
  const b = await unanswered(450000, 0);
  ok('the office raises it to Rs 6,000', (await me(OWNER, RAISE, [b.claim, 600000, 'Rare part, nobody nearby'])).value?.ok === true);
  await setup(`UPDATE public.jobs SET when_date = $2::date - 1 WHERE id = $1`, [b.repl, pk.d]);
  await setup(`SELECT public.close_unclaimed()`);
  ok('it closes', (await job(b.repl)).status === 'cancelled');
  m = await sent();
  ok('she is told to choose another day on her claim', to(m, 'ayesha').some((x) => x.title === 'No technician was free for your repair' && /choose another day/.test(x.body)));
  ok('never to "Book again", which would be a job she pays for', !to(m, 'ayesha').some((x) => /Book again/.test(x.body)));
  ok('the office is told', to(m, 'zohaib').some((x) => /closed without a technician/.test(x.title)));
  ok('her claim waits for a day again', (await claimOf(b.job.id)).replacement_job_id === null && (await claimOf(b.job.id)).status === 'replacing');
  const again = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [b.claim, tomorrow])).value;
  ok('she books it again', again?.ok === true, JSON.stringify(again));
  ok('at the limit the office last set, not back at the start', Number((await job(again.job_id)).pay_cap_paisa) === 600000);
  ok('with her photos of the fault', Number((await setup(`SELECT count(*) AS n FROM public.job_media WHERE job_id = $1`, [again.job_id])).rows[0].n) === 1);
  ok('which Asad can still open', await canRead(ASAD, (await setup(`SELECT path FROM public.job_media WHERE job_id = $1`, [again.job_id])).rows[0].path));
}

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92|too low|Rare part|never part|joint/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a number, or anybody\'s reasons', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Run a second time');
{
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261107000000_guarantee_followups.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and the charges are still there', Number((await setup(`SELECT count(*) AS n FROM public.guarantee_claims WHERE charge_txn IS NOT NULL`)).rows[0].n) === 2);
}

report();
