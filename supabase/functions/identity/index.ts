/**
 * The identity check's server function (A119): the only thing that talks to
 * the outside identity company. One file, so it can be pasted into
 * Supabase's own editor (Edge Functions → Deploy a new function → Via
 * Editor, name "identity"), with "Verify JWT" switched OFF for it, because
 * the company's answer carries no Pechkas sign-in; the start route checks
 * the technician's sign-in itself, through the database.
 *
 * Two routes:
 *   POST …/functions/v1/identity/start   — the app, signed in as the technician.
 *       The database decides (identity_start(): the service is on, he has
 *       applied, not verified yet, three openings a day at most), then the
 *       company makes a session, and the app opens the company's page.
 *   POST …/functions/v1/identity/result  — the company, when it has decided.
 *       Its signature is checked before anything is read; then only
 *       "verified" or "failed" and the company's own reference go to the
 *       database (identity_result()). The CNIC number, the card picture and
 *       the selfie stay with the company: nothing here reads, keeps or logs
 *       them, and the database refuses a reference shaped like a CNIC.
 *
 * Secrets, set in Supabase (Edge Functions → Secrets), never in this file:
 *   IDENTITY_PROVIDER        which company: 'none' until one is chosen
 *   IDENTITY_API_KEY         the company's key
 *   IDENTITY_WEBHOOK_SECRET  the secret the company signs its answers with
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are given to
 * every function by Supabase itself.
 *
 * Nothing is ever logged: no body, no header, no key.
 */

export type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

/** What a company's answer comes to, once its signature is good. */
export type Answer = { check?: string; session?: string; status: 'verified' | 'failed' | 'waiting'; reference: string };

export type Provider = {
  /** Make a session for this check; the page the technician opens, and the company's session id. */
  start(check: string, back: string, env: Env, f: Fetch): Promise<{ url: string; session: string }>;
  /** Read the company's answer, or null when its signature is wrong. */
  answer(raw: string, headers: Headers, env: Env): Promise<Answer | null>;
};

/** Where the company's page sends him when he is done: the app, which goes back to his checks. */
export const BACK = 'pechkas://identity-done';

// --- The companies -------------------------------------------------------------------------------
// One entry per company. The real one is written from that company's own
// documentation once the owner has chosen it (D37.2); until then 'none'
// refuses, and 'example' exists only so the tests can run the whole path.

const PROVIDERS: Record<string, Provider> = {
  example: {
    async start(check) {
      return { url: `https://id.example.invalid/verify?ref=${encodeURIComponent(check)}`, session: `ex-${check.slice(0, 8)}` };
    },
    async answer(raw, headers, env) {
      if (!(await signedBy(raw, headers.get('x-example-signature'), env.IDENTITY_WEBHOOK_SECRET))) return null;
      const b = JSON.parse(raw) as { ref?: string; session?: string; result?: string; id?: string };
      const status = b.result === 'approved' ? 'verified' : b.result === 'declined' ? 'failed' : 'waiting';
      return { check: b.ref, session: b.session, status, reference: String(b.id ?? '') };
    },
  },
};

/** An HMAC-SHA256 of the raw body, in hex, compared without leaking where it differs. */
export async function signedBy(raw: string, given: string | null, secret: string | undefined): Promise<boolean> {
  if (!given || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const want = Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join('');
  const got = given.trim().toLowerCase().replace(/^sha256=/, '');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// --- The database --------------------------------------------------------------------------------

/** Ask one database function, as the technician (his token) or as the server (the service role). */
async function rpc(env: Env, f: Fetch, name: string, args: Record<string, unknown>, as: { user?: string; server?: true }) {
  const key = as.server ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  const r = await f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key ?? '', authorization: as.server ? `Bearer ${key}` : (as.user ?? ''), 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// --- The two routes ------------------------------------------------------------------------------

export async function handle(req: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return reply(405, { ok: false, why: 'Not here.' });
  const path = new URL(req.url).pathname;
  const provider = PROVIDERS[env.IDENTITY_PROVIDER ?? 'none'];

  if (path.endsWith('/start')) {
    const user = req.headers.get('authorization');
    if (!user || !/^Bearer\s+\S+/.test(user)) return reply(401, { ok: false, why: 'Sign in first.' });
    // The database decides first, as him: the service is on, he applied, not verified, three a day.
    const s = await rpc(env, f, 'identity_start', {}, { user });
    if (s.status === 401 || s.status === 403) return reply(401, { ok: false, why: 'Sign in first.' });
    const v = s.body as { ok?: boolean; why?: string; field?: string; check_id?: string } | null;
    if (!v?.ok || !v.check_id) return reply(200, { ok: false, why: v?.why ?? 'The identity check could not start. Try again.', field: v?.field ?? null });
    if (!provider) return reply(200, { ok: false, why: 'The identity company is not connected yet.', field: 'service' });
    let made: { url: string; session: string };
    try {
      made = await provider.start(v.check_id, BACK, env, f);
    } catch {
      return reply(200, { ok: false, why: 'The identity company did not answer. Try again in a few minutes.', field: 'service' });
    }
    await rpc(env, f, 'identity_session', { p_check: v.check_id, p_session: made.session }, { server: true });
    return reply(200, { ok: true, url: made.url });
  }

  if (path.endsWith('/result')) {
    if (!provider) return reply(404, { ok: false });
    const raw = await req.text();
    let a: Answer | null;
    try {
      a = await provider.answer(raw, req.headers, env);
    } catch {
      return reply(400, { ok: false });
    }
    if (!a) return reply(401, { ok: false });
    if (a.status === 'waiting') return reply(200, { ok: true });
    let check = a.check && /^[0-9a-f-]{36}$/i.test(a.check) ? a.check : null;
    if (!check && a.session) {
      const found = await rpc(env, f, 'identity_check_of', { p_session: a.session }, { server: true });
      check = typeof found.body === 'string' ? found.body : null;
    }
    if (!check) return reply(200, { ok: false });
    const r = await rpc(env, f, 'identity_result', { p_check: check, p_status: a.status, p_reference: a.reference }, { server: true });
    // 200 whatever the database said, so the company does not keep sending an answer that was refused on purpose.
    return reply(200, { ok: (r.body as { ok?: boolean } | null)?.ok === true });
  }

  return reply(404, { ok: false, why: 'Not here.' });
}

// Supabase runs this file with Deno; the tests import handle() under Node.
const D = (globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): void; env: { toObject(): Env } } }).Deno;
if (D) D.serve((req) => handle(req, D.env.toObject()));
