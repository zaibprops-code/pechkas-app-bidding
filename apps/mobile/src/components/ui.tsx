import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScrewSpinner } from './ScrewSpinner';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { colour, font, radius, TAP } from '../theme';

/**
 * The few building blocks every screen uses, so a button on the sign-in
 * screen and a button on the technician's form are the same button.
 *
 * `dark` is the technician side: ink background, paper text. The customer
 * side is light. Nothing here eases a colour; selected chips and buttons
 * snap, and only `Press` moves (by transform).
 */

type Tone = { dark?: boolean };

/**
 * A value that springs from 0 to 1 when a screen opens — or starts at 1 when
 * the phone asks for less motion. Drive transforms with it, never opacity or
 * colour: words are always drawn at full contrast, they only slide.
 */
export function useArrive(delay = 0): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive) return;
        if (still) return v.setValue(1);
        Animated.spring(v, { toValue: 1, delay, friction: 9, tension: 60, useNativeDriver: true }).start();
      });
    return () => {
      alive = false;
    };
  }, [v, delay]);
  return v;
}

/**
 * The top of a screen, as inDrive does it: a round button, then a big bold
 * title on the screen's own background, with nothing boxed around it.
 */
export type HeroProps = {
  title: string;
  sub?: string;
  /** Show a back button; a function decides where it goes, otherwise it goes back. */
  back?: boolean | (() => void);
  /** Something small on the right, such as an avatar. */
  right?: ReactNode;
  /** In place of the back button: the ☰ menu, on the screens the menu opens. */
  left?: ReactNode;
  /** Anything that belongs under the title. */
  children?: ReactNode;
  /** The technician's side: light words on ink. */
  dark?: boolean;
};

export function Hero({ title, sub, back, right, left, children, dark = false }: HeroProps) {
  const insets = useSafeAreaInsets();
  const goBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={[s.hero, { paddingTop: insets.top + 12 }]}>
      {back || right || left ? (
        <View style={s.heroTop}>
          {left ?? null}
          {left ? null : back ? (
            <Press onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={[s.heroBack, dark && s.heroBackDark]}>
              <Icon name="arrowLeft" size={22} color={dark ? colour.paper : colour.ink} strokeWidth={2.2} />
            </Press>
          ) : (
            <View />
          )}
          {right ?? null}
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[s.heroTitle, dark && { color: colour.paper }]}>
        {title}
      </Text>
      {sub ? <Text style={[s.heroSub, dark && { color: '#b9c2c9' }]}>{sub}</Text> : null}
      {children}
    </View>
  );
}

