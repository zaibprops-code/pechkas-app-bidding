/**
 * Launch offers (the owner's decision D38, A99–A101, 17 November 2026).
 *
 * What must hold. A99: the launch rate is 5% of the labour, instead of 10%
 * or 7%, on a technician's jobs in a trade from his 3rd good first job
 * there, until 90 days after that trade is approved and never more than 12
 * months after the 3rd good job; only for technicians who applied by the
 * cut-off day, and nobody while that day is not set; fixed when she
 * chooses him; never on his first 3 jobs; never on a repair Pechkas pays
 * for; "repeat" only for a real repeat customer. A100: a code that a
 * newcomer names until he is approved; a Rs 1,000 credit only once his 3
 * good first jobs are paid by money of his that is final AND past the
 * 30-day "Not received" window; 5 at most; it pays fees but never a
 * payout, never shows as money Pechkas owes, and never proves the
 * referrer paid for a first job of his own. And the safety list, and
 * running twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();
await setup(`UPDATE public.pay_policy SET started_at = now() - interval '400 days'`);

const id = (d) => `b8${d}${d}${d}${d}${d}${d}-${d}${d}${d}${d}-4${d}${d}${d}-8${d}${d}${d}-${d.repeat(12)}`;
const BILAL = id('1'), IMRAN = id('2'), ASAD = id('3'), LATE = id('4'), AYESHA = id('5'), SARA = id('6'), OWNER = id('7'), OWNER_PHONE = id('8'), OLDHAND = id('9'), NOOR = id('a');
for (const [u, phone, email, role, name] of [
  [BILAL, '923003300001', null, 'pro', 'Bilal'], [IMRAN, '923003300002', null, 'pro', 'Imran'], [ASAD, '923003300003', null, 'pro', 'Asad'],
  [LATE, '923003300004', null, 'pro', 'Kamran'], [AYESHA, '923003300005', null, 'customer', 'Ayesha'], [SARA, '923003300006', null, 'customer', 'Sara'],
  [OWNER, null, 'owner-launch@example.com', null, null], [OWNER_PHONE, '923003300008', null, 'customer', 'Zohaib'], [OLDHAND, '923003300009', null, 'pro', 'Tariq'],
  [NOOR, '923003300010', null, 'customer', 'Noor'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [u, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [u, role, name]);
}
for (const [u, full, status, ago] of [[BILAL, 'Bilal Ahmed', 'approved', 200], [IMRAN, 'Imran Khan', 'applied', 60], [ASAD, 'Asad Mehmood', 'applied', 60],
  [LATE, 'Kamran Ali', 'applied', 5], [OLDHAND, 'Tariq Aziz', 'approved', 300]]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, applied_at) VALUES ($1, $2, '{ac,plumber}', 6, '{F-11}', $3, now() - make_interval(days => $4))`, [u, full, status, ago]);
}
await setup(`SELECT public.make_owner('owner-launch@example.com', 'Zohaib')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (n) => `ExponentPushToken[${n.padEnd(22, 'x')}]`;
await call(BILAL, `SELECT public.save_push_token($1, 'android', 'en')`, [token('bilal-launch')]);
let seen = (await setup(`SELECT coalesce(max(id), 0)::int AS n FROM net.sent`)).rows[0].n;
async function sent() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body);
}

const rate = async (customer, pro, job) => Number((await setup(`SELECT public.commission_rate($1, $2, $3) AS r`, [customer, pro, job])).rows[0].r);
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const setCutoff = (yyyymmdd) => setup(`UPDATE public.settings SET value = $1 WHERE key = 'launch_apply_by'`, [yyyymmdd]);
const today = (await setup(`SELECT to_char(public.pk_day(now()), 'YYYYMMDD')::bigint AS d`)).rows[0].d;
let n = 0;
async function job(customer, trade = 'ac', status = 'open', pro = null) {
  n += 1;
  // A finished job has the time it finished, as every real one does (the repeat rate reads it, A105).
  return (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status, pro_id, finished_at)
    VALUES ($1, $2, $3, 300000, 'today', 'morning', 'F-11', 'Street 1', 'House 1', $4, $5, CASE WHEN $4 = 'done' THEN now() END) RETURNING id`,
  [customer, trade, `Job ${n}`, status, pro])).rows[0].id;
}
async function trade(pro, t, status) {
  await setup(`INSERT INTO public.pro_trades (pro_id, trade, status) VALUES ($1, $2, $3) ON CONFLICT (pro_id, trade) DO UPDATE SET status = EXCLUDED.status`, [pro, t, status]);
}
/** A first job of his, its commission posted, left waiting. */
async function firstJob(pro, t, customer) {
  const j = await job(customer, t, 'done', pro);
  await setup(`INSERT INTO public.trial_jobs (job_id, pro_id, trade, customer_id, status) VALUES ($1, $2, $3, $4, 'waiting')`, [j, pro, t, customer]);
  const lines = JSON.stringify([{ account: 'pro_owes', pro_id: pro, amount: 25000 }, { account: 'commission', amount: -25000 }]);
  await setup(`SELECT public.post_txn('commission:' || $1, 'commission', $1::uuid, $2::uuid, $3::jsonb)`, [j, pro, lines]);
  return j;
}
const good = (j) => setup(`UPDATE public.trial_jobs SET status = 'good', decided_at = now() WHERE job_id = $1`, [j]);
let shots = 0;
async function pay(pro, rupees, ref) {
  shots += 1;
  const path = `${pro}/shot_${shots}.jpg`;
  await as('authenticated', pro, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [path]);
  return (await call(pro, `SELECT public.claim_payment($1, 'jazzcash', $2, $3)`, [rupees * 100, ref, path])).value;
}
const finalNow = (claim) => setup(`UPDATE public.payment_claims SET final_at = now() - interval '1 minute' WHERE id = $1`, [claim]);
const pastWindow = (claim) => setup(`UPDATE public.payment_claims SET final_at = now() - interval '31 days', correct_until = now() - interval '1 minute' WHERE id = $1`, [claim]);
const clock = () => setup(`SELECT public.launch_clock()`);
const credit = async (newcomer) => (await setup(`SELECT * FROM public.referral_credits WHERE newcomer_id = $1`, [newcomer])).rows[0];

