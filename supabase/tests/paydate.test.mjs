/**
 * Paying Pechkas by a date (migration pay_by_date, the owner's decision D36).
 *
 * What must hold: each final debt — a commission, a final guarantee charge, a
 * final visit-fee refund charge — is due 14 days after it is posted, on
 * Pakistan's calendar, with 3 days' grace; from 00:00 on day 18 new offers
 * stop while any of it is unpaid, and the Rs 3,000 limit stays a separate
 * check; debts owed when D36 began start their 14 days that day; payments and
 * finalized credits pay the oldest fees first, written as what-paid-what lines
 * that are only ever added; a reversal in any order restores the right debt,
 * never brings a reversed fee back, never loses money or credits it twice;
 * money already paid out to him never also pays a fee; a waiting "I have
 * paid" protects only its amount, oldest first, until the office decides, and
 * after 3 business days (holidays excluded) the office is told each business
 * day; extra time only once offers have stopped, 3 to 14 days, once per spell,
 * with no second grace; a refund charge waits 7 days for his appeal before it
 * is a debt; reminders are one a day at most and carry no addresses; nobody
 * reads the tables; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e9';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const KAMRAN = `${P}555555-5555-4555-8555-555555555555`;
const NADIA = `${P}666666-6666-4666-8666-666666666666`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007991111', null, 'customer', 'Ayesha'],
  [BILAL, '923007993333', null, 'pro', 'Bilal'],
  [ASAD, '923007994444', null, 'pro', 'Asad'],
  [KAMRAN, '923007995555', null, 'pro', 'Kamran'],
  [NADIA, '923007996666', null, 'pro', 'Nadia'],
  [OWNER, null, 'owner@example.com', null, null],
  [OWNER_PHONE, '923009999999', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood'], [KAMRAN, 'Kamran Ali'], [NADIA, 'Nadia Khan']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
// D36 began long ago in this throwaway database, so dates follow each debt's own day.
await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[BILAL, 'bilal'], [ASAD, 'asad'], [KAMRAN, 'kamran'], [NADIA, 'nadia'], [OWNER_PHONE, 'zohaib']]) {
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

let k = 0;
const key = (s) => `${s}-${(k += 1)}-xxxxxxxx`;
const OTHER = { commission: 'commission', guarantee_charge: 'reserve', visit_fee_refund: 'received', guarantee_pay: 'reserve', visit_fee_cover: 'reserve' };
/** A debt posted the way the app posts one (straight through post_txn, the one writer). */
async function debt(pro, rupees, kind = 'commission') {
  const lines = JSON.stringify([{ account: 'pro_owes', pro_id: pro, amount: rupees * 100 }, { account: OTHER[kind], amount: -rupees * 100 }]);
  return (await setup(`SELECT public.post_txn($1, $2, NULL, $3, $4::jsonb) AS id`, [key(kind), kind, pro, lines])).rows[0].id;
}
/** Pechkas' money for him: guarantee-repair pay or a visit fee it covered. */
async function credit(pro, rupees, kind = 'guarantee_pay') {
  const lines = JSON.stringify([{ account: 'pro_owes', pro_id: pro, amount: -rupees * 100 }, { account: OTHER[kind], amount: rupees * 100 }]);
  return (await setup(`SELECT public.post_txn($1, $2, NULL, $3, $4::jsonb) AS id`, [key(kind), kind, pro, lines])).rows[0].id;
}
const settle = async (pro, rupees) => {
  const r = (await me(OWNER, `SELECT public.admin_settle($1, $2, 'jazzcash', 'TX123456', $3)`, [pro, rupees * 100, key('settle')])).value;
  return r?.id;
};
const payout = async (pro, rupees) => (await me(OWNER, `SELECT public.admin_pay_pro($1, $2, 'jazzcash', 'TX99', $3)`, [pro, rupees * 100, key('payout')])).value;
const reverse = async (txn) => (await me(OWNER, `SELECT public.admin_reverse($1, 'Entered by mistake')`, [txn])).value;
/** Move a posting into the past (only possible in this throwaway database). */
async function age(txn, days, extra = '') {
  await setup(`ALTER TABLE public.ledger_txns DISABLE TRIGGER ledger_txns_once`);
  await setup(`UPDATE public.ledger_txns SET created_at = now() - make_interval(days => $2) ${extra} WHERE id = $1`, [txn, days]);
  await setup(`ALTER TABLE public.ledger_txns ENABLE TRIGGER ledger_txns_once`);
}
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const fees = async (pro) => (await setup(`SELECT * FROM public.pay_fees($1) ORDER BY posted_at, txn`, [pro])).rows;
const feeOf = async (pro, txn) => (await fees(pro)).find((f) => f.txn === txn);
const blocked = async (pro) => (await setup(`SELECT public.pay_blocked($1) AS b`, [pro])).rows[0].b;
const state = async (pro) => (await setup(`SELECT public.pay_state($1) AS s`, [pro])).rows[0].s;
const today = (await setup(`SELECT public.pk_day(now())::text AS d`)).rows[0].d;
const day = async (n) => (await setup(`SELECT (public.pk_day(now()) + $1::int)::text AS d`, [n])).rows[0].d;
const D = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));
const OFFER = `SELECT public.make_offer(gen_random_uuid(), 300000, 20, NULL)`;
const offerField = async (pro) => (await me(pro, OFFER)).value?.field;

