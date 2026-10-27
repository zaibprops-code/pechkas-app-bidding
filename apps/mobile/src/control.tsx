import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { APP_EDITION } from '@pechkas/shared';
import { supabase } from './supabase';

/**
 * The office's two switches (public.app_status()): ask older copies to
 * update, and pause the app while something is being worked on.
 *
 * Asked when the app opens, whenever it comes back to the front, and every
 * half minute while one of them is on, so a lifted pause lets everybody
 * back in by itself. A copy that cannot ask — no internet, or a database
 * from before these switches — carries on as if both were off: being
 * unable to ask is never a reason to stop somebody.
 */
export type AppStatus = { min_edition: number; paused: boolean; note: string | null };

type State = {
  /** True once the first ask has answered or failed, so the launch cover knows when to lift. */
  checked: boolean;
  status: AppStatus | null;
  /** This copy is older than the office allows. */
  tooOld: boolean;
  paused: boolean;
  check: () => Promise<void>;
};

const Ctx = createContext<State>({ checked: true, status: null, tooOld: false, paused: false, check: async () => {} });

/** How often to ask again while a switch is on. */
const WHILE_ON = 30000;
/** The launch cover never waits longer than this for the answer. */
const AT_MOST = 3000;

export function ControlProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [checked, setChecked] = useState(!supabase);

  const check = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('app_status');
      // No answer, or no such function yet: keep what we last knew.
      if (!error && data && typeof data === 'object') setStatus(data as AppStatus);
    } catch {
      // As above.
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    check();
    const t = setTimeout(() => setChecked(true), AT_MOST);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [check]);

  const tooOld = (status?.min_edition ?? 0) > APP_EDITION;
  const paused = status?.paused === true;

  useEffect(() => {
    if (!tooOld && !paused) return;
    const t = setInterval(check, WHILE_ON);
    return () => clearInterval(t);
  }, [tooOld, paused, check]);

  const value = useMemo(() => ({ checked, status, tooOld, paused, check }), [checked, status, tooOld, paused, check]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useControl = () => useContext(Ctx);
