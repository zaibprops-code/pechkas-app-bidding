import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authErrorDetails, CODE_DIGITS, explainAuthError, readCode, showMobile } from '@pechkas/shared';
import { AuthButton, AuthNote, AuthScreen, authBox } from '../src/components/AuthScreen';
import { Press } from '../src/components/Press';
import { Notice } from '../src/components/ui';
import { colour, font } from '../src/theme';
import { useAccount, type Account } from '../src/account';
import { routeFor } from '../src/route';
import { sendEmailCode, sendPhoneCode, supabase, url } from '../src/supabase';

/**
 * How long before a new code may be asked for. Supabase refuses a second
 * email to the same address inside 60 seconds by default, so a shorter wait
 * here only offered a button that then failed. If Supabase names a longer
 * wait, the screen takes its number instead (see `waitFrom`).
 */
const WAIT = 60;

/**
 * How long the boxes stay green, saying "Verified", before the app moves on:
 * long enough to be seen, short enough that nobody waits for it. There is no
 * separate "signed in" screen (the owner's choice): the code itself confirms.
 */
const SHOW_VERIFIED_MS = 700;

/** 42 → "0:42", as a clock reads. */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** "...you can only request this after 42 seconds." → 42. */
function waitFrom(message: string): number | null {
  const m = /after (\d+) seconds?/i.exec(message);
  return m ? Number(m[1]) : null;
}

