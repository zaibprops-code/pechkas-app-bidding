import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon, type IconName } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Body, Button, Field, Notice, Screen, Title } from '../src/components/ui';
import { useAccount } from '../src/account';
import { ask } from '../src/supabase';
import { colour, font, radius } from '../src/theme';

type Role = 'customer' | 'pro';

/**
 * First sign-in: a first name, and which side of Pechkas this person is on.
 * Somebody who signed in with an email also gives a mobile number here:
 * the technician they choose, or the customer who chooses them, has to be
 * able to ring. A number Supabase checked by SMS is never asked for again.
 */
export default function Welcome() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refresh, account } = useAccount();
  // Back here only for the number: name and role are already known.
  const known = Boolean(account?.role);
  const needsPhone = account?.needs_phone ?? false;
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(next === 'join' ? 'pro' : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErrors({});
    setNotice(null);
    if (!known && !role) {
      setErrors({ role: 'Choose one of the two.' });
      return;
    }
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

  return (
    <Screen footer={<Button label="Continue" onPress={go} busy={busy} />}>
      <Title>{known ? 'One more thing' : 'Assalam o Alaikum'}</Title>
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
          hint={(account?.role ?? role) === 'pro'
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
        hint={role === 'pro' ? 'Customers will see this name.' : 'This is the only name a technician sees.'}
      />
      )}
      {known ? null : (
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        <Text style={s.label}>Why are you here?</Text>
        <Choice icon="ac" title="I need something fixed" sub="Post a job, get offers, pick a technician." on={role === 'customer'} onPress={() => setRole('customer')} />
        <Choice icon="bolt" title="I fix things" sub="Apply to get jobs from Pechkas customers." on={role === 'pro'} onPress={() => setRole('pro')} />
        {errors.role ? <Text style={s.error}>{errors.role}</Text> : null}
      </View>
      )}
      <Body muted>Your number stays private. A technician only gets it after you choose him.</Body>
      <Notice text={notice} />
    </Screen>
  );
}

function Choice({ icon, title, sub, on, onPress }: { icon: IconName; title: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[s.choice, { borderColor: on ? colour.green : 'rgba(20,23,26,0.14)', borderWidth: on ? 2.5 : 1 }]}
    >
      <View style={[s.choiceIcon, { backgroundColor: on ? colour.green : colour.paper2 }]}>
        <Icon name={icon} size={22} color={on ? colour.yellow : colour.green} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceSub}>{sub}</Text>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.big, backgroundColor: colour.white },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  choiceSub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
