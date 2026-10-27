/**
 * Things the phone app and the admin panel must agree on exactly.
 *
 * MONEY IS ALWAYS INTEGER PAISA. Never a float, never rupees with a decimal
 * point. Rs 2,500 is 250000. The database stores it that way and every
 * helper here takes it that way, so a rounding argument cannot start.
 *
 * The database is still the one that decides. These helpers only show its
 * numbers on a screen and must give the same answer it gives: the tests in
 * packages/shared/test/ pin the cases where that matters.
 */

/**
 * Which edition of the phone app this code is: a whole number, raised by one
 * in the same commit as any change that older copies on people's phones
 * would get wrong. The office can then ask every copy older than this to
 * update (public.app_control.min_edition, set from the admin panel, which
 * reads this same number) — but only once this edition is in the stores,
 * or everybody would be asked for an update they cannot get.
 *
 * Copies built before editions existed never ask, so they are never stopped.
 */
export const APP_EDITION = 1;

/** What a screen shows when nobody has agreed a price. Never "Rs 0". */
export const NO_PRICE = 'no price yet';

/**
 * Rs 2,500 — or "no price yet" when there is no figure.
 *
 * Grouping is done by hand, in threes, rather than through Intl: Intl's
 * Pakistani locale differs between phones, and the same price must look the
 * same on every handset and in the admin panel. Paisa only appear when there
 * are some, which in practice is never.
 */
export function rupees(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return NO_PRICE;
  if (!Number.isSafeInteger(paisa)) throw new Error(`Money must be whole paisa, got ${paisa}`);
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = rest ? `${grouped}.${String(rest).padStart(2, '0')}` : grouped;
  return `${negative ? '−' : ''}Rs ${text}`;
}

/**
 * What Pechkas takes from a job, in paisa.
 *
 * Commission is set in basis points (1000 = 10%) and rounded DOWN, so any
 * odd paisa stays with the technician, never with Pechkas.
 */
export function commission(pricePaisa: number, bps: number): number {
  if (!Number.isSafeInteger(pricePaisa) || pricePaisa < 0) throw new Error('Price must be whole, positive paisa');
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) throw new Error('Commission must be 0 to 10000 basis points');
  return Math.floor((pricePaisa * bps) / 10000);
}

/** What the technician keeps: shown to him before he accepts, as rupees, not as a percentage. */
export function technicianKeeps(pricePaisa: number, bps: number): number {
  return pricePaisa - commission(pricePaisa, bps);
}

/**
 * A Pakistani mobile number, as typed, turned into the form sign-in needs:
 * "+923001234567". Returns null for anything that is not a mobile number.
 *
 * People type it every way: 0300 1234567, 0300-1234567, +92 300 1234567,
 * 92300…, or just 300…. All of those are the same phone. A landline (051…)
 * is not, because a code cannot be sent to one.
 */
