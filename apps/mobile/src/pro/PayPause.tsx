import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { rupees } from '@pechkas/shared';
import { Button, Field, Notice } from '../components/ui';
import { Press } from '../components/Press';
import { Panel } from '../components/Panel';
import { ask } from '../supabase';
import { done, type Message } from '../message';
import { fill, type ProWords } from '../words';
import { colour, font } from '../theme';

/**
 * A5: what he sees when a payment he sent did not arrive in full, and when a
 * second one within 90 days has paused his new offers by rule. The words
 * say what he said he paid and what arrived, never "fraud", "false" or
 * "verified". The pause has no end date: he writes to Pechkas
 * (pro_pay_appeal) and the office answers in writing, here.
 */

export type Strike = {
  created_at: string;
  corrected_at: string;
  method: string;
  reference: string;
  amount_paisa: number;
  received_paisa: number;
};

export type PayPause = {
  id: string;
  since: string;
  strikes: Strike[];
  appeal: { id: string; words: string; at: string; status: 'waiting' | 'kept' | 'lifted'; note: string | null; answered_at: string | null } | null;
  can_appeal: boolean;
  strike_days: number;
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
const METHOD: Record<string, string> = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'bank transfer' };

/** One line per payment: "12 Nov: you said Rs 2,000. Pechkas received Rs 500." */
function strikeLine(x: Strike, w: ProWords) {
  return fill(x.received_paisa > 0 ? w.payStrikeLine : w.payStrikeNothing, {
    date: day(x.created_at),
    amount: rupees(x.amount_paisa),
    received: rupees(x.received_paisa),
  });
}

/** The pause, in full, on My account: why, both payments, and his appeal. */
export function PayPauseCard({ pause, w, onChanged }: { pause: PayPause; w: ProWords; onChanged: () => void }) {
  const [words, setWords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | Message | null>(null);
  const [busy, setBusy] = useState(false);
  const a = pause.appeal;

  async function send() {
    setError(null);
    if (words.trim().length < 10) return setError(w.payAppealShort);
    setBusy(true);
    const r = await ask('pro_pay_appeal', { p_words: words.trim() });
    setBusy(false);
    if (!r.ok) {
      if (r.field === 'words') return setError(r.why);
      return setNotice(r.why);
    }
    setWords('');
    setNotice(done(w.payAppealSent));
    onChanged();
  }

  return (
    <Panel icon="wallet" title={w.payPausedTitle}>
      <Text style={s.body}>{fill(w.payPausedWhy, { days: pause.strike_days })}</Text>
      <View style={s.list}>
        {pause.strikes.map((x) => (
          <Text key={x.created_at} style={s.item}>
            {'• '}
            {strikeLine(x, w)}
          </Text>
        ))}
      </View>
      <Text style={s.body}>{w.payPausedGoOn}</Text>

      {a?.status === 'waiting' ? (
        <View style={[s.box, { backgroundColor: colour.softYellow }]}>
          <Text style={s.boxText}>{w.payAppealSent}</Text>
          <Text style={s.small}>{`“${a.words}”`}</Text>
        </View>
      ) : null}
      {a?.status === 'kept' ? (
        <View style={[s.box, { backgroundColor: colour.softBrick }]}>
          <Text style={s.boxText}>{fill(w.payAppealKept, { note: a.note ?? '' })}</Text>
        </View>
      ) : null}

      {pause.can_appeal ? (
        <View style={{ gap: 10 }}>
          <Text style={s.body}>{w.payAppealHow}</Text>
          <Field
            label={w.payAppealLabel}
            value={words}
            onChangeText={(v) => {
              setWords(v);
              setError(null);
            }}
            multiline
            maxLength={500}
            error={error ?? undefined}
          />
          <Button label={w.payAppealSend} onPress={send} busy={busy} />
        </View>
      ) : null}
      <Notice text={notice} />
    </Panel>
  );
}

/** On the jobs screen: the pause in two lines, and a tap to My account. */
export function PayPauseBanner({ w, style }: { w: ProWords; style: object }) {
  return (
    <Press onPress={() => router.push('/pro/money')} accessibilityRole="button" style={style}>
      <Text style={s.bannerTitle}>{w.payPausedTitle}</Text>
      <Text style={s.bannerText}>{w.payPausedBanner}</Text>
    </Press>
  );
}

export type ShortClaim = {
  id: string;
  amount_paisa: number;
  method: string;
  reference: string;
  created_at: string;
  received_paisa: number | null;
  missing_paisa: number | null;
  corrected_at: string | null;
  note: string | null;
};

/** A payment the office marked "Not received" or "Received less". Shown for 30 days, and not under a pause, which says it all. */
export function ShortfallCard({ c, strikeDays, w }: { c: ShortClaim; strikeDays: number; w: ProWords }) {
  const received = Number(c.received_paisa ?? 0);
  return (
    <View style={[s.box, { backgroundColor: colour.softBrick }]}>
      <Text style={s.boxTitle}>{w.payShortTitle}</Text>
      <Text style={s.boxText}>
        {fill(received > 0 ? w.payShortLess : w.payShortNothing, {
          date: day(c.created_at),
          amount: rupees(c.amount_paisa),
          method: METHOD[c.method] ?? c.method,
          ref: c.reference,
          received: rupees(received),
          missing: rupees(Number(c.missing_paisa ?? c.amount_paisa)),
        })}
      </Text>
      {c.note ? <Text style={s.small}>{fill(w.payShortNote, { note: c.note })}</Text> : null}
      <Text style={s.small}>{w.payShortProof}</Text>
      <Text style={s.small}>{fill(w.payShortAgain, { days: strikeDays })}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.ink },
  list: { gap: 6 },
  item: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 21, color: colour.ink },
  box: { gap: 6, padding: 12, borderRadius: 16 },
  boxTitle: { fontFamily: font.display, fontSize: 15.5, color: colour.ink },
  boxText: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.ink },
  bannerTitle: { fontFamily: font.display, fontSize: 16, color: colour.white },
  bannerText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.white },
});
