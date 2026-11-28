import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JOB_PICTURES } from '@pechkas/shared/src/work';
import { SomethingElse, WideJobCard } from '../src/components/JobCards';
import { Rise, useRises } from '../src/components/Rise';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { WorkArt } from '../src/components/WorkArt';
import { SystemBars } from '../src/components/ui';
import { YellowTop } from '../src/components/YellowTop';
import { useLists } from '../src/lists';
import { colour, font } from '../src/theme';
import { sections } from '../src/workGroups';

/**
 * One group of a trade's jobs on a page of its own — Plumber → Taps, sinks
 * and showers (the owner's choice of design B, 28 November 2026). It used to
 * be a sheet from the bottom, where each picture was the size of a
 * thumbnail and said little. Now: the yellow top with the back button, the
 * group's name, "Tap the one that looks like yours" and the group's own
 * picture; then one wide card per job (WideJobCard: the picture large, the
 * name, a short line, the usual price); then Something else. A tap on a job
 * opens Post a job with it chosen.
 *
 * `group` is the group's place in sections(): the trade's groups in their
 * own order, then "More jobs" for any job no group names.
 */
export default function GroupPage() {
  const { trade, group } = useLocalSearchParams<{ trade: string; group: string }>();
  const insets = useSafeAreaInsets();
  const lists = useLists();
  const narrow = useWindowDimensions().width < 360;
  const g = lists ? sections(lists.job_types.filter((j) => j.trade === trade), trade)[Number(group)] : null;
  const pictured = !!g && g.jobs.every((j) => (JOB_PICTURES[j.trade] ?? {})[j.name]);
  const rises = useRises(g ? g.jobs.length + 1 : 0, g ? `${trade}-${group}` : null, 55);
  const post = (t: string, type?: number) => router.push({ pathname: '/post', params: type ? { trade: t, type: String(type) } : { trade: t } });

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <YellowTop>
          <View style={s.hero}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, narrow && s.titleNarrow]} accessibilityRole="header">
                {g?.title ?? ''}
              </Text>
              {g ? <Text style={s.ask}>{pictured ? 'Tap the one that looks like yours' : 'Choose the job'}</Text> : null}
            </View>
            {g ? <WorkArt art={g.art} size={narrow ? 72 : 96} picture={narrow ? 104 : 132} /> : null}
          </View>
        </YellowTop>

        {!lists ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ScrewSpinner size={32} label="Loading the jobs" />
          </View>
        ) : !g ? (
          <View style={s.list}>
            <Text style={s.gone}>These jobs have moved. Go back to see the kinds of work.</Text>
          </View>
        ) : (
          <View style={s.list}>
            {g.jobs.map((j, i) => (
              <Rise key={j.id} v={rises[i]}>
                <WideJobCard job={j} narrow={narrow} onPress={() => post(j.trade, j.id)} />
              </Rise>
            ))}
            <Rise v={rises[g.jobs.length]}>
              <SomethingElse onPress={() => post(trade)} />
            </Rise>
          </View>
        )}
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  hero: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 8, gap: 8 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.7, color: colour.ink },
  titleNarrow: { fontSize: 23, lineHeight: 27 },
  ask: { fontFamily: font.bodySemi, fontSize: 15, color: colour.onYellow, marginTop: 4 },
  list: { padding: 16, gap: 10 },
  gone: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: colour.steel },
});