/** The rules that must hold after anything: they are the whole of D36's accounting. */
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

// =============================================================================
heading('Dates on Pakistan\'s calendar: due on day 14, grace 15-17, stopped from day 18');
{
  const a = await debt(BILAL, 300);
  let f = await feeOf(BILAL, a);
  ok('posted today: not due, due in 14 days, last grace day 17, stop at midnight starting day 18',
    f.status === 'not_due' && D(f.due_day) === await day(14) && D(f.last_grace_day) === await day(17)
    && f.stop_at.getTime() === (await setup(`SELECT public.pk_midnight(public.pk_day(now()) + 18) AS t`)).rows[0].t.getTime(), JSON.stringify(f));
  for (const [n, want] of [[13, 'not_due'], [14, 'due'], [15, 'grace'], [17, 'grace'], [18, 'stopped']]) {
    await age(a, n);
    f = await feeOf(BILAL, a);
    ok(`${n} days on: ${want}`, f.status === want, f.status);
  }
  ok('his new offers have stopped', (await blocked(BILAL)) === true && (await offerField(BILAL)) === 'overdue');
  ok('the screen says how much and since when', Number((await state(BILAL)).overdue_paisa) === 30000 && (await state(BILAL)).blocked === true);

  // Around midnight in Islamabad: a minute before midnight starting day 17 is day 18's debt; a minute after is not.
  const b = await debt(ASAD, 100);
  await setup(`ALTER TABLE public.ledger_txns DISABLE TRIGGER ledger_txns_once`);
  await setup(`UPDATE public.ledger_txns SET created_at = public.pk_midnight(public.pk_day(now()) - 17) - interval '1 minute' WHERE id = $1`, [b]);
  await setup(`ALTER TABLE public.ledger_txns ENABLE TRIGGER ledger_txns_once`);
  ok('posted at 23:59 the day before: stopped today', (await feeOf(ASAD, b)).status === 'stopped');
  await setup(`ALTER TABLE public.ledger_txns DISABLE TRIGGER ledger_txns_once`);
  await setup(`UPDATE public.ledger_txns SET created_at = public.pk_midnight(public.pk_day(now()) - 17) + interval '1 minute' WHERE id = $1`, [b]);
  await setup(`ALTER TABLE public.ledger_txns ENABLE TRIGGER ledger_txns_once`);
  ok('posted at 00:01: still its last grace day', (await feeOf(ASAD, b)).status === 'grace');
  await settle(ASAD, 100);

  heading('Paying clears it at once, oldest first');
  const c = await debt(BILAL, 200);
  await settle(BILAL, 300);
  ok('Rs 300 paid the oldest fee, not the newest', Number((await feeOf(BILAL, a)).unpaid) === 0 && Number((await feeOf(BILAL, c)).unpaid) === 20000);
  ok('offers are back the moment the office records it', (await blocked(BILAL)) === false && (await offerField(BILAL)) !== 'overdue');
  ok('the accounts are sound', (await sound(BILAL)).length === 0, (await sound(BILAL)).join());
  await settle(BILAL, 200);
}

