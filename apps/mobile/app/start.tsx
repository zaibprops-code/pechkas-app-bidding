import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../src/components/Mark';
import { Icon, type IconName } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { ThisCopy } from '../src/components/ThisCopy';
import { Button } from '../src/components/ui';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { colour, font, TAP } from '../src/theme';

/**
 * The first screen after installing, and after signing out. It is where a
 * person decides whether to sign up, so it says almost nothing and shows the
 * rest: the Pechkas screw turns into place, and the six trades circle it.
 *
 * Motion obeys the app's rule — transform only, never a colour, never a
 * fade, so no word is ever drawn at reduced contrast. Every word is fully
 * opaque from the first frame; the entrance only slides it a few points.
 * With "remove animations" on, everything starts where it ends and stays.
 *
 * Sign up and sign in are one step (a new number becomes a new account),
 * which is why the buttons say "Continue". The gate is in app/_layout.tsx.
 */

const TRADES: IconName[] = ['ac', 'bolt', 'drop', 'cctv', 'wifi', 'ups'];

export default function Start() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connected } = useAccount();
  const go = (mode: 'phone' | 'email') => router.push({ pathname: '/sign-in', params: { mode } });

  // The stage fits a small 320 × 568 phone as well as a tall one: on a short
  // screen everything shrinks rather than the words running into the buttons.
  const compact = height < 700;
  const stage = Math.round(Math.min(width - 40, height * (compact ? 0.3 : 0.4), 320));
  const radiusOrbit = stage * 0.39;
  const chip = Math.round(stage * 0.16);
  const mark = Math.round(stage * 0.34);

  const turnIn = useRef(new Animated.Value(0)).current; // the screw tightening, once
  const words = useRef(new Animated.Value(0)).current; // the name and the line under it
  const actions = useRef(new Animated.Value(0)).current; // the buttons
  const orbit = useRef(new Animated.Value(0)).current; // the trades, slowly, for ever

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive) return;
        if (still) {
          turnIn.setValue(1);
          words.setValue(1);
          actions.setValue(1);
          return;
        }
        Animated.stagger(140, [
          Animated.spring(turnIn, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }),
          Animated.spring(words, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
          Animated.spring(actions, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
        ]).start();
        loop = Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 48000, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
      });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [turnIn, words, actions, orbit]);

  const spin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const unspin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  // One full turn of the slot as the head arrives: the screw driven home. Only
  // the slot turns (see Mark), so the light on the rim stays where it is.
  const screw = turnIn.interpolate({ inputRange: [0, 1], outputRange: ['-360deg', '0deg'] });
  const grow = turnIn.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const ringGrow = turnIn.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  const rise = (v: Animated.Value, by: number) => v.interpolate({ inputRange: [0, 1], outputRange: [by, 0] });

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.content, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={[s.hero, compact && s.heroSmall]}>
          <Animated.View style={{ width: stage, height: stage, transform: [{ scale: ringGrow }] }} accessible={false}>
            <View style={[s.ring, { width: radiusOrbit * 2, height: radiusOrbit * 2, borderRadius: radiusOrbit, left: stage / 2 - radiusOrbit, top: stage / 2 - radiusOrbit }]} />
            <View style={[s.ringInner, { width: radiusOrbit * 1.25, height: radiusOrbit * 1.25, borderRadius: radiusOrbit, left: stage / 2 - radiusOrbit * 0.625, top: stage / 2 - radiusOrbit * 0.625 }]} />
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin }] }]}>
              {TRADES.map((name, i) => {
                const a = (i / TRADES.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <Animated.View
                    key={name}
                    style={[
                      s.chip,
                      {
                        width: chip,
                        height: chip,
                        borderRadius: chip / 2,
                        left: stage / 2 + radiusOrbit * Math.cos(a) - chip / 2,
                        top: stage / 2 + radiusOrbit * Math.sin(a) - chip / 2,
                        transform: [{ rotate: unspin }],
                      },
                    ]}
                  >
                    <Icon name={name} size={Math.round(chip * 0.48)} color={colour.yellow} strokeWidth={2} />
                  </Animated.View>
                );
              })}
            </Animated.View>
            <Animated.View style={[s.center, { left: stage / 2 - mark / 2, top: stage / 2 - mark / 2, transform: [{ scale: grow }] }]}>
              <Mark size={mark} turn={screw} />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[s.words, { transform: [{ translateY: rise(words, 26) }] }]}>
            <Text style={[s.wordmark, compact && s.wordmarkSmall]} accessibilityRole="header">
              pechkas
            </Text>
            <Text style={s.line}>Checked technicians. A price you agree first.</Text>
          </Animated.View>
        </View>

        <Animated.View style={[s.actions, { transform: [{ translateY: rise(actions, 40) }] }]}>
          {connected ? null : (
            <View style={s.offline}>
              <Text style={s.offlineText}>This copy of the app is not connected to Pechkas, so nobody can sign in yet.</Text>
              <ThisCopy dark />
            </View>
          )}
          <Button label="Continue with mobile number" onPress={() => go('phone')} />
          <Button kind="outline" dark label="Continue with email" onPress={() => go('email')} />
          <View style={s.legal}>
            <Text style={s.small}>By continuing you agree to our</Text>
            <Press onPress={() => openLegal('terms')} accessibilityRole="link" style={s.link}>
              <Text style={s.linkText}>Terms</Text>
            </Press>
            <Text style={s.small}>and</Text>
            <Press onPress={() => openLegal('privacy')} accessibilityRole="link" style={s.link}>
              <Text style={s.linkText}>Privacy Policy</Text>
            </Press>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // overflow hidden: a rotating box is larger than what it draws, and must never widen the screen.
  screen: { flex: 1, backgroundColor: colour.green, overflow: 'hidden' },
  content: { flex: 1, paddingHorizontal: 22, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(250,246,239,0.16)' },
  ringInner: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(250,246,239,0.08)' },
  chip: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: colour.greenDark, borderWidth: 1.5, borderColor: 'rgba(255,197,61,0.35)' },
  center: { position: 'absolute' },
  words: { alignItems: 'center', gap: 6 },
  heroSmall: { gap: 10 },
  wordmark: { fontFamily: font.display, fontSize: 44, color: colour.paper, letterSpacing: -1.2 },
  wordmarkSmall: { fontSize: 34 },
  line: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: colour.paper, textAlign: 'center' },
  actions: { gap: 12 },
  offline: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colour.ink },
  offlineText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.paper },
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 5 },
  small: { fontFamily: font.body, fontSize: 12.5, color: colour.paper },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.yellow, textDecorationLine: 'underline' },
});
