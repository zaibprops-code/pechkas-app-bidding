import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GoogleG } from '../src/components/GoogleG';
import { Mark } from '../src/components/Mark';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { ThisCopy } from '../src/components/ThisCopy';
import { WelcomeArt, type WelcomeArtName } from '../src/components/WelcomeArt';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { googleReady, signInWithGoogle } from '../src/supabase';
import { colour, font, glow, GLOW_STOPS, TAP } from '../src/theme';

/**
 * The first screen after installing, and after signing out. Redesigned at
 * the owner's request (24 November 2026, design "2B"): three pages to
 * swipe, each in one of the brand's own colours — yellow, green, ink — with
 * a soft light behind its drawing (`glow` in the shared tokens). A big
 * headline ("Your price." on one line, the others on two), one short line, one drawing; the ways in at the foot.
 * Less on each page on purpose: people swipe past welcome pages, so each
 * says one thing and the button is always there.
 *
 * Every page says something true of Pechkas today, and nothing more: no
 * numbers, no ratings, no "thousands of customers".
 *
 * Motion obeys the app's rule: only the screw's slot turns, once, as the
 * screen opens. The pages move only when a finger moves them; they never
 * turn by themselves. The words and buttons take the current page's colours
 * the moment it settles: colours snap, nothing eases.
 *
 * Sign up and sign in are one step (a new number becomes a new account),
 * which is why the buttons say "Continue". The gate is in app/_layout.tsx.
 *
 * "Continue with Google" is drawn only when Supabase says Google is switched
 * on (googleReady), and never on an iPhone: Apple requires "Sign in with
 * Apple" beside it there, which is not built. With it, Google is the main
 * button and the phone the second; without it, the phone is the main one.
 * Email is always the plain link under them.
 */
const GOOGLE_HERE = Platform.OS !== 'ios';

/** The two links are one short line of text; the finger gets the full 44 points around each. */
const HIT = { top: 13, bottom: 13, left: 6, right: 6 };

type Tone = keyof typeof glow;

const PAGES: { art: WelcomeArtName; head: [string] | [string, string]; accent?: boolean; line: string; tone: Tone }[] = [
  { art: 'price', head: ['Your price.'], line: 'Technicians make offers. You choose.', tone: 'yellow' },
  { art: 'checked', head: ['Checked', 'technicians.'], line: 'His photo is confirmed at your door.', tone: 'green' },
  { art: 'cash', head: ['Pay when', 'it’s done.'], accent: true, line: 'Cash, JazzCash or Easypaisa. Nothing in advance.', tone: 'ink' },
];

/** What sits on each colour. Every pair was checked at 4.5:1 or more on the darker half of its glow. */
const ON: Record<Tone, { base: string; fg: string; muted: string; dotOff: string; dotOn: string; main: [string, string]; second: { bg: string; fg: string; border: string }; bar: 'dark' | 'light' }> = {
  yellow: {
    base: colour.yellow,
    fg: colour.ink,
    muted: 'rgba(20,23,26,0.82)',
    dotOff: 'rgba(20,23,26,0.22)',
    dotOn: colour.ink,
    main: [colour.ink, colour.white],
    second: { bg: 'rgba(255,255,255,0.55)', fg: colour.ink, border: 'transparent' },
    bar: 'dark',
  },
  green: {
    base: colour.green,
    fg: colour.white,
    muted: 'rgba(255,255,255,0.86)',
    dotOff: 'rgba(255,255,255,0.25)',
    dotOn: colour.yellow,
    main: [colour.yellow, colour.ink],
    second: { bg: 'transparent', fg: colour.white, border: 'rgba(255,255,255,0.45)' },
    bar: 'light',
  },
  ink: {
    base: colour.ink,
    fg: colour.white,
    muted: 'rgba(255,255,255,0.86)',
    dotOff: 'rgba(255,255,255,0.25)',
    dotOn: colour.yellow,
    main: [colour.yellow, colour.ink],
    second: { bg: 'transparent', fg: colour.white, border: 'rgba(255,255,255,0.4)' },
    bar: 'light',
  },
};