// =============================================================================
heading('A99: the launch rate, by the rule');
let open1;
{
  await trade(IMRAN, 'ac', 'trial');
  const jobs = [];
  for (const c of [AYESHA, SARA, OWNER_PHONE]) jobs.push(await firstJob(IMRAN, 'ac', c));
  open1 = await job(NOOR);
  ok('nothing before his 3rd good job, cut-off or not', (await rate(NOOR, IMRAN, open1)) === 1000);
  await good(jobs[0]);
  await good(jobs[1]);
  await setCutoff(today);
  ok('2 good first jobs: still 10%', (await rate(NOOR, IMRAN, open1)) === 1000);
  await good(jobs[2]);
  const mark = (await setup(`SELECT * FROM public.launch_marks WHERE pro_id = $1 AND trade = 'ac'`, [IMRAN])).rows[0];
  ok('the 3rd good job marks the start, once', Boolean(mark?.third_good_at) && mark.approved_at === null);
  ok('from the 3rd good job: 5%', (await rate(NOOR, IMRAN, open1)) === 500);
  ok('only in that trade', (await rate(NOOR, IMRAN, await job(NOOR, 'plumber'))) === 1000);
  await setCutoff(0);
  ok('the cut-off not set: the offer is off for everybody', (await rate(NOOR, IMRAN, open1)) === 1000);
  await setCutoff(today);
  await setup(`UPDATE public.pros SET applied_at = now() + interval '2 days' WHERE id = $1`, [IMRAN]);
  ok('applied after the cut-off day: 10%', (await rate(NOOR, IMRAN, open1)) === 1000);
  await setup(`UPDATE public.pros SET applied_at = now() - interval '60 days' WHERE id = $1`, [IMRAN]);

  await trade(IMRAN, 'ac', 'approved');
  ok('his trade approved: his 90 days start', Boolean((await setup(`SELECT approved_at FROM public.launch_marks WHERE pro_id = $1 AND trade = 'ac'`, [IMRAN])).rows[0].approved_at));
  await setup(`UPDATE public.launch_marks SET approved_at = now() - interval '89 days' WHERE pro_id = $1`, [IMRAN]);
  ok('day 89 after approval: 5%', (await rate(NOOR, IMRAN, open1)) === 500);

  // Chosen on day 89: the rate is fixed on the job.
  const chosen = await job(NOOR);
  await setup(`UPDATE public.jobs SET status = 'assigned', pro_id = $2, assigned_at = now() WHERE id = $1`, [chosen, IMRAN]);
  ok('chosen within his 90 days: 5% fixed on the job', Number((await setup(`SELECT launch_bps FROM public.jobs WHERE id = $1`, [chosen])).rows[0].launch_bps) === 500);
  await setup(`UPDATE public.launch_marks SET approved_at = now() - interval '91 days' WHERE pro_id = $1`, [IMRAN]);
  ok('day 91: a new job is 10% again', (await rate(NOOR, IMRAN, open1)) === 1000);
  ok('but the job chosen on day 89 stays 5%, whenever he finishes', (await rate(NOOR, IMRAN, chosen)) === 500);
  // His jobs screen (it is for an approved technician).
  await setup(`UPDATE public.pros SET status = 'approved' WHERE id = $1`, [IMRAN]);
  const mine = (await call(IMRAN, `SELECT public.pro_my_jobs()`)).value;
  await setup(`UPDATE public.pros SET status = 'applied' WHERE id = $1`, [IMRAN]);
  const row = (mine?.jobs ?? mine ?? []).find?.((x) => x.id === chosen);
  ok('his job says launch rate, not "repeat customer"', row?.launch === true && row?.repeat === false && Number(row?.commission_bps) === 500, JSON.stringify(row ?? mine).slice(0, 300));

  await setup(`UPDATE public.launch_marks SET approved_at = NULL, third_good_at = now() - interval '11 months' WHERE pro_id = $1`, [IMRAN]);
  await trade(IMRAN, 'ac', 'trial');
  ok('not approved yet, 11 months after his 3rd good job: still 5%', (await rate(NOOR, IMRAN, open1)) === 500);
  await setup(`UPDATE public.launch_marks SET third_good_at = now() - interval '12 months 1 day' WHERE pro_id = $1`, [IMRAN]);
  ok('12 months after his 3rd good job: over, whatever the identity service', (await rate(NOOR, IMRAN, open1)) === 1000);
  await setup(`UPDATE public.launch_marks SET approved_at = now() - interval '10 days', third_good_at = now() - interval '30 days' WHERE pro_id = $1`, [IMRAN]);

  // A repeat customer: 7% becomes 5%; and "repeat" is said only when it is one.
  await job(AYESHA, 'ac', 'done', IMRAN);
  ok('a repeat customer during his launch rate: 5%, not 7%', (await rate(AYESHA, IMRAN, open1)) === 500);
  ok('the pair really is a repeat', (await setup(`SELECT public.repeat_pair($1, $2, $3) AS r`, [AYESHA, IMRAN, open1])).rows[0].r === true);
  ok('and without the offer the repeat rate is 7% as before', (await setCutoff(0), await rate(AYESHA, IMRAN, open1)) === 700);
  await setCutoff(today);

  // One of the 3 stops counting: the 5% stops until it counts again.
  await setup(`UPDATE public.trial_jobs SET status = 'waiting' WHERE job_id = $1`, [jobs[2]]);
  ok('a good job back to waiting: 10% until it counts again', (await rate(NOOR, IMRAN, open1)) === 1000);
  await good(jobs[2]);
  ok('it counts again: 5%, from the same start, not a new one', (await rate(NOOR, IMRAN, open1)) === 500
    && (await setup(`SELECT count(*)::int AS n FROM public.launch_marks WHERE pro_id = $1`, [IMRAN])).rows[0].n === 1);

  const paid = await job(AYESHA, 'ac', 'open');
  await setup(`UPDATE public.jobs SET paid_by_pechkas = true WHERE id = $1`, [paid]);
  await setup(`UPDATE public.jobs SET status = 'assigned', pro_id = $2, assigned_at = now() WHERE id = $1`, [paid, IMRAN]);
  ok('a repair Pechkas pays for never carries a launch rate', (await setup(`SELECT launch_bps FROM public.jobs WHERE id = $1`, [paid])).rows[0].launch_bps === null);
  await setup(`UPDATE public.jobs SET status = 'open', pro_id = NULL WHERE id = $1`, [chosen]);
  ok('a job that goes back to others drops its fixed rate', (await setup(`SELECT launch_bps FROM public.jobs WHERE id = $1`, [chosen])).rows[0].launch_bps === null);

  const view = (await call(IMRAN, `SELECT public.my_launch()`)).value;
  const ac = view?.trades?.find((t) => t.trade === 'ac');
  ok('his account shows his rate and its end date', view?.eligible === true && ac?.on === true && Boolean(ac?.until) && Number(view.bps) === 500);
  ok('nobody else can read the marks', (await as('authenticated', IMRAN, `SELECT * FROM public.launch_marks`)).error !== undefined
    || (await as('authenticated', IMRAN, `SELECT * FROM public.launch_marks`)).rows.length === 0);
}

