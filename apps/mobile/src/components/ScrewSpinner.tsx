import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { Mark } from './Mark';

/**
 * "Working on it", in the Pechkas way: the screw is being driven in. One
 * full turn, a short rest, another — the rhythm of a hand on a screwdriver,
 * not the smooth whirl of a generic spinner. Every rest is a whole number of
 * turns, so the slot always stops where it belongs and its lit wall is on
 * the lit side.
 *
 * It replaces the system spinner everywhere: buttons that are sending,
 * screens that are loading, a job waiting for offers. Transform only, on the
 * native driver, so it keeps turning while JavaScript is busy. With "remove
 * animations" on, it stands still and still says what it means.
 *
 * `colour` gives the flat one-colour head, for a button or a coloured panel.
 * Without it, the full-colour head, machined from 28px up.
 */
export function ScrewSpinner({ size = 24, colour, label = 'Loading' }: { size?: number; colour?: string; label?: string }) {
  const turns = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    let anim: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive || still) return;
        const step = (n: number) => {
          anim = Animated.sequence([
            Animated.timing(turns, { toValue: n, duration: 640, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            Animated.delay(140),
          ]);
          anim.start(({ finished }) => {
            if (finished && alive) step(n + 1);
          });
        };
        step(1);
      });
    return () => {
      alive = false;
      anim?.stop();
    };
  }, [turns]);

  // A screw goes in clockwise.
  const turn = turns.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'], extrapolate: 'extend' });

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Mark size={size} turn={turn} colour={colour} />
    </View>
  );
}
