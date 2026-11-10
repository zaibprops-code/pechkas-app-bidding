/**
 * The visit fee (migration visit_fee, the owner's decision D12).
 *
 * What must hold: the fee is shown before she chooses and fixed when she
 * does; a new price needs the start code; only her "no" (or the office's,
 * with a reason) stops a job with a fee; approved or finished, no fee; no
 * commission and no ledger line on a fee she pays him; he says paid or not
 * paid; she may disagree once within 24 hours or say she paid; while unpaid
 * she cannot post; the office keeps, waives, covers, clears and refunds,
 * each with a reason, each once; the office's "not finished" has a fee and
 * a no-fee outcome; a guarantee repair's new price is the office's and its
 * fee is Pechkas'; "she said no at the door" reaches the office after 20
 * minutes; nobody reads the table; messages carry no reasons or addresses;
 * and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'b2';
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

const fee = async (jobId) => (await setup(`SELECT * FROM public.visit_fees WHERE job_id = $1`, [jobId])).rows[0];
const ledgerFor = async (key) => Number((await setup(`SELECT count(*) AS n FROM public.ledger_txns WHERE idempotency_key = $1`, [key])).rows[0].n);
const ASK = `SELECT public.ask_change($1, $2, $3, $4)`;
const DECIDE = `SELECT public.decide_change($1, $2)`;
const changeOf = async (jobId) => (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1 AND status = 'pending'`, [jobId])).rows[0]?.id;
/** Working, then a new price of `price`, which she declines: the job stops with a fee. */
async function declined(pro = BILAL, customer = AYESHA, price = 550000) {
  const j = await working(pro, 300000, customer);
  const a = (await me(pro, ASK, [j.id, price, 'Compressor needs replacing', await upload(pro)])).value;
  if (!a?.ok) throw new Error(`ask failed: ${JSON.stringify(a)}`);
  const d = (await me(customer, DECIDE, [await changeOf(j.id), false])).value;
  if (!d?.ok) throw new Error(`decline failed: ${JSON.stringify(d)}`);
  await sent();
  return j;
}
const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Another AC job here', p_offer_paisa => 200000,
    p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3',
    p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`;
const canPost = async (who) => {
  const r = await me(who, POST, [tomorrow]);
  if (r.value?.ok) await me(who, `SELECT public.cancel_job($1, NULL)`, [r.value.id]);
  return r;
};
const VF = `SELECT public.admin_visit_fee($1, $2, $3)`;

// =============================================================================
heading('Shown before she chooses, fixed when she does');
{
  const posted = (await me(SARA, POST, [tomorrow])).value;
  ok('her open job shows the visit fee: Rs 300', (await mine(SARA, posted.id))?.visit_fee_paisa === 30000);
  const feed = (await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs?.find((x) => x.id === posted.id);
  ok('a technician sees it before he offers', feed?.visit_fee_paisa === 30000);
  await offerAs(ASAD, posted.id, 200000);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, ASAD])).rows[0].id;
  await me(SARA, `SELECT public.choose_offer($1)`, [offer]);
  ok('choosing fixes it on the job', Number((await job(posted.id)).visit_fee_paisa) === 30000);
  ok('the office changes the fee to Rs 400', (await me(OWNER, `SELECT public.admin_set_setting('visit_fee_min_paisa', 40000)`)).value?.ok === true);
  ok('the job she already chose keeps Rs 300', (await mine(SARA, posted.id))?.visit_fee_paisa === 30000);
  const other = (await me(SARA, POST, [tomorrow])).value;
  ok('a new job shows Rs 400', (await mine(SARA, other.id))?.visit_fee_paisa === 40000);
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [other.id]);
  await me(OWNER, `SELECT public.admin_set_setting('visit_fee_min_paisa', 30000)`);
  const hist = (await me(OWNER, `SELECT public.admin_visit_fees()`)).value?.setting_history ?? [];
  ok('the office sees who changed it, from what, to what', hist.length >= 2 && hist.some((h) => Number(h.from) === 30000 && Number(h.to) === 40000 && h.by));
  await me(SARA, `SELECT public.cancel_job($1, NULL)`, [posted.id]);
}

heading('A new price needs the start code');
{
  n += 1;
  const posted = (await me(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`, [`AC number ${n} is not cooling`])).value;
  await me(BILAL, `SELECT public.make_offer($1, $2, 20, NULL)`, [posted.id, 300000]);
  await me(AYESHA, `SELECT public.choose_offer($1)`, [(await setup(`SELECT id FROM public.offers WHERE job_id = $1`, [posted.id])).rows[0].id]);
  await me(BILAL, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await me(BILAL, `SELECT public.tech_step($1, 'on_way')`, [posted.id]);
  const early = (await me(BILAL, ASK, [posted.id, 500000, 'Compressor is dead', await upload(BILAL)])).value;
  ok('"Arrived", which he taps himself, is not enough', early?.ok === false && early?.field === 'stage' && /start code/.test(early?.why), JSON.stringify(early));
  ok('his job says he cannot ask yet', (await proJob(BILAL, posted.id))?.can_ask_change === false);
  await me(BILAL, `SELECT public.start_work($1, $2, $3::jsonb)`, [posted.id, (await job(posted.id)).start_code, JSON.stringify([await upload(BILAL)])]);
  ok('once she has given him the code, he can', (await proJob(BILAL, posted.id))?.can_ask_change === true
    && (await me(BILAL, ASK, [posted.id, 500000, 'Compressor is dead', await upload(BILAL)])).value?.ok === true);
  const card = (await mine(AYESHA, posted.id))?.change;
  ok('her card shows his reason and photo beside the answer, and that she answers it', card?.reason === 'Compressor is dead' && card?.photo && card?.office_decides === false);
  ok('she approves', (await me(AYESHA, DECIDE, [card.id, true])).value?.ok === true);
  ok('no visit fee when the repair goes ahead', (await fee(posted.id)) === undefined);
  await finish(BILAL, posted.id);
  await me(AYESHA, `SELECT public.confirm_work($1)`, [posted.id]);
  ok('finished: still no visit fee, and the normal commission', (await fee(posted.id)) === undefined && Number((await job(posted.id)).commission_paisa) > 0);
}

