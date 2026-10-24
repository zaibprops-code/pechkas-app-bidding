import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Press } from './Press';
import { colour, font } from '../theme';

/**
 * Something went wrong, said where it cannot be missed: a banner that slides
 * down over the top of whatever screen is showing, the way big apps do it.
 * It used to be a box at the foot of the page — a customer who had just
 * chosen a video was looking at the top, and never learned it was refused.
 *
 * The banner stays until it is closed with its ×, replaced by the next one,
 * or the person goes to another screen; it never slides away by itself,
 * because words that leave while somebody reads them were not read. Only
 * `transform` moves it, and the phone's screen reader reads it out.
 *
 * Screens do not call this directly: `Notice` in ui.tsx does, so every
 * screen that already said `<Notice text={…} />` shows its trouble here.
 */
type Shown = { text: string; n: number } | null;
type Toaster = { show: (text: string) => void; drop: (text: string) => void };

const ToastContext = createContext<Toaster>({ show: () => {}, drop: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown>(null);
  const count = useRef(0);
  const show = useCallback((text: string) => {
    count.current += 1;
    setShown({ text, n: count.current });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  // A screen that has cleared its own message takes the banner with it — but
  // only that message, never a newer one from somewhere else.
  const drop = useCallback((text: string) => setShown((s) => (s && s.text === text ? null : s)), []);
  const api = useMemo(() => ({ show, drop }), [show, drop]);

  // Another screen, another subject: the banner belongs to the one it came from.
  const here = usePathname();
  useEffect(() => setShown(null), [here]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {shown ? <Banner key={shown.n} text={shown.text} onClose={() => setShown(null)} /> : null}
    </ToastContext.Provider>
  );
}

function Banner({ text, onClose }: { text: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-220)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return y.setValue(0);
        Animated.timing(y, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [y]);
  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 8, transform: [{ translateY: y }] }]}>
      <View style={s.card} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={s.icon}>
          <Icon name="alert" size={20} color={colour.white} strokeWidth={2.2} />
        </View>
        <Text style={s.text}>{text}</Text>
        <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="Close this message" sink={0.9} style={s.close}>
          <Icon name="cross" size={18} color={colour.ink} strokeWidth={2.4} />
        </Press>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 4,
    borderRadius: 18,
    backgroundColor: colour.white,
    borderWidth: 1.5,
    borderColor: '#efc9bd',
    boxShadow: '0px 6px 20px rgba(20, 23, 26, 0.22)',
  },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colour.brick, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
