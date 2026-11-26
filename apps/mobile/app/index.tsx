import { useCallback, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { rupees } from '@pechkas/shared';
import { WORK_THINGS } from '@pechkas/shared/src/work';
import { Icon } from '../src/components/Icon';
import { MenuButton } from '../src/components/Menu';
import { Press } from '../src/components/Press';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { Rise, useRises } from '../src/components/Rise';
import { pictureOf, WorkArt } from '../src/components/WorkArt';
import { SystemBars, useArrive } from '../src/components/ui';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { supabase } from '../src/supabase';
import { colour, font, glow, GLOW_STOPS, shadow } from '../src/theme';

/**
 * The customer's home (the owner's choice, 24 November 2026): only what
 * matters, and each thing once.
 *
 *  - The yellow top, as the sign-in pictures: the greeting, "What needs
 *    fixing?" on one big line with no picture beside it (the owner's
 *    choice, A122: professional apps put nothing there, and the pictures
 *    in the work tiles carry the look), and the search box — a tap opens
 *    Search (app/find.tsx).
 *  - Any job still happening, on top until it is over: a tap opens it.
 *  - Every kind of work, with the things it covers under its name, so
 *    somebody who does not know the trade still finds the geyser under
 *    Plumber. A tap opens that kind of work's page (app/work/[trade].tsx).
 *    The first three in the trades' own order are big; that is the list's
 *    order, never a claim about what is popular.
 *  - For somebody whose first job is not finished yet, how Pechkas works,
 *    in three lines. Then one line saying where the rest is: the menu.
 *
 * Nothing else, on purpose. The address is asked on Post a job, on its own
 * map; voice notes and videos are on Post a job; finished jobs are My jobs;
 * why Pechkas is on the welcome pages. Each of those was on home as well
 * once, as a second way to the same place.
 */

type Live = {
  id: string;
  ref: string;
  title: string;
  trade: string;
  status: string;
  live_offers: number;
  offered_paisa: number;
  paid_by_pechkas?: boolean;
  job_type_id?: number | null;
  stage: 'chosen' | 'on_way' | 'arrived' | 'working' | 'checking' | 'disputed' | null;
  pro: { first_name: string } | null;
};

const LIVE_EVERY = 10000;
const isLive = (j: Live) => j.status === 'open' || j.status === 'assigned';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const lists = useLists();
  const { width } = useWindowDimensions();
  const [jobs, setJobs] = useState<Live[] | null>(null);
  const live = (jobs ?? []).filter(isLive);
  // Shown until her first job is finished: by then she knows how it works.
  const newHere = jobs !== null && !jobs.some((j) => j.status === 'done');
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const [top, setTop] = useState({ w: 0, h: 0 });

  useFocusEffect(
    useCallback(() => {
      if (!supabase || account?.role !== 'customer') return;
      let alive = true;
      const load = () =>
        supabase?.rpc('my_jobs').then(({ data }) => {
          if (alive && Array.isArray(data)) setJobs(data as Live[]);
        });
      load();
      // Offers arrive while she is looking at home, as they do on inDrive's.
      const t = setInterval(load, LIVE_EVERY);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }, [account?.role]),
  );

  const trades = lists?.trades ?? [];
  const rises = useRises(trades.length);

  if (account?.role === 'pro') return <Redirect href="/pro" />;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const narrow = width < 360;
  // Two cards across, whatever the phone: the page's sides and the gap come off first.
  const cell = Math.floor((width - 32 - 10) / 2);
  const open = (slug: string) => router.push({ pathname: '/work/[trade]', params: { trade: slug } });
  const [first, second, third, ...rest] = trades;

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }} showsVerticalScrollIndicator={false}>
        {/* The yellow top: who this is for, the one question, and search. */}
        <View style={[s.top, { paddingTop: insets.top + 8 }]} onLayout={(e) => setTop({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {top.w > 0 ? <Glow width={top.w} height={top.h} /> : null}
          <MenuButton />
          <View style={s.hero}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.hello} numberOfLines={2}>
                {greeting}
                {account?.first_name ? `, ${account.first_name}` : ''}
              </Text>
              <Text style={[s.ask, narrow && s.askNarrow]} accessibilityRole="header">
                What needs fixing?
              </Text>
            </View>
          </View>
          <Press onPress={() => router.push('/find')} accessibilityRole="search" accessibilityLabel="Search for the job" sink={0.98} style={s.search}>
            <Icon name="search" size={20} color={colour.steel} strokeWidth={2.2} />
            <Text style={s.searchText} numberOfLines={1}>
              Search: geyser, fan, leak…
            </Text>
          </Press>
        </View>

        <Animated.View style={{ paddingHorizontal: 16, paddingTop: 16, transform: [{ translateY: rise }] }}>
          {live.length ? (
            <View style={{ gap: 10, marginBottom: 6 }}>
              {live.map((j) => (
                <LiveCard key={j.id} job={j} jobName={lists?.job_types.find((t) => t.id === j.job_type_id)?.name} tradeName={trades.find((t) => t.slug === j.trade)?.name ?? j.trade} narrow={narrow} />
              ))}
            </View>
          ) : null}

          <Text style={s.h2} accessibilityRole="header">
            Choose the work
          </Text>
          {!trades.length ? (
            <View style={s.waiting}>
              <ScrewSpinner size={32} label="Loading the kinds of work" />
            </View>
          ) : (
            <>
              <View style={s.bento}>
                {first ? (
                  <Rise v={rises[0]} style={{ flex: 1 }}>
                    <Big trade={first} tall onPress={() => open(first.slug)} narrow={narrow} />
                  </Rise>
                ) : null}
                <View style={{ flex: 1, gap: 10 }}>
                  {[second, third].map((t, i) =>
                    t ? (
                      <Rise key={t.slug} v={rises[i + 1]}>
                        <Big trade={t} onPress={() => open(t.slug)} narrow={narrow} />
                      </Rise>
                    ) : null,
                  )}
                </View>
              </View>
              {rest.length ? (
                <Text style={[s.h2, { marginTop: 22 }]} accessibilityRole="header">
                  More work
                </Text>
              ) : null}
              <View style={s.grid}>
                {rest.map((t, i) => (
                  <Rise key={t.slug} v={rises[i + 3]} style={{ width: cell }}>
                    <Tile trade={t} onPress={() => open(t.slug)} narrow={narrow} />
                  </Rise>
                ))}
              </View>
            </>
          )}

          {newHere ? <HowItWorks /> : null}
          <Text style={s.foot}>My jobs, Help and Safety are in the menu ☰</Text>
        </Animated.View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

/** The yellow of the top: lit behind the house, deeper at the edges, as the sign-in pictures are. */
function Glow({ width, height }: { width: number; height: number }) {
  const cx = width * 0.72;
  const cy = height * 0.3;
  const r = Math.max(height, 1);
  const sx = (width * 0.9) / r;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="home-glow" cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(${sx} 1) translate(${-cx} ${-cy})`}>
          {GLOW_STOPS.map((o, i) => (
            <Stop key={o} offset={o} stopColor={glow.yellow[i]} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#home-glow)" />
    </Svg>
  );
}

type Trade = { slug: string; name: string };

/** The first three: AC tall and yellow, the next two white beside it. */
function Big({ trade, tall = false, onPress, narrow }: { trade: Trade; tall?: boolean; onPress: () => void; narrow: boolean }) {
  const things = WORK_THINGS[trade.slug];
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${trade.name}. ${things ?? ''}`} sink={0.97} style={[s.big, tall ? s.bigTall : s.bigShort]}>
      {tall ? <TileGlow /> : null}
      <Text style={[s.bigName, tall && s.bigNameTall, narrow && s.bigNameNarrow]} numberOfLines={1}>
        {trade.name}
      </Text>
      {things ? <Text style={[s.things, tall && s.thingsTall, { maxWidth: tall ? '92%' : '56%' }]}>{things}</Text> : null}
      <View style={[s.bigArt, tall && s.bigArtTall]}>
        <WorkArt art={trade.slug} size={tall ? (narrow ? 96 : 118) : narrow ? 42 : 52} picture={tall ? (narrow ? 118 : 146) : narrow ? 58 : 68} />
      </View>
    </Press>
  );
}

