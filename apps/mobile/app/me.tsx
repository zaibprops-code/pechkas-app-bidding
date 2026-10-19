import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { showMobile } from '@pechkas/shared';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { ThisCopy } from '../src/components/ThisCopy';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { AGREEMENT_URL, PRIVACY_URL, TERMS_URL } from '../src/office';
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
  const dark = account?.role === 'pro';
  // A technician's notifications are in the language he chose; everyone
  // else's are English. Saved again from here, so whoever is on this screen
  // — the owner included, for the office's alerts — can turn them on.
  const { notify, ask: askNotify } = useNotify(Boolean(session && account));

  const back = <Button kind="outline" dark={dark} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;

  if (!session) {
    return (
      <Screen footer={back}>
        <Title>Your account</Title>
        <Body muted>{connected ? 'Sign in with your mobile number to post jobs and see your offers.' : 'The app is not connected to Pechkas yet.'}</Body>
        {connected ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : null}
        <Button kind="outline" label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Button kind="outline" label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
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
    router.replace('/');
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

  return (
    <Screen dark={dark} footer={back}>
      <Title dark={dark}>{account?.first_name ? `${account.first_name}` : 'Your account'}</Title>
      <View style={[s.card, dark && s.cardDark]}>
        <Row dark={dark} k="Mobile" v={phone} />
        {account?.email ? <Row dark={dark} k="Email" v={account.email} /> : null}
        <Row dark={dark} k="Account" v={account?.role === 'pro' ? 'Technician' : account?.role === 'customer' ? 'Customer' : 'Not finished'} />
        {notify && notify !== 'unavailable' ? <Row dark={dark} k="Notifications" v={notify === 'on' ? 'On' : 'Off'} /> : null}
      </View>

      {account?.phone_checked === false && !editing ? (
        <Button kind="outline" dark={dark} label="Change my mobile number" onPress={() => setEditing(true)} />
      ) : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          <Field
            dark={dark}
            label="Your mobile number"
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="0300 1234567"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={phoneError ?? undefined}
            hint="The person you are working with rings you on this."
          />
          <Button dark={dark} label="Save number" onPress={savePhone} busy={busy} />
          <Button kind="outline" dark={dark} label="Cancel" onPress={() => { setEditing(false); setPhoneError(null); }} />
        </View>
      ) : null}

      {notify === 'ask' ? <Button kind={dark ? 'yellow' : 'green'} dark={dark} label="Turn on notifications" onPress={askNotify} /> : null}
      {notify === 'off' ? (
        <View style={{ gap: 8 }}>
          <Body dark={dark} muted>Notifications are switched off for Pechkas in your phone's settings.</Body>
          <Button kind="outline" dark={dark} label="Open settings" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}

      {account?.role === 'customer' ? <Button kind="outline" label="I want to work with Pechkas as a technician" onPress={() => router.push('/pro/apply')} /> : null}

      <Button kind="outline" dark={dark} label="Sign out" onPress={async () => { await signOut(); router.replace('/'); }} />
      <Button kind="outline" dark={dark} label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
      {account?.role === 'pro' ? (
        <Button kind="outline" dark={dark} label="Technician agreement" onPress={() => Linking.openURL(AGREEMENT_URL)} />
      ) : (
        <Button kind="outline" dark={dark} label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
      )}
      <ThisCopy dark={dark} />

      <View style={{ gap: 10, marginTop: 12 }}>
        {!confirming ? (
          <Button kind="outline" dark={dark} label="Delete my account" onPress={() => setConfirming(true)} />
        ) : (
          <View style={[s.danger, dark && s.dangerDark]}>
            <Text style={[s.dangerText, dark && { color: colour.paper }]}>
              This deletes your account and everything in it: your name, your number, {account?.role === 'pro' ? 'your application, ' : ''}{account?.role === 'customer' ? 'your jobs, voice notes, videos and photos, ' : ''}all of it. It cannot be undone.
            </Text>
            <Button kind="danger" label="Yes, delete it" onPress={remove} busy={busy} />
            <Button kind="outline" dark={dark} label="No, keep it" onPress={() => setConfirming(false)} />
          </View>
        )}
        <Notice dark={dark} text={notice} />
      </View>
    </Screen>
  );
}

function Row({ k, v, dark }: { k: string; v: string; dark: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.k, dark && { color: '#b9c2c9' }]}>{k}</Text>
      <Text style={[s.v, dark && { color: colour.paper }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.big, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule, padding: 16, gap: 10 },
  cardDark: { backgroundColor: '#22282d', borderColor: '#22282d' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  k: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  v: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  danger: { gap: 10, padding: 14, borderRadius: radius.big, backgroundColor: '#f6e3dc' },
  dangerDark: { backgroundColor: '#3a2019' },
  dangerText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
