// The four screens of a trade's 3D mock (A123), at 390 and 320 wide:
// p1-page (the trade's page), p1b-page-down (scrolled), p2-post (Post a job with one
// of its jobs chosen) and p3-home (home, scrolled to the other kinds of work).
// Use, with the demo served (see lib.mjs):
//   SHOTS_OUT=<folder> node scripts/shots/trade-mock.mjs <trade> "<a job's name>"
// e.g. SHOTS_OUT=/tmp/now node scripts/shots/trade-mock.mjs appliances "Washing machine repair"
// Take "now" from a build of main, then "new" from a build with the new pictures in.
import { mkdirSync } from 'node:fs';
import { start, R, signIn, go, OUT } from './lib.mjs';
const [trade, job] = process.argv.slice(2);
if (!trade || !job) throw new Error('Give the trade and a job name: appliances "Washing machine repair"');
mkdirSync(OUT, { recursive: true });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [W, H] of [[390, 844], [320, 640]]) {
  const { b, p } = await start(W, H);
  const r = R(p);
  const shot = async (n) => { await p.waitForTimeout(1400); await r.screenshot({ path: `${OUT}/${n}-${W}.jpg`, type: 'jpeg', quality: 88 }); console.log('shot', n, W); };
  await signIn(p, '3001112222');
  await p.waitForTimeout(1200); await p.mouse.wheel(0, 900); await shot('p3-home');
  await go(p, `/work/${trade}`); await shot('p1-page');
  await p.mouse.wheel(0, 700); await shot('p1b-page-down');
  await p.mouse.wheel(0, -1400); await p.waitForTimeout(400);
  await r.getByRole('button', { name: new RegExp('^' + esc(job)) }).first().click(); await p.waitForTimeout(1500); await shot('p2-post');
  console.log('errors', p.errs.slice(0, 3));
  await b.close();
}
