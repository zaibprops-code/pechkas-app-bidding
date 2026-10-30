/**
 * Pay Pechkas: a technician says he has paid; the office confirms it.
 *
 * What must hold: only a technician can claim, for no more than he owes,
 * with a transaction ID and a screenshot that is his own, really uploaded
 * and used once; one claim waits at a time. A claim lowers nothing — only
 * the office's confirmation does, through the same ledger rule as typing it
 * in, once however many times it is pressed. A refusal is told to him
 * without the office's words in the notification. Nobody else can see or
 * decide a claim. And the migration runs twice.
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

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, n] of [[BILAL, 'bilal-pay'], [OWNER_PHONE, 'zohaib-pay']]) await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(n)]);
await call(OWNER, `SELECT public.admin_set_alert_phone('923009999977')`);

// Bilal owes Rs 900: the commission on a job, posted the way the trigger posts it.
const job = (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status)
  VALUES ($1, 'ac', 'Service', 900000, 'today', 'morning', 'F-11', 'Street 1', 'House 1', 'open') RETURNING id, ref`, [AYESHA])).rows[0];
await setup(`SELECT public.post_txn('commission:' || $1, 'commission', $1::uuid, $2::uuid, '[{"account":"pro_owes","pro_id":"${BILAL}","amount":90000},{"account":"commission","amount":-90000}]'::jsonb)`, [job.id, BILAL]);
const owed = async (who) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [who])).rows[0].n);
ok('Bilal owes Rs 900', (await owed(BILAL)) === 90000);

const upload = async (who, name) => {
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [`${who}/${name}`]);
  return `${who}/${name}`;
};
const CLAIM = `SELECT public.claim_payment($1, $2, $3, $4)`;
const claim = async (who, amount, method, ref, shot) => (await call(who, CLAIM, [amount, method, ref, shot])).value;

let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sentSince() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

// =============================================================================
heading('Who may say he has paid, and with what');
const shot = await upload(BILAL, 'pay_1.jpg');
ok('a stranger cannot ask at all', Boolean((await as('anon', null, CLAIM, [50000, 'jazzcash', 'TX123456', shot])).error));
ok('a customer is refused', (await claim(AYESHA, 50000, 'jazzcash', 'TX123456', shot))?.ok === false);
ok('Asad, who owes nothing, is told so', (await claim(ASAD, 50000, 'jazzcash', 'TX123456', await upload(ASAD, 'x.jpg')))?.field === 'amount');
ok('more than he owes is refused', (await claim(BILAL, 100000, 'jazzcash', 'TX123456', shot))?.field === 'amount');
ok('part of a rupee is refused', (await claim(BILAL, 50050, 'jazzcash', 'TX123456', shot))?.field === 'amount');
ok('cash is not a way to send it in the app', (await claim(BILAL, 50000, 'cash', 'TX123456', shot))?.field === 'method');
ok('no transaction ID is refused', (await claim(BILAL, 50000, 'jazzcash', '  ', shot))?.field === 'reference');
ok('a CNIC as the ID is refused', (await claim(BILAL, 50000, 'jazzcash', ['61101', '1234567', '1'].join('-'), shot))?.field === 'reference');
ok('no screenshot is refused', (await claim(BILAL, 50000, 'jazzcash', 'TX123456', null))?.field === 'screenshot');
ok('a screenshot never uploaded is refused', (await claim(BILAL, 50000, 'jazzcash', 'TX123456', `${BILAL}/never.jpg`))?.field === 'screenshot');
ok('somebody else\'s picture is refused', (await claim(BILAL, 50000, 'jazzcash', 'TX123456', await upload(ASAD, 'his.jpg')))?.field === 'screenshot');
ok('nothing was recorded by any of that', (await setup(`SELECT count(*)::int AS n FROM public.payment_claims`)).rows[0].n === 0);

heading('He says he has paid Rs 500');
await sentSince();
const first = await claim(BILAL, 50000, 'jazzcash', 'TX123456', shot);
ok('it is taken', first?.ok === true, JSON.stringify(first));
ok('what he owes has NOT gone down', (await owed(BILAL)) === 90000);
const toOffice = await sentSince();
ok('the office\'s phone is told', toOffice.some((m) => m.to === token('zohaib-pay') && m.title.includes('Rs 500')), JSON.stringify(toOffice));
ok('and nobody else is', toOffice.every((m) => m.to === token('zohaib-pay')));
ok('a second claim waits until the first is decided', (await claim(BILAL, 10000, 'easypaisa', 'EP999', await upload(BILAL, 'pay_2.jpg')))?.field === 'claim');
const mine = (await call(BILAL, `SELECT public.my_payment_claims()`)).value;
ok('he sees it waiting', mine?.[0]?.status === 'pending' && mine[0].amount_paisa === 50000);
ok('Asad sees none of it', JSON.stringify((await call(ASAD, `SELECT public.my_payment_claims()`)).value) === '[]');

heading('Only the office decides');
const list = (await call(OWNER, `SELECT public.admin_payment_claims('pending')`)).value;
ok('the office sees it, with the screenshot and what he owes', list?.[0]?.screenshot_path === shot && list[0].owed_paisa === 90000 && list[0].pro_name === 'Bilal Ahmed');
ok('a technician cannot see the list', (await call(BILAL, `SELECT public.admin_payment_claims('pending')`)).value === null);
ok('he cannot confirm his own', (await call(BILAL, `SELECT public.admin_confirm_claim($1)`, [first.id])).value?.ok === false);
ok('he cannot turn it down either', (await call(BILAL, `SELECT public.admin_reject_claim($1, 'no')`, [first.id])).value?.ok === false);
ok('and nobody can read the table directly', Boolean((await as('authenticated', BILAL, `SELECT * FROM public.payment_claims`)).error) || (await as('authenticated', BILAL, `SELECT * FROM public.payment_claims`)).rows.length === 0);

heading('The office confirms it');
const yes = (await call(OWNER, `SELECT public.admin_confirm_claim($1)`, [first.id])).value;
ok('confirmed', yes?.ok === true, JSON.stringify(yes));
ok('now he owes Rs 400', (await owed(BILAL)) === 40000);
ok('pressed again, it is refused and recorded once', (await call(OWNER, `SELECT public.admin_confirm_claim($1)`, [first.id])).value?.ok === false && (await owed(BILAL)) === 40000);
const txn = (await setup(`SELECT method, reference, kind FROM public.ledger_txns WHERE idempotency_key = $1`, [`settle:claim:${first.id}`])).rows[0];
ok('the ledger has it as a payment, with his method and ID', txn?.kind === 'settlement' && txn.method === 'jazzcash' && txn.reference === 'TX123456');
ok('he is told it was received', (await sentSince()).some((m) => m.to === token('bilal-pay') && /Rs 500/.test(m.title)));

heading('The office turns one down');
const second = await claim(BILAL, 40000, 'bank', 'BANK-777', await upload(BILAL, 'pay_3.png'));
ok('a new claim for the rest is taken', second?.ok === true);
ok('a reason is needed', (await call(OWNER, `SELECT public.admin_reject_claim($1, '')`, [second.id])).value?.field === 'reason');
await sentSince();
ok('turned down with a reason', (await call(OWNER, `SELECT public.admin_reject_claim($1, $2)`, [second.id, 'Nothing has arrived in the bank account yet.'])).value?.ok === true);
ok('what he owes is unchanged', (await owed(BILAL)) === 40000);
const told = await sentSince();
ok('he is told it was not confirmed', told.some((m) => m.to === token('bilal-pay') && m.title.includes('not confirmed')));
ok('without the office\'s words in the notification', told.every((m) => !JSON.stringify(m).includes('Nothing has arrived')));
ok('he reads the reason in the app', (await call(BILAL, `SELECT public.my_payment_claims()`)).value?.[0]?.reason === 'Nothing has arrived in the bank account yet.');
ok('it cannot then be confirmed', (await call(OWNER, `SELECT public.admin_confirm_claim($1)`, [second.id])).value?.ok === false);
ok('the same screenshot cannot be sent again', (await claim(BILAL, 40000, 'bank', 'BANK-777', `${BILAL}/pay_3.png`))?.field === 'screenshot');

heading('A claim larger than he now owes');
const third = await claim(BILAL, 40000, 'easypaisa', 'EP-1', await upload(BILAL, 'pay_4.webp'));
await setup(`SELECT public.post_txn('settle:by-hand', 'settlement', NULL, $1::uuid, '[{"account":"received","amount":30000},{"account":"pro_owes","pro_id":"${BILAL}","amount":-30000}]'::jsonb)`, [BILAL]);
ok('if the office already recorded part by hand, confirming is refused, not doubled', (await call(OWNER, `SELECT public.admin_confirm_claim($1)`, [third.id])).value?.field === 'amount' && (await owed(BILAL)) === 10000);

heading('Run a second time');
let twice = null;
try {
  await db.exec(await readFile(join(MIGRATIONS, '20261103000000_pay_pechkas.sql'), 'utf8'));
} catch (e) {
  twice = e.message;
}
ok('the migration runs again without complaint', twice === null, twice);
ok('and the claims are still there', (await setup(`SELECT count(*)::int AS n FROM public.payment_claims`)).rows[0].n === 3);

report();
