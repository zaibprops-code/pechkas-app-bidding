/**
 * Pay Pechkas (the owner's decision A5, 17 November 2026): a technician's
 * "I have paid" counts at once.
 *
 * What must hold: only a technician can pay, for no more than he owes, with
 * a transaction number used once ever (spaces and capitals ignored) and a
 * screenshot that is his own, really uploaded and used once. It counts at
 * once, through the same ledger line the office's Confirm wrote, and the
 * office is not told about each one: it has "Payments to check" and at most
 * one notice a day. For 30 days the office may mark one "Not received" or
 * "Received less": the line is reversed and what arrived is recorded, so he
 * owes exactly the missing amount more, and the ledger stays sound. A
 * second within 90 days pauses his new offers by rule, with no end date;
 * he appeals in writing, an appeal unanswered for 3 days is a reminder, and
 * only the office lifts it. Payments sent before A5 stay with the office.
 * A payment company can make a payment final later, and only through the
 * service role. Nothing calls a payment "verified". And it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const BILAL = 'a7333333-3333-4333-8333-333333333333';
const ASAD = 'a7444444-4444-4444-8444-444444444444';
const AYESHA = 'a7111111-1111-4111-8111-111111111111';
const OWNER = 'a7999999-9999-4999-8999-999999999999';
const OWNER_PHONE = 'a7888888-8888-4888-8888-888888888888';
for (const [id, phone, email, role, name] of [
  [BILAL, '923003333377', null, 'pro', 'Bilal'],
  [ASAD, '923004444477', null, 'pro', 'Asad'],
  [AYESHA, '923001111177', null, 'customer', 'Ayesha'],
  [OWNER, null, 'owner-pay@example.com', null, null],
  [OWNER_PHONE, '923009999977', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved')`, [id, full]);
}
await setup(`SELECT public.make_owner('owner-pay@example.com', 'Zohaib')`);
// Due dates count from when D36 began; start it long ago, as the due-date tests do.
await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, n] of [[BILAL, 'bilal-pay'], [ASAD, 'asad-pay'], [OWNER_PHONE, 'zohaib-pay']]) await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(n)]);
await call(OWNER, `SELECT public.admin_set_alert_phone('923009999977')`);

let k = 0;
/** A commission posted the way the trigger posts it. */
async function debt(pro, rupees) {
  k += 1;
  const lines = JSON.stringify([{ account: 'pro_owes', pro_id: pro, amount: rupees * 100 }, { account: 'commission', amount: -rupees * 100 }]);
  return (await setup(`SELECT public.post_txn($1, 'commission', NULL, $2, $3::jsonb) AS id`, [`commission:test-${k}`, pro, lines])).rows[0].id;
}
async function age(txn, days) {
  await setup(`ALTER TABLE public.ledger_txns DISABLE TRIGGER ledger_txns_once`);
  await setup(`UPDATE public.ledger_txns SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [txn, days]);
  await setup(`ALTER TABLE public.ledger_txns ENABLE TRIGGER ledger_txns_once`);
}
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const blocked = async (pro) => (await setup(`SELECT public.pay_blocked($1) AS b`, [pro])).rows[0].b;
const offerField = async (pro) => (await call(pro, `SELECT public.make_offer(gen_random_uuid(), 300000, 20, NULL)`)).value?.field;
/** The rules of the ledger that must hold after anything (the same as the due-date tests). */
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
      (SELECT coalesce(sum(e.amount_paisa), 0) FROM public.ledger_entries e) = 0 AS ledger_balances
  `, [pro])).rows[0];
  return Object.entries(r).filter(([, v]) => v !== true).map(([n]) => n);
}

