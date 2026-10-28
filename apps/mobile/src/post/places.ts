import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Addresses a customer has saved — Home, Office, or Other — and the last one
 * used, kept ON THE PHONE ONLY, so one tap fills the whole Address card next
 * time. Nothing here goes to Pechkas until a job is posted with it, which is
 * what the privacy page says. Cleared with the app's data, or by tapping ×.
 */
export type PlaceLabel = 'Home' | 'Office' | 'Other';

export type Place = {
  /** null for the last address used, which nobody named. */
  label: PlaceLabel | null;
  sector: string;
  street: string;
  house: string;
  landmark: string;
  gateNote: string;
  lat: number;
  lng: number;
};

const KEY = 'pechkas.places';
/** The old key: the last address used, before the map came first. It had no pin, so it is not used again. */
const OLD = 'pechkas.last-address';

export async function loadPlaces(): Promise<Place[]> {
  try {
    AsyncStorage.removeItem(OLD).catch(() => {});
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Place[]) : [];
    return Array.isArray(all) ? all.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.house && p.sector) : [];
  } catch {
    return [];
  }
}

/** One per label, and one unnamed "last used"; a named one replaces any older one of the same name. */
export async function rememberPlace(place: Place): Promise<Place[]> {
  const all = await loadPlaces();
  const same = (a: Place) => a.lat === place.lat && a.lng === place.lng && a.house === place.house;
  const next = [place, ...all.filter((p) => p.label !== place.label && !same(p))]
    // A named copy of the same spot makes the unnamed one pointless.
    .filter((p, i, list) => p.label !== null || !list.some((q) => q.label !== null && same(q)))
    .slice(0, 4);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export async function forgetPlace(place: Place): Promise<Place[]> {
  const all = (await loadPlaces()).filter((p) => !(p.label === place.label && p.lat === place.lat && p.lng === place.lng));
  await AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});
  return all;
}

/** "House 12, Street 34" — the line a saved address is known by. */
export function placeLine(p: { house: string; street: string }): string {
  return [p.house, p.street].map((x) => x.trim()).filter(Boolean).join(', ');
}

/** Signing out (and deleting the account) forgets every address on this phone: the next person to sign in must not see them. */
export async function forgetAllPlaces() {
  await AsyncStorage.multiRemove([KEY, OLD]).catch(() => {});
}
