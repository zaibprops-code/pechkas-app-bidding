import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { rupees, showMobile } from '@pechkas/shared';
import { Button, Notice } from '../components/ui';
import { Press } from '../components/Press';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { useSignedUrls } from '../post/RemoteMedia';
import { ask } from '../supabase';
import { colour, font, radius } from '../theme';

/**
 * The customer's side of a job once a technician is chosen: where he is, the
 * start code, a new price to approve or decline, and the end — what to pay,
 * the photos, and "something is wrong".
 *
 * Nothing here decides anything. The code is checked, the price changed and
 * the visit fee worked out by the database; this screen shows what it says.
 */

export type Stage = 'chosen' | 'on_way' | 'arrived' | 'working';
export type Photo = { stage: 'before' | 'after' | 'change'; path: string };
export type JobNow = {
  id: string;
  ref: string;
  title: string;
  house: string;
  street: string;
  sector: string;
  status: 'open' | 'assigned' | 'done' | 'stopped' | 'cancelled';
  stage: Stage | null;
  agreed_paisa: number | null;
  start_code: string | null;
  code_locked: boolean;
  pro: { first_name: string; phone?: string | null; years: number } | null;
  change: { id: string; from_paisa: number; price_paisa: number; reason: string; photo: string } | null;
  visit_fee_paisa: number | null;
  collect_paisa: number | null;
  photos: Photo[];
  can_report: boolean;
  problem_at: string | null;
};

const WHERE: Record<Stage, (name: string) => string> = {
  chosen: (n) => `${n} is your technician. Your phone tells you when he sets off.`,
  on_way: (n) => `${n} is on his way.`,
  arrived: (n) => `${n} has arrived.`,
  working: (n) => `${n} is working on it.`,
};

export function UnderWay({ job, onChanged }: { job: JobNow; onChanged: () => void }) {
  const pro = job.pro!;
  const urls = useSignedUrls(job.change ? [{ kind: 'photo', path: job.change.photo, seconds: null }] : []);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const family = encodeURIComponent(
    `Pechkas is sending ${pro.first_name} for job ${job.ref} (${job.title}) at ${job.house}, ${job.street}, ${job.sector}.${pro.phone ? ` His number: ${showMobile(pro.phone)}.` : ''}`,
  );

  async function decide(approve: boolean) {
    if (!job.change) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('decide_change', { p_change: job.change.id, p_approve: approve });
    setBusy(false);
    setDeclining(false);
    if (!r.ok) setMsg(r.why);
    onChanged();
  }

  return (
    <View style={s.box}>
      <View style={s.top}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{pro.first_name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{job.stage ? WHERE[job.stage](pro.first_name) : `${pro.first_name} is your technician`}</Text>
          <Text style={s.meta}>Met by Pechkas · agreed {rupees(job.agreed_paisa)}</Text>
        </View>
      </View>

      {job.start_code && !job.code_locked ? (
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>Your start code</Text>
          <Text style={s.code} accessibilityLabel={`Start code ${job.start_code.split('').join(' ')}`}>
            {job.start_code.split('').join(' ')}
          </Text>
          <Text style={s.codeText}>
            Give it to {pro.first_name} at the door, once you have seen him. It proves he is the person Pechkas sent. Never read it out on the phone.
          </Text>
        </View>
      ) : null}

      {job.code_locked ? (
        <View style={s.warnBox}>
          <Text style={s.warnText}>Too many wrong codes were tried at your door. Do not let anyone in yet. Pechkas will call you.</Text>
          <Button kind="green" label={`Call Pechkas · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </View>
      ) : null}

      {job.change ? (
        <View style={s.change}>
          <Text style={s.changeTitle}>
            {pro.first_name} asks {rupees(job.change.price_paisa)} instead of {rupees(job.change.from_paisa)}
          </Text>
          <Text style={s.line}>“{job.change.reason}”</Text>
          {urls[job.change.photo] ? (
            <Press onPress={() => Linking.openURL(urls[job.change!.photo])} accessibilityRole="imagebutton" accessibilityLabel="The photo he sent">
              <Image source={{ uri: urls[job.change.photo] }} style={s.changePhoto} />
            </Press>
          ) : null}
          <Text style={s.small}>Nothing changes unless you approve.</Text>
          {!declining ? (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button kind="green" label={`Approve ${rupees(job.change.price_paisa)}`} busy={busy} onPress={() => decide(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button kind="outline" label="Decline" onPress={() => setDeclining(true)} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={s.line}>
                If you decline, the job stops here and you pay {pro.first_name} only the visit fee, {rupees(job.visit_fee_paisa)}, for his trip.
              </Text>
              <Button kind="danger" label={`Decline, pay ${rupees(job.visit_fee_paisa)}`} busy={busy} onPress={() => decide(false)} />
              <Button kind="outline" label="Go back" onPress={() => setDeclining(false)} />
            </View>
          )}
        </View>
      ) : null}

      <Notice text={msg} />

      <View style={s.row}>
        {pro.phone ? (
          <View style={{ flex: 1 }}>
            <Button kind="green" label={`Call ${pro.first_name}`} onPress={() => Linking.openURL(`tel:+${pro.phone!.replace(/^\+/, '')}`)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button kind="outline" label="Message" onPress={() => router.push({ pathname: '/chat/[job]', params: { job: job.id } })} />
        </View>
      </View>
      {job.stage === 'chosen' || job.stage === 'on_way' ? (
        <Button kind="outline" label="Send his name to family on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${family}`)} />
      ) : null}
    </View>
  );
}

