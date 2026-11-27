import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { rupees } from '@pechkas/shared';
import { MapBox, type Point } from '../components/Map';
import { ScrewDot } from '../components/MapMarks';
import { DuoIcon } from '../components/DuoIcon';
import { TradeTile } from './bits';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Sheet } from '../components/Sheet';
import { Button, Notice, SystemBars, useScrollEnd } from '../components/ui';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask, supabase } from '../supabase';
import { colour, font, shadow } from '../theme';
import type { Job, Offer } from './JobCard';
import type { JobSearch } from './Search';

/**
 * Waiting for a technician, choosing one (the owner's approved mocks, 25
 * November 2026, sheet 2 "Waiting, choosing, and him arriving").
 *
 * The map fills the top of the screen with soft waves of colour from her
 * home and the technicians near her as briefcase dots (job_search().near,
 * rounded points, never a name); "× Cancel job" on the map; "Searching
 * within 4 km" at its foot; how many technicians are looking with their
 * first letters; then a white sheet: "Finding a technician" with the
 * countdown and its bar, her price with − and + to raise it (Rs 200, 500,
 * 1,000, the database's steps), the usual price, the raises left, "Raise
 * my price", and the automatic choice. At the end of the first countdown
 * "Still looking?" asks once; the search then reaches all of Islamabad with
 * a second countdown, at whose end "No offer yet. You don't have to wait
 * here." An offer drops in from the top with See, which opens "Choose a
 * technician".
 *
 * Every figure is the database's: reach, counts, letters, prices, raises.
 * Only transform moves; nothing that moves carries words.
 */

export type Search = JobSearch & {
  near?: { lat: number; lng: number }[];
  near_count?: number;
  near_letters?: string[];
  nudge_at?: string;
  usual_paisa?: number | null;
  raises_left?: number;
  can_raise?: boolean;
};

const STEPS = [20000, 50000, 100000];
const DISC = [colour.ink, colour.green, colour.yellow, colour.ink];

type Extra = { offer_id: string; eta_seconds: number | null; route_m: number | null; distance_m: number | null };

const minutes = (secs: number | null | undefined) => (secs === null || secs === undefined ? null : Math.max(1, Math.round(secs / 60)));
const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The offers on her job, and how far each technician is, nearest first. Shared by the banner and Choose. */
export function useOffers(job: Job, tick: number) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [far, setFar] = useState<Record<string, Extra>>({});
  useEffect(() => {
    if (!job.live_offers) {
      setOffers([]);
      return;
    }
    supabase?.rpc('job_offers', { p_job: job.id }).then(({ data }) => setOffers((data as Offer[]) ?? []));
    supabase?.rpc('offer_extras', { p_job: job.id }).then(({ data, error }) => {
      if (error || !Array.isArray(data)) return setFar({});
      setFar(Object.fromEntries((data as Extra[]).map((x) => [x.offer_id, x])));
    });
  }, [job.id, job.live_offers, tick]);
  const rank = (id: string) => far[id]?.eta_seconds ?? (far[id]?.distance_m ?? 1e9) / 10;
  return { offers: [...offers].sort((a, b) => rank(a.id) - rank(b.id)), far, setOffers };
}

