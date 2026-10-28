import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from './Icon';
import { Press } from './Press';
import { EMERGENCY_NUMBERS } from '../emergency';
import { colour, font, shadow } from '../theme';

type Key = (typeof EMERGENCY_NUMBERS)[number]['key'];

/**
 * The four emergency numbers as big tiles, two by two: the number large in
 * brick, a brick call disc, the service under it. A tap anywhere on a tile
 * rings it. Safety and the Emergency screen both draw these, so the two can
 * never show different numbers. The numbers come only from src/emergency.ts,
 * which the owner confirmed.
 */
export function EmergencyTiles({ label }: { label: (key: Key) => string }) {
  // On the narrowest phones "1122" would touch its call circle: both shrink a little.
  const narrow = useWindowDimensions().width < 360;
  return (
    <View style={s.grid}>
      {EMERGENCY_NUMBERS.map((e) => (
        <Press
          key={e.key}
          onPress={() => Linking.openURL(`tel:${e.number}`)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${label(e.key)}, ${e.number.split('').join(' ')}`}
          sink={0.96}
          style={s.tile}
        >
          <View style={s.top}>
            <Text style={[s.number, narrow && s.numberNarrow]}>{e.number}</Text>
            <View style={[s.disc, narrow && s.discNarrow]}>
              <Icon name="phone" size={narrow ? 15 : 17} color={colour.white} strokeWidth={2.2} />
            </View>
          </View>
          <Text style={s.service} numberOfLines={2}>
            {label(e.key)}
          </Text>
        </Press>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two to a row whatever the width: the gap is 10, so each is just under half.
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 104, gap: 8, padding: 14, borderRadius: 22, backgroundColor: colour.white, boxShadow: shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  number: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colour.brick },
  numberNarrow: { fontSize: 27, lineHeight: 34 },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colour.brick, alignItems: 'center', justifyContent: 'center' },
  discNarrow: { width: 32, height: 32, borderRadius: 16 },
  service: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 20, color: colour.ink },
});
