import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const S = process.argv[2];
const b = await chromium.launch();
const errs = [];
async function open(W, H) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await p.goto('http://localhost:8901/a/demo/');
  await p.locator('#root').getByText('Continue with phone').waitFor({ timeout: 60000 });
  return p;
}
async function signIn(p, num) {
  const r = p.locator('#root');
  await r.getByText('Continue with phone').click(); await p.waitForTimeout(700);
  await p.getByLabel('Mobile number', { exact: true }).last().fill(num);
  await r.getByText('Continue', { exact: true }).last().click(); await p.waitForTimeout(1200);
  await p.getByLabel('Code, 6 numbers', { exact: true }).last().fill('123456'); await p.waitForTimeout(3500);
}
const shot = (p, n) => p.screenshot({ path: `${S}/d-${n}.png` });
// The customer
let p = await open(412, 860);
await signIn(p, '3001112222');
await p.locator('#root').getByText('Choose a technician').first().click(); await p.waitForTimeout(2500);
await shot(p, 'ayesha-job');
console.log('offer from Asad shown:', await p.locator('#root').getByText('Asad', { exact: false }).count() > 0);
// The technician, on a narrow phone
const t = await open(320, 640);
await signIn(t, '3003334444');
await shot(t, 'bilal-feed');
console.log('Bilal sees Sara and Hina:', await t.locator('#root').getByText('Sara', { exact: false }).count() > 0, await t.locator('#root').getByText('Hina', { exact: false }).count() > 0);
console.log('sideways at 320:', await t.evaluate(() => document.body.scrollWidth > innerWidth));
// A wide screen
const w = await open(1280, 860);
await shot(w, 'wide');
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await b.close();
