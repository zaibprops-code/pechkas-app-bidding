/**
 * A customer who does not pay the technician (migration payment_disputes, the
 * owner's decision D35).
 *
 * What must hold: within 7 days of a job counting as done — a job the
 * customer pays for — he may report Not paid or Paid less, once; his
 * commission is held at once (reversed line for line, reserve included), so
 * it counts towards nothing: not the Rs 3,000 limit, not D36's dates, no
 * reminders, no stopped offers. She is asked neutrally and answers once:
 * "That's right" (she owes the rest and cannot post new jobs) or "I have
 * paid" (to the office, not blocked); silence goes to the office after 3 days
 * and blocks nobody. Commission is only ever released on the LABOUR he
 * received (parts first), at the job's own rate, in differences, so any
 * order of part-payments ends exactly where one posting would have; each
 * release is a new D36 fee. He corrects his amount only until she answers;
 * after that only the office, with a reason. Now paid, an office payment,
 * closing or clearing lift her block. The guarantee is never cancelled or
 * shortened, but while a case is open her claim is the office's and he is not
 * charged automatically. Flags only. Notifications carry no address, no
 * amount she disputes and nobody's words; nobody reads the table; it runs
 * twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'f1';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const HINA = `${P}777777-7777-4777-8777-777777777777`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const KAMRAN = `${P}555555-5555-4555-8555-555555555555`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007331111', null, 'customer', 'Ayesha'],
  [SARA, '923007332222', null, 'customer', 'Sara'],
  [HINA, '923007337777', null, 'customer', 'Hina'],
  [BILAL, '923007333333', null, 'pro', 'Bilal'],
  [ASAD, '923007334444', null, 'pro', 'Asad'],
  [KAMRAN, '923007335555', null, 'pro', 'Kamran'],
  [OWNER, null, 'owner@example.com', null, null],
  [OWNER_PHONE, '923009999999', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood'], [KAMRAN, 'Kamran Ali']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[AYESHA, 'ayesha'], [SARA, 'sara'], [HINA, 'hina'], [BILAL, 'bilal'], [ASAD, 'asad'], [KAMRAN, 'kamran'], [OWNER_PHONE, 'zohaib']]) {
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
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const balanced = async () => Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries`)).rows[0].n) === 0;
const account = async (acct) => -Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries WHERE account = $1`, [acct])).rows[0].n);
/** What is posted for one job on one account, over every transaction (the original, the hold, each release). */
const onJob = async (id, acct) => Number((await setup(`SELECT coalesce(sum(e.amount_paisa), 0) AS n FROM public.ledger_entries e
  JOIN public.ledger_txns t ON t.id = e.txn_id WHERE t.job_id = $1 AND e.account = $2`, [id, acct])).rows[0].n);
const caseOf = async (id) => (await setup(`SELECT * FROM public.payment_cases WHERE job_id = $1`, [id])).rows[0];
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proList = async (who) => (await me(who, `SELECT public.pro_payment_jobs()`)).value ?? [];
const fees = async (pro) => (await setup(`SELECT * FROM public.pay_fees($1) ORDER BY posted_at, txn`, [pro])).rows;
const blocked = async (pro) => (await setup(`SELECT public.pay_blocked($1) AS b`, [pro])).rows[0].b;
const today = (await setup(`SELECT public.pk_day(now())::text AS d`)).rows[0].d;
const day = async (n) => (await setup(`SELECT (public.pk_day(now()) + $1::int)::text AS d`, [n])).rows[0].d;
const D = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));
const pk = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d`)).rows[0];
const tomorrow = (await setup(`SELECT ($1::date + 1)::text AS d`, [pk.d])).rows[0].d;

/** D36's accounting rules, which must still hold after everything here. */
async function sound(pro) {
  const r = (await setup(`
    WITH i AS (SELECT * FROM public.pay_items($1)),
    a AS (SELECT credit_txn, debit_txn, sum(amount_paisa) AS n FROM public.pay_allocations WHERE pro_id = $1 GROUP BY 1, 2),
    d AS (SELECT i.*, coalesce((SELECT sum(n) FROM a WHERE a.debit_txn = i.txn), 0) AS paid_in,
                      coalesce((SELECT sum(n) FROM a WHERE a.credit_txn = i.txn), 0) AS paid_out FROM i)
    SELECT
      (SELECT coalesce(sum(CASE WHEN side <> 'credit' AND live THEN amount - paid_in ELSE 0 END), 0)
            - coalesce(sum(CASE WHEN side = 'credit' AND live THEN amount - paid_out ELSE 0 END), 0) FROM d) = public.pro_owed($1) AS balances,
      NOT EXISTS (SELECT 1 FROM a WHERE n < 0) AS none_negative,
      NOT EXISTS (SELECT 1 FROM d WHERE paid_in > amount OR paid_out > amount) AS within,
      NOT EXISTS (SELECT 1 FROM d WHERE NOT live AND (paid_in <> 0 OR paid_out <> 0)) AS reversed_clear,
      NOT (EXISTS (SELECT 1 FROM d WHERE side = 'credit' AND live AND paid_out < amount)
           AND EXISTS (SELECT 1 FROM d WHERE side <> 'credit' AND live AND payable AND paid_in < amount)) AS nothing_left_idle
  `, [pro])).rows[0];
  return Object.entries(r).filter(([, v]) => v !== true).map(([n]) => n);
}

let n = 0;
/** A job for `pro` at `price`, taken all the way to working. */
async function working(pro, price, customer) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`, price])).value;
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
const finish = async (pro, id, parts = 0) =>
  (await me(pro, `SELECT public.finish_work($1, $2::jsonb, $3, $4)`, [id, JSON.stringify([await upload(pro)]), parts, parts ? await upload(pro) : null])).value;
