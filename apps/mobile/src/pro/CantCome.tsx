import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pkClock } from '@pechkas/shared';
import { Button, Chip, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { fill, type ProWords } from '../words';
import { colour, font } from '../theme';

/**
 * "I'm running late" and "I can't come" (the owner's decision D11). Both are
 * open only until his arrival counts, and the database decides everything:
 * whether he may (`withdraw_kind_now` is null once he has arrived), whether a
 * withdrawal is normal or late (2 hours before his time, on the server's
 * clock), how many times he may change his time and how late it may be. This
 * screen only says what `pro_my_jobs()` reports and sends what he chose.
 */

export type Reliability = {
  id: string;
  customer_first_name: string;
  withdraw_kind_now?: 'normal' | 'late' | null;
  eta_at?: string | null;
  etas_left?: number;
  eta_latest?: string;
  late_withdrawals_at?: number;
  flag_days?: number;
};

const REASONS = ['emergency', 'vehicle', 'other_job', 'cannot_reach', 'unwell', 'other'] as const;
type Reason = (typeof REASONS)[number];
const STEPS = [15, 30, 45, 60, 90, 120];

export function CantCome({ j, w, onChanged }: { j: Reliability; w: ProWords; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<'late' | 'cant' | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  // An older database says nothing about either: no buttons at all, never one that does nothing.
  if (j.withdraw_kind_now === undefined || j.withdraw_kind_now === null) return null;
  const name = j.customer_first_name;
  const left = j.etas_left ?? 0;
  const latest = j.eta_latest ? new Date(j.eta_latest).getTime() : now + 3 * 3600000;
  const steps = STEPS.filter((m) => now + m * 60000 <= latest);

  async function sendLate() {
    if (minutes === null) return;
    setBusy(true);
    setMsg(null);
    const eta = new Date(Date.now() + minutes * 60000).toISOString();
    const r = await ask('pro_running_late', { p_job: j.id, p_eta: eta });
    setBusy(false);
    if (!r.ok) {
      setMsg(r.why);
      return onChanged();
    }
    toast.show(done(fill(w.lateSent, { name, time: pkClock(eta) })));
    setOpen(null);
    setMinutes(null);
    onChanged();
  }

  async function sendCant() {
    if (!reason) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('pro_withdraw', { p_job: j.id, p_reason: reason, p_note: note.trim() || null });
    setBusy(false);
    if (!r.ok) {
      setMsg(r.why);
      return onChanged();
    }
    toast.show(done(w.cantSent));
    onChanged();
  }

  return (
    <View style={s.box}>
      {j.eta_at ? (
        <View style={s.row}>
          <DuoIcon name="clock" size={20} />
          <Text style={[s.line, { flex: 1 }]}>{fill(w.lateNow, { time: pkClock(j.eta_at) })}</Text>
        </View>
      ) : null}

      {open === null ? (
        <View style={s.pair}>
          <View style={s.half}>
            <Button kind="outline" label={w.lateButton} onPress={() => setOpen('late')} />
          </View>
          <View style={s.half}>
            <Button kind="outline" label={w.cantButton} onPress={() => setOpen('cant')} />
          </View>
        </View>
      ) : null}

      {open === 'late' ? (
        <View style={{ gap: 10 }}>
          <Text style={s.head}>{w.lateTitle}</Text>
          {left > 0 && steps.length ? (
            <>
              <View style={s.chips}>
                {steps.map((m) => (
                  <Chip key={m} label={`${fill(w.lateIn, { n: m })} · ${pkClock(new Date(now + m * 60000).toISOString())}`} on={minutes === m} onPress={() => setMinutes(minutes === m ? null : m)} />
                ))}
              </View>
              <Text style={s.note}>{fill(w.lateNote, { name })}</Text>
              <Text style={s.note}>{fill(left === 1 ? w.lateLeft : w.lateLeftMany, { n: left })}</Text>
              {minutes !== null ? <Button kind="yellow" label={fill(w.lateSend, { name })} busy={busy} onPress={sendLate} /> : null}
            </>
          ) : (
            <Text style={s.line}>{fill(w.lateNone, { name })}</Text>
          )}
          <Button kind="outline" label={w.cantBack} onPress={() => setOpen(null)} />
        </View>
      ) : null}

      {open === 'cant' ? (
        <View style={{ gap: 10 }}>
          <Text style={s.head}>{w.cantTitle}</Text>
          <View style={s.chips}>
            {REASONS.map((r) => (
              <Chip key={r} label={w[`cantReason_${r}` as keyof ProWords]} on={reason === r} onPress={() => setReason(reason === r ? null : r)} />
            ))}
          </View>
          <Field label={reason === 'other' ? w.cantNoteOther : w.cantNote} value={note} onChangeText={setNote} maxLength={200} multiline />
          <View style={j.withdraw_kind_now === 'late' ? s.warn : s.calm}>
            <Text style={s.line}>{j.withdraw_kind_now === 'late' ? fill(w.cantLate, { n: j.late_withdrawals_at ?? 3, days: j.flag_days ?? 60 }) : w.cantNormal}</Text>
          </View>
          <Text style={s.note}>{fill(w.cantAfter, { name })}</Text>
          {reason ? <Button kind="danger" label={w.cantConfirm} busy={busy} onPress={sendCant} /> : null}
          <Button kind="outline" label={w.cantBack} onPress={() => setOpen(null)} />
        </View>
      ) : null}
      <Notice text={msg} inline />
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 140 },
  head: { fontFamily: font.display, fontSize: 17, lineHeight: 23, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warn: { padding: 12, borderRadius: 14, backgroundColor: colour.softBrick },
  calm: { padding: 12, borderRadius: 14, backgroundColor: colour.cream },
});
