// The Pechkas demo's pretend server. It runs inside the page: a real Postgres
// (PGlite) with every real migration, answering the app's requests to
// Supabase. Sign-in is pretend (any number, code 123456). Nothing leaves the
// page: there is no real Pechkas data here and nothing is sent anywhere.
import { PGlite } from '@electric-sql/pglite';

const B = window.__PB; // the folder this page's own files are served from
const SUPA = 'https://demo.pechkas.invalid';
const ENTRY = window.__PENTRY;
const status = (t) => window.__pstatus?.(t);
const realFetch = window.fetch.bind(window);

// ---------------------------------------------------------------- the database
let db;
let queue = Promise.resolve();
const serial = (f) => (queue = queue.then(f, f));
const asOwner = (sql, params = []) => serial(() => db.query(sql, params));
async function asRole(sub, sql, params) {
  return serial(async () => {
    const role = sub ? 'authenticated' : 'anon';
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    await db.exec(`SET ROLE ${role};`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec('RESET ROLE;');
      await db.query(`SELECT set_config('request.jwt.claims', '', false)`);
    }
  });
}

async function file(name) {
  const r = await realFetch(B + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r;
}

// Files an artifact cannot serve as they are come as base64 text.
async function bytes(name) {
  const t = (await (await file(name)).text()).trim();
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
let pgcryptoBytes = null;

async function boot() {
  status('Loading the database (1 of 3)…');
  const [pgBuf, initBuf, fsBytes, startBytes, cryptoBytes] = await Promise.all([
    file('pglite.wasm').then((r) => r.arrayBuffer()),
    file('initdb.wasm').then((r) => r.arrayBuffer()),
    bytes('pglite-data.txt'),
    bytes('start.txt'),
    bytes('pgcrypto.txt'),
  ]);
  pgcryptoBytes = cryptoBytes;
  status('Starting the database (2 of 3)…');
  const [pgliteWasmModule, initdbWasmModule] = await Promise.all([WebAssembly.compile(pgBuf), WebAssembly.compile(initBuf)]);
  const pgcrypto = { name: 'pgcrypto', setup: async () => ({ bundlePath: new URL(SUPA + '/__pgcrypto.tar.gz') }) };
  db = await PGlite.create({
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle: new Blob([fsBytes]),
    loadDataDir: new File([startBytes], 'start.tar.gz', { type: 'application/x-gzip' }),
    extensions: { pgcrypto },
    relaxedDurability: true,
  });
  status('Adding the example jobs (3 of 3)…');
  await seed();
  setInterval(runClocks, 60_000);
}

// What pg_cron would run: every scheduled job, once a minute. Failures are ignored.
async function runClocks() {
  try {
    const { rows } = await asOwner(`SELECT command FROM cron.job`);
    for (const r of rows) await asOwner(r.command).catch(() => {});
  } catch {}
}

// ---------------------------------------------------------------- example jobs
const id = (n) => `de${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const AYESHA = id(1), SARA = id(2), HINA = id(3), BILAL = id(4), ASAD = id(5);
const one = async (sub, sql, params = []) => Object.values((await asRole(sub, sql, params)).rows[0] ?? {})[0];
let uploads = 0;
async function upload(who) {
  uploads += 1;
  const name = `${who}/example-${uploads}.jpg`;
  await asRole(who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
}
const POST = `SELECT public.post_job(p_trade => $1, p_job_type => $2, p_description => $3, p_offer_paisa => $4,
  p_when_kind => 'later', p_when_part => NULL, p_sector => $5, p_street => $6, p_house => $7,
  p_lat => $8, p_lng => $9, p_media => '[]'::jsonb, p_when_date => $10::date, p_when_from => NULL)`;
async function seed() {
  const day = async (n) => (await asOwner(`SELECT ((now() AT TIME ZONE 'Asia/Karachi')::date + $1::int)::text AS d`, [n])).rows[0].d;
  const type = async (t, like) => (await asOwner(`SELECT id FROM public.job_types WHERE trade = $1 AND name ILIKE $2 ORDER BY id LIMIT 1`, [t, like])).rows[0]?.id ?? null;
  const tomorrow = await day(1);
  const inTwo = await day(2);
  const must = (r, what) => {
    if (!r?.ok) throw new Error(`${what}: ${JSON.stringify(r)}`);
    return r;
  };
  // Ayesha's AC, finished last time with Asad (so she has a history and can rate).
  const service = await type('ac', '%service%');
  const done = must(await one(AYESHA, POST, ['ac', service, 'The AC needs a service before summer.', 300000, 'F-11', 'Street 34', 'House 12', 33.6837, 72.9876, tomorrow]), 'post done');
  must(await one(ASAD, `SELECT public.make_offer($1, $2, NULL, NULL, 14::smallint)`, [done.id, 300000]), 'offer done');
  const o1 = (await asOwner(`SELECT id FROM public.offers WHERE job_id = $1`, [done.id])).rows[0].id;
  must(await one(AYESHA, `SELECT public.choose_offer($1)`, [o1]), 'choose done');
  await one(ASAD, `SELECT public.tech_step($1, 'chosen')`, [done.id]);
  const now = new Date().toISOString();
  const at = JSON.stringify({ lat: 33.6837, lng: 72.9876, accuracy: 8, fix_at: now, sent_at: now, mocked: false });
  must(await one(ASAD, `SELECT public.tech_step($1, 'on_way', $2::jsonb)`, [done.id, at]), 'arrive done');
  const code = (await asOwner(`SELECT start_code FROM public.jobs WHERE id = $1`, [done.id])).rows[0].start_code;
  must(await one(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [done.id, code, JSON.stringify([await upload(ASAD)])]), 'start done');
  // A new price at the door, which she approved, and his note for her (the finished job's page shows both).
  must(await one(ASAD, `SELECT public.ask_change($1, $2, $3, $4)`, [done.id, 350000, 'The outdoor fan capacitor had worn out and needed changing.', await upload(ASAD)]), 'change done');
  const ch = (await asOwner(`SELECT id FROM public.job_changes WHERE job_id = $1`, [done.id])).rows[0].id;
  must(await one(AYESHA, `SELECT public.decide_change($1, true)`, [ch]), 'approve done');
  must(await one(ASAD, `SELECT public.pro_set_note($1, $2)`, [done.id, 'Clean the filters every 3 months. The outdoor stand will need replacing within a year.']), 'note done');
  must(await one(ASAD, `SELECT public.finish_work($1, $2::jsonb, 0, NULL)`, [done.id, JSON.stringify([await upload(ASAD)])]), 'finish done');
  must(await one(AYESHA, `SELECT public.confirm_work($1)`, [done.id]), 'confirm done');
  await asOwner(`UPDATE public.jobs SET created_at = now() - interval '6 days' WHERE id = $1`, [done.id]);

  // A job that stopped at the door: she said no to a new price, so a visit fee only, which he says she paid.
  const gas = await type('ac', '%gas%');
  const stop = must(await one(AYESHA, POST, ['ac', gas, 'The lounge AC blows warm air.', 450000, 'F-11', 'Street 34', 'House 12', 33.6837, 72.9876, tomorrow]), 'post stopped');
  must(await one(ASAD, `SELECT public.make_offer($1, $2, NULL, NULL, 10::smallint)`, [stop.id, 450000]), 'offer stopped');
  const o2 = (await asOwner(`SELECT id FROM public.offers WHERE job_id = $1`, [stop.id])).rows[0].id;
  must(await one(AYESHA, `SELECT public.choose_offer($1)`, [o2]), 'choose stopped');
  await one(ASAD, `SELECT public.tech_step($1, 'chosen')`, [stop.id]);
  must(await one(ASAD, `SELECT public.tech_step($1, 'on_way', $2::jsonb)`, [stop.id, at]), 'arrive stopped');
  const code2 = (await asOwner(`SELECT start_code FROM public.jobs WHERE id = $1`, [stop.id])).rows[0].start_code;
  must(await one(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [stop.id, code2, JSON.stringify([await upload(ASAD)])]), 'start stopped');
  must(await one(ASAD, `SELECT public.ask_change($1, $2, $3, $4)`, [stop.id, 900000, 'The compressor has failed and must be replaced.', await upload(ASAD)]), 'change stopped');
  const ch2 = (await asOwner(`SELECT id FROM public.job_changes WHERE job_id = $1`, [stop.id])).rows[0].id;
  must(await one(AYESHA, `SELECT public.decide_change($1, false)`, [ch2]), 'decline stopped');
  must(await one(ASAD, `SELECT public.pro_visit_fee($1, true)`, [stop.id]), 'fee paid');
  await asOwner(`UPDATE public.jobs SET created_at = now() - interval '20 days', finished_at = finished_at - interval '19 days' WHERE id = $1`, [stop.id]);

  // A job she cancelled before choosing anyone.
  const tap = await type('plumber', '%tap%');
  const gone = must(await one(AYESHA, POST, ['plumber', tap, 'The kitchen tap drips all night.', 120000, 'F-11', 'Street 34', 'House 12', 33.6837, 72.9876, tomorrow]), 'post cancelled');
  must(await one(AYESHA, `SELECT public.cancel_job($1, $2)`, [gone.id, 'A neighbour fixed it for me.']), 'cancel');
  await asOwner(`UPDATE public.jobs SET created_at = now() - interval '35 days' WHERE id = $1`, [gone.id]);
  await asOwner(`UPDATE public.cancellations SET cancelled_at = now() - interval '35 days' + interval '2 hours' WHERE job_id = $1`, [gone.id]);
  await asOwner(`UPDATE public.job_events SET at = at - interval '35 days' WHERE job_id = $1`, [gone.id]);
  await asOwner(`UPDATE public.job_events SET at = at - interval '19 days' WHERE job_id = $1`, [stop.id]);

  // Ayesha's open job: a leaking AC, with an offer from Asad waiting for her.
  const leak = await type('ac', '%leak%');
  const open = must(await one(AYESHA, POST, ['ac', leak, 'Water is dripping from the indoor unit in the bedroom.', 250000, 'F-11', 'Street 34', 'House 12', 33.6837, 72.9876, tomorrow]), 'post open');
  must(await one(ASAD, `SELECT public.make_offer($1, $2, NULL, 'I can bring a new drain pipe if needed.', 16::smallint)`, [open.id, 280000]), 'offer open');

  // Two jobs for Bilal (the demo technician) to offer on.
  const fan = await type('electrician', '%fan%');
  must(await one(SARA, POST, ['electrician', fan, 'The ceiling fan in the lounge hums and turns slowly.', 150000, 'E-11', 'Street 7', 'House 40', 33.6990, 72.9720, tomorrow]), 'post sara');
  must(await one(HINA, POST, ['ac', null, 'The AC is not cooling at all since yesterday.', 300000, 'G-13', 'Street 12', 'House 3', 33.6510, 72.9620, inTwo]), 'post hina');
}

// ---------------------------------------------------------------- pretend sign-in
const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const userJson = (row) => ({ id: row.id, aud: 'authenticated', role: 'authenticated', phone: row.phone ?? '', email: row.email ?? '', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
function session(row) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: row.id, role: 'authenticated', exp, aud: 'authenticated' })}.demo`;
  return { access_token, token_type: 'bearer', expires_in: 3600 * 24 * 30, expires_at: exp, refresh_token: `r-${row.id}`, user: userJson(row) };
}
function subFrom(headers) {
  const parts = (headers.get('authorization') ?? '').replace(/^Bearer /, '').split('.');
  if (parts.length !== 3) return null;
  try {
    return unb64(parts[1]).sub ?? null;
  } catch {
    return null;
  }
}
const userBy = async (col, v) => (await asOwner(`SELECT id, phone, email FROM auth.users WHERE ${col} = $1`, [v])).rows[0];
const pendingPhone = new Map();
const files = new Map();
const asArg = (v) => (v !== null && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => typeof x === 'string')) ? JSON.stringify(v) : v);

