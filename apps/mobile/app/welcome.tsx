import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Button, Field, Notice, Screen } from '../src/components/ui';
import { useAccount } from '../src/account';
import { ask } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

type Role = 'customer' | 'pro';

/**
 * First sign-in, after "How will you use Pechkas?" (app/choose.tsx): a first
 * name. Somebody who signed in with an email also gives a mobile number
 * here: the technician they choose, or the customer who chooses them, has to
 * be able to ring. A number Supabase checked by SMS is never asked for again.
 *
 * The choice arrives as `as`; the top of the screen repeats it, with a way
 * back to change it, so nobody fills in a name on the wrong side.
 */
export default function Welcome() {
  const { next, as } = useLocalSearchParams<{ next?: string; as?: string }>();
  const { refresh, account } = useAccount();
  // Back here only for the number: name and mode are already known.
  const known = Boolean(account?.role);
  const needsPhone = account?.needs_phone ?? false;
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const role: Role | null = as === 'pro' || as === 'customer' ? as : next === 'join' ? 'pro' : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErrors({});
    setNotice(null);
    if (needsPhone && !phone.trim()) {
      setErrors({ phone: 'Write your mobile number, like 0300 1234567.' });
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

  return (
    <Screen
      hero={{
        title: known ? 'One more thing' : side === 'pro' ? 'About you' : 'Welcome',
        sub: known
          ? 'Your mobile number, so the other side can call you.'
          : side === 'pro'
            ? 'Your first name, then a short application.'
            : needsPhone
              ? 'Your name and number, and you are in.'
              : 'Your first name, and you are in.',
        back: known ? undefined : change,
      }}
      footer={<Button label={!known && side === 'pro' ? 'Continue to the application' : 'Continue'} onPress={go} busy={busy} icon={!known && side === 'pro' ? 'arrowRight' : undefined} />}
    >
      {known ? null : (
        <View style={s.chosen}>
          <View style={s.chosenIcon}>
            <Icon name={side === 'pro' ? 'tool' : 'home'} size={20} color={colour.yellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.chosenLabel}>You are here to</Text>
            <Text style={s.chosenText}>{side === 'pro' ? 'Fix things for customers' : 'Get something fixed'}</Text>
          </View>
          <Press onPress={change} accessibilityRole="button" accessibilityLabel="Change how you will use Pechkas" style={s.changeButton}>
            <Text style={s.change}>Change</Text>
          </Press>
        </View>
      )}
      {needsPhone ? (
        <Field
          label="Your mobile number"
          value={phone}
          onChangeText={setPhone}
          placeholder="0300 1234567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          error={errors.phone}
          hint={side === 'pro'
            ? 'The customer who chooses you rings you on this number. Nobody else sees it.'
            : 'The technician you choose rings you on this number. Nobody else sees it.'}
        />
      ) : null}
      {known ? null : (
      <Field
        label="Your first name"
        value={name}
        onChangeText={setName}
        placeholder="Ayesha"
        autoCapitalize="words"
        textContentType="givenName"
        autoComplete="name-given"
        error={errors.first_name}
        hint={side === 'pro' ? 'Customers will see this name.' : 'This is the only name a technician sees.'}
      />
      )}
      {errors.role ? <Text style={s.error}>{errors.role}</Text> : null}
      <Notice text={notice} />
    </Screen>
  );
}

const s = StyleSheet.create({
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 4, borderRadius: radius.big, backgroundColor: colour.white },
  chosenIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  chosenLabel: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  chosenText: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  changeButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  change: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
