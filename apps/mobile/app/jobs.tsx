import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { rupees } from '@pechkas/shared';
import { MenuButton } from '../src/components/Menu';
import { Hero, Loading, Notice, NotifyCard, SystemBars, useScrollEnd } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { DuoIcon } from '../src/components/DuoIcon';
import { Press } from '../src/components/Press';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { useNotify } from '../src/notifications';
import { type Job } from '../src/customer/JobCard';
import { SHADOW, SOFT_YELLOW, Steps, TradeTile } from '../src/customer/bits';
import { supabase } from '../src/supabase';
import { Trouble } from '../src/components/Trouble';
import { noAnswer, type NoAnswer } from '../src/net';
import { colour, font, radius } from '../src/theme';

const EVERY = 10000;

/**
 * The customer's own jobs, newest first — nobody else's: the database only
 * gives these. Laid out the way a ride app keeps its history: what is still
 * happening at the top as a card of its own, saying in one line where it has
 * got to and, when she has something to do (offers to choose from, a new
 * price to answer), a yellow pill saying so; then everything earlier as one
 * list of rows. A tap on either opens the job's own screen, where choosing,
 * cancelling, the start code, paying and rating all happen.
 *
 * Every word on a card is read from the job's own status, step and counts.
 * Nothing is estimated.
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
  const earlier = jobs?.filter((j) => !isLive(j)) ?? [];
  // Counted from the list itself, never estimated.
  const summary =
    jobs === null || !jobs.length
      ? undefined
      : live.length
        ? `${live.length} in progress`
        : 'Nothing in progress right now';
  const waiting = live.some((j) => j.status === 'open');

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: end }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Hero title="My jobs" sub={summary} left={<MenuButton />} />
        <View style={s.body}>
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

          {live.length ? (
            <View style={s.section}>
              <Text style={s.h2} accessibilityRole="header">
                Happening now
              </Text>
              {live.map((j) => (
                <LiveJob key={j.id} job={j} trade={tradeName(j.trade)} narrow={narrow} />
              ))}
            </View>
          ) : null}

          {earlier.length ? (
            <View style={s.section}>
              <Text style={s.h2} accessibilityRole="header">
                Earlier
              </Text>
              <View style={s.sheet}>
                {earlier.map((j, i) => (
                  <PastJob key={j.id} job={j} trade={tradeName(j.trade)} last={i === earlier.length - 1} narrow={narrow} />
                ))}
              </View>
            </View>
          ) : null}

          {jobs?.length ? <PostCta /> : null}
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

const isLive = (j: Job) => j.status === 'open' || j.status === 'assigned';
const open = (j: Job) => router.push(`/job/${j.id}`);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;
/** What she will actually pay once there is a figure for it; her offer until then. */
const priceOf = (j: Job) => j.collect_paisa ?? j.agreed_paisa ?? j.offered_paisa;

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
              : `${name} is your technician`;
  // The one thing she needs to do, if there is one. Said on the card so she never has to open a job to find out.
  const todo = job.status === 'open' && offers ? 'Choose a technician' : job.change ? 'Answer the new price' : null;

  return (
    <Press onPress={() => open(job)} accessibilityRole="button" accessibilityLabel={`${job.title}. ${headline}${todo ? `. ${todo}` : ''}`} sink={0.98} style={s.live}>
      <View style={s.liveTop}>
        <TradeTile trade={job.trade} size={narrow ? 52 : 60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.kicker} numberOfLines={2}>
            {trade} · {job.ref}
          </Text>
          <Text style={s.liveTitle} numberOfLines={3}>
            {job.title}
          </Text>
        </View>
        <Text style={[s.price, narrow && s.priceNarrow]}>{rupees(priceOf(job))}</Text>
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
            {WHEN[job.when_kind]}
            {job.when_part ? `, ${job.when_part}` : ''} · {job.sector}
          </Text>
        </View>
        {todo ? null : <Icon name="chevronRight" size={20} color={colour.steel} strokeWidth={2.2} />}
      </View>

      {job.status === 'assigned' ? <Steps stage={job.stage} narrow={narrow} /> : null}

      {todo ? (
        <View style={s.todo}>
          <Text style={s.todoText}>{todo}</Text>
          <Icon name="arrowRight" size={18} color={colour.ink} strokeWidth={2.4} />
        </View>
      ) : null}
    </Press>
  );
}