// A picture for any example photo that was never really taken.
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e9e4da"/><text x="200" y="158" font-family="sans-serif" font-size="22" fill="#5b6168" text-anchor="middle">Example photo</text></svg>')}`;
const blobUrls = new Map();
export function mapUrl(u) {
  if (typeof u !== 'string' || !u.startsWith(SUPA + '/storage/')) return u;
  const path = decodeURIComponent(new URL(u).pathname.replace(/^\/storage\/v1\/object\/(sign|public)\/job-media\//, ''));
  const f = files.get(path);
  if (!f) return PLACEHOLDER;
  if (!blobUrls.has(path)) blobUrls.set(path, URL.createObjectURL(f));
  return blobUrls.get(path);
}

const reply = (code, obj, headers = {}) =>
  new Response(code === 204 || obj === undefined ? null : JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json', ...headers } });

async function route(req) {
  await ready;
  const url = new URL(req.url);
  const p = url.pathname;
  const body = async () => {
    const t = await req.text();
    return t ? JSON.parse(t) : {};
  };
  if (p === '/auth/v1/settings') return reply(200, { external: { google: false, email: true, phone: true } });
  if (p === '/auth/v1/otp') return reply(200, {});
  if (p === '/auth/v1/verify') {
    const b = await body();
    if (b.token !== '123456') return reply(400, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid. In this demo the code is always 123456.' });
    const phone = String(b.phone ?? '').replace(/^\+/, '');
    if (b.type === 'phone_change') {
      const who = pendingPhone.get(phone);
      await asOwner(`UPDATE auth.users SET phone = $2 WHERE id = $1`, [who, phone]);
      return reply(200, session(await userBy('id', who)));
    }
    let u = b.email ? await userBy('email', b.email) : await userBy('phone', phone);
    if (!u) {
      const fresh = crypto.randomUUID();
      await asOwner(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [fresh, b.email ? null : phone, b.email ?? null]);
      u = await userBy('id', fresh);
    }
    return reply(200, session(u));
  }
  if (p === '/auth/v1/token') {
    const b = await body();
    if (url.searchParams.get('grant_type') === 'password') {
      const u = await userBy('email', b.email);
      if (!u || b.password !== 'demo') return reply(400, { error: 'invalid_grant', error_description: 'Invalid login credentials. In this demo the password is demo.' });
      return reply(200, session(u));
    }
    const u = await userBy('id', String(b.refresh_token ?? '').replace(/^r-/, ''));
    return u ? reply(200, session(u)) : reply(400, { error: 'invalid_grant' });
  }
  if (p === '/auth/v1/user') {
    const sub = subFrom(req.headers);
    if (!sub) return reply(401, { msg: 'Not signed in' });
    if (req.method === 'PUT') {
      const b = await body();
      if (b.phone) pendingPhone.set(String(b.phone).replace(/^\+/, ''), sub);
    }
    const u = await userBy('id', sub);
    return u ? reply(200, userJson(u)) : reply(401, { msg: 'Not signed in' });
  }
  if (p === '/auth/v1/logout') return reply(204);
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.slice('/rest/v1/rpc/'.length);
    if (!/^[a-z_0-9]+$/.test(fn)) return reply(404, { message: 'No such function' });
    const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await body();
    const keys = Object.keys(args).filter((k) => /^[a-z_0-9]+$/.test(k));
    const call = `SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
    try {
      const r = await asRole(subFrom(req.headers), call, keys.map((k) => asArg(args[k])));
      const cols = r.fields.map((f) => f.name);
      if (cols.length === 1 && cols[0] === fn) return reply(200, r.rows[0]?.[fn] ?? null);
      return reply(200, r.rows);
    } catch (e) {
      return reply(400, { code: e.code ?? 'P0001', message: e.message, details: null, hint: null });
    }
  }
  if (p.startsWith('/storage/v1/object/sign/job-media')) {
    const rest = decodeURIComponent(p.slice('/storage/v1/object/sign/job-media'.length).replace(/^\//, ''));
    if (req.method === 'GET') {
      const f = files.get(rest);
      return f ? new Response(f, { status: 200, headers: { 'content-type': f.type } }) : realFetch(PLACEHOLDER);
    }
    const b = await body();
    const sign = (path) => `/object/sign/job-media/${encodeURIComponent(path)}?token=demo`;
    if (b.paths) return reply(200, b.paths.map((path) => ({ path, signedURL: sign(path), error: null })));
    return reply(200, { signedURL: sign(rest) });
  }
  if (p.startsWith('/storage/v1/object/job-media/')) {
    const path = decodeURIComponent(p.slice('/storage/v1/object/job-media/'.length));
    const blob = await req.blob();
    try {
      await asRole(subFrom(req.headers), `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [path]);
    } catch (e) {
      return reply(400, { statusCode: '403', error: 'Unauthorized', message: e.message });
    }
    files.set(path, blob);
    return reply(200, { Key: `job-media/${path}`, path });
  }
  if (p.startsWith('/storage/v1/object/remove') || (req.method === 'DELETE' && p.startsWith('/storage/v1/object/job-media'))) return reply(200, []);
  return reply(404, { message: `Not in the demo: ${req.method} ${p}` });
}

// ---------------------------------------------------------------- wiring
window.fetch = (input, init) => {
  const req = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
  if (req.url === SUPA + '/__pgcrypto.tar.gz') return Promise.resolve(new Response(pgcryptoBytes, { status: 200, headers: { 'content-type': 'application/x-gzip' } }));
  if (req.url.startsWith(SUPA)) return route(req).catch((e) => reply(500, { message: e.message }));
  return realFetch(input, init);
};

// Photos and videos are shown by <img> and CSS, which do not go through fetch.
for (const proto of [HTMLImageElement.prototype, HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
  const d = Object.getOwnPropertyDescriptor(proto, 'src');
  if (d?.set) Object.defineProperty(proto, 'src', { ...d, set(v) { d.set.call(this, mapUrl(v)); } });
}
{
  const d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundImage');
  const fix = (v) => (typeof v === 'string' && v.includes(SUPA) ? v.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => `url("${mapUrl(u)}")`) : v);
  if (d?.set) Object.defineProperty(CSSStyleDeclaration.prototype, 'backgroundImage', { ...d, set(v) { d.set.call(this, fix(v)); } });
  const sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (n, v, pr) {
    return sp.call(this, n, n === 'background-image' ? fix(v) : v, pr);
  };
}

// The page cannot use the phone's location, so the demo stands in: at the
// technician's current job when there is one, otherwise in F-11.
async function demoSpot() {
  try {
    const r = (await asOwner(`SELECT lat, lng FROM public.jobs WHERE status = 'assigned' AND lat IS NOT NULL ORDER BY assigned_at DESC NULLS LAST LIMIT 1`)).rows[0];
    if (r) return { latitude: Number(r.lat), longitude: Number(r.lng) };
  } catch {}
  return { latitude: 33.6837, longitude: 72.9876 };
}
const position = async () => ({ coords: { ...(await demoSpot()), accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
const fakeGeo = {
  getCurrentPosition(ok) {
    position().then(ok);
  },
  watchPosition(ok) {
    position().then(ok);
    return 1;
  },
  clearWatch() {},
};
try {
  Object.defineProperty(navigator, 'geolocation', { value: fakeGeo, configurable: true });
} catch {}
if (navigator.permissions?.query) {
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => (d?.name === 'geolocation' ? Promise.resolve({ state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} }) : q(d));
}

const ready = boot();
ready.then(
  () => {
    status('');
    const s = document.createElement('script');
    s.src = B + ENTRY;
    document.body.appendChild(s);
  },
  (e) => {
    console.error(e);
    window.__pfail?.(e?.message ?? String(e));
  },
);
