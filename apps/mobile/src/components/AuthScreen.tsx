import type { ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { ScrewSpinner } from './ScrewSpinner';
import { SystemBars, useArrive } from './ui';
import { amber, colour, font, TAP } from '../theme';

/**
 * The sign-in screens (the owner's design, 24 November 2026): the number,
 * the code and "How will you use Pechkas?". They follow the yellow welcome
 * page, so they keep its colour: deep amber at the top, behind the question,
 * lightening to cream at the foot, where the phone's own light keyboard
 * meets it without a hard line.
 *
 * Calm on purpose: a back button and nothing else at the top (no logo — they
 * have just seen it), one question, the box, one quiet line under it, and the
 * buttons at the foot, above the keyboard. Every control is a full-size
 * button; nothing to aim at with a fingertip.
 */
export function AuthScreen({ title, sub, back = true, children, footer }: {
  title: string;
  sub?: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: amber.stops[2] }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <StatusBar style="dark" />
      {size.w > 0 ? <Amber width={size.w} height={size.h} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: footer ? 16 : insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={[s.top, { paddingTop: insets.top + 10 }]}>
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
          ) : (
            <View style={{ height: 44 }} />
          )}
        </View>
        <Animated.View style={{ paddingHorizontal: 20, transform: [{ translateY: rise }] }}>
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
          {sub ? <Text style={s.sub}>{sub}</Text> : null}
          <View style={{ marginTop: 24, gap: 12 }}>{children}</View>
        </Animated.View>
      </ScrollView>
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>{footer}</View> : null}
      <SystemBars bg={amber.stops[0]} bottom={false} />
    </KeyboardAvoidingView>
  );
}

/** The background: the amber run top to bottom, and a soft light in the top corner. */
function Amber({ width, height }: { width: number; height: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="auth-amber" x1="0" y1="0" x2="0" y2="1">
          {amber.stops.map((c, i) => (
            <Stop key={c} offset={amber.at[i]} stopColor={c} />
          ))}
        </LinearGradient>
        <RadialGradient id="auth-light" cx={width * 0.88} cy={0} r={Math.max(width * 0.75, 1)} fx={width * 0.88} fy={0} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={amber.light} stopOpacity={0.55} />
          <Stop offset={1} stopColor={amber.light} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#auth-amber)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#auth-light)" />
    </Svg>
  );
}

/**
 * The two kinds of button. `main` is black on the amber, as on the yellow
 * welcome page before it, and pale until it can do something; `second` is
 * the quieter white one, the same size, for the other way to go on. Colours
 * snap; only the press moves.
 */
export function AuthButton({ label, onPress, kind = 'main', icon, arrow = false, off = false, busy = false, hint }: {
  label: string;
  onPress?: () => void;
  kind?: 'main' | 'second';
  icon?: IconName;
  arrow?: boolean;
  /** Drawn pale and does nothing: not ready yet. */
  off?: boolean;
  busy?: boolean;
  /** Read out after the label while it is off, so a screen reader knows why. */
  hint?: string;
}) {
  const main = kind === 'main';
  const bg = main ? (off ? 'rgba(20,23,26,0.12)' : colour.ink) : off ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.72)';
  const fg = main ? (off ? 'rgba(20,23,26,0.45)' : colour.white) : off ? 'rgba(20,23,26,0.5)' : colour.ink;
  const inert = off || busy;
  return (
    <Press
      onPress={inert ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled: inert, busy }}
      style={[s.btn, { backgroundColor: bg }, main && !off && s.lifted]}
    >
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

/** One quiet line under a box: an icon and a sentence. */
export function AuthNote({ icon, text, tone = 'quiet' }: { icon: IconName; text: string; tone?: 'quiet' | 'good' | 'bad' }) {
  const c = tone === 'good' ? colour.green : tone === 'bad' ? colour.brick : amber.ink;
  return (
    <View style={s.note} accessibilityRole={tone === 'quiet' ? undefined : 'alert'}>
      {tone === 'good' ? (
        <View style={s.okDot}>
          <Icon name="check" size={13} color={colour.white} strokeWidth={3} />
        </View>
      ) : (
        <Icon name={icon} size={16} color={c} strokeWidth={2.2} />
      )}
      <Text style={[s.noteText, { color: c }, tone !== 'quiet' && { fontFamily: font.bodySemi }]}>{text}</Text>
    </View>
  );
}

/** The white box every sign-in field sits in. */
export const authBox = StyleSheet.create({
  box: {
    backgroundColor: colour.white,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    boxShadow: '0px 6px 18px rgba(120, 70, 0, 0.12)',
  },
  focused: { borderColor: colour.ink },
  bad: { borderColor: colour.brick },
  good: { borderColor: colour.green },
});

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: colour.ink, marginTop: 8 },
  sub: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: amber.ink, marginTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  btn: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  lifted: { boxShadow: '0px 10px 24px rgba(20, 23, 26, 0.25)' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnText: { fontFamily: font.display, fontSize: 17 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  okDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20 },
});
