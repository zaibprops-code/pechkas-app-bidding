import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { fill, type ProWords } from '../words';
import { colour, font } from '../theme';

/**
 * When he must pay Pechkas (the owner's decision D36). Every fee is due 14
 * days after the job counts as done, with 3 days' grace; then his new offers
 * stop until it is paid. Everything here is pay_state() from pro_money(): the
 * database works out every date, what is paid, what a waiting payment
 * protects and whether offers are stopped. This card only says it.
 */

export type PayFee = {
  txn: string;
  kind: 'commission' | 'guarantee_charge' | 'visit_fee_refund';
  ref: string | null;
  posted_at: string;
  amount_paisa: number;
  paid_paisa: number;
  unpaid_paisa: number;
  protected_paisa: number;
  due_day: string;
  last_grace_day: string;
  stop_at: string;
  extended_to: string | null;
  status: 'not_due' | 'due' | 'grace' | 'stopped' | 'protected' | 'extended' | 'paid' | 'appeal';
};
export type PayState = {
  owed_paisa: number;
  credit_paisa: number;
  overdue_paisa: number;
  in_grace_paisa: number;
  blocked: boolean;
  next_due: string | null;
  due_days: number;
  grace_days: number;
  claim: { id: string; amount_paisa: number; created_at: string; business_days: number; needs_attention: boolean } | null;
  extension: { until_day: string; reason: string; days: number } | null;
  fees: PayFee[];
};
export type RefundCharge = {
  id: string;
  ref: string;
  amount_paisa: number;
  refund: 'charge_pending' | 'charged' | 'absorbed';
  due: string | null;
  final: boolean;
  can_appeal: boolean;
  appeal_at: string | null;
  outcome: 'kept' | 'cancelled' | null;
  note: string | null;
};

/** The day on Pakistan's calendar that a moment falls on, as YYYY-MM-DD. */
export const pkDayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
/** "Fri 27 Nov", from a day on Pakistan's calendar. */
export const dayLabel = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00+05:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });

export function PayDatesCard({ pay, w }: { pay: PayState; w: ProWords }) {
  const open = pay.fees.filter((f) => f.unpaid_paisa > 0);
  const graceEnd = open.filter((f) => f.status === 'grace').map((f) => f.last_grace_day).sort()[0];
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.soft}>
          <DuoIcon name="clock" size={22} />
        </View>
        <Text style={s.headText} accessibilityRole="header">
          {w.payTitle}
        </Text>
      </View>

      {pay.blocked ? (
        <View style={s.stopped}>
          <Text style={s.stoppedText}>{fill(w.payStopped, { amount: rupees(pay.overdue_paisa) })}</Text>
        </View>
      ) : pay.in_grace_paisa > 0 && graceEnd ? (
        <View style={s.warn}>
          <Text style={s.line}>{fill(w.payGrace, { amount: rupees(pay.in_grace_paisa), date: dayLabel(graceEnd) })}</Text>
        </View>
      ) : (
        <Text style={s.big}>
          {pay.next_due ? fill(w.payNext, { date: dayLabel(pay.next_due) }) : fill(w.payNothing, { days: pay.due_days, grace: pay.grace_days })}
        </Text>
      )}

      {pay.claim ? (
        <Text style={s.line}>
          {fill(w.payClaim, { amount: rupees(pay.claim.amount_paisa) })}
          {pay.claim.needs_attention ? ` ${w.payClaimSlow}` : ''}
        </Text>
      ) : null}
      {pay.credit_paisa > 0 ? <Text style={s.line}>{fill(w.payCredit, { amount: rupees(pay.credit_paisa) })}</Text> : null}
      {pay.extension && open.some((f) => f.extended_to) ? (
        <Text style={s.line}>{fill(w.payExtended, { date: dayLabel(pay.extension.until_day), reason: pay.extension.reason })}</Text>
      ) : null}

      {pay.fees.map((f) => (
        <View key={f.txn} style={s.row}>
          <View style={s.rowTop}>
            <Text style={s.rowTitle} numberOfLines={1}>
              {f.ref ?? w[`payFeeKind_${f.kind}` as keyof ProWords]} · {dayLabel(pkDayOf(f.posted_at))}
            </Text>
            <Text style={s.amount}>{rupees(f.amount_paisa)}</Text>
          </View>
          <Text style={[s.status, (f.status === 'stopped' || f.status === 'grace') && s.statusBad, f.status === 'paid' && s.statusGood]}>
            {fill(w[`payStatus_${f.status}` as keyof ProWords], {
              date: dayLabel(f.status === 'grace' ? f.last_grace_day : f.status === 'extended' && f.extended_to ? f.extended_to : f.due_day),
            })}
          </Text>
          {f.kind !== 'commission' ? <Text style={s.note}>{w[`payFeeKind_${f.kind}` as keyof ProWords]}</Text> : null}
          {f.unpaid_paisa > 0 && f.unpaid_paisa < f.amount_paisa ? (
            <Text style={s.note}>{fill(w.payLeft, { unpaid: rupees(f.unpaid_paisa), amount: rupees(f.amount_paisa) })}</Text>
          ) : null}
        </View>
      ))}
      <Text style={s.note}>{fill(w.payRule, { days: pay.due_days, grace: pay.grace_days })}</Text>
    </View>
  );
}

