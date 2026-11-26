/**
 * The identity server function, run under Node with a pretend database and a
 * pretend company: the database is asked first, as the technician; the
 * company's answer counts only with a good signature; only a result and a
 * reference ever reach the database; and nothing is logged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, signedBy, BACK } from './index.ts';

const CHECK = '11111111-2222-3333-4444-555555555555';
const env = {
  SUPABASE_URL: 'https://db.example.invalid',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-key',
  IDENTITY_PROVIDER: 'example',
  IDENTITY_WEBHOOK_SECRET: 'shh',
};

type Call = { name: string; args: Record<string, unknown>; auth: string | null; apikey: string | null };
function pretendDb(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const name = String(url).split('/rpc/')[1];
    const h = new Headers(init.headers);
    calls.push({ name, args: JSON.parse(String(init.body)), auth: h.get('authorization'), apikey: h.get('apikey') });
    return new Response(JSON.stringify(answers[name] ?? null), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

async function sign(body: string, secret = 'shh') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join('');
}

const start = (auth?: string) =>
  new Request('https://x.invalid/functions/v1/identity/start', { method: 'POST', headers: auth ? { authorization: auth } : {} });
const result = (body: string, sig?: string) =>
  new Request('https://x.invalid/functions/v1/identity/result', { method: 'POST', body, headers: sig ? { 'x-example-signature': sig } : {} });

test('start: nobody signed in is turned away before anything is asked', async () => {
  const db = pretendDb({});
  const r = await handle(start(), env, db.f);
  assert.equal(r.status, 401);
  assert.equal(db.calls.length, 0);
});

test('start: the database decides first, as him, with his own token', async () => {
  const db = pretendDb({ identity_start: { ok: false, why: 'Identity checks are not available yet.' } });
  const r = await handle(start('Bearer his-token'), env, db.f);
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.equal(body.why, 'Identity checks are not available yet.');
  assert.deepEqual(db.calls.map((c) => [c.name, c.auth, c.apikey]), [['identity_start', 'Bearer his-token', 'anon-key']]);
});

test('start: a refusal for too many tries is passed on with its box', async () => {
  const db = pretendDb({ identity_start: { ok: false, why: 'Try again tomorrow.', field: 'tries' } });
  const body = await (await handle(start('Bearer t'), env, db.f)).json();
  assert.equal(body.field, 'tries');
});

test('start: then the company makes a session, the server remembers it, and the app gets the page', async () => {
  const db = pretendDb({ identity_start: { ok: true, check_id: CHECK }, identity_session: { ok: true } });
  const body = await (await handle(start('Bearer t'), env, db.f)).json();
  assert.equal(body.ok, true);
  assert.match(body.url, /^https:\/\/id\.example\.invalid\//);
  const saved = db.calls.find((c) => c.name === 'identity_session')!;
  assert.equal(saved.auth, 'Bearer server-key');
  assert.equal(saved.args.p_check, CHECK);
  assert.equal(BACK, 'pechkas://identity-done');
});

test('start: with no company chosen, it says so and opens nothing', async () => {
  const db = pretendDb({ identity_start: { ok: true, check_id: CHECK } });
  const body = await (await handle(start('Bearer t'), { ...env, IDENTITY_PROVIDER: 'none' }, db.f)).json();
  assert.equal(body.ok, false);
  assert.equal(body.field, 'service');
  assert.equal(db.calls.filter((c) => c.name === 'identity_session').length, 0);
});

test('result: a wrong or missing signature changes nothing', async () => {
  const raw = JSON.stringify({ ref: CHECK, result: 'approved', id: 'EX-1' });
  for (const sig of [undefined, 'deadbeef', await sign(raw, 'not-the-secret')]) {
    const db = pretendDb({});
    const r = await handle(result(raw, sig), env, db.f);
    assert.equal(r.status, 401);
    assert.equal(db.calls.length, 0);
  }
});

test('result: a signed answer sends only the result and the reference, as the server', async () => {
  const raw = JSON.stringify({ ref: CHECK, result: 'approved', id: 'EX-1', name: 'Imran', document_number: 'not ours to keep' });
  const db = pretendDb({ identity_result: { ok: true } });
  const r = await handle(result(raw, await sign(raw)), env, db.f);
  assert.equal(r.status, 200);
  assert.deepEqual(db.calls.map((c) => c.name), ['identity_result']);
  const c = db.calls[0];
  assert.deepEqual(c.args, { p_check: CHECK, p_status: 'verified', p_reference: 'EX-1' });
  assert.equal(c.auth, 'Bearer server-key');
  assert.doesNotMatch(JSON.stringify(c.args), /Imran|not ours/);
});

test('result: declined is failed; still working is nothing yet', async () => {
  const no = JSON.stringify({ ref: CHECK, result: 'declined', id: 'EX-2' });
  const db = pretendDb({ identity_result: { ok: true } });
  await handle(result(no, await sign(no)), env, db.f);
  assert.equal(db.calls[0].args.p_status, 'failed');
  const wait = JSON.stringify({ ref: CHECK, result: 'in_review', id: 'EX-3' });
  const db2 = pretendDb({});
  assert.equal((await handle(result(wait, await sign(wait)), env, db2.f)).status, 200);
  assert.equal(db2.calls.length, 0);
});

test('result: an answer naming only the session is found through the database', async () => {
  const raw = JSON.stringify({ session: 'ex-11111111', result: 'approved', id: 'EX-4' });
  const db = pretendDb({ identity_check_of: CHECK, identity_result: { ok: true } });
  await handle(result(raw, await sign(raw)), env, db.f);
  assert.deepEqual(db.calls.map((c) => c.name), ['identity_check_of', 'identity_result']);
  assert.equal(db.calls[1].args.p_check, CHECK);
});

test('signedBy accepts the company hex, with or without sha256=', async () => {
  const s = await sign('x');
  assert.equal(await signedBy('x', s, 'shh'), true);
  assert.equal(await signedBy('x', `sha256=${s}`, 'shh'), true);
  assert.equal(await signedBy('x', s, undefined), false);
});

test('the function never logs', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8'));
  assert.doesNotMatch(src, /console\./);
});
