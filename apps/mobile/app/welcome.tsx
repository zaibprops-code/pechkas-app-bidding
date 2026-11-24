import { useState } from 'react';
import { firstNameFrom, pakistaniMobile } from '@pechkas/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AuthButton, AuthField, AuthNote, AuthScreen } from '../src/components/AuthScreen';
import { Icon } from '../src/components/Icon';
import { PhoneBox } from '../src/components/PhoneBox';
import { Press } from '../src/components/Press';
import { Notice } from '../src/components/ui';
import { useAccount } from '../src/account';
import { ask } from '../src/supabase';
import { colour, font } from '../src/theme';

type Role = 'customer' | 'pro';

/**
 * First sign-in, after "How will you use Pechkas?" (app/choose.tsx): a first
 * name. Somebody who signed in with an email also gives a mobile number
 * here: the technician they choose, or the customer who chooses them, has to
 * be able to ring. A number Supabase checked by SMS is never asked for again.
 *
 * The choice arrives as `as`; the screen repeats it in one row, with a way
 * back to change it, so nobody fills in a name on the wrong side. It is the
 * last of the sign-in screens (AuthScreen, design "C"): the picture is a name
 * tag that swings in on its hook — or the phone, when only the number is
 * still wanted — and Continue stays pale until what is asked is written.
 */
export default function Welcome() {
  const { next, as } = useLocalSearchParams<{ next?: string; as?: string }>();
  const { refresh, account, session } = useAccount();
  // Back here only for the number: name and mode are already known.
  const known = Boolean(account?.role);
  const needsPhone = account?.needs_phone ?? false;
  const [phone, setPhone] = useState('');
  // Signed in with Google: the box starts with the first name Google gave, which they can change.
  const [name, setName] = useState(() => firstNameFrom(session?.user.user_metadata));
  const role: Role | null = as === 'pro' || as === 'customer' ? as : next === 'join' ? 'pro' : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErrors({});
    setNotice(null);
    if (needsPhone && !phone.trim()) {
      setErrors({ phone: 'Write your mobile number after +92, like 300 1234567.' });
      return;
    }
    setBusy(true);
    let chosen = account?.role ?? role;
    if (!known) {
      const r = await ask<{ role: Role }>('start_as', { p_role: role, p_first_name: name });
      if (!r.ok) {
        setBusy(false);
        if (r.field) setErrors({ [r.field]: r.why });
        else setNotice(r.why);
        return;
      }
      chosen = r.role;
    }
    if (needsPhone) {
      const p = await ask('set_my_phone', { p_phone: phone });
      if (!p.ok) {
        setBusy(false);
        await refresh();
        if (p.field) setErrors({ [p.field]: p.why });
        else setNotice(p.why);
        return;
      }
    }
    await refresh();
    setBusy(false);
    if (router.canDismiss()) router.dismissAll();
    if (chosen === 'pro') router.replace(account?.pro ? '/pro' : '/pro/apply');
    else router.replace(next === 'post' ? '/post' : '/');
  }

  // Not chosen yet: that question comes first, on its own screen.
  if (!known && !role) return <Redirect href={{ pathname: '/choose', params: { next: next ?? '' } }} />;
  const side = account?.role ?? role;
  // Back to the choice already underneath, rather than a second copy of it.
  const change = () => router.dismissTo({ pathname: '/choose', params: { next: next ?? '' } });

  const pro = side === 'pro';
  const ready = (known || name.trim().length > 0) && (!needsPhone || Boolean(pakistaniMobile(phone)));
  return (
    <AuthScreen
      art={known ? 'phone' : 'tag'}
      title={known ? 'What is your mobile number?' : 'What is your first name?'}
      sub={
        known
          ? pro
            ? 'So the customer who chooses you can call you.'
            : 'So the technician you choose can call you.'
          : pro
            ? 'Customers will see this name.'
            : 'Technicians see your first name only.'
      }
      back={!known}
      footer={
        <AuthButton
          label={!known && pro ? 'Continue to the application' : 'Continue'}
          arrow
          onPress={go}
          busy={busy}
          off={!ready}
          hint={needsPhone ? 'Write your name and your whole mobile number first.' : 'Write your first name first.'}
        />
      }
    >
      {known ? null : (
        <View style={s.chosen}>
          <Icon name={pro ? 'briefcase' : 'home'} size={19} color={colour.ink} strokeWidth={2} />
          <Text style={s.chosenText}>{pro ? 'You are a technician' : 'You are a customer'}</Text>
          <Press onPress={change} accessibilityRole="button" accessibilityLabel="Change customer or technician" sink={0.94} style={s.changeButton}>
            <Text style={s.change}>Change</Text>
          </Press>
        </View>
      )}
      {known ? null : (
        <AuthField
          icon="me"
          value={name}
          onChangeText={setName}
          error={Boolean(errors.first_name)}
          accessibilityLabel="Your first name"
          placeholder="Your first name"
          autoCapitalize="words"
          textContentType="givenName"
          autoComplete="name-given"
          autoFocus
          returnKeyType={needsPhone ? 'next' : 'done'}
          onSubmitEditing={() => ready && go()}
        />
      )}
      {errors.first_name ? <AuthNote icon="alert" tone="bad" text={errors.first_name} /> : null}
      {needsPhone ? (
        <>
          {known ? null : <Text style={s.label}>Your mobile number</Text>}
          <PhoneBox big value={phone} onChangeText={setPhone} error={errors.phone} autoFocus={known} />
          {errors.phone ? (
            <AuthNote icon="alert" tone="bad" text={errors.phone} />
          ) : (
            <AuthNote icon="lock" text={pro ? 'Only the customer who chooses you, and Pechkas, will see it.' : 'Only the technician you choose, and Pechkas, will see it.'} />
          )}
        </>
      ) : null}
      {errors.role ? <AuthNote icon="alert" tone="bad" text={errors.role} /> : null}
      <Notice text={notice} />
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: font.displayBold, fontSize: 14, color: colour.ink, marginTop: 4, marginLeft: 4 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colour.cream },
  chosenText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  changeButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  change: { fontFamily: font.display, fontSize: 15, color: colour.ink, textDecorationLine: 'underline' },
});
