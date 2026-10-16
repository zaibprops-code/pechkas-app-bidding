import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