/** The end of a job: what to pay, the photos, and a way to say something is wrong. */
export function Ended({ job, onChanged }: { job: JobNow; onChanged: () => void }) {
  const photos = job.photos.filter((p) => p.stage !== 'change');
  const urls = useSignedUrls(photos.map((p) => ({ kind: 'photo', path: p.path, seconds: null })));
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const name = job.pro?.first_name ?? 'the technician';

  async function report() {
    setBusy(true);
    setMsg(null);
    const r = await ask('report_problem', { p_job: job.id, p_text: text });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setWriting(false);
    onChanged();
  }

  return (
    <View style={s.box}>
      <Text style={s.endTitle}>
        {job.status === 'done' ? `Done. Pay ${name} ${rupees(job.collect_paisa)} in cash.` : `Stopped. Pay ${name} the visit fee, ${rupees(job.collect_paisa)}.`}
      </Text>
      {job.status === 'stopped' ? <Text style={s.line}>You declined the new price, so the job stopped there.</Text> : null}
      {(['before', 'after'] as const).map((stage) => {
        const list = photos.filter((p) => p.stage === stage);
        if (!list.length) return null;
        return (
          <View key={stage} style={{ gap: 6 }}>
            <Text style={s.small}>{stage === 'before' ? 'Before' : 'After'}</Text>
            <View style={s.photos}>
              {list.map((p) =>
                urls[p.path] ? (
                  <Press key={p.path} onPress={() => Linking.openURL(urls[p.path])} accessibilityRole="imagebutton" accessibilityLabel={`${stage} photo`}>
                    <Image source={{ uri: urls[p.path] }} style={s.photo} />
                  </Press>
                ) : (
                  <View key={p.path} style={[s.photo, { backgroundColor: colour.paper2 }]} />
                ),
              )}
            </View>
          </View>
        );
      })}
      {job.problem_at ? <Text style={s.line}>You told us something is wrong. The Pechkas office will call you.</Text> : null}
      {job.can_report && !writing ? <Button kind="outline" label="Something is wrong" onPress={() => setWriting(true)} /> : null}
      {job.can_report && writing ? (
        <View style={{ gap: 8 }}>
          <Text style={s.line}>Tell us what is wrong. The Pechkas office reads it and calls you.</Text>
          <TextInput value={text} onChangeText={setText} maxLength={500} multiline accessibilityLabel="What is wrong" style={s.input} />
          <Button kind="green" label="Send to Pechkas" busy={busy} onPress={report} />
          <Button kind="outline" label="Go back" onPress={() => setWriting(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  name: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 21, color: colour.ink },
  meta: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.bodySemi, fontSize: 12, color: colour.steel },
  row: { flexDirection: 'row', gap: 8 },
  codeBox: { gap: 4, padding: 14, borderRadius: radius.card, backgroundColor: colour.ink, alignItems: 'center' },
  codeLabel: { fontFamily: font.bodySemi, fontSize: 13, color: '#b9c2c9' },
  code: { fontFamily: font.mono, fontSize: 40, letterSpacing: 6, color: colour.yellow },
  codeText: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.paper, textAlign: 'center' },
  warnBox: { gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: '#f6e3dc' },
  warnText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.brick },
  change: { gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colour.white, borderWidth: 2, borderColor: colour.yellow },
  changeTitle: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  changePhoto: { width: '100%', height: 160, borderRadius: 12 },
  endTitle: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.greenDark },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 12 },
  input: { minHeight: 80, borderRadius: 14, padding: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1.5, borderColor: colour.rule },
});
