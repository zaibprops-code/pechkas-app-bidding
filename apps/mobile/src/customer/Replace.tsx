import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pkClock } from '@pechkas/shared';
import { Button, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { colour, font } from '../theme';
import type { CancelFields } from './Cancel';

/**
 * Finding another technician (the owner's decision D11). The SAME job goes
 * back to other checked technicians with everything she posted; it is never
 * her cancellation and never a new job. The database decides when she may
 * (`can_find_another`: he has not arrived) and what it counts as
 * (`cancel_kind_now`, the same rule as cancelling), and this screen only says
 * so. A technician who is late, or has said he is running late, costs her
 * nothing on her record; switching just before his time with no fault of his
 * counts like a late cancellation, exactly as cancelling would.
 */

/** What finding another technician means now, in one honest sentence. */
function meaning(job: CancelFields): string {
  const name = job.pro?.first_name ?? 'the technician';
  switch (job.cancel_kind_now) {
    case 'pro_late':
    case 'no_show':
      return `${name} is late, so this does not count against you.`;
    case 'late':
      return job.eta_at
        ? `${name} has said he is running late, so this does not count against you.`
        : `It is close to ${name}'s time${job.stage === 'on_way' ? ' and he is on his way' : ''}, so it is recorded like a late cancellation. If that happens often, the Pechkas office may call you.`;
    default:
      return `It does not count against you. We tell ${name} he is not needed.`;
  }
}

/** The confirming panel: what it means, what stays, and the two buttons. */
export function FindAnother({ job, onDone, onBack }: { job: CancelFields; onDone: () => void; onBack: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const name = job.pro?.first_name ?? 'the technician';

  async function go() {
    setBusy(true);
    setMsg(null);
    const r = await ask('customer_find_another', { p_job: job.id });
    setBusy(false);
    if (!r.ok) {
      setMsg(r.why);
      return onDone();
    }
    toast.show(done('Other checked technicians can offer now. It cost you nothing.', 'Your job is open again'));
    onDone();
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.head}>Find another technician?</Text>
      <Text style={s.line}>{meaning(job)}</Text>
      <Text style={s.line}>
        Your job stays as it is: your words, photos, address and price. Other checked technicians can offer again; {name} cannot. Nothing to
        pay.
      </Text>
      <Button kind="yellow" icon="arrowRight" label="Yes, find another technician" onPress={go} busy={busy} />
      <Button kind="outline" label={`No, keep ${name}`} onPress={onBack} />
      <Notice text={msg} />
    </View>
  );
}

/** He has said he is running late: the new time, and her two choices. */
export function RunningLateCard({ job, onDone }: { job: CancelFields; onDone: () => void }) {
  const [finding, setFinding] = useState(false);
  const [waiting, setWaiting] = useState(false);
  if (waiting || !job.eta_at) return null;
  const name = job.pro?.first_name ?? 'The technician';
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.tile}>
          <DuoIcon name="clock" size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.head}>{name} is running late</Text>
          <Text style={s.line}>He now expects to arrive by {pkClock(job.eta_at)}. You can wait, or find another technician. Either costs you nothing.</Text>
        </View>
      </View>
      {finding ? (
        <FindAnother job={job} onDone={onDone} onBack={() => setFinding(false)} />
      ) : (
        <View style={{ gap: 8 }}>
          <Button kind="yellow" icon="arrowRight" label="Find another technician" onPress={() => setFinding(true)} />
          <Button kind="outline" label="Keep waiting" onPress={() => setWaiting(true)} />
        </View>
      )}
    </View>
  );
}

/** On a job that came back: who left, an apology when it was him, and that nothing was lost. */
export function ReopenedNote({ job }: { job: CancelFields }) {
  const r = job.reopened;
  if (!r || job.status !== 'open') return null;
  const name = r.pro ?? 'Your technician';
  return (
    <View style={s.note}>
      <DuoIcon name="shield" size={22} />
      <Text style={[s.line, { flex: 1 }]}>
        {r.ended === 'replaced'
          ? `You asked for another technician. Your job is open again with everything you posted, and ${name} cannot see it.`
          : `We are sorry: ${name} could not come. Your job is open to other checked technicians again, with everything you posted. Nothing to pay.`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  card: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 20, backgroundColor: colour.white },
});
