import { router } from 'expo-router';
import type { Media } from './media';

/**
 * Pechkas' own camera (app/record.tsx), for photos and videos alike, asked
 * for from any screen: `await capture('photo')` opens it and gives back what
 * was taken, or null if the person closed it.
 *
 * Photos go through here as well as videos because the phone's own camera,
 * opened by the photo picker, refuses to start on Android 9 and older unless
 * the app holds the old storage permission — which Pechkas does not ask for,
 * on purpose. On those phones "Take a photo" could never work, for customers
 * or for technicians, whose start and finish photos are required. Our own
 * camera needs only the camera permission, on every phone.
 *
 * One request at a time: a new one ends the last with null.
 */
let waiting: ((m: Media | null) => void) | null = null;

export function capture(kind: 'photo' | 'video'): Promise<Media | null> {
  waiting?.(null);
  return new Promise((resolve) => {
    waiting = resolve;
    router.push({ pathname: '/record', params: { mode: kind } });
  });
}

/** The camera screen hands over what it took. */
export function recorded(m: Media) {
  const w = waiting;
  waiting = null;
  w?.(m);
}

/** The camera screen closed without taking anything. */
export function cancelled() {
  const w = waiting;
  waiting = null;
  w?.(null);
}
