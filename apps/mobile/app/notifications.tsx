import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Icon } from '../src/components/Icon';
import { Button, ListGroup, Loading, Screen } from '../src/components/ui';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { colour, font, radius } from '../src/theme';

/**
 * Notifications, from the menu: whether this phone can be told, the one
 * button that changes that, and what Pechkas tells you about.
 *
 * The lists say only what the database really sends (`push_words`, by
 * `who`): a line here with no notification behind it would be a promise the
 * app does not keep. Change them together.
 */
const CUSTOMER = [
  'A technician sends an offer on your job',
  'He is on his way, and when he has arrived',
  'He asks a new price — nothing changes until you answer',
  'The job is done',
  'A new message about your job',
  'The technician you asked for cannot take it',
];

const TECHNICIAN = [
  'A new job in your areas, while you are online',
  'A customer asks for you again',
  'You are chosen — or another offer is',
  'A job is cancelled, so you do not travel',
  'The customer answers your new price',
  'A new message about a job',
  'A payment is recorded, or a balance is due',
];

export default function Notifications() {
  const { ready, session, account } = useAccount();
  const { notify, ask } = useNotify(Boolean(session && account));
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  const pro = account?.role === 'pro';

  const status =
    notify === 'on'
      ? { title: 'Notifications are on', text: 'This phone will be told, even when the app is closed.', tone: colour.green }
      : notify === 'ask'
        ? { title: 'Notifications are off', text: 'Turn them on so you do not miss an offer or a visit.', tone: colour.brick }
        : notify === 'off'
          ? { title: 'Notifications are off', text: 'They were switched off for Pechkas in the phone’s settings. Turn them on there.', tone: colour.brick }
          : notify === 'unavailable'
            ? { title: 'Not on this copy of the app', text: 'This copy of the app cannot receive notifications. The app from the store can.', tone: colour.steel }
            : null;

  return (
    <Screen hero={{ title: 'Notifications', back: true }}>
      {status ? (
        <View style={s.card}>
          <View style={[s.dot, { backgroundColor: status.tone }]}>
            <Icon name="bell" size={22} color={colour.white} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>{status.title}</Text>
            <Text style={s.text}>{status.text}</Text>
          </View>
        </View>
      ) : (
        <Loading />
      )}
      {notify === 'ask' ? <Button label="Turn on notifications" icon="bell" onPress={ask} /> : null}
      {notify === 'off' ? <Button kind="outline" label="Open the phone’s settings" onPress={() => Linking.openSettings()} /> : null}

      <ListGroup title="Pechkas tells you when">
        {(pro ? TECHNICIAN : CUSTOMER).map((line, i, all) => (
          <View key={line} style={[s.row, i < all.length - 1 && s.rule]}>
            <Icon name="check" size={18} color={colour.green} strokeWidth={2.4} />
            <Text style={s.line}>{line}</Text>
          </View>
        ))}
      </ListGroup>
      <Text style={s.small}>
        A notification never shows your address or phone number: it sits on a lock screen, where anybody near the phone can read it.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.big, backgroundColor: colour.white },
  dot: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  line: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
