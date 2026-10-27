import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { forget } from './notifications';
import { whyNoAnswer, type NoAnswer } from './net';
import { supabase } from './supabase';

export type ProStatus = 'applied' | 'approved' | 'rejected' | 'suspended';

/** Exactly what public.my_account() returns: the asker's own account, nobody else's. */
export type Account = {
  role: 'customer' | 'pro' | null;
  first_name: string | null;
  is_staff: boolean;
  /** Set when they signed in with an email code. */
  email?: string | null;
  /** The number the other side rings: checked by SMS, or typed by an email account. */
  phone?: string | null;
  phone_checked?: boolean;
  /** An email account that has not typed a number yet: it cannot post or apply. */
  needs_phone?: boolean;
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
  /**
   * Set when the app could not find out who this is because no answer came:
   * no internet, or Pechkas not replying. Never the same as "signed out" —
   * treating it as that sent a signed-in customer with no signal to the
   * welcome screen, and a technician to the customer's home. The layout
   * shows the trouble screen instead, and `retry` asks again.
   */
  trouble: NoAnswer | null;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

/** How long the green cover waits on an offline phone before saying so. */
const SAY_OFFLINE_AFTER = 4000;
/** How long it waits on a connected phone that gets no answer. */
const SAY_TROUBLE_AFTER = 10000;

export function AccountProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [trouble, setTrouble] = useState<NoAnswer | null>(null);

  /**
   * Reads the account. On a failed read the account already known is KEPT:
   * a dropped signal mid-refresh used to wipe it, and a technician's screen
   * would forget he was a technician. Returns whether an answer came.
   */
  const load = useCallback(async (s: Session | null): Promise<boolean> => {
    if (!supabase || !s) {
      setAccount(null);
      return true;
    }
    const { data, error } = await supabase.rpc('my_account');
    if (error) return false;
    setAccount((data as Account | null) ?? null);
    return true;
  }, []);

  /**
   * Who is this? From the phone's stored sign-in, refreshed if it has gone
   * stale. A refresh that could not reach Supabase leaves the sign-in on the
   * phone and comes back as "no session" with a retryable error — that is
   * trouble, not signing out.
   */
  const begin = useCallback(async () => {
    if (!supabase) return;
    // Supabase keeps retrying a stale sign-in for up to half a minute. If the
    // phone already knows it is offline, say so after a few seconds instead
    // of turning the screw that long; the answer still lands when it comes.
    // And whatever the phone says, nobody watches a turning screw for longer
    // than SAY_TROUBLE_AFTER: Pechkas being down looks the same from here.
    const say = (onlyIfOffline: boolean) =>
      whyNoAnswer().then((why) => {
        if (onlyIfOffline && why !== 'offline') return;
        setTrouble(why);
        setReady(true);
      });
    const slow = setTimeout(() => say(true), SAY_OFFLINE_AFTER);
    const slower = setTimeout(() => say(false), SAY_TROUBLE_AFTER);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!data.session && error && isAuthRetryableFetchError(error)) {
        setTrouble(await whyNoAnswer());
        setReady(true);
        return;
      }
      setSession(data.session);
      const answered = await load(data.session);
      setTrouble(answered ? null : await whyNoAnswer());
      setReady(true);
    } finally {
      clearTimeout(slow);
      clearTimeout(slower);
    }
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    begin();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Only signing out empties the phone. Supabase also reports "no
      // session" while a stale sign-in waits for a signal to refresh, and
      // taking that at its word sent signed-in people to the welcome screen.
      if (!s && event !== 'SIGNED_OUT') return;
      setSession(s);
      load(s).then((answered) => {
        if (answered) setTrouble(null);
      });
    });
    return () => sub.subscription.unsubscribe();
  }, [begin, load]);

  // Always the CURRENT session, read fresh. Using the one this screen last
  // saw meant that right after signing in it refreshed with the old, empty
  // one, forgot who you were, and sent a returning technician to "Why are
  // you here?" as if he were new.
  //
  // And it must be the SAME function every time. Screens call it when they
  // come into view, keyed on it; when it was rebuilt each time the account
  // arrived, every load started the next one and the technician's phone
  // asked the server for his account as fast as it could, forever.
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    // No signal is not signing out: keep who we had.
    if (!data.session && error && isAuthRetryableFetchError(error)) return;
    setSession(data.session);
    await load(data.session);
  }, [load]);

  const value = useMemo<State>(
    () => ({
      ready,
      connected: Boolean(supabase),
      session,
      account,
      trouble,
      retry: begin,
      refresh,
      signOut: async () => {
        // First, while the database still knows who is asking: otherwise
        // whoever picks this phone up next is told about this person's jobs.
        await forget();
        await supabase?.auth.signOut();
        setAccount(null);
      },
    }),
    [ready, session, account, trouble, begin, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
