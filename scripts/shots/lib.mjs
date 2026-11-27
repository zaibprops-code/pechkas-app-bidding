// Screenshot helpers for the owner (his rule: screens look as they will on his phone).
// Serve a built demo first: node scripts/demo/serve.mjs /tmp/pechkas-demo/site 8901
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
// Where shot() writes: SHOTS_OUT, or shots-out/ in the current folder.
export const OUT = process.env.SHOTS_OUT || 'shots-out';
export const ID = (n) => `de${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
export const P = { AYESHA: ID(1), SARA: ID(2), HINA: ID(3), BILAL: ID(4), ASAD: ID(5) };
export async function start(W = 390, H = 844) {
  // Through this environment's network gateway (for the map tiles), the local demo directly.
  const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});
  const ctx = await b.newContext({ viewport: { width: W, height: H + 44 }, deviceScaleFactor: 2, bypassCSP: true });
  const p = await ctx.newPage();
  // The owner's rule: screenshots look as the app does on a phone. A real street map (TileMap.web.tsx),
  // the phone's status bar and button-bar space (safe-area insets), never the demo page's own parts.
  await p.addInitScript(([w, a, h]) => { window.__pechkasRealMap = true; window.__pechkasGoogleOn = true; if (w) window.__pechkasWelcome = w; if (a) window.__pechkasArt2 = a; if (h) globalThis.__homeArt = h; }, [process.env.WELCOME || '', process.env.ART2 || '', process.env.HOMEART || '']);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 32, bottom: 20, left: 0, right: 0 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto('http://localhost:8901/a/demo/');
  await p.locator('#root').getByText('Continue with phone').waitFor({ timeout: 90000 });
  await p.addStyleTag({ content: 'input:focus, textarea:focus, [tabindex]:focus { outline: none !important; }' });
  await phoneBars(p);
  await p.waitForTimeout(1500);
  return { b, p };
}
export const R = (p) => p.locator('#root');
export async function shot(p, name, wait = 900) {
  await p.waitForTimeout(wait);
  // Let the map's tiles arrive before the picture is taken.
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await R(p).screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
  console.log('shot', name);
}
export async function full(p, name) {
  // the whole scrolled page: grow the frame to the content height, then shoot
  const h = await p.evaluate(() => {
    let max = 0;
    for (const e of document.querySelectorAll('#root *')) { if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY.match(/auto|scroll/)) max = Math.max(max, e.scrollHeight); }
    return max;
  });
  console.log(name, 'content height', h);
}
export async function go(p, path) {
  await p.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }, path);
  await p.waitForTimeout(1500);
}
export async function rpc(p, who, fn, args = {}) {
  return p.evaluate(async ([who, fn, args]) => {
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tok = who ? `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: who, role: 'authenticated', exp: 4e9, aud: 'authenticated' })}.demo` : '';
    const r = await fetch('https://demo.pechkas.invalid/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(args) });
    return r.json();
  }, [who, fn, args]);
}
export async function signIn(p, num) {
  const r = R(p);
  await r.getByText('Continue with phone').click(); await p.waitForTimeout(800);
  await p.getByLabel('Mobile number', { exact: true }).last().fill(num);
  await r.getByText('Continue', { exact: true }).last().click(); await p.waitForTimeout(1300);
  await p.getByLabel('Code, 6 numbers', { exact: true }).last().fill('123456'); await p.waitForTimeout(3500);
}

export async function pager(p, n) {
  await p.evaluate((n) => {
    const el = [...document.querySelectorAll('#root *')].find((e) => e.scrollWidth > e.clientWidth + 50 && getComputedStyle(e).overflowX.match(/auto|scroll/));
    if (el) el.scrollTo({ left: el.clientWidth * n, behavior: 'instant' });
  }, n);
}
// Shoot a long screen in pieces, scrolling its biggest scroller a screen at a time.
export async function scrolls(p, name, max = 6) {
  await p.waitForTimeout(900);
  const n = await p.evaluate(() => {
    const els = [...document.querySelectorAll('#root *')].filter((e) => e.scrollHeight > e.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.getBoundingClientRect().height > 200);
    els.sort((a, b) => b.clientHeight - a.clientHeight);
    const el = els[0];
    if (!el) return 1;
    window.__sc = el;
    el.scrollTop = 0;
    return Math.ceil((el.scrollHeight - 40) / (el.clientHeight * 0.8));
  });
  const parts = Math.min(n, max);
  for (let i = 0; i < parts; i++) {
    await p.evaluate((i) => { const el = window.__sc; if (el) el.scrollTop = i * el.clientHeight * 0.8; }, i);
    await shot(p, parts > 1 ? `${name}-${String.fromCharCode(97 + i)}` : name, 600);
  }
  await p.evaluate(() => { if (window.__sc) window.__sc.scrollTop = 0; });
}
export async function upload(p, who) {
  return p.evaluate(async (who) => {
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: who, role: 'authenticated', exp: 4e9, aud: 'authenticated' })}.demo`;
    const path = `${who}/shot-${Math.random().toString(36).slice(2)}.jpg`;
    await fetch('https://demo.pechkas.invalid/storage/v1/object/job-media/' + path, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'image/jpeg' }, body: new Blob(['x']) });
    return path;
  }, who);
}
export const LOC = () => JSON.stringify({ lat: 33.6837, lng: 72.9876, accuracy: 8, fix_at: new Date().toISOString(), sent_at: new Date().toISOString(), mocked: false });
export async function openJobId(p) {
  const jobs = await rpc(p, P.AYESHA, 'my_jobs');
  return jobs.find((j) => j.status === 'open' || j.status === 'assigned');
}
// Move Ayesha's leaking-AC job forward, one stage at a time.
export async function advance(p, stage) {
  const j = await openJobId(p);
  const A = P.ASAD, C = P.AYESHA;
  const ok = (r, w) => { if (r && r.ok === false) console.log('REFUSED', w, JSON.stringify(r)); return r; };
  if (stage === 'chosen') { const o = await rpc(p, C, 'job_offers', { p_job: j.id }); return ok(await rpc(p, C, 'choose_offer', { p_offer: o[0].id }), stage); }
  if (stage === 'on_way') return ok(await rpc(p, A, 'tech_step', { p_job: j.id, p_from: 'chosen' }), stage);
  if (stage === 'arrived') return ok(await rpc(p, A, 'tech_step', { p_job: j.id, p_from: 'on_way', p_loc: JSON.parse(LOC()) }), stage);
  if (stage === 'working') return ok(await rpc(p, A, 'start_work', { p_job: j.id, p_code: j.start_code, p_photos: [await upload(p, A)] }), stage);
  if (stage === 'change') return ok(await rpc(p, A, 'ask_change', { p_job: j.id, p_price_paisa: 350000, p_parts_paisa: 50000, p_reason: 'The drain pipe is cracked and needs replacing.', p_photo: await upload(p, A) }), stage);
  if (stage === 'approve') return ok(await rpc(p, C, 'decide_change', { p_change: j.change.id, p_approve: true }), stage);
  if (stage === 'chat') { await rpc(p, A, 'send_message', { p_job: j.id, p_body: 'I am at the gate.' }); return ok(await rpc(p, C, 'send_message', { p_job: j.id, p_body: 'Coming down now, two minutes.' }), stage); }
  if (stage === 'finish') return ok(await rpc(p, A, 'finish_work', { p_job: j.id, p_photos: [await upload(p, A)], p_parts_paisa: 50000, p_receipt: await upload(p, A) }), stage);
  if (stage === 'confirm') return ok(await rpc(p, C, 'confirm_work', { p_job: j.id }), stage);
}

// The phone's own status bar (clock, signal, Wi-Fi, battery) over the app's top 32 points,
// and the gesture bar at the foot: drawn by Android on a real phone, so drawn here for the picture.
export async function phoneBars(p, light = false) {
  await p.evaluate((light) => {
    document.getElementById('pk-bars')?.remove();
    const ink = light ? '#ffffff' : '#14171a';
    const d = document.createElement('div');
    d.id = 'pk-bars';
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647';
    d.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font:600 14px system-ui,-apple-system,Roboto,sans-serif;color:${ink}">
      <span>9:41</span>
      <span style="display:flex;gap:6px;align-items:center">
        <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="${ink}"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="${ink}"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="${ink}"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="${ink}"/></svg>
        <svg width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 10.5 1 4a9.5 9.5 0 0 1 13 0z" fill="${ink}"/></svg>
        <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="${ink}" opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="2" fill="${ink}"/><rect x="22.5" y="4" width="2" height="4" rx="1" fill="${ink}" opacity=".45"/></svg>
      </span></div>
      <div style="position:absolute;left:50%;bottom:7px;width:120px;height:4px;margin-left:-60px;border-radius:2px;background:${ink};opacity:.35"></div>`;
    document.getElementById('root').appendChild(d);
  }, light);
}
