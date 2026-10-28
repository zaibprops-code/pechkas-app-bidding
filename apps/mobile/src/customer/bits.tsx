import { StyleSheet, Text, View } from 'react-native';
import { Art, artFor } from '../components/Art';
import { DuoIcon } from '../components/DuoIcon';
// The card and the square button moved to components/Panel.tsx, shared by every screen.
export { Action, Panel } from '../components/Panel';
import { colour, font, shadow } from '../theme';

/**
 * The small pieces My jobs and a job's own screen share, so the two look
 * like one app: the trade's drawing on a cream tile, the four steps of a
 * visit, a white card headed by a two-tone icon, and the square buttons
 * under "Your technician".
 */

export const CREAM = colour.cream;
export const SOFT_YELLOW = colour.softYellow;
export const SHADOW = shadow.card;

/** The trade's drawing on a cream tile, or the jobs icon for a trade without one. */
export function TradeTile({ trade, size }: { trade: string; size: number }) {
  const art = artFor(trade);
  return (
    <View style={[s.tradeTile, { width: size, height: size, borderRadius: size * 0.32 }]}>
      {art ? <Art name={art} width={Math.round(size * 0.86)} height={Math.round(size * 0.65)} /> : <DuoIcon name="jobs" size={Math.round(size * 0.45)} />}
    </View>
  );
}

export type Stage = 'chosen' | 'on_way' | 'arrived' | 'working';
const STEPS: Stage[] = ['chosen', 'on_way', 'arrived', 'working'];
const STEP_WORDS: Record<Stage, string> = { chosen: 'Chosen', on_way: 'On the way', arrived: 'Arrived', working: 'Working' };

/** How far through the visit a job is, read from its step. Four bars, the words under them. */
export function Steps({ stage, narrow }: { stage: Stage | null; narrow: boolean }) {
  const step = stage ? STEPS.indexOf(stage) : 0;
  return (
    <View accessible accessibilityLabel={`Step ${step + 1} of 4: ${STEP_WORDS[STEPS[step]]}`}>
      <View style={s.steps}>
        {STEPS.map((k, i) => (
          <View key={k} style={[s.step, i <= step && s.stepDone]} />
        ))}
      </View>
      <View style={s.stepWords}>
        {STEPS.map((k, i) => (
          <Text key={k} style={[s.stepWord, narrow && s.stepWordNarrow, i === step && s.stepWordNow]} numberOfLines={1}>
            {STEP_WORDS[k]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tradeTile: { backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colour.canvas },
  stepDone: { backgroundColor: colour.green },
  stepWords: { flexDirection: 'row', gap: 6, marginTop: 6 },
  stepWord: { flex: 1, fontFamily: font.body, fontSize: 12, color: colour.steel },
  stepWordNarrow: { fontSize: 10.5 },
  stepWordNow: { fontFamily: font.bodySemi, color: colour.greenDark },
});
