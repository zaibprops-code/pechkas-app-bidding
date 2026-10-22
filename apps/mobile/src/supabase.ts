import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { explainAuthError, explainLinkError, readSignInLink } from '@pechkas/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The one connection to the database.
 *
 * Both values are public by design: the URL and the publishable ("anon") key
 * are printed inside every copy of the app. They let a phone ASK; the
 * database decides what it may have, and the first migration closed every
 * door that a later one has not opened on purpose. They are set in Expo's
 * Environment variables (docs/OWNER.md), never in a file here.
 *
 * Without them the app still opens and says it is not connected, rather
 * than crashing.
 */
export const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          // The email's link comes back with a one-time code that only this
          // phone can trade, never with a finished session: see
          // readSignInLink() in packages/shared.
          flowType: 'pkce',
        },
      })
    : null;

// Refresh the sign-in only while the app is on screen, as Supabase advises
// for phones; a background timer is how batteries and sessions both die.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/**
 * Where the link in a sign-in email sends the phone: pechkas://auth-callback
 * in a real build. Supabase only sends it there if this address is on its
 * Redirect URLs list (docs/OWNER.md); otherwise the link opens its Site URL.
 */
export const LINK_BACK = Linking.createURL('auth-callback');

/** Emails a code — and a link that opens this app — to somebody signing in by email. */
export function sendEmailCode(email: string) {
  if (!supabase) return Promise.resolve({ error: { message: 'The app is not connected to Pechkas yet.', status: 0 } });
  return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: LINK_BACK } });
}

/**
 * Trades the one-time code from a sign-in link for a session on this phone.
 *
 * The same code can arrive twice: Google's sheet hands it back to
 * signInWithGoogle(), and Android also opens pechkas://auth-callback with it.
 * Only the first trade can succeed — the phone's half of the code is used
 * up — so a refusal while a session already exists is the other one having
 * got there first, not a failure.
 */
export async function tradeCode(code: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'The app is not connected to Pechkas yet.' };
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return { error: null };
  const { data } = await supabase.auth.getSession();
  return { error: data.session ? null : explainLinkError(error.message) };
}

/**
 * Whether "Continue with Google" is switched on in Supabase. The button is
 * only drawn when it is, so a copy of the app built before the owner set
 * Google up never shows a button that does nothing, and the button appears
 * by itself once he has, without a new build. Any doubt — no signal, an old
 * Supabase — counts as off.
 */
export async function googleReady(): Promise<boolean> {
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!r.ok) return false;
    const settings = (await r.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

/**
 * Continue with Google. Google's own page opens in a secure sheet over the
 * app (Chrome on Android), the person picks an account, and Google sends
 * them back to pechkas://auth-callback with a one-time code — the same door,
 * and the same rule, as the link in a sign-in email: the code is only good
 * on the phone that started, and a link carrying a finished session is
 * never accepted (readSignInLink).
 *
 * Returns `cancelled` when the person closed the sheet: that is not an error
 * and nothing is said.
 */
export async function signInWithGoogle(): Promise<{ error: string | null; cancelled?: boolean }> {
  if (!supabase) return { error: 'The app is not connected to Pechkas yet.' };
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: LINK_BACK, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) return { error: explainAuthError(error?.message ?? 'No address to open', error?.status) };
  const result = await WebBrowser.openAuthSessionAsync(data.url, LINK_BACK);
  if (result.type !== 'success') return { error: null, cancelled: true };
  const link = readSignInLink(result.url);
  if (link.kind === 'error') return { error: link.why };
  if (link.kind !== 'code') return { error: 'Google did not send a sign-in back. Please try again.' };
  return tradeCode(link.code);
}

/** What a database function gives back when it refuses: which box, and why. */
export type Refusal = { ok: false; why: string; field?: string | null };
export type Answer<T = Record<string, unknown>> = ({ ok: true } & T) | Refusal;

/**
 * Calls a database function and always returns an answer, never throws: a
 * dropped signal in a stairwell becomes a sentence on the screen.
 */
export async function ask<T = Record<string, unknown>>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, why: 'The app is not connected to Pechkas yet.' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const offline = /network|fetch|timeout/i.test(error.message);
    return { ok: false, why: offline ? 'No connection. Check your signal and try again.' : 'Something went wrong. Please try again.' };
  }
  return data as Answer<T>;
}