/** A page's background: its colour, lit from behind the drawing and darker at the edges. */
function Glow({ tone, id, width, height }: { tone: Tone; id: string; width: number; height: number }) {
  // Nothing to draw before the page has a size (an ellipse of radius 0 cannot be stretched).
  if (!(width > 0 && height > 0)) return null;
  const cx = width * 0.8;
  const cy = height * 0.62;
  // An ellipse 0.9 of the width across and 0.6 of the height tall: a circle stretched sideways.
  const r = height * 0.6;
  const sx = (width * 0.9) / r;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(${sx} 1) translate(${-cx} ${-cy})`}>
          {GLOW_STOPS.map((o, i) => (
            <Stop key={o} offset={o} stopColor={glow[tone][i]} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/** The welcome page's own button: its colours come from the page it is on. */
function WelcomeButton({ label, onPress, bg, fg, border = 'transparent', icon, leading, busy = false }: { label: string; onPress: () => void; bg: string; fg: string; border?: string; icon?: 'phone'; leading?: ReactNode; busy?: boolean }) {
  return (
    <Press onPress={busy ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy }} style={[s.btn, { backgroundColor: bg, borderColor: border }]}>
      {busy ? (
        <ScrewSpinner size={22} colour={fg} label={`${label}, sending`} />
      ) : (
        <View style={s.btnRow}>
          {leading ?? null}
          {icon ? <Icon name={icon} size={19} color={fg} strokeWidth={2.2} /> : null}
          <Text style={[s.btnText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Press>
  );
}

export default function Start() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connected } = useAccount();
  const [page, setPage] = useState(0);
  const [google, setGoogle] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_HERE || !connected) return;
    let alive = true;
    googleReady().then((on) => alive && setGoogle(on));
    return () => {
      alive = false;
    };
  }, [connected]);

  async function withGoogle() {
    setProblem(null);
    setGoogleBusy(true);
    const r = await signInWithGoogle();
    setGoogleBusy(false);
    // Signed in: the gate takes it from here, to "How will you use Pechkas?" for somebody new.
    if (r.error) setProblem(r.error);
  }
  const go = (mode: 'phone' | 'email') => router.push({ pathname: '/sign-in', params: { mode } });

  // The pages fill the whole screen; the name sits over their top and the ways in over their foot.
  const [box, setBox] = useState({ w: width, h: height });
  const [footH, setFootH] = useState(0);
  const [artBox, setArtBox] = useState<Record<number, { w: number; h: number }>>({});
  const compact = box.h < 700;
  // The headline is as big as the narrowest phone lets "technicians." stay on one line.
  const headSize = Math.min(compact ? 50 : 60, Math.floor((box.w - 48) / 5.9));
  const headTop = insets.top + (compact ? 58 : 68);
  const on = ON[PAGES[page].tone];

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
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, box.w));
    if (i !== page) setPage(Math.max(0, Math.min(PAGES.length - 1, i)));
  };

  return (
    <View style={[s.screen, { backgroundColor: on.base }]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <StatusBar style={on.bar} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} style={StyleSheet.absoluteFill} accessibilityLabel="What Pechkas is">
        {PAGES.map((p, i) => {
          const t = ON[p.tone];
          const art = artBox[i];
          const artSize = art ? Math.max(0, Math.min(art.w, art.h, 300)) : 0;
          return (
            <View key={p.art} style={{ width: box.w, height: box.h }} accessible accessibilityLabel={`${p.head.join(' ')} ${p.line} Page ${i + 1} of ${PAGES.length}.`}>
              <Glow tone={p.tone} id={`welcome-glow-${i}`} width={box.w} height={box.h} />
              <View style={[s.page, { paddingTop: headTop, paddingBottom: footH + 4 }]}>
                <Text style={[s.head, { color: t.fg, fontSize: headSize, lineHeight: Math.round(headSize * 1.04), letterSpacing: -headSize * 0.04 }]}>
                  {p.head[0]}
                  {/* "Your price." fits on one line (shorter than "technicians.", which always does). */}
                  {p.head[1] ? '\n' : null}
                  {p.head[1] ? <Text style={p.accent ? { color: colour.yellow } : null}>{p.head[1]}</Text> : null}
                </Text>
                <Text style={[s.line, { color: t.muted }]}>{p.line}</Text>
                <View style={s.art} onLayout={(e) => {
                  const { width: w, height: h } = e.nativeEvent.layout;
                  setArtBox((was) => (was[i]?.w === w && was[i]?.h === h ? was : { ...was, [i]: { w, h } }));
                }}>
                  {artSize > 40 ? <WelcomeArt name={p.art} size={artSize} /> : null}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[s.top, { paddingTop: insets.top + (compact ? 12 : 18) }]} pointerEvents="none" accessibilityRole="header" accessibilityLabel="Pechkas">
        <Mark size={compact ? 26 : 28} turn={screw} />
        <Text style={[s.name, { color: on.fg }]}>pechkas</Text>
      </View>

      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 14) }]} onLayout={(e) => setFootH(e.nativeEvent.layout.height)}>
        {connected ? null : (
          <View style={s.offline}>
            <Text style={s.offlineText}>This copy of the app is not connected to Pechkas, so nobody can sign in yet.</Text>
            <ThisCopy dark />
          </View>
        )}
        {problem ? (
          <View style={s.problem} accessibilityRole="alert">
            <Text style={s.problemText}>{problem}</Text>
          </View>
        ) : null}
        {/* Where you are among the pages. Not buttons: swiping is the way. */}
        <View style={s.dots} accessible={false}>
          {PAGES.map((p, i) => (
            <View key={p.art} style={[s.dot, { backgroundColor: i === page ? on.dotOn : on.dotOff }, i === page && s.dotOn]} />
          ))}
        </View>
        {google ? <WelcomeButton label="Continue with Google" leading={<GoogleG size={20} />} onPress={withGoogle} busy={googleBusy} bg={on.main[0]} fg={on.main[1]} /> : null}
        {google ? (
          <WelcomeButton label="Continue with phone" icon="phone" onPress={() => go('phone')} bg={on.second.bg} fg={on.second.fg} border={on.second.border} />
        ) : (
          <WelcomeButton label="Continue with phone" icon="phone" onPress={() => go('phone')} bg={on.main[0]} fg={on.main[1]} />
        )}
        <Press onPress={() => go('email')} accessibilityRole="button" style={s.email} sink={0.96}>
          <Text style={[s.emailText, { color: on.fg }]}>Continue with email</Text>
        </Press>
        <View style={s.legal}>
          <Text style={[s.small, { color: on.muted }]}>By continuing you agree to the</Text>
          <Press onPress={() => openLegal('terms')} accessibilityRole="link" hitSlop={HIT} style={s.link}>
            <Text style={[s.linkText, { color: on.fg }]}>Terms of Use</Text>
          </Press>
          <Text style={[s.small, { color: on.muted }]}>and</Text>
          <Press onPress={() => openLegal('privacy')} accessibilityRole="link" hitSlop={HIT} style={s.link}>
            <Text style={[s.linkText, { color: on.fg }]}>Privacy Policy</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  name: { fontFamily: font.brand, fontSize: 23, letterSpacing: -0.4 },
  page: { flex: 1, paddingHorizontal: 24 },
  head: { fontFamily: font.display },
  line: { fontFamily: font.body, fontSize: 17, lineHeight: 25, marginTop: 14, maxWidth: 320 },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, gap: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { width: 22 },
  btn: { minHeight: 56, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnText: { fontFamily: font.display, fontSize: 17 },
  email: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  emailText: { fontFamily: font.display, fontSize: 15.5, textDecorationLine: 'underline' },
  problem: { padding: 12, borderRadius: 14, backgroundColor: colour.softBrick },
  problemText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.brick },
  offline: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colour.ink, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  offlineText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.paper },
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 4, rowGap: 0 },
  small: { fontFamily: font.body, fontSize: 12.5 },
  link: { minHeight: TAP - 2 * HIT.top, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 12.5, textDecorationLine: 'underline' },
});
