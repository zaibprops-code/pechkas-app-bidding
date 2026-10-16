// The app's NEWEST_MIGRATION must name the newest file in supabase/migrations/,
// or the Me screen would call an up-to-date database "behind" (or the reverse).
import { readdir, readFile } from 'node:fs/promises';
const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const newest = files.at(-1).replace(/\.sql$/, '');
const src = await readFile('apps/mobile/src/version.ts', 'utf8');
const said = src.match(/NEWEST_MIGRATION = '([^']+)'/)?.[1];
if (said !== newest) {
  console.log(`✗ apps/mobile/src/version.ts says NEWEST_MIGRATION = '${said}', but the newest migration is '${newest}'. Change it.`);
  process.exit(1);
}
console.log(`✓ The app expects ${newest}, the newest migration.`);

// supabase/checks/1_which_migrations_ran.sql lists every migration by hand, so
// the owner can paste it into the SQL editor. A file missing from that list
// would never be reported as "not run".
const check = await readFile('supabase/checks/1_which_migrations_ran.sql', 'utf8');
const listed = [...check.matchAll(/'(\d{14}_[a-z_]+)'/g)].map((m) => m[1]).sort();
const names = files.map((f) => f.replace(/\.sql$/, ''));
if (JSON.stringify(listed) !== JSON.stringify(names)) {
  const missing = names.filter((n) => !listed.includes(n));
  const extra = listed.filter((n) => !names.includes(n));
  console.log(`✗ supabase/checks/1_which_migrations_ran.sql is out of date.${missing.length ? ` Add: ${missing.join(', ')}.` : ''}${extra.length ? ` Remove: ${extra.join(', ')}.` : ''}`);
  process.exit(1);
}
console.log(`✓ The migration check lists all ${names.length} migrations.`);
