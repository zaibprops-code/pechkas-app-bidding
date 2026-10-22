import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../src/components/Mark';
import { Press } from '../src/components/Press';
import { ThisCopy } from '../src/components/ThisCopy';
import { WelcomeArt, type WelcomeArtName } from '../src/components/WelcomeArt';
import { Button } from '../src/components/ui';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { colour, font, TAP } from '../src/theme';

/**
 * The first screen after installing, and after signing out — laid out as
 * inDrive's is, the owner's reference: the name at the top, a drawing with
 * one line under it, pages to swipe with dots to say where you are, and the
 * ways in stacked at the foot with the terms beneath them.
 *
 * Every page says something true of Pechkas today, and nothing more: no
 * numbers, no ratings, no "thousands of customers".
 *
 * Motion obeys the app's rule: only the screw's slot turns, once, as the
 * screen opens. The pages move only when a finger moves them; they never
 * turn by themselves, because text that slides away while somebody is
 * reading it is text they did not finish.
 *
 * Sign up and sign in are one step (a new number becomes a new account),
 * which is why the buttons say "Continue". The gate is in app/_layout.tsx.
 */

/** The two links are one short line of text; the finger gets the full 44 points around each. */
const HIT = { top: 13, bottom: 13, left: 6, right: 6 };

const PAGES: { art: WelcomeArtName; title: string; line: string }[] = [
  {
    art: 'price',
    title: 'Name your price for home repairs',
    line: 'Say what is broken and what you want to pay. Technicians make offers, and you choose.',
  },
  {
    art: 'checked',
    title: 'Technicians Pechkas has checked',
    line: 'Identity, a trial job and the rules, checked before anybody comes to your door.',
  },
  {
    art: 'cash',
    title: 'Pay in cash when the work is done',
    line: 'No card and no wallet. The price is agreed before anybody sets off.',
  },
];

export default function Start() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connected } = useAccount();
  const [page, setPage] = useState(0);
  // The pages fill whatever height is left between the name and the buttons.
  const [pageHeight, setPageHeight] = useState(0);
  const go = (mode: 'phone' | 'email') => router.push({ pathname: '/sign-in', params: { mode } });

  // On a short phone the drawing shrinks before anything else does.
  const compact = height < 700;
  const artWidth = Math.round(Math.min(width - 64, compact ? 220 : 300));
  const artHeight = Math.round(artWidth * 0.75);

  // One turn of the slot as the screen opens: the screw driven home. Only
  // the slot turns (see Mark), so the light on the rim stays where it is.
  const turnIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive) return;
        if (still) return turnIn.setValue(1);
        Animated.spring(turnIn, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }).start();
      });
    return () => {
      alive = false;
    };
  }, [turnIn]);
  const screw = turnIn.interpolate({ inputRange: [0, 1], outputRange: ['-360deg', '0deg'] });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== page) setPage(Math.max(0, Math.min(PAGES.length - 1, i)));
  };

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <View style={[s.top, { paddingTop: insets.top + (compact ? 10 : 18) }]} accessibilityRole="header" accessibilityLabel="Pechkas">
        <Mark size={compact ? 30 : 36} turn={screw} />
        <Text style={[s.name, compact && s.nameSmall]}>pechkas</Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        accessibilityLabel="What Pechkas is"
      >
        {PAGES.map((p, i) => (
          <View key={p.art} style={[s.page, { width, height: pageHeight || undefined }]} accessible accessibilityLabel={`${p.title}. ${p.line} Page ${i + 1} of ${PAGES.length}.`}>
            <WelcomeArt name={p.art} width={artWidth} height={artHeight} />
            <View style={s.words}>
              <Text style={[s.title, compact && s.titleSmall]}>{p.title}</Text>
              <Text style={s.line}>{p.line}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Where you are among the pages. Not buttons: swiping is the way. */}
      <View style={s.dots} accessible={false}>
        {PAGES.map((p, i) => (
          <View key={p.art} style={[s.dot, i === page && s.dotOn]} />
        ))}
      </View>

      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {connected ? null : (
          <View style={s.offline}>
            <Text style={s.offlineText}>This copy of the app is not connected to Pechkas, so nobody can sign in yet.</Text>
            <ThisCopy dark />
          </View>
        )}
        <Button kind="ink" label="Continue with phone" icon="phone" onPress={() => go('phone')} />
        <Button kind="soft" label="Continue with email" icon="mail" onPress={() => go('email')} />
        <View style={s.legal}>
          <Text style={s.small}>Joining Pechkas means you agree to our</Text>
          <Press onPress={() => openLegal('terms')} accessibilityRole="link" hitSlop={HIT} style={s.link}>
            <Text style={s.linkText}>Terms of Use</Text>
          </Press>
          <Text style={s.small}>and</Text>
          <Press onPress={() => openLegal('privacy')} accessibilityRole="link" hitSlop={HIT} style={s.link}>
            <Text style={s.linkText}>Privacy Policy</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.white },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 6 },
  name: { fontFamily: font.display, fontSize: 28, color: colour.ink, letterSpacing: -0.6 },
  nameSmall: { fontSize: 24 },
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 22 },
  words: { alignItems: 'center', gap: 8, maxWidth: 360 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 33, color: colour.ink, textAlign: 'center', letterSpacing: -0.4 },
  titleSmall: { fontSize: 23, lineHeight: 28 },
  line: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: colour.ink, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colour.tile },
  dotOn: { backgroundColor: colour.ink },
  actions: { paddingHorizontal: 20, gap: 10 },
  offline: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colour.ink },
  offlineText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.paper },
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 4, rowGap: 2, paddingVertical: 10 },
  small: { fontFamily: font.body, fontSize: 13, color: colour.ink },
  link: { minHeight: TAP - 2 * HIT.top, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink, textDecorationLine: 'underline' },
});
