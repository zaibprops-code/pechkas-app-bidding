import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Field, Notice } from '../components/ui';
import { MediaPick } from '../components/MediaPick';
import { Panel } from './bits';
import { Face } from './Face';
import { useAccount } from '../account';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { colour, font } from '../theme';

/**
 * At her door (D37): his photo, large, and one question before she gives him
 * the start code. Yes lets him start. No stops the job, gives it back to
 * other technicians, and tells Pechkas, after one more tap to be sure.
 */
export function DoorCard({ jobId, name, photo, onChanged }: { jobId: string; name: string; photo: string | null; onChanged: () => void }) {
  const toast = useToast();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function answer(yes: boolean) {
    setBusy(yes ? 'yes' : 'no');
    setMsg(null);
    const r = await ask('customer_face_answer', { p_job: jobId, p_yes: yes });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    toast.show(
      done(yes ? `Now give ${name} the start code.` : 'Do not let him in. Pechkas has been told, and your job is open to other technicians again.', yes ? 'Thank you' : 'Stopped'),
    );
    onChanged();
  }

  return (
    <Panel tone="money" icon="camera" title={`Is this ${name}?`} hint="Look at the man at your door before you give him the start code.">
      <View style={s.face}>
        <Face path={photo} name={name} size={168} />
      </View>
      {!sure ? (
        <>
          <Button kind="green" label="Yes, this is the man in the photo" busy={busy === 'yes'} onPress={() => answer(true)} />
          <Button kind="danger" label="No, it is somebody else" onPress={() => setSure(true)} />
        </>
      ) : (
        <>
          <Text style={s.body}>
            Do not let him in. The job stops, Pechkas is told, and your job goes back to other technicians. You pay nothing.
          </Text>
          <Button kind="danger" label="Yes, it is not him" busy={busy === 'no'} onPress={() => answer(false)} />
          <Button kind="outline" label="Go back" onPress={() => setSure(false)} />
        </>
      )}
      <Notice text={msg} inline />
    </Panel>
  );
}

/** Her three questions on one of his first jobs; "It works" is her Yes or "Not finished yet". */
export type TrialAnswers = { on_time: boolean | null; explained: boolean | null; clean: boolean | null };
export const NO_ANSWERS: TrialAnswers = { on_time: null, explained: null, clean: null };
export const answered = (a: TrialAnswers) => a.on_time !== null && a.explained !== null && a.clean !== null;

const QUESTIONS: { key: keyof TrialAnswers; label: (n: string) => string }[] = [
  { key: 'on_time', label: (n) => `Did ${n} arrive at the time he said?` },
  { key: 'explained', label: (n) => `Did ${n} explain the work, and any parts, before starting?` },
  { key: 'clean', label: (n) => `Did ${n} leave the place clean?` },
];

export function TrialQuestions({ name, value, onChange }: { name: string; value: TrialAnswers; onChange: (a: TrialAnswers) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.small}>This is one of {name}'s first jobs on Pechkas. Your answers decide whether it counts towards his approval. He sees only whether it counted.</Text>
      {QUESTIONS.map((q) => (
        <View key={q.key} style={s.q}>
          <Text style={s.qText}>{q.label(name)}</Text>
          <View style={s.chips}>
            <Chip label="Yes" on={value[q.key] === true} onPress={() => onChange({ ...value, [q.key]: true })} />
            <Chip label="No" on={value[q.key] === false} onPress={() => onChange({ ...value, [q.key]: false })} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const sendAnswers = (jobId: string, a: TrialAnswers) =>
  ask('answer_trial', { p_job: jobId, p_on_time: a.on_time, p_explained: a.explained, p_clean: a.clean });

/**
 * A safety report (D37): something about his work that is dangerous. It
 * pauses his work in this trade at once and reaches the Pechkas office in
 * writing. During the job or within its guarantee.
 */
export function SafetyReport({ jobId, name, onChanged }: { jobId: string; name: string; onChanged: () => void }) {
  const { session } = useAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  const [photo, setPhoto] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await ask('report_safety', { p_job: jobId, p_words: words, p_photo: photo[0] ?? null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(`${name} takes no new jobs of this kind until Pechkas has looked at it.`, 'Reported'));
    setOpen(false);
    onChanged();
  }

  if (!open) return <Button kind="outline" label="Report something unsafe" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.small}>
        In danger now? Use Emergency instead. This is for work left unsafe: bare wires, a gas smell, a leak near the electrics.
      </Text>
      <Field label="What is unsafe?" value={words} onChangeText={setWords} multiline maxLength={500} />
      {session ? <MediaPick paths={photo} setPaths={setPhoto} userId={session.user.id} max={1} onProblem={setMsg} /> : null}
      <Notice text={msg} inline />
      <Button kind="danger" label="Send to Pechkas" busy={busy} onPress={send} />
      <Button kind="outline" label="Not now" onPress={() => setOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  face: { alignItems: 'center', paddingVertical: 4 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  q: { gap: 8 },
  qText: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  chips: { flexDirection: 'row', gap: 8 },
});
