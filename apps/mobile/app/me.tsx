import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { showMobile } from '@pechkas/shared';
import { Avatar, Body, Button, Field, ListGroup, ListRow, Notice, Screen, Title } from '../src/components/ui';
import { ModeSwitch } from '../src/components/ModeSwitch';
import { ThisCopy } from '../src/components/ThisCopy';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { openLegal } from '../src/legal';
import { ask, supabase } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

/**
 * The account screen: who you are, sign out, and delete everything. Both app
 * stores require that an account can be deleted from inside the app.
 */
export default function Me() {
  const { session, account, signOut, connected, refresh } = useAccount();
  const [editing, setEditing] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A technician's notifications are in the language he chose; everyone
  // else's are English. Saved again from here, so whoever is on this screen
  // — the owner included, for the office's alerts — can turn them on.
  const { notify, ask: askNotify } = useNotify(Boolean(session && account));

  const back = <Button kind="outline" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;

  if (!session) {
    return (
      <Screen footer={back}>
        <Title>Your account</Title>
        <Body muted>{connected ? 'Sign in with your mobile number to post jobs and see your offers.' : 'The app is not connected to Pechkas yet.'}</Body>
        {connected ? <Button label="Sign in" onPress={() => router.replace('/start')} /> : null}
        <Button kind="outline" label="Privacy policy" onPress={() => openLegal('privacy')} />
        <Button kind="outline" label="Terms of use" onPress={() => openLegal('terms')} />
        <ThisCopy />
      </Screen>
    );
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    // Voice notes, videos and photos of somebody's home go with the account.
    // The database cannot delete stored files itself, so the phone does it
    // first, from the customer's own folder, which only they may empty.
    if (supabase && session) {
      const folder = session.user.id;
      const { data: files } = await supabase.storage.from('job-media').list(folder, { limit: 1000 });
      if (files?.length) {
        const { error } = await supabase.storage.from('job-media').remove(files.map((f) => `${folder}/${f.name}`));
        if (error) {
          setBusy(false);
          setNotice('Your photos and recordings could not be deleted. Check your signal and try again.');
          return;
        }
      }
    }
    const r = await ask('delete_my_account');
    if (!r.ok) {
      setBusy(false);
      setNotice(r.why);
      return;
    }
    await signOut();
    setBusy(false);
    router.replace('/start');
  }

  const number = account?.phone ?? session.user.phone ?? '';
  const phone = number ? `${showMobile(number)}${account?.phone_checked === false ? ' (not checked)' : ''}` : 'Not given yet';

  async function savePhone() {
    setPhoneError(null);
    setBusy(true);
    const r = await ask('set_my_phone', { p_phone: newPhone });
    setBusy(false);
    if (!r.ok) return setPhoneError(r.why);
    setEditing(false);
    setNewPhone('');
    await refresh();
  }

  const role = account?.role === 'pro' ? 'Technician' : account?.role === 'customer' ? 'Customer' : 'Account not finished';
  const notifyValue = notify === 'on' ? 'On' : notify === 'ask' ? 'Off — tap to turn on' : notify === 'off' ? 'Off — turn on in phone settings' : undefined;

  return (
    <Screen
     
      hero={{
        title: account?.first_name || 'Your account',
        sub: role,
        back: () => (router.canGoBack() ? router.back() : router.replace('/')),
        right: <Avatar name={account?.first_name} size={44} dark />,
      }}
    >
      <ListGroup title="Contact">
        <ListRow icon="phone" label="Mobile number" value={phone} onPress={account?.phone_checked === false && !editing ? () => setEditing(true) : undefined} last={!account?.email} />
        {account?.email ? <ListRow icon="mail" label="Email" value={account.email} last /> : null}
      </ListGroup>

      {editing ? (
        <View style={{ gap: 8 }}>
          <Field
           
            label="Your mobile number"
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="0300 1234567"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={phoneError ?? undefined}
            hint="The person you are working with calls you on this."
          />
          <Button label="Save number" onPress={savePhone} busy={busy} />
          <Button kind="outline" label="Cancel" onPress={() => { setEditing(false); setPhoneError(null); }} />
        </View>
      ) : null}

      {account?.role ? (
        <View style={{ gap: 8 }}>
          <Text style={s.modeNow}>You are using Pechkas {account.role === 'pro' ? 'as a technician' : 'as a customer'}.</Text>
          <ModeSwitch />
        </View>
      ) : null}

      <ListGroup title="Settings">
        {notifyValue ? (
          <ListRow
           
            icon="bell"
            label="Notifications"
            value={notifyValue}
            onPress={notify === 'ask' ? askNotify : notify === 'off' ? () => Linking.openSettings() : undefined}
          />
        ) : null}
        <ListRow icon="lock" label="Privacy policy" onPress={() => openLegal('privacy')} />
        {account?.role === 'pro' ? (
          <ListRow icon="doc" label="Technician agreement" onPress={() => openLegal('technician-agreement')} last />
        ) : (
          <ListRow icon="doc" label="Terms of use" onPress={() => openLegal('terms')} last />
        )}
      </ListGroup>

      <ListGroup>
        <ListRow icon="logout" label="Sign out" onPress={async () => { await signOut(); router.replace('/start'); }} />
        <ListRow icon="trash" label="Delete my account" danger onPress={() => setConfirming(true)} last />
      </ListGroup>

      {confirming ? (
        <View style={s.danger}>
          <Text style={s.dangerText}>
            This deletes your account and everything in it: your name, your number, {account?.role === 'pro' ? 'your application, ' : ''}{account?.role === 'customer' ? 'your jobs, voice notes, videos and photos, ' : ''}all of it. It cannot be undone.
          </Text>
          <Button kind="danger" label="Yes, delete it" onPress={remove} busy={busy} />
          <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
        </View>
      ) : null}
      <Notice text={notice} />

      <ThisCopy />
    </Screen>
  );
}

const s = StyleSheet.create({
  modeNow: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, paddingHorizontal: 4 },
  danger: { gap: 10, padding: 14, borderRadius: radius.big, backgroundColor: '#f6e3dc' },
  dangerText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
