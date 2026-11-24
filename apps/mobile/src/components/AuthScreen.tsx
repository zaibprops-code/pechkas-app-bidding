import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { ScrewSpinner } from './ScrewSpinner';
import { Pop, SignInArt, type ArtKind } from './SignInArt';
import { SystemBars, useArrive } from './ui';
import { colour, font, glow, GLOW_STOPS, TAP } from '../theme';

/**
 * The sign-in screens (the owner's choice, design "C", 24 November 2026):
 * the number, the email, the code, "customer or technician" and the name.
 * A white page; at the top a yellow picture card whose drawing says what is
 * happening (SignInArt), with the back button inside it; then one question,
 * one box, one quiet line, and the buttons at the foot, above the keyboard.
 * The white page meets the phone's own light keyboard without a line.
 *
 * Calm on purpose: no logo (they have just seen it on the welcome pages),
 * nothing that moves after the first second, and every control full size —
 * the one link-style button is 46 points tall.
 */
export function AuthScreen({ art, artOpen, artHop, title, sub, back = true, children, footer }: {
  art: ArtKind;
  /** Passed to the drawing: the padlock opens. */
  artOpen?: boolean;
  /** Passed to the drawing: the side just picked hops. */
  artHop?: { side: 'customer' | 'pro'; n: number } | null;
  title: string;
  sub?: ReactNode;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const scroll = useRef<ScrollView>(null);
  // A short phone keeps the picture smaller, so the box still shows above the keyboard.
  const cardH = height < 700 ? 128 : height < 760 ? 160 : 196;
  const cardW = width - 28;
  const artH = Math.floor(Math.min(cardH - 36, ((cardW - 100) * 150) / 220));
  const [card, setCard] = useState({ w: 0, h: 0 });

  // With the keyboard up on a small phone, the box is what must be seen, not the picture.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: footer ? 16 : insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { height: cardH }]} onLayout={(e) => setCard({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {card.w > 0 ? <CardGlow width={card.w} height={card.h} /> : null}
          <View style={s.art}>
            <SignInArt kind={art} height={artH} open={artOpen} hop={artHop} />
          </View>
          {back ? (
            <Press
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/start'))}
              accessibilityRole="button"
              accessibilityLabel="Back"
              sink={0.9}
              style={s.back}
            >
              <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
            </Press>
          ) : null}
        </View>
        <Animated.View style={{ paddingHorizontal: 24, paddingTop: 22, transform: [{ translateY: rise }] }}>
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
          {typeof sub === 'string' ? <Text style={s.sub}>{sub}</Text> : sub ? <View style={{ marginTop: 4 }}>{sub}</View> : null}
        </Animated.View>
        <Animated.View style={{ paddingHorizontal: 20, marginTop: 18, gap: 12, transform: [{ translateY: rise }] }}>{children}</Animated.View>
      </ScrollView>
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
      <SystemBars bg={colour.white} bottom={false} />
    </KeyboardAvoidingView>
  );
}

