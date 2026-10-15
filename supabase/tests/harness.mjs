/**
 * A throwaway Postgres in memory, with every migration applied, for trying
 * to break in. It never touches the real database.
 *
 * Adapted from the website's scripts/db-test.mjs, including its two hard
 * lessons:
 *  - the signed-in identity is set for the SESSION, not the transaction,
 *    because every statement here is its own transaction and a
 *    transaction-scoped setting vanished before the next line ran — which
 *    looked, for a while, like very good security indeed;
 *  - an empty answer only counts as a refusal when the database says it is
 *    one. A broken query returns no rows too, and once made thirty security
 *    checks pass while proving nothing. See `nothing()`.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
export const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const BOOTSTRAP = join(ROOT, 'supabase', 'local', 'bootstrap.sql');

export const db = await PGlite.create({ extensions: { pgcrypto } });

// Supabase's roles and `auth` schema, which a bare Postgres does not have.
await db.exec(await readFile(BOOTSTRAP, 'utf8'));

export const migrationFiles = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();

/** Applies every migration in order, stopping loudly at the first that fails. */
export async function migrate() {
  for (const file of migrationFiles) {
    try {
      await db.exec(await readFile(join(MIGRATIONS, file), 'utf8'));
    } catch (error) {
      console.log(`\n✗ ${file} would not apply:\n\n  ${error.message}\n`);
      process.exit(1);
    }
  }
}

/**
 * Runs a query as one of Supabase's roles. `anon` is the key printed inside
 * the app — a stranger. `authenticated` is somebody signed in, `who` their id.
 * Always goes back to being the owner afterwards, even when the query failed.
 */
export async function as(role, who, sql, params = []) {
  const claims = who ? JSON.stringify({ sub: who, role }) : JSON.stringify({ role });
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`SET ROLE ${role};`);
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error: error.message };
  } finally {
    await db.exec('RESET ROLE;');
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`);
  }
}

/** The database owner — only for setting up made-up data. */
export const setup = (sql, params = []) => db.query(sql, params);

let passed = 0;
const failures = [];

export function heading(text) {
  console.log(`\n${text}`);
}

export function ok(what, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${what}`);
  } else {
    failures.push(`${what}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${what}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Passes only when the attempt came back empty AND for the right reason:
 * either the rules filtered everything out, or permission was denied. Any
 * other error is a broken test, not a locked door.
 */
export function nothing(what, result) {
  if (result.rows.length) {
    ok(what, false, `got ${result.rows.length} row(s) back`);
    return;
  }
  const honest = !result.error || /permission denied|must be owner/i.test(result.error);
  ok(what, honest, honest ? '' : `empty, but only because: ${result.error}`);
}

/**
 * Passes only when the database refused outright: no permission at all, or a
 * row the security rules would not let in. Any other error is a broken test.
 */
export function denied(what, result) {
  const isDenied = Boolean(result.error) && /permission denied|violates row-level security policy/i.test(result.error);
  ok(what, isDenied, isDenied ? '' : result.error ? `refused, but for another reason: ${result.error}` : 'it was allowed');
}

export function report() {
  if (failures.length) {
    console.log(`\n✗ ${failures.length} of ${passed + failures.length} checks failed:\n`);
    for (const line of failures) console.log(`  ${line}`);
    console.log('\n  Do not run these migrations on Supabase.\n');
    process.exit(1);
  }
  console.log(`\nAll good — ${passed} checks, ${migrationFiles.length} migration(s).\n`);
}
