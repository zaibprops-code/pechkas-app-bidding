/**
 * Prices: what jobs really go for.
 *
 * What must hold: every finished job goes into price_record, which names
 * nobody — no customer, no technician, no address — and so stays when an
 * account is deleted. Nobody can read the record itself. A range is the
 * middle half of the price for the WORK (parts taken out) of one kind of
 * job in the last 90 days, and nothing at all is shown under 10 jobs, even
 * if the setting is lowered. "Something else" never has a range. Customers
 * get the ranges, technicians get the range and their own last price for a
 * job they may see (and only the range while the office allows it), the
 * office gets the report, and a technician well above the range is a flag.
 * Writing the record can never undo a finished job. And it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'b9111111-1111-4111-8111-111111111111';
const SARA = 'b9222222-2222-4222-8222-222222222222';
const BILAL = 'b9333333-3333-4333-8333-333333333333';
const KAMRAN = 'b9444444-4444-4444-8444-444444444444';
const STAFF = 'b9555555-5555-4555-8555-555555555555';
for (const [id, phone, role, name] of [
  [AYESHA, '923001111169', 'customer', 'Ayesha'],
  [SARA, '923002222269', 'customer', 'Sara'],
  [BILAL, '923003333369', 'pro', 'Bilal'],
  [KAMRAN, '923004444469', 'pro', 'Kamran'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'office@example.com')`, [STAFF]);
await setup(`INSERT INTO public.staff (id, name, active) VALUES ($1, 'Office', true)`, [STAFF]);
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved')`, [BILAL]);
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, 'Kamran Ali', '{plumbing}', 4, '{F-11}', 'approved')`, [KAMRAN]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
// Plenty of room for what the tests make him owe.
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}

const SERVICE = (await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND name LIKE 'General service%'`)).rows[0].id;
const GAS = (await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND name = 'Gas top-up'`)).rows[0].id;
const now = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const day = now.h < 20 ? now.d : (await setup(`SELECT ($1::date + 1)::text AS d`, [now.d])).rows[0].d;

const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => $2, p_description => 'AC needs looking at', p_offer_paisa => $3,
  p_when_kind => 'today', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`;
async function post(type, offer = 200000, who = AYESHA) {
  const r = (await call(who, POST, [day, type, offer])).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
}
/** Chosen, then finished — straight in the table, as the job's own functions would leave it. */
async function finish(id, agreed, parts = 0, pro = BILAL) {
  await setup(`UPDATE public.jobs SET status = 'assigned', pro_id = $2, agreed_paisa = $3 WHERE id = $1`, [id, pro, agreed]);
  await setup(`UPDATE public.jobs SET status = 'done', parts_paisa = $2, collect_paisa = agreed_paisa, finished_at = now() WHERE id = $1`, [id, parts]);
}
const record = async (id) => (await setup(`SELECT * FROM public.price_record WHERE job_id = $1`, [id])).rows[0];
const ranges = async (who = SARA) => (await call(who, `SELECT public.price_ranges()`)).value;

// =============================================================================
heading('Every finished job is recorded, and the record names nobody');
const first = await post(SERVICE, 180000);
ok('an open job is not recorded', !(await record(first)));
await finish(first, 200000);
const r1 = await record(first);
ok('a finished job is', r1 && Number(r1.labour_paisa) === 200000 && Number(r1.customer_paisa) === 180000 && r1.sector === 'F-11', JSON.stringify(r1));
ok('with the usual price of the day', Number(r1.list_paisa) === 250000);

