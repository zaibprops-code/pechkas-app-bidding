import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JOB_PICTURES, WORK_ALSO, WORK_GROUPS } from '@pechkas/shared/src/work';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { Rise, useRises } from '../../src/components/Rise';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { Sheet } from '../../src/components/Sheet';
import { TradeArt } from '../../src/components/TradeArt';
import { pictureOf, pictureOfArt, WorkArt } from '../../src/components/WorkArt';
import { SystemBars } from '../../src/components/ui';
import { PricePill, YellowTop } from '../../src/components/YellowTop';
import { useLists, type Lists } from '../../src/lists';
import { colour, font } from '../../src/theme';

type Job = Lists['job_types'][number];
type Group = { title: string; art: string; jobs: Job[] };

/**
 * One kind of work (the owner's choice, 24 November 2026), in the new look:
 * the yellow top with the trade's big drawing and "What is the problem?".
 * A trade with groups (WORK_GROUPS in packages/shared/src/work.ts) shows them
 * as picture tiles — Taps and sinks, Toilet, Geyser… — so the customer finds
 * the picture of the problem rather than reading fifteen lines; a tap slides
 * that group's jobs up in a sheet, each with its usual price in a pill. A job
 * no group names is never hidden: it is a tile of its own, "More jobs". A
 * short trade shows its jobs straight away, as cards. "Something else" is
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
  const [open, setOpen] = useState<Group | null>(null);
  // Pictures in the list only when every job in it has one of its own: the same picture four times says nothing.
  const pictured = !!open && open.jobs.every((j) => (JOB_PICTURES[j.trade] ?? {})[j.name]);
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const jobs = (lists?.job_types ?? []).filter((j) => j.trade === trade);
  const also = (WORK_ALSO[trade] ?? [])
    .map((a) => lists?.job_types.find((j) => j.trade === a.trade && j.name === a.job))
    .filter((j): j is Job => Boolean(j));
  const groups = WORK_GROUPS[trade] ? sections(jobs, trade) : null;
  // A short list (no groups) by the same rule as a group's: pictures only when every job on it has one.
  const listPictured = jobs.length + also.length > 0 && [...jobs, ...also].every((j) => (JOB_PICTURES[j.trade] ?? {})[j.name]);
  const count = (groups ? groups.length : jobs.length + also.length) + 1;
  const rises = useRises(lists ? count : 0, lists ? trade : null, 55);
  const post = (t: string, type?: number) => {
    setOpen(null);
    router.push({ pathname: '/post', params: type ? { trade: t, type: String(type) } : { trade: t } });
  };
  const cell = Math.floor((width - 32 - 10) / 2);

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <YellowTop>
          <View style={s.hero}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, narrow && s.titleNarrow]} accessibilityRole="header">
                {lists ? tradeName(trade) : ''}
              </Text>
              <Text style={s.ask}>What is the problem?</Text>
            </View>
            <WorkArt art={trade} size={narrow ? 84 : 108} picture={narrow ? 118 : 148} />
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
                <Press onPress={() => setOpen(g)} accessibilityRole="button" accessibilityLabel={`${g.title}. ${g.jobs.length} jobs`} sink={0.97} style={s.tile}>
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
                <JobCard job={j} pictured={listPictured} narrow={narrow} onPress={() => post(j.trade, j.id)} />
              </Rise>
            ))}
            {also.map((j, i) => (
              <Rise key={j.id} v={rises[jobs.length + i]}>
                <JobCard job={j} by={tradeName(j.trade)} pictured={listPictured} narrow={narrow} onPress={() => post(j.trade, j.id)} />
              </Rise>
            ))}
            <Rise v={rises[jobs.length + also.length]}>
              <SomethingElse onPress={() => post(trade)} />
            </Rise>
          </View>
        )}
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />

      {open ? (
        <Sheet onClose={() => setOpen(null)}>
          <View style={s.sheetHead}>
            <View style={s.sheetArt}>
              <WorkArt art={open.art} size={44} picture={52} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{open.title}</Text>
              <Text style={s.tileSub}>{pictured ? 'Tap the one that looks like yours' : `${tradeName(trade)} · choose the job`}</Text>
            </View>
          </View>
          {open.jobs.map((j) =>
            pictured ? (
              <Press key={j.id} onPress={() => post(j.trade, j.id)} accessibilityRole="button" accessibilityLabel={j.name} sink={0.98} style={s.picRow}>
                <View style={[s.picRowArt, narrow && { width: 64, height: 64 }]}>
                  <WorkArt art={open.art} source={pictureOf(j.trade, j.name)} size={44} picture={narrow ? 58 : 72} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text style={s.picRowText}>{j.name}</Text>
                  <View style={{ flexDirection: 'row' }}>
                    <PricePill paisa={j.list_paisa} />
                  </View>
                </View>
                <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
              </Press>
            ) : (
              <Press key={j.id} onPress={() => post(j.trade, j.id)} accessibilityRole="button" accessibilityLabel={j.name} sink={0.98} style={s.sheetRow}>
                <Text style={s.sheetRowText}>{j.name}</Text>
                <PricePill paisa={j.list_paisa} />
              </Press>
            ),
          )}
          <Press onPress={() => post(trade)} accessibilityRole="button" sink={0.97} style={s.sheetElse}>
            <Icon name="mic" size={20} color={colour.ink} strokeWidth={2} />
            <Text style={s.sheetElseText}>Something else — say it in your own words</Text>
          </Press>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * The trade's groups, in order, each with its jobs; jobs no group names
 * become one more group, "More jobs", so a job added by migration shows the
 * day it is added.
 */
