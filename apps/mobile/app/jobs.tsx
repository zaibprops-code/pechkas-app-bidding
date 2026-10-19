import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { rupees, showMobile } from '@pechkas/shared';
import { MenuButton } from '../src/components/Menu';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { Button, Field, Hero, Loading, Notice, NotifyCard } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { Stars } from '../src/components/Stars';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { useNotify } from '../src/notifications';
import { Ended, UnderWay, type JobNow } from '../src/customer/UnderWay';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../src/office';
import { ask, supabase } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

type Job = JobNow & {
  id: string;
  ref: string;
  trade: string;
  title: string;
  offered_paisa: number;
  when_kind: 'now' | 'today' | 'tomorrow';
  when_part: string | null;
  sector: string;
  street: string;
  house: string;
  live_offers: number;
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  media: { kind: 'voice' | 'video' | 'photo' }[];
  /** Asked for by name: his alone until `until`, then everyone's. */
  preferred?: { first_name: string; until: string } | null;
  /** Whom it was held for at all, even after it opened to everyone. */
  asked_for?: string | null;
  can_ask_again?: boolean;
  /** She blocked this job's technician: he never sees her jobs again, and is not told. */
  blocked?: boolean;
  can_block?: boolean;
  /** His first name, for the block button only. */
  block_name?: string | null;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });

const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;

type Offer = {
  id: string;
  pro_first_name: string;
  years: number;
  price_paisa: number;
  is_counter: boolean;
  eta_minutes: number | null;
  note: string | null;
  expires_at: string;
  /** NULL until he has enough ratings: then the screen says "New", never a made-up number. */
  rating?: number | null;
  jobs_done?: number;
};

const EVERY = 10000;