const cols = (await setup(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'price_record'`)).rows.map((r) => r.column_name);
const personal = cols.filter((c) => /customer_id|pro_id|street|house|landmark|lat|lng|phone|name|ref|gate/.test(c));
ok('no column says who anybody was or where they live', personal.length === 0, personal.join(', '));

const parted = await post(SERVICE);
await finish(parted, 300000, 100000);
ok('parts are taken out: the price for the work is what counts', Number((await record(parted)).labour_paisa) === 200000);

const stopped = await post(SERVICE);
await setup(`UPDATE public.jobs SET status = 'assigned', pro_id = $2, agreed_paisa = 200000 WHERE id = $1`, [stopped, BILAL]);
await setup(`UPDATE public.jobs SET status = 'stopped', collect_paisa = 50000, finished_at = now() WHERE id = $1`, [stopped]);
const cancelled = await post(SERVICE);
await setup(`UPDATE public.jobs SET status = 'cancelled', cancelled_by = 'customer' WHERE id = $1`, [cancelled]);
ok('a stopped job is not recorded', !(await record(stopped)));
ok('nor a cancelled one', !(await record(cancelled)));

heading('Nobody reads the record itself');
denied('a signed-in person cannot read it', await as('authenticated', SARA, `SELECT * FROM public.price_record`));
denied('a stranger cannot either', await as('anon', null, `SELECT * FROM public.price_record`));
nothing('nor ask for a range directly', await as('authenticated', SARA, `SELECT public.price_range_of(${SERVICE})`));

// =============================================================================
heading('A range only from 10 jobs');
await setup(`DELETE FROM public.price_record`);
// Ten General services, Rs 2,000 to Rs 2,900 for the work.
const done = [];
for (let i = 0; i < 9; i++) {
  const id = await post(SERVICE);
  await finish(id, 200000 + i * 10000);
  done.push(id);
}
ok('nine jobs: nothing is shown', !(await ranges()).ranges[String(SERVICE)], JSON.stringify(await ranges()));
const tenth = await post(SERVICE);
await finish(tenth, 290000);
const r10 = (await ranges()).ranges[String(SERVICE)];
// Middle half of 2,000 … 2,900: 2,225 to 2,675, rounded out to 2,200 and 2,700.
ok('the tenth job brings the range', r10 && r10.n === 10 && r10.low_paisa === 220000 && r10.high_paisa === 270000, JSON.stringify(r10));
ok('with the window it covers', (await ranges()).days === 90 && r10.days === 90);
ok('a kind with no jobs has no range', !(await ranges()).ranges[String(GAS)]);

await setup(`UPDATE public.settings SET value = 5 WHERE key = 'price_min_jobs'`);
const few = [];
for (let i = 0; i < 6; i++) {
  const id = await post(GAS);
  await finish(id, 500000 + i * 10000);
  few.push(id);
}
ok('lowering the setting below 10 shows nothing more', !(await ranges()).ranges[String(GAS)]);
await setup(`UPDATE public.settings SET value = 10 WHERE key = 'price_min_jobs'`);

heading('"Something else" never has a range');
for (let i = 0; i < 11; i++) {
  const id = await post(null);
  await finish(id, 300000);
}
const nulls = (await setup(`SELECT count(*)::int AS n FROM public.price_record WHERE job_type_id IS NULL`)).rows[0].n;
ok('they are recorded', nulls === 11);
ok('but no range is made from them', Object.keys((await ranges()).ranges).every((k) => k !== 'null' && k !== ''));

heading('Old jobs drop out');
await setup(`UPDATE public.price_record SET done_on = done_on - 120 WHERE job_id = $1`, [tenth]);
ok('a job older than 90 days stops counting', !(await ranges()).ranges[String(SERVICE)]);
await setup(`UPDATE public.price_record SET done_on = done_on + 120 WHERE job_id = $1`, [tenth]);
ok('and the range is back when it is within them', !!(await ranges()).ranges[String(SERVICE)]);

heading('Who may ask');
nothing('a stranger gets no ranges', await as('anon', null, `SELECT public.price_ranges()`));

// =============================================================================
heading("The technician's offer sheet");
const open = await post(SERVICE, 220000, SARA);
const help = (await call(BILAL, `SELECT public.pro_price_help($1)`, [open])).value;
ok('he sees the range on a job he may offer on', help?.ok === true && help.range?.low_paisa === 220000 && help.range?.high_paisa === 270000, JSON.stringify(help));
ok('and his own last price for that kind of job', help.last?.labour_paisa === 290000 && help.last?.ref, JSON.stringify(help?.last));
ok('without the customer, her address or her number', !/street|house|phone|first_name|customer/i.test(JSON.stringify(help)));
await setup(`UPDATE public.settings SET value = 0 WHERE key = 'price_range_to_pros'`);
const hidden = (await call(BILAL, `SELECT public.pro_price_help($1)`, [open])).value;
ok('with the switch off he sees no range', hidden?.ok === true && hidden.range === null && hidden.last?.labour_paisa === 290000, JSON.stringify(hidden));
await setup(`UPDATE public.settings SET value = 1 WHERE key = 'price_range_to_pros'`);
ok('a technician in another trade is refused', (await call(KAMRAN, `SELECT public.pro_price_help($1)`, [open])).value?.ok === false);
ok('so is a customer', (await call(AYESHA, `SELECT public.pro_price_help($1)`, [open])).value?.ok === false);
nothing('and a stranger', await as('anon', null, `SELECT public.pro_price_help('${open}')`));

// =============================================================================
heading("The office's report");
ok('a customer gets nothing', (await call(SARA, `SELECT public.admin_prices()`)).value == null);
const rep = (await call(STAFF, `SELECT public.admin_prices()`)).value;
const service = rep?.kinds?.find((k) => k.job_type_id === SERVICE);
const other = rep?.kinds?.find((k) => k.job_type_id === null);
ok('the office sees every kind with jobs', service && other && rep.kinds.some((k) => k.job_type_id === GAS), JSON.stringify(rep?.kinds?.map((k) => k.name)));
ok('with real counts and prices', service.n === 10 && service.cheapest_paisa === 200000 && service.dearest_paisa === 290000 && service.median_paisa === 245000, JSON.stringify(service));
ok('beside the usual price', service.list_paisa === 250000);
ok('and whether customers are shown a range', service.range?.low_paisa === 220000 && other.range === null && rep.kinds.find((k) => k.job_type_id === GAS).range === null);
ok('it says the window and the threshold', rep.days === 90 && rep.min_jobs === 10 && rep.to_pros === true);

// =============================================================================
heading('The flag: well above the range');
const flagged = async () => {
  const f = (await call(STAFF, `SELECT public.admin_flags()`)).value;
  return f.people.find((p) => p.id === BILAL)?.flags.find((x) => x.kind === 'price_over');
};
ok('not flagged for ordinary prices', !(await flagged()));
for (let i = 0; i < 3; i++) await finish(await post(SERVICE), 450000);
const fl = await flagged();
ok('three jobs over half again above the top of the range make a flag', fl && fl.n === 3, JSON.stringify(fl));

// =============================================================================
heading('Deleting an account keeps the anonymous record');
const before = (await setup(`SELECT count(*)::int AS n FROM public.price_record`)).rows[0].n;
const hers = (await setup(`SELECT count(*)::int AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA])).rows[0].n;
await setup(`DELETE FROM auth.users WHERE id = $1`, [AYESHA]);
ok('her jobs are gone', hers > 0 && (await setup(`SELECT count(*)::int AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA])).rows[0].n === 0);
ok('the price record is not', (await setup(`SELECT count(*)::int AS n FROM public.price_record`)).rows[0].n === before);

heading('Writing the record never undoes a finished job');
await setup(`ALTER TABLE public.price_record ADD CONSTRAINT refuse_everything CHECK (false) NOT VALID`);
const brittle = await post(SERVICE, 200000, SARA);
let err = null;
try {
  await finish(brittle, 200000);
} catch (e) {
  err = e.message;
}
const st = (await setup(`SELECT status FROM public.jobs WHERE id = $1`, [brittle])).rows[0].status;
ok('the job is still done', err === null && st === 'done', err ?? st);
ok('and simply not recorded', !(await record(brittle)));
await setup(`ALTER TABLE public.price_record DROP CONSTRAINT refuse_everything`);

heading('Run a second time');
const count = (await setup(`SELECT count(*)::int AS n FROM public.price_record`)).rows[0].n;
let twice = null;
try {
  await db.exec(await readFile(join(MIGRATIONS, '20261105000000_prices.sql'), 'utf8'));
} catch (e) {
  twice = e.message;
}
ok('the migration runs again without complaint', twice === null, twice);
ok('and records nothing twice', (await setup(`SELECT count(*)::int AS n FROM public.price_record`)).rows[0].n === count + 1);
// …the one job that could not be recorded before is picked up by the backfill.

report();
