import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { rupees, showMobile } from '@pechkas/shared';
import { Button, Notice } from '../components/ui';
import { Press } from '../components/Press';
import { DuoIcon } from '../components/DuoIcon';
import { Action, Panel, SHADOW, SOFT_YELLOW, Steps } from './bits';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { useSignedUrls } from '../post/RemoteMedia';
import { ask } from '../supabase';
import { colour, font, radius } from '../theme';
import { CheckCard, DecisionCard, DisputeCard, GuaranteeRepairNote, LastRound, type CheckFields } from './Checking';
import type { CustomerFee } from './VisitFee';
import { Face } from './Face';
import { DoorCard } from './FirstJobs';
import type { PaymentView } from '../pro/Unpaid';

/**
 * The customer's side of a job once a technician is chosen: where he is, the
 * start code, a new price to approve or decline, and the end — what to pay,
 * the photos, and "something is wrong".
 *
 * Nothing here decides anything. The code is checked, the price changed and
 * the visit fee worked out by the database; this screen shows what it says.
 */

export type Stage = 'chosen' | 'on_way' | 'arrived' | 'working' | 'checking' | 'disputed';
export type Photo = { stage: 'before' | 'after' | 'change' | 'receipt' | 'video' | 'fix'; path: string };
export type JobNow = {
  id: string;
  ref: string;
  title: string;
  house: string;
  street: string;
  sector: string;
  status: 'open' | 'assigned' | 'done' | 'stopped' | 'cancelled';
  stage: Stage | null;
  agreed_paisa: number | null;
  start_code: string | null;
  code_locked: boolean;
  pro: { first_name: string; phone?: string | null; years: number } | null;
  change: {
    id: string;
    from_paisa: number;
    price_paisa: number;
    reason: string;
    photo: string;
    pro_says_no_at?: string | null;
    office_decides?: boolean;
    /** A104: parts he says are in the new price, and whether it is more than Pechkas allows a new technician. */
    parts_paisa?: number | null;
    over_first_limit?: boolean;
  } | null;
  visit_fee_paisa: number | null;
  /** After a job stopped: the visit fee's record (visit_fee). */
  visit_fee?: CustomerFee | null;
  stop_reason?: CustomerFee['reason'] | null;
  collect_paisa: number | null;
  photos: Photo[];
  can_report: boolean;
  problem_at: string | null;
  parts_paisa?: number | null;
  my_rating?: number | null;
  can_rate?: boolean;
  guarantee_until?: string | null;
  guarantee_days?: number | null;
  can_claim?: boolean;
  claim_open?: boolean;
  /** D35: he says she has not paid him in full. */
  payment?: PaymentView | null;
  /** Only when the location check verified his arrival near her pin (arrival_by_location). */
  arrival_verified?: boolean;
  /** D37: his photo, her answer at the door, his first jobs, a checker coming, a safety report. */
  pro_photo?: string | null;
  face_needed?: boolean;
  face_confirmed?: boolean;
  new_on_pechkas?: boolean;
  check?: { status: string; kind: 'app' | 'outside'; checker: string | null } | null;
  safety_report?: { status: 'open' | 'upheld' | 'not_upheld' | 'false'; at: string } | null;
  can_report_safety?: boolean;
} & Omit<CheckFields, 'id' | 'ref' | 'stage' | 'status' | 'collect_paisa' | 'photos' | 'pro'>;

/** Where he has got to, as the heading of the "your technician" card. */
const HEAD: Record<Stage, (name: string) => string> = {
  chosen: (n) => `${n} is your technician`,
  on_way: (n) => `${n} is on his way`,
  arrived: (n) => `${n} has arrived`,
  working: (n) => `${n} is working on it`,
  checking: (n) => `${n} has finished`,
  disputed: (n) => `Pechkas is looking at ${n}’s work`,
};

