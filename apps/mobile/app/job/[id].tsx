import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { Button, Hero, Loading, Notice, NotifyCard, SystemBars, useScrollEnd } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { useLists } from '../../src/lists';
import { useNotify } from '../../src/notifications';
import { JobCard, type Job } from '../../src/customer/JobCard';
import { supabase } from '../../src/supabase';
import { Trouble } from '../../src/components/Trouble';
import { noAnswer, type NoAnswer } from '../../src/net';
import { colour, font, radius, shadow } from '../../src/theme';

/**
 * One job, live — the screen inDrive shows once a ride is requested.
 *
 * Posting a job lands here. While it is open the top of the screen is the
 * search: the Pechkas screw turning inside rings going out, and a plain
 * sentence of what is happening. Offers arrive underneath as cards, each
 * with its own time left and a button to choose that technician. Once one
 * is chosen the same screen follows the visit to the end, so a customer
 * never has to look for where her job went.
 *
 * Nothing here decides anything: the job, its offers and every action come
 * from the same database functions as before (my_jobs, job_offers,
 * choose_offer, cancel_job). Asked again every 5 seconds while it is open
 * and the screen is in front, every 10 once a technician is chosen, and not
 * at all once the customer leaves.
 */

const OPEN_EVERY = 5000;
const LATER_EVERY = 10000;

export default function LiveJob() {
  const end = useScrollEnd(32);
  const { id, asked } = useLocalSearchParams<{ id: string; asked?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<NoAnswer | null>(null);
  const [tick, setTick] = useState(0);
  const open = job?.status === 'open';
  const { notify, ask: askNotify } = useNotify(Boolean(open));

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    const { data, error } = await supabase.rpc('my_jobs');
    if (error) {
      setTrouble(noAnswer());
      return setProblem('This job could not be loaded. Check your signal; it tries again by itself.');
    }
    setTrouble(null);
    setProblem(null);
    setJob(((data as Job[]) ?? []).find((j) => j.id === id) ?? null);
    setTick((n) => n + 1);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      load();
      const t = setInterval(load, open ? OPEN_EVERY : LATER_EVERY);
      return () => clearInterval(t);
    }, [session, load, open]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (account?.role === 'pro') return <Redirect href="/pro" />;
  if (job === undefined && trouble) {
    // Never loaded: the full card under the screen's own header, with Back.
    return (
      <View style={{ flex: 1, backgroundColor: colour.canvas }}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={{ paddingBottom: end }}>
          <Hero title="Your job" back={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View style={{ paddingHorizontal: 20 }}>
            <Trouble kind={trouble} onRetry={load} />
          </View>
        </ScrollView>
        <SystemBars bg={colour.canvas} />
      </View>
    );
  }
  if (job === undefined) return <Loading />;

  if (job === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colour.canvas }}>
        <StatusBar style="dark" />
        <Hero title="Job not found" sub="It may have been removed, or it belongs to another account." back />
        <View style={{ padding: 20 }}>
          <Button label="See my jobs" onPress={() => router.replace('/jobs')} />
        </View>
      </View>
    );
  }

  const trade = lists?.trades.find((t) => t.slug === job.trade)?.name ?? job.trade;
  const offers = job.live_offers;
  const head = headline(job);

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: end }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Hero title={head.title} sub={head.sub} back={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ paddingHorizontal: 14, gap: 14 }}>
          {open ? (
            <>
              <Searching
                found={offers}
                line={
                  job.preferred
                    ? `Sent to ${job.preferred.first_name} first. The card below says until when.`
                    : job.asked_for
                      ? `Posted ${ago(job.created_at)}. It has gone to every checked technician who does this work.`
                      : asked
                        ? `${asked} is not taking jobs right now, so it went to every checked technician who does this work.`
                        : `Posted ${ago(job.created_at)}. Checked technicians who do this work can see it.`
                }
              />
            </>
          ) : null}

          {open && notify === 'ask' ? (
            <NotifyCard
              title="Know when offers arrive"
              text="Your phone tells you the moment a technician sends an offer, so you do not have to keep this screen open."
              action="Turn on notifications"
              onPress={askNotify}
            />
          ) : null}
          {open && notify === 'off' ? (
            <NotifyCard
              title="Notifications are off"
              text="You will only see offers while this screen is open. To be told straight away, turn on Pechkas notifications in your phone's settings."
              action="Open settings"
              onPress={() => Linking.openSettings()}
            />
          ) : null}

          <Notice text={problem} />
          <JobCard job={job} trade={trade} tick={tick} onChanged={load} />
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

