/**
 * Visit fees: the totals, and the commission Pechkas chose not to take
 * (migration visit_fee_report, the owner's decision D13).
 *
 * What must hold: Pechkas takes 0% of a visit fee and he keeps all of it
 * (no commission line, nothing owed, the same as before); the report puts
 * every fee in exactly one place by where it stands today — paid,
 * outstanding, disputed, waived or covered — so the parts always add up to
 * what was recorded, by count and by rupees, in each month and in total, and
 * a fee that moves (paid then waived and refunded, unpaid then covered,
 * disputed then kept) moves out of one place and into another without being
 * counted twice; "kept by technicians" is paid + covered; the potential
 * commission is 10% of what customers really paid, rounded down per fee,
 * and is never a ledger line or a balance; only the office reads it; and it
 * runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e8';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007881111', null, 'customer', 'Ayesha'],
  [SARA, '923007882222', null, 'customer', 'Sara'],
  [BILAL, '923007883333', null, 'pro', 'Bilal'],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/fee-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const fee = async (jobId) => (await setup(`SELECT * FROM public.visit_fees WHERE job_id = $1`, [jobId])).rows[0];
const VF = `SELECT public.admin_visit_fee($1, $2, $3)`;

let n = 0;
/** A job that stopped with a visit fee: he asked a new price at her door and she said no. */
async function stopped(customer = AYESHA) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_media => '[]'::jsonb)`, [`AC number ${n} is not cooling`])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  await me(BILAL, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  await me(customer, `SELECT public.choose_offer($1)`, [(await setup(`SELECT id FROM public.offers WHERE job_id = $1`, [posted.id])).rows[0].id]);
  await me(BILAL, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await me(BILAL, `SELECT public.tech_step($1, 'on_way')`, [posted.id]);
  const s = (await me(BILAL, `SELECT public.start_work($1, $2, $3::jsonb)`, [posted.id, (await job(posted.id)).start_code, JSON.stringify([await upload(BILAL)])])).value;
  if (!s?.ok) throw new Error(`start failed: ${JSON.stringify(s)}`);
  await me(BILAL, `SELECT public.ask_change($1, 550000, 'Compressor needs replacing', $2)`, [posted.id, await upload(BILAL)]);
  const change = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1 AND status = 'pending'`, [posted.id])).rows[0].id;
  const d = (await me(customer, `SELECT public.decide_change($1, false)`, [change])).value;
  if (!d?.ok) throw new Error(`decline failed: ${JSON.stringify(d)}`);
  return posted;
}
const rep = async () => (await me(OWNER, `SELECT public.admin_visit_fees()`)).value?.report;
const N = (x) => Number(x ?? 0);
/** The parts add up to the whole, by count and by rupees, and kept = paid + covered. */
function adds(r) {
  const c = N(r.paid_count) + N(r.outstanding_count) + N(r.disputed_count) + N(r.waived_count) + N(r.covered_count);
  const a = N(r.paid_paisa) + N(r.outstanding_paisa) + N(r.disputed_paisa) + N(r.waived_paisa) + N(r.covered_paisa);
  return c === N(r.count) && a === N(r.recorded_paisa) && N(r.kept_paisa) === N(r.paid_paisa) + N(r.covered_paisa);
}
const everyRowAdds = (r) => adds(r.total) && r.months.every(adds)
  && r.months.reduce((s, m) => s + N(m.recorded_paisa), 0) === N(r.total.recorded_paisa)
  && r.months.reduce((s, m) => s + N(m.count), 0) === N(r.total.count);

// =============================================================================
heading('Nothing yet');
{
  const r = await rep();
  ok('an empty report says nought, not nothing', r && N(r.total.count) === 0 && N(r.total.recorded_paisa) === 0 && r.months.length === 0, JSON.stringify(r));
  ok('it says the rate it would have used: the locked 10%', N(r.commission_bps) === 1000);
}

heading('Pechkas takes nothing from a visit fee, as before');
const a = await stopped();
{
  const before = await owed(BILAL);
  ok('the job stopped with a Rs 300 fee, due', (await fee(a.id)).status === 'due' && N((await fee(a.id)).amount_paisa) === 30000);
  ok('he is paid', (await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [a.id])).value?.ok === true);
  ok('no commission was posted and he owes nothing for it', (await owed(BILAL)) === before
    && N((await setup(`SELECT count(*) AS n FROM public.ledger_txns WHERE job_ref = $1`, [(await job(a.id)).ref])).rows[0].n) === 0
    && N((await job(a.id)).commission_paisa) === 0);
  const r = await rep();
  ok('recorded Rs 300, paid Rs 300, kept by him Rs 300', N(r.total.recorded_paisa) === 30000 && N(r.total.paid_paisa) === 30000 && N(r.total.kept_paisa) === 30000);
  ok('Pechkas\' commission is 0', N(r.total.commission_paisa) === 0);
  ok('what 10% would have been: Rs 30, on the report only', N(r.total.potential_commission_paisa) === 3000);
  ok('reading the report put nothing on anybody\'s balance', (await owed(BILAL)) === before);
  ok('every row adds up', everyRowAdds(r));
  ok('this month is one row, and it is the total', r.months.length === 1 && N(r.months[0].count) === 1);
}

