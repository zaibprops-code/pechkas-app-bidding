import { useCallback, useEffect, useState } from 'react';
import { JobReports } from '../components/Reports';
import { Image, Linking, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { dayLabel, pkClock, rupees } from '@pechkas/shared';
import { DuoIcon, type DuoName } from '../components/DuoIcon';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { pictureOf, WorkArt } from '../components/WorkArt';
import { Button, Field, Notice } from '../components/ui';
import { YellowTop } from '../components/YellowTop';
import { done } from '../message';
import { toOffice } from '../office';
import { useSignedUrls } from '../post/RemoteMedia';
import { ask, supabase } from '../supabase';
import { colour, font } from '../theme';
import { SHADOW } from './bits';
import { cancelledNote } from './Cancel';
import { ClaimCard } from './Checking';
import { Face } from './Face';
import { SafetyReport } from './FirstJobs';
import type { Job } from './JobCard';
import { NotHomeEnded } from './NotHome';
import { PaymentCard } from './Payment';
import { FeeCard, feeHead, feeNeedsHer } from './VisitFee';

/**
 * A finished job's own page (the owner's design, 25 November 2026): done,
 * a visit fee only, or cancelled. Clean on purpose — two cards and two
 * buttons, every tap target a fingertip wide, and nothing said twice:
 *
 *   - the yellow top: kind of work and job number, the title, how it ended
 *     and the one date (Pakistan's clock), with the trade's drawing;
 *   - anything she must answer first (a payment question, the visit fee,
 *     an open guarantee claim);
 *   - the money card: what she paid, large, then its parts, a price that
 *     changed with her OK, Pechkas' decision, Share receipt, and the
 *     guarantee with **It has failed again**;
 *   - the visit card: who came (or that he has left Pechkas), her stars,
 *     his note for her, how long it took, the address, See every step
 *     (a sheet with the whole record to the minute) and the photos;
 *   - Ask him again and Book again side by side, then Get help, Report
 *     something unsafe and Never send me him as rows.
 *
 * my_jobs() gives the job; my_job_story() (migration …_job_story) the
 * steps, times, price changes, her words and his note. Without it — a
 * database not yet updated — the page still draws everything else.
 */

type Step = {
  what: string;
  at: string;
  by?: 'customer' | 'pro' | 'office' | 'system';
  name?: string;
  paisa?: number;
  text?: string;
  kind?: string;
  day?: string;
  eta?: string;
};
type Story = {
  ok: boolean;
  steps: Step[];
  posted_at: string;
  arrived_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  took_minutes: number | null;
  first_paisa: number | null;
  chosen_paisa: number | null;
  changes: { from_paisa: number; price_paisa: number; reason: string; status: string; asked_at: string; decided_at: string | null; by: string | null }[];
  my_words: string | null;
  offers: number;
  cancel: { by: string; category: string; at: string; reason: string | null } | null;
  pro_left: boolean;
  pro_note: string | null;
  chat_until: string | null;
  original: { id: string; ref: string; finished_at: string | null } | null;
  replacement: { id: string; ref: string; status: string; finished_at: string | null; pro: string | null } | null;
  claim_why: string | null;
};

const BIG = 56;

/** "Wed 25 Nov 2026", on Pakistan's calendar. */
export function fullDay(iso: string): string {
  const pk = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAYS[pk.getUTCDay()]} ${pk.getUTCDate()} ${MONTHS[pk.getUTCMonth()]} ${pk.getUTCFullYear()}`;
}
const dayAndTime = (iso: string) => `${fullDay(iso)} · ${pkClock(iso)}`;
const took = (min: number) => (min < 1 ? 'Under a minute' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}`);
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));

/** How it ended, in two or three words, for the top and the receipt. */
function endedAs(job: Job): string {
  if (job.status === 'done') return job.paid_by_pechkas ? 'Done · free repair' : 'Done';
  if (job.status === 'stopped') return job.stop_reason === 'office_no_fee' ? 'Stopped · nothing to pay' : 'Visit fee only';
  if (job.cancelled_by === 'nobody') return 'Nobody took it';
  if (job.cancelled_by === 'office') return 'Cancelled by Pechkas';
  if (job.cancelled_by === 'pro') return job.not_home?.reason === 'guard' ? 'Closed: the guard did not let him in' : 'Closed: nobody answered';
  return 'Cancelled';
}

/** What happened to a cancelled job, in one sentence the top has not already said. */
function cancelledHow(job: Job, story: Story | null): string {
  const cat = story?.cancel?.category ?? job.cancel_category;
  if (job.cancelled_by === 'nobody') return 'No technician was free on the day';
  if (job.cancelled_by === 'office') return 'The Pechkas office stopped this job';
  if (job.cancelled_by === 'pro') return job.not_home?.reason === 'guard' ? 'The guard did not let him in' : 'Nobody answered the door';
  if (cat === 'before_choosing') return 'You cancelled it before choosing anyone';
  if (cat === 'pro_late' || cat === 'no_show') return 'You cancelled it because he was late';
  if (cat === 'late') return 'You cancelled it close to the visit';
  return 'You cancelled it';
}

