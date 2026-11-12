import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { Press } from '../components/Press';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { fill, type ProWords } from '../words';
import { colour, font, radius } from '../theme';
import { dayLabel, pkDayOf } from './PayDates';

/** "Rs 5,000" that never breaks between "Rs" and the figure. */
const rs = (paisa: number) => rupees(paisa).replace(' ', '\u00a0');

/**
 * A customer who did not pay him in full (the owner's decision D35). He
 * says Not paid or Paid less within 7 days of the job counting as done;
 * Pechkas holds the commission and asks her. Everything shown is
 * pro_payment_jobs(): the database decides what he may still do, and what
 * the commission is. Her own words never reach this screen.
 */

export type PaymentView = {
  id: string;
  status: 'asked' | 'owed' | 'office' | 'closed';
  agreed_paisa: number;
  parts_paisa: number;
  reported_paisa: number;
  received_paisa: number;
  outstanding_paisa: number;
  answer_due: string;
  customer_answer: 'agrees' | 'paid' | null;
  customer_text?: string | null;
  blocked: boolean;
  can_answer: boolean;
  can_correct: boolean;
  can_now_paid: boolean;
  outcome: 'paid_full' | 'now_paid' | 'closed' | null;
  office_note: string | null;
  office_at: string | null;
  created_at: string;
  commission_held: boolean;
};

export type PaymentJob = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  finished_at: string;
  customer_first_name: string;
  agreed_paisa: number;
  parts_paisa: number;
  commission_paisa: number | null;
  report_until: string;
  can_report: boolean;
  payment: PaymentView | null;
};

/** Every job he may still report, and every case he has: one card on My account. */
export function UnpaidCard({ jobs, w, onChanged }: { jobs: PaymentJob[]; w: ProWords; onChanged: () => void }) {
  if (!jobs.length) return null;
  const cases = jobs.filter((j) => j.payment);
  const open = jobs.filter((j) => !j.payment && j.can_report);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.soft}>
          <DuoIcon name="wallet" size={22} />
        </View>
        <Text style={s.headText} accessibilityRole="header">
          {w.unpaidTitle}
        </Text>
      </View>
      {cases.map((j) => (
        <CaseRow key={j.id} j={j} w={w} onChanged={onChanged} />
      ))}
      {open.length ? <Text style={s.note}>{w.unpaidHint}</Text> : null}
      {open.map((j) => (
        <ReportRow key={j.id} j={j} w={w} onChanged={onChanged} />
      ))}
    </View>
  );
}

function JobLine({ j, w }: { j: PaymentJob; w: ProWords }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={s.rowTop}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {j.ref} · {j.customer_first_name}
        </Text>
        <Text style={s.amount}>{rs(j.agreed_paisa)}</Text>
      </View>
      {j.parts_paisa > 0 ? <Text style={s.note}>{fill(w.unpaidPrice, { price: rs(j.agreed_paisa), parts: rs(j.parts_paisa) })}</Text> : null}
    </View>
  );
}

