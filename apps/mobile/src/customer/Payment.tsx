import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { MediaPick } from '../components/MediaPick';
import { useToast } from '../components/Toast';
import { useAccount } from '../account';
import { done } from '../message';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { ask } from '../supabase';
import { colour, font } from '../theme';
import type { PaymentView } from '../pro/Unpaid';

/**
 * The technician says she has not paid him in full (the owner's decision
 * D35). She answers once: "That's right" or "I have paid". Neither is an
 * admission of anything else: if she says she paid, the office decides, and
 * she is not held back while it does. She cannot post new jobs only once she
 * has agreed, or the office has decided, that she owes the rest. Every figure
 * is payment_view() from my_jobs(); the screen works nothing out.
 */

/** "Rs 5,000" that never breaks between "Rs" and the figure. */
const rs = (paisa: number) => rupees(paisa).replace(' ', '\u00a0');
const pkDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' });

export function PaymentCard({ p, name, jobId, onChanged }: { p: PaymentView; name: string; jobId: string; onChanged: () => void }) {
  const toast = useToast();
  const { session } = useAccount();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'agrees' | 'paid'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function answer(kind: 'agrees' | 'paid') {
    setBusy(kind);
    setMsg(null);
    setErrors({});
    const r = await ask('customer_answer_unpaid', { p_job: jobId, p_answer: kind, p_text: kind === 'paid' ? text : null, p_photo: kind === 'paid' ? (photo[0] ?? null) : null });
    setBusy(null);
    if (!r.ok) {
      if (r.field === 'text' || r.field === 'photo') return setErrors({ [r.field]: r.why });
      return setMsg(r.why);
    }
    setWriting(false);
    toast.show(
      kind === 'paid'
        ? done('The Pechkas office will look at what you sent and tell you what it decides.', 'Sent to Pechkas')
        : done(`Thank you. Please pay ${name} ${rupees(p.outstanding_paisa)}; he will tell Pechkas when you have.`, 'Answer saved'),
    );
    onChanged();
  }

  if (p.status === 'closed') {
    return (
      <View style={[s.card, s.cardDone]}>
        <Text style={s.label}>Payment</Text>
        <Text style={s.title}>Settled</Text>
        <Text style={s.line}>
          {p.outcome === 'closed' ? 'The Pechkas office has closed the payment question on this job.' : `${name}'s payment question on this job is settled. Thank you.`}
        </Text>
        {p.office_note ? <Text style={s.quote}>Pechkas: “{p.office_note}”</Text> : null}
      </View>
    );
  }

  const reported = p.reported_paisa === 0 ? `${name} says he has not been paid for this job.` : `${name} says he received ${rs(p.reported_paisa)} of ${rs(p.agreed_paisa)}.`;

  return (
    <View style={[s.card, p.blocked && s.cardWarn]}>
      <Text style={s.label}>A question about payment</Text>
      {p.status === 'owed' ? (
        <>
          <Text style={s.title}>{`Still to pay ${name}`}</Text>
          <Text style={s.figure}>{rupees(p.outstanding_paisa)}</Text>
          {p.customer_answer === 'agrees' ? (
            <Text style={s.line}>You told Pechkas this is right.</Text>
          ) : (
            <Text style={s.line}>The Pechkas office decided this is still owed.</Text>
          )}
          {p.office_note ? <Text style={s.quote}>Pechkas: “{p.office_note}”</Text> : null}
          {p.blocked ? (
            <Text style={s.warn}>Until it is paid you cannot post a new job. Your guarantee on this job is not affected.</Text>
          ) : (
            <Text style={s.line}>The Pechkas office is dealing with it. You can post new jobs meanwhile.</Text>
          )}
          <Text style={s.line}>Pay {name} in cash, or by JazzCash or Easypaisa. He tells Pechkas when he has received it.</Text>
          <Button kind="outline" label={`Call Pechkas ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </>
      ) : (
        <>
          <Text style={s.title}>{reported}</Text>
          {p.reported_paisa > 0 ? <Text style={s.line}>That leaves {rs(p.outstanding_paisa)} unpaid.</Text> : null}
          {p.customer_answer === 'paid' ? (
            <Text style={s.line}>You told Pechkas you have paid. The office is looking at it and will tell you what it decides. You can post new jobs meanwhile.</Text>
          ) : p.status === 'office' ? (
            <Text style={s.line}>The Pechkas office is looking at it. You can still answer below. You can post new jobs meanwhile.</Text>
          ) : (
            <Text style={s.line}>Please answer by {pkDate(p.answer_due)}. If you do not answer, the Pechkas office looks at it; nothing is decided against you without it.</Text>
          )}
          {p.office_note ? <Text style={s.quote}>Pechkas: “{p.office_note}”</Text> : null}
        </>
      )}

      {p.can_answer && !writing ? (
        <View style={{ gap: 8 }}>
          <Button kind="yellow" label="I have paid" onPress={() => setWriting(true)} />
          <Button kind="outline" label="That's right, I still owe it" busy={busy === 'agrees'} onPress={() => answer('agrees')} />
          <Text style={s.small}>If you say that is right, you cannot post a new job until it is paid. You can answer only once.</Text>
        </View>
      ) : null}

      {writing ? (
        <View style={{ gap: 10 }}>
          <Field
            label="How and when did you pay him?"
            value={text}
            onChangeText={(t) => { setText(t); setErrors({}); }}
            maxLength={300}
            multiline
            error={errors.text}
          />
          {errors.text ? <Text style={s.error}>{errors.text}</Text> : null}
          <Text style={s.small}>A screenshot of the payment helps (optional).</Text>
          {session ? <MediaPick paths={photo} setPaths={(x) => { setPhoto(x); setErrors({}); }} userId={session.user.id} max={1} onProblem={setMsg} /> : null}
          {errors.photo ? <Text style={s.error}>{errors.photo}</Text> : null}
          <Button kind="yellow" label="Send to Pechkas" busy={busy === 'paid'} onPress={() => answer('paid')} />
          <Button kind="outline" label="Back" onPress={() => setWriting(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  cardWarn: { backgroundColor: colour.softBrick },
  cardDone: { backgroundColor: colour.white },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.inkSoft },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: colour.ink },
  figure: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  warn: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.brick },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  error: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.brick },
});
