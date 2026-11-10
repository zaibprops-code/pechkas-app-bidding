import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Icon } from '../components/Icon';
import { Button, Field, Notice } from '../components/ui';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { ask } from '../supabase';
import { colour, font } from '../theme';

/**
 * The visit fee (the owner's decision D12), said before she chooses a
 * technician and never hidden in the terms: a flat fee, owed only when he
 * came, looked, asked a new price and she said no. The figure is the one
 * the database sends (the office's setting, fixed on the job when she
 * chooses), never typed here.
 */
export function VisitFeeNote({ fee, compact = false }: { fee: number; compact?: boolean }) {
  return (
    <View style={[s.note, compact && s.noteCompact]} accessibilityRole="text">
      <Text style={s.noteHead}>
        Visit fee: {rupees(fee)} if the technician visits but you decide not to proceed with the repair.
      </Text>
      {compact ? (
        <Text style={s.noteSmall}>No visit fee when the repair goes ahead, or if he does not arrive.</Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Tick text="No separate visit fee when the repair goes ahead." />
          <Tick text="Nothing to pay if the technician does not arrive." />
          <Tick text="Guarantee visits follow the Pechkas guarantee: you pay nothing for them." />
        </View>
      )}
    </View>
  );
}

function Tick({ text }: { text: string }) {
  return (
    <View style={s.tick}>
      <Icon name="check" size={15} color={colour.green} strokeWidth={2.4} />
      <Text style={s.tickText}>{text}</Text>
    </View>
  );
}

/** A visit fee as the customer may read it (visit_fee_view). */
export type CustomerFee = {
  id: string;
  amount_paisa: number;
  payer: 'customer' | 'pechkas';
  status: 'due' | 'paid' | 'unpaid' | 'disputed' | 'waived' | 'covered';
  reason: 'declined' | 'office_declined' | 'office_fee' | 'office_no_fee';
  refund: 'owed' | 'returned' | 'charged' | null;
  customer_said: 'disagree' | 'paid' | null;
  office_note: string | null;
  blocks_posting: boolean;
  can_disagree: boolean;
  can_say_paid: boolean;
};

const WHY: Record<CustomerFee['reason'], string> = {
  declined: 'You declined the new price, so the job stopped there.',
  office_declined: 'The Pechkas office recorded your answer: you declined the new price.',
  office_fee: 'Pechkas decided the work could not be finished, through no fault of the technician.',
  office_no_fee: 'Pechkas decided the work was not finished because of the technician.',
};

/**
 * What she owes after a job stopped, the one figure large, and what she can
 * do about it: "I disagree" within 24 hours, or "I have paid him" when he
 * says she has not. Both go to the office.
 */
export function FeeCard({ fee, name, jobId, onChanged }: { fee: CustomerFee; name: string; jobId: string; onChanged: () => void }) {
  const toast = useToast();
  const [writing, setWriting] = useState<null | 'disagree' | 'paid'>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const amount = rupees(fee.amount_paisa);

  async function send() {
    if (!writing) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('customer_visit_fee', { p_job: jobId, p_kind: writing, p_text: text });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setWriting(null);
    setText('');
    toast.show(done('The Pechkas office will look and tell you what it decides.', 'Sent to Pechkas'));
    onChanged();
  }

  // Pechkas paying for a guarantee visit; an unpaid fee Pechkas covered is still hers to settle.
  const pechkas = fee.payer === 'pechkas' && !fee.blocks_posting;
  const label = pechkas
    ? 'Visit fee'
    : fee.status === 'waived'
      ? 'No visit fee'
      : fee.status === 'paid'
        ? `Visit fee paid to ${name}`
        : `Pay ${name} the visit fee`;
  const figure = pechkas || fee.status === 'waived' ? 'Nothing to pay' : amount;

  return (
    <View style={[s.card, fee.status === 'unpaid' ? s.cardWarn : null]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.figure}>{figure}</Text>
      <Text style={s.line}>{WHY[fee.reason]}</Text>
      {pechkas && fee.status === 'covered' && !fee.blocks_posting ? <Text style={s.line}>Pechkas pays {name} the visit fee. You pay nothing.</Text> : null}
      {!pechkas && fee.status === 'due' ? <Text style={s.line}>In cash, or by JazzCash or Easypaisa, straight to {name}, before he leaves.</Text> : null}
      {fee.status === 'waived' && fee.office_note ? <Text style={s.quote}>Pechkas: “{fee.office_note}”</Text> : null}
      {fee.refund === 'owed' ? <Text style={s.line}>{name} will give back the {amount} you paid. Pechkas is making sure of it.</Text> : null}
      {fee.status === 'disputed' ? <Text style={s.line}>The Pechkas office is looking at this fee. You will be told what it decides.</Text> : null}
      {fee.status === 'unpaid' ? (
        <View style={{ gap: 6 }}>
          <Text style={s.warn}>{name} says this fee has not been paid.</Text>
          <Text style={s.line}>Until it is settled you cannot post a new job. Pay him, or tell us if you already did.</Text>
        </View>
      ) : null}
      {fee.status === 'covered' && fee.blocks_posting ? (
        <View style={{ gap: 8 }}>
          <Text style={s.warn}>Pechkas paid {name} the {amount} you owed.</Text>
          <Text style={s.line}>To post a new job, settle it with the Pechkas office.</Text>
          <Button kind="outline" label={`Call ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </View>
      ) : null}

      {writing ? (
        <View style={{ gap: 8 }}>
          <Field
            label={writing === 'paid' ? 'How did you pay him? (optional)' : 'Why is this fee wrong?'}
            value={text}
            onChangeText={setText}
            maxLength={300}
            multiline
          />
          <Button kind="yellow" label="Send to Pechkas" busy={busy} onPress={send} />
          <Button kind="outline" label="Back" onPress={() => setWriting(null)} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {fee.can_say_paid ? <Button kind="yellow" label="I have paid him" onPress={() => setWriting('paid')} /> : null}
          {fee.can_disagree ? <Button kind="outline" label="I disagree with this fee" onPress={() => setWriting('disagree')} /> : null}
        </View>
      )}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  note: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: colour.white },
  noteCompact: { padding: 12, gap: 4 },
  noteHead: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.ink },
  noteSmall: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  tick: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tickText: { flex: 1, fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  card: { gap: 8, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  cardWarn: { backgroundColor: colour.softBrick },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.inkSoft },
  figure: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  warn: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.brick },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