export function Screen({ children, dark = false, footer, hero }: { children: ReactNode; footer?: ReactNode; hero?: HeroProps } & Tone) {
  const insets = useSafeAreaInsets();
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: dark ? colour.ink : colour.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {hero ? <Hero dark={dark} {...hero} /> : null}
        <Animated.View style={{ paddingTop: hero ? 8 : insets.top + 16, paddingHorizontal: 20, gap: 16, transform: [{ translateY: rise }] }}>{children}</Animated.View>
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Title({ children, dark = false }: { children: ReactNode } & Tone) {
  return (
    <Text accessibilityRole="header" style={[s.title, { color: dark ? colour.paper : colour.ink }]}>
      {children}
    </Text>
  );
}

export function Body({ children, dark = false, muted = false }: { children: ReactNode; muted?: boolean } & Tone) {
  const c = dark ? (muted ? '#b9c2c9' : colour.paper) : muted ? colour.steel : colour.inkSoft;
  return <Text style={[s.body, { color: c }]}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** `ink` and `soft` are the welcome screen's pair, as inDrive's: one black, one light grey. */
  kind?: 'yellow' | 'green' | 'danger' | 'outline' | 'ink' | 'soft';
  busy?: boolean;
  disabled?: boolean;
  /** A small line icon before the words. */
  icon?: IconName;
} & Tone;

export function Button({ label, onPress, kind = 'yellow', busy = false, disabled = false, dark = false, icon }: ButtonProps) {
  const bg = { yellow: colour.yellow, green: colour.green, danger: colour.brick, ink: colour.ink, soft: colour.tile, outline: 'transparent' }[kind];
  const fg = kind === 'yellow' || kind === 'soft' ? colour.ink : kind === 'outline' && !dark ? colour.ink : colour.paper;
  const border = kind === 'outline' ? (dark ? 'rgba(250,246,239,0.35)' : 'rgba(20,23,26,0.2)') : 'transparent';
  const off = disabled || busy;
  return (
    <Press
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={[s.button, kind !== 'outline' && kind !== 'soft' && !off && s.lifted, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }]}
    >
      {busy ? (
        <ScrewSpinner size={22} colour={fg} label={`${label}, sending`} />
      ) : (
        <View style={s.buttonRow}>
          {icon && icon !== 'arrowRight' ? <Icon name={icon} size={19} color={fg} strokeWidth={2.2} /> : null}
          <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
          {/* An arrow says "onwards", so it comes after the words. */}
          {icon === 'arrowRight' ? <Icon name={icon} size={19} color={fg} strokeWidth={2.2} /> : null}
        </View>
      )}
    </Press>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
} & Tone;

export function Field({ label, hint, error, dark = false, style, onFocus, onBlur, ...input }: FieldProps) {
  const fg = dark ? colour.paper : colour.ink;
  // The box you are typing in is outlined in green. It snaps; nothing eases.
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: fg }]}>{label}</Text>
      <TextInput
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        accessibilityLabel={label}
        placeholderTextColor={dark ? '#8f9aa3' : '#7a838a'}
        style={[
          s.input,
          {
            color: colour.ink,
            backgroundColor: colour.white,
            borderColor: error ? colour.brick : focused ? (dark ? colour.yellow : colour.green) : 'rgba(20,23,26,0.16)',
            borderWidth: error || focused ? 2 : 1,
          },
          style,
        ]}
      />
      {error ? <Text style={[s.error, { color: dark ? '#ffb4a3' : colour.brick }]}>{error}</Text> : hint ? <Text style={[s.hint, { color: dark ? '#b9c2c9' : colour.steel }]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, on, onPress, dark = false }: { label: string; on: boolean; onPress: () => void } & Tone) {
  const bg = on ? (dark ? colour.yellow : colour.green) : 'transparent';
  const fg = on ? (dark ? colour.ink : colour.paper) : dark ? colour.paper : colour.ink;
  const border = on ? bg : dark ? 'rgba(250,246,239,0.3)' : 'rgba(20,23,26,0.2)';
  return (
    <Press
      onPress={onPress}
      sink={0.94}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[s.chip, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </Press>
  );
}

/** A sentence from the database that is not about any one box. */
export function Notice({ text, dark = false }: { text?: string | null } & Tone) {
  if (!text) return null;
  return (
    <View style={[s.notice, { backgroundColor: dark ? '#3a2019' : '#f6e3dc' }]} accessibilityRole="alert">
      <Text style={[s.noticeText, { color: dark ? '#ffb4a3' : colour.brick }]}>{text}</Text>
    </View>
  );
}

/**
 * "Turn notifications on": one sentence of why, and one button. Shown only
 * where being told actually matters, and gone once the answer is yes.
 */
export function NotifyCard({ title, text, action, onPress, dark = false }: { title: string; text: string; action: string; onPress: () => void } & Tone) {
  return (
    <View style={[s.notify, { backgroundColor: dark ? '#22282d' : colour.greenSoft }]}>
      <Text style={[s.notifyTitle, { color: dark ? colour.yellow : colour.greenDark }]}>{title}</Text>
      <Text style={[s.body, { color: dark ? colour.paper : colour.inkSoft }]}>{text}</Text>
      <Button kind={dark ? 'yellow' : 'green'} dark={dark} label={action} onPress={onPress} />
    </View>
  );
}

/** A person's first letter in a circle: an avatar with no photograph, as the app never shows one. */
export function Avatar({ name, size = 56, dark = false }: { name?: string | null; size?: number } & Tone) {
  const letter = (name ?? '').trim().charAt(0).toUpperCase() || 'P';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? colour.yellow : colour.green, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.display, fontSize: size * 0.42, color: dark ? colour.ink : colour.yellow }}>{letter}</Text>
    </View>
  );
}

