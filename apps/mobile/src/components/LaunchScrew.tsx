import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Mark } from './Mark';
import { colour } from '../theme';

/**
 * What a person sees between tapping the icon and the first screen: the
 * Pechkas screw being driven in, then the green lifting away like a lid.
 *
 *   1. The phone's own splash (app.json: splash-icon.png at 140 wide on
 *      green) is a still picture and cannot move. This component draws the
 *      SAME picture — same green, same head, same size, same place — and only
 *      then hides the phone's, so the hand-over is invisible.
 *   2. The slot turns, a full turn at a time, for as long as the app is
 *      still deciding where this person belongs. Loading is never made
 *      longer to show it off: on a fast phone that is one turn.
 *   3. When the gate in app/_layout.tsx has decided, the head seats — a
 *      small press, the screw tightening — and the green panel slides up off
 *      the screen, uncovering a screen that is already drawn.
 *
 * About a second on a fast phone. Transform only, native driver, no word on
 * it to fade. With "remove animations" on it skips straight to the screen.
 */

// splash-icon.png draws the head 400 wide in a 512 square, shown 140 wide.
const SPLASH_HEAD = Math.round((140 * 400) / 512);

export function LaunchScrew({ decided, onDone }: { decided: boolean; onDone: () => void }) {
  const { height } = useWindowDimensions();
  const turns = useRef(new Animated.Value(0)).current;
  const seat = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const ready = useRef(decided);
  const still = useRef<boolean | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    ready.current = decided;
    if (decided && still.current === true) onDone();
  }, [decided, onDone]);

  useEffect(() => {
    let alive = true;

    const finish = () => {
      if (finishing.current) return;
      finishing.current = true;
      Animated.sequence([
        // A short, firm press — a spring here wobbled for most of a second
        // before it counted as settled, and the lift waited for it.
        Animated.timing(seat, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => alive && onDone());
    };

    const turn = (n: number) => {
      Animated.timing(turns, { toValue: n, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => {
          if (!alive || !finished) return;
          if (ready.current) finish();
          else turn(n + 1);
        },
      );
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        still.current = reduce;
        if (reduce) {
          if (ready.current) onDone();
          return;
        }
        turn(1);
      });

    return () => {
      alive = false;
    };
  }, [turns, seat, lift, onDone]);

  const slot = turns.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'], extrapolate: 'extend' });
  const press = seat.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const up = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -height - 40] });

  return (
    <Animated.View
      style={[s.cover, { transform: [{ translateY: up }] }]}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={s.centre}>
        <Animated.View style={{ transform: [{ scale: press }] }}>
          <Mark size={SPLASH_HEAD} turn={slot} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100, elevation: 100, backgroundColor: colour.green },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