/** One step of the record in words. `cur` is the technician on the job at that moment; `his` the one who did it. */
function stepWords(st: Step, cur: string, his: string): { title: string; sub?: string } | null {
  const office = st.by === 'office';
  switch (st.what) {
    case 'posted':
      return { title: 'Posted', sub: st.paisa ? `Your price ${rupees(st.paisa)}` : undefined };
    case 'price_raised':
      return { title: `You raised your price to ${rupees(st.paisa ?? 0)}` };
    case 'day_changed':
      return { title: 'You chose another day', sub: st.day ? dayLabel(st.day) : undefined };
    case 'assigned':
      return { title: `${st.name ?? 'A technician'} chosen`, sub: st.paisa ? `For ${rupees(st.paisa)}` : undefined };
    case 'on_way':
      return { title: `${cur} set off` };
    case 'running_late':
      return { title: `${cur} said he was running late`, sub: st.eta ? `New time ${pkClock(st.eta)}` : undefined };
    case 'arrived':
      return { title: `${cur} arrived` };
    case 'working':
      return { title: 'Work started', sub: 'You gave him the start code' };
    case 'change_asked':
      return { title: `New price asked: ${rupees(st.paisa ?? 0)}`, sub: st.text ? `“${st.text}”` : undefined };
    case 'change_approved':
      return { title: office ? 'Pechkas approved the new price' : 'You approved it' };
    case 'change_declined':
      return { title: office ? 'Pechkas declined the new price' : 'You declined it' };
    case 'change_withdrawn':
      return { title: `${cur} took the new price back` };
    case 'checking':
      return { title: `${cur} said the work was finished` };
    case 'not_finished':
      return { title: 'You said: not finished yet', sub: st.text };
    case 'disputed':
      return { title: 'Sent to Pechkas to decide' };
    case 'dispute_decided':
      return {
        title: 'Pechkas decided',
        sub: st.kind === 'done' ? 'The work counts as finished' : st.kind === 'stopped' ? 'The work could not be finished' : `${cur} went back to finish it`,
      };
    case 'confirmed':
      return st.kind === 'clock'
        ? { title: 'Counted as finished', sub: 'Nobody checked it within a day' }
        : st.kind === 'office'
          ? { title: 'Pechkas closed it' }
          : { title: 'You said it works' };
    case 'done':
      return { title: 'Done' };
    case 'stopped':
      return { title: 'Stopped: visit fee only' };
    case 'cancelled':
      return {
        title:
          st.kind === 'nobody'
            ? 'Closed: no technician was free'
            : st.kind === 'office'
              ? 'Pechkas cancelled it'
              : st.kind === 'pro'
                ? 'Closed: he could not get in'
                : 'You cancelled it',
      };
    case 'reopened':
      return st.kind === 'replaced'
        ? { title: 'You asked for another technician', sub: 'The job went back to everyone' }
        : st.kind === 'not_the_man'
          ? { title: 'You said it was not the man in the photo', sub: 'The job went back to everyone' }
          : st.kind === 'no_checker'
            ? { title: 'No checker could come', sub: 'The job went back to everyone' }
            : { title: `${cur} could not come`, sub: 'The job went back to everyone' };
    case 'guarantee':
      return { title: 'You claimed the guarantee' };
    case 'claim_coming':
      return { title: `${his} agreed to come back`, sub: st.day ? dayLabel(st.day) : undefined };
    case 'claim_fixed':
      return { title: `${his} said it was fixed` };
    case 'claim_still_broken':
      return { title: 'You said it was still broken' };
    case 'claim_refused':
      return { title: 'Your claim went to Pechkas to decide' };
    case 'claim_no_answer':
      return { title: `${his} did not answer your claim` };
    case 'claim_missed_visit':
      return { title: `${his} did not come back` };
    case 'claim_decided':
      return { title: st.kind === 'covered' ? 'Pechkas decided the guarantee covers it' : 'Pechkas decided it is not covered' };
    case 'claim_closed':
      return { title: st.kind === 'clock' ? 'Your claim closed by itself' : 'You closed your claim: fixed' };
    case 'replacement_booked':
      return { title: 'Another technician booked', sub: 'Pechkas pays for the repair' };
    default:
      return null;
  }
}