/** A card of settings-style rows, like every phone's own settings. */
export function ListGroup({ children, title, dark = false }: { children: ReactNode; title?: string } & Tone) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={[s.groupTitle, { color: dark ? '#b9c2c9' : colour.steel }]}>{title}</Text> : null}
      <View style={[s.group, dark ? s.groupDark : null]}>{children}</View>
    </View>
  );
}

type RowProps = {
  icon: IconName;
  label: string;
  /** A short value on the right, such as a number. */
  value?: string;
  onPress?: () => void;
  /** Red, for the one row that cannot be undone. */
  danger?: boolean;
  last?: boolean;
} & Tone;

export function ListRow({ icon, label, value, onPress, danger = false, last = false, dark = false }: RowProps) {
  const fg = danger ? (dark ? '#ffb4a3' : colour.brick) : dark ? colour.paper : colour.ink;
  const body = (
    <>
      <View style={[s.rowIcon, { backgroundColor: danger ? (dark ? '#3a2019' : '#f6e3dc') : dark ? '#2f363c' : colour.greenSoft }]}>
        <Icon name={icon} size={18} color={danger ? fg : dark ? colour.yellow : colour.green} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[s.rowLabel, { color: fg }]}>{label}</Text>
        {value ? <Text style={[s.rowValue, { color: dark ? '#b9c2c9' : colour.steel }]}>{value}</Text> : null}
      </View>
      {onPress ? <Icon name="chevronRight" size={18} color={dark ? '#8f9aa3' : '#9aa1a6'} strokeWidth={2} /> : null}
    </>
  );
  const style = [s.row, !last && (dark ? s.rowRuleDark : s.rowRule)];
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" sink={0.985} style={style}>
      {body}
    </Press>
  ) : (
    <View style={style}>{body}</View>
  );
}

export function Loading({ dark = false }: Tone) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colour.ink : colour.canvas }}>
      <ScrewSpinner size={56} />
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 14, gap: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heroBack: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.14)' },
  heroBackDark: { backgroundColor: '#22282d', boxShadow: 'none' },
  heroTitle: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, color: colour.ink },
  heroSub: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: colour.steel },
  lifted: { boxShadow: '0px 6px 14px rgba(20, 23, 26, 0.18)' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  groupTitle: { fontFamily: font.bodySemi, fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase', paddingHorizontal: 4 },
  group: { borderRadius: 22, backgroundColor: colour.white, overflow: 'hidden' },
  groupDark: { backgroundColor: '#22282d', borderColor: '#22282d' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  rowRuleDark: { borderBottomWidth: 1, borderBottomColor: '#2f363c' },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: font.bodySemi, fontSize: 15 },
  rowValue: { fontFamily: font.body, fontSize: 13 },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.7 },
  notify: { gap: 10, padding: 16, borderRadius: radius.big },
  notifyTitle: { fontFamily: font.display, fontSize: 18 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 56,
    borderRadius: radius.big,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: font.display, fontSize: 17, textAlign: 'center' },
  label: { fontFamily: font.bodySemi, fontSize: 14 },
  input: { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: font.bodyMedium, fontSize: 17 },
  hint: { fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18 },
  chip: { minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  chipText: { fontFamily: font.bodySemi, fontSize: 14 },
  notice: { borderRadius: 14, padding: 12 },
  noticeText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20 },
});
