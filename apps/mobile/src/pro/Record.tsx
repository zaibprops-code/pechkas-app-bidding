import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { fill, proError, type ProWords } from '../words';
import { colour, font } from '../theme';

/**
 * His own record of arriving on time (the owner's decision D10): late
 * arrivals and no-shows, what the office decided, and a way to say a record
 * is wrong. Everything here is `pro_record()`: the database counts, this
 * screen shows the counts. Nothing on it suspends or charges anybody.
 */

export type Incident = {
  id: string;
  kind: 'late_arrival' | 'no_show';
  status: 'recorded' | 'potential' | 'confirmed' | 'dismissed' | 'disputed';
  ref: string;
  minutes_late: number | null;
  how: 'arrived_late' | 'cancelled_waiting' | 'clock';
  detected_at: string;
  pro_text: string | null;
  office_note: string | null;
  can_dispute: boolean;
};
export type ProRecord = {
  late_arrivals: number;
  no_shows: number;
  review_at: number;
  no_shows_at?: number;
  days: number;
  incidents: Incident[];
  /** The nobody-home reports he made (nobody_home). */
  not_home_reports?: { id: string; ref: string; reason: 'nobody_home' | 'guard'; status: 'submitted' | 'disputed' | 'confirmed' | 'rejected'; submitted_at: string; office_note: string | null }[];
  not_home_reports_at?: number;
  /** Arrivals the location check could not verify (arrival_by_location). */
  unverified_arrivals?: { ref: string; arrived_at: string; status: 'pending' | 'rejected' | 'approved'; result: string | null; note: string | null }[];
  unverified_arrivals_at?: number;
};

export function RecordCard({ record, w, onChanged }: { record: ProRecord; w: ProWords; onChanged: () => void }) {
  const noShowsAt = Number(record.no_shows_at ?? 1);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.soft}>
          <DuoIcon name="clock" size={22} />
        </View>
        <Text style={s.headText} accessibilityRole="header">
          {w.recordTitle}
        </Text>
      </View>
      <Text style={s.big}>{fill(w.recordCounts, { late: record.late_arrivals, days: record.days, noShows: record.no_shows })}</Text>
      <Text style={s.note}>{w.recordHint}</Text>
      <Text style={s.note}>{fill(noShowsAt === 1 ? w.recordReviewOne : w.recordReview, { n: record.review_at, m: noShowsAt, days: record.days })}</Text>
      {record.incidents.length === 0 ? <Text style={s.line}>{w.recordClean}</Text> : null}
      {record.incidents.map((i) => (
        <IncidentRow key={i.id} i={i} w={w} onChanged={onChanged} />
      ))}
      {record.unverified_arrivals?.length ? (
        <View style={s.row}>
          <Text style={s.rowTitle}>{w.recordArrivalsTitle}</Text>
          <Text style={s.note}>{fill(w.recordArrivalsHint, { n: record.unverified_arrivals_at ?? 3, days: record.days })}</Text>
          {record.unverified_arrivals.map((a) => (
            <View key={`${a.ref}-${a.arrived_at}`} style={{ gap: 2 }}>
              <Text style={s.line}>
                {a.ref} · {new Date(a.arrived_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={[s.status, a.status === 'approved' && { color: colour.green }]}>{w[`recordArrival_${a.status}` as keyof ProWords]}</Text>
              {a.note ? <Text style={s.quote}>{fill(w.recordOffice, { note: a.note })}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {record.not_home_reports?.length ? (
        <View style={s.row}>
          <Text style={s.rowTitle}>{w.recordNotHomeTitle}</Text>
          <Text style={s.note}>{fill(w.recordNotHomeHint, { n: record.not_home_reports_at ?? 3, days: record.days })}</Text>
          {record.not_home_reports.map((r) => (
            <View key={r.id} style={{ gap: 2 }}>
              <Text style={s.line}>
                {r.ref} · {new Date(r.submitted_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })} · {w[`recordNotHome_${r.reason}` as keyof ProWords]}
              </Text>
              <Text style={s.status}>{w[`recordNhStatus_${r.status}` as keyof ProWords]}</Text>
              {r.office_note ? <Text style={s.quote}>{fill(w.recordOffice, { note: r.office_note })}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function IncidentRow({ i, w, onChanged }: { i: Incident; w: ProWords; onChanged: () => void }) {
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const what =
    i.kind === 'no_show'
      ? w.recordNoShow
      : fill(i.how === 'cancelled_waiting' ? w.recordLateCancelled : w.recordLate, { minutes: i.minutes_late ?? 0 });
  const status = w[`recordStatus_${i.status}` as keyof ProWords];

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await ask('pro_dispute_incident', { p_incident: i.id, p_text: text });
    setBusy(false);
    if (!r.ok) return setMsg(proError(w, r.field, r.why));
    setWriting(false);
    setText('');
    toast.show(done(w.recordSent));
    onChanged();
  }

  return (
    <View style={s.row}>
      <Text style={s.rowTitle}>
        {i.ref} · {new Date(i.detected_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
      </Text>
      <Text style={s.line}>{what}</Text>
      <Text style={[s.status, i.status === 'dismissed' && { color: colour.green }]}>{status}</Text>
      {i.pro_text ? <Text style={s.note}>{fill(w.recordYou, { text: i.pro_text })}</Text> : null}
      {i.office_note ? <Text style={s.quote}>{fill(w.recordOffice, { note: i.office_note })}</Text> : null}
      {i.can_dispute && !writing ? <Button kind="outline" label={w.recordDispute} onPress={() => setWriting(true)} /> : null}
      {writing ? (
        <View style={{ gap: 8 }}>
          <Field label={w.recordDisputeLabel} value={text} onChangeText={setText} maxLength={300} multiline />
          <Button kind="green" label={w.recordSend} busy={busy} onPress={send} />
          <Button kind="outline" label={w.recordBack} onPress={() => setWriting(false)} />
        </View>
      ) : null}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  soft: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, fontFamily: font.display, fontSize: 17, color: colour.ink },
  big: { fontFamily: font.display, fontSize: 17, lineHeight: 23, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  row: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colour.rule },
  rowTitle: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  status: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
});