export function pakistaniMobile(typed: string): string | null {
  const digits = (typed ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  let local: string;
  if (digits.startsWith('92')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits;
  return /^3\d{9}$/.test(local) ? `+92${local}` : null;
}

/** "+923001234567" → "0300 1234567", the way people read their own number. */
export function showMobile(e164: string): string {
  const local = e164.replace(/^\+?92/, '0');
  return /^03\d{9}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4)}` : e164;
}

/**
 * Why a sign-in code could not be sent, in plain words, from what Supabase
 * said. The app used to say "check your signal" for every failure, which
 * sent the owner looking at his phone's signal when Supabase had refused
 * the number. The sentence is for whoever is holding the phone; Supabase's
 * own words go underneath (see `authErrorDetails`), so a screenshot is
 * enough to tell what is wrong.
 */
export function explainAuthError(message: string | null | undefined, status?: number | null): string {
  const m = message ?? '';
  if (status === 0 || /network request failed|failed to fetch|fetch failed|network|timeout|timed out/i.test(m)) {
    return 'Pechkas could not be reached. Check your internet connection, then try again.';
  }
  // Supabase allows one code a minute per address, and says how long is left.
  // That is a few seconds, not "a few minutes", and the code already sent
  // still works — so say both.
  const soon = /after (\d+) seconds?/i.exec(m);
  if (soon) {
    const n = Number(soon[1]);
    return `A code was sent a moment ago, and it still works. You can ask for another in ${n} ${n === 1 ? 'second' : 'seconds'}.`;
  }
  if (/rate|too many/i.test(m) || status === 429) return 'Too many codes asked for. Wait a few minutes and try again.';
  if (/sign ?ups? (are |is )?(not allowed|disabled)/i.test(m)) return 'New accounts cannot be made right now. Please try again later.';
  if (/unsupported phone provider|phone (provider|logins?|signups?) (is |are )?disabled/i.test(m)) {
    return 'Signing in with a mobile number is switched off right now. Please try again later.';
  }
  if (/invalid.*phone|phone.*invalid/i.test(m)) return 'That number was not accepted. Check it and try again.';
  if (/email (provider|logins?|signups?) (is |are )?disabled/i.test(m)) return 'Signing in with an email is switched off right now. Please try again later.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'That email address was not accepted. Check it and try again.';
  // Supabase's words when its email sender (Resend, through SMTP) refuses or is not set up.
  if (/email|smtp|magic link/i.test(m)) return 'A code could not be emailed right now. Please try again later.';
  if (/sms|twilio|messagebird|vonage|textlocal|send/i.test(m)) return 'A code could not be sent to this number right now.';
  return 'The code could not be sent. Please try again.';
}

/**
 * What a sign-in link from an email brought back to the app.
 *
 * Supabase's email holds a link as well as the code. Tapped on the phone, it
 * goes to Supabase and comes back as pechkas://auth-callback?code=… — a
 * one-time code that only THIS phone can trade for a session, because the
 * other half of it (the PKCE verifier) never left the phone. A link carrying
 * a finished session (#access_token=…) is never accepted: any website can
 * open a pechkas:// address, and that would sign somebody into an account a
 * stranger chose — whose job list the stranger can read.
 */
export type SignInLink = { kind: 'code'; code: string } | { kind: 'error'; why: string } | { kind: 'none' };

export function readSignInLink(link: string | null | undefined): SignInLink {
  if (!link) return { kind: 'none' };
  const [beforeHash, hash = ''] = link.split('#', 2);
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  const q = new URLSearchParams(query);
  const h = new URLSearchParams(hash);
  const get = (k: string) => q.get(k) ?? h.get(k);
  const error = get('error_code') ?? get('error');
  if (error) {
    const said = get('error_description') ?? error;
    if (/expired|invalid/i.test(`${error} ${said}`)) {
      return { kind: 'error', why: 'This link has expired or was already used. Ask for a new code.' };
    }
    return { kind: 'error', why: `The link did not work: ${said}` };
  }
  const code = q.get('code');
  if (code && /^[A-Za-z0-9-]{8,}$/.test(code)) return { kind: 'code', code };
  return { kind: 'none' };
}

/** Why trading a link's code for a session failed, in plain words. */
export function explainLinkError(message: string | null | undefined): string {
  const m = message ?? '';
  if (/network|fetch|timeout/i.test(m)) return 'Pechkas could not be reached. Check your internet connection, then tap the link again.';
  if (/flow state|verifier|expired|invalid|not found/i.test(m)) {
    return 'This link is from an older email, or was opened on a different phone. Use the newest email, on the phone you asked from — or type its code.';
  }
  return 'The link did not work. Type the code from the email instead, or ask for a new one.';
}

/** "Supabase said: … (400) · abcd.supabase.co", for the small print under that sentence. */
export function authErrorDetails(message: string | null | undefined, status: number | null | undefined, url: string): string {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = url ? 'an address that is not a web address' : 'no address';
  }
  return `Details: ${message || 'no message'}${status ? ` (${status})` : ''} · ${host}`;
}

/**
 * How many digits a sign-in code has: the same for email and for a text
 * message, so the code screen always shows the same row of boxes.
 *
 * Supabase decides the real length — Authentication → Sign In / Providers →
 * Email → "Email OTP Length", and the same under Phone for text messages.
 * Both must say 6. The code screen used to guess, starting with six boxes and
 * adding more as digits arrived, up to ten; with Supabase set to 8 that meant
 * a row that grew while somebody typed. docs/OWNER.md has the steps.
 */
export const CODE_DIGITS = 6;

/**
 * What was typed or pasted into the code boxes: the digits only, never more
 * than CODE_DIGITS. If there were more — an email from a Supabase still set
 * to a longer code, or a code pasted with something else stuck to it —
 * `extra` says how many digits arrived, so the screen can say so rather than
 * quietly cut a code short and then call it wrong.
 */
export function readCode(text: string | null | undefined): { digits: string; extra: number | null } {
  const all = (text ?? '').replace(/\D/g, '');
  return { digits: all.slice(0, CODE_DIGITS), extra: all.length > CODE_DIGITS ? all.length : null };
}

/**
 * The first name Google gave, to fill in the welcome screen's box — which
 * the person can still change. Google sends `given_name` and the whole
 * `full_name`/`name`; nothing is guessed beyond the first word, and anything
 * that is not plainly a name (empty, or longer than the box allows) gives
 * nothing, so the box is simply empty as before.
 */
export function firstNameFrom(meta: Record<string, unknown> | null | undefined): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const given = pick(meta?.given_name);
  const whole = pick(meta?.full_name) || pick(meta?.name);
  const name = given || whole.split(/\s+/)[0] || '';
  return name.length >= 1 && name.length <= 40 && !/[@\d]/.test(name) ? name : '';
}
