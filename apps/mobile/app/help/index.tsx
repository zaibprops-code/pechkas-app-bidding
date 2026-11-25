import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { HelpTop, OfficeRow, Questions, Section, TopicRow, helpStyles, topInk } from '../../src/components/HelpParts';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { SystemBars, useScrollEnd } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { CUSTOMER_HELP, searchHelp, TECHNICIAN_HELP } from '../../src/help';
import { colour, font, shadow } from '../../src/theme';

/**
 * Help (the owner's design, 25 November 2026): the side's own coloured top
 * with "How can we help?" and a search box; then every topic as a row —
 * icon, name, what is inside and how many answers — each opening its own
 * page (`[topic].tsx`); and the office on WhatsApp as the last row. Typing
 * searches every answer of this side at once, each result saying which
 * topic it is from.
 *
 * Nothing about one job: the job's own screen says what to do next. The
 * legal pages and Safety are in the menu, so they are not repeated here.
 * The answers are `src/help.ts`, each a rule the app already keeps.
 */
export default function Help() {
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  const topics = pro ? TECHNICIAN_HELP : CUSTOMER_HELP;
  const end = useScrollEnd(28);
  const [q, setQ] = useState('');
  const typed = q.trim().length >= 2;
  const found = useMemo(() => (typed ? searchHelp(topics, q) : []), [topics, q, typed]);
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const total = topics.reduce((n, t) => n + t.qa.length, 0);
  const ink = topInk(pro);

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: end }} keyboardShouldPersistTaps="handled">
        <HelpTop pro={pro}>
          <Text style={[ink.title, { marginTop: 10 }]} accessibilityRole="header">
            How can we help?
          </Text>
          <Text style={ink.line}>{pro ? 'About a job, your money or your account' : 'Ask about a job, or find an answer'}</Text>
          <View style={s.box}>
            <Icon name="search" size={20} color={colour.steel} strokeWidth={2.2} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={pro ? 'Search, e.g. what I owe' : 'Search, e.g. visit fee'}
              placeholderTextColor={colour.steel}
              accessibilityLabel="Search the answers"
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
        </HelpTop>

        <View style={helpStyles.body}>
          {typed ? (
            found.length ? (
              <>
                <Section>
                  {found.length === 1 ? '1 answer' : `${found.length} answers`} for “{q.trim()}”
                </Section>
                {/* Keyed by the words, so a new search starts with every answer closed. */}
                <Questions key={q.trim().toLowerCase()} items={found.map((f) => ({ qa: f.qa, topic: f.topic.title }))} words={words} />
                <Text style={helpStyles.quiet}>Not what you need?</Text>
              </>
            ) : (
              <View style={s.nothing}>
                <Text style={s.nothingTitle}>No answer has those words</Text>
                <Text style={s.nothingText}>Try another word, look through the topics, or ask the office.</Text>
                <Press onPress={() => setQ('')} accessibilityRole="button" sink={0.97} style={s.nothingButton}>
                  <Text style={s.nothingButtonText}>Show the topics</Text>
                </Press>
              </View>
            )
          ) : (
            <>
              <Section>Topics · {total} answers</Section>
              <View style={helpStyles.rowCard}>
                {topics.map((t, i) => (
                  <TopicRow key={t.key} topic={t} last={i === topics.length - 1} />
                ))}
              </View>
            </>
          )}
          <OfficeRow />
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, marginTop: 14, paddingLeft: 16, paddingRight: 10, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 4px 14px rgba(20, 23, 26, 0.08)' },
  input: { flex: 1, minHeight: 52, fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink, padding: 0 },
  clear: { width: 26, height: 26, borderRadius: 13, backgroundColor: colour.steel, alignItems: 'center', justifyContent: 'center' },
  nothing: { gap: 8, padding: 18, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  nothingTitle: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  nothingText: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.steel },
  nothingButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, marginTop: 4, borderRadius: 14, backgroundColor: colour.ink, justifyContent: 'center' },
  nothingButtonText: { fontFamily: font.display, fontSize: 14.5, color: colour.white },
});
