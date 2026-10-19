/**
 * Phase 5: money and trust.
 *
 * What must hold: commission is 10% of the LABOUR, rounded down, owed once
 * per job, and 20% of it set aside. The ledger always adds up to nothing,
 * and nobody — not the office, not the database owner — can change a line
 * of it; a mistake is undone by a reversal. A technician over the credit
 * limit cannot offer until he has paid. A payment is recorded once however
 * many times the button is pressed, and never for more than he owes. Stars
 * are hidden until both have rated or two days pass, and "New" until there
 * are three. Problems, claims and emergencies reach the office; an
 * emergency reaches the owner's phone at once.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'e1111111-1111-4111-8111-111111111111';
const SARA = 'e2222222-2222-4222-8222-222222222222';
const BILAL = 'e3333333-3333-4333-8333-333333333333';
const ASAD = 'e4444444-4444-4444-8444-444444444444';
const OWNER = 'e9999999-9999-4999-8999-999999999999';
const OWNER_PHONE = 'e8888888-8888-4888-8888-888888888888';

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
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

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name, lang] of [[AYESHA, 'ayesha', 'en'], [SARA, 'sara', 'en'], [BILAL, 'bilal', 'ur'], [ASAD, 'asad', 'en'], [OWNER_PHONE, 'zohaib', 'en']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', $2)`, [token(name), lang]);
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
const upload = async (who) => {
  files += 1;
  const name = `${who}/photo-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const balanced = async () => Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries`)).rows[0].n) === 0;

let n = 0;
let strangers = 0;
/**
 * A customer who has never used anybody. From phase 7 a returning customer
 * pays 7%, so every sum below that assumes 10% gets somebody new.
 */
