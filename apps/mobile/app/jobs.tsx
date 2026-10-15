import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees } from '@pechkas/shared';
import { Button, Loading, Notice } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
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
  status: 'open' | 'cancelled';
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  media: { kind: 'voice' | 'video' | 'photo' }[];
};

const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;

/** The customer's own jobs. Nobody else's: the database only gives these. */
export default function Jobs() {
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
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

  useFocusEffect(
    useCallback(() => {
      if (session) load();
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

        {posted ? (
          <View style={s.posted} accessibilityRole="alert">
            <Text style={s.postedTitle}>Posted · {posted}</Text>
            <Text style={s.postedText}>
              Pechkas has your job. Offers from technicians arrive in the next update of the app; until then Pechkas will call you to arrange somebody.
            </Text>
          </View>
        ) : null}

        <Notice text={problem} />
        {jobs === null && !problem ? <Text style={s.muted}>Loading…</Text> : null}
        {jobs?.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={s.muted}>No jobs yet.</Text>
            <Button label="Post a job" onPress={() => router.push('/post')} />
          </View>
        ) : null}

        {jobs?.map((j) => <JobCard key={j.id} job={j} trade={tradeName(j.trade)} onChanged={load} />)}

        {jobs?.length ? <Button kind="outline" label="Post another job" onPress={() => router.push('/post')} /> : null}
      </ScrollView>
    </View>
  );
}

function JobCard({ job, trade, onChanged }: { job: Job; trade: string; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const open = job.status === 'open';
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
      <View style={[s.badge, { backgroundColor: open ? colour.greenSoft : colour.paper2 }]}>
        <Text style={[s.badgeText, { color: open ? colour.greenDark : colour.steel }]}>
          {open ? 'Waiting for a technician' : job.cancelled_by === 'office' ? 'Cancelled by Pechkas' : 'Cancelled'}
        </Text>
      </View>
      {!open && job.cancelled_by === 'office' && job.cancel_reason ? <Text style={s.line}>{job.cancel_reason}</Text> : null}
      {open && !confirming ? <Button kind="outline" label="Cancel this job" onPress={() => setConfirming(true)} /> : null}
      {open && confirming ? (
        <View style={{ gap: 8 }}>
          <Text style={s.line}>Cancel {job.ref}? Nobody will come for it.</Text>
          <Button kind="danger" label="Yes, cancel it" onPress={cancel} busy={busy} />
          <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
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
});
