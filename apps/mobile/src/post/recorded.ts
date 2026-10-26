import type { Media } from './media';

/**
 * How the camera screen (app/record.tsx) hands a finished video back to the
 * Post a job screen underneath it. Post a job stays open beneath the camera,
 * so it listens here while it is on screen; the camera calls `recorded()`
 * and goes back. One listener at a time: there is only one form.
 */
let waiting: ((m: Media) => void) | null = null;

export function whenRecorded(fn: (m: Media) => void): () => void {
  waiting = fn;
  return () => {
    if (waiting === fn) waiting = null;
  };
}

/** True when a form is open to take the video, so the camera never records into nothing. */
export function someoneWaiting(): boolean {
  return waiting !== null;
}

export function recorded(m: Media) {
  waiting?.(m);
}