heading('She says no: the fee is owed, and only that');
const bilalBefore = await owed(BILAL);
const ledgerBefore = Number((await setup(`SELECT count(*) AS n FROM public.ledger_txns`)).rows[0].n);
const d1 = await declined();
let f = await fee(d1.id);
let row = await job(d1.id);
ok('the job stops because she declined', row.status === 'stopped' && row.stop_reason === 'declined' && Number(row.collect_paisa) === 30000);
ok('one record: Rs 300, owed by her to him, with the declined price as its proof', f?.status === 'due' && f?.payer === 'customer'
  && Number(f?.amount_paisa) === 30000 && f?.pro_id === BILAL && f?.change_id);
ok('no commission on it', !(Number(row.commission_paisa) > 0));
ok('nothing in the ledger: Pechkas neither earns nor owes', Number((await setup(`SELECT count(*) AS n FROM public.ledger_txns`)).rows[0].n) === ledgerBefore && (await owed(BILAL)) === bilalBefore);
ok('not a market price', Number((await setup(`SELECT count(*) AS n FROM public.price_record WHERE job_id = $1`, [d1.id])).rows[0].n) === 0);
{
  const ch = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1`, [d1.id])).rows[0].id;
  ok('declining twice changes nothing', (await me(AYESHA, DECIDE, [ch, false])).value?.ok === false);
  ok('nor can she approve it afterwards', (await me(AYESHA, DECIDE, [ch, true])).value?.ok === false);
  ok('still one record', Number((await setup(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [d1.id])).rows[0].n) === 1);
}
ok('her card says what she owes and that she may disagree', (await mine(AYESHA, d1.id))?.visit_fee?.status === 'due' && (await mine(AYESHA, d1.id))?.visit_fee?.can_disagree === true);

heading('He says paid');
ok('another technician cannot', (await me(ASAD, `SELECT public.pro_visit_fee($1, true)`, [d1.id])).value?.ok === false);
ok('nor can she mark it paid herself', (await me(AYESHA, `SELECT public.pro_visit_fee($1, true)`, [d1.id])).value?.ok === false);
ok('Bilal says he was paid', (await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d1.id])).value?.ok === true);
ok('twice changes nothing', (await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d1.id])).value?.already === true);
ok('and "not paid" after "paid" goes to the office instead', (await me(BILAL, `SELECT public.pro_visit_fee($1, false)`, [d1.id])).value?.ok === false);
ok('the record says paid', (await fee(d1.id)).status === 'paid');

heading('She disagrees');
ok('a reason is needed', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', '')`, [d1.id])).value?.field === 'text');
ok('Sara cannot, on Ayesha\'s job', (await me(SARA, `SELECT public.customer_visit_fee($1, 'disagree', 'He never looked')`, [d1.id])).value?.ok === false);
ok('Ayesha disagrees, with a reason', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', 'He did not open the unit at all')`, [d1.id])).value?.ok === true);
let m = await sent();
ok('the office is told, and Bilal that it is with the office', to(m, 'zohaib').some((x) => x.title === `Visit fee questioned: ${d1.ref}`) && to(m, 'bilal').some((x) => x.title === `The visit fee on ${d1.ref} is with the office`));
ok('once', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', 'Again, he did not look')`, [d1.id])).value?.ok === false);
ok('Bilal cannot settle it himself now', (await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d1.id])).value?.ok === false);
ok('the office must give a reason', (await me(OWNER, VF, [(await fee(d1.id)).id, 'keep', ''])).value?.field === 'note');
ok('a customer cannot decide', (await me(AYESHA, VF, [(await fee(d1.id)).id, 'waive', 'I say so myself'])).value?.ok === false);
ok('the office keeps it', (await me(OWNER, VF, [(await fee(d1.id)).id, 'keep', 'Photo shows the unit opened and the compressor tested'])).value?.ok === true);
ok('it is back to paid, as it was', (await fee(d1.id)).status === 'paid');
ok('she is told', to(await sent(), 'ayesha').some((x) => x.title === `The visit fee on ${d1.ref} stands`));
await setup(`UPDATE public.visit_fees SET created_at = now() - interval '25 hours', customer_said_at = NULL WHERE job_id = $1`, [d1.id]);
ok('after 24 hours the app no longer takes a disagreement', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', 'Thinking again, unfair')`, [d1.id])).value?.ok === false);

heading('He says not paid: she cannot post until it is settled');
const d2 = await declined();
ok('Bilal says he was not paid', (await me(BILAL, `SELECT public.pro_visit_fee($1, false)`, [d2.id])).value?.ok === true);
m = await sent();
ok('she is told, and the office', to(m, 'ayesha').some((x) => x.title === `Visit fee unpaid: ${d2.ref}`) && to(m, 'zohaib').some((x) => x.title === `Visit fee unpaid: ${d2.ref}`));
{
  const r = await canPost(AYESHA);
  ok('she cannot post a new job, and is told which fee and what to do', r.value?.ok !== true && new RegExp(d2.ref).test(r.error ?? ''), JSON.stringify(r).slice(0, 300));
}
ok('her card says so', (await mine(AYESHA, d2.id))?.visit_fee?.blocks_posting === true && (await mine(AYESHA, d2.id))?.visit_fee?.can_say_paid === true);
ok('she says she paid him', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'paid', 'Gave cash at the gate')`, [d2.id])).value?.ok === true);
ok('while the office looks, she may post', (await canPost(AYESHA)).value?.ok === true);
ok('Bilal finds the cash and confirms', (await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d2.id])).value?.ok === true && (await fee(d2.id)).status === 'paid');

heading('Unpaid, and Pechkas pays him');
const d3 = await declined();
await me(BILAL, `SELECT public.pro_visit_fee($1, false)`, [d3.id]);
const f3 = await fee(d3.id);
ok('the office sees it needs it, and how often she has not paid before', (await me(OWNER, `SELECT public.admin_visit_fees()`)).value?.fees?.find((x) => x.id === f3.id)?.needs_you === true);
const beforeCover = await owed(BILAL);
ok('Asad cannot pay himself', (await me(ASAD, VF, [f3.id, 'cover', 'Pay it please'])).value?.ok === false);
ok('the office pays him from the reserve', (await me(OWNER, VF, [f3.id, 'cover', 'Customer not answering; Bilal should not lose out'])).value?.ok === true);
ok('Rs 300 off what he owes, once', (await owed(BILAL)) === beforeCover - 30000 && (await ledgerFor(`visit_fee_cover:${f3.id}`)) === 1);
ok('a second press pays nothing more', (await me(OWNER, VF, [f3.id, 'cover', 'Pressed again'])).value?.ok === false && (await owed(BILAL)) === beforeCover - 30000);
ok('the ledger adds up to nothing', await balanced());
ok('he is told', to(await sent(), 'bilal').some((x) => x.title === `Pechkas paid your visit fee: ${d3.ref}`));
ok('she still cannot post: she owes Pechkas now', (await canPost(AYESHA)).value?.ok !== true);
ok('the office clears her, with a reason', (await me(OWNER, VF, [f3.id, 'clear', 'She paid Rs 300 to the office by JazzCash, TX 4471'])).value?.ok === true);
ok('and she may post again', (await canPost(AYESHA)).value?.ok === true);

heading('Waived');
const d4 = await declined();
ok('the office waives it', (await me(OWNER, VF, [(await fee(d4.id)).id, 'waive', 'He arrived two hours late; no fee'])).value?.ok === true);
ok('nothing is owed, and nothing to give back', (await fee(d4.id)).status === 'waived' && (await fee(d4.id)).refund === null);
ok('she reads why on her job', (await mine(AYESHA, d4.id))?.visit_fee?.office_note === 'He arrived two hours late; no fee');
m = await sent();
ok('both are told', to(m, 'ayesha').some((x) => x.title === `No visit fee for job ${d4.ref}`) && to(m, 'bilal').some((x) => x.title === `The visit fee on ${d4.ref} was waived`));
ok('a waived fee cannot be waived again', (await me(OWNER, VF, [(await fee(d4.id)).id, 'waive', 'Again'])).value?.ok === false);

const d5 = await declined();
await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d5.id]);
ok('a fee already paid is waived', (await me(OWNER, VF, [(await fee(d5.id)).id, 'waive', 'He broke the fan cover while looking'])).value?.ok === true);
ok('so the money is owed back to her', (await fee(d5.id)).refund === 'owed');
ok('he is told to give it back', to(await sent(), 'bilal').some((x) => x.title === `Give back the visit fee on ${d5.ref}`));
const beforeRefund = await owed(BILAL);
ok('he will not, so Pechkas pays her and charges him', (await me(OWNER, VF, [(await fee(d5.id)).id, 'refund_charge', 'He refused; office paid her Rs 300 cash'])).value?.ok === true);
ok('Rs 300 added to what he owes, once', (await owed(BILAL)) === beforeRefund + 30000 && (await ledgerFor(`visit_fee_refund:${(await fee(d5.id)).id}`)) === 1);
ok('a second press charges nothing more', (await me(OWNER, VF, [(await fee(d5.id)).id, 'refund_charge', 'Again'])).value?.ok === false && (await owed(BILAL)) === beforeRefund + 30000);
ok('the ledger adds up to nothing', await balanced());
const d6 = await declined();
await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [d6.id]);
await me(OWNER, VF, [(await fee(d6.id)).id, 'waive', 'Customer was right, he did not inspect']);
ok('or he gives it back himself, and the office records it', (await me(OWNER, VF, [(await fee(d6.id)).id, 'refund_returned', 'Bilal returned the cash, customer confirmed by phone'])).value?.ok === true
  && (await fee(d6.id)).refund === 'returned' && (await ledgerFor(`visit_fee_refund:${(await fee(d6.id)).id}`)) === 0);

heading('The office decides "not finished": fee or no fee');
async function disputed() {
  const j = await working(BILAL, 300000);
  await finish(BILAL, j.id);
  await me(AYESHA, `SELECT public.not_finished($1, $2, $3, $4)`, [j.id, 'not_working', 'Still warm air', null]);
  await finish(BILAL, j.id);
  await me(AYESHA, `SELECT public.not_finished($1, $2, $3, $4)`, [j.id, 'not_working', 'Still warm air', null]);
  await sent();
  return j;
}
{
  const j = await disputed();
  ok('the job is with the office', (await job(j.id)).stage === 'disputed');
  ok('not finished, his fault: no fee', (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'stopped_no_fee', 'His gas top-up was not done; no fee')`, [j.id])).value?.ok === true);
  const r = await job(j.id);
  ok('stopped, nothing to pay, recorded as waived with the office\'s reason', r.status === 'stopped' && Number(r.collect_paisa) === 0 && r.stop_reason === 'office_no_fee'
    && (await fee(j.id))?.status === 'waived' && (await fee(j.id))?.office_note?.startsWith('His gas'));
  const k = await disputed();
  ok('not finished, not his fault: the fee is owed', (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'stopped', 'Part not available in Islamabad this week')`, [k.id])).value?.ok === true);
  ok('Rs 300 owed by her', (await fee(k.id))?.status === 'due' && Number((await job(k.id)).collect_paisa) === 30000 && (await job(k.id)).stop_reason === 'office_fee');
}

heading('"She said no at the door"');
{
  const j = await working(BILAL, 300000);
  await me(BILAL, ASK, [j.id, 600000, 'Fan motor burnt', await upload(BILAL)]);
  await sent();
  ok('he cannot stop the job himself', (await job(j.id)).status === 'assigned');
  ok('he reports it', (await me(BILAL, `SELECT public.pro_reports_no($1)`, [j.id])).value?.ok === true);
  ok('twice is once', (await me(BILAL, `SELECT public.pro_reports_no($1)`, [j.id])).value?.already === true);
  ok('she is asked to answer in the app', to(await sent(), 'ayesha').some((x) => x.title === 'Bilal is waiting for your answer' && /Rs 300/.test(x.body)));
  await setup(`SELECT public.visit_fee_clock()`);
  ok('nothing to the office before 20 minutes', to(await sent(), 'zohaib').length === 0);
  await setup(`UPDATE public.job_changes SET pro_says_no_at = now() - interval '21 minutes' WHERE job_id = $1`, [j.id]);
  await setup(`SELECT public.visit_fee_clock()`);
  ok('after 20 minutes the office is told', to(await sent(), 'zohaib').some((x) => x.title === `No answer to a new price: ${j.ref}`));
  await setup(`SELECT public.visit_fee_clock()`);
  ok('once', to(await sent(), 'zohaib').length === 0);
  const ch = (await me(OWNER, `SELECT public.admin_visit_fees()`)).value?.changes?.find((x) => x.job_id === j.id);
  ok('it waits on the office page, with his reason and photo', ch?.reason === 'Fan motor burnt' && ch?.photo && ch?.pro_says_no_at);
  ok('the office needs a reason', (await me(OWNER, `SELECT public.admin_decide_change($1, false, '')`, [ch.id])).value?.field === 'note');
  ok('the office records her "no", after ringing her', (await me(OWNER, `SELECT public.admin_decide_change($1, false, 'Rang Ayesha: she does not want the motor replaced')`, [ch.id])).value?.ok === true);
  ok('stopped, with the fee owed by her and the office\'s reason kept', (await job(j.id)).stop_reason === 'office_declined' && (await fee(j.id))?.status === 'due' && (await fee(j.id))?.office_note?.startsWith('Rang Ayesha'));
}

heading('A guarantee repair: the office answers, Pechkas pays');
{
  const orig = await done(BILAL, 550000, AYESHA, 150000, INSTALL);
  const cl = (await me(AYESHA, CLAIM, [orig.id, 'Not cooling at all again', JSON.stringify([await upload(AYESHA)])])).value;
  await setup(`UPDATE public.guarantee_claims SET created_at = now() - interval '25 hours', answer_due = now() - interval '1 hour', reminded = 2 WHERE id = $1`, [cl.claim_id]);
  await setup(`SELECT public.claim_clock()`);
  const b = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [cl.claim_id, tomorrow])).value;
  await offerAs(ASAD, b.job_id, 300000);
  await me(AYESHA, `SELECT public.choose_offer($1)`, [(await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [b.job_id, ASAD])).rows[0].id]);
  await me(ASAD, `SELECT public.tech_step($1, 'chosen')`, [b.job_id]);
  await me(ASAD, `SELECT public.tech_step($1, 'on_way')`, [b.job_id]);
  await me(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [b.job_id, (await job(b.job_id)).start_code, JSON.stringify([await upload(ASAD)])]);
  await sent();
  ok('Asad asks a new price', (await me(ASAD, ASK, [b.job_id, 450000, 'Indoor board burnt as well', await upload(ASAD)])).value?.ok === true);
  m = await sent();
  const bref = (await job(b.job_id)).ref;
  ok('the office is asked, and she is told Pechkas will answer', to(m, 'zohaib').some((x) => x.title === `New price to decide: ${bref}`)
    && to(m, 'ayesha').some((x) => /Pechkas will answer the new price/.test(x.title)));
  ok('she cannot approve Pechkas\' money herself', (await me(AYESHA, DECIDE, [await changeOf(b.job_id), true])).value?.ok === false && (await job(b.job_id)).agreed_paisa == 300000);
  ok('her card says the office decides', (await mine(AYESHA, b.job_id))?.change?.office_decides === true);
  const before = await owed(ASAD);
  ok('the office declines it, with a reason', (await me(OWNER, `SELECT public.admin_decide_change($1, false, 'Board is a separate fault, not covered')`, [await changeOf(b.job_id)])).value?.ok === true);
  const rj = await job(b.job_id);
  ok('stopped; she pays nothing', rj.status === 'stopped' && Number(rj.collect_paisa) === 0);
  const rf = await fee(b.job_id);
  ok('Pechkas pays Asad the visit fee, once, and the record points at that payment', rf?.payer === 'pechkas' && rf?.status === 'covered' && rf?.covered_txn
    && (await owed(ASAD)) === before - 30000 && (await ledgerFor(`guarantee_pay:${b.job_id}`)) === 1);
  ok('Asad is told Pechkas pays it', to(await sent(), 'asad').some((x) => /Pechkas pays your visit fee of Rs 300/.test(x.body)));
  ok('she cannot disagree with a fee she does not pay', (await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', 'Not fair at all')`, [b.job_id])).value?.ok === false);
  ok('the ledger adds up to nothing', await balanced());
}