function sections(jobs: Job[], trade: string): Group[] {
  const used = new Set<number>();
  const out: Group[] = [];
  for (const g of WORK_GROUPS[trade] ?? []) {
    const mine = g.jobs.flatMap((name) => {
      const j = jobs.find((x) => x.name === name);
      if (!j || used.has(j.id)) return [];
      used.add(j.id);
      return [j];
    });
    if (mine.length) out.push({ title: g.title, art: g.art ?? trade, jobs: mine });
  }
  const rest = jobs.filter((j) => !used.has(j.id));
  if (rest.length) out.push({ title: 'More jobs', art: trade, jobs: rest });
  return out;
}

function JobCard({ job, by, pictured, narrow, onPress }: { job: Job; by?: string; pictured?: boolean; narrow?: boolean; onPress: () => void }) {
  if (pictured) {
    return (
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={by ? `${job.name}. ${by}` : job.name} sink={0.98} style={s.picCard}>
        <View style={[s.picRowArt, narrow && { width: 64, height: 64 }]}>
          <WorkArt art={job.trade} source={pictureOf(job.trade, job.name)} size={44} picture={narrow ? 58 : 72} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View>
            <Text style={s.picRowText}>{job.name}</Text>
            {by ? <Text style={s.tileSub}>{by}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row' }}>
            <PricePill paisa={job.list_paisa} />
          </View>
        </View>
        <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
      </Press>
    );
  }
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={job.name} sink={0.98} style={s.card}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cardTitle}>{job.name}</Text>
        {by ? <Text style={s.tileSub}>{by}</Text> : null}
      </View>
      <PricePill paisa={job.list_paisa} />
    </Press>
  );
}

/** The black tile with the microphone: the trade, with no job named. */
function SomethingElse({ tile = false, onPress }: { tile?: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel="Something else. Say it in your own words" sink={0.97} style={[s.else, tile ? s.elseTile : s.elseRow]}>
      <View style={s.elseMic}>
        <Icon name="mic" size={26} color={colour.ink} strokeWidth={2} />
      </View>
      <View style={tile ? null : { flex: 1 }}>
        <Text style={s.elseTitle}>Something else</Text>
        <Text style={s.elseSub}>Say it in your own words</Text>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  hero: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 8, marginTop: -2 },
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.07)' },
  picCard: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 92, padding: 8, paddingRight: 12, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.07)' },
  cardTitle: { fontFamily: font.display, fontSize: 15.5, lineHeight: 20, color: colour.ink },
  else: { backgroundColor: colour.ink, borderRadius: 22, padding: 14 },
  elseTile: { minHeight: 150, justifyContent: 'space-between', gap: 10 },
  elseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  elseMic: { width: 56, height: 56, borderRadius: 28, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  elseTitle: { fontFamily: font.display, fontSize: 16, color: colour.white },
  elseSub: { fontFamily: font.bodySemi, fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  sheetArt: { width: 56, height: 56, borderRadius: 16, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colour.rule },
  picRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 92, padding: 8, paddingRight: 12, marginTop: 10, borderRadius: 18, borderWidth: 1.5, borderColor: colour.rule },
  picRowArt: { width: 76, height: 76, borderRadius: 16, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  picRowText: { fontFamily: font.display, fontSize: 15.5, lineHeight: 20, color: colour.ink },
  sheetRowText: { flex: 1, fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  sheetElse: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginTop: 8 },
  sheetElseText: { flex: 1, fontFamily: font.display, fontSize: 15, color: colour.ink, textDecorationLine: 'underline' },
});
