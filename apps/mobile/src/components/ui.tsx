import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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

export function Screen({ children, dark = false, footer }: { children: ReactNode; footer?: ReactNode } & Tone) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: dark ? colour.ink : colour.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
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
  kind?: 'yellow' | 'green' | 'danger' | 'outline';
  busy?: boolean;
  disabled?: boolean;
} & Tone;

export function Button({ label, onPress, kind = 'yellow', busy = false, disabled = false, dark = false }: ButtonProps) {
  const bg = kind === 'yellow' ? colour.yellow : kind === 'green' ? colour.green : kind === 'danger' ? colour.brick : 'transparent';
  const fg = kind === 'yellow' ? colour.ink : kind === 'green' || kind === 'danger' ? colour.paper : dark ? colour.paper : colour.ink;
  const border = kind === 'outline' ? (dark ? 'rgba(250,246,239,0.35)' : 'rgba(20,23,26,0.2)') : 'transparent';
  const off = disabled || busy;
  return (
    <Press
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={[s.button, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label}</Text>}
    </Press>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
} & Tone;

export function Field({ label, hint, error, dark = false, style, ...input }: FieldProps) {
  const fg = dark ? colour.paper : colour.ink;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: fg }]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={dark ? '#8f9aa3' : '#7a838a'}
        style={[
          s.input,
          {
            color: colour.ink,
            backgroundColor: colour.white,
            borderColor: error ? colour.brick : 'rgba(20,23,26,0.16)',
            borderWidth: error ? 2 : 1,
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

export function Loading({ dark = false }: Tone) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colour.ink : colour.paper }}>
      <ActivityIndicator color={dark ? colour.yellow : colour.green} size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.7 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 56,
    borderRadius: radius.big,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: font.display, fontSize: 17 },
  label: { fontFamily: font.bodySemi, fontSize: 14 },
  input: { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, fontFamily: font.bodyMedium, fontSize: 17 },
  hint: { fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18 },
  chip: { minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  chipText: { fontFamily: font.bodySemi, fontSize: 14 },
  notice: { borderRadius: 14, padding: 12 },
  noticeText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20 },
});
