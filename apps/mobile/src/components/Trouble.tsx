import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Mark } from './Mark';
import { Button, SystemBars } from './ui';
import { useBackOnline, useOffline } from '../net';
import { APP_STORE_APP, APP_STORE_ID, OFFICE_PHONE, OFFICE_PHONE_SHOWN, PLAY_STORE_APP, PLAY_STORE_WEB } from '../office';
import { colour, font } from '../theme';

/**
 * The screens every big app has for when things go wrong, in one place:
 *
 *   offline      the phone has no internet
 *   unreachable  it has, and Pechkas did not answer
 *   broken       the app itself hit a problem (the crash screen)
 *   missing      a link to a page the app does not have
 *   update       the office has asked copies this old to update first
 *   paused       the office has paused the app while something is worked on
 *
 * Each one says what happened in plain words, what the person can do, and
 * gives them a button that does it. Nothing says "error 503". When the
 * phone is offline, "Call the office" is the way out: a phone call needs
 * no internet, which is the one thing a customer with a dead connection
 * and a leaking pipe can still do.
 *
 * `full` fills the screen (at launch, the crash screen, a missing page);
 * without it the same words sit in a card inside a screen, under that
 * screen's own header, so the menu stays where it was.
 *
 * Only the words change between kinds; nothing fades, and the drawings are
 * still. Every line wraps rather than being cut off at the edge, at 320
 * wide too.
 */
export type TroubleKind = 'offline' | 'unreachable' | 'broken' | 'missing' | 'update' | 'paused';

const WORDS: Record<TroubleKind, { title: string; text: string }> = {
  offline: {
    title: 'No internet connection',
    text: 'Your phone is offline. Check that mobile data or Wi-Fi is switched on. Pechkas tries again by itself the moment the connection is back.',
  },
  unreachable: {
    title: 'Pechkas is not answering',
    text: 'Your phone is connected, but Pechkas did not reply. This is usually over in a minute. Pechkas keeps trying by itself.',
  },
  broken: {
    title: 'Something went wrong',
    text: 'The app ran into a problem it did not expect. A job you were writing is kept on the phone. Please try again.',
  },
  missing: {
    title: 'This page is not in the app',
    text: 'The link may be old, or the page has moved. Everything else is where it was.',
  },
  update: {
    title: 'Please update Pechkas',
    text: 'This copy of the app is too old to carry on. The new version is free and takes a minute. Your account and your jobs are kept.',
  },
  paused: {
    title: 'Pechkas is paused for a short while',
    text: 'The office is working on the app. It opens again by itself when the work is done.',
  },
};

/** Where "Update Pechkas" goes on this phone, and what the button says. */
async function openStore() {
  if (Platform.OS === 'ios') return Linking.openURL(APP_STORE_APP).catch(() => {});
  try {
    await Linking.openURL(PLAY_STORE_APP);
  } catch {
    // No Play Store app (rare): its web page does the same job.
    await Linking.openURL(PLAY_STORE_WEB).catch(() => {});
  }
}
const UPDATE_LABEL = Platform.OS === 'ios' && !APP_STORE_ID ? 'Open the App Store' : 'Update Pechkas';

/** While Pechkas is not answering, ask again this often. One small request. */
const UNREACHABLE_EVERY = 20000;

type Props = {
  kind: TroubleKind;
  /** Try again. Shown as a button for every kind but `missing`. */
  onRetry?: () => unknown;
  /** Go to home. Shown for `broken` and `missing`. */
  onHome?: () => void;
  /** A line for the screenshot the owner is sent: what the phone said. */
  detail?: string | null;
  /** For `paused`: the office's own few words, shown as theirs. */
  note?: string | null;
  /** The emergency numbers. Offered on the screens that stop the whole app. */
  onSafety?: () => void;
  full?: boolean;
};