heading('The Rs 3,000 limit is its own check');
{
  const big = await debt(KAMRAN, 3100);
  ok('over Rs 3,000 with nothing overdue: stopped by the limit', (await offerField(KAMRAN)) === 'owed' && (await blocked(KAMRAN)) === false);
  await settle(KAMRAN, 3100);
  const small = await debt(KAMRAN, 150);
  await age(small, 20);
  ok('Rs 150 overdue, far under the limit: stopped by the due date', (await offerField(KAMRAN)) === 'overdue');
  const more = await debt(KAMRAN, 3050);
  ok('both: the limit speaks first, and paying the overdue part alone is not enough',
    (await offerField(KAMRAN)) === 'owed');
  await settle(KAMRAN, 150);
  ok('the overdue fee paid, the limit still stops him', (await blocked(KAMRAN)) === false && (await offerField(KAMRAN)) === 'owed');
  await settle(KAMRAN, 3050);
  ok('no minimum: even a small fee falls due', small && more && (await sound(KAMRAN)).length === 0);
}

heading('Debts from before D36 start their 14 days the day it began');
{
  const old = await debt(NADIA, 400);
  await age(old, 100);
  await setup(`UPDATE public.pay_policy SET started_at = now() - interval '2 days'`);
  const f = await feeOf(NADIA, old);
  ok('a fee 100 days old is due 14 days after D36 began, not overdue', f.status === 'not_due' && D(f.due_day) === await day(12));
  ok('so nobody is overdue the day it begins', (await blocked(NADIA)) === false);
  await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);
  ok('measured from its own day, it would have been overdue', (await blocked(NADIA)) === true);
  await settle(NADIA, 400);
}

heading('Reversals, in every order (the owner\'s case first)');
{
  const A = await debt(ASAD, 300);
  await age(A, 2);
  const B = await debt(ASAD, 400);
  const Pay = await settle(ASAD, 300);
  ok('the payment paid A', Number((await feeOf(ASAD, A)).unpaid) === 0 && Number((await feeOf(ASAD, B)).unpaid) === 40000);
  await reverse(A);
  ok('A reversed: A is gone, and the payment moved to B', !(await feeOf(ASAD, A)) && Number((await feeOf(ASAD, B)).unpaid) === 10000);
  await reverse(Pay);
  ok('the payment reversed: B owes Rs 400 again', Number((await feeOf(ASAD, B)).unpaid) === 40000 && (await owed(ASAD)) === 40000);
  ok('and A has not come back', !(await feeOf(ASAD, A)));
  const lines = (await setup(`SELECT why, count(*)::int AS n FROM public.pay_allocations WHERE pro_id = $1 GROUP BY why`, [ASAD])).rows;
  ok('every move is a new line: applied, then released, nothing edited',
    lines.find((l) => l.why === 'apply')?.n >= 2 && lines.find((l) => l.why === 'release')?.n >= 2);
  ok('nobody can change a line, not even the database owner',
    await setup(`UPDATE public.pay_allocations SET amount_paisa = 1 WHERE pro_id = $1`, [ASAD]).then(() => false, () => true));
  ok('sound', (await sound(ASAD)).length === 0, (await sound(ASAD)).join());
  await settle(ASAD, 400);

  // The other order: the payment reversed first, then the fee it had paid.
  const C = await debt(ASAD, 300);
  const D2 = await debt(ASAD, 200);
  const P2 = await settle(ASAD, 300);
  await reverse(P2);
  ok('payment reversed first: C owes again, D untouched', Number((await feeOf(ASAD, C)).unpaid) === 30000 && Number((await feeOf(ASAD, D2)).unpaid) === 20000);
  await reverse(C);
  ok('then C reversed: only D is owed', !(await feeOf(ASAD, C)) && (await owed(ASAD)) === 20000 && (await sound(ASAD)).length === 0);

  // Partial payments, and two payments.
  const E = await debt(ASAD, 500);
  await settle(ASAD, 150);
  await settle(ASAD, 150);
  ok('two part-payments of Rs 150: D paid (200), Rs 100 off E', Number((await feeOf(ASAD, D2)).unpaid) === 0 && Number((await feeOf(ASAD, E)).unpaid) === 40000);
  ok('sound', (await sound(ASAD)).length === 0);
  await settle(ASAD, 400);
}