/** The receipt as plain words, for the phone's own share sheet. No address, no phone number. */
function receiptText(job: Job, trade: string, name: string | null, story: Story | null): string {
  const lines = ['Pechkas receipt', `Job ${job.ref} · ${trade}`, job.title];
  if (job.finished_at) lines.push(`${endedAs(job)} · ${fullDay(job.finished_at)}, ${pkClock(job.finished_at)}`);
  if (name) lines.push(`Technician: ${name}`);
  if (job.paid_by_pechkas) {
    lines.push('Free: a guarantee repair, paid by Pechkas');
  } else if (job.status === 'stopped') {
    lines.push(`Visit fee: ${rupees(job.collect_paisa)}`);
  } else {
    if (job.parts_paisa) {
      lines.push(`Work: ${rupees((job.collect_paisa ?? 0) - job.parts_paisa)}`, `Parts (shop receipt): ${rupees(job.parts_paisa)}`);
    }
    lines.push(`Total: ${rupees(job.collect_paisa)}`);
  }
  const change = story?.changes.find((c) => c.status === 'approved');
  if (change) lines.push(`Price agreed ${rupees(change.from_paisa)}, changed to ${rupees(change.price_paisa)} with ${change.by === 'office' ? 'Pechkas’' : 'the customer’s'} OK`);
  if (job.status === 'done' && job.guarantee_until) lines.push(`Guaranteed until ${fullDay(job.guarantee_until)}`);
  lines.push('pechkas.net');
  return lines.join('\n');
}

