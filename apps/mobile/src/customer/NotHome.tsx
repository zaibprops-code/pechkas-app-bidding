import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pkClock } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { colour, font } from '../theme';
import { CancelPanel, type CancelFields } from './Cancel';

/**
 * The technician is at her door and cannot get in (the owner's decision
 * D34). Pechkas tells her; she can say she is coming, or cancel. If he then
 * reports it, the job closes and she may say she was home. A report is his
 * word, not a finding: only the office confirms it, and nothing is charged.
 * Every time and every rule is the database's (`my_jobs().not_home`).
 */

export type CustomerNotHome = {
  reason: 'nobody_home' | 'guard';
  status: 'asking' | 'coming' | 'answered' | 'closed' | 'submitted' | 'disputed' | 'confirmed' | 'rejected';
  deadline: string;
  submitted_at: string | null;
  office_note: string | null;
  pro_was_late: boolean;
  can_say_coming: boolean;
  can_dispute: boolean;
  dispute_until: string | null;
  customer_text: string | null;
};

type Fields = CancelFields & { not_home?: CustomerNotHome | null; block_name?: string | null };

/** He has asked Pechkas to tell her: I'm coming, or cancel. */
export function AtDoorCard({ job, onChanged }: { job: Fields; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const nh = job.not_home!;
  const name = job.pro?.first_name ?? 'The technician';
  const guard = nh.reason === 'guard';

  async function coming() {
    setBusy(true);
    setMsg(null);
    const r = await ask('customer_not_home_coming', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(`${name} will wait 10 more minutes.`, 'He has been told'));
    onChanged();
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.tile}>
          <DuoIcon name={guard ? 'shield' : 'home'} size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{guard ? `${name} cannot get past the gate` : `${name} is at your door`}</Text>
          <Text style={s.line}>
            {guard
              ? 'He says the guard has not let him in. Please tell your guard to let him through.'
              : 'Nobody has answered. Please come to the door, or cancel if you no longer need him.'}
          </Text>
        </View>
      </View>
      <Text style={s.strong}>
        {nh.status === 'coming' ? `You said you are coming. He waits until ${pkClock(nh.deadline)}.` : `He waits until ${pkClock(nh.deadline)}.`}
      </Text>
      {cancelling ? (
        <CancelPanel job={job} onDone={onChanged} onBack={() => setCancelling(false)} />
      ) : (
        <View style={{ gap: 8 }}>
          {nh.can_say_coming ? <Button kind="yellow" label={guard ? 'I have told the guard' : 'I am coming'} busy={busy} onPress={coming} /> : null}
          <Button kind="outline" label="Cancel the job" onPress={() => setCancelling(true)} />
        </View>
      )}
      <Notice text={msg} />
    </View>
  );
}

/** After he reported it: what happened, and "I was home" while she still may. */
export function NotHomeEnded({ job, onChanged }: { job: Fields; onChanged: () => void }) {
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const nh = job.not_home!;
  // Once the job is closed his name is no longer on it as the chosen one; her job keeps it for blocking.
  const name = job.pro?.first_name ?? job.block_name ?? 'The technician';
  const guard = nh.reason === 'guard';

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await ask('customer_dispute_not_home', { p_job: job.id, p_text: text });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setWriting(false);
    toast.show(done('The Pechkas office will look and tell you what it decides.', 'Sent to Pechkas'));
    onChanged();
  }

  const status =
    nh.status === 'disputed'
      ? 'You said you were home. The Pechkas office is looking at it, and it does not count against you until it decides.'
      : nh.status === 'confirmed'
        ? 'The Pechkas office looked and agreed with the report.'
        : nh.status === 'rejected'
          ? 'The Pechkas office looked and did not accept the report.'
          : null;

  return (
    <View style={s.card}>
      <Text style={s.title}>{guard ? `${name} could not get past the gate` : `${name} reported that nobody answered`}</Text>
      <Text style={s.line}>
        {nh.submitted_at ? `At ${pkClock(nh.submitted_at)}, after waiting at your door. ` : ''}
        The job is closed. Nothing is charged to you.
        {guard || nh.pro_was_late ? ' It does not count against you.' : ''}
      </Text>
      {status ? <Text style={s.strong}>{status}</Text> : null}
      {nh.office_note ? <Text style={s.quote}>Pechkas: “{nh.office_note}”</Text> : null}
      {nh.can_dispute && !writing ? (
        <View style={{ gap: 6 }}>
          <Button kind="outline" label="I was home" onPress={() => setWriting(true)} />
          {nh.dispute_until ? <Text style={s.small}>You can tell Pechkas until {pkClock(nh.dispute_until)} tomorrow.</Text> : null}
        </View>
      ) : null}
      {writing ? (
        <View style={{ gap: 8 }}>
          <Field label="What happened? The Pechkas office reads it." value={text} onChangeText={setText} maxLength={300} multiline />
          <Button kind="yellow" label="Send to Pechkas" busy={busy} onPress={send} />
          <Button kind="outline" label="Back" onPress={() => setWriting(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  strong: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
