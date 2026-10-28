import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Press } from '../../src/components/Press';
import { Body, Button, Chip, Field, Loading, Notice, Screen } from '../../src/components/ui';
import { MenuButton } from '../../src/components/Menu';
import { Panel } from '../../src/components/Panel';
import { DuoRow, RowCard } from '../../src/components/Rows';
import { useAccount } from '../../src/account';
import { openLegal } from '../../src/legal';
import { ask, supabase } from '../../src/supabase';
import { proError, useProWords } from '../../src/words';
import { colour, font } from '../../src/theme';

type Lists = { trades: { slug: string; name: string }[]; sectors: string[] };

/**
 * A technician's application. No CNIC number, no photograph of the card: the
 * owner sees the card when they meet, and records only that he did.
 * Applying is free, and the form says so.
 */
export default function Apply() {
  const { ready, session, account, refresh } = useAccount();
  const { w } = useProWords();
  const [lists, setLists] = useState<Lists | null>(null);
  const [fullName, setFullName] = useState(account?.pro?.full_name ?? '');
  const [trades, setTrades] = useState<string[]>(account?.pro?.trades ?? []);
  const [years, setYears] = useState<number>(account?.pro?.years ?? 1);
  const [sectors, setSectors] = useState<string[]>(account?.pro?.sectors ?? []);
  const [about, setAbout] = useState(account?.pro?.about ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase?.rpc('app_lists').then(({ data }) => setLists((data as Lists) ?? null));
  }, []);

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (!account?.role) return <Redirect href={{ pathname: '/welcome', params: { as: 'pro', next: 'join' } }} />;
  if (account.pro && (account.pro.status === 'approved' || account.pro.status === 'suspended')) return <Redirect href="/pro" />;

  const flip = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  async function send() {
    setErrors({});
    setNotice(null);
    setBusy(true);
    const r = await ask('apply_as_pro', {
      p_full_name: fullName,
      p_trades: trades,
      p_years: years,
      p_sectors: sectors,
      p_about: about,
    });
    if (!r.ok) {
      setBusy(false);
      if (r.field) {
        setErrors({ [r.field]: proError(w, r.field, r.why) });
        setNotice(w.fixAbove);
      } else setNotice(r.why);
      return;
    }
    await refresh();
    setBusy(false);
    router.replace('/pro');
  }

  return (
    <Screen
      hero={{ title: w.applyTitle, sub: w.applyIntro, left: <MenuButton /> }}
      footer={<Button label={busy ? w.sending : w.send} icon={busy ? undefined : 'arrowRight'} onPress={send} busy={busy} />}
    >
      {/* The rules first, one tap away, before anybody fills anything in. */}
      <RowCard>
        <DuoRow icon="doc" label={w.agreement} onPress={() => openLegal('technician-agreement')} last />
      </RowCard>

      <Panel>
        <Field label={w.fullName} value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" textContentType="name" error={errors.full_name} hint={w.noCnic} />
      </Panel>

      <Panel icon="briefcase" title={w.trades} hint={w.tradesHint}>
        <View style={s.chips}>
          {lists ? lists.trades.map((t) => <Chip key={t.slug} label={t.name} on={trades.includes(t.slug)} onPress={() => flip(trades, setTrades, t.slug)} />) : <Body muted>…</Body>}
        </View>
        {errors.trades ? <Text style={s.error}>{errors.trades}</Text> : null}
      </Panel>

      <Panel icon="clock" title={w.years}>
        <View style={s.stepper}>
          <Press onPress={() => setYears(Math.max(0, years - 1))} sink={0.9} accessibilityRole="button" accessibilityLabel="−1" style={s.step}>
            <Text style={s.stepText}>−</Text>
          </Press>
          <Text style={s.years} accessibilityLiveRegion="polite">
            {years} <Text style={s.yearsUnit}>{w.yearsUnit}</Text>
          </Text>
          <Press onPress={() => setYears(Math.min(60, years + 1))} sink={0.9} accessibilityRole="button" accessibilityLabel="+1" style={[s.step, s.stepPlus]}>
            <Text style={[s.stepText, { color: colour.ink }]}>+</Text>
          </Press>
        </View>
        {errors.years ? <Text style={s.error}>{errors.years}</Text> : null}
      </Panel>

      <Panel icon="pin" title={w.sectors}>
        <View style={s.chips}>
          {lists ? lists.sectors.map((name) => <Chip key={name} label={name.replace('-', '\u2011')} on={sectors.includes(name)} onPress={() => flip(sectors, setSectors, name)} />) : <Body muted>…</Body>}
        </View>
        {errors.sectors ? <Text style={s.error}>{errors.sectors}</Text> : null}
      </Panel>

      <Panel>
        <Field label={w.about} value={about} onChangeText={setAbout} multiline maxLength={300} style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} error={errors.about} hint={w.aboutHint} />
      </Panel>

      <Notice text={notice} />
    </Screen>
  );
}

const s = StyleSheet.create({
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 999, backgroundColor: colour.canvas },
  step: { width: 52, height: 52, borderRadius: 999, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 26, color: colour.ink, marginTop: -2 },
  years: { fontFamily: font.display, fontSize: 32, color: colour.ink },
  yearsUnit: { fontFamily: font.bodyMedium, fontSize: 15, color: colour.steel },
});