/** A job that is over: one row, its drawing, what it cost, and how it ended. */
function PastJob({ job, trade, last, narrow }: { job: Job; trade: string; last: boolean; narrow: boolean }) {
  const cancelled = job.status === 'cancelled';
  const label =
    job.status === 'done' ? 'Done' : job.status === 'stopped' ? 'Stopped' : job.cancelled_by === 'office' ? 'Cancelled by Pechkas' : 'Cancelled';
  // Only a real, open chance to rate: the database says whether she still may.
  const rate = job.can_rate && !job.my_rating && job.pro ? `Rate ${job.pro.first_name}` : null;
  return (
    <Press
      onPress={() => open(job)}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${day(job.created_at)}. ${label}.${rate ? ` ${rate}.` : ''}`}
      sink={0.98}
      style={[s.past, !last && s.rule]}
    >
      <TradeTile trade={job.trade} size={narrow ? 44 : 48} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.pastHead}>
          <Text style={[s.pastTitle, { flex: 1 }]} numberOfLines={2}>
            {job.title}
          </Text>
          <Text style={[s.pastPrice, cancelled && s.pastPriceOff]}>{rupees(priceOf(job))}</Text>
        </View>
        <Text style={s.pastSub} numberOfLines={1}>
          {day(job.created_at)} · {narrow ? job.ref : `${trade} · ${job.ref}`}
        </Text>
        <View style={s.chips}>
          <View style={[s.chip, job.status === 'done' && s.chipDone]}>
            <Text style={[s.chipText, job.status === 'done' && s.chipTextDone]}>{label}</Text>
          </View>
          {rate ? (
            <View style={[s.chip, s.chipRate]}>
              <DuoIcon name="star" size={13} />
              <Text style={s.chipText}>{rate}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Press>
  );
}

function Empty() {
  return (
    <View style={s.empty}>
      <View style={s.emptyArt}>
        <DuoIcon name="jobs" size={52} />
      </View>
      <Text style={s.emptyTitle}>No jobs yet</Text>
      <Text style={s.emptyText}>Say what is broken and name your price. Checked technicians send you offers, and you choose.</Text>
      <PostCta first />
    </View>
  );
}

/** The same green call to action as home. */
function PostCta({ first = false }: { first?: boolean }) {
  return (
    <Press onPress={() => router.push('/post')} accessibilityRole="button" sink={0.98} style={[s.cta, first && s.ctaFirst]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.ctaTitle}>{first ? 'Post your first job' : 'Post a new job'}</Text>
        <Text style={s.ctaText}>Name your price. Checked technicians send offers.</Text>
      </View>
      <View style={s.ctaGo}>
        <Icon name="arrowRight" size={22} color={colour.ink} strokeWidth={2.4} />
      </View>
    </Press>
  );
}


const s = StyleSheet.create({
  body: { paddingTop: 14, paddingHorizontal: 12, gap: 18 },
  loading: { alignItems: 'center', paddingVertical: 40 },
  section: { gap: 10 },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 8 },

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

  sheet: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 26, backgroundColor: colour.white, boxShadow: SHADOW },
  pastHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  past: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingVertical: 12 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  pastTitle: { fontFamily: font.bodySemi, fontSize: 15.5, lineHeight: 20, color: colour.ink },
  pastSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  pastPrice: { fontFamily: font.displayBold, fontSize: 15.5, lineHeight: 20, color: colour.ink },
  pastPriceOff: { color: colour.steel },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colour.canvas },
  chipDone: { backgroundColor: colour.greenSoft },
  chipRate: { backgroundColor: SOFT_YELLOW },
  chipText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.inkSoft },
  chipTextDone: { color: colour.greenDark },

  empty: { alignItems: 'center', gap: 8, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 12, borderRadius: 26, backgroundColor: colour.white, boxShadow: SHADOW },
  emptyArt: { width: 96, height: 96, borderRadius: 32, backgroundColor: SOFT_YELLOW, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel, textAlign: 'center', maxWidth: 300, marginBottom: 6 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 26, backgroundColor: colour.green },
  ctaFirst: { alignSelf: 'stretch', marginHorizontal: -4, marginBottom: 4 },
  ctaTitle: { fontFamily: font.display, fontSize: 17, color: colour.white },
  ctaText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: '#d7e6e3' },
  ctaGo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
});
