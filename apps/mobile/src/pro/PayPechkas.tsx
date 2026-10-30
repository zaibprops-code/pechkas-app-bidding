import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { Press } from '../components/Press';
import { DuoIcon } from '../components/DuoIcon';
import { useAccount } from '../account';
import { takePhoto, upload, type Media } from '../post/media';
import { ask } from '../supabase';
import { fill, type ProWords } from '../words';
import { colour, font, radius } from '../theme';

/**
 * Pay Pechkas, on My account. He pays OUTSIDE the app — JazzCash, Easypaisa
 * or the bank, to the account the office typed in — and then tells the
 * office here: the amount, how, the transaction ID and a screenshot
 * (claim_payment()). Nothing he sends lowers what he owes; only the
 * office's confirmation in the admin panel does, through the same ledger
 * rule as a payment typed in by hand. One claim waits at a time.
 */

export type Claim = {
  id: string;
  amount_paisa: number;
  method: 'jazzcash' | 'easypaisa' | 'bank';
  reference: string;
  status: 'pending' | 'confirmed' | 'rejected';
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};

const METHODS = [
  ['jazzcash', 'JazzCash'],
  ['easypaisa', 'Easypaisa'],
  ['bank', 'Bank transfer'],
] as const;
const methodName = (m: string) => METHODS.find(([k]) => k === m)?.[1] ?? m;

