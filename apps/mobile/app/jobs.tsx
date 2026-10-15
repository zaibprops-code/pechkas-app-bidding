import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees, showMobile } from '@pechkas/shared';
import { Button, Loading, Notice, NotifyCard } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { useNotify } from '../src/notifications';
import { ask, supabase } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

type Job = {
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
  status: 'open' | 'assigned' | 'cancelled';
  live_offers: number;
  agreed_paisa: number | null;
  pro: { first_name: string; phone: string | null; years: number } | null;
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  media: { kind: 'voice' | 'video' | 'photo' }[];
};

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
};

const EVERY = 10000;

/** The customer's own jobs. Nobody else's: the database only gives these. */
export default function Jobs() {
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const { notify, ask: askNotify } = useNotify('en');
  const insets = useSafeAreaInsets();
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
  if (!session) return <Redirect href={{ pathname: '/sign-in', params: { next: 'post' } }} />;
  if (account?.role === 'pro') return <Redirect href="/pro" />;

  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;

  return (
    <View style={{ flex: 1, backgroundColor: colour.paper }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <View style={s.top}>
          <Press onPress={() => router.replace('/')} accessibilityRole="button" accessibilityLabel="Home" style={s.back}>
            <Icon name="arrowLeft" size={20} color={colour.ink} strokeWidth={2.2} />
          </Press>
          <Text style={s.title} accessibilityRole="header">My jobs</Text>
        </View>

        {/* "Offers will arrive" is only true while they still can. */}
        {posted && jobs?.find((j) => j.ref === posted)?.status === 'open' ? (
          <View style={s.posted} accessibilityRole="alert">
            <Text style={s.postedTitle}>Posted · {posted}</Text>
            <Text style={s.postedText}>
              Technicians who work in your area will send offers. They appear below as they arrive. If nobody offers soon, Pechkas will call you.
            </Text>
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
          <View style={{ gap: 12 }}>
            <Text style={s.muted}>No jobs yet.</Text>
            <Button label="Post a job" onPress={() => router.push('/post')} />
          </View>
        ) : null}

        {jobs?.map((j) => <JobCard key={j.id} job={j} trade={tradeName(j.trade)} tick={tick} onChanged={load} />)}

        {jobs?.length ? <Button kind="outline" label="Post another job" onPress={() => router.push('/post')} /> : null}
      </ScrollView>
    </View>
  );
}

function JobCard({ job, trade, tick, onChanged }: { job: Job; trade: string; tick: number; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const open = job.status === 'open';
  const assigned = job.status === 'assigned';
  const active = open || assigned;
  const files = (['voice', 'video', 'photo'] as const)
    .map((k) => {
      const n = job.media.filter((m) => m.kind === k).length;
      if (!n) return null;
      return k === 'voice' ? 'voice note' : k === 'video' ? 'video' : n === 1 ? '1 photo' : `${n} photos`;
    })
    .filter(Boolean)
    .join(' · ');

  async function cancel() {
    setBusy(true);
    const r = await ask('cancel_job', { p_job: job.id, p_reason: null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setConfirming(false);
    onChanged();
  }

  return (
    <View style={[s.card, !open && s.cardClosed]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.trade}>{trade} · {job.ref}</Text>
          <Text style={s.jobTitle}>{job.title}</Text>
        </View>
        <Text style={s.price}>{rupees(job.offered_paisa)}</Text>
      </View>
      <Text style={s.line}>
        {WHEN[job.when_kind]}
        {job.when_part ? `, ${job.when_part}` : ''} · {job.house}, {job.street}, {job.sector}
      </Text>
      {files ? <Text style={s.muted}>{files}</Text> : null}
      <View style={[s.badge, { backgroundColor: active ? colour.greenSoft : colour.paper2 }]}>
        <Text style={[s.badgeText, { color: active ? colour.greenDark : colour.steel }]}>
          {assigned
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
      {open && job.live_offers > 0 ? <Offers job={job} tick={tick} onChosen={onChanged} /> : null}
      {open && job.live_offers === 0 ? (
        <Text style={s.muted}>Offers appear here as technicians send them. This screen updates by itself.</Text>
      ) : null}
      {assigned && job.pro ? <ChosenPro job={job} /> : null}
      {active && !confirming ? <Button kind="outline" label="Cancel this job" onPress={() => setConfirming(true)} /> : null}
      {active && confirming ? (
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
                <Text style={s.offerMeta}>
                  Met by Pechkas · {o.years} {o.years === 1 ? 'year' : 'years'} in the trade
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
function ChosenPro({ job }: { job: Job }) {
  const pro = job.pro!;
  const family = encodeURIComponent(
    `Pechkas is sending ${pro.first_name} for job ${job.ref} (${job.title}) at ${job.house}, ${job.street}, ${job.sector}.${pro.phone ? ` His number: ${showMobile(pro.phone)}.` : ''}`,
  );
  return (
    <View style={s.chosen}>
      <View style={s.offerTop}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{pro.first_name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.offerName}>{pro.first_name} is your technician</Text>
          <Text style={s.offerMeta}>Met by Pechkas · agreed {job.agreed_paisa ? rupees(job.agreed_paisa) : 'no price yet'}</Text>
        </View>
      </View>
      <Text style={s.line}>The price only changes if you agree. Pay him after the job.</Text>
      {pro.phone ? <Button kind="green" label={`Call ${pro.first_name} · ${showMobile(pro.phone)}`} onPress={() => Linking.openURL(`tel:+${pro.phone!.replace(/^\+/, '')}`)} /> : null}
      <Button kind="outline" label="Send his name to family on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${family}`)} />
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: 999, backgroundColor: colour.paper2, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 30, color: colour.ink, letterSpacing: -0.7 },
  posted: { gap: 6, padding: 16, borderRadius: radius.big, backgroundColor: colour.green },
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12 },
  offer: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: colour.paper, borderWidth: 1, borderColor: colour.rule },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  offerName: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  offerMeta: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  offerPrice: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  offerTag: { fontFamily: font.bodySemi, fontSize: 11 },
  chosen: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
});