export function UnderWay({ job, onChanged }: { job: JobNow; onChanged: () => void }) {
  const pro = job.pro!;
  const urls = useSignedUrls(job.change ? [{ kind: 'photo', path: job.change.photo, seconds: null }] : []);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reported, setReported] = useState(false);

  async function sendReport() {
    setBusy(true);
    setMsg(null);
    const r = await ask('report', { p_job: job.id, p_kind: 'problem', p_text: reportText });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setReported(true);
    setReporting(false);
    setReportText('');
  }
  const family = encodeURIComponent(
    `Pechkas is sending ${pro.first_name} for job ${job.ref} (${job.title}) at ${job.house}, ${job.street}, ${job.sector}.${pro.phone ? ` His number: ${showMobile(pro.phone)}.` : ''}`,
  );

  async function decide(approve: boolean) {
    if (!job.change) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('decide_change', { p_change: job.change.id, p_approve: approve });
    setBusy(false);
    setDeclining(false);
    if (!r.ok) setMsg(r.why);
    onChanged();
  }

  const narrow = useWindowDimensions().width < 360;
  const early = job.stage === 'chosen' || job.stage === 'on_way';

  return (
    <>
      {/* Who is coming and where he has got to, with every way to reach him in one row. */}
      <View style={s.panel}>
        <View style={s.top}>
          <Face path={job.pro_photo} name={pro.first_name} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name}>{HEAD[job.stage ?? 'chosen'](pro.first_name)}</Text>
            <View style={s.checked}>
              <DuoIcon name="shield" size={16} />
              <Text style={s.meta}>
                {job.new_on_pechkas ? 'One of his first jobs on Pechkas · ' : ''}
                {pro.years} {pro.years === 1 ? 'year' : 'years'} in the trade
              </Text>
            </View>
          </View>
        </View>
        {job.check ? (
          <Text style={s.line}>
            {job.check.status === 'asked'
              ? 'Pechkas is arranging another technician to come too and check the work, at no cost to you.'
              : job.check.status === 'accepted'
                ? `${job.check.checker ?? 'A checker arranged by Pechkas'} comes too, to check ${pro.first_name}'s work. No cost to you.`
                : 'Another technician checked the work.'}
          </Text>
        ) : null}
        <Steps stage={job.stage === 'checking' || job.stage === 'disputed' ? 'working' : job.stage} narrow={narrow} />
        {job.stage === 'chosen' || !job.stage ? <Text style={s.line}>Your phone tells you when he sets off.</Text> : null}
        {/* Said only when the database verified it; never where he is. */}
        {job.arrival_verified && (job.stage === 'arrived' || job.stage === 'working') ? (
          <View style={s.verified}>
            <DuoIcon name="shield" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.verifiedTitle}>Technician arrival verified</Text>
              <Text style={s.meta}>{pro.first_name}'s arrival was verified near your registered service address. No exact technician coordinates are shared.</Text>
            </View>
          </View>
        ) : null}
        <View style={s.actions}>
          {pro.phone ? <Action icon="phone" label="Call" full={`Call ${pro.first_name}`} onPress={() => Linking.openURL(`tel:+${pro.phone!.replace(/^\+/, '')}`)} /> : null}
          <Action icon="chat" label="Chat" full={`Message ${pro.first_name}`} onPress={() => router.push({ pathname: '/chat/[job]', params: { job: job.id } })} />
          {early ? <Action icon="share" label="Family" full="Send his name to family on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${family}`)} /> : null}
          <Action icon="flag" label="Report" full="Report a problem" on={reporting} onPress={() => setReporting(!reporting)} />
        </View>
        {reporting ? (
          <View style={{ gap: 8 }}>
            <Text style={s.line}>Tell us what is wrong. The Pechkas office reads it and calls you.</Text>
            <TextInput value={reportText} onChangeText={setReportText} maxLength={500} multiline accessibilityLabel="What is wrong" style={s.input} />
            <Button kind="green" label="Send to Pechkas" busy={busy} onPress={sendReport} />
          </View>
        ) : null}
        {reported ? <Text style={s.line}>The Pechkas office has been told. They will call you.</Text> : null}
        <Button kind="danger" label="Emergency" onPress={() => router.push({ pathname: '/emergency/[job]', params: { job: job.id } })} />
      </View>

      {job.face_needed && job.stage === 'arrived' ? (
        <DoorCard jobId={job.id} name={pro.first_name} photo={job.pro_photo ?? null} onChanged={onChanged} />
      ) : null}

      {job.start_code && !job.code_locked && !(job.face_needed && job.stage === 'arrived') ? (
        <View style={s.codeBox}>
          <View style={s.codeHead}>
            <DuoIcon name="lock" size={22} ink={colour.paper} />
            <Text style={s.codeLabel}>Your start code</Text>
          </View>
          <Text style={s.code} accessibilityLabel={`Start code ${job.start_code.split('').join(' ')}`}>
            {job.start_code.split('').join(' ')}
          </Text>
          <Text style={s.codeText}>
            Give it to {pro.first_name} at the door, once you have seen him{job.pro_photo ? ' and checked his photo' : ''}. It proves he is the person Pechkas sent. Never read it out on the phone.
          </Text>
        </View>
      ) : null}

      {job.code_locked ? (
        <View style={s.warnBox}>
          <Text style={s.warnText}>Too many wrong codes were tried at your door. Do not let anyone in yet. Pechkas will call you.</Text>
          <Button kind="green" label={narrow ? `Call ${OFFICE_PHONE_SHOWN}` : `Call Pechkas · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </View>
      ) : null}

      {job.change ? (
        <Panel
          tone="money"
          icon="wallet"
          title={`${pro.first_name} asks for ${rupees(job.change.price_paisa)}`}
          hint={
            job.change.office_decides
              ? `Instead of the ${rupees(job.change.from_paisa)} agreed. Pechkas pays for this repair, so the Pechkas office answers this. You pay nothing.`
              : `Instead of the ${rupees(job.change.from_paisa)} agreed. Nothing changes unless you approve.`
          }
        >
          <Text style={s.quote}>“{job.change.reason}”</Text>
          {job.change.parts_paisa ? <Text style={s.line}>Includes {rupees(job.change.parts_paisa)} of parts, with a shop receipt.</Text> : null}
          {/* A104: the owner's words. She decides, knowing; the job then does not count as one of his first jobs. */}
          {job.change.over_first_limit && !job.change.office_decides ? (
            <Text style={s.line}>This is more than Pechkas allows new technicians. You can agree, or decline and pay only the visit fee.</Text>
          ) : null}
          {urls[job.change.photo] ? (
            <Press onPress={() => Linking.openURL(urls[job.change!.photo])} accessibilityRole="imagebutton" accessibilityLabel="The photo he sent">
              <Image source={{ uri: urls[job.change.photo] }} style={s.changePhoto} />
            </Press>
          ) : null}
          {job.change.office_decides ? null : (
            <>
              {job.change.pro_says_no_at ? (
                <Text style={s.line}>{pro.first_name} says you told him no at the door. Please answer here, so the job can close.</Text>
              ) : null}
              {!declining ? (
                <View style={{ gap: 8 }}>
                  <Button kind="green" label={`Approve ${rupees(job.change.price_paisa)}`} busy={busy} onPress={() => decide(true)} />
                  <Button kind="outline" label="Decline" onPress={() => setDeclining(true)} />
                  <Text style={s.line}>No visit fee if you approve: you pay only the new price.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={s.line}>
                    If you decline, the job stops here and you pay {pro.first_name} only the visit fee of {rupees(job.visit_fee_paisa)}, before he leaves.
                  </Text>
                  <Button kind="danger" label={`Decline and pay ${rupees(job.visit_fee_paisa)}`} busy={busy} onPress={() => decide(false)} />
                  <Button kind="outline" label="Go back" onPress={() => setDeclining(false)} />
                </View>
              )}
            </>
          )}
        </Panel>
      ) : null}

      {/* He says finished: she checks before she pays (checks_and_guarantee). */}
      <GuaranteeRepairNote job={job} />
      {job.stage === 'checking' ? <CheckCard job={job} onChanged={onChanged} /> : null}
      {job.stage === 'disputed' ? <DisputeCard job={job} /> : null}
      <LastRound job={job} />
      {job.stage === 'working' && job.dispute_outcome === 'return' ? <DecisionCard job={job} /> : null}

      <Notice text={msg} />
    </>
  );
}

const s = StyleSheet.create({
  verified: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 16, backgroundColor: colour.greenSoft },
  verifiedTitle: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.green },
  panel: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 22, color: colour.yellow },
  name: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  checked: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flex: 1, fontFamily: font.body, fontSize: 13, color: colour.steel },
  actions: { flexDirection: 'row', gap: 8 },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  quote: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 21, color: colour.ink },
  row: { flexDirection: 'row', gap: 8 },
  codeBox: { gap: 6, padding: 18, borderRadius: 24, backgroundColor: colour.ink, alignItems: 'center' },
  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeLabel: { fontFamily: font.bodySemi, fontSize: 14, color: '#d5dbe0' },
  code: { fontFamily: font.mono, fontSize: 42, letterSpacing: 6, color: colour.yellow },
  codeText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.paper, textAlign: 'center' },
  warnBox: { gap: 10, padding: 16, borderRadius: 24, backgroundColor: '#f6e3dc' },
  warnText: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 21, color: colour.brick },
  changePhoto: { width: '100%', height: 170, borderRadius: 16 },
  pay: { gap: 4, alignItems: 'center', paddingVertical: 22, backgroundColor: SOFT_YELLOW },
  payLabel: { fontFamily: font.bodySemi, fontSize: 15, color: colour.inkSoft },
  payAmount: { fontFamily: font.display, fontSize: 40, lineHeight: 48, color: colour.ink },
  split: { alignSelf: 'stretch', gap: 6, marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: colour.white },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  splitFigure: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 84, height: 84, borderRadius: 14 },
  videoTile: { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  videoText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.paper },
  input: { minHeight: 80, borderRadius: 14, padding: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1.5, borderColor: colour.rule },
});
