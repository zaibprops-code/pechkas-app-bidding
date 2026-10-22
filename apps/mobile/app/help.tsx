import { Linking } from 'react-native';
import { router } from 'expo-router';
import { ListGroup, ListRow, Screen } from '../src/components/ui';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN, OFFICE_WHATSAPP } from '../src/office';

/** Help, from the menu: the Pechkas office, by phone or WhatsApp, and the written rules. */
export default function Help() {
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  return (
    <Screen hero={{ title: 'Help', sub: 'The Pechkas office answers from 7am to 10pm, every day.', back: true }}>
      <ListGroup title="Talk to us">
        <ListRow icon="whatsapp" label="WhatsApp the office" value={OFFICE_PHONE_SHOWN} onPress={() => Linking.openURL(OFFICE_WHATSAPP)} />
        <ListRow icon="phone" label="Call the office" value={OFFICE_PHONE_SHOWN} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} last />
      </ListGroup>
      <ListGroup title="The rules">
        {pro ? (
          <ListRow icon="doc" label="Technician agreement" onPress={() => openLegal('technician-agreement')} />
        ) : (
          <ListRow icon="doc" label="Terms of use" onPress={() => openLegal('terms')} />
        )}
        <ListRow icon="lock" label="Privacy policy" onPress={() => openLegal('privacy')} />
        <ListRow icon="shield" label="Safety" onPress={() => router.push('/safety')} last />
      </ListGroup>
    </Screen>
  );
}
