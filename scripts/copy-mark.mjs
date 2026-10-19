/**
 * Copies the Pechkas mark's shapes from the website into this repository.
 *
 *    node scripts/copy-mark.mjs ../Pechkas
 *
 * The logo's geometry lives in ONE place: src/lib/mark.js in
 * zaibprops-code/Pechkas, where it also draws the website, the logo files and
 * the business cards. This writes the finished paths, at the 64-unit size,
 * to packages/shared/src/mark-paths.ts, which Mark.tsx, the admin panel
 * and scripts/make-icons.mjs all read. Nobody types a path by hand: if the
 * website's mark changes, run this, then `node scripts/make-icons.mjs` and
 * `node scripts/make-store.mjs`.
 */
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const site = resolve(process.argv[2] || '../Pechkas');
const m = await import(pathToFileURL(join(site, 'src/lib/mark.js')).href);
const flat = m.markGeometry(32, 32, 64);

const out = {
  box: 64,
  // Smaller than this on screen, draw `flat`: the machined detail is mush.
  machinedFromPx: m.MACHINED.fromPx,
  flat: { disc: flat.disc, slot: flat.slot, fill: { disc: '#ffc53d', slot: '#14171a' } },
  machined: m.machinedParts(32, 32, 64),
  // One colour, slot a hole. `machinedOne` has the fine cut ring; `flatOne`
  // does not, for anything small or stitched.
  machinedOne: m.machinedOnePath(32, 32, 64),
  flatOne: m.markOnePath(32, 32, 64),
};
await writeFile(
  'packages/shared/src/mark-paths.ts',
  `// Copied from zaibprops-code/Pechkas src/lib/mark.js by scripts/copy-mark.mjs.\n` +
    `// Do not edit by hand: change the website's mark, then run that script.\n` +
    `export const MARK_PATHS = ${JSON.stringify(out, null, 2)} as const;\n`,
);
console.log('Wrote packages/shared/src/mark-paths.ts');
