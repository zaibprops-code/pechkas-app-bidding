import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WORK_ALSO, WORK_GROUPS } from '@pechkas/shared/src/work';
import { Press } from '../../src/components/Press';
import { Rise, useRises } from '../../src/components/Rise';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { TradeArt } from '../../src/components/TradeArt';
import { SomethingElse, WideJobCard } from '../../src/components/JobCards';
import { pictureOfArt, topOf, WorkArt } from '../../src/components/WorkArt';
import { SystemBars } from '../../src/components/ui';
import { YellowTop } from '../../src/components/YellowTop';
import { useLists, type Lists } from '../../src/lists';
import { sections } from '../../src/workGroups';
import { colour, font } from '../../src/theme';

type Job = Lists['job_types'][number];

/**
 * One kind of work (the owner's choice, 24 November 2026), in the new look:
 * the yellow top with the trade's big drawing and "What is the problem?".
 * A trade with groups (WORK_GROUPS in packages/shared/src/work.ts) shows them
 * as picture tiles — Taps and sinks, Toilet, Geyser… — so the customer finds
 * the picture of the problem rather than reading fifteen lines; a tap opens
 * that group's own page (app/group.tsx: the owner's choice of design B, 28
 * November 2026 — the sheet it replaced showed the pictures at thumbnail
 * size). A job no group names is never hidden: it is a tile of its own,
 * "More jobs". A short trade shows its jobs straight away, as the same wide
 * cards a group's page has (WideJobCard). "Something else" is
 * the black tile with the microphone: the trade posted with no job named,
 * for the voice note. A job another trade does but which belongs here in the
 * customer's eyes (WORK_ALSO) is shown with its own trade's name and posted
 * as that trade.
 */
export default function Work() {
  const { trade } = useLocalSearchParams<{ trade: string }>();
  const insets = useSafeAreaInsets();
  const lists = useLists();
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const top = topOf(trade);
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const jobs = (lists?.job_types ?? []).filter((j) => j.trade === trade);
  const also = (WORK_ALSO[trade] ?? [])
    .map((a) => lists?.job_types.find((j) => j.trade === a.trade && j.name === a.job))
    .filter((j): j is Job => Boolean(j));
  const groups = WORK_GROUPS[trade] ? sections(jobs, trade, lists?.job_types) : null;
  const count = (groups ? groups.length : jobs.length + also.length) + 1;
  const rises = useRises(lists ? count : 0, lists ? trade : null, 55);
  const post = (t: string, type?: number) => router.push({ pathname: '/post', params: type ? { trade: t, type: String(type) } : { trade: t } });
  const cell = Math.floor((width - 32 - 10) / 2);

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <YellowTop picture={top}>
          <View style={[s.hero, top ? (narrow ? s.heroTopNarrow : s.heroTop) : null]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, narrow && s.titleNarrow]} accessibilityRole="header">
                {lists ? tradeName(trade) : ''}
              </Text>
              <Text style={s.ask}>What is the problem?</Text>
            </View>
            {top ? null : <WorkArt art={trade} size={narrow ? 84 : 108} picture={narrow ? 118 : 148} />}
          </View>
        </YellowTop>

        {!lists ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ScrewSpinner size={32} label="Loading the jobs" />
          </View>
        ) : groups ? (
          <View style={s.grid}>
            {groups.map((g, i) => (
              <Rise key={g.title} v={rises[i]} style={{ width: cell }}>
                <Press onPress={() => router.push({ pathname: '/group', params: { trade, group: String(i) } })} accessibilityRole="button" accessibilityLabel={`${g.title}. ${g.jobs.length} jobs`} sink={0.97} style={s.tile}>
                  {pictureOfArt(g.art) ? (
                    <View style={s.tilePicture}>
                      <WorkArt art={g.art} size={48} picture={Math.min(104, cell - 40)} />
                    </View>
                  ) : (
                    <View style={s.tileArt}>
                      <TradeArt trade={g.art} size={48} />
                    </View>
                  )}
                  <View>
                    <Text style={[s.tileTitle, narrow && { fontSize: 15 }]}>{g.title}</Text>
                    <Text style={s.tileSub}>
                      {g.jobs.length} {g.jobs.length === 1 ? 'job' : 'jobs'}
                    </Text>
                  </View>
                </Press>
              </Rise>
            ))}
            <Rise v={rises[groups.length]} style={{ width: cell }}>
              <SomethingElse tile onPress={() => post(trade)} />
            </Rise>
          </View>
        ) : (
          <View style={s.list}>
            {jobs.map((j, i) => (
              <Rise key={j.id} v={rises[i]}>
                <WideJobCard job={j} narrow={narrow} onPress={() => post(j.trade, j.id)} />
              </Rise>
            ))}
            {also.map((j, i) => (
              <Rise key={j.id} v={rises[jobs.length + i]}>
                <WideJobCard job={j} by={tradeName(j.trade)} narrow={narrow} onPress={() => post(j.trade, j.id)} />
              </Rise>
            ))}
            <Rise v={rises[jobs.length + also.length]}>
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
  hero: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 8, marginTop: -2 },
  // With a wide 3D picture the top is as tall as it was with the picture beside the name.
  heroTop: { minHeight: 170 },
  heroTopNarrow: { minHeight: 150 },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.9, color: colour.ink },
  titleNarrow: { fontSize: 26, lineHeight: 30 },
  ask: { fontFamily: font.bodySemi, fontSize: 16, color: colour.onYellow, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  tile: { minHeight: 150, borderRadius: 22, backgroundColor: colour.white, padding: 14, justifyContent: 'space-between', gap: 10, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.07)' },
  tilePicture: { alignItems: 'center' },
  tileArt: { width: 62, height: 62, borderRadius: 18, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontFamily: font.display, fontSize: 16, lineHeight: 20, color: colour.ink },
  tileSub: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel, marginTop: 2 },
  list: { padding: 16, gap: 10 },
});