/** The picture card's yellow: lit in the middle, behind the drawing, deeper at the edges. */
function CardGlow({ width, height }: { width: number; height: number }) {
  const cx = width / 2;
  const cy = height * 0.4;
  const r = Math.max(height, 1);
  const sx = (width * 0.9) / r;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="auth-card" cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(${sx} 1) translate(${-cx} ${-cy})`}>
          {GLOW_STOPS.map((o, i) => (
            <Stop key={o} offset={o} stopColor={glow.yellow[i]} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#auth-card)" />
    </Svg>
  );
}

/**
 * The two kinds of button. `main` is black, and pale until it can do
 * something; `link` is the other way to go on — underlined words with an
 * icon, 46 points tall, grey and without the line while it cannot be pressed.
 * Colours snap; only the press moves.
 */
export function AuthButton({ label, onPress, kind = 'main', icon, arrow = false, off = false, busy = false, hint }: {
  label: string;
  onPress?: () => void;
  kind?: 'main' | 'link';
  icon?: IconName;
  arrow?: boolean;
  /** Drawn pale and does nothing: not ready yet. */
  off?: boolean;
  busy?: boolean;
  /** Read out after the label while it is off, so a screen reader knows why. */
  hint?: string;
}) {
  const inert = off || busy;
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: hint && off ? `${label}. ${hint}` : label, accessibilityState: { disabled: inert, busy } };
  if (kind === 'link') {
    const fg = off ? colour.steel : colour.ink;
    return (
      <Press onPress={inert ? undefined : onPress} {...a11y} sink={0.96} style={s.link}>
        {icon ? <Icon name={icon} size={18} color={fg} strokeWidth={2.2} /> : null}
        <Text style={[s.linkText, { color: fg }, !off && s.underline]}>{label}</Text>
      </Press>
    );
  }
  const bg = off ? colour.tile : colour.ink;
  const fg = off ? colour.steel : colour.white;
  return (
    <Press onPress={inert ? undefined : onPress} {...a11y} style={[s.btn, { backgroundColor: bg }]}>
      {busy ? (
        <ScrewSpinner size={22} colour={fg} label={`${label}, sending`} />
      ) : (
        <View style={s.btnRow}>
          {icon ? <Icon name={icon} size={19} color={fg} strokeWidth={2.2} /> : null}
          <Text style={[s.btnText, { color: fg }]}>{label}</Text>
          {arrow ? <Icon name="arrowRight" size={19} color={fg} strokeWidth={2.2} /> : null}
        </View>
      )}
    </Press>
  );
}

/** One quiet line under a box: an icon and a sentence. "Good" pops its green tick in. */
export function AuthNote({ icon, text, tone = 'quiet' }: { icon: IconName; text: string; tone?: 'quiet' | 'good' | 'bad' }) {
  const c = tone === 'good' ? colour.green : tone === 'bad' ? colour.brick : colour.steel;
  return (
    <View style={s.note} accessibilityRole={tone === 'quiet' ? undefined : 'alert'}>
      {tone === 'good' ? (
        <Pop style={s.okDot}>
          <Icon name="check" size={13} color={colour.white} strokeWidth={3} />
        </Pop>
      ) : (
        <Icon name={icon} size={17} color={c} strokeWidth={2.2} />
      )}
      <Text style={[s.noteText, { color: c }, tone !== 'quiet' && { fontFamily: font.bodySemi }]}>{text}</Text>
    </View>
  );
}

/** The box every sign-in field sits in: soft grey at rest, white with an ink line while typing. */
export const authBox = StyleSheet.create({
  box: { backgroundColor: colour.canvas, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  focused: { backgroundColor: colour.white, borderColor: colour.ink },
  /** A box with something in it that is not being typed into. */
  filled: { backgroundColor: colour.white, borderColor: 'rgba(20,23,26,0.22)' },
  bad: { backgroundColor: colour.white, borderColor: colour.brick },
  good: { backgroundColor: colour.greenSoft, borderColor: colour.green },
});

/** A text box on the sign-in screens: an icon in front, big type. Email and the first name. */
export function AuthField({ icon, error, ...input }: TextInputProps & { icon: IconName; error?: boolean }) {
  const [focused, setFocused] = useState(Boolean(input.autoFocus));
  return (
    <View style={[s.field, authBox.box, error ? authBox.bad : focused ? authBox.focused : input.value ? authBox.filled : null]}>
      <Icon name={icon} size={20} color={colour.steel} strokeWidth={2} />
      <TextInput
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        placeholderTextColor={colour.steel}
        underlineColorAndroid="transparent"
        style={s.fieldInput}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colour.white },
  card: { marginHorizontal: 14, borderRadius: 28, overflow: 'hidden', backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  art: { paddingTop: 8 },
  back: { position: 'absolute', left: 12, top: 12, width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 15.5, lineHeight: 22, color: colour.steel, marginTop: 7 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 2, backgroundColor: colour.white },
  btn: { minHeight: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnText: { fontFamily: font.display, fontSize: 17 },
  link: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  linkText: { fontFamily: font.display, fontSize: 15.5 },
  underline: { textDecorationLine: 'underline' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
  okDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14.5, lineHeight: 20 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingHorizontal: 16 },
  fieldInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodySemi, fontSize: 20, color: colour.ink, outlineWidth: 0 },
});
