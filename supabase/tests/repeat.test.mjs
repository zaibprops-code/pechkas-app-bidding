/**
 * A105 (D18): the 7% repeat rate needs a job finished together in the 12
 * months before she chose him for this one (before now, while nobody has been
 * chosen). repeat_pair() is the one test; commission_rate() reads it.
 */
import { as, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const id = (n) => `ac${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const AYESHA = id(1);
const SARA = id(2);
const BILAL = id(3);
const ASAD = id(4);
for (const [who, phone, role, name] of [
  [AYESHA, '923007661111', 'customer', 'Ayesha'],
  [SARA, '923007662222', 'customer', 'Sara'],
  [BILAL, '923007663333', 'pro', 'Bilal'],
  [ASAD, '923007664444', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [who, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [who, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online)
  VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true), ($2, 'Asad Mehmood', '{ac}', 9, '{F-11}', 'approved', true)`, [BILAL, ASAD]);

/** A job straight into the table, with the times the test needs. */
async function job(customer, status, pro = null, { finishedAgo = null, assignedAgo = null } = {}) {
  return (await setup(`INSERT INTO public.jobs (customer_id, trade, title, offered_paisa, when_kind, when_part, sector, street, house, status, pro_id,
                         finished_at, assigned_at)
    VALUES ($1, 'ac', 'AC service', 300000, 'today', 'morning', 'F-11', 'Street 1', 'House 1', $2, $3,
            CASE WHEN $4::text IS NULL THEN NULL ELSE now() - $4::interval END,
            CASE WHEN $5::text IS NULL THEN NULL ELSE now() - $5::interval END) RETURNING id`,
  [customer, status, pro, finishedAgo, assignedAgo])).rows[0].id;
}
const repeat = async (c, p, j) => (await setup(`SELECT public.repeat_pair($1, $2, $3) AS r`, [c, p, j])).rows[0].r;
const rate = async (c, p, j) => Number((await setup(`SELECT public.commission_rate($1, $2, $3) AS r`, [c, p, j])).rows[0].r);

// =============================================================================
heading('The number');

const s = (await setup(`SELECT value FROM public.settings WHERE key = 'repeat_window_months'`)).rows[0];
ok('the repeat rate looks back 12 months', Number(s?.value) === 12);
ok('and the office cannot change it', (await setup(`SELECT 1 FROM public.setting_limits WHERE key = 'repeat_window_months'`)).rows.length === 0);
const officeTry = await as('authenticated', BILAL, `SELECT public.admin_set_setting('repeat_window_months', 24)`);
ok('nobody outside the office can try', Boolean(officeTry.error) || officeTry.rows[0]?.admin_set_setting?.ok === false, JSON.stringify(officeTry));

// =============================================================================
heading('An open job: measured from now');

await job(AYESHA, 'done', BILAL, { finishedAgo: '11 months' });
const open1 = await job(AYESHA, 'open');
ok('a job together 11 months ago: returning customer', (await repeat(AYESHA, BILAL, open1)) === true);
ok('so 7%', (await rate(AYESHA, BILAL, open1)) === 700);

await job(SARA, 'done', BILAL, { finishedAgo: '13 months' });
const open2 = await job(SARA, 'open');
ok('a job together 13 months ago: not any more', (await repeat(SARA, BILAL, open2)) === false);
ok('so 10%', (await rate(SARA, BILAL, open2)) === 1000);

// =============================================================================
heading('A job he was chosen for: measured from when she chose him');

const chosen = await job(SARA, 'assigned', BILAL, { assignedAgo: '2 months' });
ok('13 months ago is 11 months before she chose him two months ago: 7%', (await repeat(SARA, BILAL, chosen)) === true && (await rate(SARA, BILAL, chosen)) === 700);
const done = await job(SARA, 'done', BILAL, { assignedAgo: '2 months', finishedAgo: '1 month' });
ok('and it stays 7% once finished, though 13 months have now passed', (await rate(SARA, BILAL, done)) === 700);

// =============================================================================
heading('What never counts');

const other = await job(AYESHA, 'open');
ok('another technician\'s job for her', (await repeat(AYESHA, ASAD, other)) === false);
await job(SARA, 'stopped', ASAD, { finishedAgo: '1 month' });
await job(SARA, 'cancelled', ASAD, { finishedAgo: '1 month' });
const open3 = await job(SARA, 'open');
ok('a stopped or cancelled job together', (await repeat(SARA, ASAD, open3)) === false);
const itself = await job(AYESHA, 'done', ASAD, { assignedAgo: '1 day', finishedAgo: '1 hour' });
ok('the job itself', (await repeat(AYESHA, ASAD, itself)) === false);

report();