// =============================================================================
heading('A100: his code, and a newcomer who names it');
let code;
{
  const v = (await call(BILAL, `SELECT public.my_launch()`)).value;
  code = v?.code;
  ok('an approved technician gets a code from his name', /^BILAL\d{2}$/.test(code ?? ''), code);
  ok('the same code every time', (await call(BILAL, `SELECT public.my_launch()`)).value?.code === code);
  ok('an applicant has no code yet', (await call(ASAD, `SELECT public.my_launch()`)).value?.code === null);
  const SET = `SELECT public.set_referrer($1)`;
  ok('a code nobody has is refused', (await call(ASAD, SET, ['NOBODY12'])).value?.field === 'code');
  ok('spaces and small letters are fine', (await call(ASAD, SET, [` ${code.toLowerCase()} `])).value?.ok === true);
  ok('his referrer sees him, pending', (await call(BILAL, `SELECT public.my_launch()`)).value?.brought_in?.[0]?.status === 'pending');
  ok('Imran names it too', (await call(IMRAN, SET, [code])).value?.ok === true);
  ok('an approved technician cannot change his', (await call(BILAL, SET, [code])).value?.field === 'code');
  ok('nobody can read the credits directly', (await as('authenticated', BILAL, `SELECT * FROM public.referral_credits`)).error !== undefined
    || (await as('authenticated', BILAL, `SELECT * FROM public.referral_credits`)).rows.length === 0);
}