heading('Money Pechkas owes him pays his fees only while it is still unpaid to him');
{
  const g = await credit(NADIA, 500);
  ok('Pechkas owes him Rs 500, he owes nothing', (await owed(NADIA)) === -50000 && Number((await state(NADIA)).credit_paisa) === 50000);
  await payout(NADIA, 500);
  const f = await debt(NADIA, 300);
  ok('paid out to him already: it does not also pay his new fee', Number((await feeOf(NADIA, f)).unpaid) === 30000);
  await settle(NADIA, 300);
  const f2 = await debt(NADIA, 300);
  await credit(NADIA, 500, 'visit_fee_cover');
  ok('credited and not paid out: it pays his oldest fee, the rest waits', Number((await feeOf(NADIA, f2)).unpaid) === 0 && Number((await state(NADIA)).credit_paisa) === 20000);
  const f3 = await debt(NADIA, 300);
  ok('and the rest pays the next fee as soon as it is posted', Number((await feeOf(NADIA, f3)).unpaid) === 10000);
  const pay2 = await settle(NADIA, 100);
  ok('sound', (await sound(NADIA)).length === 0 && g && pay2);
  // A payout reversed: the credit it used is free again and pays what is owed.
  await credit(NADIA, 200);
  const po = (await setup(`SELECT id FROM public.ledger_txns WHERE kind = 'payout' AND pro_id = $1`, [NADIA])).rows[0].id;
  const f4 = await debt(NADIA, 600);
  const before = Number((await feeOf(NADIA, f4)).unpaid);
  await reverse(po);
  const unpaidOthers = (await fees(NADIA)).filter((x) => x.txn !== f4).reduce((s, x) => s + Number(x.unpaid), 0);
  ok('a payout reversed: the Rs 500 it used is free again and pays the fee', unpaidOthers === 0
    && Number((await feeOf(NADIA, f4)).unpaid) === Math.max(0, before - 50000), `before ${before}, now ${(await feeOf(NADIA, f4)).unpaid}`);
  ok('sound', (await sound(NADIA)).length === 0, (await sound(NADIA)).join());
}

heading('Several hundred random sequences: the accounts are sound after every step');
{
  let seed = 20261111;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const R = `${P}777777-7777-4777-8777-777777777777`;
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923007997777')`, [R]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'pro', 'Rafiq')`, [R]);
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Rafiq Shah', '{ac}', 3, '{F-11}', 'approved', true)`, [R]);
  const live = [];
  let bad = null;
  let steps = 0;
  for (let i = 0; i < 300 && !bad; i += 1) {
    const o = await owed(R);
    const pick = rand(10);
    let what = '';
    if (pick < 3) {
      live.push(await debt(R, (rand(9) + 1) * 100, rand(4) === 0 ? 'guarantee_charge' : 'commission'));
      what = 'fee';
    } else if (pick < 5 && o > 0) {
      live.push(await settle(R, Math.max(1, Math.min(o / 100, (rand(9) + 1) * 100))));
      what = 'payment';
    } else if (pick < 6) {
      live.push(await credit(R, (rand(5) + 1) * 100, rand(2) ? 'guarantee_pay' : 'visit_fee_cover'));
      what = 'credit';
    } else if (pick < 7 && o < 0) {
      await payout(R, Math.max(1, Math.min(-o / 100, (rand(5) + 1) * 100)));
      live.push((await setup(`SELECT id FROM public.ledger_txns WHERE pro_id = $1 AND kind = 'payout' ORDER BY created_at DESC LIMIT 1`, [R])).rows[0].id);
      what = 'payout';
    } else if (live.length) {
      const t = live.splice(rand(live.length), 1)[0];
      if (t) await reverse(t);
      what = 'reversal';
    }
    const s = await sound(R);
    steps += 1;
    if (s.length) bad = `step ${i} (${what}): ${s.join(', ')}`;
  }
  ok(`300 random steps of fees, payments, credits, payouts and reversals: always sound`, bad === null, bad);
  ok('and it really did all of those', steps === 300);
}