/** The amount box: whole rupees, below the price. Returns paisa, or null when it cannot be sent. */
function AmountForm({ j, w, initial, busy, msg, onSend, onBack }: {
  j: PaymentJob; w: ProWords; initial: 'none' | 'less' | null; busy: boolean; msg: string | null;
  onSend: (paisa: number) => void; onBack: () => void;
}) {
  const [kind, setKind] = useState<'none' | 'less' | null>(initial);
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);
  function send() {
    setErr(null);
    if (kind === 'none') return onSend(0);
    const r = Number(typed);
    if (!typed || !Number.isFinite(r) || r * 100 >= j.agreed_paisa) return setErr(w.unpaidErrAmount);
    onSend(r * 100);
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={s.choices} accessibilityRole="radiogroup">
        {(['none', 'less'] as const).map((k) => (
          <Press
            key={k}
            onPress={() => setKind(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
            style={[s.choice, kind === k && s.choiceOn]}
          >
            <Text style={s.choiceText}>{k === 'none' ? w.unpaidNone : w.unpaidLess}</Text>
          </Press>
        ))}
      </View>
      {kind === 'less' ? (
        <Field
          label={w.unpaidAmountLabel}
          value={typed}
          onChangeText={(t) => setTyped(t.replace(/[^0-9]/g, '').slice(0, 7))}
          keyboardType="number-pad"
          error={err ?? undefined}
        />
      ) : null}
      {err ? <Text style={s.error}>{err}</Text> : null}
      {kind ? <Button kind="green" label={w.unpaidSend} busy={busy} onPress={send} /> : null}
      <Button kind="outline" label={w.recordBack} onPress={onBack} />
      <Notice text={msg} inline />
    </View>
  );
}

function ReportRow({ j, w, onChanged }: { j: PaymentJob; w: ProWords; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send(paisa: number) {
    setBusy(true);
    setMsg(null);
    const r = await ask('pro_report_unpaid', { p_job: j.id, p_received_paisa: paisa });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setOpen(false);
    toast.show(done(w.unpaidSent));
    onChanged();
  }
  return (
    <View style={s.row}>
      <JobLine j={j} w={w} />
      <Text style={s.note}>{fill(w.unpaidUntil, { date: dayLabel(pkDayOf(j.report_until)) })}</Text>
      {open ? (
        <AmountForm j={j} w={w} initial={null} busy={busy} msg={msg} onSend={send} onBack={() => setOpen(false)} />
      ) : (
        <Button kind="outline" label={w.unpaidReport} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

function CaseRow({ j, w, onChanged }: { j: PaymentJob; w: ProWords; onChanged: () => void }) {
  const toast = useToast();
  const p = j.payment!;
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<null | 'change' | 'paid'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const name = j.customer_first_name;
  const line =
    p.status === 'closed'
      ? p.outcome === 'closed'
        ? fill(w.unpaidClosed, { received: rs(p.received_paisa) })
        : w.unpaidClosedFull
      : p.status === 'owed'
        ? fill(p.blocked ? w.unpaidOwed : w.unpaidCleared, { name, owed: rs(p.outstanding_paisa) })
        : p.status === 'office'
          ? w.unpaidOffice
          : p.reported_paisa === 0
            ? fill(w.unpaidAskedNone, { name })
            : fill(w.unpaidAsked, { received: rs(p.reported_paisa), price: rs(p.agreed_paisa), name });

  async function correct(paisa: number) {
    setBusy('change');
    setMsg(null);
    const r = await ask('pro_correct_unpaid', { p_job: j.id, p_received_paisa: paisa });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    setChanging(false);
    onChanged();
  }
  async function nowPaid() {
    setBusy('paid');
    setMsg(null);
    const r = await ask('pro_now_paid', { p_job: j.id });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(w.unpaidNowPaidDone));
    onChanged();
  }

  return (
    <View style={s.row}>
      <JobLine j={j} w={w} />
      <View style={[s.state, p.status === 'closed' && s.stateDone]}>
        <Text style={s.stateText}>{line}</Text>
        {p.office_note ? <Text style={s.quote}>{fill(w.unpaidOfficeSaid, { note: p.office_note })}</Text> : null}
      </View>
      {changing ? (
        <AmountForm j={j} w={w} initial={p.reported_paisa === 0 ? 'none' : 'less'} busy={busy === 'change'} msg={msg} onSend={correct} onBack={() => setChanging(false)} />
      ) : (
        <View style={{ gap: 8 }}>
          {p.can_now_paid ? <Button kind="green" label={w.unpaidNowPaid} busy={busy === 'paid'} onPress={nowPaid} /> : null}
          {p.can_correct ? <Button kind="outline" label={w.unpaidChange} onPress={() => setChanging(true)} /> : null}
          <Notice text={msg} inline />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  soft: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, fontFamily: font.display, fontSize: 17, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  row: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colour.rule },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  amount: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  state: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: colour.softYellow },
  stateDone: { backgroundColor: colour.canvas },
  stateText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  quote: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colour.rule, backgroundColor: colour.white },
  choiceOn: { borderColor: colour.green, borderWidth: 2, backgroundColor: colour.softYellow },
  choiceText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink, textAlign: 'center' },
  error: { fontFamily: font.bodyMedium, fontSize: 13.5, color: colour.brick },
});
