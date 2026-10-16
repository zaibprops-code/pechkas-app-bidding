import { showMobile } from '@pechkas/shared';
import { supabase } from './supabase.ts';

/**
 * Numbers somebody typed after signing in with an email, which nobody has
 * checked by SMS. Loaded from public.admin_unchecked_phones() when the office
 * signs in and every minute after, so every screen can say "(not checked)"
 * beside one: a typed number could belong to anybody.
 */
let unchecked = new Set<string>();

export async function loadUnchecked(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.rpc('admin_unchecked_phones');
  unchecked = new Set(((data as string[] | null) ?? []).map((p) => p.replace(/^\+/, '')));
}

/** "0300 7777777", or "0300 7777777 (not checked)" for a typed number. */
export function shown(phone: string): string {
  return `${showMobile(phone)}${unchecked.has(phone.replace(/^\+/, '')) ? ' (not checked)' : ''}`;
}
