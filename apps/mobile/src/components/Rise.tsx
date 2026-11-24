import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A list that rises in, one after another, once — home's tiles, Search's
 * words and results, a kind of work's groups, Post a job's steps. Transform
 * only; with "remove animations" on, everything is simply in place.
 * `key` starts it again (Search's results, each time new ones appear).
 */
export function useRises(count: number, key: unknown = 0, step = 45): Animated.Value[] {
  const vs = useRef<Animated.Value[]>([]).current;
  while (vs.length < count) vs.push(new Animated.Value(0));
  const last = useRef<unknown>(Symbol('never'));
  useEffect(() => {
    if (!count || last.current === key) return;
    last.current = key;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive) return;
        if (still) return vs.forEach((v) => v.setValue(1));
        vs.forEach((v) => v.setValue(0));
        Animated.stagger(step, vs.slice(0, count).map((v) => Animated.spring(v, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }))).start();
      });
    return () => {
      alive = false;
    };
  }, [count, key, vs, step]);
  return vs;
}

export function Rise({ v, style, children }: { v?: Animated.Value; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const y = v ? v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) : 0;
  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}
