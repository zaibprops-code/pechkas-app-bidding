import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Glow } from './YellowTop';
import { ScrewSpinner } from './ScrewSpinner';
import { colour, font, glow } from '../theme';
import type { Mode } from '../mode';

/**
 * The switch between customer and technician mode, played as one movement
 * (the owner's choice, 24 November 2026, from the video he approved):
 *
 *   1. the colour of the side being opened — green for the technician,
 *      yellow for the customer — grows out of the button that was tapped
 *      until it fills the screen;
 *   2. the screw turns in the middle, with the side's name rising under it,
 *      for as long as the database takes to switch — and at least until the
 *      name is in place, about 0.85 s from the tap, the length of the
 *      movement itself; nothing is ever added to wait for show;
 *   3. once the new side's first screen is in place, the cover lifts off the
 *      top like a curtain.
 *
 * It is only ever a cover over the real work: `useSwitchMode()` in
 * src/mode.ts does the switch, and if the database refuses (a job still on)
 * the colour shrinks back into the button and the refusal is shown there.
 *
 * Transform only, on the native driver: the circle scales, the words slide
 * up from behind a mask, the cover moves up. Nothing fades — a word half way
 * through a fade is a word nobody can read — and no colour eases. With
 * "remove animations" on there is no cover at all: the screen simply
 * changes. Drawn at the root (app/_layout.tsx), over the menu, so it reaches
 * every edge of the screen the way the menu does.
 */

type Shown = { to: Mode; x: number; y: number };
type Api = {
  /** Start growing from a point on the screen (the button's centre). */
  cover: (to: Mode, at: { x: number; y: number }) => void;
  /** Resolves once the colour fills the screen (at once with no cover), so the screens change out of sight. */
  covered: () => Promise<void>;
  /** The new screen is in place: lift the cover off it. */
  lift: () => void;
  /** It did not happen: shrink back into the button. */
  drop: () => void;
};

const Ctx = createContext<Api>({ cover: () => {}, covered: () => Promise.resolve(), lift: () => {}, drop: () => {} });
export const useSwitchCover = () => useContext(Ctx);

const GROW_MS = 460;
const LIFT_MS = 460;
const DISC = 80;

const WORDS: Record<Mode, { title: string; line: string }> = {
  pro: { title: 'Technician mode', line: 'Your jobs and offers' },
  customer: { title: 'Customer mode', line: 'Get something fixed at home' },
};

export function SwitchCoverHost({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<Shown | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const up = useRef(new Animated.Value(0)).current;
  // The screens change once the colour fills the screen…
  const grown = useRef<Promise<void>>(Promise.resolve());
  // …and for the side's name to have risen into place, so the movement reads
  // as one: about 0.85 s in all, the length of the transition itself.
  const named = useRef<Promise<void>>(Promise.resolve());

  const reset = useCallback(() => {
    grow.setValue(0);
    words.setValue(0);
    up.setValue(0);
    setShown(null);
  }, [grow, words, up]);

  const cover = useCallback<Api['cover']>(
    (to, at) => {
      let said: () => void = () => {};
      named.current = new Promise<void>((r) => (said = r));
      grown.current = AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then(
          (still) =>
            new Promise<void>((done) => {
              if (still) {
                said();
                return done();
              }
              grow.setValue(0);
              words.setValue(0);
              up.setValue(0);
              setShown({ to, ...at });
              Animated.timing(grow, { toValue: 1, duration: GROW_MS, easing: Easing.bezier(0.3, 0, 0.2, 1), useNativeDriver: true }).start(() => {
                done();
                Animated.timing(words, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => said());
              });
            }),
        );
    },
    [grow, words, up],
  );

  const lift = useCallback(() => {
    void named.current.then(() => {
      // One frame for the new screen to draw before it is uncovered.
      requestAnimationFrame(() =>
        Animated.timing(up, { toValue: 1, duration: LIFT_MS, easing: Easing.bezier(0.5, 0, 0.3, 1), useNativeDriver: true }).start(reset),
      );
    });
  }, [up, reset]);

  const drop = useCallback(() => {
    void grown.current.then(() =>
      Animated.timing(grow, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(reset),
    );
  }, [grow, reset]);

  const covered = useCallback(() => grown.current, []);
  const api = useMemo(() => ({ cover, covered, lift, drop }), [cover, covered, lift, drop]);

  // Big enough to reach the far corner from wherever the button was.
  const reach = shown ? Math.hypot(Math.max(shown.x, width - shown.x), Math.max(shown.y, height - shown.y)) : 0;
  const scale = grow.interpolate({ inputRange: [0, 1], outputRange: [0.01, (reach * 2) / DISC + 0.2] });
  const pro = shown?.to === 'pro';
  const ink = pro ? colour.white : colour.ink;

  return (
    <Ctx.Provider value={api}>
      {children}
      {shown ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: up.interpolate({ inputRange: [0, 1], outputRange: [0, -height - 40] }) }] }]}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Switching to ${WORDS[shown.to].title.toLowerCase()}`}
        >
          <StatusBar style={pro ? 'light' : 'dark'} />
          {/* The colour, growing from the button. Clipped by the screen, so only
              the part on the phone is ever drawn. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <Animated.View
              style={{
                position: 'absolute',
                left: shown.x - DISC / 2,
                top: shown.y - DISC / 2,
                width: DISC,
                height: DISC,
                borderRadius: DISC / 2,
                overflow: 'hidden',
                transform: [{ scale }],
              }}
            >
              <View style={{ flex: 1, backgroundColor: pro ? colour.green : colour.yellow }} />
            </Animated.View>
          </View>
          {/* Once full, the lit colour, the screw and the words sit on top. */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, s.middle, { transform: [{ translateY: grow.interpolate({ inputRange: [0, 0.98, 1], outputRange: [height * 2, height * 2, 0] }) }] }]}
          >
            <Glow width={width} height={height} at={0.7} stops={pro ? glow.green : glow.yellow} id="switch-cover" />
            <View style={s.halo}>
              <ScrewSpinner size={72} label={`Switching to ${WORDS[shown.to].title.toLowerCase()}`} />
            </View>
            <View style={s.mask}>
              <Animated.View style={{ alignItems: 'center', transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) }] }}>
                <Text style={[s.title, { color: ink }]}>{WORDS[shown.to].title}</Text>
                <Text style={[s.line, { color: ink }]}>{WORDS[shown.to].line}</Text>
              </Animated.View>
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  middle: { alignItems: 'center', justifyContent: 'center', gap: 22 },
  halo: { width: 116, height: 116, borderRadius: 58, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.15)' },
  mask: { overflow: 'hidden', paddingHorizontal: 24 },
  title: { fontFamily: font.display, fontSize: 28, letterSpacing: -0.5, textAlign: 'center' },
  line: { fontFamily: font.bodySemi, fontSize: 15, marginTop: 4, textAlign: 'center' },
});
