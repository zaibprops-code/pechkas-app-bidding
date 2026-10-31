import { StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import type { PriceRange as Range } from '../prices';
import { colour, font, radius } from '../theme';

/** Where a price sits against what recent jobs of its kind went for. */
export type Verdict = 'below' | 'within' | 'above';
export function verdictOf(range: Range, price: number): Verdict {
  return price < range.low_paisa ? 'below' : price > range.high_paisa ? 'above' : 'within';
}

/**
 * One answer, then the picture behind it. The answer is a sentence read
 * from the real range ("In line with most jobs like this"); under it a bar
 * whose green middle is the range, its two ends written beneath it, and a
 * marker that stands where the price is (it moves with the stepper, no
 * animation). The foot says where the figures come from. Shown only when
 * the database sends a range — never a placeholder.
 */
export function PriceRangeCard({
  range,
  price,
  say,
  foot,
  onWhite = false,
}: {
  range: Range;
  price: number;
  /** The headline and the line under it for each verdict, in the screen's own words. */
  say: Record<Verdict, [string, string]>;
  foot: string;
  /** On a white sheet the box is grey and its bar white; on a coloured card the other way round. */
  onWhite?: boolean;
}) {
  // The bar runs half a range beyond each end, so the green middle is always the middle half of it.
  const span = Math.max(range.high_paisa - range.low_paisa, Math.round(range.low_paisa * 0.2), 10000);
  const from = range.low_paisa - span / 2;
  const to = range.high_paisa + span / 2;
  const at = (p: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));
  const v = verdictOf(range, price);
  const [head, sub] = say[v];

  return (
    <View style={[s.box, onWhite && s.boxGrey]} accessible accessibilityLabel={`${head}. ${sub} Most jobs like this: ${rupees(range.low_paisa)} to ${rupees(range.high_paisa)}. ${foot}`}>
      <View style={s.headRow}>
        <View style={[s.dot, v === 'within' ? s.dotGreen : v === 'below' ? s.dotBrick : s.dotYellow]} />
        <Text style={s.head}>{head}</Text>
      </View>
      <Text style={s.sub}>{sub}</Text>

      <View style={s.scale}>
        <View style={[s.track, onWhite && s.trackWhite]}>
          <View style={[s.middle, { left: `${at(range.low_paisa) * 100}%`, right: `${(1 - at(range.high_paisa)) * 100}%` }]} />
          <View style={[s.marker, { left: `${at(price) * 100}%` }]} />
        </View>
        {/* The two ends of the usual range, written under the ends of the green. */}
        <View style={s.ends}>
          <Text style={[s.end, { left: `${at(range.low_paisa) * 100}%` }]}>{rupees(range.low_paisa)}</Text>
          <Text style={[s.end, { left: `${at(range.high_paisa) * 100}%` }]}>{rupees(range.high_paisa)}</Text>
        </View>
      </View>

      <Text style={s.foot}>{foot}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 6, padding: 14, borderRadius: 18, backgroundColor: colour.white },
  boxGrey: { backgroundColor: colour.canvas },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotGreen: { backgroundColor: colour.green },
  dotBrick: { backgroundColor: colour.brick },
  dotYellow: { backgroundColor: colour.yellow, borderWidth: 2, borderColor: colour.ink },
  head: { flex: 1, fontFamily: font.bodySemi, fontSize: 15.5, lineHeight: 21, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  scale: { marginTop: 8, marginBottom: 2 },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colour.canvas },
  trackWhite: { backgroundColor: colour.white },
  middle: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: colour.green },
  marker: {
    position: 'absolute',
    top: -5,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colour.ink,
    backgroundColor: colour.yellow,
  },
  ends: { height: 22, marginTop: 6 },
  end: { position: 'absolute', width: 84, marginLeft: -42, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 12.5, color: colour.ink },
  foot: { fontFamily: font.body, fontSize: 12, lineHeight: 17, color: colour.steel },
});
