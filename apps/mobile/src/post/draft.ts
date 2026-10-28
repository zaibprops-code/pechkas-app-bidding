import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, openWindows, pkNow } from '@pechkas/shared';
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
  /** True when the sector was read from the pin, so the card can say so. */
  sectorRead: boolean;
  street: string;
  house: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  /** As soon as possible, or a day ("YYYY-MM-DD", Pakistan's) and a two-hour window from `whenFrom` o'clock. */
  whenKind: 'now' | 'day';
  whenDate: string | null;
  whenFrom: number | null;
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
  sectorRead: false,
  street: '',
  house: '',
  landmark: '',
  lat: null,
  lng: null,
  accuracy: null,
  whenKind: 'day',
  whenDate: null,
  whenFrom: null,
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
    return raw ? freshWhen({ ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) }) : null;
  } catch {
    return null;
  }
}

/**
 * A day and a window that can still be chosen: a draft from yesterday, or
 * from before days could be booked, starts again at the first open window —
 * this evening if there is one, otherwise tomorrow morning.
 */
export function freshWhen(d: Draft): Draft {
  if (d.whenKind === 'now') return d;
  const now = pkNow();
  if (d.whenKind === 'day' && d.whenDate && d.whenFrom !== null && openWindows(d.whenDate, now).includes(d.whenFrom) && d.whenDate <= addDays(now.date, 6)) return d;
  const today = openWindows(now.date, now);
  if (today.length) return { ...d, whenKind: 'day', whenDate: now.date, whenFrom: today.includes(18) ? 18 : today[0] };
  return { ...d, whenKind: 'day', whenDate: addDays(now.date, 1), whenFrom: 10 };
}

export function saveDraft(d: Draft) {
  AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});
}

export function clearDraft() {
  AsyncStorage.removeItem(KEY).catch(() => {});
}