/** Finished, and checked by the customer: the commission is posted. */
async function done(pro, price, customer, parts = 0) {
  const j = await working(pro, price, customer);
  const r = await finish(pro, j.id, parts);
  if (!r?.ok) throw new Error(`finish failed: ${JSON.stringify(r)}`);
  const c = (await me(customer, `SELECT public.confirm_work($1)`, [j.id])).value;
  if (!c?.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
  await sent();
  return job(j.id);
}
/** What a single posting would have made, for labour actually received. */
const single = (j, received) => {
  const c = Math.floor((Math.max(received - Number(j.parts_paisa), 0) * Number(j.commission_bps)) / 10000);
  return { c, r: Math.floor((c * 2000) / 10000) };
};

const REPORT = `SELECT public.pro_report_unpaid($1, $2)`;
const CORRECT = `SELECT public.pro_correct_unpaid($1, $2)`;
const ANSWER = `SELECT public.customer_answer_unpaid($1, $2, $3, $4)`;
const NOW_PAID = `SELECT public.pro_now_paid($1)`;
const OFFICE = `SELECT public.admin_payment_case($1, $2, $3, $4, $5)`;
const office = async (id, action, note = 'Rang both of them and checked the receipt.', amount = null, falseReport = false) =>
  (await me(OWNER, OFFICE, [(await caseOf(id)).id, action, note, amount, falseReport])).value;
const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Another AC is not cooling', p_offer_paisa => 200000,
    p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3', p_media => '[]'::jsonb)`;
const canPost = async (who) => {
  const r = await me(who, POST);
  if (r.value?.id) await setup(`DELETE FROM public.jobs WHERE id = $1`, [r.value.id]);
  return r.error ? r.error : r.value?.ok === true ? true : JSON.stringify(r.value);
};
const offerOn = async (pro) => {
  const other = (await me(HINA, POST)).value;
  const r = (await me(pro, `SELECT public.make_offer($1, 200000, 20, NULL)`, [other.id])).value;
  await setup(`DELETE FROM public.jobs WHERE id = $1`, [other.id]);
  return r;
};

// =============================================================================
heading('Who may report, and when');
// Rs 5,000 agreed, Rs 1,000 of it parts with a receipt: commission 10% of Rs 4,000 = Rs 400, reserve Rs 80.
const j1 = await done(BILAL, 500000, AYESHA, 100000);
ok('the job counts as done and its commission is posted: Rs 400, Rs 80 of it to the reserve',
  Number(j1.commission_paisa) === 40000 && (await onJob(j1.id, 'pro_owes')) === 40000 && (await onJob(j1.id, 'reserve')) === -8000);
{
  const w = await working(BILAL, 300000, SARA);
  ok('a job still being worked on cannot be reported', (await me(BILAL, REPORT, [w.id, 0])).value?.ok === false);
  await finish(BILAL, w.id);
  ok('nor one waiting for her check', (await me(BILAL, REPORT, [w.id, 0])).value?.ok === false);
  await me(SARA, `SELECT public.confirm_work($1)`, [w.id]);
}
ok('another technician cannot report his job', (await me(ASAD, REPORT, [j1.id, 0])).value?.ok === false);
ok('the customer cannot', (await me(AYESHA, REPORT, [j1.id, 0])).value?.ok === false);
ok('a stranger cannot even ask', (await call('anon', null, REPORT, [j1.id, 0])).error !== null);
ok('what he received must be less than the price', (await me(BILAL, REPORT, [j1.id, 500000])).value?.field === 'amount');
ok('and in whole rupees', (await me(BILAL, REPORT, [j1.id, 300050])).value?.field === 'amount');
ok('and not below nothing', (await me(BILAL, REPORT, [j1.id, -100])).value?.field === 'amount');
{
  const old = await done(BILAL, 300000, SARA);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '7 days 1 minute' WHERE id = $1`, [old.id]);
  const r = (await me(BILAL, REPORT, [old.id, 0])).value;
  ok('after 7 days it is too late, and the commission stays as posted', r?.ok === false && /7 days/.test(r.why) && (await onJob(old.id, 'pro_owes')) === Number(old.commission_paisa));
  ok('his list no longer offers it', !(await proList(BILAL)).some((x) => x.id === old.id));
  const paid = await done(BILAL, 300000, SARA);
  await setup(`UPDATE public.jobs SET paid_by_pechkas = true WHERE id = $1`, [paid.id]);
  ok('a repair Pechkas pays for cannot be reported', (await me(BILAL, REPORT, [paid.id, 0])).value?.ok === false);
  ok('nor is it in his list', !(await proList(BILAL)).some((x) => x.id === paid.id));
}
{
  const l = (await proList(BILAL)).find((x) => x.id === j1.id);
  ok('his list offers the job, with its price, parts and the last day to report',
    l?.can_report === true && l.agreed_paisa === 500000 && l.parts_paisa === 100000 && Math.abs(new Date(l.report_until) - new Date(j1.finished_at) - 7 * 864e5) < 1000);
}

// =============================================================================
heading('He reports Paid less: the commission is held, and counts towards nothing');
const reserveBefore = await account('reserve');
const commissionBefore = await account('commission');
const owedBefore = await owed(BILAL);
await sent();
const r1 = (await me(BILAL, REPORT, [j1.id, 300000])).value;
ok('Bilal says he received Rs 3,000 of Rs 5,000', r1?.ok === true, JSON.stringify(r1));
ok('a second report is refused', (await me(BILAL, REPORT, [j1.id, 200000])).value?.ok === false);
{
  const c = await caseOf(j1.id);
  ok('the case keeps the price, the parts, the job\'s rate and the reserve rate as they were',
    c.status === 'asked' && Number(c.agreed_paisa) === 500000 && Number(c.parts_paisa) === 100000 && c.commission_bps === 1000 && c.reserve_bps === 2000
    && Number(c.reported_paisa) === 300000 && Number(c.received_paisa) === 0 && c.held_txn !== null);
  const hold = (await setup(`SELECT kind, reverses FROM public.ledger_txns WHERE id = $1`, [c.held_txn])).rows[0];
  const orig = (await setup(`SELECT id FROM public.ledger_txns WHERE idempotency_key = 'commission:' || $1`, [j1.id])).rows[0].id;
  ok('held = the commission posting reversed, line for line', hold.kind === 'reversal' && hold.reverses === orig);
}
ok('nothing of the job is on his account any more', (await onJob(j1.id, 'pro_owes')) === 0 && (await owed(BILAL)) === owedBefore - 40000);
ok('the reserve and Pechkas\' share are back where they were before the job',
  (await account('reserve')) === reserveBefore - 8000 && (await account('commission')) === commissionBefore - 32000 && (await onJob(j1.id, 'reserve')) === 0);
ok('the ledger still balances', await balanced());
ok('the held commission is no D36 fee', !(await fees(BILAL)).some((f) => f.ref === j1.ref && Number(f.unpaid) > 0));
ok('D36 still holds for Bilal', (await sound(BILAL)).length === 0, (await sound(BILAL)).join());
{
  const m = await sent();
  const her = to(m, 'ayesha');
  ok('Ayesha is asked, in neutral words: a job number, no amount, no accusation',
    her.length === 1 && her[0].title === `A question about payment for ${j1.ref}` && !/Rs|not paid|owe|3,000|2,000/i.test(her[0].title + her[0].body), JSON.stringify(her));
  ok('the office is not troubled yet', to(m, 'zohaib').length === 0);
}
{
  const a = await mine(AYESHA, j1.id);
  ok('her job card shows the question: Rs 3,000 received, Rs 2,000 left, 3 days to answer',
    a?.payment?.status === 'asked' && a.payment.reported_paisa === 300000 && a.payment.outstanding_paisa === 200000
    && a.payment.can_answer === true && a.payment.blocked === false && Math.abs(new Date(a.payment.answer_due) - Date.now() - 3 * 864e5) < 120e3);
  ok('she is not stopped from posting while she has not answered', (await canPost(AYESHA)) === true);
}

heading('The Rs 3,000 limit and D36 ignore a held commission');
{
  // Kamran: one job that takes him over a limit, and is old enough to have stopped his offers.
  await setup(`UPDATE public.settings SET value = 30000 WHERE key = 'credit_limit_paisa'`);
  const k = await done(KAMRAN, 400000, HINA);
  ok('Rs 400 owed is over a Rs 300 limit: his offers stop', (await offerOn(KAMRAN))?.field === 'owed');
  await setup(`ALTER TABLE public.ledger_txns DISABLE TRIGGER ledger_txns_once`);
  await setup(`UPDATE public.ledger_txns SET created_at = now() - interval '20 days' WHERE idempotency_key = 'commission:' || $1`, [k.id]);
  await setup(`ALTER TABLE public.ledger_txns ENABLE TRIGGER ledger_txns_once`);
  await setup(`SELECT public.pay_rebalance($1, NULL)`, [KAMRAN]);
  ok('and, 20 days old, it is overdue under D36', (await blocked(KAMRAN)) === true);
  ok('he reports Not paid', (await me(KAMRAN, REPORT, [k.id, 0])).value?.ok === true);
  ok('held: nothing owed, not overdue, offers open', (await owed(KAMRAN)) === 0 && (await blocked(KAMRAN)) === false && (await offerOn(KAMRAN))?.ok === true);
  await sent();
  await setup(`SELECT public.pay_clock()`);
  ok('and no reminder about it', to(await sent(), 'kamran').length === 0);
  await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
  ok('D36 still holds for Kamran', (await sound(KAMRAN)).length === 0, (await sound(KAMRAN)).join());
  globalThis.kamranJob = k;
}

// =============================================================================
heading('He corrects his amount until she answers');
ok('another technician cannot correct it', (await me(ASAD, CORRECT, [j1.id, 250000])).value?.ok === false);
ok('nor the customer', (await me(AYESHA, CORRECT, [j1.id, 250000])).value?.ok === false);
ok('a correction must still be below the price', (await me(BILAL, CORRECT, [j1.id, 500000])).value?.field === 'amount');
ok('Bilal corrects it to Rs 2,500', (await me(BILAL, CORRECT, [j1.id, 250000])).value?.ok === true);
ok('her card follows', (await mine(AYESHA, j1.id))?.payment?.reported_paisa === 250000);
ok('and back to Rs 3,000', (await me(BILAL, CORRECT, [j1.id, 300000])).value?.ok === true);

heading('She says "That\'s right": she owes the rest; commission on the labour he received');
ok('another customer cannot answer', (await me(SARA, ANSWER, [j1.id, 'agrees', null, null])).value?.ok === false);
ok('the technician cannot answer for her', (await me(BILAL, ANSWER, [j1.id, 'agrees', null, null])).value?.ok === false);
ok('an answer must be one of the two', (await me(AYESHA, ANSWER, [j1.id, 'maybe', null, null])).value?.ok === false);
await sent();
ok('Ayesha agrees', (await me(AYESHA, ANSWER, [j1.id, 'agrees', null, null])).value?.ok === true);
ok('she cannot answer twice', (await me(AYESHA, ANSWER, [j1.id, 'paid', 'I paid him by JazzCash', null])).value?.ok === false);
ok('he cannot correct it now: only the office', /office/.test((await me(BILAL, CORRECT, [j1.id, 200000])).value?.why ?? ''));
{
  const c = await caseOf(j1.id);
  const want = single(j1, 300000);
  ok('Rs 3,000 received, Rs 1,000 of it parts: commission on Rs 2,000 = Rs 200, reserve Rs 40, Pechkas Rs 160',
    want.c === 20000 && want.r === 4000 && Number(c.posted_commission) === 20000 && Number(c.posted_reserve) === 4000
    && (await onJob(j1.id, 'pro_owes')) === 20000 && (await onJob(j1.id, 'reserve')) === -4000 && (await onJob(j1.id, 'commission')) === -16000);
  ok('status: she owes the rest', c.status === 'owed' && c.owed_at !== null);
  const f = (await fees(BILAL)).find((x) => x.kind === 'commission' && x.ref === j1.ref && Number(x.amount) === 20000);
  ok('the released Rs 200 is a new D36 fee, its 14 days starting today', f?.status === 'not_due' && D(f.due_day) === await day(14), JSON.stringify(f));
  const m = await sent();
  ok('he is told she answered, nothing more', to(m, 'bilal').length === 1 && to(m, 'bilal')[0].title === `The customer has answered about payment for ${j1.ref}`);
  ok('D36 still holds', (await sound(BILAL)).length === 0, (await sound(BILAL)).join());
}
{
  const a = await mine(AYESHA, j1.id);
  ok('her card: Rs 2,000 still owed, and she is held back from posting', a?.payment?.status === 'owed' && a.payment.outstanding_paisa === 200000 && a.payment.blocked === true);
  const e = await canPost(AYESHA);
  ok('posting a new job is refused, naming the job and the Rs 2,000', typeof e === 'string' && e.includes(j1.ref) && e.includes('Rs 2,000'), e);
  ok('Sara, who owes nothing, posts as usual', (await canPost(SARA)) === true);
}

heading('The guarantee goes on: her claim is the office\'s while the case is open');
{
  const before = (await mine(AYESHA, j1.id))?.guarantee_until;
  await sent();
  const cl = (await me(AYESHA, `SELECT public.claim_guarantee($1, $2, $3::jsonb)`, [j1.id, 'The AC is warm again since yesterday', JSON.stringify([await upload(AYESHA)])])).value;
  ok('Ayesha can still claim, even while she owes', cl?.ok === true, JSON.stringify(cl));
  const claim = (await setup(`SELECT * FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0];
  ok('the claim goes to the office, not to him', claim.status === 'office_review' && claim.sent_to_pro === false);
  const m = await sent();
  ok('the office is told; Bilal is not', to(m, 'zohaib').some((x) => x.title === `A guarantee claim needs you: ${j1.ref}`) && to(m, 'bilal').length === 0);
  ok('his claims list does not show it', !(await me(BILAL, `SELECT public.pro_claims()`)).value?.some((x) => x.id === cl.claim_id));
  ok('the guarantee is the same length as before', (await mine(AYESHA, j1.id))?.guarantee_until === before);
  await setup(`UPDATE public.guarantee_claims SET answer_due = now() - interval '1 hour' WHERE id = $1`, [cl.claim_id]);
  await setup(`SELECT public.claim_clock()`);
  ok('no answer clock runs against him', (await setup(`SELECT status FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0].status === 'office_review');
  ok('his new offers are not stopped by it', (await offerOn(BILAL))?.ok === true);
  const g = (await me(OWNER, `SELECT public.admin_guarantee()`)).value?.claims?.find((x) => x.id === cl.claim_id);
  ok('the office\'s list marks it as needing them, with the payment case', g?.needs_you === true && g.payment_case === true);
  ok('a customer cannot decide it', (await me(AYESHA, `SELECT public.admin_review_claim($1, 'replace', 'Sending someone else')`, [cl.claim_id])).value?.ok === false);
  ok('the office must write what it found', (await me(OWNER, `SELECT public.admin_review_claim($1, 'replace', '')`, [cl.claim_id])).value?.field === 'note');
  ok('the office sends another technician, at Pechkas\' cost',
    (await me(OWNER, `SELECT public.admin_review_claim($1, 'replace', 'The fault is back. Another technician will go; Pechkas pays.')`, [cl.claim_id])).value?.ok === true);
  const after = (await setup(`SELECT * FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0];
  ok('a replacement with no charge to him', after.status === 'replacing' && after.why_replacing === 'office' && after.charge_original === false);
  const booked = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [cl.claim_id, tomorrow])).value;
  ok('Ayesha books the replacement although she owes: a guarantee is never blocked', booked?.ok === true, JSON.stringify(booked));
  const bilalBefore = await owed(BILAL);
  await me(ASAD, `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_eta_minutes => NULL, p_note => NULL, p_arrive_from => 10::smallint)`, [booked.job_id, 300000]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [booked.job_id, ASAD])).rows[0].id;
  await me(AYESHA, `SELECT public.choose_offer($1)`, [offer]);
  await me(ASAD, `SELECT public.tech_step($1, 'chosen')`, [booked.job_id]);
  await me(ASAD, `SELECT public.tech_step($1, 'on_way')`, [booked.job_id]);
  await me(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [booked.job_id, (await job(booked.job_id)).start_code, JSON.stringify([await upload(ASAD)])]);
  await finish(ASAD, booked.job_id);
  ok('she confirms the repair', (await me(AYESHA, `SELECT public.confirm_work($1)`, [booked.job_id])).value?.ok === true);
  const end = (await setup(`SELECT * FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0];
  ok('Bilal is charged nothing for it, automatically or later', !(Number(end.charge_paisa) > 0) && end.charge_due === null && (await owed(BILAL)) === bilalBefore);
  ok('Asad is paid from the reserve', (await owed(ASAD)) === -300000);
  ok('D36 still holds for both', (await sound(BILAL)).length === 0 && (await sound(ASAD)).length === 0);
}

heading('He taps Now paid: the rest released, exactly one posting\'s worth');
await sent();
ok('another technician cannot', (await me(ASAD, NOW_PAID, [j1.id])).value?.ok === false);
ok('Bilal has now been paid in full', (await me(BILAL, NOW_PAID, [j1.id])).value?.ok === true);
{
  const c = await caseOf(j1.id);
  ok('closed', c.status === 'closed' && c.outcome === 'now_paid' && Number(c.received_paisa) === 500000);
  ok('in all: Rs 400 on his account, Rs 80 reserve, Rs 320 Pechkas — what one posting made',
    (await onJob(j1.id, 'pro_owes')) === 40000 && (await onJob(j1.id, 'reserve')) === -8000 && (await onJob(j1.id, 'commission')) === -32000);
  ok('the second release is its own D36 fee: Rs 200, from today', (await fees(BILAL)).filter((f) => f.ref === j1.ref && f.status === 'not_due').length === 2);
  ok('she may post again', (await canPost(AYESHA)) === true);
  const m = await sent();
  ok('she is told it is settled', to(m, 'ayesha').some((x) => x.title === `Payment for ${j1.ref} is settled`));
  ok('a second Now paid is refused', (await me(BILAL, NOW_PAID, [j1.id])).value?.ok === false);
  ok('the ledger balances, D36 holds', (await balanced()) && (await sound(BILAL)).length === 0);
}

// =============================================================================
heading('She says "I have paid": the office decides; she is not held back');
const j2 = await done(BILAL, 600000, SARA, 50000);
await me(BILAL, REPORT, [j2.id, 0]);
ok('her words are needed', (await me(SARA, ANSWER, [j2.id, 'paid', '', null])).value?.field === 'text');
ok('and no CNIC in them', (await me(SARA, ANSWER, [j2.id, 'paid', `My CNIC is ${['61101', '1234567', '1'].join('-')}`, null])).value?.field === 'text');
ok('a screenshot must be her own upload', (await me(SARA, ANSWER, [j2.id, 'paid', 'Paid by JazzCash', `${BILAL}/nope.jpg`])).value?.field === 'photo');
await sent();
const shot = await upload(SARA);
ok('Sara says she paid by JazzCash, with a screenshot', (await me(SARA, ANSWER, [j2.id, 'paid', 'Paid him Rs 6,000 by JazzCash on the day', shot])).value?.ok === true);
{
  const c = await caseOf(j2.id);
  ok('with the office, still held, nothing released', c.status === 'office' && Number(c.posted_commission) === 0 && (await onJob(j2.id, 'pro_owes')) === 0);
  ok('she is not stopped from posting', (await canPost(SARA)) === true && (await mine(SARA, j2.id))?.payment?.blocked === false);
  const m = await sent();
  ok('the office is told: a job number and where to look, nothing she wrote',
    to(m, 'zohaib').some((x) => x.title === `A payment question needs you: ${j2.ref}`) && !m.some((x) => /JazzCash|6,000/.test(x.title + x.body)));
  ok('he sees that she answered, never her words', (await proList(BILAL)).find((x) => x.id === j2.id)?.payment?.customer_text === null
    && (await mine(SARA, j2.id))?.payment?.customer_text === 'Paid him Rs 6,000 by JazzCash on the day');
  const list = (await me(OWNER, `SELECT public.admin_payment_cases()`)).value;
  const row = list?.find((x) => x.job_id === j2.id);
  ok('the office\'s list has it first, with her words, her screenshot and both numbers',
    list?.[0]?.job_id === j2.id && row.needs_you === true && row.customer_text.includes('JazzCash') && row.customer_photo === shot && row.customer_phone && row.pro_phone);
  ok('no one but the office reads that list', (await me(BILAL, `SELECT public.admin_payment_cases()`)).value === null);
  ok('Bilal may not use the office\'s actions', (await me(BILAL, OFFICE, [c.id, 'paid_full', 'She did pay me after all.', null, false])).value?.ok === false);
  ok('the office must give a reason', (await office(j2.id, 'paid_full', 'ok'))?.field === 'note');
  ok('a payment the office records must be in whole rupees and within the price', (await office(j2.id, 'received', 'She sent part of it.', 700000))?.field === 'amount');
}
heading('The office records part of it, then the rest: totals as one posting');
// Rs 6,000, Rs 500 parts: in full the commission is Rs 550 (job rate) — here the pair is new, 10%.
ok('the office records Rs 3,000 received so far', (await office(j2.id, 'received', 'JazzCash statement shows Rs 3,000.', 300000))?.ok === true);
{
  const want = single(j2, 300000);
  ok('commission on Rs 2,500 of labour', (await onJob(j2.id, 'pro_owes')) === want.c && (await onJob(j2.id, 'reserve')) === -want.r);
  ok('a lower total than before is refused', (await office(j2.id, 'received', 'Typed the wrong figure.', 200000))?.field === 'amount');
  ok('Rs 4,250 in all', (await office(j2.id, 'received', 'A second JazzCash payment of Rs 1,250.', 425000))?.ok === true);
  const w2 = single(j2, 425000);
  ok('commission on Rs 3,750: still only the difference was posted', (await onJob(j2.id, 'pro_owes')) === w2.c && (await onJob(j2.id, 'reserve')) === -w2.r);
  ok('paid in full', (await office(j2.id, 'paid_full', 'She has sent the last Rs 1,750.'))?.ok === true);
  const full = single(j2, 600000);
  ok('in all, exactly the original commission, reserve and share',
    full.c === Number(j2.commission_paisa) && (await onJob(j2.id, 'pro_owes')) === full.c && (await onJob(j2.id, 'reserve')) === -full.r
    && (await onJob(j2.id, 'commission')) === -(full.c - full.r));
  const c = await caseOf(j2.id);
  ok('closed, with who decided and why kept', c.status === 'closed' && c.outcome === 'paid_full' && c.office_by_name === 'Zohaib' && c.office_note.includes('Rs 1,750'));
  ok('the steps are on the job\'s record', Number((await setup(`SELECT count(*) AS n FROM public.job_events WHERE job_id = $1 AND what LIKE 'payment%'`, [j2.id])).rows[0].n) >= 5);
  ok('a closed case takes no more decisions', (await office(j2.id, 'owes', 'She owes after all.'))?.ok === false);
  ok('D36 holds', (await sound(BILAL)).length === 0);
}

// =============================================================================
heading('No answer in 3 days: the office, still held, nobody blocked');
const j3 = await done(BILAL, 300000, HINA);
await me(BILAL, REPORT, [j3.id, 100000]);
await sent();
await setup(`SELECT public.payment_clock()`);
ok('before 3 days nothing moves', (await caseOf(j3.id)).status === 'asked');
await setup(`UPDATE public.payment_cases SET answer_due = now() - interval '1 minute' WHERE job_id = $1`, [j3.id]);
ok('the clock moves one case', (await setup(`SELECT public.payment_clock() AS n`)).rows[0].n === 1);
{
  const c = await caseOf(j3.id);
  ok('silence is not agreement: with the office, nothing released, she is not blocked',
    c.status === 'office' && c.customer_answer === null && Number(c.posted_commission) === 0 && (await canPost(HINA)) === true);
  ok('the office is told once', to(await sent(), 'zohaib').length === 1);
  await setup(`SELECT public.payment_clock()`);
  ok('and not again', to(await sent(), 'zohaib').length === 0);
  ok('he cannot correct it now either', (await me(BILAL, CORRECT, [j3.id, 50000])).value?.ok === false);
  ok('she can still answer late', (await mine(HINA, j3.id))?.payment?.can_answer === true);
}
heading('The office finds she owes, then clears her');
ok('the office decides she owes the rest', (await office(j3.id, 'owes', 'Rang her: she agrees she has not paid the rest.'))?.ok === true);
{
  const c = await caseOf(j3.id);
  ok('she owes; commission on the Rs 1,000 he received', c.status === 'owed' && (await onJob(j3.id, 'pro_owes')) === single(j3, 100000).c);
  ok('she is blocked', typeof (await canPost(HINA)) === 'string');
  ok('saying it twice is refused', (await office(j3.id, 'owes', 'Rang her again today.'))?.ok === false);
  ok('the office clears her, with a reason', (await office(j3.id, 'clear', 'She is paying in two parts; let her book.'))?.ok === true);
  ok('she may post again; the case stays open', (await canPost(HINA)) === true && (await caseOf(j3.id)).status === 'owed' && (await caseOf(j3.id)).cleared_note.includes('two parts'));
  ok('clearing twice is refused', (await office(j3.id, 'clear', 'Clear her again please.'))?.ok === false);
}
heading('The office corrects his figure downwards: what was released is redone');
{
  ok('a correction below the price', (await office(j3.id, 'correct', 'He received Rs 500, not Rs 1,000.', 50000))?.ok === true);
  const c = await caseOf(j3.id);
  ok('commission now on Rs 500, and the ledger shows only that much for the job',
    Number(c.received_paisa) === 50000 && Number(c.reported_paisa) === 50000 && (await onJob(j3.id, 'pro_owes')) === single(j3, 50000).c && (await onJob(j3.id, 'reserve')) === -single(j3, 50000).r);
  ok('the ledger balances, D36 holds', (await balanced()) && (await sound(BILAL)).length === 0);
  ok('the office closes it unpaid: commission only on what he received', (await office(j3.id, 'close', 'She will not pay the rest. Closed.'))?.ok === true);
  ok('closed, nothing more posted, she is free to post', (await caseOf(j3.id)).status === 'closed' && (await onJob(j3.id, 'pro_owes')) === single(j3, 50000).c && (await canPost(HINA)) === true);
}

// =============================================================================
heading('Received less than the parts: no commission at all');
{
  const j = await done(ASAD, 400000, SARA, 150000);
  await me(ASAD, REPORT, [j.id, 100000]);
  await me(SARA, ANSWER, [j.id, 'agrees', null, null]);
  ok('Rs 1,000 received of Rs 1,500 parts: nothing released', (await onJob(j.id, 'pro_owes')) === 0 && Number((await caseOf(j.id)).posted_commission) === 0);
  ok('Now paid releases the full commission, once', (await me(ASAD, NOW_PAID, [j.id])).value?.ok === true && (await onJob(j.id, 'pro_owes')) === Number(j.commission_paisa));
  ok('D36 holds for Asad', (await sound(ASAD)).length === 0);
}
heading('Reported after he had already paid the commission');
{
  const j = await done(KAMRAN, 300000, SARA);
  const c = Number(j.commission_paisa);
  const before = await owed(KAMRAN);
  await me(OWNER, `SELECT public.admin_settle($1, $2, 'jazzcash', 'TX55', 'settle-kamran-1')`, [KAMRAN, before]);
  ok('he paid everything he owed', (await owed(KAMRAN)) === 0);
  ok('then reports Not paid', (await me(KAMRAN, REPORT, [j.id, 0])).value?.ok === true);
  ok('his payment is now money in hand for him', (await owed(KAMRAN)) === -c);
  ok('D36 holds: the payment became credit, nothing lost or counted twice', (await sound(KAMRAN)).length === 0, (await sound(KAMRAN)).join());
  await me(SARA, ANSWER, [j.id, 'agrees', null, null]);
  ok('nothing received, so nothing released', (await owed(KAMRAN)) === -c);
  await me(KAMRAN, NOW_PAID, [j.id]);
  ok('Now paid: the commission is posted again and his credit pays it', (await owed(KAMRAN)) === 0 && (await sound(KAMRAN)).length === 0);
  const f = (await fees(KAMRAN)).find((x) => x.ref === j.ref && x.status !== 'paid' && Number(x.unpaid) > 0);
  ok('nothing of it is left unpaid', f === undefined, JSON.stringify(f));
}
heading('A commission the office had already reversed: nothing is held, nothing released');
{
  const j = await done(ASAD, 200000, HINA);
  const txn = (await setup(`SELECT id FROM public.ledger_txns WHERE idempotency_key = 'commission:' || $1`, [j.id])).rows[0].id;
  await me(OWNER, `SELECT public.admin_reverse($1, 'Waived for this job')`, [txn]);
  ok('he may still report it', (await me(ASAD, REPORT, [j.id, 0])).value?.ok === true);
  await me(ASAD, NOW_PAID, [j.id]);
  ok('nothing is ever posted for it again', (await onJob(j.id, 'pro_owes')) === 0 && (await caseOf(j.id)).held_txn === null);
}

// =============================================================================
heading('A claim already with him moves to the office when he reports');
{
  const j = await done(ASAD, 300000, AYESHA);
  const cl = (await me(AYESHA, `SELECT public.claim_guarantee($1, $2, $3::jsonb)`, [j.id, 'Warm air again from the AC', JSON.stringify([await upload(AYESHA)])])).value;
  ok('the claim is waiting for Asad', (await setup(`SELECT status FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0].status === 'waiting');
  await sent();
  ok('Asad reports Not paid', (await me(ASAD, REPORT, [j.id, 0])).value?.ok === true);
  ok('the claim is now the office\'s, and his clock stops', (await setup(`SELECT status FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0].status === 'office_review');
  ok('the office is told', to(await sent(), 'zohaib').some((x) => x.title === `A guarantee claim needs you: ${j.ref}`));
  const his = (await me(ASAD, `SELECT public.pro_claims()`)).value?.find((x) => x.id === cl.claim_id);
  ok('he sees it is with the office, and cannot answer it', his?.with_office === true && his.can_answer === false);
  ok('the office hands it back to him under the normal rules', (await me(OWNER, `SELECT public.admin_review_claim($1, 'to_pro', 'He should look at it himself first.')`, [cl.claim_id])).value?.ok === true);
  const c = (await setup(`SELECT * FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0];
  ok('waiting for him, with a fresh 24 hours', c.status === 'waiting' && Math.abs(new Date(c.answer_due) - Date.now() - 24 * 3600e3) < 120e3);
  ok('he is told about the claim', to(await sent(), 'asad').some((x) => x.title === `Guarantee claim on job ${j.ref}`));
}
{
  const j = await done(ASAD, 300000, SARA);
  await me(ASAD, REPORT, [j.id, 0]);
  const cl = (await me(SARA, `SELECT public.claim_guarantee($1, $2, $3::jsonb)`, [j.id, 'The cooling stopped again today', JSON.stringify([await upload(SARA)])])).value;
  ok('the office finds his work at fault, on its own evidence: replaced and charged under the usual appeal',
    (await me(OWNER, `SELECT public.admin_review_claim($1, 'replace_charge', 'Our own check found the gas was never refilled.')`, [cl.claim_id])).value?.ok === true);
  const c = (await setup(`SELECT * FROM public.guarantee_claims WHERE id = $1`, [cl.claim_id])).rows[0];
  ok('marked for the A21 charge, which waits for the repair and his 7-day appeal', c.status === 'replacing' && c.charge_original === true && c.charge_txn === null);
  const j2b = await done(ASAD, 300000, HINA);
  await me(ASAD, REPORT, [j2b.id, 0]);
  const cl2 = (await me(HINA, `SELECT public.claim_guarantee($1, $2, $3::jsonb)`, [j2b.id, 'It is leaking again under the unit', JSON.stringify([await upload(HINA)])])).value;
  ok('or finds it not covered', (await me(OWNER, `SELECT public.admin_review_claim($1, 'not_covered', 'A new fault, not the one he repaired.')`, [cl2.claim_id])).value?.ok === true
    && (await setup(`SELECT status FROM public.guarantee_claims WHERE id = $1`, [cl2.claim_id])).rows[0].status === 'not_covered');
  ok('a decided claim cannot be reviewed again', (await me(OWNER, `SELECT public.admin_review_claim($1, 'replace', 'Change of mind here.')`, [cl2.claim_id])).value?.ok === false);
}

// =============================================================================
heading('A report the office finds false, and the flags');
{
  const j = await done(KAMRAN, 300000, HINA);
  await me(KAMRAN, REPORT, [j.id, 0]);
  await me(HINA, ANSWER, [j.id, 'paid', 'Paid in cash at the door, his helper saw', null]);
  ok('only the office can mark a report false', (await me(KAMRAN, OFFICE, [(await caseOf(j.id)).id, 'false_report', 'Not false at all', null, false])).value?.ok === false);
  ok('the office finds she paid in full and his report false', (await office(j.id, 'paid_full', 'His helper confirms she paid in cash.', null, true))?.ok === true);
  ok('recorded on the case', (await caseOf(j.id)).false_report === true);
}
const flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
const flagOf = (id) => flags.people.find((x) => x.id === id)?.flags ?? [];
ok('Bilal: 3 reports in the period are a flag to look at', flagOf(BILAL).some((f) => f.kind === 'unpaid_reports' && f.n === 3), JSON.stringify(flagOf(BILAL)));
ok('Kamran: one report the office found false is a flag', flagOf(KAMRAN).some((f) => f.kind === 'false_unpaid'));
ok('Hina: owed once only — no flag yet', !flagOf(HINA).some((f) => f.kind === 'unpaid_jobs'));
ok('Ayesha: owed once — no flag', !flagOf(AYESHA).some((f) => f.kind === 'unpaid_jobs'));
{
  const j = await done(KAMRAN, 300000, AYESHA);
  await me(KAMRAN, REPORT, [j.id, 0]);
  await me(AYESHA, ANSWER, [j.id, 'agrees', null, null]);
  const f2 = (await me(OWNER, `SELECT public.admin_flags()`)).value.people.find((x) => x.id === AYESHA)?.flags ?? [];
  ok('Ayesha: a second confirmed unpaid job is a flag', f2.some((f) => f.kind === 'unpaid_jobs' && f.n === 2));
  ok('"I have paid", decided by the office as paid, is never counted against her', (await caseOf(j2.id)).owed_at === null);
  ok('a flag changes nothing: his offers are open', (await offerOn(KAMRAN))?.ok === true);
  ok('the flag limits are the office\'s settings', flags.limits.flag_unpaid_reports === 3 && flags.limits.flag_unpaid_jobs === 2);
  ok('the 7 and 3 days are locked', Number((await setup(`SELECT count(*) AS n FROM public.setting_limits WHERE key IN ('unpaid_report_days', 'unpaid_answer_days')`)).rows[0].n) === 0);
}

// =============================================================================
heading('Nobody reads the table; notifications say nothing they should not');
denied('a stranger cannot read payment_cases', await as('anon', null, `SELECT * FROM public.payment_cases`));
denied('nor can the customer', await as('authenticated', AYESHA, `SELECT * FROM public.payment_cases`));
denied('nor the technician', await as('authenticated', BILAL, `SELECT * FROM public.payment_cases`));
for (const fn of ['release_commission(gen_random_uuid())', 'unrelease_commission(gen_random_uuid())', 'payment_clock()', 'claims_to_office(gen_random_uuid())']) {
  ok(`nobody signed in can call ${fn.split('(')[0]}`, (await me(BILAL, `SELECT public.${fn}`)).error !== null);
}
ok('a stranger cannot call the office\'s list', (await call('anon', null, `SELECT public.admin_payment_cases()`)).error !== null);
await sent();
const words = all.map((x) => `${x.title} ${x.body}`).join('\n');
ok('no notification carries a street, house, landmark, gate note or phone number',
  !/Street 34|House 12|markaz|Rafiq|9230|03\d{9}/.test(words));
ok('no notification carries what anybody wrote or the amounts in dispute',
  !/JazzCash|cash at the door|helper|Rs 2,000|Rs 3,000/.test(words.split('\n').filter((l) => /payment|Payment/.test(l)).join('\n')));

// =============================================================================
heading('It runs twice');
{
  const before = (await setup(`SELECT count(*) AS n FROM public.payment_cases`)).rows[0].n;
  const ledger = (await setup(`SELECT count(*) AS n FROM public.ledger_txns`)).rows[0].n;
  await db.exec(await readFile(join(MIGRATIONS, '20261112300000_payment_disputes.sql'), 'utf8'));
  ok('nothing is lost or posted twice', (await setup(`SELECT count(*) AS n FROM public.payment_cases`)).rows[0].n === before
    && (await setup(`SELECT count(*) AS n FROM public.ledger_txns`)).rows[0].n === ledger);
  ok('and it still works', (await me(BILAL, REPORT, [(await done(BILAL, 300000, HINA)).id, 0])).value?.ok === true);
  ok('the ledger balances at the end', await balanced());
  for (const pro of [BILAL, ASAD, KAMRAN]) ok(`D36 holds at the end: ${pro.slice(0, 4)}`, (await sound(pro)).length === 0);
}

report();
