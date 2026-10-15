import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type ProStatus = 'applied' | 'approved' | 'rejected' | 'suspended';

/** Exactly what public.my_account() returns: the asker's own account, nobody else's. */
export type Account = {
  role: 'customer' | 'pro' | null;
  first_name: string | null;
  is_staff: boolean;
  pro: {
    full_name: string;
    trades: string[];
    years: number;
    sectors: string[];
    about: string | null;
    status: ProStatus;
    status_reason: string | null;
  } | null;
};

type State = {
  /** True once we know whether anybody is signed in. Until then, show nothing. */
  ready: boolean;
  connected: boolean;
  session: Session | null;
  account: Account | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setAccount(null);
      return;
    }
    const { data } = await supabase.rpc('my_account');
    setAccount((data as Account | null) ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await load(data.session);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      load(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<State>(
    () => ({
      ready,
      connected: Boolean(supabase),
      session,
      account,
      refresh: () => load(session),
      signOut: async () => {
        await supabase?.auth.signOut();
        setAccount(null);
      },
    }),
    [ready, session, account, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
