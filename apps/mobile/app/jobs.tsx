import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MenuButton } from '../src/components/Menu';
import { Button, Hero, Loading, Notice, NotifyCard, SystemBars, useScrollEnd } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { useNotify } from '../src/notifications';
import { JobCard, type Job } from '../src/customer/JobCard';
import { supabase } from '../src/supabase';
import { colour, font } from '../src/theme';

const EVERY = 10000;


/**
 * The customer's own jobs, newest first. Nobody else's: the database only
 * gives these. Each card opens that job's own screen, where it is followed
 * live; the whole card is here too, so nothing needs a second tap.
 */
export default function Jobs() {
  const end = useScrollEnd(32);
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
  // Counted from the list itself, never estimated.
  const going = jobs?.filter((j) => j.status === 'open' || j.status === 'assigned').length ?? 0;
  const summary = jobs === null ? undefined : going ? `${going} in progress` : jobs.length ? 'Nothing in progress' : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: end }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Hero title="My jobs" sub={summary} left={<MenuButton />} />
        <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 14 }}>

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

        {jobs?.map((j) => (
          <JobCard key={j.id} job={j} trade={tradeName(j.trade)} tick={tick} onChanged={load} onOpen={() => router.push(`/job/${j.id}`)} />
        ))}

        {jobs?.length ? <Button kind="outline" label="Post another job" onPress={() => router.push('/post')} /> : null}
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colour.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  muted: { fontFamily: font.body, fontSize: 13, color: colour.steel },
});