/** The tall tile's own yellow, drawn so it needs no measuring: a light from the top corner. */
function TileGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <RadialGradient id="tile-glow" cx="60" cy="40" r="140" fx="60" fy="40" gradientUnits="userSpaceOnUse">
          {GLOW_STOPS.map((o, i) => (
            <Stop key={o} offset={o} stopColor={glow.yellow[i]} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={200} fill="url(#tile-glow)" />
    </Svg>
  );
}

/** Every other kind of work: a white card, its drawing on a yellow disc, its name and what it covers. */
function Tile({ trade, onPress, narrow }: { trade: Trade; onPress: () => void; narrow: boolean }) {
  const things = WORK_THINGS[trade.slug];
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${trade.name}. ${things ?? ''}`} sink={0.97} style={[s.tile, s.tileNarrow]}>
      <WorkArt art={trade.slug} size={narrow ? 30 : 36} picture={narrow ? 56 : 62} />
      <View>
        <Text style={[s.tileName, narrow && { fontSize: 14 }]}>{trade.name}</Text>
        {things ? <Text style={s.tileThings}>{things}</Text> : null}
      </View>
    </Press>
  );
}

/** For a new customer: the whole of Pechkas in three lines, on green — trust — so it is never mistaken for a tile. */
function HowItWorks() {
  const steps: [string, string][] = [
    ['Say what is wrong, name your price', 'A voice note, a video, a photo or words.'],
    ['Checked technicians offer', 'Each says his price and when he will come. You choose.'],
    ['Pay him when it is done', 'Cash to him, once the work is finished.'],
  ];
  return (
    <View style={s.how}>
      <Text style={s.howTitle} accessibilityRole="header">
        How Pechkas works
      </Text>
      {steps.map(([a, b], i) => (
        <View key={a} style={s.step}>
          <View style={s.stepNo}>
            <Text style={s.stepNoText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>{a}</Text>
            <Text style={s.stepText}>{b}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A job still happening, on top of home. Its yellow bar says what she has to
 * do, or where he has got to — read from the job's own status and step,
 * nothing estimated. The whole card opens the job.
 */
function LiveCard({ job, jobName, tradeName, narrow }: { job: Live; jobName?: string; tradeName: string; narrow: boolean }) {
  const name = job.pro?.first_name;
  const offers = job.live_offers;
  const line =
    job.status === 'open'
      ? offers
        ? `${offers} ${offers === 1 ? 'offer' : 'offers'} · Choose ${narrow ? 'one' : 'a technician'}`
        : 'Finding a technician'
      : !name
        ? 'Technician chosen'
        : job.stage === 'on_way'
          ? `${name} is on his way`
          : job.stage === 'arrived'
            ? `${name} has arrived`
            : job.stage === 'working'
              ? `${name} is working on it`
              : job.stage === 'checking'
                ? `Check ${name}’s work`
                : job.stage === 'disputed'
                  ? 'Pechkas is looking at it'
                  : `${name} is your technician`;
  const price = job.paid_by_pechkas ? 'Free' : rupees(job.offered_paisa);
  // Yellow when there is something for her to do; quiet otherwise.
  const act = (job.status === 'open' && offers > 0) || job.stage === 'checking';
  return (
    <Press onPress={() => router.push(`/job/${job.id}`)} accessibilityRole="button" accessibilityLabel={`${line}. ${job.title}`} sink={0.98} style={s.live}>
      <View style={s.liveHead}>
        <View style={s.liveArt}>
          <WorkArt art={job.trade} source={pictureOf(job.trade, jobName)} size={36} picture={50} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.liveSmall} numberOfLines={1}>
            {narrow ? `${job.ref} · ${price}` : `Your job · ${tradeName} · ${job.ref}`}
          </Text>
          <Text style={s.liveTitle} numberOfLines={narrow ? 2 : 1}>
            {job.title}
          </Text>
        </View>
        {/* On a small phone the price moves into the line above, so the title keeps its words. */}
        {narrow ? null : <Text style={s.livePrice}>{price}</Text>}
      </View>
      <View style={[s.liveBar, act ? s.liveBarAct : s.liveBarQuiet]}>
        {job.status === 'open' && !offers ? <ScrewSpinner size={20} label={line} /> : null}
        <Text style={s.liveBarText} numberOfLines={1}>
          {line}
        </Text>
        <Icon name="arrowRight" size={18} color={colour.ink} strokeWidth={2.4} />
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  top: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', backgroundColor: colour.yellow },
  hero: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 8, marginTop: 4 },
  hello: { fontFamily: font.bodySemi, fontSize: 15, color: colour.onYellow },
  ask: { fontFamily: font.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9, color: colour.ink, marginTop: 2 },
  askNarrow: { fontSize: 30, lineHeight: 34 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, marginTop: 14, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 8px 22px rgba(60, 40, 0, 0.16)' },
  searchText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 16, color: colour.steel },

  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, marginTop: 10, marginBottom: 12, marginLeft: 4 },
  waiting: { alignItems: 'center', paddingVertical: 40 },
  bento: { flexDirection: 'row', gap: 10 },
  big: { borderRadius: 24, padding: 14, overflow: 'hidden', backgroundColor: colour.white, boxShadow: shadow.card },
  bigTall: { minHeight: 236, flex: 1, backgroundColor: colour.yellow },
  bigShort: { minHeight: 113 },
  bigName: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  bigNameTall: { fontSize: 22 },
  bigNameNarrow: { fontSize: 16 },
  bigArt: { position: 'absolute', right: 8, bottom: 8 },
  bigArtTall: { right: 2, bottom: 4 },
  things: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: colour.steel, marginTop: 2 },
  thingsTall: { color: colour.onYellow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 84, borderRadius: 22, backgroundColor: colour.white, padding: 12, boxShadow: shadow.card },
  // A small phone's card is about 140 points wide: the picture goes above the words, which keep every letter.
  tileNarrow: { flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 8 },
  tileArt: { width: 54, height: 54, borderRadius: 27, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  tileArtNarrow: { width: 44, height: 44, borderRadius: 22 },
  tileName: { fontFamily: font.display, fontSize: 15, lineHeight: 19, color: colour.ink },
  tileThings: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: colour.steel, marginTop: 2 },

  live: { borderRadius: 20, backgroundColor: colour.white, borderWidth: 2, borderColor: colour.ink, padding: 14, gap: 12 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveArt: { width: 52, height: 52, borderRadius: 15, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  liveSmall: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  liveTitle: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  livePrice: { fontFamily: font.display, fontSize: 15, color: colour.ink, fontVariant: ['tabular-nums'] },
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 14, paddingHorizontal: 14 },
  liveBarAct: { backgroundColor: colour.yellow },
  liveBarQuiet: { backgroundColor: colour.canvas },
  liveBarText: { flex: 1, fontFamily: font.display, fontSize: 15, color: colour.ink },

  how: { marginTop: 22, borderRadius: 26, backgroundColor: colour.green, padding: 18, paddingTop: 16, gap: 14 },
  howTitle: { fontFamily: font.display, fontSize: 19, color: colour.white },
  step: { flexDirection: 'row', gap: 12 },
  stepNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontFamily: font.display, fontSize: 14, color: colour.ink },
  stepTitle: { fontFamily: font.display, fontSize: 15.5, color: colour.white },
  stepText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.greenSoft, marginTop: 1 },
  foot: { fontFamily: font.bodyMedium, fontSize: 13, color: colour.steel, textAlign: 'center', marginTop: 22 },
});
