// Builds the demo's starting database: every migration, plus the demo's
// made-up people. Jobs are added in the browser on first open, so their
// days are always "tomorrow" whenever the demo is opened.
import { writeFile } from 'node:fs/promises';
process.chdir(new URL('../..', import.meta.url).pathname);
const t0 = Date.now();
const { db, migrate, setup } = await import(new URL('../../supabase/tests/harness.mjs', import.meta.url).href);
await migrate();
console.log('migrated in', (Date.now() - t0) / 1000, 's');
const id = (n) => `de${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PEOPLE = [
  // id, phone, email, role, first name
  [id(1), '923001112222', null, 'customer', 'Ayesha'],
  [id(2), '923001113333', null, 'customer', 'Sara'],
  [id(3), '923001114444', null, 'customer', 'Hina'],
  [id(4), '923003334444', null, 'pro', 'Bilal'],
  [id(5), '923003335555', null, 'pro', 'Asad'],
  [id(6), null, 'office@example.com', null, null],
];
for (const [who, phone, email, role, name] of PEOPLE) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [who, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name, created_at) VALUES ($1, $2, $3, now() - interval '120 days')`, [who, role, name]);
}
await setup(`SELECT public.make_owner('office@example.com', 'Office')`);
// Two technicians approved the old way (before the first-jobs rules), so they can work at once.
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online, applied_at)
  VALUES ($1, 'Bilal Ahmed', '{ac,electrician}', 6, '{F-11,E-11,G-13}', 'approved', true, now() - interval '100 days'),
         ($2, 'Asad Mehmood', '{ac,plumber}', 9, '{F-11,E-11,G-13}', 'approved', true, now() - interval '100 days')`, [id(4), id(5)]);
const sectors = (await setup(`SELECT string_agg(name, ', ') AS s FROM public.sectors WHERE live`).catch(() => ({ rows: [{ s: '?' }] }))).rows[0].s;
console.log('live sectors:', sectors);
// The first-job numbers the owner decided (A102, A104), which he types into the office panel
// himself; in the demo they are set here, so a technician tried in the demo meets the real rules.
for (const [key, value] of Object.entries({
  trial_price_cap_paisa: 500000, trial_customer_gap_m: 500, quiz_pass_bps: 8000, quiz_retake_days: 3,
  risky_clean_jobs: 5, risky_clean_days: 30, risky_claim_free_days: 60, risky_retry_days: 30,
  checker_fee_paisa: 100000, checker_answer_minutes: 60, checker_accountable_days: 30,
  legacy_basic_jobs: 3, legacy_risky_jobs: 10, identity_legacy_days: 30,
})) await setup(`UPDATE public.settings SET value = $2 WHERE key = $1`, [key, value]);
// For trying the "Waiting for a database update" screen: a database one migration behind.
if (process.env.DEMO_BEHIND) await setup(`DELETE FROM public.applied_migrations WHERE name = (SELECT max(name) FROM public.applied_migrations)`);
await db.exec('CHECKPOINT');
const file = await db.dumpDataDir('gzip');
await writeFile(process.argv[2], Buffer.from(await file.arrayBuffer()));
console.log('wrote', process.argv[2], file.size, 'bytes, total', (Date.now() - t0) / 1000, 's');
process.exit(0);