export function PastJob({ job, trade, onChanged }: { job: Job; trade: string; onChanged: () => void }) {
  const toast = useToast();
  const narrow = useWindowDimensions().width < 360;
  const [story, setStory] = useState<Story | null>(null);
  const [steps, setSteps] = useState(false);
  const [stars, setStars] = useState(0);
  const [words, setWords] = useState('');
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(0);
  const [unsafe, setUnsafe] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockWhy, setBlockWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Asked again only when something on the page could have changed it.
  const sign = `${job.id}|${job.status}|${job.my_rating ?? ''}|${job.claim?.status ?? ''}|${job.finished_at ?? ''}`;
  const loadStory = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_job_story', { p_job: job.id });
    if (!error && data && (data as Story).ok) setStory(data as Story);
  }, [job.id]);
  useEffect(() => {
    loadStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sign, loadStory]);

  const over = job.status === 'done' || job.status === 'stopped';
  const left = Boolean(story?.pro_left);
  const name = job.pro?.first_name ?? null;
  const who = name ?? 'the technician';
  const endedAt = over ? job.finished_at : (story?.cancel?.at ?? job.created_at);
  const photos = job.photos.filter((p) => p.stage !== 'change');
  const urls = useSignedUrls(photos.map((p) => ({ kind: p.stage === 'video' ? 'video' : 'photo', path: p.path, seconds: null })));
  const guarantee = job.status === 'done' && job.guarantee_until ? job.guarantee_until : null;
  const covered = guarantee ? new Date(guarantee) > new Date() : false;
  const claim = job.claim ?? null;
  const claimOpen = claim && !['fixed', 'not_covered'].includes(claim.status);
  const payOpen = job.payment && job.payment.status !== 'closed';
  const canAskAgain = Boolean(job.can_ask_again && job.pro);
  const canBookAgain = !job.paid_by_pechkas;
  const canBlock = Boolean(job.can_block && job.block_name);
  const approved = story?.changes.find((c) => c.status === 'approved') ?? null;
  const declined = story?.changes.find((c) => c.status === 'declined') ?? null;
  // A visit fee still waiting on her has its own card, with what she can do; once settled, the money card says it.
  const fee = job.status === 'stopped' && job.visit_fee ? job.visit_fee : null;
  const feeOpen = Boolean(fee && feeNeedsHer(fee));
  const feeWords = fee ? feeHead(fee, who) : null;

  async function rate() {
    if (!stars) return setMsg('Choose from one to five stars.');
    setBusy(true);
    setMsg(null);
    const r = await ask('rate_job', { p_job: job.id, p_stars: stars, p_words: words });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done('Your rating is saved.', 'Thank you'));
    onChanged();
  }

  async function report() {
    setBusy(true);
    setMsg(null);
    const r = await ask('report_problem', { p_job: job.id, p_text: problem });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setWriting(false);
    setSent((n) => n + 1);
    toast.show(done('Your message has gone to the Pechkas office. Its answer will be on this page.'));
    onChanged();
  }

  async function askAgain() {
    setBusy(true);
    setMsg(null);
    const r = await ask<{ first_name: string; minutes: number }>('ask_again', { p_from_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    router.push({ pathname: '/post', params: { trade: job.trade, ask: r.first_name, minutes: String(r.minutes) } });
  }

  async function block() {
    setBusy(true);
    setMsg(null);
    const r = await ask('block_pro', { p_job: job.id, p_reason: blockWhy });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setBlocking(false);
    toast.show(done('Pechkas will not send him your jobs again.', 'Blocked'));
    onChanged();
  }

  async function unblock() {
    setBusy(true);
    const r = await ask('unblock_pro', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done('He can be sent your jobs again.', 'Unblocked'));
    onChanged();
  }

  async function share() {
    try {
      await Share.share({ message: receiptText(job, trade, name, story) });
    } catch {
      setMsg('This phone could not open its share menu.');
    }
  }

  const help = () =>
    toOffice(job.id);

  const shots = (['before', 'after', 'receipt', 'video', 'fix'] as const).flatMap((stage) => photos.filter((p) => p.stage === stage));
  const SHOT: Record<string, string> = { before: 'Before', after: 'After', receipt: 'Shop receipt', video: 'Video', fix: 'Guarantee repair' };

  return (
    <>
      <YellowTop>
        <View style={s.hero}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={s.kicker}>
              {trade} · {job.ref.replace('-', '‑')}
            </Text>
            <Text style={[s.title, narrow && s.titleNarrow]} accessibilityRole="header">
              {job.title}
            </Text>
            <View style={s.endedRow}>
              {job.status === 'done' ? <Icon name="check" size={16} color={colour.greenDark} strokeWidth={2.8} /> : null}
              <Text style={s.ended}>
                <Text style={job.status === 'done' ? s.endedGood : s.endedPlain}>{endedAs(job)}</Text>
                {endedAt ? ` · ${fullDay(endedAt)}` : ''}
              </Text>
            </View>
          </View>
          <WorkArt art={job.trade} source={pictureOf(job.trade, job.title)} size={narrow ? 72 : 92} picture={narrow ? 86 : 108} />
        </View>
      </YellowTop>

      <View style={s.body}>
        {/* What she must answer comes first. */}
        {job.payment ? <PaymentCard p={job.payment} name={who} jobId={job.id} onChanged={onChanged} /> : null}
        {feeOpen ? (
          <FeeCard fee={fee!} name={who} jobId={job.id} onChanged={onChanged} />
        ) : null}
        {claimOpen ? <ClaimCard job={job} onChanged={onChanged} /> : null}
        {job.status === 'cancelled' && job.not_home && ['submitted', 'disputed', 'confirmed', 'rejected'].includes(job.not_home.status) ? (
          <NotHomeEnded job={job} onChanged={onChanged} />
        ) : null}

        {over ? (
          <View style={s.card}>
            {/* The money: one figure, large, and what it was made of. An open visit fee says it in its own card above. */}
            {feeOpen ? null : feeWords ? (
              <View style={{ gap: 2 }}>
                <Text style={s.label}>{feeWords.label}</Text>
                <Text style={s.amount}>{feeWords.figure}</Text>
                <Text style={s.sub}>{feeWords.why}</Text>
                {fee!.status === 'waived' && fee!.office_note ? <Text style={s.sub}>Pechkas: “{fee!.office_note}”</Text> : null}
                {declined ? (
                  <View style={[s.pill, { marginTop: 10 }]}>
                    <Text style={s.pillText}>
                      {name ?? 'He'} asked {rupees(declined.price_paisa)}: “{declined.reason}”
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
            <View style={{ gap: 2 }}>
              <Text style={s.label}>
                {job.paid_by_pechkas
                  ? 'You paid'
                  : payOpen
                    ? 'Price of the job'
                    : job.status === 'stopped'
                      ? job.stop_reason === 'office_no_fee' ? 'You pay' : `Visit fee for ${who}`
                      : left || !name ? 'You paid' : `You paid ${name}`}
              </Text>
              <Text style={s.amount}>{job.paid_by_pechkas ? 'Free' : rupees(job.collect_paisa)}</Text>
              {job.paid_by_pechkas ? (
                <Text style={s.sub}>Pechkas paid for this repair under the guarantee{story?.original ? ` of ${story.original.ref}` : ''}.</Text>
              ) : job.status === 'done' ? (
                <Text style={s.sub}>
                  {job.parts_paisa ? `Work ${rupees((job.collect_paisa ?? 0) - job.parts_paisa)} · parts ${rupees(job.parts_paisa)} · ` : ''}
                  {job.finished_at ? `${job.parts_paisa ? 'done' : 'Done'} at ${pkClock(job.finished_at)}` : ''}
                </Text>
              ) : job.status === 'stopped' && declined ? (
                <Text style={s.sub}>
                  {name ?? 'He'} asked {rupees(declined.price_paisa)}; {declined.by === 'office' ? 'Pechkas' : 'you'} said no, so the job stopped there.
                </Text>
              ) : null}
            </View>
            )}

            {approved ? (
              <View style={s.pill}>
                <Text style={s.pillText}>
                  Agreed {rupees(approved.from_paisa)} → {rupees(approved.price_paisa)}, with {approved.by === 'office' ? 'Pechkas’' : 'your'} OK
                </Text>
              </View>
            ) : null}
            {job.dispute_note && job.dispute_outcome ? (
              <View style={s.pill}>
                <Text style={s.pillText}>
                  <Text style={{ fontFamily: font.bodySemi }}>Pechkas decided: </Text>“{job.dispute_note}”
                </Text>
              </View>
            ) : null}
            {job.status === 'done' && job.confirmed_by === 'clock' ? <Text style={s.sub}>Nobody checked it within a day, so it counts as finished.</Text> : null}
            {job.paid_by_pechkas && story?.original ? (
              <Row icon="shield" title="Open the first job" sub={`${story.original.ref}${story.original.finished_at ? ` · ${fullDay(story.original.finished_at)}` : ''}`} onPress={() => router.push(`/job/${story.original!.id}`)} />
            ) : null}

            <Press onPress={share} accessibilityRole="button" sink={0.98} style={s.soft}>
              <DuoIcon name="share" size={22} />
              <Text style={s.softText}>Share receipt</Text>
            </Press>

            {/* The guarantee, and the one button the terms name. */}
            {guarantee ? (
              <View style={s.rule}>
                <View style={s.guarantee}>
                  <DuoIcon name="shield" size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.strong}>{covered ? `Guaranteed until ${fullDay(guarantee)}` : `Guarantee ended ${fullDay(guarantee)}`}</Text>
                    {covered ? <Text style={s.green}>{daysLeft(guarantee)} {daysLeft(guarantee) === 1 ? 'day' : 'days'} left</Text> : null}
                  </View>
                </View>
                {claim && !claimOpen ? <ClaimEnd job={job} story={story} who={who} /> : null}
                {job.claim_open && !claim ? <Text style={s.sub}>Your guarantee claim is with the Pechkas office. It decides, and this page shows what it decided.</Text> : null}
                {/* In the first day "Something is wrong" covers it; after that, the guarantee. The terms (/app/terms) quote this label; legal.test.ts checks. */}
                {covered && job.can_claim && !job.can_report ? (
                  <Button kind="outline" label="It has failed again" onPress={() => router.push({ pathname: '/claim/[id]', params: { id: job.id } })} />
                ) : null}
              </View>
            ) : null}
            {/* What she told the office, and its answer, read here: the office answers in writing, never by a call. */}
            <JobReports job={job.id} again={sent} />
            {job.can_report && !writing ? <Button kind="outline" label="Something is wrong" onPress={() => setWriting(true)} /> : null}
            {job.can_report && writing ? (
              <View style={{ gap: 8 }}>
                <Text style={s.sub}>Tell us what is wrong. The Pechkas office reads it and answers you here, in the app.</Text>
                <TextInput value={problem} onChangeText={setProblem} maxLength={500} multiline accessibilityLabel="What is wrong" style={s.input} />
                <Button kind="green" label="Send to Pechkas" busy={busy} onPress={report} />
                <Button kind="outline" label="Go back" onPress={() => setWriting(false)} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={s.card}>
            {/* A cancelled job: what happened, and that it cost nothing. */}
            <View style={{ gap: 4 }}>
              <Text style={s.label}>What happened</Text>
              <Text style={s.strongBig}>{cancelledHow(job, story)}</Text>
              {story?.cancel?.reason ? (
                <Text style={s.sub}>
                  {story.cancel.by === 'customer' ? 'You wrote' : 'Pechkas wrote'}: “{story.cancel.reason}”
                </Text>
              ) : job.cancelled_by === 'office' && job.cancel_reason ? (
                <Text style={s.sub}>“{job.cancel_reason}”</Text>
              ) : null}
              {cancelledNote(job) ? <Text style={s.sub}>{cancelledNote(job)}</Text> : null}
              {job.cancelled_by === 'nobody' && job.paid_by_pechkas ? (
                <Text style={s.sub}>Choose another day on your guarantee claim, on the first job.</Text>
              ) : (
                <Text style={s.green}>Nothing was charged.</Text>
              )}
            </View>
            <View style={s.rule}>
              <Fact label="Posted" value={dayAndTime(job.created_at)} />
              {story ? <Fact label="Offers" value={story.offers === 0 ? 'None' : String(story.offers)} /> : null}
              <Fact label="Your price" value={rupees(story?.first_paisa ?? job.offered_paisa)} />
              <Fact label="Address" value={`${job.house}, ${job.street}, ${job.sector}`} />
            </View>
            {story ? <Row icon="doc" title="See every step" sub="What happened, to the minute" onPress={() => setSteps(true)} /> : null}
            {job.paid_by_pechkas && story?.original ? (
              <Row icon="shield" title="Open the first job" sub={story.original.ref} onPress={() => router.push(`/job/${story.original!.id}`)} />
            ) : null}
          </View>
        )}

        {over ? (
          <View style={s.card}>
            {/* Who came. */}
            <View style={s.pro}>
              {left || !name ? (
                <View style={s.gone}>
                  <Text style={s.goneText}>?</Text>
                </View>
              ) : (
                <Face path={job.pro_photo} name={name} size={52} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{left || !name ? 'A technician who has left Pechkas' : name}</Text>
                <Text style={s.sub}>
                  {left || !job.pro ? 'The job, photos and receipt are still here' : `${job.pro.years} ${job.pro.years === 1 ? 'year' : 'years'} in the trade`}
                </Text>
              </View>
            </View>

            {/* Her stars: five big buttons while she still may, what she gave once she has. */}
            {job.can_rate && name ? (
              <View style={{ gap: 10 }}>
                <Text style={s.strong}>How was {name}?</Text>
                <View style={s.stars} accessibilityRole="radiogroup" accessibilityLabel={`Rate ${name}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Press
                      key={n}
                      onPress={() => setStars(n)}
                      sink={0.9}
                      accessibilityRole="radio"
                      accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
                      accessibilityState={{ selected: stars === n }}
                      style={[s.star, n <= stars && s.starOn]}
                    >
                      <Icon name="star" size={26} color={n <= stars ? colour.green : colour.ink} filled={n <= stars} strokeWidth={1.8} />
                    </Press>
                  ))}
                </View>
                {stars ? (
                  <>
                    <TextInput value={words} onChangeText={setWords} maxLength={300} placeholder="Anything to say? (optional)" placeholderTextColor={colour.steel} accessibilityLabel="Anything to say" style={[s.input, { minHeight: 52 }]} />
                    {/* offer_profile() shows these words to customers choosing him, never with her name. */}
                    <Text style={s.small}>Customers choosing {name} later may read what you write, without your name. He sees your stars once he has rated you too, or after two days.</Text>
                    <Button kind="green" label="Send rating" busy={busy} onPress={rate} />
                  </>
                ) : null}
              </View>
            ) : job.my_rating ? (
              <Text style={s.sub} accessibilityLabel={`You gave ${job.my_rating} of 5 stars`}>
                You gave <Text style={s.gave}>{'★'.repeat(job.my_rating)}</Text>
                {story?.my_words ? ` · “${story.my_words}”` : ''}
              </Text>
            ) : null}

            {story?.pro_note ? (
              <View style={s.note}>
                <Text style={s.noteText}>“{story.pro_note}”</Text>
                <Text style={s.small}>{name ? `${name}’s note for you` : 'The technician’s note for you'}</Text>
              </View>
            ) : null}

            <View style={s.rule}>
              {job.status === 'done' && story?.took_minutes !== null && story?.took_minutes !== undefined ? <Fact label="Took" value={took(story.took_minutes)} /> : null}
              <Fact label="Address" value={`${job.house}, ${job.street}, ${job.sector}`} />
            </View>
            {story ? <Row icon="doc" title="See every step" sub="When he came, and every step to the minute" onPress={() => setSteps(true)} /> : null}

            {shots.length ? (
              <View style={s.shots}>
                {shots.map((p) => (
                  <Press
                    key={p.path}
                    onPress={() => (urls[p.path] ? Linking.openURL(urls[p.path]) : undefined)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`${SHOT[p.stage]}, open full size`}
                    sink={0.97}
                    style={s.shot}
                  >
                    {p.stage === 'video' ? (
                      <View style={[StyleSheet.absoluteFill, s.video]}>
                        <Icon name="video" size={28} color={colour.paper} strokeWidth={2} />
                      </View>
                    ) : urls[p.path] ? (
                      <Image source={{ uri: urls[p.path] }} style={StyleSheet.absoluteFill} />
                    ) : null}
                    <View style={s.shotFoot}>
                      <Text style={s.shotText} numberOfLines={1}>
                        {SHOT[p.stage]}
                      </Text>
                    </View>
                  </Press>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* The two things she may want next, side by side. */}
        {canAskAgain || canBookAgain ? (
          <View style={[s.pair, narrow && canAskAgain && canBookAgain && s.pairStack]}>
            {canAskAgain ? (
              <Press onPress={askAgain} accessibilityRole="button" accessibilityHint="Post a new job that goes to him first if he is free" sink={0.97} style={[s.big, s.bigGreen]}>
                <Text style={[s.bigText, { color: colour.paper }]}>
                  Ask {job.pro!.first_name} again
                </Text>
              </Press>
            ) : null}
            {canBookAgain ? (
              <Press
                onPress={() => router.push({ pathname: '/post', params: { again: job.id, trade: job.trade } })}
                accessibilityRole="button"
                accessibilityHint="The same work at the same address, filled in for you. Change anything, then post."
                sink={0.97}
                style={[s.big, canAskAgain ? s.bigOutline : s.bigInk]}
              >
                <Text style={[s.bigText, { color: canAskAgain ? colour.ink : colour.paper }]}>Book again</Text>
              </Press>
            ) : null}
          </View>
        ) : null}

        <Notice text={msg} />

        {/* Help, safety and blocking: rows, out of the way of a stray tap. */}
        <View style={[s.card, s.links]}>
          <Row icon="support" title="Get help with this job" sub="Write to the office, with this job already chosen" onPress={help} />
          {job.can_report_safety && name ? (
            unsafe ? (
              <View style={s.inset}>
                <SafetyReport jobId={job.id} name={name} onChanged={onChanged} startOpen onCancel={() => setUnsafe(false)} />
              </View>
            ) : (
              <Row icon="shield" title="Report something unsafe" onPress={() => setUnsafe(true)} />
            )
          ) : job.safety_report ? (
            <Text style={[s.sub, s.inset]}>
              {job.safety_report.status === 'open'
                ? 'Your safety report is with Pechkas. His work of this kind is paused meanwhile.'
                : 'Pechkas has decided your safety report.'}
            </Text>
          ) : null}
          {canBlock && job.blocked ? (
            <View style={[s.inset, { gap: 8 }]}>
              <Text style={s.sub}>You blocked {job.block_name}. He does not see your jobs, and he was not told.</Text>
              <Button kind="outline" label="Undo" onPress={unblock} busy={busy} />
            </View>
          ) : canBlock && blocking ? (
            <View style={[s.inset, { gap: 8 }]}>
              <Text style={s.sub}>Block {job.block_name}? He will never see your jobs again. He is not told, and you can undo this here.</Text>
              <Field label="Tell Pechkas why (optional — only the office sees it)" value={blockWhy} onChangeText={setBlockWhy} maxLength={300} multiline />
              <Button kind="danger" label={`Yes, block ${job.block_name}`} onPress={block} busy={busy} />
              <Button kind="outline" label="No" onPress={() => setBlocking(false)} />
            </View>
          ) : canBlock ? (
            <Row icon="lock" title={`Never send me ${job.block_name}`} onPress={() => setBlocking(true)} quiet />
          ) : null}
        </View>
      </View>

      {steps && story ? <EverySteps job={job} story={story} onClose={() => setSteps(false)} /> : null}
    </>
  );
}

/** How a closed claim ended (A3): fixed, not covered with Pechkas' note, or put right by somebody else. */
function ClaimEnd({ job, story, who }: { job: Job; story: Story | null; who: string }) {
  const claim = job.claim!;
  const at = claim.closed_at ? ` · ${fullDay(claim.closed_at)}` : '';
  const rep = story?.replacement;
  return (
    <View style={s.claimEnd}>
      {claim.status === 'not_covered' ? (
        <>
          <Text style={s.strong}>Guarantee claim: not covered</Text>
          <Text style={s.sub}>
            Pechkas decided{at}
            {claim.office_note ? `: “${claim.office_note}”` : '.'}
          </Text>
        </>
      ) : rep ? (
        <>
          <Text style={s.strong}>Guarantee claim: put right</Text>
          <Text style={s.sub}>
            {story?.claim_why === 'no_answer' ? `${who} did not answer` : story?.claim_why === 'missed_visit' ? `${who} did not come back` : `${who} could not do it`}, so another technician was booked, free.
          </Text>
          <Row
            icon="doc"
            title={`${rep.ref}${rep.pro ? ` · ${rep.status === 'done' ? 'Fixed by' : 'With'} ${rep.pro}` : ''}`}
            sub={rep.finished_at ? `${fullDay(rep.finished_at)} · tap to open` : 'Tap to open'}
            onPress={() => router.push(`/job/${rep.id}`)}
          />
        </>
      ) : (
        <>
          <Text style={s.strong}>Guarantee claim: fixed</Text>
          <Text style={s.sub}>
            {who} came back and fixed it{at}
          </Text>
        </>
      )}
    </View>
  );
}

/** The whole record, to the minute, in a sheet. */
function EverySteps({ job, story, onClose }: { job: Job; story: Story; onClose: () => void }) {
  const his = job.pro?.first_name ?? 'The technician';
  const confirmed = story.steps.some((x) => x.what === 'confirmed');
  let cur = 'The technician';
  const rows = story.steps.flatMap((st) => {
    if (st.what === 'assigned') cur = st.name ?? 'The technician';
    if (st.what === 'done' && confirmed) return [];
    const w = stepWords(st, cur, his);
    return w ? [{ ...w, at: st.at }] : [];
  });
  const chatOpen = story.chat_until && new Date(story.chat_until) > new Date();
  return (
    <Sheet title="Every step" onClose={onClose}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {rows.map((r, i) => (
          <View key={`${r.at}-${i}`} style={s.step}>
            <View style={s.track}>
              <View style={s.dot} />
              {i < rows.length - 1 ? <View style={s.line} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 16 }}>
              <Text style={s.strong}>{r.title}</Text>
              <Text style={s.small}>
                {dayAndTime(r.at)}
                {r.sub ? ` · ${r.sub}` : ''}
              </Text>
            </View>
          </View>
        ))}
        <View style={[s.rule, { gap: 8 }]}>
          {job.description ? <Text style={s.sub}>What you wrote: “{job.description}”</Text> : null}
          {chatOpen && job.pro ? (
            <Row icon="chat" title={`Read your messages with ${job.pro.first_name}`} sub={`Until ${dayAndTime(story.chat_until!)}`} onPress={() => {
              onClose();
              router.push({ pathname: '/chat/[job]', params: { job: job.id } });
            }} />
          ) : story.chat_until && job.pro ? (
            <Text style={s.sub}>Messages with {job.pro.first_name} were kept until {dayAndTime(story.chat_until)}.</Text>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/** A row a finger can find: icon tile, words, chevron, at least 56 tall. */
function Row({ icon, title, sub, onPress, quiet = false }: { icon: DuoName; title: string; sub?: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title} sink={0.985} style={s.row}>
      <View style={s.tile}>
        <DuoIcon name={icon} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, quiet && { fontFamily: font.bodyMedium, color: colour.inkSoft }]}>{title}</Text>
        {sub ? <Text style={s.small}>{sub}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} />
    </Press>
  );
}

/** A label and its value on one line. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingTop: 8 },
  kicker: { fontFamily: font.bodySemi, fontSize: 13, color: colour.inkSoft },
  title: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 31, color: colour.ink },
  titleNarrow: { fontSize: 22, lineHeight: 27 },
  endedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ended: { flexShrink: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  endedGood: { color: colour.greenDark },
  endedPlain: { color: colour.ink },
  body: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  card: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  links: { gap: 0, paddingVertical: 6 },
  label: { fontFamily: font.bodyMedium, fontSize: 14, color: colour.inkSoft },
  amount: { fontFamily: font.displayBold, fontSize: 38, lineHeight: 46, color: colour.ink, fontVariant: ['tabular-nums'] },
  sub: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  strong: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 21, color: colour.ink },
  strongBig: { fontFamily: font.display, fontSize: 22, lineHeight: 28, color: colour.ink },
  green: { fontFamily: font.bodySemi, fontSize: 14, color: colour.greenDark },
  pill: { padding: 12, borderRadius: 14, backgroundColor: colour.softYellow },
  pillText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  soft: { minHeight: BIG, borderRadius: 16, backgroundColor: colour.canvas, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  softText: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  rule: { gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: colour.rule },
  guarantee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  claimEnd: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  pro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gone: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.tile, alignItems: 'center', justifyContent: 'center' },
  goneText: { fontFamily: font.display, fontSize: 22, color: colour.steel },
  stars: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  star: { flex: 1, maxWidth: 64, height: BIG, borderRadius: 16, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  starOn: { backgroundColor: colour.greenSoft },
  gave: { color: colour.greenDark, letterSpacing: 1 },
  note: { gap: 6, paddingLeft: 14, borderLeftWidth: 3, borderLeftColor: colour.yellow },
  noteText: { fontFamily: font.bodyMedium, fontSize: 15.5, lineHeight: 23, color: colour.ink },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  factLabel: { fontFamily: font.body, fontSize: 15, color: colour.steel },
  factValue: { flex: 1, textAlign: 'right', fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: BIG, paddingVertical: 6 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  inset: { paddingVertical: 10 },
  shots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shot: { flexGrow: 1, flexBasis: '30%', minWidth: 88, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: colour.tile },
  video: { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  shotFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(20,23,26,0.55)' },
  shotText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.paper },
  pair: { flexDirection: 'row', gap: 10 },
  pairStack: { flexDirection: 'column' },
  big: { flex: 1, minHeight: BIG, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bigGreen: { backgroundColor: colour.green },
  bigInk: { backgroundColor: colour.ink },
  bigOutline: { backgroundColor: colour.white, borderWidth: 1.5, borderColor: 'rgba(20,23,26,0.2)' },
  bigText: { fontFamily: font.display, fontSize: 17 },
  input: { minHeight: 80, borderRadius: 14, padding: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1.5, borderColor: colour.rule },
  step: { flexDirection: 'row', gap: 12 },
  track: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: colour.green },
  line: { flex: 1, width: 2, marginTop: 2, backgroundColor: colour.greenSoft },
});