/** The customer's own jobs. Nobody else's: the database only gives these. */
export default function Jobs() {
  const { posted, asked } = useLocalSearchParams<{ posted?: string; asked?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const { notify, ask: askNotify } = useNotify(true);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_jobs');
    if (error) setProblem('Your jobs could not be loaded. Check your signal and pull down to try again.');
    else {
      setProblem(null);
      setJobs((data as Job[]) ?? []);
    }
  }, []);

  const [tick, setTick] = useState(0);

  // While the customer watches this screen, ask again every 10 seconds, so
  // offers appear as technicians send them. Stops when they leave.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      load();
      const t = setInterval(() => {
        load();
        setTick((n) => n + 1);
      }, EVERY);
      return () => clearInterval(t);
    }, [session, load]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (account?.role === 'pro') return <Redirect href="/pro" />;

  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const fresh = posted ? jobs?.find((j) => j.ref === posted) : undefined;
  // Counted from the list itself, never estimated.
  const going = jobs?.filter((j) => j.status === 'open' || j.status === 'assigned').length ?? 0;
  const summary = jobs === null ? undefined : going ? `${going} in progress` : jobs.length ? 'Nothing in progress' : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Hero title="My jobs" sub={summary} left={<MenuButton />} />
        <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 14 }}>

        {/* "Offers will arrive" is only true while they still can. */}
        {posted && fresh?.status === 'open' ? (
          <View style={s.posted} accessibilityRole="alert">
            <View style={s.postedHead}>
              {/* The screw keeps turning while technicians are being found. */}
              <ScrewSpinner size={26} colour={colour.yellow} label="Looking for technicians" />
              <Text style={s.postedTitle}>Posted · {posted}</Text>
            </View>
            {fresh.preferred ? (
              <Text style={s.postedText}>Sent to {fresh.preferred.first_name} first. Offers appear below as they arrive.</Text>
            ) : (
              <Text style={s.postedText}>
                {fresh.asked_for
                  ? 'It has now gone to every checked technician. '
                  : asked
                    ? `${asked} is not taking jobs right now, so it went to everyone. `
                    : ''}
                Technicians who work in your area will send offers. They appear below as they arrive. If nobody offers soon, Pechkas will call
                you.
              </Text>
            )}
          </View>
        ) : null}

        <Notice text={problem} />

        {/* Only while something is waiting on offers: that is when being told helps. */}
        {jobs?.some((j) => j.status === 'open') && notify === 'ask' ? (
          <NotifyCard
            title="Know when offers arrive"
            text="Your phone tells you the moment a technician sends an offer, so you do not have to keep this screen open."
            action="Turn on notifications"
            onPress={askNotify}
          />
        ) : null}
        {jobs?.some((j) => j.status === 'open') && notify === 'off' ? (
          <NotifyCard
            title="Notifications are off"
            text="You will only see offers when you open this screen. To be told straight away, turn on Pechkas notifications in your phone's settings."
            action="Open settings"
            onPress={() => Linking.openSettings()}
          />
        ) : null}
        {jobs === null && !problem ? <Text style={s.muted}>Loading…</Text> : null}
        {jobs?.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon name="jobs" size={30} color={colour.green} strokeWidth={1.8} />
            </View>
            <Text style={s.emptyTitle}>No jobs yet</Text>
            <Text style={s.muted}>Tell us what is broken and checked technicians send you offers.</Text>
            <Button label="Post a job" icon="arrowRight" onPress={() => router.push('/post')} />
          </View>
        ) : null}

        {jobs?.map((j) => <JobCard key={j.id} job={j} trade={tradeName(j.trade)} tick={tick} onChanged={load} />)}

        {jobs?.length ? <Button kind="outline" label="Post another job" onPress={() => router.push('/post')} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function JobCard({ job, trade, tick, onChanged }: { job: Job; trade: string; tick: number; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockWhy, setBlockWhy] = useState('');
  const open = job.status === 'open';
  const assigned = job.status === 'assigned';
  const ended = job.status === 'done' || job.status === 'stopped';
  const active = open || assigned;
  // Once he is at the gate, a "no" is Decline (and the visit fee) or a call
  // to the office. The database refuses the cancel anyway; this hides it.
  const canCancel = open || (assigned && (job.stage === 'chosen' || job.stage === 'on_way'));
  const files = (['voice', 'video', 'photo'] as const)
    .map((k) => {
      const n = job.media.filter((m) => m.kind === k).length;
      if (!n) return null;
      return k === 'voice' ? 'voice note' : k === 'video' ? 'video' : n === 1 ? '1 photo' : `${n} photos`;
    })
    .filter(Boolean)
    .join(' · ');

  async function everyone() {
    setBusy(true);
    const r = await ask('release_now', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    onChanged();
  }

  async function askAgain() {
    setBusy(true);
    setMsg(null);
    const r = await ask<{ first_name: string; minutes: number }>('ask_again', { p_from_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    router.push({ pathname: '/post', params: { trade: job.trade, ask: r.first_name, minutes: String(r.minutes) } });
  }

  async function block() {
    setBusy(true);
    setMsg(null);
    const r = await ask('block_pro', { p_job: job.id, p_reason: blockWhy });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setBlocking(false);
    onChanged();
  }

  async function unblock() {
    setBusy(true);
    const r = await ask('unblock_pro', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    onChanged();
  }

  async function cancel() {
    setBusy(true);
    const r = await ask('cancel_job', { p_job: job.id, p_reason: null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setConfirming(false);
    onChanged();
  }

  return (
    <View style={[s.card, !active && s.cardClosed]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.trade}>{trade} · {job.ref}</Text>
          <Text style={s.jobTitle}>{job.title}</Text>
        </View>
        {/* What she will actually pay once there is a figure for it; her offer until then. */}
        <Text style={s.price}>{rupees(job.collect_paisa ?? job.agreed_paisa ?? job.offered_paisa)}</Text>
      </View>
      <Text style={s.line}>
        {WHEN[job.when_kind]}
        {job.when_part ? `, ${job.when_part}` : ''} · {job.house}, {job.street}, {job.sector}
      </Text>
      {files ? <Text style={s.muted}>{files}</Text> : null}
      <View style={[s.badge, { backgroundColor: active || ended ? colour.greenSoft : colour.paper2 }]}>
        {open && !(job.live_offers > 0) ? <ScrewSpinner size={16} colour={colour.steel} label="Waiting for offers" /> : null}
        <Text style={[s.badgeText, { color: active || ended ? colour.greenDark : colour.steel }]}>
          {job.status === 'done'
            ? 'Done'
            : job.status === 'stopped'
              ? 'Stopped at the door'
              : assigned
            ? 'Technician chosen'
            : open
              ? job.live_offers > 0
                ? `${job.live_offers} ${job.live_offers === 1 ? 'offer' : 'offers'} to choose from`
                : 'Waiting for offers'
              : job.cancelled_by === 'office'
                ? 'Cancelled by Pechkas'
                : 'Cancelled'}
        </Text>
      </View>
      {!active && job.cancelled_by === 'office' && job.cancel_reason ? <Text style={s.line}>{job.cancel_reason}</Text> : null}
      {open && job.preferred ? (
        <View style={s.held}>
          <Text style={s.line}>
            You asked for {job.preferred.first_name}. Only he can see this job until {clock(job.preferred.until)}; then every checked technician can.
          </Text>
          <Button kind="outline" label="Ask everyone now" onPress={everyone} busy={busy} />
        </View>
      ) : null}
      {open && job.live_offers > 0 ? <Offers job={job} tick={tick} onChosen={onChanged} /> : null}
      {open && job.live_offers === 0 ? (
        <Text style={s.muted}>Offers appear here as technicians send them. This screen updates by itself.</Text>
      ) : null}
      {assigned && job.pro ? <UnderWay job={job} onChanged={onChanged} /> : null}
      {ended ? <Ended job={job} onChanged={onChanged} /> : null}
      {job.can_ask_again && job.pro ? <Button kind="green" label={`Ask ${job.pro.first_name} again`} onPress={askAgain} busy={busy} /> : null}
      {job.can_block && job.block_name && job.blocked ? (
        <View style={s.held}>
          <Text style={s.line}>You blocked {job.block_name}. He does not see your jobs, and he was not told.</Text>
          <Button kind="outline" label="Undo" onPress={unblock} busy={busy} />
        </View>
      ) : null}
      {job.can_block && job.block_name && !job.blocked && !blocking ? (
        <Press onPress={() => setBlocking(true)} accessibilityRole="button" style={s.link}>
          <Text style={s.linkText}>Never send me {job.block_name} again</Text>
        </Press>
      ) : null}
      {job.can_block && job.block_name && !job.blocked && blocking ? (
        <View style={{ gap: 8 }}>
          <Text style={s.line}>
            Block {job.block_name}? He will never see your jobs again. He is not told, and you can undo this here.
          </Text>
          <Field
            label="Tell Pechkas why (optional — only the office sees it)"
            value={blockWhy}
            onChangeText={setBlockWhy}
            maxLength={300}
            multiline
          />
          <Button kind="danger" label={`Yes, block ${job.block_name}`} onPress={block} busy={busy} />
          <Button kind="outline" label="No" onPress={() => setBlocking(false)} />
        </View>
      ) : null}
      {canCancel && !confirming ? <Button kind="outline" label="Cancel this job" onPress={() => setConfirming(true)} /> : null}
      {assigned && !canCancel ? (
        <View style={{ gap: 6 }}>
          <Text style={s.muted}>He is already at your house. To cancel now, call the Pechkas office.</Text>
          <Button kind="outline" label={`Call Pechkas · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </View>
      ) : null}
      {canCancel && confirming ? (
        <View style={{ gap: 8 }}>
          <Text style={s.line}>
            Cancel {job.ref}? {assigned && job.pro ? `Please also call ${job.pro.first_name} to tell him.` : 'Nobody will come for it.'}
          </Text>
          <Button kind="danger" label="Yes, cancel it" onPress={cancel} busy={busy} />
          <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

/** The live offers on one open job, and choosing one. */
function Offers({ job, tick, onChosen }: { job: Job; tick: number; onChosen: () => void }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase?.rpc('job_offers', { p_job: job.id }).then(({ data }) => setOffers((data as Offer[]) ?? []));
  }, [job.id, job.live_offers, tick]);

  async function choose(id: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask('choose_offer', { p_offer: id });
    setBusy(false);
    setPicking(null);
    if (!r.ok) return setMsg(r.why);
    onChosen();
  }

  if (!offers?.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {offers.map((o) => {
        const left = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - Date.now()) / 60000));
        return (
          <View key={o.id} style={s.offer}>
            <View style={s.offerTop}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{o.pro_first_name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.offerName}>{o.pro_first_name}</Text>
                  <Icon name="shield" size={15} strokeWidth={2.2} />
                </View>
                <View style={s.rating}>
                  {o.rating !== null && o.rating !== undefined ? (
                    <>
                      <Stars value={Math.round(Number(o.rating))} size={14} />
                      <Text style={s.ratingText}>{Number(o.rating).toFixed(1)}</Text>
                    </>
                  ) : (
                    <Text style={s.newPro}>New</Text>
                  )}
                  {o.jobs_done !== undefined ? <Text style={s.offerMeta}>· {o.jobs_done} {o.jobs_done === 1 ? 'job' : 'jobs'} done</Text> : null}
                </View>
                <Text style={s.offerMeta}>
                  Checked by Pechkas · {o.years} {o.years === 1 ? 'year' : 'years'} in the trade
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.offerPrice}>{rupees(o.price_paisa)}</Text>
                <Text style={[s.offerTag, { color: o.is_counter ? colour.brick : colour.green }]}>{o.is_counter ? 'His price' : 'Took your price'}</Text>
              </View>
            </View>
            <Text style={s.line}>
              {o.eta_minutes ? `Can be there in ${o.eta_minutes} minutes` : 'Can come at the time you asked'}
              {o.note ? ` · “${o.note}”` : ''}
            </Text>
            <Text style={s.muted}>This offer stays open {left} more {left === 1 ? 'minute' : 'minutes'}.</Text>
            {picking === o.id ? (
              <View style={{ gap: 8 }}>
                <Text style={s.line}>
                  Choose {o.pro_first_name} for {rupees(o.price_paisa)}? He will get your address and number, and you will get his.
                </Text>
                <Button kind="green" label={`Yes, choose ${o.pro_first_name}`} onPress={() => choose(o.id)} busy={busy} />
                <Button kind="outline" label="Not yet" onPress={() => setPicking(null)} />
              </View>
            ) : (
              <Button label={`Choose ${o.pro_first_name} · ${rupees(o.price_paisa)}`} onPress={() => setPicking(o.id)} />
            )}
          </View>
        );
      })}
      <Notice text={msg} />
    </View>
  );
}

/** Once chosen: who is coming, what was agreed, and how to reach him. */
const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colour.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  posted: { gap: 6, padding: 16, borderRadius: radius.big, backgroundColor: colour.green },
  postedHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postedTitle: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  postedText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.paper },
  muted: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  card: { gap: 8, padding: 16, borderRadius: radius.big, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule },
  cardClosed: { backgroundColor: colour.paper },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  trade: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  jobTitle: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 21, color: colour.ink },
  price: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12 },
  offer: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: colour.paper, borderWidth: 1, borderColor: colour.rule },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  offerName: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  offerMeta: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  ratingText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  newPro: { fontFamily: font.bodySemi, fontSize: 12, color: colour.greenDark, backgroundColor: colour.greenSoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  offerPrice: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  offerTag: { fontFamily: font.bodySemi, fontSize: 11 },
  chosen: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
  held: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, textDecorationLine: 'underline' },
});
