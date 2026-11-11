import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { windowLabel } from '@pechkas/shared';
import { Button, Chip, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { colour, font } from '../theme';
import { FindAnother } from './Replace';

/**
 * Cancelling a job (the owner's decision D10). Always free. She picks a
 * reason (words optional) and is told, before she confirms, what the
 * database will record it as — the one rule is `cancel_kind()` there, and
 * this screen only says what `my_jobs().cancel_kind_now` reports.
 */

export type CancelKind = 'before_choosing' | 'normal' | 'late' | 'pro_late' | 'no_show';
export type CancelCode = 'fixed_myself' | 'someone_else' | 'plans_changed' | 'pro_late' | 'better_price' | 'not_needed' | 'other';

export type CancelFields = {
  id: string;
  ref: string;
  status: string;
  stage: string | null;
  pro: { first_name: string } | null;
  /** Whether she may cancel, what it would count as now, and whether he is late or has not come. */
  can_cancel?: boolean;
  cancel_kind_now?: CancelKind | null;
  pro_late?: boolean;
  no_show?: boolean;
  window_start?: string | null;
  /** His two-hour window, said the way every screen says it. */
  when_from?: number | null;
  cancel_code?: CancelCode | null;
  cancel_category?: string | null;
  /** A technician who cannot come (reliability, D11): find another, his new time, and who left before. */
  can_find_another?: boolean;
  eta_at?: string | null;
  reopened?: { ended: 'withdrawn' | 'late_withdrawal' | 'replaced'; at: string; pro: string | null } | null;
  technicians_before?: number;
};

const REASONS: { code: CancelCode; label: string; chosen?: boolean }[] = [
  { code: 'fixed_myself', label: 'I fixed the problem myself' },
  { code: 'someone_else', label: 'Someone else fixed the problem' },
  { code: 'plans_changed', label: 'My plans changed' },
  { code: 'pro_late', label: 'The technician is late', chosen: true },
  { code: 'better_price', label: 'I found a better price' },
  { code: 'not_needed', label: 'I no longer need the service' },
  { code: 'other', label: 'Other' },
];

/** What cancelling now means, in one honest sentence. */
function meaning(job: CancelFields): string {
  const name = job.pro?.first_name ?? 'the technician';
  switch (job.cancel_kind_now) {
    case 'before_choosing':
      return 'It is free. Nobody has been chosen yet, so nobody is on the way.';
    case 'pro_late':
      return `It is free, and it does not count against you: ${name} is late.`;
    case 'no_show':
      return `It is free, and it does not count against you: ${name} has not arrived.`;
    case 'late':
      return job.stage === 'arrived'
        ? `It is free, but ${name} is at your door, so it is recorded as a late cancellation. If that happens often, the Pechkas office may call you.`
        : `It is free, but it is close to ${name}'s time${job.stage === 'on_way' ? ' and he is on his way' : ''}, so it is recorded as a late cancellation. If that happens often, the Pechkas office may call you.`;
    default:
      return `It is free. Please call ${name} to tell him too.`;
  }
}

/** The reasons, what it means, and the two buttons. */
export function CancelPanel({ job, preset, onDone, onBack }: { job: CancelFields; preset?: CancelCode; onDone: () => void; onBack: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState<CancelCode | null>(preset ?? null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const chosen = job.status === 'assigned';
  const atDoor = job.stage === 'arrived';

  async function cancel() {
    setBusy(true);
    setMsg(null);
    // A database from before the cancellations change says nothing about
    // cancelling and has no reason codes: it is sent the old two arguments.
    const old = job.can_cancel === undefined;
    const r = await ask('cancel_job', old ? { p_job: job.id, p_reason: words.trim() || null } : { p_job: job.id, p_reason: words.trim() || null, p_code: code });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done('It cost you nothing.', 'Your job is cancelled'));
    onDone();
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.head}>{atDoor ? 'You no longer need this service?' : `Cancel ${job.ref}?`}</Text>
      <Text style={s.line}>{meaning(job)}</Text>
      <Text style={s.label}>Why are you cancelling?</Text>
      <View style={s.chips}>
        {REASONS.filter((r) => !r.chosen || chosen).map((r) => (
          <Chip key={r.code} label={r.label} on={code === r.code} onPress={() => setCode(code === r.code ? null : r.code)} />
        ))}
      </View>
      <Field label="Anything to add? (optional)" value={words} onChangeText={setWords} maxLength={200} multiline />
      <Button kind="danger" label={atDoor ? 'Yes, I no longer need it' : 'Yes, cancel it'} onPress={cancel} busy={busy} />
      <Button kind="outline" label="No, keep it" onPress={onBack} />
      <Notice text={msg} />
    </View>
  );
}

/**
 * He is more than 30 minutes into his window and has not arrived, or the
 * database has recorded a potential no-show. She may send the same job to
 * another technician (D11), cancel free — neither counts against her — or
 * keep waiting.
 */
export function LateCard({ job, onDone }: { job: CancelFields; onDone: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [finding, setFinding] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const name = job.pro?.first_name ?? 'The technician';
  if (waiting && !job.no_show) return null;
  // On Pakistan's clock, in the same words as the job card, never the phone's own time zone.
  const window = job.when_from !== null && job.when_from !== undefined ? windowLabel(job.when_from) : null;
  return (
    <View style={s.late}>
      <View style={s.lateHead}>
        <View style={s.tile}>
          <DuoIcon name="clock" size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.head}>{name} has not arrived</Text>
          <Text style={s.line}>
            {job.no_show
              ? `His time has passed. The Pechkas office has been told and is looking into it.`
              : `${window ? `His time was ${window}, and it` : 'His time'} began more than 30 minutes ago. Call him, or wait a little longer.`}
          </Text>
        </View>
      </View>
      {finding ? (
        <FindAnother job={job} onDone={onDone} onBack={() => setFinding(false)} />
      ) : cancelling ? (
        <CancelPanel job={job} preset="pro_late" onDone={onDone} onBack={() => setCancelling(false)} />
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={s.line}>
            {job.can_find_another
              ? 'You can send this job to another technician, with everything you posted, or cancel free. Because he is late, neither counts against you.'
              : 'You can cancel free. Because he is late, it does not count against you.'}
          </Text>
          {job.can_find_another ? <Button kind="yellow" icon="arrowRight" label="Find another technician" onPress={() => setFinding(true)} /> : null}
          <Button kind={job.can_find_another ? 'outline' : 'danger'} label="Cancel free" onPress={() => setCancelling(true)} />
          {waiting ? null : <Button kind="outline" label="Keep waiting" onPress={() => setWaiting(true)} />}
        </View>
      )}
    </View>
  );
}

/** One line under a cancelled job saying how it was recorded, when it was hers to know. */
export function cancelledNote(job: CancelFields): string | null {
  switch (job.cancel_category) {
    case 'late':
      return 'Recorded as a late cancellation. It cost nothing.';
    case 'pro_late':
    case 'no_show':
      return 'He was late, so this cancellation does not count against you.';
    default:
      return null;
  }
}

const s = StyleSheet.create({
  head: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  late: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  lateHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
});