heading('The office page');
{
  const page = (await me(OWNER, `SELECT public.admin_visit_fees()`)).value;
  const e = page?.earnings?.find((x) => x.pro_id === BILAL);
  ok('each technician\'s visit fee earnings', e && Number(e.paid_paisa) >= 60000 && Number(e.covered_paisa) >= 30000, JSON.stringify(e));
  const one = page?.fees?.find((x) => x.job_id === d5.id);
  ok('every fee with who pays, why, its proof and its history', one?.payer === 'customer' && one?.reason === 'declined' && one?.change?.reason === 'Compressor needs replacing'
    && one?.history?.some((h) => h.what === 'visit_fee_waive') && one?.history?.some((h) => h.what === 'visit_fee_refund_charge'));
  ok('a customer reads nothing from it', (await me(AYESHA, `SELECT public.admin_visit_fees()`)).value == null);
  nothing('nor a stranger', await as('anon', null, `SELECT public.admin_visit_fees()`));
  const mineFees = (await me(BILAL, `SELECT public.pro_visit_fees()`)).value;
  ok('Bilal sees his own fees and what each is waiting for', mineFees?.fees?.length >= 6 && mineFees.fees.every((x) => x.customer_text === undefined) && Number(mineFees.paid_paisa) > 0);
  ok('Asad sees only his', ((await me(ASAD, `SELECT public.pro_visit_fees()`)).value?.fees ?? []).every((x) => x.job_id !== d1.id));
}

heading('Nobody reads the table');
denied('a signed-in person cannot read visit fees', await as('authenticated', AYESHA, `SELECT * FROM public.visit_fees`));
nothing('a stranger cannot mark a fee paid', await as('anon', null, `SELECT public.pro_visit_fee('${d1.id}', true)`));
denied('nor change a fee directly', await as('authenticated', BILAL, `UPDATE public.visit_fees SET status = 'paid' WHERE job_id = '${d2.id}'`));

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92|did not open|two hours late|broke the fan|TX 4471|Rang Ayesha|not available/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a number, or anybody\'s reasons', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Run a second time');
{
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261110000000_visit_fee.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and the fees are still there', Number((await setup(`SELECT count(*) AS n FROM public.visit_fees`)).rows[0].n) >= 9);
}

report();
