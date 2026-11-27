// Retake the gallery's screenshots of one trade after it changes (A123):
// 10-home-a/b/c and 19-work-<trade>.jpg, at 390 x 844, scale 2, into SHOTS_OUT.
// Use: SHOTS_OUT=<folder> node scripts/shots/gallery.mjs <trade>
import { mkdirSync } from 'node:fs';
import { start, shot, go, signIn, scrolls, OUT } from './lib.mjs';
const trade = process.argv[2];
mkdirSync(OUT, { recursive: true });
const { b, p } = await start();
await signIn(p, '3001112222');
await scrolls(p, '10-home', 3);
await go(p, `/work/${trade}`); await shot(p, `19-work-${trade}`, 1800);
console.log('errors', p.errs.slice(0, 3));
await b.close();
