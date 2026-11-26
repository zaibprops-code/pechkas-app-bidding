import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findJobs, workArt, WORK_SUGGESTIONS, WORK_THINGS } from '@pechkas/shared/src/work';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Rise, useRises } from '../src/components/Rise';
import { pictureOf, WorkArt } from '../src/components/WorkArt';
import { SystemBars } from '../src/components/ui';
import { PricePill, YellowTop } from '../src/components/YellowTop';
import { useLists } from '../src/lists';
import { colour, font } from '../src/theme';

/**
 * Search (the owner's choice, 24 November 2026), in the new look: the yellow
 * top with "What do you see?" and the keyboard up. Before anything is typed,
 * ten words people often say, to tap rather than spell (WORK_SUGGESTIONS —
 * the tests check every one finds a job), and a line for somebody who does
 * not know what the thing is called. The results are cards: the job's own
 * drawing, its name, its trade and its usual price in a pill; a tap opens
 * Post a job with it chosen. "Not on the list?" posts the same trade as
 * Something else. Nothing found: the kinds of work, never a dead end.
 */
export default function Find() {
  const insets = useSafeAreaInsets();
  const lists = useLists();
  const [q, setQ] = useState('');
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const found = useMemo(() => findJobs(q, lists?.job_types ?? [], tradeName), [q, lists]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = q.trim().length >= 2;
  const likely = found.length ? found[0].trade : null;
  const post = (trade: string, type?: number) => router.push({ pathname: '/post', params: type ? { trade, type: String(type) } : { trade } });
  const rows = !typed ? WORK_SUGGESTIONS.length + 1 : found.length ? found.length + 1 : (lists?.trades.length ?? 0) + 1;
  const rises = useRises(rows, !typed ? 'words' : found.length ? `found:${found.map((j) => j.id).join(',')}` : 'none', 35);

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <YellowTop after={<Text style={s.heading}>Search</Text>}>
        <View style={s.box}>
          <Icon name="search" size={20} color={colour.ink} strokeWidth={2.2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="What do you see?"
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
      </YellowTop>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 18, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {!typed ? (
          <>
            <Text style={s.label}>Try one of these</Text>
            <View style={s.words}>
              {WORK_SUGGESTIONS.map((w, i) => (
                <Rise key={w} v={rises[i]}>
                  <Press onPress={() => setQ(w)} accessibilityRole="button" accessibilityLabel={`Search for ${w}`} sink={0.95} style={s.word}>
                    <Text style={s.wordText}>{w}</Text>
                  </Press>
                </Rise>
              ))}
            </View>
            <Rise v={rises[WORK_SUGGESTIONS.length]}>
              <View style={s.unsure}>
                <View style={s.mic}>
                  <Icon name="mic" size={22} color={colour.white} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>Not sure what it is called?</Text>
                  <Text style={s.sub}>Choose the kind of work on home, then send a voice note. Urdu is fine.</Text>
                </View>
              </View>
            </Rise>
          </>
        ) : found.length ? (
          <>
            <Text style={s.count}>
              {found.length} {found.length === 1 ? 'job' : 'jobs'} found
            </Text>
            {found.map((j, i) => (
              <Rise key={j.id} v={rises[i]}>
                <Press onPress={() => post(j.trade, j.id)} accessibilityRole="button" accessibilityLabel={`${j.name}. ${tradeName(j.trade)}`} sink={0.98} style={s.card}>
                  <View style={s.art}>
                    <WorkArt art={workArt(j.trade, j.name)} source={pictureOf(j.trade, j.name)} size={36} picture={44} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title}>{j.name}</Text>
                    <Text style={s.sub}>{tradeName(j.trade)}</Text>
                  </View>
                  <PricePill paisa={j.list_paisa} />
                </Press>
              </Rise>
            ))}
            {likely ? (
              <Rise v={rises[found.length]}>
                <Press onPress={() => post(likely)} accessibilityRole="button" sink={0.98} style={s.notListed}>
                  <View style={s.mic}>
                    <Icon name="mic" size={22} color={colour.white} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>Not on the list?</Text>
                    <Text style={s.sub}>{tradeName(likely)} · say it in your own words</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colour.ink} strokeWidth={2.2} />
                </Press>
              </Rise>
            ) : null}
          </>
        ) : (
          <>
            <Text style={s.none}>No job is called that. Choose the kind of work instead:</Text>
            {(lists?.trades ?? []).map((t, i) => (
              <Rise key={t.slug} v={rises[i]}>
                <Press onPress={() => router.push({ pathname: '/work/[trade]', params: { trade: t.slug } })} accessibilityRole="button" sink={0.98} style={s.card}>
                  <View style={s.art}>
                    <WorkArt art={t.slug} size={36} picture={44} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title}>{t.name}</Text>
                    {WORK_THINGS[t.slug] ? <Text style={s.sub}>{WORK_THINGS[t.slug]}</Text> : null}
                  </View>
                  <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
                </Press>
              </Rise>
            ))}
          </>
        )}
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  heading: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, marginTop: 12, borderRadius: 18, borderWidth: 2, borderColor: colour.ink, backgroundColor: colour.white, paddingHorizontal: 14, boxShadow: '0px 8px 22px rgba(60, 40, 0, 0.16)' },
  input: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodySemi, fontSize: 17, color: colour.ink, outlineWidth: 0 },
  clear: { width: 26, height: 26, borderRadius: 13, backgroundColor: colour.steel, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.display, fontSize: 16, color: colour.ink, marginLeft: 4 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.white, borderWidth: 1.5, borderColor: colour.rule, justifyContent: 'center' },
  wordText: { fontFamily: font.displayBold, fontSize: 15, color: colour.ink },
  unsure: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 16, borderRadius: 20, backgroundColor: colour.cream },
  mic: { width: 46, height: 46, borderRadius: 23, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: font.display, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: colour.green, marginLeft: 4 },
  none: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink, marginHorizontal: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.07)' },
  art: { width: 48, height: 48, borderRadius: 14, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 15.5, lineHeight: 20, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel, marginTop: 1 },
  notListed: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(20,23,26,0.25)' },
});
