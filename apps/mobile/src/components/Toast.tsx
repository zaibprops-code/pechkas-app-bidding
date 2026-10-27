import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { asMessage, messageKey, type Message, type Tone } from '../message';
import { colour, font } from '../theme';

/**
 * Messages, said where they cannot be missed: a card that slides down over
 * the top of whatever screen is showing, the way big apps do it. It used to
 * be a box at the foot of the page — a customer who had just chosen a video
 * was looking at the top, and never learned it was refused.
 *
 * Each message has a kind (src/message.ts), and the card says which at a
 * glance: brick for an error, yellow for "you need to do something", green
 * for done. A title, a sentence, one button that puts it right (Open
 * settings), and the phone's own words behind "Show details" — the owner
 * once got "Call to function 'ExponentImagePicker.launchCameraAsync' has
 * been rejected" as the whole message, which is no message at all.
 *
 * Errors and warnings stay until closed with ×, replaced, cleared by the
 * screen, or the person moves to another screen: words that leave while
 * somebody reads them were not read. A success or a piece of news says
 * one short thing and goes after a few seconds, as every big app's does.
 * Only `transform` moves it; the phone's screen reader reads it out.
 *
 * Screens do not call this directly: `Notice` in ui.tsx does.
 */
type Shown = { m: Message; key: string; n: number } | null;
type Toaster = { show: (m: string | Message) => void; drop: (m: string | Message) => void };

const ToastContext = createContext<Toaster>({ show: () => {}, drop: () => {} });
export const useToast = () => useContext(ToastContext);

/** How long a success or a piece of news stays. */
const SHORT_WHILE = 5000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown>(null);
  const count = useRef(0);
  const show = useCallback((raw: string | Message) => {
    const m = asMessage(raw);
    count.current += 1;
    setShown({ m, key: messageKey(m), n: count.current });
    AccessibilityInfo.announceForAccessibility(m.title ? `${m.title}. ${m.text}` : m.text);
  }, []);
  // A screen that has cleared its own message takes the card with it — but
  // only that message, never a newer one from somewhere else.
  const drop = useCallback((raw: string | Message) => {
    const key = messageKey(asMessage(raw));
    setShown((s) => (s && s.key === key ? null : s));
  }, []);
  const api = useMemo(() => ({ show, drop }), [show, drop]);

  // Another screen, another subject: the card belongs to the one it came from.
  const here = usePathname();
  useEffect(() => setShown(null), [here]);

  // Done and news go by themselves; trouble waits to be read.
  useEffect(() => {
    if (!shown || !brief(shown.m.tone)) return;
    const n = shown.n;
    const t = setTimeout(() => setShown((s) => (s && s.n === n ? null : s)), SHORT_WHILE);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {shown ? <Banner key={shown.n} m={shown.m} onClose={() => setShown(null)} /> : null}
    </ToastContext.Provider>
  );
}

const brief = (tone: Tone | undefined) => tone === 'success' || tone === 'info';

function Banner({ m, onClose }: { m: Message; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-260)).current;
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
      <MessageCard m={m} onClose={onClose} floating />
    </Animated.View>
  );
}

const TONES: Record<Tone, { icon: IconName; disc: string; mark: string; edge: string; role: 'alert' | 'summary' }> = {
  error: { icon: 'alert', disc: colour.brick, mark: colour.white, edge: '#efc9bd', role: 'alert' },
  warning: { icon: 'alert', disc: colour.yellow, mark: colour.ink, edge: '#f0d58c', role: 'alert' },
  success: { icon: 'check', disc: colour.green, mark: colour.white, edge: '#bcd6d1', role: 'summary' },
  info: { icon: 'bell', disc: colour.greenSoft, mark: colour.green, edge: colour.rule, role: 'summary' },
};

/**
 * The card itself, used by the sliding banner and by `Notice inline`
 * (inside a sheet, or above the camera's record button), so a message looks
 * the same wherever it appears.
 */
export function MessageCard({ m: raw, onClose, floating = false }: { m: string | Message; onClose?: () => void; floating?: boolean }) {
  const m = asMessage(raw);
  const tone = TONES[m.tone ?? 'error'];
  const [open, setOpen] = useState(false);
  return (
    <View
      style={[s.card, { borderColor: tone.edge }, floating && s.floating]}
      accessibilityRole={tone.role}
      accessibilityLiveRegion={tone.role === 'alert' ? 'assertive' : 'polite'}
    >
      <View style={s.top}>
        <View style={[s.disc, { backgroundColor: tone.disc }]}>
          <Icon name={tone.icon} size={18} color={tone.mark} strokeWidth={2.4} />
        </View>
        <View style={s.words}>
          {m.title ? <Text style={s.title}>{m.title}</Text> : null}
          <Text style={m.title ? s.text : s.title}>{m.text}</Text>
        </View>
        {onClose ? (
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="Close this message" sink={0.9} style={s.close}>
            <Icon name="cross" size={18} color={colour.ink} strokeWidth={2.4} />
          </Press>
        ) : null}
      </View>
      {m.action || m.detail ? (
        <View style={s.foot}>
          {m.action ? (
            <Press onPress={m.action.run} accessibilityRole="button" sink={0.96} style={s.action}>
              <Text style={s.actionText}>{m.action.label}</Text>
            </Press>
          ) : null}
          {m.detail ? (
            <Press
              onPress={() => setOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              sink={0.96}
              style={s.more}
            >
              <Text style={s.moreText}>{open ? 'Hide details' : 'Show details'}</Text>
            </Press>
          ) : null}
        </View>
      ) : null}
      {m.detail && open ? (
        <Text style={s.detail} selectable>
          {m.detail}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 12 },
  card: { gap: 8, paddingLeft: 12, paddingVertical: 10, paddingRight: 4, borderRadius: 18, backgroundColor: colour.white, borderWidth: 1.5 },
  floating: { boxShadow: '0px 6px 20px rgba(20, 23, 26, 0.22)' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  disc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  words: { flex: 1, gap: 2, paddingVertical: 4 },
  title: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingLeft: 46, paddingRight: 8 },
  action: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  more: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  moreText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green, textDecorationLine: 'underline' },
  detail: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colour.steel, marginLeft: 46, marginRight: 12, marginBottom: 4 },
});
