import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, showMobile } from '@pechkas/shared';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { useAccount, type Account } from '../src/account';
import { routeFor } from '../src/route';
import { sendEmailCode, supabase, url } from '../src/supabase';

const WAIT = 30;

export default function Verify() {
  const { phone, email, next } = useLocalSearchParams<{ phone?: string; email?: string; next?: string }>();
  // Supabase's email codes are 6 digits unless changed in its settings; up to 10 is allowed there.
  const longest = email ? 10 : 6;
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
    if (email ? token.length < 6 || token.length > longest : token.length !== 6) {
      setError(email ? 'Type the numbers from the email.' : 'The code is 6 numbers.');
      return;
    }
    if (!supabase || (!phone && !email)) return;
    setBusy(true);
    const { error: e } = email
      ? await supabase.auth.verifyOtp({ email, token, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone!, token, type: 'sms' });
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
    if (!supabase || (!phone && !email) || left > 0) return;
    setNotice(null);
    const { error: e } = email ? await sendEmailCode(email) : await supabase.auth.signInWithOtp({ phone: phone! });
    if (e) setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
    else setLeft(WAIT);
  }

  return (
    <Screen footer={<Button label="Continue" onPress={check} busy={busy} />}>
      <Title>Enter the code</Title>
      <Body muted>
        {email ? `We emailed a code to ${email}. Type it here — or, on this phone, tap the link in the email. If it is not in your inbox, look in spam.` : `We sent a 6-number code to ${phone ? showMobile(phone) : 'your phone'}.`}
      </Body>
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={email ? 'one-time-code' : 'sms-otp'}
        maxLength={longest}
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
