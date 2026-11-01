import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { addDays, dayLabel, DAYS_AHEAD, openWindows, pkNow, rupees, windowLabel } from '@pechkas/shared';
import { Button, Chip, Field, Notice } from '../components/ui';
import { Panel } from '../components/Panel';
import { Press } from '../components/Press';
import { Sheet, SheetOption } from '../components/Sheet';
import { MediaPick, isVideo } from '../components/MediaPick';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { useAccount } from '../account';
import { useSignedUrls } from '../post/RemoteMedia';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { ask } from '../supabase';
import { colour, font, radius } from '../theme';

/**
 * He says finished, she confirms; and the guarantee (migration
 * checks_and_guarantee). Every card here only shows what my_jobs() says and
 * asks the database to act: confirm_work, not_finished, check_claim,
 * book_replacement. The words are the screens' own; nothing is estimated.
 */

export type Check = { round: number; answer: string | null; reason: string | null; note: string | null; photo: string | null; pro_reply: string | null };
export type Claim = {
  id: string;
  status: 'waiting' | 'coming' | 'checking' | 'refused' | 'replacing' | 'disputed' | 'fixed' | 'not_covered';
  description: string;
  media: string[];
  created_at: string;
  answer_due: string;
  visit_date: string | null;
  visit_from: number | null;
  fixed_at: string | null;
  check_due: string | null;
  why_replacing: 'no_answer' | 'missed_visit' | 'office' | null;
  replacement_job_id: string | null;
  replacement_status: string | null;
  office_note: string | null;
  closed_at: string | null;
};
export type CheckFields = {
  id: string;
  ref: string;
  stage: string | null;
  status: string;
  collect_paisa: number | null;
  photos: { stage: string; path: string }[];
  pro: { first_name: string } | null;
  check_due?: string | null;
  not_finished?: number;
  checks?: Check[];
  disputed?: boolean;
  dispute_outcome?: 'done' | 'stopped' | 'return' | null;
  dispute_note?: string | null;
  confirmed_by?: 'customer' | 'clock' | 'office' | null;
  paid_by_pechkas?: boolean;
  guarantee_of_ref?: string | null;
  claim?: Claim | null;
};

const REASONS = [
  { key: 'not_working', label: 'Still not working' },
  { key: 'unfinished', label: 'Work left unfinished' },
  { key: 'mess', label: 'Mess left behind' },
  { key: 'price', label: 'Price is not what we agreed' },
] as const;

