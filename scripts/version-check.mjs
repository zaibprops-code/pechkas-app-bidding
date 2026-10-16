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
