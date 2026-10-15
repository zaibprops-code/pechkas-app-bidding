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

/** First sign-in: a first name, and which side of Pechkas this person is on. */
export default function Welcome() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refresh } = useAccount();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(next === 'join' ? 'pro' : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErrors({});
    setNotice(null);
    if (!role) {
      setErrors({ role: 'Choose one of the two.' });
      return;
    }
    setBusy(true);
    const r = await ask<{ role: Role }>('start_as', { p_role: role, p_first_name: name });
    if (!r.ok) {
      setBusy(false);
      if (r.field) setErrors({ [r.field]: r.why });
      else setNotice(r.why);
      return;
    }
    await refresh();
    setBusy(false);
    if (router.canDismiss()) router.dismissAll();
    router.replace(r.role === 'pro' ? '/pro/apply' : '/');
  }

  return (
    <Screen footer={<Button label="Continue" onPress={go} busy={busy} />}>
      <Title>Assalam o Alaikum</Title>
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
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        <Text style={s.label}>Why are you here?</Text>
        <Choice icon="ac" title="I need something fixed" sub="Post a job, get offers, pick a technician." on={role === 'customer'} onPress={() => setRole('customer')} />
        <Choice icon="bolt" title="I fix things" sub="Apply to get jobs from Pechkas customers." on={role === 'pro'} onPress={() => setRole('pro')} />
        {errors.role ? <Text style={s.error}>{errors.role}</Text> : null}
      </View>
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