/** "Sat 2 Nov, 5:40pm", on Pakistan's clock. */
export function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })}, ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })
    .replace(' ', '')
    .toLowerCase()}`;
}

/** His finish photos and video, newest round last, as thumbnails that open full size. */
function FinishShots({ photos }: { photos: { stage: string; path: string }[] }) {
  const shots = photos.filter((p) => p.stage === 'after' || p.stage === 'video' || p.stage === 'fix');
  const urls = useSignedUrls(shots.map((p) => ({ kind: isVideo(p.path) ? 'video' : 'photo', path: p.path, seconds: null })));
  if (!shots.length) return null;
  return (
    <View style={s.shots}>
      {shots.map((p) =>
        urls[p.path] ? (
          <Press key={p.path} onPress={() => Linking.openURL(urls[p.path])} accessibilityRole="imagebutton" accessibilityLabel={isVideo(p.path) ? 'Watch his video' : 'His photo'}>
            {isVideo(p.path) ? (
              <View style={[s.shot, s.videoShot]}>
                <Text style={s.videoText}>▶ Video</Text>
              </View>
            ) : (
              <Image source={{ uri: urls[p.path] }} style={s.shot} />
            )}
          </Press>
        ) : (
          <View key={p.path} style={[s.shot, { backgroundColor: colour.paper2 }]} />
        ),
      )}
    </View>
  );
}

/** He says it is finished: check it before you pay. */
export function CheckCard({ job, onChanged }: { job: CheckFields; onChanged: () => void }) {
  const { session } = useAccount();
  const toast = useToast();
  const name = job.pro?.first_name ?? 'The technician';
  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const second = (job.not_finished ?? 0) >= 1;

  async function yes() {
    setBusy(true);
    setMsg(null);
    const r = await ask('confirm_work', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(job.paid_by_pechkas ? 'Pechkas pays for this repair.' : `Now pay ${name} ${rupees(job.collect_paisa)}.`, 'Thank you'));
    onChanged();
  }

  async function no() {
    if (!reason) return setMsg('Choose what is not finished.');
    setBusy(true);
    setMsg(null);
    const r = await ask('not_finished', { p_job: job.id, p_reason: reason, p_note: note || null, p_photo: photo[0] ?? null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setSheet(false);
    toast.show(done(r.disputed ? 'Pechkas will look at both sides and call you.' : `${name} has been told why.`, 'Sent'));
    onChanged();
  }

  return (
    <Panel tone="money" icon="jobs" title="Is it working?" hint={`${name} says the work is finished. Check it before you pay.`}>
      <View style={s.payRow}>
        <Text style={s.payLabel}>{job.paid_by_pechkas ? 'Paid by Pechkas' : `You pay ${name}`}</Text>
        <Text style={s.payFigure}>{job.paid_by_pechkas ? 'Nothing to pay' : rupees(job.collect_paisa)}</Text>
      </View>
      <FinishShots photos={job.photos} />
      {job.check_due ? <Text style={s.small}>If you do nothing, it counts as finished on {when(job.check_due)}.</Text> : null}
      <Button kind="green" icon="arrowRight" label="Yes, it works" busy={busy && !sheet} onPress={yes} />
      <Button kind="outline" label="Not finished yet" onPress={() => { setMsg(null); setSheet(true); }} />
      {!sheet ? <Notice text={msg} /> : null}

      {sheet ? (
        <Sheet title="What is not finished?" onClose={() => setSheet(false)}>
          {REASONS.map((r) => (
            <SheetOption key={r.key} label={r.label} on={reason === r.key} onPress={() => setReason(r.key)} />
          ))}
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Field label="Anything to add? (optional)" value={note} onChangeText={setNote} maxLength={300} multiline />
            <Text style={s.label}>A photo (optional)</Text>
            {session ? <MediaPick paths={photo} setPaths={setPhoto} userId={session.user.id} max={1} onProblem={setMsg} /> : null}
            <Text style={s.small}>
              {second
                ? 'This is the second time. Pechkas will look at both sides’ photos and words, decide, and call you both.'
                : `${name} is told your reason and puts it right. Then you check again.`}
            </Text>
            <Notice text={msg} inline />
            <Button kind="yellow" label={second ? 'Send to Pechkas' : `Send to ${name}`} busy={busy} onPress={no} />
          </View>
        </Sheet>
      ) : null}
    </Panel>
  );
}

/** What she said last time, and his answer, while he puts it right. */
export function LastRound({ job }: { job: CheckFields }) {
  const last = [...(job.checks ?? [])].reverse().find((c) => c.answer === 'not_finished');
  if (!last || job.stage !== 'working' || job.dispute_outcome === 'return') return null;
  const name = job.pro?.first_name ?? 'The technician';
  return (
    <Panel icon="flag" title={`You said: ${last.reason}`} hint={`${name} is putting it right. You will be asked to check again.`}>
      {last.note ? <Text style={s.quote}>“{last.note}”</Text> : null}
      {last.pro_reply ? (
        <Text style={s.line}>
          <Text style={s.strong}>{name}: </Text>“{last.pro_reply}”
        </Text>
      ) : null}
    </Panel>
  );
}

/** Asked twice: the office decides. */
export function DisputeCard({ job }: { job: CheckFields }) {
  const name = job.pro?.first_name ?? 'the technician';
  return (
    <Panel icon="shield" title="Pechkas is looking at this job" hint={`You and ${name} disagree about whether the work is finished.`}>
      <Text style={s.line}>Pechkas looks at both sides’ photos and words, decides, and calls you both. You do not need to do anything now.</Text>
      <Button kind="outline" label={`Call Pechkas · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
    </Panel>
  );
}

/** The office's decision on a disputed job, in its own words. */
export function DecisionCard({ job }: { job: CheckFields }) {
  if (!job.dispute_note || !job.dispute_outcome) return null;
  const name = job.pro?.first_name ?? 'The technician';
  const what =
    job.dispute_outcome === 'done'
      ? 'The work is finished. Pay the agreed price.'
      : job.dispute_outcome === 'stopped'
        ? 'The work was not finished. You pay only the visit fee.'
        : `${name} will come back to put it right.`;
  return (
    <Panel icon="help" title="Pechkas decided" hint={what}>
      <Text style={s.quote}>“{job.dispute_note}”</Text>
    </Panel>
  );
}