let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/pay_${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const CLAIM = `SELECT public.claim_payment($1, $2, $3, $4)`;
const claim = async (who, amount, method, ref, shot) => (await call(who, CLAIM, [amount, method, ref, shot ?? (await upload(who))])).value;
const claimRow = async (id) => (await setup(`SELECT * FROM public.payment_claims WHERE id = $1`, [id])).rows[0];
const CORRECT = `SELECT public.admin_claim_correct($1, $2, $3)`;
const correct = async (id, received, note = 'Checked the JazzCash account') => (await call(OWNER, CORRECT, [id, received, note])).value;

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

// Bilal owes Rs 900.
await debt(BILAL, 900);
ok('Bilal owes Rs 900', (await owed(BILAL)) === 90000);

// =============================================================================
heading('Who may say he has paid, and with what');
{
  const shot = await upload(BILAL);
  ok('a stranger cannot ask at all', Boolean((await as('anon', null, CLAIM, [50000, 'jazzcash', 'TX123456', shot])).error));
  ok('a customer is refused', (await claim(AYESHA, 50000, 'jazzcash', 'TX123456', shot))?.ok === false);
  ok('Asad, who owes nothing, is told so', (await claim(ASAD, 50000, 'jazzcash', 'TX123456'))?.field === 'amount');
  ok('more than he owes is refused', (await claim(BILAL, 100000, 'jazzcash', 'TX123456', shot))?.field === 'amount');
  ok('part of a rupee is refused', (await claim(BILAL, 50050, 'jazzcash', 'TX123456', shot))?.field === 'amount');
  ok('cash is not a way to send it in the app', (await claim(BILAL, 50000, 'cash', 'TX123456', shot))?.field === 'method');
  ok('no transaction number is refused', (await claim(BILAL, 50000, 'jazzcash', '  ', shot))?.field === 'reference');
  ok('a number of only dashes is refused', (await claim(BILAL, 50000, 'jazzcash', '- - -', shot))?.field === 'reference');
  ok('a CNIC as the number is refused', (await claim(BILAL, 50000, 'jazzcash', ['61101', '1234567', '1'].join('-'), shot))?.field === 'reference');
  ok('no screenshot is refused', (await call(BILAL, CLAIM, [50000, 'jazzcash', 'TX123456', null])).value?.field === 'screenshot');
  ok('a screenshot never uploaded is refused', (await claim(BILAL, 50000, 'jazzcash', 'TX123456', `${BILAL}/never.jpg`))?.field === 'screenshot');
  ok('somebody else\'s picture is refused', (await claim(BILAL, 50000, 'jazzcash', 'TX123456', await upload(ASAD)))?.field === 'screenshot');
  ok('nothing was recorded by any of that', (await setup(`SELECT count(*)::int AS n FROM public.payment_claims`)).rows[0].n === 0 && (await owed(BILAL)) === 90000);
}

// =============================================================================
heading('He says he has paid Rs 500: it counts at once');
let first;
{
  await sentSince();
  first = await claim(BILAL, 50000, 'jazzcash', 'TX123456');
  ok('it is taken', first?.ok === true, JSON.stringify(first));
  ok('what he owes has gone down at once, to Rs 400', (await owed(BILAL)) === 40000 && Number(first.owed_paisa) === 40000);
  const txn = (await setup(`SELECT kind, method, reference FROM public.ledger_txns WHERE idempotency_key = $1`, [`settle:claim:${first.id}`])).rows[0];
  ok('the ledger has the same line the office\'s Confirm wrote, with his method and number', txn?.kind === 'settlement' && txn.method === 'jazzcash' && txn.reference === 'TX123456');
  const row = await claimRow(first.id);
  ok('counted, final in 3 days, correctable for 30',
    row.status === 'counted' && row.txn_id && row.checked_by === 'nobody'
    && Math.round((row.final_at - row.created_at) / 86400000) === 3 && Math.round((row.correct_until - row.created_at) / 86400000) === 30);
  ok('nobody is told: not the office, not him', (await sentSince()).length === 0);
  const mine = (await call(BILAL, `SELECT public.my_payment_claims()`)).value;
  ok('he sees it counted, not final yet, and the last day it can be corrected', mine?.[0]?.status === 'counted' && mine[0].final === false && mine[0].correct_until);
  ok('Asad sees none of it', JSON.stringify((await call(ASAD, `SELECT public.my_payment_claims()`)).value) === '[]');
  ok('the ledger is sound', (await sound(BILAL)).length === 0, (await sound(BILAL)).join(', '));
  const st = (await call(BILAL, `SELECT public.pro_money()`)).value?.pay;
  ok('his money screen has it, with the 3, 30 and 90 days', st?.claims?.[0]?.id === first.id && st.final_days === 3 && st.correct_days === 30 && st.strike_days === 90 && st.pay_pause === null);
}

heading('A transaction number is used once, ever');
{
  ok('the same number again is refused', (await claim(BILAL, 10000, 'jazzcash', 'TX123456'))?.field === 'reference');
  ok('with spaces, dashes or small letters it is the same number', (await claim(BILAL, 10000, 'easypaisa', ' tx-123 456 '))?.field === 'reference');
  const r = (await call(BILAL, CLAIM, [10000, 'jazzcash', 'tx123456', await upload(BILAL)])).value;
  ok('and he is told in plain words', r?.why === 'This transaction number has already been used.');
  await debt(ASAD, 300);
  ok('Asad cannot use Bilal\'s number either', (await claim(ASAD, 10000, 'bank', 'TX123456'))?.field === 'reference');
  const second = await claim(BILAL, 10000, 'easypaisa', 'EP-998877');
  ok('a new number is taken, without waiting for the first', second?.ok === true && (await owed(BILAL)) === 30000);
}

// =============================================================================
heading('Payments to check: no notice each time, one a day at most');
{
  const list = (await call(OWNER, `SELECT public.admin_payments_to_check()`)).value;
  ok('the office sees both, oldest first, with the days left of the 30',
    list?.to_check?.length === 2 && list.to_check[0].reference === 'TX123456' && list.to_check[1].reference === 'EP-998877'
    && list.to_check[0].days_left === 30 && list.to_check[0].screenshot_path && list.to_check[0].pro_name === 'Bilal Ahmed', JSON.stringify(list?.to_check));
  ok('a technician cannot see the list', (await call(BILAL, `SELECT public.admin_payments_to_check()`)).value === null);
  const direct = await as('authenticated', BILAL, `SELECT * FROM public.payment_claims`);
  ok('nobody can read the table directly', Boolean(direct.error) || (direct.rows?.length ?? 0) === 0);
  await sentSince();
  await setup(`SELECT public.payments_to_check_clock()`);
  const told = await sentSince();
  ok('the office\'s phone is told once: "2 payments to check"', told.length === 1 && told[0].to === token('zohaib-pay') && told[0].title === '2 payments to check', JSON.stringify(told));
  await setup(`SELECT public.payments_to_check_clock()`);
  ok('not twice in a day', (await sentSince()).length === 0);
  ok('he cannot mark his own as arrived', (await call(BILAL, `SELECT public.admin_claim_arrived($1)`, [first.id])).value?.ok === false);
  ok('the office marks the first one as arrived', (await call(OWNER, `SELECT public.admin_claim_arrived($1)`, [first.id])).value?.ok === true);
  const after = (await call(OWNER, `SELECT public.admin_payments_to_check()`)).value;
  ok('it leaves "Payments to check" but stays correctable', after.to_check.length === 1 && after.arrived?.[0]?.id === first.id && after.arrived[0].days_left === 30);
  ok('marking it again changes nothing', (await call(OWNER, `SELECT public.admin_claim_arrived($1)`, [first.id])).value?.ok === true);
}

// =============================================================================
heading('"Not received": the line is reversed, nothing is edited');
let ep;
{
  ep = (await setup(`SELECT id FROM public.payment_claims WHERE reference = 'EP-998877'`)).rows[0].id;
  ok('he cannot correct his own', (await call(BILAL, CORRECT, [ep, 0, 'not here'])).value?.ok === false);
  ok('a note is needed', (await correct(ep, 0, ''))?.field === 'note');
  ok('the whole amount is not a correction', (await correct(ep, 10000))?.field === 'received');
  ok('more than the amount is not either', (await correct(ep, 20000))?.field === 'received');
  ok('part of a rupee is refused', (await correct(ep, 50))?.field === 'received');
  await sentSince();
  const r = await correct(ep, 0, 'No such payment on our Easypaisa');
  ok('marked "Not received"', r?.ok === true && r.paused === false, JSON.stringify(r));
  ok('he owes the Rs 100 again, and exactly that', (await owed(BILAL)) === 40000);
  const row = await claimRow(ep);
  ok('the claim says so, with who and the note', row.status === 'not_received' && Number(row.received_paisa) === 0 && row.corrected_by === 'Zohaib' && row.correction_note === 'No such payment on our Easypaisa');
  const rev = (await setup(`SELECT t.kind FROM public.ledger_txns t WHERE t.reverses = $1`, [row.txn_id])).rows;
  ok('a reversal of the payment\'s line, and the line itself untouched', rev.length === 1 && rev[0].kind === 'reversal'
    && (await setup(`SELECT count(*)::int AS n FROM public.ledger_entries WHERE txn_id = $1`, [row.txn_id])).rows[0].n === 2);
  ok('the ledger is sound', (await sound(BILAL)).length === 0, (await sound(BILAL)).join(', '));
  const told = await sentSince();
  ok('he is told it was not received in full', told.some((m) => m.to === token('bilal-pay') && m.title === 'A payment was not received in full'));
  ok('without the office\'s words in the notification', told.every((m) => !JSON.stringify(m).includes('Easypaisa')));
  const mine = (await call(BILAL, `SELECT public.my_payment_claims()`)).value?.find((c) => c.id === ep);
  ok('he reads the note and the missing amount in the app', mine?.note === 'No such payment on our Easypaisa' && Number(mine.missing_paisa) === 10000);
  ok('it cannot be corrected twice', /already been corrected/.test((await correct(ep, 0))?.why ?? ''));
  const flags = (await call(OWNER, `SELECT public.admin_flags()`)).value;
  ok('a flag, the first time already', flags?.people?.find((p) => p.id === BILAL)?.flags?.some((f) => f.kind === 'short_payments' && f.n === 1));
  ok('one alone does not pause him', (await offerField(BILAL)) !== 'pay_paused');
}

heading('After 30 days a payment can no longer be corrected');
{
  const late = await claim(BILAL, 10000, 'bank', 'BANK-5555');
  await setup(`UPDATE public.payment_claims SET correct_until = now() - interval '1 minute' WHERE id = $1`, [late.id]);
  ok('refused, saying why', /30 days have passed/.test((await correct(late.id, 0))?.why ?? ''));
  ok('and it is off "Payments to check"', !(await call(OWNER, `SELECT public.admin_payments_to_check()`)).value.to_check.some((c) => c.id === late.id));
}

// =============================================================================
heading('"Received less" a second time within 90 days: his new offers pause by rule');
{
  // A job he has offered on, so the pause has something to take back.
  const j = (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status)
    VALUES ($1, 'ac', 'Service', 300000, 'today', 'morning', 'F-11', 'Street 1', 'House 1', 'open') RETURNING id`, [AYESHA])).rows[0].id;
  await setup(`INSERT INTO public.offers (job_id, pro_id, price_paisa, eta_minutes, expires_at) VALUES ($1, $2, 300000, 20, now() + interval '10 minutes')`, [j, BILAL]);
  const before = await owed(BILAL);
  await sentSince();
  const r = await correct(first.id, 20000, 'Only Rs 200 reached JazzCash');
  ok('the Rs 500, already marked arrived, is corrected to Rs 200', r?.ok === true, JSON.stringify(r));
  ok('he owes exactly the missing Rs 300 more', (await owed(BILAL)) === before + 30000);
  const row = await claimRow(first.id);
  const got = (await setup(`SELECT kind, method, reference FROM public.ledger_txns WHERE id = $1`, [row.received_txn])).rows[0];
  ok('the line is reversed and a new one records the Rs 200 that arrived', row.status === 'received_less' && Number(row.received_paisa) === 20000
    && got?.kind === 'settlement' && got.reference === 'TX123456'
    && (await setup(`SELECT 1 FROM public.ledger_txns WHERE reverses = $1`, [row.txn_id])).rows.length === 1);
  ok('the ledger is sound', (await sound(BILAL)).length === 0, (await sound(BILAL)).join(', '));
  ok('it was the second in 90 days: paused', r.paused === true && (await setup(`SELECT public.pay_paused($1) AS p`, [BILAL])).rows[0].p === true);
  ok('his waiting offer is withdrawn', (await setup(`SELECT status FROM public.offers WHERE job_id = $1`, [j])).rows[0].status === 'withdrawn');
  ok('a new offer is refused, saying why', (await offerField(BILAL)) === 'pay_paused');
  const why = (await call(BILAL, `SELECT public.make_offer(gen_random_uuid(), 300000, 20, NULL)`)).value?.why ?? '';
  ok('in plain words, with no "verified" and no accusation', /did not receive the full amount/.test(why) && !/verif|fraud|false/i.test(why), why);
  const told = await sentSince();
  ok('he is told his new offers are paused', told.some((m) => m.to === token('bilal-pay') && m.title === 'Your new offers are paused'));
  const feed = (await call(BILAL, `SELECT public.pro_feed()`)).value;
  ok('his jobs screen shows the pause with both payments, and no date', feed?.pay_pause?.strikes?.length === 2 && feed.paused_until === null && feed.pause_note === null);
  ok('and it lists no jobs to him', (feed?.jobs ?? []).length === 0);
  ok('the office\'s own lift does not lift a pause by rule', (await call(OWNER, `SELECT public.admin_lift_pause($1, 'Trying to lift it')`, [BILAL])).value?.ok === false
    && (await setup(`SELECT public.pay_paused($1) AS p`, [BILAL])).rows[0].p === true);
  ok('the office may still pause him for a few days on top', (await call(OWNER, `SELECT public.admin_pause_pro($1, 1, 'A separate matter, one day')`, [BILAL])).value?.ok === true);
  await call(OWNER, `SELECT public.admin_lift_pause($1, 'That one day is over now')`, [BILAL]);
  ok('lifting that leaves the pause by rule in place', (await setup(`SELECT public.pay_paused($1) AS p`, [BILAL])).rows[0].p === true);
}

heading('Two shortfalls more than 90 days apart do not pause');
{
  await debt(ASAD, 300);
  const a = await claim(ASAD, 10000, 'jazzcash', 'ASAD-1');
  const b = await claim(ASAD, 10000, 'jazzcash', 'ASAD-2');
  await correct(a.id, 0);
  await setup(`UPDATE public.payment_claims SET corrected_at = now() - interval '91 days' WHERE id = $1`, [a.id]);
  const r = await correct(b.id, 0);
  ok('the second is 91 days after the first: a flag, no pause', r?.ok === true && r.paused === false && (await offerField(ASAD)) !== 'pay_paused');
}

// =============================================================================
heading('His written appeal, and the office\'s written answer');
{
  const PAPPEAL = `SELECT public.pro_pay_appeal($1)`;
  ok('Asad, not paused, has nothing to appeal', (await call(ASAD, PAPPEAL, ['I paid all of it, honestly.'])).value?.ok === false);
  ok('too short is refused', (await call(BILAL, PAPPEAL, ['wrong'])).value?.field === 'words');
  ok('a CNIC number is refused', (await call(BILAL, PAPPEAL, [`My card is ${['61101', '1234567', '1'].join('-')}`])).value?.field === 'words');
  await sentSince();
  ok('he writes', (await call(BILAL, PAPPEAL, ['The bank held the second payment for a day; the reference is TX123456.'])).value?.ok === true);
  ok('the office is told', (await sentSince()).some((m) => m.to === token('zohaib-pay') && /payment pause/.test(m.title)));
  ok('one waiting at a time', /has your appeal/.test((await call(BILAL, PAPPEAL, ['Writing again about the same pause.'])).value?.why ?? ''));
  let ex = (await call(OWNER, `SELECT public.admin_exceptions()`)).value;
  let p = ex?.pay_pauses?.find((x) => x.pro_id === BILAL);
  ok('under Exceptions: the pause, both payments and his words, not yet a reminder',
    p?.view?.appeal?.status === 'waiting' && p.view.strikes.length === 2 && p.waiting_days === 0 && p.remind === false && ex.remind_days === 3);
  await setup(`UPDATE public.pay_pause_appeals SET at = now() - interval '3 days 1 hour' WHERE pro_id = $1`, [BILAL]);
  ex = (await call(OWNER, `SELECT public.admin_exceptions()`)).value;
  p = ex?.pay_pauses?.find((x) => x.pro_id === BILAL);
  ok('unanswered for 3 days, it is a reminder', p?.remind === true && p.waiting_days === 3);
  ok('he cannot answer his own', (await call(BILAL, `SELECT public.admin_pay_pause($1, true, 'Lifting it myself')`, [p.id])).value?.ok === false);
  ok('an answer needs a reason', (await call(OWNER, `SELECT public.admin_pay_pause($1, false, '')`, [p.id])).value?.field === 'note');
  await sentSince();
  ok('the office keeps the pause, in writing', (await call(OWNER, `SELECT public.admin_pay_pause($1, false, 'The second payment never reached us. Pay the Rs 400 first.')`, [p.id])).value?.ok === true);
  ok('he is told there is an answer', (await sentSince()).some((m) => m.to === token('bilal-pay') && m.title === 'Pechkas has answered your appeal'));
  const view = (await call(BILAL, `SELECT public.pro_money()`)).value?.pay?.pay_pause;
  ok('he reads it in the app, and may write again', view?.appeal?.status === 'kept' && /never reached us/.test(view.appeal.note) && view.can_appeal === true);
  ok('keeping it again without a new appeal is refused', /not written yet/.test((await call(OWNER, `SELECT public.admin_pay_pause($1, false, 'Still kept for now')`, [p.id])).value?.why ?? ''));
  ok('still paused', (await offerField(BILAL)) === 'pay_paused');
  await sentSince();
  ok('the office lifts it, in writing', (await call(OWNER, `SELECT public.admin_pay_pause($1, true, 'Paid in full and explained.')`, [p.id])).value?.ok === true);
  ok('he is told', (await sentSince()).some((m) => m.to === token('bilal-pay') && m.title === 'Your pause has been lifted'));
  ok('his new offers are open again', (await offerField(BILAL)) !== 'pay_paused' && (await setup(`SELECT public.pay_paused($1) AS p`, [BILAL])).rows[0].p === false);
  ok('lifting it twice is refused', (await call(OWNER, `SELECT public.admin_pay_pause($1, true, 'Again, by mistake')`, [p.id])).value?.ok === false);
  ok('Exceptions no longer lists it', !(await call(OWNER, `SELECT public.admin_exceptions()`)).value.pay_pauses.some((x) => x.pro_id === BILAL));
}

// =============================================================================
heading('Due dates see a payment at once, and a correction at once');
{
  const NADIR = 'a7555555-5555-4555-8555-555555555555';
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923005555577')`, [NADIR]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'pro', 'Nadir')`, [NADIR]);
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, 'Nadir Ali', '{ac}', 4, '{F-11}', 'approved')`, [NADIR]);
  const fee = await debt(NADIR, 500);
  await age(fee, 20);
  ok('overdue: his new offers have stopped', (await blocked(NADIR)) === true && (await offerField(NADIR)) === 'overdue');
  const c = await claim(NADIR, 50000, 'jazzcash', 'NADIR-777');
  ok('he pays it in the app: offers open again at once', c?.ok === true && (await blocked(NADIR)) === false && (await offerField(NADIR)) !== 'overdue');
  await correct(c.id, 0, 'Nothing arrived from this number');
  ok('marked not received: stopped again at once', (await blocked(NADIR)) === true && (await owed(NADIR)) === 50000);
  ok('the ledger is sound', (await sound(NADIR)).length === 0, (await sound(NADIR)).join(', '));
}