/** A visit-fee refund charged to him: shown with its date, and his one appeal. */
export function RefundCharges({ items, w, onChanged }: { items: RefundCharge[]; w: ProWords; onChanged: () => void }) {
  if (!items.length) return null;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.soft}>
          <DuoIcon name="wallet" size={22} />
        </View>
        <Text style={s.headText} accessibilityRole="header">
          {w.refundTitle}
        </Text>
      </View>
      {items.map((r) => (
        <RefundRow key={r.id} r={r} w={w} onChanged={onChanged} />
      ))}
    </View>
  );
}

function RefundRow({ r, w, onChanged }: { r: RefundCharge; w: ProWords; onChanged: () => void }) {
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await ask('pro_appeal_refund', { p_fee: r.id, p_text: text.trim() });
    setBusy(false);
    if (!res.ok) return setMsg(res.why);
    setWriting(false);
    toast.show(done(w.refundAppealSent));
    onChanged();
  }

  const state =
    r.outcome === 'cancelled' ? w.refundCancelled
      : r.outcome === 'kept' ? w.refundKept
      : r.appeal_at ? w.refundAppealed
      : r.final ? w.refundCharged
      : fill(w.refundPending, { amount: rupees(r.amount_paisa), ref: r.ref, date: r.due ? dayLabel(pkDayOf(r.due)) : '' });
  return (
    <View style={s.row}>
      <View style={s.rowTop}>
        <Text style={s.rowTitle}>{r.ref}</Text>
        <Text style={s.amount}>{rupees(r.amount_paisa)}</Text>
      </View>
      <Text style={s.line}>{state}</Text>
      {r.note ? <Text style={s.quote}>Pechkas: “{r.note}”</Text> : null}
      {r.can_appeal && !writing ? <Button kind="outline" label="Appeal" onPress={() => setWriting(true)} /> : null}
      {writing ? (
        <View style={{ gap: 8 }}>
          <Field label={w.refundAppealLabel} value={text} onChangeText={setText} maxLength={300} multiline />
          <Button kind="green" label={w.refundAppealSend} busy={busy} onPress={send} />
          <Button kind="outline" label={w.recordBack} onPress={() => setWriting(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  soft: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, fontFamily: font.display, fontSize: 17, color: colour.ink },
  big: { fontFamily: font.display, fontSize: 16, lineHeight: 22, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  stopped: { padding: 12, borderRadius: 14, backgroundColor: colour.brick },
  stoppedText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.white },
  warn: { padding: 12, borderRadius: 14, backgroundColor: colour.softBrick },
  row: { gap: 3, paddingTop: 10, borderTopWidth: 1, borderTopColor: colour.rule },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  amount: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  status: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  statusBad: { color: colour.brick },
  statusGood: { color: colour.green },
});