heading('A waiting "I have paid" protects only its amount, until the office decides');
{
  const a = await debt(KAMRAN, 300);
  const b = await debt(KAMRAN, 200);
  await age(a, 21);
  await age(b, 20);
  ok('Rs 500 overdue', Number((await state(KAMRAN)).overdue_paisa) === 50000 && (await blocked(KAMRAN)) === true);
  const shot = `${KAMRAN}/paid-1.jpg`;
  await as('authenticated', KAMRAN, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [shot]);
  ok('he says he paid Rs 200', (await me(KAMRAN, `SELECT public.claim_payment(20000, 'jazzcash', 'TX778899', $1)`, [shot])).value?.ok === true);
  let s = await state(KAMRAN);
  ok('Rs 200 is protected, on the oldest fee; Rs 300 still overdue, still stopped',
    Number((await feeOf(KAMRAN, a)).protected) === 20000 && Number((await feeOf(KAMRAN, b)).protected) === 0
    && Number(s.overdue_paisa) === 30000 && s.blocked === true);
  const claim = (await setup(`SELECT id FROM public.payment_claims WHERE pro_id = $1 AND status = 'pending'`, [KAMRAN])).rows[0].id;
  await me(OWNER, `SELECT public.admin_reject_claim($1, 'No such transaction on our JazzCash')`, [claim]);
  ok('the office did not find it: protection gone', Number((await state(KAMRAN)).overdue_paisa) === 50000);
  const shot2 = `${KAMRAN}/paid-2.jpg`;
  await as('authenticated', KAMRAN, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [shot2]);
  await me(KAMRAN, `SELECT public.claim_payment(50000, 'easypaisa', 'EP445566', $1)`, [shot2]);
  s = await state(KAMRAN);
  ok('a claim for all of it: nothing stopped while the office checks', s.blocked === false && Number(s.overdue_paisa) === 0
    && (await offerField(KAMRAN)) !== 'overdue');
  const claim2 = (await setup(`SELECT id FROM public.payment_claims WHERE pro_id = $1 AND status = 'pending'`, [KAMRAN])).rows[0].id;
  await setup(`UPDATE public.payment_claims SET created_at = now() - interval '30 days' WHERE id = $1`, [claim2]);
  ok('a month waiting: still protected, because the delay is the office\'s', (await blocked(KAMRAN)) === false);
  ok('the screens say it needs attention once the clock has run', (await state(KAMRAN)).claim?.business_days >= 3);
  const isWorkday = (await setup(`SELECT public.business_day(public.pk_day(now())) AS b`)).rows[0].b;
  await sent();
  await setup(`SELECT public.pay_clock()`);
  const told = to(await sent(), 'zohaib').filter((x) => /business days/.test(x.title));
  ok(isWorkday ? 'on a business day the office is told, and it is marked' : 'not a business day today: the office is told on the next one',
    isWorkday ? told.length === 1 && (await setup(`SELECT needs_attention_at FROM public.payment_claims WHERE id = $1`, [claim2])).rows[0].needs_attention_at
              : told.length === 0);
  await setup(`SELECT public.pay_clock()`);
  ok('told once a day, not twice', to(await sent(), 'zohaib').filter((x) => /business days/.test(x.title)).length === 0);
  await me(OWNER, `SELECT public.admin_confirm_claim($1)`, [claim2]);
  ok('confirmed: paid, oldest first, and nothing owed', (await owed(KAMRAN)) === 0 && (await sound(KAMRAN)).length === 0);
}

heading('Business days: Monday to Friday, minus the office\'s holidays');
{
  const bd = async (a, b) => (await setup(`SELECT public.business_days_between($1::date, $2::date) AS n`, [a, b])).rows[0].n;
  ok('Friday 13 Nov to Wednesday 18 Nov 2026: Monday, Tuesday, Wednesday', (await bd('2026-11-13', '2026-11-18')) === 3);
  ok('the weekend does not count', (await bd('2026-11-13', '2026-11-15')) === 0);
  ok('only the office adds a holiday', (await me(BILAL, `SELECT public.admin_set_holiday('2026-11-16', 'A holiday', true)`)).value?.ok === false);
  ok('a holiday needs its name from the notice', (await me(OWNER, `SELECT public.admin_set_holiday('2026-11-16', '', true)`)).value?.field === 'name');
  ok('the office adds one', (await me(OWNER, `SELECT public.admin_set_holiday('2026-11-16', 'Test holiday', true)`)).value?.ok === true);
  ok('and it does not count', (await bd('2026-11-13', '2026-11-18')) === 2);
  await me(OWNER, `SELECT public.admin_set_holiday('2026-11-16', NULL, false)`);
  ok('removed, it counts again, and both steps are kept', (await bd('2026-11-13', '2026-11-18')) === 3
    && (await setup(`SELECT count(*)::int AS n FROM public.pk_holiday_log WHERE day = '2026-11-16'`)).rows[0].n === 2);
  ok('the log cannot be edited', await setup(`DELETE FROM public.pk_holiday_log`).then(() => false, () => true));
}

