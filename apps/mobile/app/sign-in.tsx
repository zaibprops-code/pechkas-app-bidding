import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { pakistaniMobile } from '@pechkas/shared';
import { Mark } from '../src/components/Mark';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { supabase } from '../src/supabase';

/**
 * Sign in with a mobile number. A code is sent to it; nothing else is asked
 * for, and there is no password to forget.
 */
export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    setNotice(null);
    const phone = pakistaniMobile(typed);
    if (!phone) {
      setError('Write a Pakistani mobile number, like 0300 1234567.');
      return;
    }
    if (!supabase) {
      setNotice('The app is not connected to Pechkas yet. Please try again after the next update.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (e) {
      setNotice(/rate|too many/i.test(e.message) ? 'Too many codes asked for. Wait a few minutes and try again.' : 'The code could not be sent. Check your signal and try again.');
      return;
    }
    router.push({ pathname: '/verify', params: { phone, next: next ?? '' } });
  }

  return (
    <Screen footer={<Button label="Send me a code" onPress={send} busy={busy} />}>
      <Mark size={48} />
      <Title>Your mobile number</Title>
      <Body muted>We send a code to this number. No password, nothing to remember.</Body>
      <Field
        label="Mobile number"
        value={typed}
        onChangeText={setTyped}
        placeholder="0300 1234567"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        returnKeyType="send"
        onSubmitEditing={send}
        error={error}
        hint="We never show your number to anyone until you choose a technician."
      />
      <Notice text={notice} />
    </Screen>
  );
}