heading('A100: the credit waits for final money, then the 30-day window');
{
  // Asad: 3 first jobs, their commission paid by his own "I have paid".
  await trade(ASAD, 'ac', 'trial');
  const js = [];
  for (const c of [AYESHA, SARA, OWNER_PHONE]) js.push(await firstJob(ASAD, 'ac', c));
  const p = await pay(ASAD, 750, 'ASAD-ALL');
  ok('he pays all three commissions in the app', p?.ok === true && (await owed(ASAD)) === 0);
  for (const j of js) await good(j);
  await clock();
  ok('3 good jobs, but his payment is not final: pending, no date', (await credit(ASAD)).status === 'pending' && (await credit(ASAD)).earn_at === null);
  await finalNow(p.id);
  await clock();
  const c1 = await credit(ASAD);
  ok('final, but "Not received" is still possible: pending until the 30 days pass',
    c1.status === 'pending' && Math.round((new Date(c1.earn_at) - Date.now()) / 86400000) === 30, JSON.stringify(c1));
  ok('his referrer sees the date', Boolean((await call(BILAL, `SELECT public.my_launch()`)).value?.brought_in?.find((x) => x.name === 'Asad')?.earn_at));
  const before = await owed(BILAL);
  await pastWindow(p.id);
  await sent();
  await clock();
  ok('past the window: earned', (await credit(ASAD)).status === 'earned');
  ok('Rs 1,000 off what Bilal owes', (await owed(BILAL)) === before - 100000);
  ok('he is told, with the newcomer\'s first name', (await sent()).some((m) => m.to === token('bilal-launch') && /Rs 1,000/.test(m.title) && /Asad/.test(m.body)));
  await clock();
  ok('the clock again changes nothing', (await owed(BILAL)) === before - 100000);
  await setup(`UPDATE public.trial_jobs SET status = 'not_counted', why = 'claim' WHERE job_id = $1`, [js[0]]);
  ok('kept, even if a job later stops counting for another reason', (await credit(ASAD)).status === 'earned' && (await owed(BILAL)) === before - 100000);
}