/** Where a guarantee claim has got to, and what she can do about it. */
export function ClaimCard({ job, onChanged }: { job: CheckFields; onChanged: () => void }) {
  const claim = job.claim!;
  const toast = useToast();
  const name = job.pro?.first_name ?? 'The technician';
  const [broken, setBroken] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const now = pkNow();
  const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(now.date, i)).filter((d) => openWindows(d, now).length > 0);

  async function check(fixed: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await ask('check_claim', { p_claim: claim.id, p_fixed: fixed, p_text: fixed ? null : text });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(fixed ? 'Your claim is closed.' : 'Pechkas will look at it and call you.'));
    onChanged();
  }

  async function book(day: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask<{ job_id: string }>('book_replacement', { p_claim: claim.id, p_date: day });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    onChanged();
    router.push({ pathname: '/job/[id]', params: { id: r.job_id } });
  }

  const status: Record<Claim['status'], [string, string]> = {
    waiting: ['Waiting for his answer', `${name} must answer by ${when(claim.answer_due)}. If he does not, Pechkas sends another technician and pays for the repair.`],
    coming: ['He is coming back', `${name} will come back ${claim.visit_date ? `on ${dayLabel(claim.visit_date, now.date)}, ${windowLabel(claim.visit_from ?? 8)}` : 'soon'}. It costs you nothing.`],
    checking: ['Check his repair', `${name} says it is fixed. Check it works.`],
    refused: ['Pechkas is deciding', `${name} says this is not his work. Pechkas looks at your photos, decides, and calls you.`],
    disputed: ['Pechkas is deciding', 'You said it is still broken. Pechkas looks at both sides’ photos, decides, and calls you.'],
    replacing: claim.replacement_job_id
      ? ['Another technician is booked', 'Pechkas pays for this repair. Open it to choose the technician, as with any job.']
      : ['Pechkas will send another technician', 'Pechkas pays for the repair. Choose the day:'],
    fixed: ['Fixed', `Your claim was closed${claim.closed_at ? ` on ${dayLabel(claim.closed_at.slice(0, 10), now.date)}` : ''}.`],
    not_covered: ['Not covered', 'Pechkas looked at your claim and found it is not covered by the guarantee:'],
  };
  const [title, line] = status[claim.status];

  return (
    <Panel icon="shield" title={title} hint={line}>
      {claim.status === 'not_covered' && claim.office_note ? <Text style={s.quote}>“{claim.office_note}”</Text> : null}
      {claim.status === 'checking' ? (
        <>
          <FinishShots photos={job.photos.filter((p) => p.stage === 'fix')} />
          {claim.check_due ? <Text style={s.small}>If you do nothing, it counts as fixed on {when(claim.check_due)}.</Text> : null}
          {!broken ? (
            <>
              <Button kind="green" label="Yes, it is fixed" busy={busy} onPress={() => check(true)} />
              <Button kind="outline" label="Still broken" onPress={() => setBroken(true)} />
            </>
          ) : (
            <>
              <Field label="What is still wrong?" value={text} onChangeText={setText} maxLength={300} multiline />
              <Button kind="yellow" label="Send to Pechkas" busy={busy} onPress={() => check(false)} />
              <Button kind="outline" label="Go back" onPress={() => setBroken(false)} />
            </>
          )}
        </>
      ) : null}
      {claim.status === 'replacing' && !claim.replacement_job_id ? (
        <View style={s.wrap}>
          {days.map((d) => (
            <Chip key={d} label={dayLabel(d, now.date)} on={false} onPress={() => (busy ? undefined : book(d))} />
          ))}
        </View>
      ) : null}
      {claim.status === 'replacing' && claim.replacement_job_id ? (
        <Button kind="yellow" icon="arrowRight" label="Open the repair" onPress={() => router.push({ pathname: '/job/[id]', params: { id: claim.replacement_job_id! } })} />
      ) : null}
      <Text style={s.small}>Your claim: “{claim.description}”</Text>
      <Notice text={msg} />
    </Panel>
  );
}

/** On a guarantee repair: who pays, and for which job. */
export function GuaranteeRepairNote({ job }: { job: CheckFields }) {
  if (!job.paid_by_pechkas) return null;
  return (
    <Panel tone="money" icon="shield" title="Guarantee repair" hint={`For job ${job.guarantee_of_ref ?? ''}. Pechkas pays the technician; you pay nothing.`} />
  );
}

const s = StyleSheet.create({
  payRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colour.white },
  payLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.inkSoft },
  payFigure: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  shots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shot: { width: 76, height: 76, borderRadius: 14 },
  videoShot: { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  videoText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.paper },
  kicker: { fontFamily: font.bodySemi, fontSize: 11.5, letterSpacing: 0.8, color: colour.green },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  strong: { fontFamily: font.bodySemi, color: colour.ink },
  quote: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 21, color: colour.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
