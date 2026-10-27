import { useEffect, useRef, useState } from 'react';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';

/**
 * Whether this phone can reach the internet, as the phone itself reports it.
 *
 * Only a phone that is SURE it is offline counts as offline: while it is
 * still finding out (`null`), or cannot say, we carry on as if it were
 * online and let the request itself fail. A weak signal that is slowly
 * getting through must never be blocked by a guess.
 *
 * One listener for the whole app, shared by every screen that asks.
 */
let offline = false;
const listeners = new Set<(offline: boolean) => void>();

function read(s: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>) {
  const now = s.isConnected === false || s.isInternetReachable === false;
  if (now === offline) return;
  offline = now;
  listeners.forEach((fn) => fn(now));
}

let started = false;
function start() {
  if (started) return;
  started = true;
  try {
    getNetworkStateAsync().then(read, () => {});
    addNetworkStateListener(read);
  } catch {
    // A phone that cannot tell us is treated as online: the requests will say.
  }
}

/**
 * Asks the phone now, rather than trusting the last report: at launch the
 * first report may not have arrived when the first request has already
 * failed.
 */
export async function phoneOffline(): Promise<boolean> {
  start();
  try {
    read(await getNetworkStateAsync());
  } catch {
    // Cannot tell: keep what we had.
  }
  return offline;
}

/** Why no answer came, asked of the phone at that moment. */
export async function whyNoAnswer(): Promise<NoAnswer> {
  return (await phoneOffline()) ? 'offline' : 'unreachable';
}

/** True only while the phone is sure it has no internet. */
export function isOffline(): boolean {
  start();
  return offline;
}

/** Re-draws when the phone goes offline or comes back. */
export function useOffline(): boolean {
  start();
  const [now, setNow] = useState(offline);
  useEffect(() => {
    setNow(offline);
    listeners.add(setNow);
    return () => {
      listeners.delete(setNow);
    };
  }, []);
  return now;
}

/**
 * Calls `fn` the moment the connection comes back, so a screen that could
 * not load tries again by itself. Nothing happens while it stays online.
 */
export function useBackOnline(fn: () => void, enabled = true) {
  start();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const on = (off: boolean) => {
      if (!off) latest.current();
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, [enabled]);
}

/** The two ways a request can fail to arrive, which the person is told apart. */
export type NoAnswer = 'offline' | 'unreachable';

/**
 * Why a request got no answer: the phone has no internet, or it has and
 * Pechkas did not reply (Supabase down, paused, or the signal too weak to
 * finish). Worked out from what the phone says at the time, never guessed
 * from the error's wording alone.
 */
export function noAnswer(): NoAnswer {
  return isOffline() ? 'offline' : 'unreachable';
}