heading('Extra time: only once offers have stopped, 3 to 14 days, once per spell, no second grace');
{
  const a = await debt(BILAL, 300);
  await age(a, 16);
  const X = `SELECT public.admin_extend_pay($1, $2, $3)`;
  ok('in grace (day 16): not yet', (await me(OWNER, X, [BILAL, 7, 'Unwell this week'])).value?.ok === false);
  await age(a, 18);
  ok('only the office', (await me(BILAL, X, [BILAL, 7, 'Unwell this week'])).value?.ok === false);
  ok('2 days is too few', (await me(OWNER, X, [BILAL, 2, 'Unwell this week'])).value?.field === 'days');
  ok('15 days is too many', (await me(OWNER, X, [BILAL, 15, 'Unwell this week'])).value?.field === 'days');
  ok('a reason is required', (await me(OWNER, X, [BILAL, 7, ''])).value?.field === 'reason');
  const r = (await me(OWNER, X, [BILAL, 7, 'Unwell this week; rang him'])).value;
  ok('stopped on day 18: 7 more days', r?.ok === true && D(r.until_day) === await day(7));
  const f = await feeOf(BILAL, a);
  ok('extended, offers open, stopping at midnight after the last extended day',
    f.status === 'extended' && (await blocked(BILAL)) === false
    && f.stop_at.getTime() === (await setup(`SELECT public.pk_midnight(public.pk_day(now()) + 8) AS t`)).rows[0].t.getTime());
  ok('he is told until when', to(await sent(), 'bilal').some((x) => /More time/.test(x.title)));
  const b = await debt(BILAL, 100);
  await age(b, 19);
  ok('a second extension while the first is unpaid: refused', (await me(OWNER, X, [BILAL, 7, 'Again please'])).value?.ok === false);
  ok('the record cannot be edited', await setup(`UPDATE public.pay_extensions SET days = 14 WHERE pro_id = $1`, [BILAL]).then(() => false, () => true));
  // The extension runs out: offers stop at once, no new grace.
  await setup(`ALTER TABLE public.pay_extensions DISABLE TRIGGER pay_extensions_once`);
  await setup(`UPDATE public.pay_extensions SET until_day = public.pk_day(now()) - 1 WHERE pro_id = $1`, [BILAL]);
  await setup(`ALTER TABLE public.pay_extensions ENABLE TRIGGER pay_extensions_once`);
  ok('the extension over and still unpaid: stopped, with no second grace', (await feeOf(BILAL, a)).status === 'stopped');
  await settle(BILAL, 400);
  const c = await debt(BILAL, 100);
  await age(c, 18);
  ok('the first spell paid: a new spell may have its own extension', (await me(OWNER, X, [BILAL, 3, 'Bike stolen; police report seen'])).value?.ok === true);
  ok('never twice on the same fee', (await setup(`SELECT count(*)::int AS n FROM public.pay_extension_fees WHERE txn_id = $1`, [c])).rows[0].n === 1);
  await settle(BILAL, 100);
}

