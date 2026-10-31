import { StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import type { PriceRange as Range } from '../prices';
import { colour, font, radius } from '../theme';

/**
 * Recent Pechkas jobs like this one, as a picture: a bar whose green middle
 * is the usual range, and a marker for the price being set, which moves
 * with the stepper (no animation: it simply stands where the price is).
 * The figures are always written out as well, with how many jobs they come
 * from, so nobody has to read a picture to get the facts.
 */
export function PriceRangeCard({
  range,
  title,
  foot,
  mark,
  markLabel,
  onWhite = false,
}: {
  range: Range;
  title: string;
  foot: string;
  mark?: number;
  markLabel?: string;
  /** On a white sheet the box is grey and its bar white; on a coloured card the other way round. */
  onWhite?: boolean;
}) {
  // The bar runs half a range beyond each end, so the green middle is always the middle half of it.
  const span = Math.max(range.high_paisa - range.low_paisa, Math.round(range.low_paisa * 0.2), 10000);
  const from = range.low_paisa - span / 2;
  const to = range.high_paisa + span / 2;
  const at = (p: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));
  const same = range.low_paisa === range.high_paisa;

  return (
    <View style={[s.box, onWhite && s.boxGrey]} accessible accessibilityLabel={`${title}: ${same ? `about ${rupees(range.low_paisa)}` : `${rupees(range.low_paisa)} to ${rupees(range.high_paisa)}`} for the work. ${foot}`}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.figure}>{same ? `About ${rupees(range.low_paisa)}` : `${rupees(range.low_paisa)} – ${rupees(range.high_paisa)}`}</Text>
      <View style={[s.track, onWhite && s.trackWhite]}>
        <View style={[s.middle, { left: `${at(range.low_paisa) * 100}%`, right: `${(1 - at(range.high_paisa)) * 100}%` }]} />
        {mark !== undefined ? <View style={[s.marker, { left: `${at(mark) * 100}%` }]} /> : null}
      </View>
      {mark !== undefined && markLabel ? (
        <View style={s.legend}>
          <View style={s.dot} />
          <Text style={s.legendText}>
            {markLabel} {rupees(mark)}
          </Text>
        </View>
      ) : null}
      <Text style={s.foot}>{foot}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: colour.white },
  boxGrey: { backgroundColor: colour.canvas },
  trackWhite: { backgroundColor: colour.white },
  title: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.steel },
  figure: { fontFamily: font.display, fontSize: 19, color: colour.ink },
  track: { height: 10, marginVertical: 6, borderRadius: radius.pill, backgroundColor: colour.canvas },
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
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colour.ink, backgroundColor: colour.yellow },
  legendText: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.ink },
  foot: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: colour.steel },
});
