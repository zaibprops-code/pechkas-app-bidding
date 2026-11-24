import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees } from '@pechkas/shared';
import { findJobs, WORK_THINGS } from '@pechkas/shared/src/work';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { TradeArt } from '../src/components/TradeArt';
import { SystemBars } from '../src/components/ui';
import { useLists } from '../src/lists';
import { colour, font, TAP } from '../src/theme';

/**
 * Search (the owner's choice, 24 November 2026): for somebody who would
 * rather type what they see than guess the trade. Home's search box opens
 * it with the keyboard up. "geyser" finds the geyser jobs under Plumber,
 * "fan" the fans under Electrician (findJobs() in packages/shared/src/work.ts,
 * which the tests check). Each result names its trade and its usual price,
 * exactly as the kind of work's page does, and a tap opens Post a job with
 * that job chosen. "Not on the list?" posts the same trade as Something else.
 * Nothing found: the kinds of work, so nobody is left at a dead end.
 */
export default function Find() {
  const insets = useSafeAreaInsets();
  const lists = useLists();
  const [q, setQ] = useState('');
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const found = useMemo(() => findJobs(q, lists?.job_types ?? [], tradeName), [q, lists]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = q.trim().length >= 2;
  // "Not on the list?" belongs to the trade most of the results are in.
  const likely = found.length ? found[0].trade : null;
  const post = (trade: string, type?: number) => router.push({ pathname: '/post', params: type ? { trade, type: String(type) } : { trade } });

  return (
    <View style={[s.screen, { paddingTop: insets.top + 6 }]}>
      <StatusBar style="dark" />
      <View style={s.bar}>
        <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.back}>
          <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
        </Press>
        <View style={s.box}>
          <Icon name="search" size={20} color={colour.ink} strokeWidth={2.2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search: geyser, fan, leak…"
            placeholderTextColor={colour.steel}
            accessibilityLabel="Search for the job"
            autoCorrect={false}
            returnKeyType="search"
            underlineColorAndroid="transparent"
            style={s.input}
          />
          {q ? (
            <Press onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={10} sink={0.9} style={s.clear}>
              <Icon name="cross" size={13} color={colour.white} strokeWidth={3} />
            </Press>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {!typed ? (
          <Text style={s.hint}>Type what you see — geyser, fan, fridge, leak — and choose the job.</Text>
        ) : found.length ? (
          <>
            <Text style={s.count}>
              {found.length} {found.length === 1 ? 'job' : 'jobs'}
            </Text>
            {found.map((j) => (
              <Press key={j.id} onPress={() => post(j.trade, j.id)} accessibilityRole="button" sink={0.98} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{j.name}</Text>
                  <Text style={s.rowSub}>
                    {tradeName(j.trade)} · {j.list_paisa ? `Usual price ${rupees(j.list_paisa)}` : 'Price after a look'}
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
              </Press>
            ))}
            {likely ? (
              <Press onPress={() => post(likely)} accessibilityRole="button" sink={0.98} style={s.else}>
                <Icon name="mic" size={20} color={colour.ink} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Not on the list?</Text>
                  <Text style={s.rowSub}>{tradeName(likely)} · Something else — describe it</Text>
                </View>
                <Icon name="chevronRight" size={18} color={colour.ink} strokeWidth={2.2} />
              </Press>
            ) : null}
          </>
        ) : (
          <>
            <Text style={s.none}>No job is called that. Choose the kind of work instead:</Text>
            {(lists?.trades ?? []).map((t) => (
              <Press key={t.slug} onPress={() => router.push({ pathname: '/work/[trade]', params: { trade: t.slug } })} accessibilityRole="button" sink={0.98} style={s.row}>
                <View style={s.art}>
                  <TradeArt trade={t.slug} size={30} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t.name}</Text>
                  {WORK_THINGS[t.slug] ? <Text style={s.rowSub}>{WORK_THINGS[t.slug]}</Text> : null}
                </View>
                <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
              </Press>
            ))}
          </>
        )}
      </ScrollView>
      <SystemBars bg={colour.white} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.white },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 18, borderWidth: 2, borderColor: colour.ink, paddingHorizontal: 14 },
  input: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodySemi, fontSize: 16.5, color: colour.ink, outlineWidth: 0 },
  clear: { width: 26, height: 26, borderRadius: 13, backgroundColor: colour.steel, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22, color: colour.steel, marginTop: 18, paddingHorizontal: 4 },
  count: { fontFamily: font.display, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colour.green, marginTop: 16, marginBottom: 2, marginLeft: 4 },
  none: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink, marginTop: 18, marginBottom: 6, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colour.rule },
  rowTitle: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  rowSub: { fontFamily: font.body, fontSize: 13, color: colour.steel, marginTop: 1 },
  art: { width: 42, height: 42, borderRadius: 12, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  else: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: colour.softYellow },
});