export default function Verify() {
  const { phone, email, next, change } = useLocalSearchParams<{ phone?: string; email?: string; next?: string; change?: string }>();
  // `change`: a signed-in account adding a number to check by SMS (D37), not a sign-in.
  const changing = change === '1' && Boolean(phone);
  const { refresh } = useAccount();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Good news — a new code was sent — is not a warning, so it is not red.
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  // Counts wrong codes, so the boxes shake for each one — even the same sentence twice.
  const [fails, setFails] = useState(0);
  const wrong = (m: string) => {
    setError(m);
    setFails((n) => n + 1);
  };
  // The countdown is worked out from the clock, not counted down a second at
  // a time. Counting stalled whenever the phone paused the app — which is
  // exactly what happens while somebody goes to their email to read the
  // code — and it came back showing the number it had left behind.
  const [until, setUntil] = useState(() => Date.now() + WAIT * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [left]);

  // Coming back from Gmail or Messages: catch up at once, not on the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const startWait = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  };

  // Set while a code is being checked, so the sixth digit and a tap on
  // Continue arriving together send it once, not twice.
  const checking = useRef(false);

  const tooLong = (extra: number) =>
    `That is ${extra} numbers, but a Pechkas code is always ${CODE_DIGITS}. Copy only the code. ` +
    `If the ${email ? 'email' : 'message'} really shows ${extra}, please tell Pechkas.`;
  // How many digits the last paste really had, while it was too many.
  const [extra, setExtra] = useState<number | null>(null);

  /**
   * Every change to the boxes comes through here. The sixth digit sends the
   * code by itself, for email and text message alike. More than six digits is
   * never sent: it is not a Pechkas code, and cutting it short would only be
   * called wrong by Supabase.
   */
  function typed(text: string) {
    const read = readCode(text);
    setCode(read.digits);
    setExtra(read.extra);
    if (read.extra) {
      setError(tooLong(read.extra));
      return;
    }
    setError(null);
    const digits = read.digits;
    // Sent when the sixth digit arrives — or when six replace a code that was too long.
    if (digits.length === CODE_DIGITS && (code.length < CODE_DIGITS || extra)) check(digits);
  }

  /** `token` comes from typing; without it, this is the Continue button. */
  async function check(token?: string) {
    if (checking.current) return;
    if (token === undefined && extra) {
      // The boxes hold the first six of a longer code: not a code to send.
      setError(tooLong(extra));
      return;
    }
    token ??= code;
    setError(null);
    setNotice(null);
    setSent(null);
    if (token.length !== CODE_DIGITS) {
      setError(`The code is ${CODE_DIGITS} numbers.`);
      return;
    }
    if (!supabase || (!phone && !email)) return;
    checking.current = true;
    setBusy(true);
    const { error: e } = email
      ? await supabase.auth.verifyOtp({ email, token, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone!, token, type: changing ? 'phone_change' : 'sms' });
    checking.current = false;
    if (e) {
      setBusy(false);
      // Supabase says "Token has expired or is invalid" for both, so this one
      // cannot tell which it was and does not pretend to.
      if (/expired or is invalid/i.test(e.message)) wrong('That code is not right, or it has expired. Check it, or ask for a new one.');
      else if (/expired/i.test(e.message)) wrong('That code has expired. Ask for a new one.');
      else if (/invalid|token|otp/i.test(e.message)) wrong('That code is not right. Check it and try again.');
      // Anything else is not the code's fault: say what Supabase said.
      else setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    // Right: the boxes turn green and say so, then the app moves on by itself.
    setBusy(false);
    setVerified(true);
    const shown = new Promise((r) => setTimeout(r, SHOW_VERIFIED_MS));
    if (changing) {
      await Promise.all([refresh(), shown]);
      router.replace('/pro/first-jobs');
      return;
    }
    const [{ data }] = await Promise.all([supabase.rpc('my_account'), refresh(), shown]);
    routeFor((data as Account | null) ?? null, next);
  }

  async function resend() {
    if (!supabase || (!phone && !email) || left > 0) return;
    setNotice(null);
    setSent(null);
    const { error: e } = email
      ? await sendEmailCode(email)
      : changing
        ? await supabase.auth.updateUser({ phone: phone! })
        : await sendPhoneCode(phone!);
    if (e) {
      // Too soon for Supabase: wait as long as it says, and say so plainly.
      const wait = waitFrom(e.message);
      if (wait) {
        startWait(wait);
        setNotice(`Pechkas can send another code in ${wait} seconds.`);
      } else setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    startWait(WAIT);
    setCode('');
    setExtra(null);
    setError(null);
    setSent(
      email
        ? `A new code is on its way to ${email}. Use the newest one: the earlier code stops working.`
        : `A new code is on its way to ${phone ? showMobile(phone) : 'your phone'}. Use the newest one: the earlier code stops working.`,
    );
  }

  const where = email ?? (phone ? showMobile(phone) : 'your phone');
  return (
    <AuthScreen
      art="code"
      artOpen={verified}
      title={`Enter the ${CODE_DIGITS}-digit code`}
      sub={
        // Where the code went, and the way back to change it: a real button, 44 points tall.
        <View style={s.sentTo}>
          <Text style={s.sentToText}>
            {email ? 'Sent by email to ' : 'Sent by SMS to '}
            <Text style={s.where}>{where}</Text>
          </Text>
          <Press onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={email ? 'Change the email address' : 'Change the number'} sink={0.94} style={s.change}>
            <Text style={s.changeText}>Change</Text>
          </Press>
        </View>
      }
      footer={
        verified ? null : (
          <>
            {code.length === CODE_DIGITS && !error ? <AuthButton label="Check the code" arrow onPress={() => check()} busy={busy} /> : null}
            <AuthButton
              kind="link"
              icon="refresh"
              label={left > 0 ? `Send a new code in ${clock(left)}` : 'Send a new code'}
              off={left > 0}
              onPress={resend}
            />
          </>
        )
      }
    >
      <CodeBoxes value={code} onChange={typed} email={Boolean(email)} error={error} fails={fails} verified={verified} onSubmit={() => check()} />
      {verified ? (
        <AuthNote icon="check" tone="good" text="Verified. Signing you in…" />
      ) : error ? (
        <AuthNote icon="alert" tone="bad" text={error} />
      ) : (
        <AuthNote icon="shield" text="Never share this code with anyone." />
      )}
      {email && !verified ? <AuthNote icon="mail" text="Or, on this phone, tap the link in the email. Not in your inbox? Look in spam." /> : null}
      <Notice text={notice} />
      {sent ? (
        <View style={s.sent} accessibilityRole="alert">
          <Text style={s.sentText}>{sent}</Text>
        </View>
      ) : null}
    </AuthScreen>
  );
}

/**
 * One box per digit, like every banking app, and always CODE_DIGITS of them:
 * the row is drawn once and never changes shape while somebody types. A
 * single real text box sits on top, invisible, so the keyboard, paste and the
 * phone's own "fill in the code" all work as normal.
 *
 * The hidden box takes a few more digits than the row shows, on purpose. If
 * it stopped at six, a longer code pasted in would be cut short without a
 * word; this way `readCode()` sees how many arrived and the screen says so.
 */
function CodeBoxes({ value, onChange, email, error, fails, verified, onSubmit }: {
  value: string;
  onChange: (text: string) => void;
  email: boolean;
  error: string | null;
  /** Wrong codes so far: each new one shakes the row. */
  fails: number;
  verified: boolean;
  onSubmit: () => void;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  // A wrong code shakes the row, the way a phone shakes at a wrong PIN: understood without reading.
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!fails) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive || still) return;
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
    return () => {
      alive = false;
    };
  }, [fails, shake]);
  const shift = shake.interpolate({ inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1], outputRange: [0, -10, 9, -7, 5, -3, 0] });
  const { width } = useWindowDimensions();
  const digits = value.slice(0, CODE_DIGITS);
  // Each box gets a real size in points. They used to share the row with
  // `flex: 1`, which worked in a browser and on Android collapsed every box to
  // its own border. The screen has 20 points of margin each side and a box is
  // never wider than 56, so six fit from a 320-point phone upwards.
  const gap = 9;
  const size = Math.max(32, Math.min(56, Math.floor((width - 40 - gap * (CODE_DIGITS - 1)) / CODE_DIGITS)));
  return (
    <Animated.View style={{ transform: [{ translateX: shift }] }}>
    <Press onPress={() => input.current?.focus()} sink={1} accessible={false} style={[s.boxes, { gap }]}>
      {Array.from({ length: CODE_DIGITS }, (_, i) => {
        const here = focused && !verified && i === Math.min(digits.length, CODE_DIGITS - 1);
        return (
          <View
            key={i}
            style={[
              s.box,
              authBox.box,
              { width: size, height: Math.round(size * 1.12), borderRadius: Math.round(size * 0.27) },
              verified ? authBox.good : error ? authBox.bad : here ? authBox.focused : digits[i] ? authBox.filled : null,
            ]}
          >
            <Text style={[s.digit, { fontSize: Math.round(size * 0.5) }, verified && { color: colour.green }]}>{digits[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={digits}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        accessibilityLabel={`Code, ${CODE_DIGITS} numbers`}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={email ? 'one-time-code' : 'sms-otp'}
        maxLength={CODE_DIGITS + 6}
        autoFocus
        editable={!verified}
        caretHidden
        // Android draws a line under every text box unless told not to: it
        // showed as a small dash beside the first box.
        underlineColorAndroid="transparent"
        selectionColor="transparent"
        style={s.hidden}
      />
    </Press>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  sentTo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, marginVertical: -6 },
  sentToText: { flexShrink: 1, fontFamily: font.body, fontSize: 15.5, lineHeight: 22, color: colour.steel },
  where: { fontFamily: font.display, color: colour.ink, fontVariant: ['tabular-nums'] },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  changeText: { fontFamily: font.display, fontSize: 15.5, color: colour.ink, textDecorationLine: 'underline' },
  boxes: { flexDirection: 'row', position: 'relative', alignSelf: 'stretch' },
  box: { alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: font.display, fontSize: 28, color: colour.ink, fontVariant: ['tabular-nums'] },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', backgroundColor: 'transparent', fontSize: 1, borderWidth: 0, outlineWidth: 0 },
  sent: { padding: 14, borderRadius: 14, backgroundColor: colour.greenSoft },
  sentText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.greenDark },
});