heading('A100: "Not received" within the window: no credit');
{
  // Imran already has 3 good jobs; their commission is unpaid. He pays in the app; the office finds it never arrived.
  const p = await pay(IMRAN, await owed(IMRAN) / 100, 'IMRAN-FAKE');
  await finalNow(p.id);
  await clock();
  ok('pending until the window passes', (await credit(IMRAN)).status === 'pending' && Boolean((await credit(IMRAN)).earn_at));
  await call(OWNER, `SELECT public.admin_claim_correct($1, 0, 'Nothing arrived')`, [p.id]);
  await pastWindow(p.id);
  await clock();
  ok('marked "Not received": still pending, no date, no credit', (await credit(IMRAN)).status === 'pending' && (await credit(IMRAN)).earn_at === null);
}

heading('A100: never cash, and never proof that he paid');
{
  const free = Number((await setup(`SELECT public.promo_free($1) AS f`, [BILAL])).rows[0].f);
  ok('Bilal has Rs 1,000 of credit unspent', free === 100000 && (await owed(BILAL)) === -100000);
  const list = (await call(OWNER, `SELECT public.admin_owed_to_pros()`)).value ?? [];
  ok('it is not on "Pechkas owes these technicians"', !list.some((x) => x.pro_id === BILAL));
  ok('and the office cannot pay it out', (await call(OWNER, `SELECT public.admin_pay_pro($1, 100000, 'cash', 'x', 'launch-pay-1')`, [BILAL])).value?.ok === false);
  // Pechkas really owes him Rs 500 for a guarantee repair: that, and only that, can be paid out.
  await setup(`SELECT public.post_txn('guarantee_pay:launch-1', 'guarantee_pay', NULL, $1::uuid, $2::jsonb)`,
    [BILAL, JSON.stringify([{ account: 'pro_owes', pro_id: BILAL, amount: -50000 }, { account: 'reserve', amount: 50000 }])]);
  ok('Rs 600 is refused', (await call(OWNER, `SELECT public.admin_pay_pro($1, 60000, 'cash', 'x', 'launch-pay-2')`, [BILAL])).value?.ok === false);
  ok('Rs 500 is paid', (await call(OWNER, `SELECT public.admin_pay_pro($1, 50000, 'cash', 'x', 'launch-pay-3')`, [BILAL])).value?.ok === true);
  const toPayout = (await setup(`SELECT count(*)::int AS n FROM public.pay_allocations a JOIN public.ledger_txns c ON c.id = a.credit_txn
    JOIN public.ledger_txns d ON d.id = a.debit_txn WHERE a.pro_id = $1 AND c.kind = 'referral_credit' AND d.kind = 'payout'`, [BILAL])).rows[0].n;
  ok('the referral credit never paid the payout', toPayout === 0);
  ok('and it is still there for his fees', Number((await setup(`SELECT public.promo_free($1) AS f`, [BILAL])).rows[0].f) === 100000);
  // A first job of his own, its commission paid by that credit: it is paid, but not by him.
  await trade(BILAL, 'plumber', 'trial');
  const mine = await firstJob(BILAL, 'plumber', AYESHA);
  const fee = (await setup(`SELECT id FROM public.ledger_txns WHERE idempotency_key = 'commission:' || $1`, [mine])).rows[0].id;
  const st = (await setup(`SELECT status FROM public.pay_fees($1) WHERE txn = $2`, [BILAL, fee])).rows[0];
  ok('the credit pays his fee', st?.status === 'paid');
  ok('but it never counts as him paying, for his own first job', (await setup(`SELECT public.fee_paid_final($1, $2) AS f`, [BILAL, fee])).rows[0].f === false);
}

