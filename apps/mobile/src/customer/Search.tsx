import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { rupees } from '@pechkas/shared';
import { MapBox, Pin, type Point } from '../components/Map';
import { DuoIcon } from '../components/DuoIcon';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Sheet } from '../components/Sheet';
import { Notice } from '../components/ui';
import { ask } from '../supabase';
import { colour, font, shadow } from '../theme';

/**
 * Waiting for offers (the owner's design, 25 November 2026; job_search() in
 * migration jobs_near_him). Her map with soft waves of colour rising from
 * her home and a soft area that grows slowly as the search reaches further;
 * the countdown until it covers all of Islamabad, the bar emptying with it;
 * how many technicians have looked, with their first letters (never a name,
 * a face or a place); the automatic choice, off by default; and, when the
 * search has reached everyone, "Still looking?" once.
 *
 * Every number here comes from the database: the reach, when it is full,
 * who has looked. The area on the map is drawn to the share of the search
 * done, not to scale; the words say the real distance. Nothing moves but by
 * transform, and nothing that moves carries words.
 */

export type JobSearch = {
  reach_m: number;
  start_m: number;
  full_m: number;
  full: boolean;
  announced_at: string;
  full_at: string;
  seen: number;
  letters: string[];
  auto_choose: boolean;
  price_paisa: number;
  has_pin: boolean;
};

const H = 300;