/** What the top of the screen says, from the job's own state. Nothing guessed. */
function headline(job: Job): { title: string; sub?: string } {
  if (job.status === 'open') {
    if (job.live_offers > 0) {
      return {
        title: 'Choose your technician',
        sub: `${job.live_offers} ${job.live_offers === 1 ? 'offer' : 'offers'} so far. More may still come.`,
      };
    }
    // Told once that nobody has offered (when_nobody_offers): say so, plainly, at the top.
    if (job.nudged) return { title: 'No offers yet', sub: 'Still looking. You can raise your price or choose another day.' };
    return { title: 'Finding a technician', sub: 'Offers appear here the moment one is sent.' };
  }
  if (job.status === 'assigned') return { title: job.pro ? `${job.pro.first_name} is your technician` : 'Technician chosen' };
  if (job.status === 'done') return { title: 'Job done' };
  if (job.status === 'stopped') return { title: 'Stopped at the door' };
  if (job.cancelled_by === 'nobody') return { title: 'Closed', sub: 'No technician was free for this job. Book it again for another day.' };
  return { title: 'Cancelled' };
}

/** "just now", "4 min ago", "2 hours ago". From the job's own time. */
function ago(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
}

/**
 * The search, inDrive's way: one compact white card. On the left the screw
 * turning inside a round radar, its rings growing out to the radar's own
 * edge — a circle inside a circle, so no corner ever cuts a ring in half.
 * Beside it what is happening and who can see the job. Along the foot a
 * thin bar runs, the way a ride app shows it is still searching.
 *
 * Rings and bar carry no words and only move by transform, never fade,
 * like every other movement in the app. With "remove animations" on they
 * stand still, and the words still say what is happening.
 */
function Searching({ found, line }: { found: number; line: string }) {
  const rings = useRef([0, 1].map(() => new Animated.Value(0))).current;
  const run = useRef(new Animated.Value(0)).current;
  const [track, setTrack] = useState(0);
  // On a narrow phone the radar gives the words more room.
  const d = useWindowDimensions().width < 360 ? 64 : 84;

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (!alive || still) {
          rings.forEach((r, i) => r.setValue((i + 1) / 2));
          return;
        }
        loops = [
          ...rings.map((r, i) =>
            Animated.loop(
              Animated.sequence([
                Animated.delay(i * 1200),
                Animated.timing(r, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
              ]),
            ),
          ),
          Animated.loop(
            Animated.sequence([
              Animated.timing(run, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
              Animated.timing(run, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]),
          ),
        ];
        loops.forEach((l) => l.start());
      });
    return () => {
      alive = false;
      loops.forEach((l) => l.stop());
    };
  }, [rings, run]);

  const title = found ? 'Offers are arriving' : 'Looking for a technician';
  const bar = track * 0.3;

  return (
    <View style={s.search} accessibilityRole="progressbar" accessibilityLabel={title}>
      <View style={s.searchRow}>
        <View style={[s.radar, { width: d, height: d, borderRadius: d / 2 }]}>
          {rings.map((r, i) => (
            <Animated.View
              key={i}
              style={[s.ring, { width: d, height: d, borderRadius: d / 2, transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}
            />
          ))}
          <ScrewSpinner size={d === 64 ? 36 : 44} label={title} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.searchTitle}>{title}</Text>
          <Text style={s.note}>{line}</Text>
        </View>
      </View>
      <View style={s.track} onLayout={(e) => setTrack(e.nativeEvent.layout.width)}>
        {track ? (
          <Animated.View
            style={[
              s.runner,
              { width: bar, transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-bar, track] }) }] },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  search: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radar: { backgroundColor: colour.canvas, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(11, 81, 72, 0.22)' },
  searchTitle: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colour.canvas, overflow: 'hidden' },
  runner: { height: 4, borderRadius: radius.pill, backgroundColor: colour.yellow },
});