// =============================================================================
heading('Payments sent before A5 stay with the office, under the old rule');
{
  const old = (await setup(`INSERT INTO public.payment_claims (pro_id, amount_paisa, method, reference, screenshot_path)
    VALUES ($1, 10000, 'bank', 'OLD-1', $2) RETURNING id`, [ASAD, await upload(ASAD)])).rows[0].id;
  ok('it waits, and protects him as before', (await claimRow(old)).status === 'pending');
  ok('a new payment waits for it', (await claim(ASAD, 10000, 'jazzcash', 'ASAD-3'))?.field === 'claim');
  ok('it cannot be corrected the new way', /old rule/.test((await correct(old, 0))?.why ?? ''));
  const before = await owed(ASAD);
  await sentSince();
  ok('the office confirms it as before', (await call(OWNER, `SELECT public.admin_confirm_claim($1)`, [old])).value?.ok === true && (await owed(ASAD)) === before - 10000);
  ok('he is told it was received, as before: the office saw it', (await sentSince()).some((m) => m.to === token('asad-pay') && m.title === 'Payment received: Rs 100'));
}

// =============================================================================
heading('A payment company can make a payment final later, and nobody else can');
{
  await debt(ASAD, 200);
  const c = await claim(ASAD, 20000, 'jazzcash', 'PROV-4242');
  const PROV = `SELECT public.payment_provider_result($1, $2, $3)`;
  ok('a technician cannot call it', Boolean((await as('authenticated', ASAD, PROV, ['PROV-4242', 20000, 'JC-1'])).error));
  ok('the office cannot either', Boolean((await as('authenticated', OWNER, PROV, ['PROV-4242', 20000, 'JC-1'])).error));
  const svc = async (...p) => { const r = await as('service_role', null, PROV, p); return r.rows?.[0] ? Object.values(r.rows[0])[0] : r.error?.message; };
  ok('a different amount changes nothing', (await svc('PROV-4242', 10000, 'JC-1'))?.field === 'amount' && (await claimRow(c.id)).checked_by === 'nobody');
  ok('a CNIC as its reference is refused', (await svc('PROV-4242', 20000, ['61101', '1234567', '1'].join('-')))?.ok === false);
  ok('a matching answer makes it final at once', (await svc('prov 4242', 20000, 'JC-1'))?.ok === true
    && (await claimRow(c.id)).checked_by === 'provider' && (await claimRow(c.id)).final_at <= new Date());
}

