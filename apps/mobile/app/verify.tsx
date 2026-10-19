import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { authErrorDetails, explainAuthError, showMobile } from '@pechkas/shared';
import { Press } from '../src/components/Press';
import { Button, Notice, Screen } from '../src/components/ui';
import { colour, font } from '../src/theme';
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
    <Screen
      hero={{
        title: 'Enter the code',
        sub: email ? `Sent to ${email}` : `Sent to ${phone ? showMobile(phone) : 'your phone'}`,
        back: true,
      }}
      footer={<Button label="Continue" onPress={check} busy={busy} />}
    >
      <CodeBoxes value={code} onChange={setCode} longest={longest} email={Boolean(email)} error={error} onSubmit={check} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {email ? <Text style={s.hint}>Or, on this phone, tap the link in the email. Not in your inbox? Look in spam.</Text> : null}
      <Notice text={notice} />
      <Press onPress={left > 0 ? undefined : resend} accessibilityRole="button" accessibilityState={{ disabled: left > 0 }} style={s.resend}>
        <Text style={[s.resendText, left > 0 && { color: colour.steel, textDecorationLine: 'none' }]}>
          {left > 0 ? `Send a new code in ${left}s` : 'Send a new code'}
        </Text>
      </Press>
    </Screen>
  );
}

/**
 * One box per digit, like every banking app. A single real text box sits on
 * top of them, invisible, so the keyboard, paste and the phone's own "fill
 * in the code from the SMS" all work as normal. A text message's code is
 * always 6 digits, so it carries on by itself once the sixth is in.
 */
function CodeBoxes({ value, onChange, longest, email, error, onSubmit }: {
  value: string;
  onChange: (v: string) => void;
  longest: number;
  email: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  const { width } = useWindowDimensions();
  const digits = value.replace(/\D/g, '').slice(0, longest);
  const boxes = Math.min(longest, Math.max(6, digits.length + (email && digits.length >= 6 && digits.length < longest ? 1 : 0)));
  useEffect(() => {
    if (!email && digits.length === 6) onSubmit();
    // Only when the sixth digit arrives, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits.length]);
  // Each box gets a real size in points. They used to share the row with
  // `flex: 1`, which worked in a browser and on Android collapsed every box to
  // its own border — six thin lines and nowhere to see a digit. The screen
  // has 20 points of margin each side; a box is never wider than 56. An email
  // code can run to 10 digits, so the gaps tighten past 7 boxes, and ten still
  // fit across a 320-point phone.
  const gap = boxes > 7 ? 5 : 8;
  const size = Math.max(22, Math.min(56, Math.floor((width - 40 - gap * (boxes - 1)) / boxes)));
  return (
    <Press onPress={() => input.current?.focus()} sink={1} accessible={false} style={[s.boxes, { gap }]}>
      {Array.from({ length: boxes }, (_, i) => {
        const here = focused && i === Math.min(digits.length, boxes - 1);
        return (
          <View key={i} style={[s.box, { width: size, height: Math.round(size * 1.12), borderRadius: Math.round(size * 0.25) }, digits[i] ? s.boxFull : null, here ? s.boxHere : null, error ? s.boxError : null]}>
            <Text style={[s.digit, { fontSize: Math.round(size * 0.5) }]}>{digits[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={digits}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, longest))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        accessibilityLabel="Code"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={email ? 'one-time-code' : 'sms-otp'}
        maxLength={longest}
        autoFocus
        caretHidden
        style={s.hidden}
      />
    </Press>
  );
}

const s = StyleSheet.create({
  boxes: { flexDirection: 'row', position: 'relative', alignSelf: 'stretch' },
  box: { borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(20,23,26,0.16)', backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  boxFull: { borderColor: colour.ink },
  boxHere: { borderColor: colour.green, borderWidth: 2.5 },
  boxError: { borderColor: colour.brick, borderWidth: 2 },
  digit: { fontFamily: font.display, fontSize: 28, color: colour.ink },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', backgroundColor: 'transparent', fontSize: 1, borderWidth: 0, outlineWidth: 0 },
  error: { fontFamily: font.bodySemi, fontSize: 14, color: colour.brick, marginTop: -6 },
  hint: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel },
  resend: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  resendText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