heading('A100: at most 5, and a flag for a pattern');
{
  await setup(`UPDATE public.settings SET value = 1 WHERE key = 'referral_cap'`);
  await setup(`UPDATE public.referral_credits SET status = 'pending', referrer_id = $1 WHERE newcomer_id = $2`, [BILAL, LATE]);
  await setup(`INSERT INTO public.referral_credits (newcomer_id, referrer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [LATE, BILAL]);
  await trade(LATE, 'ac', 'trial');
  const js = [];
  for (const c of [AYESHA, SARA, OWNER_PHONE]) js.push(await firstJob(LATE, 'ac', c));
  const before = await owed(BILAL);
  await setup(`SELECT public.post_txn('settle:launch-late', 'settlement', NULL, $1::uuid, $2::jsonb)`,
    [LATE, JSON.stringify([{ account: 'received', amount: 75000 }, { account: 'pro_owes', pro_id: LATE, amount: -75000 }])]);
  for (const j of js) await good(j);
  await clock();
  ok('paid in cash to the office (final at once), over the cap: no credit', (await credit(LATE)).status === 'over_cap' && (await owed(BILAL)) === before);
  await setup(`UPDATE public.settings SET value = 5 WHERE key = 'referral_cap'`);

  // Two newcomers whose first jobs failed the customer checks.
  await setup(`UPDATE public.pros SET referred_by = $1 WHERE id IN ($2, $3)`, [BILAL, IMRAN, ASAD]);
  for (const who of [IMRAN, ASAD]) {
    const j = await firstJob(who, 'plumber', SARA);
    await setup(`UPDATE public.trial_jobs SET status = 'not_counted', why = 'too_close' WHERE job_id = $1`, [j]);
  }
  const f = (await call(OWNER, `SELECT public.admin_flags()`)).value?.people?.find((x) => x.id === BILAL);
  ok('a flag on Bilal, nothing more', f?.flags?.some((x) => x.kind === 'referral_pattern' && x.n === 2));
}

// =============================================================================
heading('The app link, and the office\'s view');
{
  ok('a technician cannot set it', (await call(BILAL, `SELECT public.admin_set_app_link('https://play.google.com/x')`)).value?.ok === false);
  ok('not a link: refused', (await call(OWNER, `SELECT public.admin_set_app_link('the play store')`)).value?.field === 'app_link');
  ok('a link: kept', (await call(OWNER, `SELECT public.admin_set_app_link('https://play.google.com/store/apps/details?id=net.pechkas.app')`)).value?.ok === true);
  ok('his screen has it for the message', /^https:\/\/play\.google\.com\//.test((await call(BILAL, `SELECT public.my_launch()`)).value?.app_link ?? ''));
  const a = (await call(OWNER, `SELECT public.admin_launch()`)).value;
  ok('the office sees the settings and every referral', Number(a?.bps) === 500 && a?.referrals?.length >= 3 && a.referrals.some((r) => r.status === 'earned'));
  ok('a technician cannot', (await call(BILAL, `SELECT public.admin_launch()`)).value === null);
}

heading('The owner\'s safety list: approved, with no first-job record');
{
  const src = await readFile(join(MIGRATIONS, '20261117100000_launch_offers.sql'), 'utf8');
  const check = src.slice(src.lastIndexOf('COMMIT;') + 'COMMIT;'.length);
  const rows = (await setup(check)).rows.map((r) => Object.values(r)[0]);
  ok('Tariq, approved with no first job, is listed', rows.includes('Tariq Aziz'), JSON.stringify(rows));
  ok('Bilal, with a first-job record, is not', !rows.includes('Bilal Ahmed'));
  ok('Tariq gets no launch rate, and nothing else changes for him', (await rate(AYESHA, OLDHAND, open1)) === 1000);
}

heading('The ledger, and running twice');
{
  const sum = Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS s FROM public.ledger_entries`)).rows[0].s);
  ok('every line still adds up to nothing', sum === 0);
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261117100000_launch_offers.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and the credits and marks are all still there', (await setup(`SELECT count(*)::int AS n FROM public.referral_credits WHERE status = 'earned'`)).rows[0].n === 1
    && (await setup(`SELECT count(*)::int AS n FROM public.launch_marks`)).rows[0].n >= 3);
}

report();
