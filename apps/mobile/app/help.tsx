import { Linking } from 'react-native';
import { router } from 'expo-router';
import { ListGroup, ListRow, Screen } from '../src/components/ui';
import { useAccount } from '../src/account';
import { AGREEMENT_URL, OFFICE_PHONE, OFFICE_PHONE_SHOWN, OFFICE_WHATSAPP, PRIVACY_URL, TERMS_URL } from '../src/office';

/** Help, from the menu: the Pechkas office, by phone or WhatsApp, and the written rules. */
export default function Help() {
  const { account } = useAccount();
  const dark = account?.role === 'pro';
  return (
    <Screen dark={dark} hero={{ title: 'Help', sub: 'The Pechkas office answers from 7am to 10pm, every day.', back: true }}>
      <ListGroup title="Talk to us" dark={dark}>
        <ListRow dark={dark} icon="whatsapp" label="WhatsApp the office" value={OFFICE_PHONE_SHOWN} onPress={() => Linking.openURL(OFFICE_WHATSAPP)} />
        <ListRow dark={dark} icon="phone" label="Call the office" value={OFFICE_PHONE_SHOWN} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} last />
      </ListGroup>
      <ListGroup title="The rules" dark={dark}>
        {dark ? (
          <ListRow dark icon="doc" label="Technician agreement" onPress={() => Linking.openURL(AGREEMENT_URL)} />
        ) : (
          <ListRow icon="doc" label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
        )}
        <ListRow dark={dark} icon="lock" label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <ListRow dark={dark} icon="shield" label="Safety" onPress={() => router.push('/safety')} last />
      </ListGroup>
    </Screen>
  );
}
