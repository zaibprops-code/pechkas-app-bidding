import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, pakistaniMobile } from '@pechkas/shared';
import { PhoneBox } from '../src/components/PhoneBox';
import { Press } from '../src/components/Press';
import { Button, Field, Notice, Screen } from '../src/components/ui';
import { sendEmailCode, supabase, url } from '../src/supabase';
import { colour, font } from '../src/theme';

/**
 * Sign in with a mobile number — or an email — laid out as inDrive's is:
 * one big box with the country already in it, and Next at the foot. A code
 * is sent; nothing else is asked for, and there is no password to forget.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { next, mode: asked } = useLocalSearchParams<{ next?: string; mode?: string }>();
  // A mobile number by default; an email code for anybody who prefers it,
  // or whose number cannot get an SMS yet.
  const [mode, setMode] = useState<'phone' | 'email'>(asked === 'email' ? 'email' : 'phone');
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
      const { error: e } = await sendEmailCode(address);
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
      setError('Write your mobile number after +92, like 300 1234567.');
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
    <Screen
      hero={{
        title: mode === 'phone' ? 'Join with your mobile number' : 'Join with your email',
        sub: mode === 'phone' ? 'We will text you a code to check your number.' : 'We will email you a code. No password needed.',
        back: router.canGoBack(),
      }}
      footer={<Button label="Next" onPress={send} busy={busy} />}
    >
      {mode === 'phone' ? (
        <PhoneBox
          value={typed}
          onChangeText={(t) => {
            setTyped(t);
            if (error) setError(null);
          }}
          returnKeyType="send"
          onSubmitEditing={send}
          autoFocus
          error={error}
          hint="Your number goes only to the person you end up working with, and to the Pechkas office."
        />
      ) : (
        <>
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
            hint="You will be asked for your mobile number next, so the technician you choose can call you."
          />
        </>
      )}
      <Notice text={notice} />
      <Press onPress={() => switchTo(mode === 'phone' ? 'email' : 'phone')} accessibilityRole="button" style={s.switch}>
        <Text style={s.switchText}>{mode === 'phone' ? 'Use my email instead' : 'Use my mobile number instead'}</Text>
      </Press>
    </Screen>
  );
}

const s = StyleSheet.create({
  switch: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  switchText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