heading('A visit-fee refund charge waits for his appeal (the owner\'s decision B)');
{
  async function feeRow(pro) {
    const j = (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, sector, street, house, status, pro_id)
      VALUES ($1, 'ac', 'AC not cooling', 300000, 'now', 'F-11', 'Street 2', 'House 9', 'open', NULL) RETURNING id, ref`, [AYESHA])).rows[0];
    const v = (await setup(`INSERT INTO public.visit_fees (job_id, customer_id, pro_id, amount_paisa, reason, payer, status, refund)
      VALUES ($1, $2, $3, 30000, 'declined', 'customer', 'waived', 'owed') RETURNING id`, [j.id, AYESHA, pro])).rows[0].id;
    return { job: j, fee: v };
  }
  const VF = `SELECT public.admin_visit_fee($1, $2, $3)`;
  const one = await feeRow(ASAD);
  const before = await owed(ASAD);
  ok('the office charges him', (await me(OWNER, VF, [one.fee, 'refund_charge', 'He would not return it; office paid her back'])).value?.ok === true);
  let v = (await setup(`SELECT * FROM public.visit_fees WHERE id = $1`, [one.fee])).rows[0];
  ok('recorded with a date 7 days on, not owed', v.refund === 'charge_pending' && (await owed(ASAD)) === before
    && Math.abs(new Date(v.refund_charge_due).getTime() - Date.now() - 7 * 86400000) < 120000);
  ok('he is told the amount, the date and that he may appeal', to(await sent(), 'asad').some((x) => /refund will be charged/.test(x.title) && /appeal/.test(x.body)));
  const A = `SELECT public.pro_appeal_refund($1, $2)`;
  ok('not by another technician', (await me(BILAL, A, [one.fee, 'It was not my fault at all'])).value?.ok === false);
  ok('a few words at least', (await me(ASAD, A, [one.fee, 'No'])).value?.field === 'text');
  ok('he appeals', (await me(ASAD, A, [one.fee, 'She broke the cover herself, I have the photo'])).value?.ok === true);
  ok('once', (await me(ASAD, A, [one.fee, 'Again, it was not me'])).value?.ok === false);
  await setup(`UPDATE public.visit_fees SET refund_charge_due = now() - interval '1 minute' WHERE id = $1`, [one.fee]);
  await setup(`SELECT public.refund_clock()`);
  ok('while the appeal waits, the date passing posts nothing', (await owed(ASAD)) === before);
  ok('the office keeps it', (await me(OWNER, VF, [one.fee, 'refund_keep', 'The photo shows the cover was fine before'])).value?.ok === true);
  v = (await setup(`SELECT * FROM public.visit_fees WHERE id = $1`, [one.fee])).rows[0];
  const posted = (await fees(ASAD)).find((f) => f.kind === 'visit_fee_refund');
  ok('now it is owed, and its 14 days start today', v.refund === 'charged' && (await owed(ASAD)) === before + 30000 && D(posted?.due_day) === await day(14));
  ok('he is told it was decided', to(await sent(), 'asad').some((x) => /appeal has been decided/.test(x.title)));

  const two = await feeRow(ASAD);
  await me(OWNER, VF, [two.fee, 'refund_charge', 'He would not return it; office paid her back']);
  await me(ASAD, A, [two.fee, 'The customer agreed on the phone I owed nothing']);
  ok('cancelled on appeal: never posted, Pechkas bears it', (await me(OWNER, VF, [two.fee, 'refund_cancel', 'She confirmed it by phone'])).value?.ok === true
    && (await setup(`SELECT refund FROM public.visit_fees WHERE id = $1`, [two.fee])).rows[0].refund === 'absorbed'
    && (await owed(ASAD)) === before + 30000);

  const three = await feeRow(ASAD);
  await me(OWNER, VF, [three.fee, 'refund_charge', 'He would not return it; office paid her back']);
  await setup(`UPDATE public.visit_fees SET refund_charge_due = now() - interval '1 minute' WHERE id = $1`, [three.fee]);
  await setup(`SELECT public.refund_clock()`);
  await setup(`SELECT public.refund_clock()`);
  ok('no appeal by the date: posted once', (await owed(ASAD)) === before + 60000
    && (await setup(`SELECT count(*)::int AS n FROM public.ledger_txns WHERE idempotency_key = $1`, [`visit_fee_refund:${three.fee}`])).rows[0].n === 1);

  // One charged under the old rule, before D36: payable only after its new appeal time.
  const four = await feeRow(NADIA);
  const oldTxn = (await setup(`SELECT public.post_txn($1, 'visit_fee_refund', $2, $3, $4::jsonb) AS id`,
    [`visit_fee_refund:${four.fee}`, four.job.id, NADIA, JSON.stringify([{ account: 'pro_owes', pro_id: NADIA, amount: 30000 }, { account: 'received', amount: -30000 }])])).rows[0].id;
  await setup(`UPDATE public.visit_fees SET refund = 'charged', refund_txn = $2, refund_charge_due = now() + interval '7 days' WHERE id = $1`, [four.fee, oldTxn]);
  await setup(`SELECT public.pay_rebalance($1, NULL)`, [NADIA]);
  await age(oldTxn, 30);
  const old = await feeOf(NADIA, oldTxn);
  ok('an old-rule refund charge, 30 days old, is waiting on its appeal: not overdue', old?.status === 'appeal' && (await blocked(NADIA)) === false);
  ok('he may appeal it too', (await me(NADIA, A, [four.fee, 'I returned the money to her in cash'])).value?.ok === true);
  await me(OWNER, VF, [four.fee, 'refund_cancel', 'She confirmed he returned it']);
  ok('cancelled: reversed, never edited, and nothing owed for it', !(await feeOf(NADIA, oldTxn))
    && (await setup(`SELECT count(*)::int AS n FROM public.ledger_txns WHERE reverses = $1`, [oldTxn])).rows[0].n === 1
    && (await sound(NADIA)).length === 0);
}

heading('Reminders: one a day at most, combined, amounts and job numbers only');
{
  const a = await debt(KAMRAN, 120);
  const b = await debt(KAMRAN, 80);
  await age(a, 11);
  await age(b, 11);
  await sent();
  await setup(`SELECT public.pay_clock()`);
  let m = to(await sent(), 'kamran');
  ok('3 days before: one message for both fees, with the total', m.length === 1 && /Rs 200 due to Pechkas on/.test(m[0].title), JSON.stringify(m));
  await setup(`SELECT public.pay_clock()`);
  ok('not twice the same day', to(await sent(), 'kamran').length === 0);
  await setup(`DELETE FROM public.pay_reminders WHERE pro_id = $1`, [KAMRAN]);
  await age(a, 17);
  await setup(`SELECT public.pay_clock()`);
  m = to(await sent(), 'kamran');
  ok('the last grace day comes first when two are due at once', m.length === 1 && /Last day/.test(m[0].title));
  await setup(`DELETE FROM public.pay_reminders WHERE pro_id = $1`, [KAMRAN]);
  await age(a, 18);
  await setup(`SELECT public.pay_clock()`);
  ok('the day they stop', to(await sent(), 'kamran').some((x) => /have stopped/.test(x.title)));
  await settle(KAMRAN, 200);
}

heading('What the office and he can see, and nobody else');
{
  const a = await debt(BILAL, 300);
  await age(a, 19);
  const fl = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('the office sees him flagged as overdue', JSON.stringify(fl?.people?.find((x) => x.id === BILAL)?.flags ?? []).includes('overdue'));
  const money = (await me(OWNER, `SELECT public.admin_money()`)).value;
  const row = money?.pros?.find((x) => x.id === BILAL);
  ok('Money shows his overdue amount and whether he may have more time', Number(row?.pay?.overdue_paisa) === 30000 && row?.pay?.can_extend === true
    && Number(money?.extend_days?.default) === 7);
  const mine = (await me(BILAL, `SELECT public.pro_money()`)).value;
  ok('he sees each fee with its dates and status', mine?.pay?.fees?.some((f) => f.txn === a && f.status === 'stopped' && f.due_day && f.last_grace_day));
  ok('his list says so', (await me(BILAL, `SELECT public.pro_feed()`)).value?.pay_blocked === true);
  denied('nobody reads what-paid-what', await as('authenticated', BILAL, `SELECT * FROM public.pay_allocations`));
  denied('nor the extensions', await as('authenticated', OWNER, `SELECT * FROM public.pay_extensions`));
  denied('nor the reminders', await as('authenticated', BILAL, `SELECT * FROM public.pay_reminders`));
  denied('nobody calls the rebalance', await as('authenticated', OWNER, `SELECT public.pay_rebalance('${BILAL}', NULL)`));
  denied('nor reads another man\'s position', await as('authenticated', ASAD, `SELECT public.pay_state('${BILAL}')`));
  nothing('a stranger cannot appeal', await as('anon', null, `SELECT public.pro_appeal_refund(gen_random_uuid(), 'Something to say here')`));
  await settle(BILAL, 300);
}

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|TX\d|EP\d|Unwell|stolen|photo/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a transaction ID or the office\'s words', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Run a second time');
{
  const before = (await setup(`SELECT count(*)::int AS n FROM public.pay_allocations`)).rows[0].n;
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261112200000_pay_by_date.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and writes no new what-paid-what line', (await setup(`SELECT count(*)::int AS n FROM public.pay_allocations`)).rows[0].n === before);
}

report();