async function stranger() {
  strangers += 1;
  const id = `e5555555-5555-4555-8555-${String(strangers).padStart(12, '0')}`;
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, `92300555${String(strangers).padStart(4, '0')}`]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Nadia')`, [id]);
  return id;
}
/** A job for `pro` at `price`, taken all the way to working. */
async function working(pro, price, customer = AYESHA) {
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
const FINISH = `SELECT public.finish_work($1, $2::jsonb, $3, $4)`;

// =============================================================================
heading('Parts, and commission on the labour only');

const j1 = await working(BILAL, 550000);
{
  const after = await upload(BILAL);
  ok('parts without a receipt are refused', (await me(BILAL, FINISH, [j1.id, JSON.stringify([after]), 150000, null])).value?.field === 'receipt');
  ok('parts in paisa are refused', (await me(BILAL, FINISH, [j1.id, JSON.stringify([after]), 150050, await upload(BILAL)])).value?.field === 'parts');
  ok('parts cannot be the whole price', (await me(BILAL, FINISH, [j1.id, JSON.stringify([after]), 550000, await upload(BILAL)])).value?.field === 'parts');
  ok('the receipt cannot be the after photo', (await me(BILAL, FINISH, [j1.id, JSON.stringify([after]), 150000, after])).value?.field === 'receipt');
  const receipt = await upload(BILAL);
  const r = (await me(BILAL, FINISH, [j1.id, JSON.stringify([after]), 150000, receipt])).value;
  ok('Bilal finishes: Rs 5,500, of which Rs 1,500 parts with the receipt', r?.ok === true, JSON.stringify(r));
  ok('commission is 10% of the Rs 4,000 labour: Rs 400', r?.commission_paisa === 40000 && r?.keeps_paisa === 510000);
  const row = await job(j1.id);
  ok('and it is written on the job, fixed', Number(row.parts_paisa) === 150000 && Number(row.commission_paisa) === 40000 && Number(row.collect_paisa) === 550000);
  ok('he owes Rs 400', (await owed(BILAL)) === 40000);
  const lines = (await setup(`SELECT e.account, e.amount_paisa::bigint AS a FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id WHERE t.job_id = $1 ORDER BY e.account`, [j1.id])).rows;
  ok('Rs 320 is earnings and Rs 80 the guarantee reserve', JSON.stringify(lines.map((l) => [l.account, Number(l.a)])) === JSON.stringify([['commission', -32000], ['pro_owes', 40000], ['reserve', -8000]]), JSON.stringify(lines));
  ok('the ledger adds up to nothing', await balanced());
  const mine = ((await me(AYESHA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === j1.id);
  ok('Ayesha sees what was parts, and can open the receipt', mine?.parts_paisa === 150000 && (await as('authenticated', AYESHA, `SELECT name FROM storage.objects WHERE name = $1`, [receipt])).rows.length === 1);
  ok('she does not see his commission', !('commission_paisa' in (mine ?? {})));
}
{
  const j = await working(ASAD, 123400);
  await me(ASAD, FINISH, [j.id, JSON.stringify([await upload(ASAD)]), 0, null]);
  ok('rounding is DOWN: 10% of Rs 1,234 is Rs 123.40, owed exactly', (await owed(ASAD)) === 12340);
  ok('20% of that set aside, also rounded down: 2,468 paisa', Number((await setup(`SELECT -sum(e.amount_paisa) AS n FROM public.ledger_entries e JOIN public.ledger_txns t ON t.id = e.txn_id WHERE t.job_id = $1 AND e.account = 'reserve'`, [j.id])).rows[0].n) === 2468);
}

// =============================================================================
heading('The ledger cannot be changed');

{
  const anyLine = (await setup(`SELECT id FROM public.ledger_entries LIMIT 1`)).rows[0].id;
  const tries = [
    ['nobody can change a line, not even the database owner', `UPDATE public.ledger_entries SET amount_paisa = 1 WHERE id = ${anyLine}`],
    ['nor delete one', `DELETE FROM public.ledger_entries WHERE id = ${anyLine}`],
    ['nor change a transaction', `UPDATE public.ledger_txns SET reference = 'x'`],
    ['nor empty the tables', `TRUNCATE public.ledger_entries`],
  ];
  for (const [what, sql] of tries) {
    const r = await setup(sql).then(() => 'allowed', (e) => e.message);
    ok(what, /written once/.test(r), r);
  }
  const r = await setup(`SELECT public.post_txn('broken', 'commission', NULL, NULL, '[{"account":"commission","amount":100}]'::jsonb)`).then(() => 'allowed', (e) => e.message);
  ok('a transaction that does not add up is refused', /add up to nothing/.test(r), r);
  nothing('a technician cannot read the ledger', await as('authenticated', BILAL, `SELECT * FROM public.ledger_entries`));
  nothing('nor the office directly', await as('authenticated', OWNER, `SELECT * FROM public.ledger_txns`));
  denied('nobody can write a line', await as('authenticated', BILAL, `INSERT INTO public.ledger_entries (txn_id, account, amount_paisa) VALUES (gen_random_uuid(), 'commission', 5)`));
  ok('nobody can post a transaction themselves', Boolean((await as('authenticated', OWNER, `SELECT public.post_txn('x1', 'settlement', NULL, NULL, '[]'::jsonb)`)).error));
  ok('nobody can ask what somebody else owes', Boolean((await as('authenticated', ASAD, `SELECT public.pro_owed($1)`, [BILAL])).error));
  const again = await setup(`SELECT public.post_txn('commission:' || $1, 'commission', $1::uuid, $2::uuid, '[{"account":"pro_owes","pro_id":"${BILAL}","amount":40000},{"account":"commission","amount":-40000}]'::jsonb) AS id`, [j1.id, BILAL]);
  ok('posting a job\'s commission twice does nothing the second time', again.rows[0].id === null && (await owed(BILAL)) === 40000);
}

// =============================================================================
heading('The credit limit');

{
  // Rs 3,000 limit. Bilal owes Rs 400; jobs worth Rs 13,000 of labour add Rs 1,300 each.
  for (let i = 0; i < 2; i += 1) {
    const j = await working(BILAL, 1300000, await stranger());
    await me(BILAL, FINISH, [j.id, JSON.stringify([await upload(BILAL)]), 0, null]);
  }
  ok('he owes Rs 3,000: at the limit, not over it', (await owed(BILAL)) === 300000);
  const m0 = await sent();
  ok('not told yet: he has not crossed it', to(m0, 'bilal').every((x) => !/Balance due/.test(x.title)));
  const j = await working(BILAL, 100000, await stranger());
  await me(BILAL, FINISH, [j.id, JSON.stringify([await upload(BILAL)]), 0, null]);
  ok('one more job puts him over: Rs 3,100', (await owed(BILAL)) === 310000);
  ok('and he is told, once', to(await sent(), 'bilal').some((x) => x.title === 'Balance due to Pechkas: Rs 3,100'));
  const feed = (await me(BILAL, `SELECT public.pro_feed()`)).value;
  ok('his screen knows he is stopped', feed?.blocked === true && feed?.owed_paisa === 310000);
  const open = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Sara needs an AC service',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3', p_media => '[]'::jsonb)`)).value;
  const r = (await me(BILAL, `SELECT public.make_offer($1, 300000, 20, NULL)`, [open.id])).value;
  ok('over the limit, he cannot offer', r?.field === 'owed' && /Rs 3,100/.test(r?.why ?? ''), JSON.stringify(r));
  ok('Asad, who owes little, can', (await me(ASAD, `SELECT public.make_offer($1, 300000, 20, NULL)`, [open.id])).value?.ok === true);
  globalThis.openJob = open;
}

// =============================================================================
heading('Paying');

const SETTLE = `SELECT public.admin_settle($1, $2, $3, $4, $5)`;
{
  ok('a technician cannot record his own payment', (await me(BILAL, SETTLE, [BILAL, 310000, 'jazzcash', 'TID123456', 'key-bilal-0001'])).value?.ok === false);
  ok('more than he owes is refused', (await me(OWNER, SETTLE, [BILAL, 3100000, 'jazzcash', 'TID123456', 'key-bilal-0002'])).value?.field === 'amount');
  ok('a reference is needed', (await me(OWNER, SETTLE, [BILAL, 200000, 'jazzcash', '', 'key-bilal-0003'])).value?.field === 'reference');
  ok('and how he paid', (await me(OWNER, SETTLE, [BILAL, 200000, 'bitcoin', 'TID', 'key-bilal-0004'])).value?.field === 'method');
  ok('the office records Rs 2,000 by JazzCash', (await me(OWNER, SETTLE, [BILAL, 200000, 'jazzcash', 'TID 88123', 'key-bilal-0005'])).value?.ok === true);
  ok('pressed again — the same form — nothing more is recorded', (await me(OWNER, SETTLE, [BILAL, 200000, 'jazzcash', 'TID 88123', 'key-bilal-0005'])).value?.already === true);
  ok('he now owes Rs 1,100', (await owed(BILAL)) === 110000);
  ok('he is told', to(await sent(), 'bilal').some((x) => x.title === 'Payment received: Rs 2,000' && /Rs 1,100/.test(x.body)));
  ok('and can offer again', (await me(BILAL, `SELECT public.make_offer($1, 300000, 20, NULL)`, [globalThis.openJob.id])).value?.ok === true);
  ok('the ledger still adds up to nothing', await balanced());

  const money = (await me(BILAL, `SELECT public.pro_money()`)).value;
  ok('his money screen: what he owes, from real lines', money?.owed_paisa === 110000 && money?.blocked === false && money?.lines.length === 5, JSON.stringify(money?.lines?.map((l) => l.kind)));
  ok('no pay-to details until the office types them', money?.pay_to === null);
  ok('this month: four jobs done, with parts and commission summed', money?.month?.jobs === 4 && money?.month?.parts_paisa === 150000 && money?.month?.commission_paisa === 40000 + 130000 * 2 + 10000);
  ok('Sara has no technician account', (await me(SARA, `SELECT public.pro_money()`)).value?.ok === false);

  ok('a technician cannot set where to pay', (await me(BILAL, `SELECT public.admin_set_pay_to('Pay me instead')`)).value?.ok === false);
  ok('the office sets it', (await me(OWNER, `SELECT public.admin_set_pay_to('JazzCash 0335 8855076, Pechkas')`)).value?.ok === true);
  ok('and he sees it exactly', (await me(BILAL, `SELECT public.pro_money()`)).value?.pay_to === 'JazzCash 0335 8855076, Pechkas');

  const office = (await me(OWNER, `SELECT public.admin_money()`)).value;
  const b = office?.pros?.find((p) => p.id === BILAL);
  ok('the office sees every technician\'s balance', b?.owed_paisa === 110000 && b?.jobs_done === 4 && b?.last_paid_at);
  ok('and totals that agree with each other', office.totals.owed_paisa + office.totals.received_paisa === office.totals.commission_paisa + office.totals.reserve_paisa, JSON.stringify(office.totals));
  ok('a technician cannot see it', (await me(BILAL, `SELECT public.admin_money()`)).value == null);

  const lines = (await me(OWNER, `SELECT public.admin_ledger($1)`, [BILAL])).value;
  const pay = lines.find((l) => l.kind === 'settlement');
  ok('a reversal needs a reason', (await me(OWNER, `SELECT public.admin_reverse($1, '')`, [pay.txn])).value?.field === 'reason');
  ok('the office undoes the payment, typed against the wrong man', (await me(OWNER, `SELECT public.admin_reverse($1, 'Entered against the wrong technician')`, [pay.txn])).value?.ok === true);
  ok('he owes Rs 3,100 again', (await owed(BILAL)) === 310000);
  ok('it cannot be undone twice', (await me(OWNER, `SELECT public.admin_reverse($1, 'Again by mistake')`, [pay.txn])).value?.ok === false);
  ok('the original stays in the record, marked', (await me(OWNER, `SELECT public.admin_ledger($1)`, [BILAL])).value.find((l) => l.txn === pay.txn)?.reversed === true);
  ok('the ledger still adds up to nothing', await balanced());
  await me(OWNER, SETTLE, [BILAL, 310000, 'cash', 'Received by Zohaib', 'key-bilal-0006']);
  ok('paid in full in cash: he owes nothing', (await owed(BILAL)) === 0);
}

// =============================================================================
heading('Ratings');

const RATE = `SELECT public.rate_job($1, $2, $3)`;
{
  ok('Sara cannot rate Ayesha\'s job', (await me(SARA, RATE, [j1.id, 5, null])).value?.ok === false);
  ok('six stars is refused', (await me(AYESHA, RATE, [j1.id, 6, null])).value?.field === 'stars');
  ok('a phone number in the words is refused', (await me(AYESHA, RATE, [j1.id, 5, 'Call him on 0300 1234567'])).value?.field === 'words');
  ok('Ayesha gives Bilal five stars', (await me(AYESHA, RATE, [j1.id, 5, 'Came on time, explained everything'])).value?.ok === true);
  ok('only once', (await me(AYESHA, RATE, [j1.id, 1, null])).value?.ok === false);
  let money = (await me(BILAL, `SELECT public.pro_money()`)).value;
  ok('Bilal cannot see it yet: he has not rated her', money?.rating?.count === 0 && money?.comments.length === 0);
  ok('Bilal rates Ayesha', (await me(BILAL, RATE, [j1.id, 4, 'Polite, gate was open'])).value?.ok === true);
  money = (await me(BILAL, `SELECT public.pro_money()`)).value;
  ok('now both have rated, he sees her stars and words', money?.rating?.count === 1 && money?.comments[0]?.words === 'Came on time, explained everything');
  ok('one rating is not enough to show: still "New"', money?.rating?.avg === null);
  nothing('nobody can read the ratings table', await as('authenticated', AYESHA, `SELECT * FROM public.ratings`));

  const others = (await setup(`SELECT id, customer_id FROM public.jobs WHERE pro_id = $1 AND status = 'done' AND id <> $2 ORDER BY created_at`, [BILAL, j1.id])).rows;
  await me(others[0].customer_id, RATE, [others[0].id, 4, null]);
  await me(others[1].customer_id, RATE, [others[1].id, 3, null]);
  ok('two more, only the customers have rated: hidden for two days', (await me(BILAL, `SELECT public.pro_money()`)).value?.rating?.count === 1);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '49 hours' WHERE id = ANY($1)`, [[others[0].id, others[1].id]]);
  money = (await me(BILAL, `SELECT public.pro_money()`)).value;
  ok('after two days they show: three ratings, average 4.0', money?.rating?.count === 3 && Number(money?.rating?.avg) === 4, JSON.stringify(money?.rating));
  const offers = (await me(SARA, `SELECT public.job_offers($1)`, [globalThis.openJob.id])).value ?? [];
  const b = offers.find((o) => o.pro_first_name === 'Bilal');
  const a = offers.find((o) => o.pro_first_name === 'Asad');
  ok('customers now see Bilal\'s 4.0 and his real jobs done', Number(b?.rating) === 4 && b?.jobs_done === 4, JSON.stringify(b));
  ok('Asad, with no ratings, shows as New', a?.rating === null && a?.jobs_done === 1, JSON.stringify(a));
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '15 days' WHERE id = $1`, [others[2]?.id ?? j1.id]);
  ok('after two weeks it is too late to rate', (await me(BILAL, RATE, [others[2]?.id ?? j1.id, 3, null])).value?.ok === false);
}

// =============================================================================
heading('Problems, claims and the emergency button');

{
  const j = await working(ASAD, 400000, SARA);
  ok('the technician can report a problem during the job', (await me(ASAD, `SELECT public.report($1, 'problem', 'Customer is asking me to do extra work for free')`, [j.id])).value?.ok === true);
  ok('the owner\'s phone is told it came from the technician', to(await sent(), 'zohaib')[0]?.title === `Problem reported by Asad on ${j.ref}`);
  ok('a claim is not possible before the job is done', (await me(SARA, `SELECT public.report($1, 'guarantee', 'It broke again')`, [j.id])).value?.ok === false);

  const E = (await me(SARA, `SELECT public.emergency($1)`, [j.id])).value;
  ok('Sara presses the emergency button', E?.ok === true && E?.id);
  const m = await sent();
  const z = to(m, 'zohaib')[0];
  ok('the owner\'s phone is told AT ONCE, saying who', z?.title === `EMERGENCY on ${j.ref}` && /The customer, Sara/.test(z?.body ?? ''), JSON.stringify(z));
  ok('without the address on the lock screen', !/Street|House|markaz/.test(JSON.stringify(m)));
  ok('pressing again within a minute is the same emergency, not a second alarm', (await me(SARA, `SELECT public.emergency($1)`, [j.id])).value?.id === E.id && (await sent()).length === 0);
  ok('where she is follows', (await me(SARA, `SELECT public.emergency_where($1, 33.684, 72.988)`, [E.id])).value?.ok === true);
  ok('only she can say where', (await me(ASAD, `SELECT public.emergency_where($1, 1, 1)`, [E.id])).value?.ok === false);
  ok('Bilal cannot press it on a job that is not his', (await me(BILAL, `SELECT public.emergency($1)`, [j.id])).value?.ok === false);

  const q = (await me(OWNER, `SELECT public.admin_problems('open')`)).value ?? [];
  ok('the queue puts the emergency first, with where she was and the address', q[0]?.kind === 'emergency' && q[0]?.urgent && q[0]?.lat === 33.684 && /House 12/.test(q[0]?.job?.address));
  ok('with both numbers to ring', q[0]?.customer?.phone === '923002222222' && q[0]?.pro?.phone === '923004444444');
  ok('the job says why it needs you', (await me(OWNER, `SELECT * FROM public.admin_jobs('assigned')`)).rows.find((x) => x.id === j.id)?.why === 'EMERGENCY');
  ok('a technician cannot see the queue', (await me(ASAD, `SELECT public.admin_problems('open')`)).value == null);

  ok('Sara says it was a mistake', (await me(SARA, `SELECT public.emergency_mistake($1)`, [E.id])).value?.ok === true);
  ok('and the owner is told that too', to(await sent(), 'zohaib')[0]?.title === `False alarm on ${j.ref}`);
  ok('closing needs a note of what was done', (await me(OWNER, `SELECT public.admin_close_problem($1, '')`, [E.id])).value?.field === 'note');
  ok('the office closes it with a note', (await me(OWNER, `SELECT public.admin_close_problem($1, 'Rang Sara, all fine, pressed in her bag')`, [E.id])).value?.ok === true);

  await me(ASAD, FINISH, [j.id, JSON.stringify([await upload(ASAD)]), 0, null]);
  ok('Sara claims the guarantee on the finished job', (await me(SARA, `SELECT public.report($1, 'guarantee', 'Not cooling again after three days')`, [j.id])).value?.ok === true);
  ok('the owner is told', to(await sent(), 'zohaib').some((x) => x.title === `Guarantee claim on ${j.ref}`));
  ok('one open claim at a time', (await me(SARA, `SELECT public.report($1, 'guarantee', 'Still not cooling')`, [j.id])).value?.ok === false);
  ok('her card shows the claim is open', ((await me(SARA, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === j.id)?.claim_open === true);
  ok('Asad cannot claim a guarantee', (await me(ASAD, `SELECT public.report($1, 'guarantee', 'Pay me again')`, [j.id])).value?.ok === false);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '31 days' WHERE id = $1`, [j.id]);
  await setup(`UPDATE public.problems SET status = 'closed', office_note = 'test' WHERE job_id = $1`, [j.id]);
  ok('after 30 days the guarantee has ended', /30 days/.test((await me(SARA, `SELECT public.report($1, 'guarantee', 'Broke again now')`, [j.id])).value?.why ?? ''));
  ok('and the emergency button only works on a job that is on', (await me(SARA, `SELECT public.emergency($1)`, [j.id])).value?.ok === false);
  nothing('nobody can read the problems table', await as('authenticated', SARA, `SELECT * FROM public.problems`));
  const d = (await me(OWNER, `SELECT public.admin_job_detail($1)`, [j1.id])).value;
  ok('the office sees both ratings and the job\'s money together', d?.ratings?.length === 2 && d?.money?.commission_paisa === 40000);
}

// =============================================================================
heading('Nothing private ever leaves');

{
  const text = all.map((m) => `${m.title} ${m.body}`).join('\n');
  ok('a fair number of messages were looked at', all.length >= 20, String(all.length));
  for (const [what, pattern] of [['a street', /Street \d/], ['a house', /House \d/], ['a landmark', /markaz/i], ['a gate note', /Rafiq|Chowkidar/i], ['a phone number', /92\d{10}|0?3\d{2}\s?\d{7}/]]) {
    ok(`no notification names ${what}`, !pattern.test(text), (text.match(pattern) ?? [])[0]);
  }
  ok('every slot was filled', !/\{[a-z_]+\}/.test(text));
}

report();
