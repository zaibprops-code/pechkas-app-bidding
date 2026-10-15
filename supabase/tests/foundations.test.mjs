/**
 * npm run db:test
 *
 * Builds a fresh database, runs every migration, and then tries to get in as
 * a stranger and as somebody signed in. Every attempt must be refused.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { as, denied, heading, migrate, MIGRATIONS, migrationFiles, nothing, ok, report, setup } from './harness.mjs';

await migrate();
console.log(`\nA fresh database, ${migrationFiles.length} migration(s) applied.`);

const SOMEBODY = '11111111-1111-4111-8111-111111111111';
await setup(`INSERT INTO auth.users (id) VALUES ($1)`, [SOMEBODY]);

// =============================================================================
heading('Running the migrations a second time');

{
  let error = null;
  try {
    await migrate();
  } catch (e) {
    error = e;
  }
  const { rows } = await setup(`SELECT count(*)::int AS n FROM public.settings`);
  ok('does no harm, because the owner runs them by hand and may run one twice', !error && rows[0].n === 5);
}

// =============================================================================
heading('A stranger with the key printed inside the app');

for (const table of ['settings', 'applied_migrations']) {
  nothing(`cannot read ${table}`, await as('anon', null, `SELECT * FROM public.${table}`));
}
denied(
  'cannot change the commission',
  await as('anon', null, `UPDATE public.settings SET value = 0 WHERE key = 'commission_bps'`)
);
denied(
  'cannot add a setting',
  await as('anon', null, `INSERT INTO public.settings (key, value, unit, meaning) VALUES ('x', 1, 'days', 'x')`)
);

// =============================================================================
heading('Somebody signed in, who is nobody in particular yet');

nothing('cannot read settings', await as('authenticated', SOMEBODY, `SELECT * FROM public.settings`));
denied(
  'cannot raise his own credit limit',
  await as('authenticated', SOMEBODY, `UPDATE public.settings SET value = 999999999 WHERE key = 'credit_limit_paisa'`)
);

// =============================================================================
heading('Something added later and forgotten about');

// The point of reversing the defaults: a table or function a later migration
// adds is locked until somebody opens it on purpose.
await setup(`CREATE TABLE public.added_later (secret text)`);
await setup(`INSERT INTO public.added_later VALUES ('a home address')`);
await setup(`CREATE FUNCTION public.added_later_fn() RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$`);

denied('a new table is closed to a stranger', await as('anon', null, `SELECT * FROM public.added_later`));
denied('a new table is closed to the signed in', await as('authenticated', SOMEBODY, `SELECT * FROM public.added_later`));
denied('a new function is closed to a stranger', await as('anon', null, `SELECT public.added_later_fn()`));
denied('a new function is closed to the signed in', await as('authenticated', SOMEBODY, `SELECT public.added_later_fn()`));

await setup(`DROP TABLE public.added_later`);
await setup(`DROP FUNCTION public.added_later_fn()`);

// =============================================================================
heading('The numbers the owner decided');

{
  const { rows } = await setup(`SELECT key, value, unit FROM public.settings ORDER BY key`);
  const get = (k) => rows.find((r) => r.key === k);
  ok('commission is 10%, in basis points', get('commission_bps')?.value === 1000n || Number(get('commission_bps')?.value) === 1000);
  ok('credit limit is Rs 3,000, in paisa', Number(get('credit_limit_paisa')?.value) === 300000 && get('credit_limit_paisa')?.unit === 'paisa');
  ok('an offer stays open 10 minutes', Number(get('offer_minutes')?.value) === 10);
  ok('an untaken job reaches the owner after 15 minutes', Number(get('escalate_minutes')?.value) === 15);
  ok('the guarantee is 30 days', Number(get('guarantee_days')?.value) === 30);

  let refused = false;
  try {
    await setup(`UPDATE public.settings SET value = 20000 WHERE key = 'commission_bps'`);
  } catch {
    refused = true;
  }
  ok('a commission above 100% is refused even by the owner', refused);
}

// =============================================================================
heading('Nothing that looks like a CNIC number');

// The rule from the website: a CNIC number never enters the repository. Only
// the date it was checked.
{
  const CNIC = /\b\d{5}-?\d{7}-?\d\b/;
  const offenders = [];
  for (const dir of [MIGRATIONS, join(process.cwd(), 'supabase', 'tests'), join(process.cwd(), 'supabase', 'local')]) {
    for (const file of await readdir(dir)) {
      const text = await readFile(join(dir, file), 'utf8');
      if (CNIC.test(text.replaceAll(String(CNIC), ''))) offenders.push(file);
    }
  }
  ok('in any migration, test or fixture', offenders.length === 0, offenders.join(', '));
}

report();