export function Trouble({ kind: asked, onRetry, onHome, detail, note, onSafety, full = false }: Props) {
  const insets = useSafeAreaInsets();
  // On a short phone the drawing gives way, so the buttons fit without scrolling.
  const short = useWindowDimensions().height < 720;
  // "No internet" and "not answering" follow what the phone says right now,
  // so the words change the moment mobile data goes off or comes back.
  const off = useOffline();
  const kind: TroubleKind = asked === 'offline' || asked === 'unreachable' ? (off ? 'offline' : 'unreachable') : asked;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const retry = async () => {
    if (!onRetry || busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // Offline: the moment the phone says it is back. Not answering: every so often.
  useBackOnline(() => void retry(), kind === 'offline' && Boolean(onRetry));
  useEffect(() => {
    if (kind !== 'unreachable' || !onRetry) return;
    const t = setInterval(() => void retry(), UNREACHABLE_EVERY);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, onRetry]);

  const w = WORDS[kind];
  const noInternet = kind === 'offline' || kind === 'unreachable';
  const call = noInternet || kind === 'update' || kind === 'paused';

  const words = (
    <View style={s.words}>
      <Text accessibilityRole="header" style={[s.title, !full && s.titleSmall]}>
        {w.title}
      </Text>
      <Text style={s.text}>{w.text}</Text>
      {kind === 'update' && Platform.OS === 'ios' && !APP_STORE_ID ? (
        <Text style={s.text}>In the App Store, find Pechkas and tap Update.</Text>
      ) : null}
      {kind === 'paused' && note ? (
        <View style={s.note}>
          <Text style={s.noteLabel}>From the office</Text>
          <Text style={s.noteText}>{note}</Text>
        </View>
      ) : null}
      {detail ? <Text style={s.detail}>(Details: {detail})</Text> : null}
    </View>
  );

  const buttons = (
    <View style={s.buttons}>
      {kind === 'update' ? <Button label={UPDATE_LABEL} icon="arrowRight" onPress={() => void openStore()} /> : null}
      {onRetry && kind !== 'missing' && kind !== 'update' ? <Button label="Try again" busy={busy} onPress={retry} /> : null}
      {onHome && (kind === 'broken' || kind === 'missing') ? (
        <Button kind={kind === 'missing' ? 'yellow' : 'outline'} label="Go to home" icon="home" onPress={onHome} />
      ) : null}
      {call ? (
        <>
          <Button kind="outline" label="Call the office" icon="phone" onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`).catch(() => {})} />
          {noInternet ? (
            <Text style={s.callNote}>A phone call works without the internet: {OFFICE_PHONE_SHOWN.replace(/ /g, '\u00a0')}</Text>
          ) : null}
        </>
      ) : null}
      {onSafety ? <Button kind="outline" label="Emergency numbers" icon="shield" onPress={onSafety} /> : null}
    </View>
  );

  if (!full) {
    return (
      <View style={s.card}>
        <TroubleArt kind={kind} width={200} height={150} />
        {words}
        {buttons}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.fullBody, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        bounces={false}
      >
        <View style={s.brand} accessible accessibilityLabel="Pechkas">
          <Mark size={36} />
          <Text style={s.brandName}>Pechkas</Text>
        </View>
        <View style={[s.middle, short && { gap: 12 }]}>
          {/* On a short phone the screens that stop the whole app drop the drawing,
              so "Emergency numbers" is on the screen without scrolling. */}
          {short && (kind === 'paused' || kind === 'update') ? null : (
            <TroubleArt kind={kind} width={short ? 160 : 240} height={short ? 120 : 180} />
          )}
          {words}
        </View>
        {buttons}
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

const SHADE = '#d9d5cc';

/**
 * One drawing per kind, in the welcome pages' style: objects over the
 * yellow sweep, the brand's flat colours, brick only for what went wrong.
 * They say what the words say, so screen readers skip them.
 */
export function TroubleArt({ kind, width = 240, height = 180 }: { kind: TroubleKind; width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 240 180" accessible={false}>
      <Path d="M14 158 C 54 58, 140 30, 228 40 L 228 108 C 170 102, 124 126, 98 180 L 14 180 Z" fill={colour.yellow} />
      {kind === 'offline' && (
        <G>
          {/* A phone whose signal bars have gone empty, and a brick cross. */}
          <Rect x={70} y={22} width={84} height={148} rx={16} fill={SHADE} />
          <Rect x={64} y={16} width={84} height={148} rx={16} fill={colour.white} />
          <Rect x={74} y={34} width={64} height={102} rx={6} fill={colour.paper2} />
          <Rect x={96} y={146} width={20} height={6} rx={3} fill={SHADE} />
          <Rect x={86} y={108} width={10} height={16} rx={3} fill={colour.ink} />
          <Rect x={100} y={96} width={10} height={28} rx={3} fill={colour.ink} />
          <Rect x={114} y={84} width={10} height={40} rx={3} fill="none" stroke={colour.steel} strokeWidth={2.5} strokeDasharray="4 3" />
          <Rect x={128} y={70} width={10} height={54} rx={3} fill="none" stroke={colour.steel} strokeWidth={2.5} strokeDasharray="4 3" />
          <Circle cx={166} cy={40} r={24} fill={colour.brick} />
          <Path d="M156 30 L176 50 M176 30 L156 50" stroke={colour.white} strokeWidth={6} strokeLinecap="round" />
        </G>
      )}
      {kind === 'unreachable' && (
        <G>
          {/* The phone is fine (full bars, a green tick); the reply has not come (three dots). */}
          <Rect x={42} y={36} width={74} height={130} rx={14} fill={SHADE} />
          <Rect x={36} y={30} width={74} height={130} rx={14} fill={colour.white} />
          <Rect x={46} y={46} width={54} height={90} rx={6} fill={colour.paper2} />
          <Rect x={54} y={104} width={8} height={14} rx={2} fill={colour.ink} />
          <Rect x={66} y={94} width={8} height={24} rx={2} fill={colour.ink} />
          <Rect x={78} y={84} width={8} height={34} rx={2} fill={colour.ink} />
          <Circle cx={100} cy={52} r={16} fill={colour.green} />
          <Path d="M92 52 l6 6 10 -11" stroke={colour.white} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M140 40 H206 A12 12 0 0 1 218 52 V92 A12 12 0 0 1 206 104 H164 L146 120 L150 104 H140 A12 12 0 0 1 128 92 V52 A12 12 0 0 1 140 40 Z" fill={colour.white} />
          <Circle cx={152} cy={72} r={7} fill={colour.ink} />
          <Circle cx={173} cy={72} r={7} fill={colour.steel} />
          <Circle cx={194} cy={72} r={7} fill={SHADE} />
        </G>
      )}
      {kind === 'broken' && (
        <G>
          {/* A screen with a brick warning, and the green screwdriver already on it. */}
          <Rect x={40} y={34} width={140} height={102} rx={14} fill={SHADE} />
          <Rect x={34} y={28} width={140} height={102} rx={14} fill={colour.white} />
          <Rect x={46} y={40} width={116} height={14} rx={4} fill={colour.paper2} />
          <Path d="M104 66 L130 112 H78 Z" fill={colour.brick} strokeLinejoin="round" />
          <Rect x={101} y={80} width={6} height={18} rx={3} fill={colour.white} />
          <Circle cx={104} cy={104} r={3.5} fill={colour.white} />
          <G transform="rotate(-24 150 150)">
            <Rect x={120} y={139} width={56} height={22} rx={11} fill={colour.green} />
            <Rect x={174} y={144} width={11} height={12} rx={2} fill={SHADE} />
            <Rect x={183} y={147} width={44} height={6} rx={2} fill={colour.ink} />
          </G>
        </G>
      )}
      {kind === 'update' && (
        <G>
          {/* A phone, and a green arrow coming down into it: the new version arriving. */}
          <Rect x={70} y={22} width={84} height={148} rx={16} fill={SHADE} />
          <Rect x={64} y={16} width={84} height={148} rx={16} fill={colour.white} />
          <Rect x={74} y={34} width={64} height={102} rx={6} fill={colour.paper2} />
          <Rect x={96} y={146} width={20} height={6} rx={3} fill={SHADE} />
          <Rect x={84} y={112} width={44} height={10} rx={5} fill={SHADE} />
          <Rect x={84} y={112} width={26} height={10} rx={5} fill={colour.green} />
          <Circle cx={168} cy={52} r={30} fill={colour.green} />
          <Path d="M168 36 V66 M155 54 L168 67 L181 54" stroke={colour.white} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
      )}
      {kind === 'paused' && (
        <G>
          {/* A sign hung on a nail with the pause mark, and the screwdriver at work beside it. */}
          <Circle cx={112} cy={22} r={5} fill={colour.ink} />
          <Path d="M112 22 L72 66 M112 22 L152 66" stroke={colour.steel} strokeWidth={3} strokeLinecap="round" />
          <Rect x={50} y={64} width={132} height={86} rx={14} fill={SHADE} />
          <Rect x={44} y={58} width={132} height={86} rx={14} fill={colour.white} />
          <Rect x={92} y={80} width={12} height={42} rx={4} fill={colour.ink} />
          <Rect x={116} y={80} width={12} height={42} rx={4} fill={colour.ink} />
          <G transform="rotate(-24 170 160)">
            <Rect x={140} y={150} width={52} height={20} rx={10} fill={colour.green} />
            <Rect x={190} y={154} width={10} height={12} rx={2} fill={SHADE} />
            <Rect x={198} y={157} width={36} height={6} rx={2} fill={colour.ink} />
          </G>
        </G>
      )}
      {kind === 'missing' && (
        <G>
          {/* A folded map, and a green pin with a question mark: not here. */}
          <Path d="M30 70 L84 54 L138 70 L192 54 V150 L138 166 L84 150 L30 166 Z" fill={SHADE} />
          <Path d="M24 64 L78 48 L132 64 L186 48 V144 L132 160 L78 144 L24 160 Z" fill={colour.white} />
          <Path d="M78 48 V144 M132 64 V160" stroke={SHADE} strokeWidth={3} />
          <Path d="M40 120 C 70 100, 96 132, 124 108" stroke={colour.steel} strokeWidth={3} strokeDasharray="6 5" fill="none" strokeLinecap="round" />
          <Path d="M168 14 C 146 14 132 30 132 50 C 132 76 168 108 168 108 C 168 108 204 76 204 50 C 204 30 190 14 168 14 Z" fill={colour.green} />
          <Path d="M159 42 C 159 34 177 32 177 42 C 177 50 168 50 168 58" stroke={colour.white} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Circle cx={168} cy={68} r={3.5} fill={colour.white} />
        </G>
      )}
    </Svg>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  fullBody: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 20, gap: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandName: { fontFamily: font.display, fontSize: 24, color: colour.ink, letterSpacing: -0.4 },
  middle: { alignItems: 'center', gap: 20 },
  card: { alignItems: 'center', gap: 16, padding: 20, borderRadius: 22, backgroundColor: colour.white },
  words: { alignSelf: 'stretch', gap: 8 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: colour.ink, textAlign: 'center' },
  titleSmall: { fontSize: 22, lineHeight: 27 },
  text: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: colour.steel, textAlign: 'center' },
  detail: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colour.steel, textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 10 },
  note: { alignSelf: 'stretch', gap: 4, padding: 14, borderRadius: 16, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule },
  noteLabel: { fontFamily: font.bodySemi, fontSize: 13, color: colour.green },
  noteText: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 23, color: colour.ink },
  callNote: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel, textAlign: 'center' },
});
