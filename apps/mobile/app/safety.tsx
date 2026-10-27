import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Screen } from '../src/components/ui';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { DuoRow, RowCard } from '../src/components/Rows';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { EMERGENCY_NUMBERS } from '../src/emergency';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../src/office';
import { useProWords } from '../src/words';
import { colour, font } from '../src/theme';

/**
 * Safety, from the menu — and open to people not signed in, and never
 * covered by the office's pause, because it is where somebody in trouble
 * comes. Laid out as Help and Settings are: the four emergency numbers as
 * big tiles, two by two, each one tap from ringing; the Pechkas office as a
 * row; then what Pechkas does to keep a visit safe, each with a two-tone
 * icon. Every line is something the app really does. The numbers come
 * from src/emergency.ts, which the owner confirmed; never type one here.
 * The words are safety advice: change the look, never soften a line.
 */
export default function Safety() {
  const { w } = useProWords();
  const call = (n: string) => Linking.openURL(`tel:${n}`);
  // On the narrowest phones "1122" would touch its call circle: both shrink a little.
  const narrow = useWindowDimensions().width < 360;

  return (
    <Screen hero={{ title: 'Safety', sub: 'If anyone is in danger, call these first.', back: true }}>
      <View style={s.grid}>
        {EMERGENCY_NUMBERS.map((e) => (
          <Press
            key={e.key}
            onPress={() => call(e.number)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${w[e.key]}, ${e.number.split('').join(' ')}`}
            sink={0.96}
            style={s.tile}
          >
            <View style={s.tileTop}>
              <Text style={[s.number, narrow && s.numberNarrow]}>{e.number}</Text>
              <View style={[s.callDisc, narrow && s.callDiscNarrow]}>
                <Icon name="phone" size={narrow ? 15 : 17} color={colour.white} strokeWidth={2.2} />
              </View>
            </View>
            <Text style={s.service} numberOfLines={2}>
              {w[e.key]}
            </Text>
          </Press>
        ))}
      </View>

      <RowCard>
        <DuoRow icon="support" label="Pechkas office" value={OFFICE_PHONE_SHOWN} onPress={() => call(OFFICE_PHONE)} last />
      </RowCard>

      <Text style={s.h2} accessibilityRole="header">
        How Pechkas keeps a visit safe
      </Text>
      <View style={s.card}>
        <Line icon="shield" text="Every technician is checked before his first job: who he is, in person or on a video call, a trial job, and our rules." />
        <Line icon="lock" text="A start code proves the right person came. Give it to him at the door, once you have seen him, never on the phone." />
        <Line icon="share" text="You can send his name to your family on WhatsApp the moment he is on his way." />
        <Line icon="chat" text="The Pechkas office can read the chat in the app, so there is a record if anything goes wrong." />
        <Line icon="bell" text="During every job there is an Emergency button. It tells the Pechkas office first, then shows these numbers." last />
      </View>
    </Screen>
  );
}

function Line({ icon, text, last = false }: { icon: DuoName; text: string; last?: boolean }) {
  return (
    <View style={[s.line, !last && s.rule]}>
      <View style={s.soft}>
        <DuoIcon name={icon} size={22} />
      </View>
      <Text style={s.text}>{text}</Text>
    </View>
  );
}

const SHADOW = '0px 2px 10px rgba(20, 23, 26, 0.05)';

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two to a row whatever the width: the gap is 10, so each is just under half.
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 104, gap: 8, padding: 14, borderRadius: 22, backgroundColor: colour.white, boxShadow: SHADOW },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  number: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colour.brick },
  numberNarrow: { fontSize: 27, lineHeight: 34 },
  callDiscNarrow: { width: 32, height: 32, borderRadius: 16 },
  callDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colour.brick, alignItems: 'center', justifyContent: 'center' },
  service: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 20, color: colour.ink },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
  card: { borderRadius: 24, backgroundColor: colour.white, paddingHorizontal: 16, boxShadow: SHADOW },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  soft: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff6dc', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft, paddingTop: 1 },
});
