import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Media } from './media';

/**
 * A half-written job, kept on the phone as it is typed. Signal drops, the
 * app gets closed to take a call: none of that should cost the customer the
 * voice note and the address they already gave.
 */
export type Draft = {
  trade: string | null;
  jobType: number | null;
  description: string;
  media: Media[];
  sector: string | null;
  street: string;
  house: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  whenKind: 'now' | 'today' | 'tomorrow';
  whenPart: 'morning' | 'afternoon' | 'evening' | null;
  power: 'on' | 'off' | null;
  parts: 'pro_buys' | 'customer_has' | null;
  gateNote: string;
  offer: number | null;
  /**
   * "Ask Bilal again", tapped on a finished job. The database remembers the
   * request, for an hour; this is only so the form can say so, and offer to
   * forget it. `at` is when it was asked, so the form forgets it when the
   * database does.
   */
  askFor: { name: string; trade: string; minutes: number; at: number } | null;
};

export const EMPTY: Draft = {
  trade: null,
  jobType: null,
  description: '',
  media: [],
  sector: null,
  street: '',
  house: '',
  landmark: '',
  lat: null,
  lng: null,
  accuracy: null,
  whenKind: 'today',
  whenPart: 'evening',
  power: null,
  parts: null,
  gateNote: '',
  offer: null,
  askFor: null,
};

const KEY = 'pechkas.draft.job';

export async function loadDraft(): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});
}

export function clearDraft() {
  AsyncStorage.removeItem(KEY).catch(() => {});
}
