import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

/** Where the identity company's page sends him back (the server function says the same). */
export const IDENTITY_BACK = 'pechkas://identity-done';

/**
 * Open the identity check (A119). The server function `identity` asks the
 * database first, as him, then the identity company for a session; the
 * company's own page opens in the phone's secure sheet, the same way Google
 * sign-in does. His CNIC picture and his selfie go to that company, never to
 * Pechkas. Returns a sentence to show when something stopped it, or null.
 */
export async function openIdentityCheck(): Promise<{ problem: string | null; field?: string | null }> {
  if (!supabase) return { problem: 'The app is not connected to Pechkas yet.' };
  const { data, error } = await supabase.functions.invoke('identity/start', { method: 'POST', body: {} });
  if (error) return { problem: 'The identity check is not answering. Try again in a few minutes.' };
  const r = data as { ok?: boolean; url?: string; why?: string; field?: string | null } | null;
  if (!r?.ok || !r.url) return { problem: r?.why ?? 'The identity check could not start. Try again.', field: r?.field ?? null };
  await WebBrowser.openAuthSessionAsync(r.url, IDENTITY_BACK);
  return { problem: null };
}
