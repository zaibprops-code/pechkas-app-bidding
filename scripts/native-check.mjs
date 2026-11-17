// Over-the-air updates carry only the app's JavaScript. A change to its
// native parts (a library, a permission, a plugin, the app's settings)
// needs a new build, and the only thing that tells an update which builds
// can run it is app.json's "version" (runtimeVersion policy "appVersion").
//
// So: a hash of everything native is kept in apps/mobile/native-stamp.json
// beside the version it was recorded with. If the native parts change and
// the version does not, this fails — otherwise an update would reach builds
// that cannot run it. Over-cautious on purpose: any dependency change counts.
//
//   npm run native:check              check (part of npm run check)
//   npm run native:check -- --write   record, after raising "version"
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const STAMP = 'apps/mobile/native-stamp.json';
const app = JSON.parse(await readFile('apps/mobile/app.json', 'utf8')).expo;
const pkg = JSON.parse(await readFile('apps/mobile/package.json', 'utf8'));
const root = JSON.parse(await readFile('package.json', 'utf8'));
const config = await readFile('apps/mobile/app.config.js', 'utf8');

// Everything in app.json except what an update itself may carry.
const { version, runtimeVersion, updates, extra, ...native } = app;
const sorted = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sorted(o[k])])) : Array.isArray(o) ? o.map(sorted) : o);
const hash = createHash('sha256')
  .update(JSON.stringify(sorted({ native, dependencies: pkg.dependencies, overrides: root.overrides ?? null, config: config.replace(/\r/g, '') })))
  .digest('hex')
  .slice(0, 16);

if (process.argv.includes('--write')) {
  await writeFile(STAMP, `${JSON.stringify({ note: 'Written by scripts/native-check.mjs --write. Do not edit by hand.', version, hash }, null, 2)}\n`);
  console.log(`✓ Recorded the native parts of version ${version} (${hash}).`);
  process.exit(0);
}

let stamp;
try {
  stamp = JSON.parse(await readFile(STAMP, 'utf8'));
} catch {
  console.log(`✗ ${STAMP} is missing. Run: npm run native:check -- --write`);
  process.exit(1);
}
if (stamp.hash !== hash && stamp.version === version) {
  console.log(`✗ The app's native parts changed (a library, a permission, a plugin or app.json), but "version" in apps/mobile/app.json is still ${version}.
  An update would reach builds that cannot run it. Raise "version" (for example ${version} → ${version.replace(/(\d+)$/, (n) => String(Number(n) + 1))}),
  then run: npm run native:check -- --write. The owner then needs a new build.`);
  process.exit(1);
}
if (stamp.version !== version || stamp.hash !== hash) {
  console.log(`✗ "version" is ${version} but ${STAMP} records ${stamp.version}. Run: npm run native:check -- --write`);
  process.exit(1);
}
console.log(`✓ Native parts unchanged since version ${version}: updates reach only builds that can run them.`);
