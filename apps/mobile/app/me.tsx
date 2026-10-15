import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { showMobile } from '@pechkas/shared';
import { Body, Button, Notice, Screen, Title } from '../src/components/ui';
import { useAccount } from '../src/account';
import { ask } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

/**
 * The account screen: who you are, sign out, and delete everything. Both app
 * stores require that an account can be deleted from inside the app.
 */
export default function Me() {
  const { session, account, signOut, connected } = useAccount();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dark = account?.role === 'pro';

  const back = <Button kind="outline" dark={dark} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;

  if (!session) {
    return (
      <Screen footer={back}>
        <Title>Your account</Title>
        <Body muted>{connected ? 'Sign in with your mobile number to post jobs and see your offers.' : 'The app is not connected to Pechkas yet.'}</Body>
        {connected ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : null}
      </Screen>
    );
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
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

  const phone = session.user.phone ? showMobile(session.user.phone) : '';

  return (
    <Screen dark={dark} footer={back}>
      <Title dark={dark}>{account?.first_name ? `${account.first_name}` : 'Your account'}</Title>
      <View style={[s.card, dark && s.cardDark]}>
        <Row dark={dark} k="Mobile" v={phone} />
        <Row dark={dark} k="Account" v={account?.role === 'pro' ? 'Technician' : account?.role === 'customer' ? 'Customer' : 'Not finished'} />
      </View>

      {account?.role === 'customer' ? <Button kind="outline" label="I want to work with Pechkas as a technician" onPress={() => router.push('/pro/apply')} /> : null}

      <Button kind="outline" dark={dark} label="Sign out" onPress={async () => { await signOut(); router.replace('/'); }} />

      <View style={{ gap: 10, marginTop: 12 }}>
        {!confirming ? (
          <Button kind="outline" dark={dark} label="Delete my account" onPress={() => setConfirming(true)} />
        ) : (
          <View style={[s.danger, dark && s.dangerDark]}>
            <Text style={[s.dangerText, dark && { color: colour.paper }]}>
              This deletes your account and everything in it: your name, your number, {account?.role === 'pro' ? 'your application, ' : ''}all of it. It cannot be undone.
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
