import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Art, artFor } from '../components/Art';
import { DuoIcon, type DuoName } from '../components/DuoIcon';
import { Press } from '../components/Press';
import { colour, font } from '../theme';

/**
 * The small pieces My jobs and a job's own screen share, so the two look
 * like one app: the trade's drawing on a cream tile, the four steps of a
 * visit, a white card headed by a two-tone icon, and the square buttons
 * under "Your technician".
 */

export const CREAM = '#f6f2e8';
export const SOFT_YELLOW = '#fff6dc';
export const SHADOW = '0px 2px 10px rgba(20, 23, 26, 0.05)';

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

/** A white card that says what it is the way Post a job's do: a two-tone icon on a soft tile, a title, a line under it. */
export function Panel({ icon, title, hint, tone, children }: { icon?: DuoName; title?: string; hint?: string; tone?: 'money'; children?: ReactNode }) {
  return (
    <View style={[s.panel, tone === 'money' && s.panelMoney]}>
      {title ? (
        <View style={s.head}>
          {icon ? (
            <View style={[s.soft, tone === 'money' && { backgroundColor: colour.white }]}>
              <DuoIcon name={icon} size={24} />
            </View>
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title} accessibilityRole="header">
              {title}
            </Text>
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** One square button in a row of them: a two-tone icon over a short word; the full sentence for screen readers. */
export function Action({ icon, label, full, onPress, on = false }: { icon: DuoName; label: string; full: string; onPress: () => void; on?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={full} accessibilityState={{ expanded: on }} sink={0.96} style={[s.action, on && s.actionOn]}>
      <DuoIcon name={icon} size={26} />
      <Text style={s.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Press>
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
  panel: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  panelMoney: { backgroundColor: SOFT_YELLOW },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  soft: { width: 44, height: 44, borderRadius: 14, backgroundColor: SOFT_YELLOW, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  action: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4, borderRadius: 18, backgroundColor: colour.canvas },
  actionOn: { backgroundColor: SOFT_YELLOW },
  actionText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
});
