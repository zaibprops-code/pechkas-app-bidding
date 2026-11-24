import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, pakistaniMobile } from '@pechkas/shared';
import { AuthButton, AuthNote, AuthScreen, authBox } from '../src/components/AuthScreen';
import { Icon } from '../src/components/Icon';
import { PhoneBox } from '../src/components/PhoneBox';
import { Notice } from '../src/components/ui';
import { sendEmailCode, sendPhoneCode, supabase, url } from '../src/supabase';
import { colour, font } from '../src/theme';

/**
 * Sign in with a mobile number — or an email — on the amber sign-in screen
 * (AuthScreen, the owner's design of 24 November 2026): one question, one
 * box with +92 fixed in front, one quiet line under it, and two full-size
 * buttons above the keyboard. **Continue** stays pale until the number is a
 * whole Pakistani mobile number (the box shows a green tick then), so a code
 * is never sent to half a number. A code is sent; nothing else is asked for,
 * and there is no password to forget.
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
  const [focused, setFocused] = useState(true);

  const ready = mode === 'phone' ? Boolean(pakistaniMobile(typed)) : EMAIL.test(email.trim().toLowerCase());

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
    const { error: e } = await sendPhoneCode(phone);
    setBusy(false);
    if (e) {
      // Supabase's own words go under the sentence, so a screenshot shows what is wrong.
      setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    router.push({ pathname: '/verify', params: { phone, next: next ?? '' } });
  }

  const phone = mode === 'phone';
  return (
    <AuthScreen
      title={phone ? 'What is your mobile number?' : 'What is your email?'}
      sub={phone ? 'We will text you a code to confirm it is you.' : 'We will email you a code. No password needed.'}
      back={router.canGoBack()}
      footer={
        <>
          <AuthButton
            label="Continue"
            arrow
            onPress={send}
            busy={busy}
            off={!ready}
            hint={phone ? 'Write your whole mobile number first.' : 'Write your whole email address first.'}
          />
          <AuthButton
            kind="second"
            icon={phone ? 'mail' : 'phone'}
            label={phone ? 'Use email instead' : 'Use mobile instead'}
            onPress={() => switchTo(phone ? 'email' : 'phone')}
          />
        </>
      }
    >
      {phone ? (
        <PhoneBox
          amber
          value={typed}
          onChangeText={(t) => {
            setTyped(t);
            if (error) setError(null);
          }}
          returnKeyType="send"
          onSubmitEditing={() => ready && send()}
          autoFocus
          error={error}
        />
      ) : (
        <View style={[s.email, authBox.box, error ? authBox.bad : focused ? authBox.focused : null]}>
          <Icon name="mail" size={20} color={colour.ink} strokeWidth={2} />
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel="Email address"
            placeholder="name@gmail.com"
            placeholderTextColor="#a59d88"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => ready && send()}
            underlineColorAndroid="transparent"
            style={s.emailInput}
          />
        </View>
      )}
      {error ? (
        <AuthNote icon="alert" tone="bad" text={error} />
      ) : phone ? (
        <AuthNote icon="lock" text="Only the technician you choose, and Pechkas, will see it." />
      ) : (
        <AuthNote icon="phone" text="We will ask for your mobile number next, so the technician you choose can call you." />
      )}
      <Notice text={notice} />
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  email: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingHorizontal: 16 },
  emailInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodySemi, fontSize: 19, color: colour.ink, outlineWidth: 0 },
});
