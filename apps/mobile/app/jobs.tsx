import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { rupees, whenLabel } from '@pechkas/shared';
import { MenuButton } from '../src/components/Menu';
import { Button, Loading, Notice, NotifyCard, SystemBars, useScrollEnd } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { DuoIcon } from '../src/components/DuoIcon';
import { Press } from '../src/components/Press';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { YellowTop } from '../src/components/YellowTop';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { useNotify } from '../src/notifications';
import { type Job } from '../src/customer/JobCard';
import { SHADOW, SOFT_YELLOW, Steps, TradeTile } from '../src/customer/bits';
import { dayText } from '../src/customer/Calendar';
import { Past } from '../src/customer/Past';
import { supabase } from '../src/supabase';
import { Trouble } from '../src/components/Trouble';
import { noAnswer, type NoAnswer } from '../src/net';
import { colour, font, radius } from '../src/theme';

const EVERY = 10000;

/**
 * My jobs, in two tabs (the owner's design, 24 November 2026), so nobody
 * scrolls past a hundred old jobs to find the one happening today.
 *
 * **Now** is where it always opens: only what is still going on. First
 * **Needs you** — a job where she has something to do (offers to choose
 * from, a new price, check the work, he is at the door, a payment question)
 * with a yellow bar saying exactly that; then **On its way** — calm, the
 * steps and where he has got to; and last, quietly, **When you have a
 * moment**: a rating she can still give. With nothing on, one card says so
 * and points to Past.
 *
 * **Past** (src/customer/Past.tsx) is every finished job, searched and
 * filtered by the database twenty at a time.
 *
 * Every word on a card is read from the job's own status, step and counts.
 * Nothing is estimated. The yellow top is the app's own (YellowTop), with
 * the two tabs on it: the chosen one white, the colours snapping.
 */
