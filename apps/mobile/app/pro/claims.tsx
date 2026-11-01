import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, dayLabel, openWindows, pkNow, rupees, showMobile, windowLabel } from '@pechkas/shared';
import { Button, Chip, Hero, Loading, Notice, SystemBars } from '../../src/components/ui';
import { MenuButton } from '../../src/components/Menu';
import { Panel } from '../../src/components/Panel';
import { MediaPick, isVideo } from '../../src/components/MediaPick';
import { RemoteMedia } from '../../src/post/RemoteMedia';
import { useToast } from '../../src/components/Toast';
import { done } from '../../src/message';
import { useAccount } from '../../src/account';
import { ask, supabase } from '../../src/supabase';
import { useProWords } from '../../src/words';
import { colour, font, radius } from '../../src/theme';

/**
 * His guarantee claims (checks_and_guarantee): a customer says a fault on
 * his work has come back. He has 24 hours to answer "I'll come" — a
 * two-hour window starting within 48 hours — or "This isn't my work", for
 * the office to decide. At the house, "It's fixed" with a photo. A charge
 * for a replacement is recorded first and only added to what he owes after
 * 7 days; until then he can appeal once, and an appeal holds it until the
 * office decides (guarantee_followups).
 *
 * Before he accepts he has her first name and the sector only; once he is
 * coming, the address and her number, as with any job (pro_claims()).
 */

type Claim = {
  id: string;
  status: 'waiting' | 'coming' | 'checking' | 'refused' | 'replacing' | 'disputed' | 'fixed' | 'not_covered';
  job_id: string;
  ref: string;
  title: string;
  sector: string;
  customer_first_name: string;
  description: string;
  media: string[];
  answer_due: string;
  late: boolean;
  can_answer: boolean;
  visit_date: string | null;
  visit_from: number | null;
  street: string | null;
  house: string | null;
  landmark: string | null;
  gate_note: string | null;
  customer_phone: string | null;
  why_replacing: 'no_answer' | 'missed_visit' | 'office' | null;
  still_broken: string | null;
  office_note: string | null;
  charge_paisa: number | null;
  charge_due: string | null;
  /** Added to what he owes. False while it waits for its date, or for the office's decision on his appeal. */
  charge_final: boolean;
  appeal_until: string | null;
  can_appeal: boolean;
  appeal_at: string | null;
  appeal_outcome: 'upheld' | 'cancelled' | null;
  appeal_note: string | null;
  blocks: boolean;
};

const STATUS: Record<Claim['status'], string> = {
  waiting: 'Answer needed',
  coming: 'You are going back',
  checking: 'Customer checking your repair',
  refused: 'Pechkas is deciding',
  disputed: 'Pechkas is deciding',
  replacing: 'Another technician is being sent',
  fixed: 'Closed',
  not_covered: 'Not covered',
};

