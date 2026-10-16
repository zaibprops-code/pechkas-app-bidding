import { useState } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, pakistaniMobile } from '@pechkas/shared';
import { Mark } from '../src/components/Mark';
import { Press } from '../src/components/Press';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { PRIVACY_URL, TERMS_URL } from '../src/office';
import { supabase, url } from '../src/supabase';
import { colour, font } from '../src/theme';

/**
 * Sign in with a mobile number. A code is sent to it; nothing else is asked
 * for, and there is no password to forget.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  // A mobile number by default; an email code for anybody who prefers it,
  // or whose number cannot get an SMS yet.
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [typed, setTyped] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(m: 'phone' | 'email') {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function send() {
    setError(null);
    setNotice(null);
    if (!supabase) {
      setNotice('The app is not connected to Pechkas yet. Please try again after the next update.');
      return;
    }
    if (mode === 'email') {
      const address = email.trim().toLowerCase();
      if (!EMAIL.test(address)) {
        setError('Write your email address, like name@gmail.com.');
        return;
      }
      setBusy(true);
      const { error: e } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
      setBusy(false);
      if (e) {
        setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
        return;
      }
      router.push({ pathname: '/verify', params: { email: address, next: next ?? '' } });
      return;
    }
    const phone = pakistaniMobile(typed);
    if (!phone) {
      setError('Write a Pakistani mobile number, like 0300 1234567.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (e) {
      // Supabase's own words go under the sentence, so a screenshot shows what is wrong.
      setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    router.push({ pathname: '/verify', params: { phone, next: next ?? '' } });
  }

  return (
    <Screen footer={<Button label="Send me a code" onPress={send} busy={busy} />}>
      <Mark size={48} />
      {mode === 'phone' ? (
        <>
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
        </>
      ) : (
        <>
          <Title>Your email</Title>
          <Body muted>We email you a code. No password, nothing to remember. You will be asked for your mobile number next, so the technician you choose can ring you.</Body>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="name@gmail.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={send}
            error={error}
          />
        </>
      )}
      <Notice text={notice} />
      <Press onPress={() => switchTo(mode === 'phone' ? 'email' : 'phone')} accessibilityRole="button" style={s.switch}>
        <Text style={s.switchText}>{mode === 'phone' ? 'Use my email instead' : 'Use my mobile number instead'}</Text>
      </Press>
      <Button kind="outline" label="How Pechkas uses your number" onPress={() => Linking.openURL(PRIVACY_URL)} />
      <Button kind="outline" label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  switch: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  switchText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
