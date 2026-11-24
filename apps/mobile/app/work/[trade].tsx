import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees } from '@pechkas/shared';
import { WORK_ALSO, WORK_GROUPS } from '@pechkas/shared/src/work';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { TradeArt } from '../../src/components/TradeArt';
import { SystemBars, useArrive } from '../../src/components/ui';
import { useLists, type Lists } from '../../src/lists';
import { colour, font, TAP } from '../../src/theme';

type Job = Lists['job_types'][number];

/**
 * One kind of work, opened from its tile on home (the owner's choice, 24
 * November 2026): "What is the problem?" and that trade's jobs, each with
 * its usual price or "Price after a look", in small groups on a long list
 * (WORK_GROUPS in packages/shared/src/work.ts; a job in no group is shown
 * under "More jobs", never hidden). A tap opens Post a job with that job
 * chosen. "Something else" at the foot posts the trade with no job named —
 * the voice note is there for exactly that. A job another trade does but
 * which belongs here in the customer's eyes (WORK_ALSO) is shown with its
 * own trade's name and posted as that trade.
 */
export default function Work() {
  const { trade } = useLocalSearchParams<{ trade: string }>();
  const insets = useSafeAreaInsets();
  const lists = useLists();
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const jobs = (lists?.job_types ?? []).filter((j) => j.trade === trade);
  const also = (WORK_ALSO[trade] ?? [])
    .map((a) => lists?.job_types.find((j) => j.trade === a.trade && j.name === a.job))
    .filter((j): j is Job => Boolean(j));
  const groups = sections(jobs, WORK_GROUPS[trade]);
  const post = (t: string, type?: number) => router.push({ pathname: '/post', params: type ? { trade: t, type: String(type) } : { trade: t } });

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 28 }}>
        <View style={s.bar}>
          <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.back}>
            <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
          </Press>
        </View>
        <Animated.View style={{ paddingHorizontal: 20, transform: [{ translateY: rise }] }}>
          <View style={s.head}>
            <View style={s.headArt}>
              <TradeArt trade={trade} size={44} />
            </View>
            <Text style={s.title} accessibilityRole="header">
              {lists ? tradeName(trade) : ''}
            </Text>
          </View>
          <Text style={s.sub}>What is the problem?</Text>

          {!lists ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ScrewSpinner size={32} label="Loading the jobs" />
            </View>
          ) : (
            <>
              {groups.map((g) => (
                <View key={g.title ?? 'all'}>
                  {g.title ? <Text style={s.group}>{g.title}</Text> : <View style={{ height: 8 }} />}
                  {g.jobs.map((j) => (
                    <Row key={j.id} job={j} onPress={() => post(j.trade, j.id)} />
                  ))}
                </View>
              ))}
              {also.length ? (
                <View>
                  {jobs.length ? <Text style={s.group}>Also</Text> : <View style={{ height: 8 }} />}
                  {also.map((j) => (
                    <Row key={j.id} job={j} by={tradeName(j.trade)} onPress={() => post(j.trade, j.id)} />
                  ))}
                </View>
              ) : null}
              <Press onPress={() => post(trade)} accessibilityRole="button" sink={0.98} style={s.else}>
                <Icon name="mic" size={20} color={colour.ink} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Something else</Text>
                  <Text style={s.rowSub}>Describe it, or send a voice note</Text>
                </View>
                <Icon name="chevronRight" size={18} color={colour.ink} strokeWidth={2.2} />
              </Press>
            </>
          )}
        </Animated.View>
      </ScrollView>
      <SystemBars bg={colour.white} />
    </View>
  );
}

/** The jobs in their groups, in order; any job no group names goes under "More jobs". */
function sections(jobs: Job[], groups?: { title: string; jobs: string[] }[]): { title: string | null; jobs: Job[] }[] {
  if (!groups) return jobs.length ? [{ title: null, jobs }] : [];
  const used = new Set<number>();
  const out = groups
    .map((g) => ({
      title: g.title,
      jobs: g.jobs.flatMap((name) => {
        const j = jobs.find((x) => x.name === name);
        if (!j || used.has(j.id)) return [];
        used.add(j.id);
        return [j];
      }),
    }))
    .filter((g) => g.jobs.length);
  const rest = jobs.filter((j) => !used.has(j.id));
  if (rest.length) out.push({ title: 'More jobs', jobs: rest });
  return out;
}

function Row({ job, by, onPress }: { job: Job; by?: string; onPress: () => void }) {
  const price = job.list_paisa ? `Usual price ${rupees(job.list_paisa)}` : 'Price after a look';
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${job.name}. ${price}`} sink={0.98} style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{job.name}</Text>
        <Text style={s.rowSub}>{by ? `${by} · ${price}` : price}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
    </Press>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.white },
  bar: { paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  headArt: { width: 58, height: 58, borderRadius: 17, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: colour.ink },
  sub: { fontFamily: font.bodyMedium, fontSize: 15.5, color: colour.steel, marginTop: 8 },
  group: { fontFamily: font.display, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colour.green, marginTop: 20, marginBottom: 2, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colour.rule },
  rowTitle: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  rowSub: { fontFamily: font.body, fontSize: 13, color: colour.steel, marginTop: 1 },
  else: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 14, borderRadius: 18, backgroundColor: colour.softYellow },
});