/** "Mon 2 Nov, 3:39pm", on Pakistan's clock. */
const at = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })}, ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })
    .replace(' ', '')
    .toLowerCase()}`;
};

export default function Claims() {
  const insets = useSafeAreaInsets();
  const { w } = useProWords();
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('pro_claims');
    if (error) return setProblem('No connection. Pull down to try again.');
    setProblem(null);
    setRows((data as Claim[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!rows && !problem) return <Loading />;
  const open = (rows ?? []).filter(
    (c) => !['fixed', 'not_covered'].includes(c.status) || c.can_appeal || (c.appeal_at && !c.appeal_outcome) || (c.charge_paisa && !c.charge_final && c.appeal_outcome !== 'cancelled'),
  );
  const closed = (rows ?? []).filter((c) => !open.includes(c));

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}>
        <Hero title={w.claimsTitle} sub="When a customer says a fault on your work has come back." left={<MenuButton />} />
        <View style={{ paddingTop: 12, paddingHorizontal: 16, gap: 14 }}>
          <Notice text={problem} />
          {rows && !rows.length ? (
            <Panel icon="shield" title="No guarantee claims" hint="Good work keeps it that way. If a customer claims, you are told at once and have 24 hours to answer." />
          ) : null}
          {open.map((c) => (
            <ClaimCard key={c.id} c={c} onChanged={load} />
          ))}
          {closed.length ? <Text style={s.section}>Closed recently</Text> : null}
          {closed.map((c) => (
            <ClaimCard key={c.id} c={c} onChanged={load} />
          ))}
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

function ClaimCard({ c, onChanged }: { c: Claim; onChanged: () => void }) {
  const { session } = useAccount();
  const toast = useToast();
  const [mode, setMode] = useState<'come' | 'refuse' | 'fixed' | 'appeal' | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const now = pkNow();
  const limit = Date.now() + 48 * 3600e3;
  const startOf = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+05:00`).getTime();
  const days = [0, 1, 2].map((i) => addDays(now.date, i)).filter((d) => openWindows(d, now).some((h) => startOf(d, h) <= limit));
  const windows = day ? openWindows(day, now).filter((h) => startOf(day, h) <= limit) : [];

  async function send(fn: string, args: Record<string, unknown>, after: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask(fn, args);
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setMode(null);
    setText('');
    setPhotos([]);
    toast.show(done(after));
    onChanged();
  }

  const items = c.media.map((path) => ({ kind: (isVideo(path) ? 'video' : 'photo') as 'video' | 'photo', path, seconds: null }));

  return (
    <View style={[s.card, c.blocks && s.cardBlocking]}>
      <View style={s.top}>
        <Text style={s.kicker}>
          {c.ref} · {c.sector}
        </Text>
        <View style={[s.chip, c.status === 'waiting' && s.chipNow]}>
          <Text style={s.chipText}>{STATUS[c.status]}</Text>
        </View>
      </View>
      <Text style={s.title}>{c.title}</Text>
      <Text style={s.line}>
        <Text style={s.strong}>{c.customer_first_name}:</Text> “{c.description}”
      </Text>
      <RemoteMedia items={items} voiceLabel="Play" videoLabel="Watch her video" />

      {c.status === 'waiting' || c.can_answer ? (
        <Text style={[s.due, c.late && { color: colour.brick }]}>
          {c.late ? 'The time to answer has passed. Answer now, before a replacement is booked.' : `Answer by ${at(c.answer_due)}, or your new offers stop.`}
        </Text>
      ) : null}

      {c.can_answer && mode === null ? (
        <View style={{ gap: 8 }}>
          <Button kind="yellow" label="I’ll come" onPress={() => setMode('come')} />
          <Button kind="outline" label="This isn’t my work" onPress={() => setMode('refuse')} />
        </View>
      ) : null}

      {mode === 'come' ? (
        <View style={s.form}>
          <Text style={s.label}>Which day? (within 48 hours)</Text>
          <View style={s.wrap}>
            {days.map((d) => (
              <Chip key={d} label={dayLabel(d, now.date)} on={day === d} onPress={() => { setDay(d); setFrom(null); }} />
            ))}
          </View>
          {day ? (
            <>
              <Text style={s.label}>When will you arrive?</Text>
              <View style={s.wrap}>
                {windows.map((h) => (
                  <Chip key={h} label={windowLabel(h)} on={from === h} onPress={() => setFrom(h)} />
                ))}
              </View>
            </>
          ) : null}
          <Text style={s.note}>The repair is free for {c.customer_first_name}. She is told your time.</Text>
          <Button kind="yellow" label="Send my time" busy={busy} onPress={() => send('answer_claim', { p_claim: c.id, p_come: true, p_date: day, p_from: from, p_reason: null }, 'She has been told when you will come.')} />
          <Button kind="outline" label="Back" onPress={() => setMode(null)} />
        </View>
      ) : null}

      {mode === 'refuse' ? (
        <View style={s.form}>
          <Text style={s.label}>Why is this not your work?</Text>
          <TextInput value={text} onChangeText={setText} maxLength={300} multiline accessibilityLabel="Why is this not your work" style={s.input} />
          <Text style={s.note}>Pechkas looks at the photos from both jobs and decides. If it finds the fault is yours, another technician is sent and the cost is charged to you, never more than your labour on the job.</Text>
          <Button kind="yellow" label="Send to Pechkas" busy={busy} onPress={() => send('answer_claim', { p_claim: c.id, p_come: false, p_date: null, p_from: null, p_reason: text }, 'Pechkas will decide.')} />
          <Button kind="outline" label="Back" onPress={() => setMode(null)} />
        </View>
      ) : null}

      {c.status === 'coming' ? (
        <View style={s.form}>
          <Text style={s.strongLine}>
            Go back {c.visit_date ? `on ${dayLabel(c.visit_date, now.date)}, ${windowLabel(c.visit_from ?? 8)}` : ''}
          </Text>
          <Text style={s.line}>
            {c.house}, {c.street}, {c.sector}
            {c.landmark ? ` · ${c.landmark}` : ''}
            {c.gate_note ? ` · ${c.gate_note}` : ''}
          </Text>
          {c.customer_phone ? (
            <Button kind="outline" label={`Call ${c.customer_first_name} · ${showMobile(c.customer_phone)}`} onPress={() => Linking.openURL(`tel:+${c.customer_phone!.replace(/^\+/, '')}`)} />
          ) : null}
          {mode !== 'fixed' ? <Button kind="yellow" label="It’s fixed" onPress={() => setMode('fixed')} /> : null}
          {mode === 'fixed' && session ? (
            <>
              <Text style={s.label}>A photo of the repair</Text>
              <MediaPick paths={photos} setPaths={setPhotos} userId={session.user.id} onProblem={setMsg} />
              <Button kind="yellow" label="Send: it’s fixed" busy={busy} onPress={() => send('claim_fixed', { p_claim: c.id, p_photos: photos }, `${c.customer_first_name} is asked to check it.`)} />
              <Button kind="outline" label="Back" onPress={() => setMode(null)} />
            </>
          ) : null}
        </View>
      ) : null}

      {c.status === 'checking' ? <Text style={s.note}>{c.customer_first_name} is checking your repair. If nobody answers, it closes by itself after 24 hours.</Text> : null}
      {c.status === 'refused' ? <Text style={s.note}>You said this is not your work. Pechkas is looking at the photos and will decide.</Text> : null}
      {c.status === 'disputed' ? <Text style={s.note}>{c.customer_first_name} says it is still broken: “{c.still_broken}”. Pechkas is deciding.</Text> : null}
      {c.status === 'replacing' ? (
        <Text style={s.note}>
          {c.why_replacing === 'office'
            ? `Pechkas decided the fault is covered: “${c.office_note ?? ''}”. Another technician is being sent, and the cost will be charged to you, never more than your labour on the job.`
            : c.why_replacing === 'missed_visit'
              ? 'The visit was missed. Another technician is being sent, and the cost will be charged to you, never more than your labour on the job. Your new offers come back when it is closed.'
              : 'You did not answer in time. Another technician is being sent, and the cost will be charged to you, never more than your labour on the job.'}
        </Text>
      ) : null}
      {c.status === 'not_covered' ? <Text style={s.note}>Pechkas found this is not covered: “{c.office_note ?? ''}”</Text> : null}

      {c.charge_paisa ? (
        <View style={s.charge}>
          <Text style={s.strongLine}>
            {c.appeal_outcome === 'cancelled'
              ? `${rupees(c.charge_paisa)} charge cancelled`
              : c.charge_final
                ? `${rupees(c.charge_paisa)} added to what you owe`
                : `${rupees(c.charge_paisa)} to be charged for the replacement repair`}
          </Text>
          {c.appeal_outcome ? (
            <Text style={s.note}>
              {c.appeal_outcome === 'cancelled'
                ? 'Your appeal was accepted. Nothing is added to what you owe.'
                : 'Your appeal was not accepted, so the charge has been added to what you owe.'}{' '}
              “{c.appeal_note ?? ''}”
            </Text>
          ) : c.appeal_at ? (
            <Text style={s.note}>You appealed. Nothing is added to what you owe until Pechkas decides.</Text>
          ) : c.charge_final ? (
            <Text style={s.note}>It is final. Pay it from My account, through Pay Pechkas.</Text>
          ) : c.can_appeal && mode !== 'appeal' ? (
            <>
              <Text style={s.note}>
                It is added to what you owe on {c.appeal_until ? at(c.appeal_until) : 'its date'} unless you appeal before then. Never more than your labour on the job.
              </Text>
              <Button kind="outline" label="Appeal" onPress={() => setMode('appeal')} />
            </>
          ) : null}
          {mode === 'appeal' && session ? (
            <View style={s.form}>
              <Text style={s.label}>Why is the charge wrong?</Text>
              <TextInput value={text} onChangeText={setText} maxLength={500} multiline accessibilityLabel="Why is the charge wrong" style={s.input} />
              <Text style={s.label}>Photos (optional)</Text>
              <MediaPick paths={photos} setPaths={setPhotos} userId={session.user.id} onProblem={setMsg} />
              <Text style={s.note}>Pechkas decides once, and that decision is final.</Text>
              <Button kind="yellow" label="Send my appeal" busy={busy} onPress={() => send('appeal_charge', { p_claim: c.id, p_text: text, p_photos: photos }, 'Pechkas will decide your appeal.')} />
              <Button kind="outline" label="Back" onPress={() => setMode(null)} />
            </View>
          ) : null}
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 17, color: colour.ink, marginTop: 6 },
  card: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  cardBlocking: { borderWidth: 2, borderColor: colour.brick },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { flex: 1, fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colour.canvas },
  chipNow: { backgroundColor: colour.yellow },
  chipText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.ink },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.inkSoft },
  strong: { fontFamily: font.bodySemi, color: colour.ink },
  strongLine: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  due: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.ink },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  form: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 80, borderRadius: 14, padding: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1.5, borderColor: colour.rule, textAlignVertical: 'top' },
  charge: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: colour.softYellow },
});
