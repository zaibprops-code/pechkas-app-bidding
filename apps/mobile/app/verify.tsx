import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, showMobile } from '@pechkas/shared';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { useAccount, type Account } from '../src/account';
import { routeFor } from '../src/route';
import { supabase, url } from '../src/supabase';

const WAIT = 30;

export default function Verify() {
  const { phone, next } = useLocalSearchParams<{ phone: string; next?: string }>();
  const { refresh } = useAccount();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(WAIT);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function check() {
    setError(null);
    setNotice(null);
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) {
      setError('The code is 6 numbers.');
      return;
    }
    if (!supabase || !phone) return;
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (e) {
      setBusy(false);
      if (/expired/i.test(e.message)) setError('That code has expired. Ask for a new one.');
      else if (/invalid|token|otp/i.test(e.message)) setError('That code is not right. Check it and try again.');
      // Anything else is not the code's fault: say what Supabase said.
      else setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    const { data } = await supabase.rpc('my_account');
    await refresh();
    setBusy(false);
    routeFor((data as Account | null) ?? null, next);
  }

  async function resend() {
    if (!supabase || !phone || left > 0) return;
    setNotice(null);
    const { error: e } = await supabase.auth.signInWithOtp({ phone });
    if (e) setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
    else setLeft(WAIT);
  }

  return (
    <Screen footer={<Button label="Continue" onPress={check} busy={busy} />}>
      <Title>Enter the code</Title>
      <Body muted>We sent a 6-number code to {phone ? showMobile(phone) : 'your phone'}.</Body>
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        onSubmitEditing={check}
        error={error}
        style={{ fontSize: 26, letterSpacing: 8 }}
      />
      <Notice text={notice} />
      <Button
        kind="outline"
        label={left > 0 ? `Send a new code in ${left}s` : 'Send a new code'}
        onPress={resend}
        disabled={left > 0}
      />
    </Screen>
  );
}