heading('Every state, each fee in one place');
const due = await stopped();
const unpaid = await stopped(SARA);
await me(BILAL, `SELECT public.pro_visit_fee($1, false)`, [unpaid.id]);
const disputed = await stopped();
await me(AYESHA, `SELECT public.customer_visit_fee($1, 'disagree', 'He did not even open the unit')`, [disputed.id]);
const waived = await stopped();
await me(OWNER, VF, [(await fee(waived.id)).id, 'waive', 'He arrived two hours late; no fee']);
{
  const r = (await rep()).total;
  ok('5 recorded, Rs 1,500', N(r.count) === 5 && N(r.recorded_paisa) === 150000, JSON.stringify(r));
  ok('1 paid, 2 outstanding (due and unpaid), 1 disputed, 1 waived, none covered',
    N(r.paid_count) === 1 && N(r.outstanding_count) === 2 && N(r.disputed_count) === 1 && N(r.waived_count) === 1 && N(r.covered_count) === 0);
  ok('outstanding is Rs 600; nothing was refunded on a fee never paid', N(r.outstanding_paisa) === 60000 && N(r.refund_owed_paisa) === 0 && N(r.refunded_paisa) === 0);
  ok('the potential commission counts only what was really paid', N(r.potential_commission_paisa) === 3000);
  ok('it adds up', adds(r));
}

heading('A fee that moves is counted once, where it is now');
{
  const before = (await rep()).total;
  await me(OWNER, VF, [(await fee(a.id)).id, 'waive', 'Customer showed the unit was fine; refund her']);
  let r = (await rep()).total;
  ok('paid, then waived: out of paid, into waived, with Rs 300 he must give back', N(r.paid_count) === 0 && N(r.waived_count) === 2
    && N(r.refund_owed_paisa) === 30000 && N(r.count) === N(before.count) && adds(r));
  ok('and it no longer counts as kept, nor towards the potential commission', N(r.kept_paisa) === 0 && N(r.potential_commission_paisa) === 0);
  await me(OWNER, VF, [(await fee(a.id)).id, 'refund_charge', 'He would not return it; office paid her back']);
  r = (await rep()).total;
  ok('refunded by Pechkas and charged to him: shown as refunded, still one waived fee', N(r.refund_owed_paisa) === 0 && N(r.refunded_paisa) === 30000
    && N(r.waived_count) === 2 && adds(r));

  await me(OWNER, VF, [(await fee(unpaid.id)).id, 'cover', 'Sara is not answering; Bilal should not lose out']);
  r = (await rep()).total;
  ok('unpaid, then covered by Pechkas: out of outstanding, into covered', N(r.outstanding_count) === 1 && N(r.covered_count) === 1
    && N(r.covered_unpaid_paisa) === 30000 && N(r.covered_guarantee_paisa) === 0 && adds(r));
  ok('he keeps a covered fee', N(r.kept_paisa) === 30000);
  ok('one customer still owes Pechkas for it', N(r.customers_owing_count) === 1);
  ok('Pechkas paying its own money is never counted as commission it could have taken', N(r.potential_commission_paisa) === 0);
  await me(OWNER, VF, [(await fee(unpaid.id)).id, 'clear', 'Sara paid Rs 300 to the office by JazzCash, TX 8812']);
  ok('once she has settled, nobody owes Pechkas', N((await rep()).total.customers_owing_count) === 0);

  await me(OWNER, VF, [(await fee(disputed.id)).id, 'keep', 'He showed the photo of the open unit; the fee stands']);
  r = (await rep()).total;
  ok('disputed, then kept: back to outstanding, never in two places', N(r.disputed_count) === 0 && N(r.outstanding_count) === 2 && adds(r));
  await me(BILAL, `SELECT public.pro_visit_fee($1, true)`, [disputed.id]);
  r = (await rep()).total;
  ok('then paid: Rs 30 of potential commission, still nothing taken', N(r.paid_count) === 1 && N(r.potential_commission_paisa) === 3000 && N(r.commission_paisa) === 0 && adds(r));
}

heading('Months are Pakistan\'s, and add up to the total');
{
  // Move one fee to last month and one to a 1 a.m. moment that is still last month in Islamabad.
  await setup(`UPDATE public.visit_fees SET created_at = date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi' - interval '10 days' WHERE job_id = $1`, [due.id]);
  await setup(`UPDATE public.visit_fees SET created_at = (date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi') - interval '1 minute' WHERE job_id = $1`, [waived.id]);
  const r = await rep();
  const last = (await setup(`SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') - interval '1 day', 'YYYY-MM') AS m`)).rows[0].m;
  const lastRow = r.months.find((m) => m.month === last);
  ok('two months, newest first', r.months.length === 2 && r.months[0].month > r.months[1].month, JSON.stringify(r.months.map((m) => m.month)));
  ok('a minute before midnight on the 1st in Islamabad is last month', N(lastRow?.count) === 2);
  ok('every month adds up, and the months add up to the total', everyRowAdds(r));
}

heading('Only the office reads it');
{
  ok('a technician gets nothing', (await me(BILAL, `SELECT public.admin_visit_fees()`)).value === null);
  nothing('the report is not callable by a signed-in person', await as('authenticated', BILAL, `SELECT public.visit_fee_report()`));
  nothing('nor by a stranger', await as('anon', null, `SELECT public.admin_visit_fees()`));
  const r = (await rep()).total;
  const all = Object.keys(r).join(' ');
  ok('the report names no person, phone or address', !/customer_id|pro_id|phone|street|house/.test(all));
}

heading('Run a second time');
{
  const before = JSON.stringify((await rep()).total);
  let twice = null;
  try {
    // Run it again, and every change after it, in order: as the owner would in Supabase.
    const { readdir } = await import('node:fs/promises');
    for (const file of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql') && f >= '20261112100000').sort()) {
      await db.exec(await readFile(join(MIGRATIONS, file), 'utf8'));
    }
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and the figures are unchanged', JSON.stringify((await rep()).total) === before);
}

report();
