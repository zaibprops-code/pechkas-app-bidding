import { Linking, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '../src/components/Icon';
import { ListGroup, ListRow, Screen } from '../src/components/ui';
import { useAccount } from '../src/account';
import { EMERGENCY_NUMBERS } from '../src/emergency';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../src/office';
import { useProWords } from '../src/words';
import { colour, font } from '../src/theme';

/**
 * Safety, from the menu: who to call first, and what Pechkas does to keep a
 * visit safe. Every line is something the app really does. The numbers come
 * from src/emergency.ts, which the owner confirmed; never type one here.
 */
export default function Safety() {
  const { account } = useAccount();
  const dark = account?.role === 'pro';
  const { w } = useProWords();
  const call = (n: string) => Linking.openURL(`tel:${n}`);

  return (
    <Screen dark={dark} hero={{ title: 'Safety', sub: 'If anyone is in danger, call these first.', back: true }}>
      <ListGroup dark={dark}>
        {EMERGENCY_NUMBERS.map((e) => (
          <ListRow key={e.key} dark={dark} icon="phone" label={`${w[e.key]} · ${e.number}`} onPress={() => call(e.number)} />
        ))}
        <ListRow dark={dark} icon="phone" label={`Pechkas office · ${OFFICE_PHONE_SHOWN}`} onPress={() => call(OFFICE_PHONE)} last />
      </ListGroup>

      <Text style={[s.h2, dark && { color: colour.paper }]} accessibilityRole="header">
        How Pechkas keeps a visit safe
      </Text>
      <View style={[s.card, dark && s.cardDark]}>
        <Line dark={dark} icon="shield" text="Every technician is checked before his first job: who he is, in person or on a video call, a trial job, and our rules." />
        <Line dark={dark} icon="lock" text="A start code proves the right person came. Give it to him at the door, once you have seen him, never on the phone." />
        <Line dark={dark} icon="whatsapp" text="You can send his name to your family on WhatsApp the moment he is on his way." />
        <Line dark={dark} icon="chat" text="The Pechkas office can read the chat in the app, so there is a record if anything goes wrong." />
        <Line dark={dark} icon="alert" text="During every job there is an Emergency button. It tells the Pechkas office first, then shows these numbers." last />
      </View>
    </Screen>
  );
}

function Line({ icon, text, dark, last = false }: { icon: IconName; text: string; dark: boolean; last?: boolean }) {
  return (
    <View style={[s.line, !last && (dark ? s.ruleDark : s.rule)]}>
      <Icon name={icon} size={20} color={dark ? colour.yellow : colour.green} strokeWidth={2} />
      <Text style={[s.text, dark && { color: colour.paper }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  h2: { fontFamily: font.display, fontSize: 20, color: colour.ink, marginTop: 8 },
  card: { borderRadius: 22, backgroundColor: colour.white, paddingHorizontal: 16 },
  cardDark: { backgroundColor: '#22282d' },
  line: { flexDirection: 'row', gap: 12, paddingVertical: 14 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  ruleDark: { borderBottomWidth: 1, borderBottomColor: '#2f363c' },
  text: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft },
});