export default function Jobs() {
  const end = useScrollEnd(32);
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const { notify, ask: askNotify } = useNotify(true);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Why nothing came back, for the full card shown when there is no list to show yet.
  const [trouble, setTrouble] = useState<NoAnswer | null>(null);
  // Settings' strip opens Past straight away, and "under guarantee" opens it filtered to those.
  const params = useLocalSearchParams<{ tab?: string; what?: string }>();
  const [tab, setTab] = useState<'now' | 'past'>(params.tab === 'past' ? 'past' : 'now');
  const [nearEnd, setNearEnd] = useState(false);
  const [history, setHistory] = useState<{ total: number; since: string | null } | null>(null);
  const onFacets = useCallback((f: { total: number; since: string | null }) => setHistory({ total: f.total, since: f.since }), []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_jobs');
    if (error) {
      setTrouble(noAnswer());
      setProblem('Your jobs could not be loaded. Check your signal and pull down to try again.');
    } else {
      setTrouble(null);
      setProblem(null);
      setJobs((data as Job[]) ?? []);
    }
  }, []);

  // While the customer watches this screen, ask again every 10 seconds, so
  // offers appear as technicians send them. Stops when they leave.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      load();
      const t = setInterval(load, EVERY);
      return () => clearInterval(t);
    }, [session, load]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (account?.role === 'pro') return <Redirect href="/pro" />;

  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const live = jobs?.filter(isLive) ?? [];
  // A finished job can still need her: a payment question, or money still owed.
  const pastNeeds = jobs?.filter((j) => !isLive(j) && payOf(j)) ?? [];
  const needs = live.filter((j) => todoOf(j));
  const going = live.filter((j) => !todoOf(j));
  const toRate = jobs?.filter((j) => !isLive(j) && j.can_rate && !j.my_rating && j.pro && !payOf(j)) ?? [];
  const needCount = needs.length + pastNeeds.length;
  const nowCount = needCount + going.length;
  const waiting = live.some((j) => j.status === 'open');
  const nothing = jobs !== null && !nowCount && !toRate.length;

  // Counted from the lists themselves, never estimated.
  const sub =
    tab === 'past'
      ? history
        ? history.total
          ? `${history.total} finished ${history.total === 1 ? 'job' : 'jobs'}${history.since ? ` since ${monthYear(history.since)}` : ''}`
          : 'No finished jobs yet'
        : ' '
      : jobs === null
        ? ' '
        : nowCount
          ? [needCount ? `${needCount} ${needCount === 1 ? 'needs' : 'need'} you` : null, going.length ? `${going.length} on ${going.length === 1 ? 'its' : 'their'} way` : null].filter(Boolean).join(' · ')
          : 'Nothing happening right now';

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const near = layoutMeasurement.height + contentOffset.y >= contentSize.height - 600;
    if (near !== nearEnd) setNearEnd(near);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: end }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={100}
        refreshControl={tab === 'now' ? <RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} /> : undefined}
      >
        <YellowTop back={false} after={<MenuButton />}>
          <Text style={[s.title, narrow && s.titleNarrow]} accessibilityRole="header">
            My jobs
          </Text>
          <Text style={s.sub}>{sub}</Text>
          <View style={s.tabs} accessibilityRole="tablist">
            {(['now', 'past'] as const).map((t) => (
              <Press
                key={t}
                onPress={() => setTab(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                accessibilityLabel={t === 'now' ? `Now${nowCount ? `, ${nowCount}` : ''}` : 'Past'}
                sink={0.97}
                style={[s.tab, tab === t && s.tabOn]}
              >
                <Text style={s.tabText}>{t === 'now' ? 'Now' : 'Past'}</Text>
                {t === 'now' && nowCount ? (
                  <View style={s.tabCount}>
                    <Text style={s.tabCountText}>{nowCount}</Text>
                  </View>
                ) : null}
              </Press>
            ))}
          </View>
        </YellowTop>

        <View style={s.body}>
          {tab === 'past' ? (
            <Past initialWhat={params.what === 'covered' ? 'covered' : undefined} tradeName={tradeName} nearEnd={nearEnd} onFacets={onFacets} />
          ) : (
            <>
              {/* With a list on screen, a failed refresh is a line at the top; with none, the full card below says it. */}
              <Notice text={jobs ? problem : null} />
              {jobs === null && trouble ? <Trouble kind={trouble} onRetry={load} /> : null}
              {jobs === null && !trouble ? (
                <View style={s.loading}>
                  <ScrewSpinner size={28} label="Loading your jobs" />
                </View>
              ) : null}

              {/* Only while something is waiting on offers: that is when being told helps. */}
              {waiting && notify === 'ask' ? (
                <NotifyCard
                  title="Know when offers arrive"
                  text="Your phone tells you the moment a technician sends an offer, so you do not have to keep this screen open."
                  action="Turn on notifications"
                  onPress={askNotify}
                />
              ) : null}
              {waiting && notify === 'off' ? (
                <NotifyCard
                  title="Notifications are off"
                  text="You will only see offers when you open this screen. To be told straight away, turn on Pechkas notifications in your phone's settings."
                  action="Open settings"
                  onPress={() => Linking.openSettings()}
                />
              ) : null}

              {jobs?.length === 0 ? <Empty /> : null}
              {jobs?.length && nothing ? <Quiet onPast={() => setTab('past')} /> : null}

              {needCount ? (
                <View style={s.section}>
                  <View style={s.h2Row}>
                    <Text style={s.h2} accessibilityRole="header">
                      Needs you
                    </Text>
                    <View style={s.h2Count}>
                      <Text style={s.h2CountText}>{needCount}</Text>
                    </View>
                  </View>
                  {needs.map((j) => (
                    <LiveJob key={j.id} job={j} trade={tradeName(j.trade)} narrow={narrow} />
                  ))}
                  {pastNeeds.map((j) => (
                    <PastNeed key={j.id} job={j} trade={tradeName(j.trade)} narrow={narrow} />
                  ))}
                </View>
              ) : null}

              {going.length ? (
                <View style={s.section}>
                  <Text style={s.h2} accessibilityRole="header">
                    On its way
                  </Text>
                  {going.map((j) => (
                    <LiveJob key={j.id} job={j} trade={tradeName(j.trade)} narrow={narrow} />
                  ))}
                </View>
              ) : null}

              {toRate.length ? (
                <View style={s.section}>
                  <Text style={s.h2} accessibilityRole="header">
                    When you have a moment
                  </Text>
                  <View style={s.sheet}>
                    {toRate.map((j, i) => (
                      <Press
                        key={j.id}
                        onPress={() => open(j)}
                        accessibilityRole="button"
                        accessibilityLabel={`Rate ${j.pro?.first_name}. ${j.title}`}
                        sink={0.98}
                        style={[s.rate, i < toRate.length - 1 && s.rule]}
                      >
                        <View style={s.rateAvatar}>
                          <Text style={s.avatarText}>{j.pro?.first_name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rateTitle}>Rate {j.pro?.first_name}</Text>
                          <Text style={s.rateSub} numberOfLines={1}>
                            {j.title}
                            {j.finished_at ? ` · finished ${dayText(pkDate(j.finished_at))}` : ''}
                          </Text>
                        </View>
                        <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.4} />
                      </Press>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}

const isLive = (j: Job) => j.status === 'open' || j.status === 'assigned';
const open = (j: Job) => router.push(`/job/${j.id}`);
/** What she will actually pay once there is a figure for it; her offer until then. */
const priceOf = (j: Job) => j.collect_paisa ?? j.agreed_paisa ?? j.offered_paisa;
/** What she pays: nothing on a guarantee repair, whatever Pechkas pays the technician. */
const priceText = (j: Job) => (j.paid_by_pechkas ? 'Free' : rupees(priceOf(j)));
/** A day on Pakistan's clock, as the calendar writes it. */
const pkDate = (at: string) => new Date(new Date(at).getTime() + 5 * 3600000).toISOString().slice(0, 10);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/** The one thing she needs to do on a live job, if there is one. Said on the card so she never has to open a job to find out. */
function todoOf(job: Job): string | null {
  return job.status === 'open' && job.live_offers
    ? 'Choose a technician'
    : job.not_home?.can_say_coming
      ? 'He is at your door'
      : job.change
        ? 'Answer the new price'
        : job.stage === 'checking'
          ? 'Check the work'
          : null;
}
/** D35 on a finished job: a payment question for her, or what she still owes. */
function payOf(job: Job): string | null {
  return job.payment?.can_answer ? 'Answer a payment question' : job.payment?.blocked ? 'Still to pay' : null;
}

/**
 * A job still happening. Open: the screw turning while nobody has offered,
 * then a yellow pill once there is something to choose. Chosen: who is
 * coming, and how far through the visit it is, as four steps.
 */
function LiveJob({ job, trade, narrow }: { job: Job; trade: string; narrow: boolean }) {
  const name = job.pro?.first_name;
  const offers = job.live_offers;
  const headline =
    job.status === 'open'
      ? offers
        ? `${offers} ${offers === 1 ? 'offer' : 'offers'} to choose from`
        : job.preferred
          ? `Sent to ${job.preferred.first_name} first`
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
                ? `${name} says the work is finished`
                : job.stage === 'disputed'
                  ? 'Pechkas is looking at it'
                  : `${name} is your technician`;
  const todo = todoOf(job);

  return (
    <Press onPress={() => open(job)} accessibilityRole="button" accessibilityLabel={`${job.title}. ${headline}${todo ? `. ${todo}` : ''}`} sink={0.98} style={s.live}>
      <View style={s.liveTop}>
        <TradeTile trade={job.trade} job={job.title} size={narrow ? 52 : 60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.kicker} numberOfLines={2}>
            {trade} · {job.ref}
          </Text>
          <Text style={s.liveTitle} numberOfLines={3}>
            {job.title}
          </Text>
        </View>
        <Text style={[s.price, narrow && s.priceNarrow]}>{priceText(job)}</Text>
      </View>

      <View style={s.status}>
        {job.status === 'open' && !offers ? (
          <ScrewSpinner size={26} label={headline} />
        ) : (
          <View style={[s.avatar, job.status === 'open' && s.avatarOffers]}>
            {job.status === 'open' ? (
              <Text style={s.avatarCount}>{offers}</Text>
            ) : (
              <Text style={s.avatarText}>{name?.charAt(0) ?? '·'}</Text>
            )}
          </View>
        )}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={s.statusTitle}>{headline}</Text>
          <Text style={s.statusSub} numberOfLines={2}>
            {whenLabel(job)} · {job.sector}
          </Text>
        </View>
        {todo ? null : <Icon name="chevronRight" size={20} color={colour.steel} strokeWidth={2.2} />}
      </View>

      {job.status === 'assigned' ? <Steps stage={job.stage === 'checking' || job.stage === 'disputed' ? 'working' : job.stage} narrow={narrow} /> : null}

      {todo ? (
        <View style={s.todo}>
          <Text style={s.todoText}>{todo}</Text>
          <Icon name="arrowRight" size={18} color={colour.ink} strokeWidth={2.4} />
        </View>
      ) : null}
    </Press>
  );
}

/** A finished job that still needs her: a payment question, or money still owed. */
function PastNeed({ job, trade, narrow }: { job: Job; trade: string; narrow: boolean }) {
  const todo = payOf(job) as string;
  return (
    <Press onPress={() => open(job)} accessibilityRole="button" accessibilityLabel={`${job.title}. ${todo}`} sink={0.98} style={s.live}>
      <View style={s.liveTop}>
        <TradeTile trade={job.trade} job={job.title} size={narrow ? 52 : 60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.kicker} numberOfLines={2}>
            {trade} · {job.ref}
          </Text>
          <Text style={s.liveTitle} numberOfLines={3}>
            {job.title}
          </Text>
        </View>
        <Text style={[s.price, narrow && s.priceNarrow]}>{priceText(job)}</Text>
      </View>
      <View style={s.todo}>
        <Text style={s.todoText}>{todo}</Text>
        <Icon name="arrowRight" size={18} color={colour.ink} strokeWidth={2.4} />
      </View>
    </Press>
  );
}

/** No jobs at all yet: one card, and the way to a first one — home, where the work is chosen. */
function Empty() {
  return (
    <View style={s.empty}>
      <View style={s.emptyArt}>
        <DuoIcon name="jobs" size={48} />
      </View>
      <Text style={s.emptyTitle}>No jobs yet</Text>
      <Text style={s.emptyText}>Say what is broken and name your price. Checked technicians send you offers, and you choose.</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button kind="ink" label="Find what needs fixing" icon="arrowRight" onPress={() => router.navigate('/')} />
      </View>
    </View>
  );
}

/** Jobs before, nothing now: say so, and point to where the finished ones are. */
function Quiet({ onPast }: { onPast: () => void }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyArt}>
        <DuoIcon name="jobs" size={48} />
      </View>
      <Text style={s.emptyTitle}>Nothing happening right now</Text>
      <Text style={s.emptyText}>Your finished jobs, with their guarantee, are under Past.</Text>
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <Button kind="ink" label="Find what needs fixing" icon="arrowRight" onPress={() => router.navigate('/')} />
        <Button kind="outline" label="See past jobs" onPress={onPast} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.9, color: colour.ink, marginTop: 10, paddingHorizontal: 4 },
  titleNarrow: { fontSize: 28, lineHeight: 32 },
  sub: { fontFamily: font.bodySemi, fontSize: 15, color: colour.onYellow, marginTop: 2, paddingHorizontal: 4 },
  tabs: { flexDirection: 'row', gap: 4, marginTop: 14, padding: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.45)' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, borderRadius: 12 },
  tabOn: { backgroundColor: colour.white, boxShadow: '0px 2px 8px rgba(60, 40, 0, 0.12)' },
  tabText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  tabCount: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { fontFamily: font.display, fontSize: 12, color: colour.yellow },

  body: { paddingTop: 16, paddingHorizontal: 12, gap: 18 },
  loading: { alignItems: 'center', paddingVertical: 40 },
  section: { gap: 10 },
  h2Row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 8 },
  h2Count: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  h2CountText: { fontFamily: font.display, fontSize: 12.5, color: colour.ink },

  live: { gap: 14, padding: 14, borderRadius: 26, backgroundColor: colour.white, boxShadow: SHADOW },
  liveTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel },
  liveTitle: { fontFamily: font.displayBold, fontSize: 16.5, lineHeight: 21, color: colour.ink },
  price: { fontFamily: font.display, fontSize: 19, color: colour.ink },
  priceNarrow: { fontSize: 16 },

  status: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colour.canvas },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarOffers: { backgroundColor: colour.yellow },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  avatarCount: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  statusTitle: { fontFamily: font.display, fontSize: 15.5, color: colour.ink },
  statusSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },

  todo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colour.yellow },
  todoText: { fontFamily: font.display, fontSize: 15.5, color: colour.ink },

  sheet: { paddingHorizontal: 12, paddingVertical: 2, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  rateAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  rateTitle: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  rateSub: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel, marginTop: 1 },

  empty: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 26, backgroundColor: colour.white, boxShadow: SHADOW },
  emptyArt: { width: 88, height: 88, borderRadius: 28, backgroundColor: SOFT_YELLOW, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colour.ink, textAlign: 'center' },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel, textAlign: 'center', maxWidth: 300, marginBottom: 8 },
});
