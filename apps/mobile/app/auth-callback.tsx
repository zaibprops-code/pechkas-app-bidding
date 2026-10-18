import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { explainLinkError, readSignInLink } from '@pechkas/shared';
import { Body, Button, Loading, Screen, Title } from '../src/components/ui';
import { useAccount, type Account } from '../src/account';
import { routeFor } from '../src/route';
import { supabase } from '../src/supabase';

/**
 * Where the link in a sign-in email lands: pechkas://auth-callback?code=…
 *
 * The code is traded for a session on this phone, which only works on the
 * phone that asked for the email (readSignInLink() says why). Then the same
 * routeFor() as after typing a code, so an email account is still asked for
 * its mobile number before anything else.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<Record<string, string>>();
  const opened = Linking.useURL();
  const { refresh } = useAccount();
  const [problem, setProblem] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    // The ?query arrives as params; an error Supabase put after the # is only in the full address.
    let link = readSignInLink(`pechkas://auth-callback?${new URLSearchParams(params).toString()}`);
    if (link.kind === 'none') link = readSignInLink(opened);
    if (link.kind === 'none') return; // the address may still be on its way
    tried.current = true;
    if (link.kind === 'error') return setProblem(link.why);
    if (!supabase) return setProblem('The app is not connected to Pechkas yet.');
    const code = link.code;
    (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return setProblem(explainLinkError(error.message));
      const { data } = await supabase.rpc('my_account');
      await refresh();
      routeFor((data as Account | null) ?? null);
    })();
  }, [params, opened, refresh]);

  // Nothing usable arrived at all: say so rather than spin for ever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!tried.current) setProblem('This link had no sign-in in it. Type the code from the email instead.');
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  if (!problem) {
    return (
      <Screen>
        <Title>Signing you in…</Title>
        <Loading />
      </Screen>
    );
  }
  return (
    <Screen footer={<Button label="Back to sign-in" onPress={() => router.replace('/sign-in')} />}>
      <Title>That link did not work</Title>
      <Body>{problem}</Body>
    </Screen>
  );
}
