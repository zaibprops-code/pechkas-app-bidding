import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Public by design: the URL and the publishable key let the browser ASK.
 * Every office function asks the database again whether this login is on
 * the staff list and switched on. Set them in Vercel's environment variables
 * (docs/OWNER.md), never in a file here.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export type Refusal = { ok: false; why: string; field?: string | null };
export type Answer<T = Record<string, unknown>> = ({ ok: true } & T) | Refusal;

export async function ask<T = Record<string, unknown>>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, why: 'Not connected to the database.' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, why: `The database said: ${error.message}` };
  return data as Answer<T>;
}