export function SearchMap({ at, search }: { at: Point | null; search: JobSearch | null }) {
  const waves = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((s) => {
        if (!alive) return;
        if (s) {
          setStill(true);
          waves.forEach((v, i) => v.setValue((i + 1) / 4));
          return;
        }
        // Slow and even: one wave every 1.4 s, each taking 4.2 s to spread.
        loops = waves.map((v, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.delay(i * 1400),
              Animated.timing(v, { toValue: 1, duration: 4200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]),
          ),
        );
        loops.forEach((l) => l.start());
      });
    return () => {
      alive = false;
      loops.forEach((l) => l.stop());
    };
  }, [waves]);

  // The soft area: the share of the search done, from a small circle to past the edges.
  const share = search ? Math.min(1, Math.max(0, (search.reach_m - search.start_m) / Math.max(1, search.full_m - search.start_m))) : 0;
  const area = 140 + share * 460;
  const km = search ? Math.max(1, Math.round(search.reach_m / 1000)) : null;
  // A wave is bigger than the box, so it has left the map before it starts again.
  const W = 760;

  return (
    <View style={s.map}>
      <MapBox center={at ?? { latitude: 33.6844, longitude: 73.0479 }} zoom={0.06} style={StyleSheet.absoluteFill} />
      <View style={s.centre} pointerEvents="none">
        <Svg width={area} height={area} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="area" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colour.yellow} stopOpacity={0.12} />
              <Stop offset="0.75" stopColor={colour.yellow} stopOpacity={0.08} />
              <Stop offset="1" stopColor={colour.yellow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={area / 2} cy={area / 2} r={area / 2} fill="url(#area)" />
        </Svg>
        {still
          ? null
          : waves.map((v, i) => (
              <Animated.View
                key={i}
                style={{ position: 'absolute', width: W, height: W, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.06, 1] }) }] }}
              >
                <Svg width={W} height={W}>
                  <Defs>
                    <RadialGradient id={`wave${i}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0.38" stopColor={colour.yellow} stopOpacity={0} />
                      <Stop offset="0.6" stopColor="#ffb31e" stopOpacity={0.16} />
                      <Stop offset="0.72" stopColor={colour.yellow} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={W / 2} cy={W / 2} r={W / 2} fill={`url(#wave${i})`} />
                </Svg>
              </Animated.View>
            ))}
        <View style={{ marginBottom: 46 }}>
          <Pin />
        </View>
      </View>
      {km !== null ? (
        <View style={s.chip} pointerEvents="none">
          <Icon name="search" size={16} color={colour.ink} strokeWidth={2.2} />
          <Text style={s.chipText}>{search?.full ? 'Searching all of Islamabad' : `Searching within ${km} km`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The card under the map: what is happening, the countdown, who has looked, and the automatic choice. */
export function SearchCard({ job, search, offers, onChanged }: { job: string; search: JobSearch | null; offers: number; onChanged: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!search) return null;

  const start = new Date(search.announced_at).getTime();
  const end = new Date(search.full_at).getTime();
  const left = Math.max(0, Math.round((end - now) / 1000));
  const bar = Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start)));
  const full = search.full || left === 0;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  async function auto(on: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await ask('set_auto_choose', { p_job: job, p_on: on });
    setBusy(false);
    if (!r.ok) setMsg(r.why);
    onChanged();
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{full ? 'Reaching every technician' : 'Searching near you'}</Text>
          <Text style={s.sub}>{full ? 'All of Islamabad can see your job now.' : 'Technicians near you first, then further out.'}</Text>
        </View>
        {full ? null : (
          <Text style={s.clock} accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds until all of Islamabad`}>
            {clock}
          </Text>
        )}
      </View>
      {full ? null : (
        <View style={s.track} accessible={false}>
          <View style={[s.fill, { transform: [{ scaleX: bar }] }]} />
        </View>
      )}

      <View style={s.seen}>
        <View style={{ flex: 1 }}>
          <Text style={s.seenText}>
            {search.seen
              ? `${search.seen} ${search.seen === 1 ? 'technician has' : 'technicians have'} seen your job`
              : 'Technicians are being told about your job'}
          </Text>
          {offers ? null : search.seen >= 3 ? <Text style={s.hint}>Nobody has offered yet at {rupees(search.price_paisa)}.</Text> : null}
        </View>
        {search.letters.length ? (
          <View style={s.letters} accessible={false}>
            {search.letters.map((l, i) => (
              <View key={i} style={[s.letter, i > 0 && { marginLeft: -9 }, { backgroundColor: [colour.ink, colour.green, colour.onYellow, colour.ink][i % 4] }]}>
                <Text style={s.letterText}>{l}</Text>
              </View>
            ))}
            {search.seen > search.letters.length ? (
              <View style={[s.letter, s.more, { marginLeft: -9 }]}>
                <Text style={[s.letterText, { color: colour.ink }]}>+{search.seen - search.letters.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {full && !offers ? (
        <View style={s.quiet}>
          <DuoIcon name="bell" size={22} />
          <Text style={s.quietText}>You don’t have to wait here. Your phone tells you the moment a technician offers. Your job stays open until 10pm.</Text>
        </View>
      ) : null}

      <Press
        onPress={busy ? undefined : () => auto(!search.auto_choose)}
        accessibilityRole="switch"
        accessibilityState={{ checked: search.auto_choose, busy }}
        accessibilityLabel={`Automatically choose the first technician who accepts ${rupees(search.price_paisa)}`}
        sink={0.98}
        style={s.auto}
      >
        <View style={s.autoTile}>
          <DuoIcon name="star" size={22} />
        </View>
        <Text style={s.autoText}>Automatically choose the first technician who accepts {rupees(search.price_paisa)}</Text>
        {/* Colours snap; only the knob moves, by transform. */}
        <View style={[s.switch, search.auto_choose && s.switchOn]}>
          <View style={[s.knob, { transform: [{ translateX: search.auto_choose ? 20 : 0 }] }]} />
        </View>
      </Press>
      <Notice text={msg} inline />

      {/* Once the search has reached everyone with nobody offering: asked once, plainly. */}
      {full && !offers && search.seen >= 1 && !asked ? (
        <Sheet onClose={() => setAsked(true)}>
          <View style={{ gap: 12, paddingBottom: 6 }}>
            <View style={s.sheetHead}>
              <View style={s.sheetTile}>
                <DuoIcon name="search" size={28} />
              </View>
              <Text style={s.sheetTitle}>Still looking for a technician?</Text>
            </View>
            <Text style={s.sheetText}>
              {search.seen} {search.seen === 1 ? 'technician has' : 'technicians have'} seen your job at {rupees(search.price_paisa)}. Nobody has offered yet. You
              can keep waiting, or raise your price below.
            </Text>
            <Press onPress={() => setAsked(true)} accessibilityRole="button" sink={0.97} style={s.keep}>
              <Text style={s.keepText}>Keep looking</Text>
            </Press>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  map: { height: H, borderRadius: 24, overflow: 'hidden', backgroundColor: colour.tile },
  centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', alignSelf: 'center', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colour.white, boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.14)' },
  chipText: { fontFamily: font.display, fontSize: 13, color: colour.ink },
  card: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  clock: { fontFamily: font.display, fontSize: 22, color: colour.ink, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: colour.rule, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', backgroundColor: colour.ink, transformOrigin: 'left' },
  seen: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  seenText: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.ink },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  letters: { flexDirection: 'row' },
  letter: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  more: { backgroundColor: colour.white, minWidth: 34, width: undefined, paddingHorizontal: 4 },
  letterText: { fontFamily: font.display, fontSize: 12, color: colour.yellow },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
  quietText: { flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 10, borderRadius: 18, backgroundColor: colour.canvas },
  autoTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  autoText: { flex: 1, fontFamily: font.bodySemi, fontSize: 13.5, lineHeight: 19, color: colour.ink },
  switch: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: '#c9cdd0' },
  switchOn: { backgroundColor: colour.green },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.white },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontFamily: font.display, fontSize: 21, lineHeight: 26, color: colour.ink },
  sheetText: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.steel },
  keep: { minHeight: 54, borderRadius: 16, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  keepText: { fontFamily: font.display, fontSize: 16, color: colour.ink },
});

