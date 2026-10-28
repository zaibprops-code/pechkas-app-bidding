import { Linking, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../src/components/ui';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { DuoRow, RowCard } from '../src/components/Rows';
import { EmergencyTiles } from '../src/components/EmergencyTiles';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../src/office';
import { useProWords } from '../src/words';
import { colour, font, shadow } from '../src/theme';

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

  return (
    <Screen hero={{ title: 'Safety', sub: 'If anyone is in danger, call these first.', back: true }}>
      <EmergencyTiles label={(k) => w[k]} />

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

const SHADOW = shadow.card;

const s = StyleSheet.create({
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
  card: { borderRadius: 24, backgroundColor: colour.white, paddingHorizontal: 16, boxShadow: SHADOW },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  soft: { width: 42, height: 42, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft, paddingTop: 1 },
});
