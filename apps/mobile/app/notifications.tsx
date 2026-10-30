import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Icon } from '../src/components/Icon';
import { Button, Loading, Screen } from '../src/components/ui';
import { DuoIcon } from '../src/components/DuoIcon';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { colour, font, shadow } from '../src/theme';

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
  'A payment is confirmed or not, or a balance is due',
];

export default function Notifications() {
  const { ready, session, account } = useAccount();
  const { notify, ask } = useNotify(Boolean(session && account));
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  const pro = account?.role === 'pro';

  const status =
    notify === 'on'
      ? { title: 'Notifications are on', text: 'This phone will be told, even when the app is closed.', on: true }
      : notify === 'ask'
        ? { title: 'Notifications are off', text: 'Turn them on so you do not miss an offer or a visit.', on: false }
        : notify === 'off'
          ? { title: 'Notifications are off', text: 'They were switched off for Pechkas in the phone’s settings. Turn them on there.', on: false }
          : notify === 'unavailable'
            ? { title: 'Not on this copy of the app', text: 'This copy of the app cannot receive notifications. The app from the store can.', on: null }
            : null;

  return (
    <Screen hero={{ title: 'Notifications', back: true }}>
      {/* Whether this phone is told: green when it is, soft yellow — something to do — when it is not. */}
      {status ? (
        <View style={[s.status, status.on === true && s.statusOn, status.on === false && s.statusOff]}>
          <View style={s.statusHead}>
            <View style={[s.tile, status.on === true && s.tileOn]}>
              <DuoIcon name="bell" size={26} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.title, status.on === true && { color: colour.white }]}>{status.title}</Text>
              <Text style={[s.text, status.on === true && { color: '#d7e6e3' }]}>{status.text}</Text>
            </View>
          </View>
          {notify === 'ask' ? <Button label="Turn on notifications" icon="bell" onPress={ask} /> : null}
          {notify === 'off' ? <Button kind="outline" label="Open the phone’s settings" onPress={() => Linking.openSettings()} /> : null}
        </View>
      ) : (
        <Loading />
      )}

      <Text style={s.h2} accessibilityRole="header">
        Pechkas tells you when
      </Text>
      <View style={s.card}>
        {(pro ? TECHNICIAN : CUSTOMER).map((line, i, all) => (
          <View key={line} style={[s.row, i < all.length - 1 && s.rule]}>
            <View style={s.tick}>
              <Icon name="check" size={16} color={colour.greenDark} strokeWidth={2.6} />
            </View>
            <Text style={s.line}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={s.privacy}>
        <View style={s.privacyTile}>
          <DuoIcon name="lock" size={22} />
        </View>
        <Text style={s.small}>
          A notification never shows your address or phone number: it sits on a lock screen, where anybody near the phone can read it.
        </Text>
      </View>
    </Screen>
  );
}

const SHADOW = shadow.card;

const s = StyleSheet.create({
  status: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  statusOn: { backgroundColor: colour.green },
  statusOff: { backgroundColor: colour.softYellow },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 52, height: 52, borderRadius: 18, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: colour.softYellow },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
  card: { paddingHorizontal: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: colour.greenSoft, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: colour.white },
  privacyTile: { width: 40, height: 40, borderRadius: 13, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  small: { flex: 1, fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
