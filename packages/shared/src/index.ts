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