export function PayPechkas({ owed, payTo, claims, w, onSent }: { owed: number; payTo: string | null; claims: Claim[]; w: ProWords; onSent: () => void }) {
  const { session } = useAccount();
  const latest = claims[0] ?? null;
  const waiting = latest?.status === 'pending' ? latest : null;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, Math.round(owed / 100))));
  const [method, setMethod] = useState<Claim['method'] | null>(null);
  const [ref, setRef] = useState('');
  const [shot, setShot] = useState<Media | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (owed <= 0 && !latest) return null;

  async function pick() {
    setMsg(null);
    try {
      const m = await takePhoto(false);
      if (m) {
        setShot(m);
        setErrors((e) => ({ ...e, screenshot: '' }));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    setMsg(null);
    const rupeesWhole = Number(amount.replace(/[^0-9]/g, ''));
    const early: Record<string, string> = {};
    if (!rupeesWhole) early.amount = 'Write the amount you sent.';
    if (!method) early.method = 'Choose how you paid.';
    if (ref.trim().length < 3) early.reference = 'Write the transaction ID.';
    if (!shot) early.screenshot = 'Add a screenshot of the payment.';
    if (Object.keys(early).length) return setErrors(early);
    if (!session) return;
    setErrors({});
    setBusy(true);
    let path: string;
    try {
      path = await upload(shot!, session.user.id);
      setShot({ ...shot!, path });
    } catch {
      setBusy(false);
      return setMsg('The screenshot did not send. Check your signal and try again.');
    }
    const r = await ask('claim_payment', { p_amount_paisa: rupeesWhole * 100, p_method: method, p_reference: ref.trim(), p_screenshot: path });
    setBusy(false);
    if (!r.ok) {
      if (r.field && ['amount', 'method', 'reference', 'screenshot'].includes(r.field)) setErrors({ [r.field]: r.why });
      else setMsg(r.why);
      return;
    }
    setOpen(false);
    setShot(null);
    setRef('');
    onSent();
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.soft}>
          <DuoIcon name="wallet" size={22} />
        </View>
        <Text style={s.headText} accessibilityRole="header">
          {w.howToPay}
        </Text>
      </View>

      {owed > 0 ? (
        <>
          <Text style={s.label}>{fill(w.paySendTo, { owed: rupees(owed) })}</Text>
          {/* Selectable, so a long press copies the number into JazzCash or the bank's app. */}
          <View style={s.payBox}>
            <Text selectable style={s.payTo}>
              {payTo ?? w.payAsk}
            </Text>
          </View>
          {payTo ? <Text style={s.note}>{w.payHold}</Text> : null}
        </>
      ) : null}

      {/* What happened to the last one he sent. */}
      {waiting ? (
        <View style={[s.status, { backgroundColor: colour.softYellow }]}>
          <Text style={s.statusText}>{fill(w.payWaiting, { amount: rupees(waiting.amount_paisa), method: methodName(waiting.method), ref: waiting.reference })}</Text>
        </View>
      ) : latest?.status === 'rejected' ? (
        <View style={[s.status, { backgroundColor: colour.softBrick }]}>
          <Text style={s.statusText}>{fill(w.payRejected, { amount: rupees(latest.amount_paisa), reason: latest.reason ?? '' })}</Text>
          {owed > 0 ? <Text style={s.note}>{w.payRejectedAgain}</Text> : null}
        </View>
      ) : latest?.status === 'confirmed' ? (
        <View style={[s.status, { backgroundColor: colour.greenSoft }]}>
          <Text style={s.statusText}>
            {fill(w.payConfirmed, { amount: rupees(latest.amount_paisa), date: new Date(latest.decided_at ?? latest.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })}
          </Text>
        </View>
      ) : null}

      {!waiting && owed > 0 && !open ? (
        <>
          <Button icon="arrowRight" label={w.iHavePaid} onPress={() => setOpen(true)} />
          <Text style={s.note}>{w.payOutside}</Text>
        </>
      ) : null}

      {!waiting && owed > 0 && open ? (
        <View style={{ gap: 12 }}>
          <Field
            label={w.payAmount}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setErrors((e) => ({ ...e, amount: '' }));
            }}
            keyboardType="number-pad"
            error={errors.amount}
          />
          <View style={{ gap: 8 }}>
            <Text style={s.label}>{w.payHow}</Text>
            <View style={s.chips}>
              {METHODS.map(([k, label]) => (
                <Press
                  key={k}
                  onPress={() => {
                    setMethod(k);
                    setErrors((e) => ({ ...e, method: '' }));
                  }}
                  sink={0.94}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: method === k }}
                  style={[s.chip, method === k && s.chipOn]}
                >
                  <Text style={[s.chipText, method === k && { color: colour.white }]}>{label}</Text>
                </Press>
              ))}
            </View>
            {errors.method ? <Text style={s.error}>{errors.method}</Text> : null}
          </View>
          <Field
            label={w.payRef}
            value={ref}
            onChangeText={(v) => {
              setRef(v);
              setErrors((e) => ({ ...e, reference: '' }));
            }}
            autoCapitalize="characters"
            hint={w.payRefHint}
            error={errors.reference}
            maxLength={80}
          />
          <View style={{ gap: 8 }}>
            <Text style={s.label}>{w.payShotNeeded}</Text>
            {shot ? <Image source={{ uri: shot.uri }} style={s.shot} resizeMode="contain" accessibilityLabel={w.payShotNeeded} /> : null}
            <Button kind="outline" icon="camera" label={shot ? w.payShotChange : w.payShot} onPress={pick} />
            {errors.screenshot ? <Text style={s.error}>{errors.screenshot}</Text> : null}
          </View>
          <Button kind="green" label={w.paySend} busy={busy} onPress={send} />
          <Button kind="outline" label={w.payCancel} onPress={() => setOpen(false)} />
          <Text style={s.note}>{w.payOutside}</Text>
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  soft: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, fontFamily: font.display, fontSize: 17, color: colour.ink },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  payBox: { padding: 14, borderRadius: 16, backgroundColor: colour.canvas },
  payTo: { fontFamily: font.bodySemi, fontSize: 17, lineHeight: 24, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  status: { gap: 4, padding: 12, borderRadius: 16 },
  statusText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colour.rule, backgroundColor: colour.white },
  chipOn: { backgroundColor: colour.green, borderColor: colour.green },
  chipText: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink },
  // The whole screenshot, never cropped: the amount and the ID must be readable before sending.
  shot: { width: '100%', height: 260, borderRadius: 16, backgroundColor: colour.canvas },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
});
