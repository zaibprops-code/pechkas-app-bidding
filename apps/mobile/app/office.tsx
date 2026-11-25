import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HelpTop, Section, helpStyles, topInk } from '../src/components/HelpParts';
import { Press } from '../src/components/Press';
import { ReportItem, useReports } from '../src/components/Reports';
import { Button, Loading, SystemBars, useScrollEnd } from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { done } from '../src/message';
import { useAccount } from '../src/account';
import { ask, supabase } from '../src/supabase';
import { colour, font, shadow } from '../src/theme';

/**
 * Write to the office (the owner's rule, 25 November 2026: everything with
 * the office happens inside the app — no call, no WhatsApp, either way).
 * One screen for every question: Help's last row, Support in the menu, and
 * every "Get help" or "Write to the office" button on a job, which opens it
 * with that job already chosen (`?job=`). The person picks the job or "Not
 * about a job", writes, and sends (`write_to_office()`); under the form,
 * everything they told the office and what the office answered or wrote
 * first (`my_reports()`), newest first. A notification says only that the
 * office answered; the words are read here.
 */

type OfficeJob = { id: string; ref: string; title: string; status: string; trade: string | null };

export default function WriteToTheOffice() {
  const { ready, session, account } = useAccount();
  const pro = account?.role === 'pro';
  const params = useLocalSearchParams<{ job?: string }>();
  const end = useScrollEnd(28);
  const toast = useToast();
  const [jobs, setJobs] = useState<OfficeJob[]>([]);
  const [job, setJob] = useState<string | null>(params.job ?? null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const list = useReports(null, sent);
  const ink = topInk(pro);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !session) return;
      void supabase.rpc('office_jobs').then(({ data }) => {
        if (Array.isArray(data)) setJobs(data as OfficeJob[]);
      });
    }, [session]),
  );

  // Wait for the sign-in to be known: opened from a notification, the screen can draw before it is.
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;

  async function send() {
    setBusy(true);
    setError(null);
    const r = await ask('write_to_office', { p_job: job, p_text: text });
    setBusy(false);
    if (!r.ok) return setError(r.why);
    setText('');
    setSent((n) => n + 1);
    toast.show(done('The office answers here, in the app. You are told when it does.', 'Sent'));
  }

  // The job it was opened for stays a choice even when it is older than the list.
  const shown = job && !jobs.some((j) => j.id === job) ? [{ id: job, ref: 'This job', title: '', status: '', trade: null }, ...jobs] : jobs;

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: end }} keyboardShouldPersistTaps="handled">
        <HelpTop pro={pro}>
          <Text style={[ink.title, { marginTop: 10 }]} accessibilityRole="header">
            Write to the office
          </Text>
          <Text style={ink.line}>The office answers here, in the app, 7am to 10pm. It never calls.</Text>
        </HelpTop>

        <View style={helpStyles.body}>
          <View style={s.card}>
            <Text style={s.label}>About which job?</Text>
            <View style={s.chips}>
              <Chip label="Not about a job" on={job === null} onPress={() => setJob(null)} />
              {shown.map((j) => (
                <Chip key={j.id} label={[j.trade, j.ref].filter(Boolean).join(' · ')} on={job === j.id} onPress={() => setJob(j.id)} />
              ))}
            </View>
            <Text style={s.label}>What do you need?</Text>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (error) setError(null);
              }}
              placeholder="Write it in your own words…"
              placeholderTextColor={colour.steel}
              multiline
              maxLength={500}
              accessibilityLabel="What do you need?"
              underlineColorAndroid="transparent"
              style={[s.box, error ? s.boxError : null]}
            />
            {error ? (
              <Text style={s.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button kind="ink" label="Send to the office" busy={busy} disabled={text.trim().length < 5} onPress={send} />
            <Text style={s.small}>You are told when the office answers. Its answer is here{job ? ' and on the job' : ''}.</Text>
          </View>

          {list.length ? (
            <>
              <Section>Your messages</Section>
              {list.map((r) => (
                <ReportItem key={r.id} r={r} withJob white />
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} sink={0.96} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  label: { fontFamily: font.display, fontSize: 15.5, color: colour.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colour.canvas, justifyContent: 'center' },
  chipOn: { backgroundColor: colour.ink },
  chipText: { fontFamily: font.displayBold, fontSize: 13.5, color: colour.ink },
  chipTextOn: { color: colour.white },
  box: { minHeight: 110, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: colour.canvas, fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.ink, textAlignVertical: 'top' },
  boxError: { borderColor: colour.brick },
  error: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.brick },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colour.steel },
});
