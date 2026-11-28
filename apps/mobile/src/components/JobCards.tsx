import { StyleSheet, Text, View } from 'react-native';
import { jobLine } from '@pechkas/shared/src/work';
import { Icon } from './Icon';
import { Press } from './Press';
import { pictureOf, WorkArt } from './WorkArt';
import { PricePill } from './YellowTop';
import type { Lists } from '../lists';
import { colour, font, shadow } from '../theme';

type Job = Lists['job_types'][number];

/**
 * A job as one wide card (the owner's choice of design B, 28 November 2026):
 * its picture large on the left, so she knows it by sight, then its name,
 * one short line of what it covers (JOB_LINES in packages/shared/src/work.ts)
 * and its usual price. A group's page and a trade without groups both list
 * their jobs this way, so every kind of work reads the same. `by` names the
 * trade that does it when that is not this page's (UPS's page shows the
 * electrician's connection job).
 */
export function WideJobCard({ job, by, narrow, onPress }: { job: Job; by?: string; narrow: boolean; onPress: () => void }) {
  const p = narrow ? 96 : 118;
  const line = jobLine(job.trade, job.name);
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={[job.name, by, line].filter(Boolean).join('. ')} sink={0.98} style={s.card}>
      <View style={[s.pic, { width: p, height: p }]}>
        <WorkArt art={job.trade} source={pictureOf(job.trade, job.name)} size={56} picture={p - 6} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View>
          <Text style={[s.name, narrow && s.nameNarrow]}>{job.name}</Text>
          {by ? <Text style={s.by}>{by}</Text> : null}
        </View>
        {line ? <Text style={s.line}>{line}</Text> : null}
        <View style={{ flexDirection: 'row' }}>
          <PricePill paisa={job.list_paisa} />
        </View>
      </View>
    </Press>
  );
}

/** The black card with the microphone: the trade, with no job named, for the voice note. */
export function SomethingElse({ tile = false, onPress }: { tile?: boolean; onPress: () => void }) {
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 22, backgroundColor: colour.white, boxShadow: shadow.card },
  pic: { borderRadius: 18, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.display, fontSize: 16.5, lineHeight: 21, color: colour.ink },
  nameNarrow: { fontSize: 15, lineHeight: 20 },
  by: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel, marginTop: 2 },
  line: { fontFamily: font.body, fontSize: 13.5, lineHeight: 18, color: colour.steel },
  else: { backgroundColor: colour.ink, borderRadius: 22, padding: 14 },
  elseTile: { minHeight: 150, justifyContent: 'space-between', gap: 10 },
  elseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  elseMic: { width: 56, height: 56, borderRadius: 28, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  elseTitle: { fontFamily: font.display, fontSize: 16, color: colour.white },
  elseSub: { fontFamily: font.bodySemi, fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
});
