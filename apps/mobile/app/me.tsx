import { useToast } from '../src/components/Toast';
import { done } from '../src/message';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { showMobile } from '@pechkas/shared';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { DuoRow } from '../src/components/Rows';
import { ModeSwitch } from '../src/components/ModeSwitch';
import { ThisCopy } from '../src/components/ThisCopy';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { openLegal } from '../src/legal';
import { ask, supabase } from '../src/supabase';
import { colour, font, radius, shadow } from '../src/theme';

/**
 * Settings — the account screen: who you are, your number, which side of
 * the app you are on, notifications, the legal pages, sign out, and delete
 * everything (both app stores require that an account can be deleted from
 * inside the app). Laid out as the menu is: the person on a green card,
 * then white cards of rows with two-tone icons.
 */
export default function Me() {
  const { session, account, signOut, connected, refresh } = useAccount();
  const [editing, setEditing] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const toast = useToast();
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
    toast.show(done('Your number is saved.'));
  }

  const pro = account?.role === 'pro';
  const role = pro ? 'Technician' : account?.role === 'customer' ? 'Customer' : 'Account not finished';
  const unchecked = account?.phone_checked === false;
  // Just the number on the card; the row under it says whether it was checked.
  const who = number ? showMobile(number) : account?.email ?? '';
  // What this phone is doing about notifications, in words, and a chip saying On or Off.
  const notifyWhat =
    notify === 'on' ? 'This phone is told about your jobs' : notify === 'ask' ? 'Tap to turn them on' : notify === 'off' ? "Turned off in your phone's settings" : null;

  return (
    <Screen hero={{ title: 'Settings', back: () => (router.canGoBack() ? router.back() : router.replace('/')) }}>
      {/* Who is signed in, the way the menu shows it. */}
      <View style={s.profile} accessible accessibilityLabel={`${account?.first_name ?? 'Your account'}${who ? `, ${who}` : ''}, ${role}`}>
        <View style={s.initial}>
          <Text style={s.initialText}>{(account?.first_name ?? '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.name} numberOfLines={2}>
            {account?.first_name || 'Your account'}
          </Text>
          {who ? (
            <Text style={s.who} numberOfLines={1}>
              {who}
            </Text>
          ) : null}
          <View style={s.side}>
            <Text style={s.sideText}>{role}</Text>
          </View>
        </View>
      </View>

      <View style={s.card}>
        <DuoRow
          icon="phone"
          label="Mobile number"
          value={phone}
          onPress={unchecked && !editing ? () => setEditing(true) : undefined}
          right={unchecked && !editing ? <Text style={s.change}>Change</Text> : undefined}
          last={!account?.email && !editing}
        />
        {account?.email ? <DuoRow icon="mail" label="Email" value={account.email} oneLine last={!editing} /> : null}
        {editing ? (
          <View style={s.edit}>
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
      </View>

      {account?.role ? (
        <View style={[s.card, s.mode]}>
          <Text style={s.modeNow}>You are using Pechkas {pro ? 'as a technician' : 'as a customer'}.</Text>
          <ModeSwitch pill />
        </View>
      ) : null}

      <View style={s.card}>
        {notifyWhat ? (
          <DuoRow
            icon="bell"
            label="Notifications"
            value={notifyWhat}
            onPress={notify === 'ask' ? askNotify : notify === 'off' ? () => Linking.openSettings() : undefined}
            right={
              <View style={[s.chip, notify === 'on' ? s.chipOn : s.chipOff]}>
                <Text style={[s.chipText, notify === 'on' ? s.chipTextOn : null]}>{notify === 'on' ? 'On' : 'Off'}</Text>
              </View>
            }
          />
        ) : null}
        <DuoRow icon="lock" label="Privacy policy" onPress={() => openLegal('privacy')} />
        {pro ? (
          <DuoRow icon="doc" label="Technician agreement" onPress={() => openLegal('technician-agreement')} last />
        ) : (
          <DuoRow icon="doc" label="Terms of use" onPress={() => openLegal('terms')} last />
        )}
      </View>

      <View style={s.card}>
        <DuoRow icon="logout" label="Sign out" onPress={async () => { await signOut(); router.replace('/start'); }} />
        <DuoRow icon="trash" label="Delete my account" danger onPress={() => setConfirming(true)} last={!confirming} />
        {confirming ? (
          <View style={s.danger}>
            <Text style={s.dangerText}>
              This deletes your account and everything in it: your name, your number, {pro ? 'your application, ' : ''}{account?.role === 'customer' ? 'your jobs, voice notes, videos and photos, ' : ''}all of it. It cannot be undone.
            </Text>
            <Button kind="danger" label="Yes, delete it" onPress={remove} busy={busy} />
            <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
          </View>
        ) : null}
      </View>
      <Notice text={notice} />

      <ThisCopy />
    </Screen>
  );
}

const SHADOW = shadow.card;

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: colour.green },
  initial: { width: 60, height: 60, borderRadius: 30, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: font.display, fontSize: 26, color: colour.ink },
  name: { fontFamily: font.display, fontSize: 22, lineHeight: 27, color: colour.white },
  who: { fontFamily: font.bodyMedium, fontSize: 14, color: '#d7e6e3' },
  side: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  sideText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.white },
  card: { paddingHorizontal: 14, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  mode: { gap: 12, paddingVertical: 16 },
  modeNow: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.steel },
  change: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green, textDecorationLine: 'underline' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  chipOn: { backgroundColor: colour.greenSoft },
  chipOff: { backgroundColor: colour.canvas },
  chipText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.inkSoft },
  chipTextOn: { color: colour.greenDark },
  edit: { gap: 8, paddingTop: 14, paddingBottom: 14 },
  danger: { gap: 10, padding: 14, marginBottom: 14, borderRadius: 18, backgroundColor: '#f6e3dc' },
  dangerText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