// =============================================================================
heading('Nothing calls a payment "verified"');
{
  const words = (await setup(`SELECT key, en FROM public.push_words WHERE key ~ '^(settled|pay_short|pay_paused|pay_pause_lifted|pay_appeal_office|payments_to_check)\\.'`)).rows;
  ok('the payment messages say nothing of the kind', words.length === 12 && words.every((w) => !/verif/i.test(w.en)), JSON.stringify(words));
  const src = await readFile(join(MIGRATIONS, '20261117000000_payments_count_at_once.sql'), 'utf8');
  const said = [...src.matchAll(/refuse\('([^']*)'/g)].map((m) => m[1]);
  ok('nor does any refusal in this change', said.length > 10 && said.every((s) => !/verif/i.test(s)));
}

heading('Run a second time');
{
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261117000000_payments_count_at_once.sql'), 'utf8'));
    await db.exec(await readFile(join(MIGRATIONS, '20261103000000_pay_pechkas.sql'), 'utf8'));
    await db.exec(await readFile(join(MIGRATIONS, '20261117000000_payments_count_at_once.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and the payments and corrections are all still there', (await setup(`SELECT count(*)::int AS n FROM public.payment_claims WHERE status IN ('not_received', 'received_less')`)).rows[0].n === 5);
}

report();