/** The whole waiting screen. */
export function WaitingView({ job, search, tick, onChanged, notify, askNotify }: {
  job: Job;
  search: Search;
  tick: number;
  onChanged: () => void;
  notify: string | null;
  askNotify: () => void;
}) {
  const insets = useSafeAreaInsets();
  const end = useScrollEnd(24);
  const { height } = useWindowDimensions();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [step, setStep] = useState(0); // 0: no raise; 1–3: +200, +500, +1,000
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [still, setStill] = useState<'none' | 'shown' | 'done'>('none');
  const [nobody, setNobody] = useState<'none' | 'shown' | 'done'>('none');
  const { offers, far } = useOffers(job, tick);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(search.announced_at).getTime();
  const fullAt = new Date(search.full_at).getTime();
  const nudgeAt = search.nudge_at ? new Date(search.nudge_at).getTime() : fullAt + 12 * 60000;
  const wide = search.full || now >= fullAt;
  const until = wide ? nudgeAt : fullAt;
  const from = wide ? fullAt : start;
  const left = Math.max(0, Math.round((until - now) / 1000));
  const bar = Math.max(0, Math.min(1, (until - now) / Math.max(1, until - from)));
  const live = offers.length > 0;

  // The two questions, each asked once, only while nobody has offered.
  // "Still looking?" once the first countdown ends (or on opening between the two); "No offer yet"
  // once the second ends. Opened later than both, only the second is asked.
  useEffect(() => {
    if (live) return;
    const past = now >= nudgeAt || Boolean(job.nudged);
    if (still === 'none') setStill(wide && !past ? 'shown' : wide ? 'done' : 'none');
    else if (past && still === 'done' && nobody === 'none') setNobody('shown');
  }, [live, wide, now, nudgeAt, still, nobody, job.nudged]);

  const price = search.price_paisa;
  const add = step ? STEPS[step - 1] : 0;
  const canRaise = search.can_raise !== false && (search.raises_left ?? 0) > 0;

  async function raise() {
    if (!add) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('raise_price', { p_job: job.id, p_add_paisa: add });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setStep(0);
    toast.show(done(`Technicians are told about your new price, ${rupees(price + add)}.`, 'Price raised'));
    onChanged();
  }
  async function auto(on: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await ask('set_auto_choose', { p_job: job.id, p_on: on });
    setBusy(false);
    if (!r.ok) setMsg(r.why);
    onChanged();
  }

  const at: Point | null = typeof job.lat === 'number' && typeof job.lng === 'number' ? { latitude: job.lat, longitude: job.lng } : null;
  const km = Math.max(1, Math.round(search.reach_m / 1000));
  // Street level, as the mock: the box shows about the search's reach from top to bottom.
  const zoom = Math.min(0.4, Math.max(0.02, (search.reach_m * 1.1) / 111000));
  const mapH = Math.round(Math.min(520, Math.max(300, height * 0.44)));
  const nearCount = search.near_count ?? 0;
  const letters = wide ? search.letters : search.near_letters ?? [];
  const count = wide ? search.seen : nearCount;
  const first = offers[0];

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: end }} bounces={false}>
        <View style={{ height: mapH }}>
          <MapBox center={at ?? { latitude: 33.6844, longitude: 73.0479 }} zoom={zoom} dots={(search.near ?? []).map((n) => ({ latitude: n.lat, longitude: n.lng }))} style={StyleSheet.absoluteFill} />
          <Waves />
          <View style={s.centre} pointerEvents="none">
            <ScrewDot />
          </View>
          <View style={s.chip} pointerEvents="none">
            <Icon name="search" size={16} color={colour.ink} strokeWidth={2.2} />
            <Text style={s.chipText}>{search.full ? 'Searching all of Islamabad' : `Searching within ${km} km`}</Text>
          </View>
          {live && first ? (
            <OfferBanner top={insets.top + 10} offer={first} extra={far[first.id]} price={price} onSee={() => router.push({ pathname: '/job/[id]', params: { id: job.id, view: 'choose' } })} />
          ) : (
            <Press onPress={() => setCancelling(true)} accessibilityRole="button" accessibilityLabel="Cancel job" sink={0.95} style={[s.cancelPill, { top: insets.top + 10 }]}>
              <Text style={s.cancelPillText}>×  Cancel job</Text>
            </Press>
          )}
        </View>

        <View style={s.lookRow}>
          <Text style={s.lookText}>
            {count
              ? wide
                ? `${count} ${count === 1 ? 'technician has' : 'technicians have'} seen your job`
                : `${count} ${count === 1 ? 'technician near you is' : 'technicians near you are'} looking`
              : wide
                ? 'Every technician in Islamabad who does this work is told'
                : 'Technicians near you are being told'}
          </Text>
          {letters.length ? (
            <View style={s.letters} accessible={false}>
              {letters.slice(0, 4).map((l, i) => (
                <View key={i} style={[s.letter, i > 0 && { marginLeft: -8 }, { backgroundColor: DISC[i % 4] }]}>
                  <Text style={[s.letterText, DISC[i % 4] === colour.yellow && { color: colour.ink }]}>{l}</Text>
                </View>
              ))}
              {count > Math.min(4, letters.length) ? (
                <View style={[s.letter, s.more, { marginLeft: -8 }]}>
                  <Text style={[s.letterText, { color: colour.ink }]}>+{count - Math.min(4, letters.length)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{wide ? 'Reaching more technicians' : 'Finding a technician'}</Text>
              <View style={s.subRow}>
                <Icon name={wide ? 'search' : 'pin'} size={14} color={colour.steel} strokeWidth={2.2} />
                <Text style={s.sub}>{wide ? 'All of Islamabad now' : 'Near you first, then wider'}</Text>
              </View>
            </View>
            <Text style={s.clock} accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
              {clockOf(left)}
            </Text>
          </View>
          <View style={s.track} accessible={false}>
            <View style={[s.fill, { transform: [{ scaleX: bar }] }]} />
          </View>

          {search.can_raise !== false ? (
            <>
              <View style={s.stepper}>
                <Press
                  onPress={step ? () => setStep(step - 1) : undefined}
                  accessibilityRole="button"
                  accessibilityLabel="Lower the raise"
                  accessibilityState={{ disabled: !step }}
                  sink={0.9}
                  style={[s.minus, !step && s.off]}
                >
                  <Text style={[s.stepSign, !step && { color: '#c9cdd0' }]}>−</Text>
                </Press>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={s.price} accessibilityLiveRegion="polite">{rupees(price + add)}</Text>
                  {add ? <Text style={s.was}>was {rupees(price)}</Text> : null}
                </View>
                <Press
                  onPress={canRaise && step < STEPS.length ? () => setStep(step + 1) : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={step < STEPS.length ? `Raise by ${rupees(STEPS[step])}` : 'Highest raise'}
                  accessibilityState={{ disabled: !canRaise || step >= STEPS.length }}
                  sink={0.9}
                  style={[s.plus, (!canRaise || step >= STEPS.length) && s.plusOff]}
                >
                  <Text style={s.stepSign}>+</Text>
                </Press>
              </View>
              <View style={s.usualRow}>
                {search.usual_paisa ? (
                  <View style={s.usual}>
                    <DuoIcon name="tag" size={16} />
                    <Text style={s.usualText}>Usual price {rupees(search.usual_paisa)}</Text>
                  </View>
                ) : (
                  <View />
                )}
                <Text style={s.raisesLeft}>
                  {search.raises_left ?? 0} {search.raises_left === 1 ? 'raise' : 'raises'} left
                </Text>
              </View>
              <Press
                onPress={add && !busy ? raise : undefined}
                accessibilityRole="button"
                accessibilityState={{ disabled: !add, busy }}
                sink={0.97}
                style={[s.raise, add ? s.raiseOn : null]}
              >
                <Text style={[s.raiseText, add ? { color: colour.white } : null]}>{add ? `Raise to ${rupees(price + add)}` : 'Raise my price'}</Text>
              </Press>
            </>
          ) : null}

          <Press
            onPress={busy ? undefined : () => auto(!search.auto_choose)}
            accessibilityRole="switch"
            accessibilityState={{ checked: search.auto_choose, busy }}
            accessibilityLabel={`Automatically choose the first technician who accepts ${rupees(price)}`}
            sink={0.98}
            style={s.auto}
          >
            <View style={s.autoTile}>
              <DuoIcon name="star" size={22} />
            </View>
            <Text style={s.autoText}>Automatically choose the first technician who accepts {rupees(price)}</Text>
            {/* Colours snap; only the knob moves, by transform. */}
            <View style={[s.switch, search.auto_choose && s.switchOn]}>
              <View style={[s.knob, { transform: [{ translateX: search.auto_choose ? 20 : 0 }] }]} />
            </View>
          </Press>
          {job.preferred ? <Text style={s.note}>Sent to {job.preferred.first_name} first, until his time runs out; then to everyone.</Text> : null}
          <Notice text={msg} inline />
        </View>
      </ScrollView>
      <SystemBars bg={colour.white} />

      {still === 'shown' && !live && !cancelling ? (
        <Sheet bare onClose={() => setStill('done')}>
          <Ask
            icon="search"
            title="Still looking for a technician?"
            text={
              search.seen
                ? `${search.seen} ${search.seen === 1 ? 'technician near you has' : 'technicians near you have'} seen your job at ${rupees(price)}. Nobody has offered yet.`
                : `Technicians near you were told about your job at ${rupees(price)}. Nobody has offered yet.`
            }
            main="Keep looking, wider"
            onMain={() => setStill('done')}
            second={canRaise ? 'Raise my price first' : null}
            onSecond={() => {
              setStill('done');
              setStep(1);
            }}
            onCancel={() => {
              setStill('done');
              setCancelling(true);
            }}
          />
        </Sheet>
      ) : null}
      {nobody === 'shown' && !live && !cancelling ? (
        <Sheet bare onClose={() => setNobody('done')}>
          <Ask
            icon="bell"
            title="No offer yet. You don’t have to wait here."
            text="Your job stays open until 10pm. Close the app if you like — we tell you the moment a technician offers."
            main="OK, tell me when one offers"
            mainInk
            onMain={() => {
              setNobody('done');
              if (notify === 'ask') askNotify();
            }}
            second={canRaise ? 'Raise my price' : null}
            onSecond={() => {
              setNobody('done');
              setStep(1);
            }}
            onCancel={() => {
              setNobody('done');
              setCancelling(true);
            }}
          />
        </Sheet>
      ) : null}
      {cancelling ? <CancelSheet job={job} onClose={() => setCancelling(false)} onDone={onChanged} /> : null}
    </View>
  );
}

/** Soft waves of colour from her home: carry no words, move by transform only, stand still with "remove animations". */
function Waves() {
  const waves = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((r) => {
        if (!alive) return;
        if (r) return setStill(true);
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
  const W = 640;
  return (
    <View style={[s.centre, { paddingBottom: 0 }]} pointerEvents="none">
      <Svg width={260} height={260} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colour.yellow} stopOpacity={0.28} />
            <Stop offset="1" stopColor={colour.yellow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={130} cy={130} r={130} fill="url(#glow)" />
      </Svg>
      {still
        ? null
        : waves.map((v, i) => (
            <Animated.View key={i} style={{ position: 'absolute', width: W, height: W, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.06, 1] }) }] }}>
              <Svg width={W} height={W}>
                <Defs>
                  <RadialGradient id={`w${i}`} cx="50%" cy="50%" r="50%">
                    <Stop offset="0.38" stopColor={colour.yellow} stopOpacity={0} />
                    <Stop offset="0.6" stopColor={colour.yellow} stopOpacity={0.18} />
                    <Stop offset="0.72" stopColor={colour.yellow} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={W / 2} cy={W / 2} r={W / 2} fill={`url(#w${i})`} />
              </Svg>
            </Animated.View>
          ))}
    </View>
  );
}

/** An offer, dropping in from the top: who, the price, the rating, the minutes, and See. */
function OfferBanner({ top, offer, extra, price, onSee }: { top: number; offer: Offer; extra?: Extra; price: number; onSee: () => void }) {
  const y = useRef(new Animated.Value(-160)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return y.setValue(0);
        Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      });
  }, [y, offer.id]);
  const min = minutes(extra?.eta_seconds);
  const km = extra ? extra.route_m ?? extra.distance_m : null;
  const away = min !== null ? `${min} min away` : km !== null && km !== undefined ? (km < 1000 ? 'less than 1 km away' : `about ${Math.round(km / 1000)} km away`) : null;
  const rating = offer.rating !== null && offer.rating !== undefined ? `★ ${Number(offer.rating).toFixed(1)}` : 'New';
  return (
    <Animated.View style={[s.banner, { top, transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite">
      <View style={s.bannerDisc}>
        <Text style={s.bannerDiscText}>{offer.pro_first_name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.bannerTitle} numberOfLines={2}>
          {offer.price_paisa === price ? `${offer.pro_first_name} accepted your ${rupees(price)}` : `${offer.pro_first_name} offers ${rupees(offer.price_paisa)}`}
        </Text>
        <Text style={s.bannerSub}>{[rating, away].filter(Boolean).join(' · ')}</Text>
      </View>
      <Press onPress={onSee} accessibilityRole="button" accessibilityLabel={`See ${offer.pro_first_name}'s offer`} sink={0.94} style={s.see}>
        <Text style={s.seeText}>See</Text>
      </Press>
    </Animated.View>
  );
}

/** "Still looking?" and "No offer yet": one question, one main answer, the rest under it. */
function Ask({ icon, title, text, main, mainInk = false, onMain, second, onSecond, onCancel }: {
  icon: 'search' | 'bell';
  title: string;
  text: string;
  main: string;
  mainInk?: boolean;
  onMain: () => void;
  second: string | null;
  onSecond: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={{ gap: 12, paddingBottom: 6 }}>
      <View style={s.askHead}>
        <View style={s.askTile}>
          <DuoIcon name={icon} size={26} />
        </View>
        <Text style={s.askTitle}>{title}</Text>
      </View>
      <Text style={s.askText}>{text}</Text>
      <Button kind={mainInk ? 'ink' : 'yellow'} label={main} onPress={onMain} />
      {second ? <Button kind="outline" label={second} onPress={onSecond} /> : null}
      <Press onPress={onCancel} accessibilityRole="button" style={s.cancelLink}>
        <Text style={s.cancelLinkText}>Cancel this job</Text>
      </Press>
    </View>
  );
}

const WHY: { label: string; code: string; words?: string }[] = [
  { label: 'I fixed it myself', code: 'fixed_myself' },
  { label: 'I found someone else', code: 'someone_else' },
  { label: 'It is taking too long', code: 'other', words: 'It took too long' },
  { label: 'The price is too high', code: 'other', words: 'Price too high' },
  { label: 'Something else', code: 'other' },
];

/** Cancelling a job nobody has been chosen for: why, in one tap. Nothing is charged. */
export function CancelSheet({ job, onClose, onDone }: { job: Job; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  // A short phone (320 x 640) must still show both buttons without scrolling.
  const short = useWindowDimensions().height < 720;
  const [why, setWhy] = useState<number | null>(null);
  // "Something else" opens a box for her own words (the database keeps up to 200 letters).
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function cancel() {
    setBusy(true);
    setMsg(null);
    const w = why === null ? null : WHY[why];
    const words = w && !w.words && w.code === 'other' ? own.trim() || null : w?.words ?? null;
    const r = await ask('cancel_job', { p_job: job.id, p_reason: words, p_code: w?.code ?? null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done('Nothing was charged.', 'Your job is cancelled'));
    onClose();
    onDone();
  }
  return (
    <Sheet bare onClose={onClose}>
      <View style={{ gap: short ? 12 : 16, paddingBottom: 6 }}>
        <View style={s.cxHead}>
          <TradeTile trade={job.trade} job={job.title} size={short ? 48 : 56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.cxTitle}>Cancel this job?</Text>
            <Text style={s.cxJob} numberOfLines={2}>{short ? job.title : `${job.title} · ${job.ref}`}</Text>
          </View>
        </View>
        <View style={{ gap: short ? 6 : 8 }}>
          <Text style={s.cxLabel}>Tell us why</Text>
          <View style={s.cxList} accessibilityRole="radiogroup">
            {WHY.map((w, i) => (
              <Press key={w.label} onPress={() => setWhy(why === i ? null : i)} accessibilityRole="radio" accessibilityState={{ selected: why === i }} accessibilityLabel={w.label} sink={0.98} style={[s.cxRow, short && { minHeight: 46 }, i > 0 && s.cxRule, why === i && s.cxRowOn]}>
                <Text style={s.cxRowText}>{w.label}</Text>
                <View style={[s.cxRadio, why === i && s.cxRadioOn]}>{why === i ? <View style={s.cxDot} /> : null}</View>
              </Press>
            ))}
            {why !== null && WHY[why].code === 'other' && !WHY[why].words ? (
              <View style={s.cxOwnWrap}>
                <TextInput
                  value={own}
                  onChangeText={setOwn}
                  placeholder="What happened? (optional)"
                  placeholderTextColor={colour.steel}
                  maxLength={200}
                  multiline
                  accessibilityLabel="What happened? (optional)"
                  style={[s.cxOwn, short && { minHeight: 46, paddingVertical: 8 }]}
                />
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ gap: short ? 8 : 10 }}>
          <Button kind="danger" label="Confirm" onPress={cancel} busy={busy} />
          <Button kind="soft" label="Keep looking" onPress={onClose} />
        </View>
        <Notice text={msg} inline />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  cxHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cxTitle: { fontFamily: font.display, fontSize: 21, lineHeight: 26, color: colour.ink },
  cxJob: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: colour.steel },
  cxLabel: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel },
  cxList: { borderRadius: 18, borderWidth: 1, borderColor: colour.rule, overflow: 'hidden', backgroundColor: colour.white },
  cxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16 },
  cxRule: { borderTopWidth: 1, borderTopColor: colour.rule },
  cxRowOn: { backgroundColor: colour.softYellow },
  cxRowText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  cxRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colour.rule, alignItems: 'center', justifyContent: 'center' },
  cxRadioOn: { borderColor: colour.ink },
  cxDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colour.ink },
  cxOwnWrap: { paddingHorizontal: 12, paddingBottom: 12, backgroundColor: colour.softYellow },
  cxOwn: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colour.rule, backgroundColor: colour.white, fontFamily: font.body, fontSize: 15, lineHeight: 20, color: colour.ink, textAlignVertical: 'top' },
  centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', alignSelf: 'center', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colour.white, boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.14)' },
  chipText: { fontFamily: font.display, fontSize: 13, color: colour.ink },
  cancelPill: { position: 'absolute', left: 14, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.white, justifyContent: 'center', boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.14)' },
  cancelPillText: { fontFamily: font.display, fontSize: 14, color: colour.ink },
  lookRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  lookText: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, lineHeight: 19, color: colour.ink },
  letters: { flexDirection: 'row' },
  letter: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  more: { backgroundColor: colour.white, minWidth: 32, width: undefined, paddingHorizontal: 4 },
  letterText: { fontFamily: font.display, fontSize: 11.5, color: colour.yellow },
  sheet: { gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colour.white, boxShadow: shadow.card, minHeight: 360 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colour.rule },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: font.display, fontSize: 21, color: colour.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  clock: { fontFamily: font.display, fontSize: 22, color: colour.ink, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: colour.rule, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', backgroundColor: colour.ink, transformOrigin: 'left' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 22, backgroundColor: colour.canvas },
  minus: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colour.rule, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  off: { borderColor: colour.rule },
  plus: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  plusOff: { backgroundColor: colour.tile },
  stepSign: { fontFamily: font.display, fontSize: 24, color: colour.ink },
  price: { fontFamily: font.display, fontSize: 28, letterSpacing: -0.4, color: colour.ink },
  was: { fontFamily: font.body, fontSize: 12.5, color: colour.steel },
  usualRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  usual: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colour.canvas },
  usualText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  raisesLeft: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  raise: { minHeight: 54, borderRadius: 18, backgroundColor: colour.tile, alignItems: 'center', justifyContent: 'center' },
  raiseOn: { backgroundColor: colour.ink },
  raiseText: { fontFamily: font.display, fontSize: 16, color: colour.steel },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 10, borderRadius: 18, backgroundColor: colour.canvas },
  autoTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  autoText: { flex: 1, fontFamily: font.bodySemi, fontSize: 13.5, lineHeight: 19, color: colour.ink },
  switch: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: '#c9cdd0' },
  switchOn: { backgroundColor: colour.green },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.white },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  banner: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colour.white, boxShadow: '0px 6px 20px rgba(20, 23, 26, 0.18)' },
  bannerDisc: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  bannerDiscText: { fontFamily: font.display, fontSize: 17, color: colour.yellow },
  bannerTitle: { fontFamily: font.display, fontSize: 15, lineHeight: 20, color: colour.ink },
  bannerSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  see: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  seeText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  askTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  askTitle: { flex: 1, fontFamily: font.display, fontSize: 21, lineHeight: 26, color: colour.ink },
  askText: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.steel },
  cancelLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  cancelLinkText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.brick },
  whys: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  why: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.canvas, justifyContent: 'center' },
  whyOn: { backgroundColor: colour.ink },
  whyText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
});
