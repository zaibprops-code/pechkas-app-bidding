import { useToast } from '../components/Toast';
import { done } from '../message';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { rupees } from '@pechkas/shared';
import { ScrewSpinner } from '../components/ScrewSpinner';
import { Button, Field, Notice } from '../components/ui';
import { DuoIcon, type DuoName } from '../components/DuoIcon';
import { SHADOW, TradeTile } from './bits';
import { Stars } from '../components/Stars';
import { Press } from '../components/Press';
import { Ended, UnderWay, type JobNow } from './UnderWay';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../office';
import { ask, supabase } from '../supabase';
import { colour, font, radius } from '../theme';

/**
 * One of the customer's jobs, whole: what was asked for, its offers and
 * choosing one, the visit, the end. Drawn on the job's own screen
 * (app/job/[id].tsx); My jobs lists jobs as short cards that open it.
 */

export type Job = JobNow & {
  id: string;
  ref: string;
  trade: string;
  title: string;
  offered_paisa: number;
  when_kind: 'now' | 'today' | 'tomorrow';
  when_part: string | null;
  sector: string;
  street: string;
  house: string;
  live_offers: number;
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  media: { kind: 'voice' | 'video' | 'photo' }[];
  /** Asked for by name: his alone until `until`, then everyone's. */
  preferred?: { first_name: string; until: string } | null;
  /** Whom it was held for at all, even after it opened to everyone. */
  asked_for?: string | null;
  can_ask_again?: boolean;
  /** She blocked this job's technician: he never sees her jobs again, and is not told. */
  blocked?: boolean;
  can_block?: boolean;
  /** His first name, for the block button only. */
  block_name?: string | null;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });

const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;

export type Offer = {
  id: string;
  pro_first_name: string;
  years: number;
  price_paisa: number;
  is_counter: boolean;
  eta_minutes: number | null;
  note: string | null;
  expires_at: string;
  /** NULL until he has enough ratings: then the screen says "New", never a made-up number. */
  rating?: number | null;
  jobs_done?: number;
};


export function JobCard({ job, trade, tick, onChanged, onOpen }: { job: Job; trade: string; tick: number; onChanged: () => void; onOpen?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockWhy, setBlockWhy] = useState('');
  const open = job.status === 'open';
  const assigned = job.status === 'assigned';
  const ended = job.status === 'done' || job.status === 'stopped';
  const active = open || assigned;
  // Once he is at the gate, a "no" is Decline (and the visit fee) or a call
  // to the office. The database refuses the cancel anyway; this hides it.
  const canCancel = open || (assigned && (job.stage === 'chosen' || job.stage === 'on_way'));
  const files = (['voice', 'video', 'photo'] as const)
    .map((k) => {
      const n = job.media.filter((m) => m.kind === k).length;
      if (!n) return null;
      return k === 'voice' ? 'voice note' : k === 'video' ? 'video' : n === 1 ? '1 photo' : `${n} photos`;
    })
    .filter(Boolean)
    .join(' · ');

  const toast = useToast();

  async function everyone() {
    setBusy(true);
    const r = await ask('release_now', { p_job: job.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    toast.show(done('Your job has gone to every checked technician who works there.'));
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

  async function cancel() {
    setBusy(true);
    const r = await ask('cancel_job', { p_job: job.id, p_reason: null });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setConfirming(false);
    toast.show(done('Your job is cancelled.'));
    onChanged();
  }

  const narrow = useWindowDimensions().width < 360;
  const canAskAgain = Boolean(job.can_ask_again && job.pro);
  const canBlock = Boolean(job.can_block && job.block_name);
  const officeOnly = assigned && !canCancel;
  const status =
    job.status === 'done'
      ? 'Done'
      : job.status === 'stopped'
        ? 'Stopped at the door'
        : assigned
          ? 'Technician chosen'
          : open
            ? job.live_offers > 0
              ? `${job.live_offers} ${job.live_offers === 1 ? 'offer' : 'offers'} to choose from`
              : 'Waiting for offers'
            : job.cancelled_by === 'office'
              ? 'Cancelled by Pechkas'
              : 'Cancelled';
  // What the figure beside the title is, so nobody reads her own offer as the bill.
  const priceLabel = open || job.status === 'cancelled' ? 'Your price' : assigned ? 'Agreed' : job.status === 'stopped' ? 'Visit fee' : 'Total';

  const offersFirst = open && job.live_offers > 0;
  const shown = rupees(job.collect_paisa ?? job.agreed_paisa ?? job.offered_paisa);

  return (
    <>
      {/* With offers waiting, they come first: choosing is what she is here to do. */}
      {offersFirst ? <Offers job={job} tick={tick} onChosen={onChanged} /> : null}
      {offersFirst ? (
        <Text style={s.sectionTitle} accessibilityRole="header">
          Your job
        </Text>
      ) : null}
      {/* The job itself: what, where, when — the part that never changes. */}
      <Press
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'button' : undefined}
        sink={onOpen ? 0.98 : 1}
        style={[s.panel, !active && !ended && s.panelClosed]}
      >
        <View style={s.top}>
          <TradeTile trade={job.trade} size={narrow ? 52 : 60} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.kicker} numberOfLines={2}>
              {trade} · {job.ref.replace('-', '\u2011')}
            </Text>
            <Text style={s.jobTitle}>{job.title}</Text>
            {/* On a narrow phone the price goes under the title, so the title keeps the width. */}
            {narrow ? (
              <Text style={s.priceInline}>
                <Text style={[s.priceInlineFigure, job.status === 'cancelled' && s.priceOff]}>{shown}</Text> · {priceLabel}
              </Text>
            ) : null}
          </View>
          {narrow ? null : (
            <View style={{ alignItems: 'flex-end' }}>
              {/* What she will actually pay once there is a figure for it; her offer until then. */}
              <Text style={[s.price, job.status === 'cancelled' && s.priceOff]}>{shown}</Text>
              <Text style={s.priceLabel}>{priceLabel}</Text>
            </View>
          )}
        </View>
        <View style={s.facts}>
          <Fact icon="clock" text={`${WHEN[job.when_kind]}${job.when_part ? `, ${job.when_part}` : ''}`} />
          <Fact icon="pin" text={`${job.house}, ${job.street}, ${job.sector}`} />
          {files ? <Fact icon="camera" text={files} /> : null}
        </View>
        <View style={[s.badge, active || job.status === 'done' ? s.badgeOn : null]}>
          {open && !(job.live_offers > 0) ? <ScrewSpinner size={16} colour={colour.steel} label="Waiting for offers" /> : null}
          <Text style={[s.badgeText, active || job.status === 'done' ? s.badgeTextOn : null]}>{status}</Text>
        </View>
        {!active && job.cancelled_by === 'office' && job.cancel_reason ? <Text style={s.line}>{job.cancel_reason}</Text> : null}
      </Press>

      {open && job.preferred ? (
        <View style={s.held}>
          <View style={s.heldHead}>
            <DuoIcon name="star" size={24} />
            <Text style={[s.line, { flex: 1 }]}>
              You asked for {job.preferred.first_name}. Only he can see this job until {clock(job.preferred.until)}; then every checked technician can.
            </Text>
          </View>
          <Button kind="outline" label="Ask everyone now" onPress={everyone} busy={busy} />
        </View>
      ) : null}

      {assigned && job.pro ? <UnderWay job={job} onChanged={onChanged} /> : null}
      {ended ? <Ended job={job} onChanged={onChanged} /> : null}

      {/* Everything else she can do with this job, together at the foot, where nobody taps it by mistake. */}
      {canAskAgain || canBlock || canCancel || officeOnly ? (
        <View style={s.panel}>
          {canAskAgain ? (
            <View style={{ gap: 6 }}>
              <Button kind="green" icon="arrowRight" label={`Ask ${job.pro!.first_name} again`} onPress={askAgain} busy={busy} />
              <Text style={s.small}>You post a new job, and it goes to him first if he is free.</Text>
            </View>
          ) : null}
          {canBlock && job.blocked ? (
            <View style={s.held}>
              <Text style={s.line}>You blocked {job.block_name}. He does not see your jobs, and he was not told.</Text>
              <Button kind="outline" label="Undo" onPress={unblock} busy={busy} />
            </View>
          ) : null}
          {canBlock && !job.blocked && !blocking ? (
            <Press onPress={() => setBlocking(true)} accessibilityRole="button" style={s.link}>
              <Text style={s.linkText}>Never send me {job.block_name} again</Text>
            </Press>
          ) : null}
          {canBlock && !job.blocked && blocking ? (
            <View style={{ gap: 8 }}>
              <Text style={s.line}>
                Block {job.block_name}? He will never see your jobs again. He is not told, and you can undo this here.
              </Text>
              <Field
                label="Tell Pechkas why (optional — only the office sees it)"
                value={blockWhy}
                onChangeText={setBlockWhy}
                maxLength={300}
                multiline
              />
              <Button kind="danger" label={`Yes, block ${job.block_name}`} onPress={block} busy={busy} />
              <Button kind="outline" label="No" onPress={() => setBlocking(false)} />
            </View>
          ) : null}
          {canCancel && !confirming ? <Button kind="outline" label="Cancel this job" onPress={() => setConfirming(true)} /> : null}
          {officeOnly ? (
            <View style={{ gap: 6 }}>
              <Text style={s.small}>He is already at your house. To cancel now, call the Pechkas office.</Text>
              <Button kind="outline" label={narrow ? `Call ${OFFICE_PHONE_SHOWN}` : `Call Pechkas · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
            </View>
          ) : null}
          {canCancel && confirming ? (
            <View style={{ gap: 8 }}>
              <Text style={s.line}>
                Cancel {job.ref}? {assigned && job.pro ? `Please also call ${job.pro.first_name} to tell him.` : 'Nobody will come for it.'}
              </Text>
              <Button kind="danger" label="Yes, cancel it" onPress={cancel} busy={busy} />
              <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
            </View>
          ) : null}
        </View>
      ) : null}
      <Notice text={msg} />
    </>
  );
}

/** One line of the job's details, with its two-tone icon. */
function Fact({ icon, text }: { icon: DuoName; text: string }) {
  return (
    <View style={s.fact}>
      <DuoIcon name={icon} size={20} />
      <Text style={s.factText}>{text}</Text>
    </View>
  );
}

/** The live offers on one open job, and choosing one. */
export function Offers({ job, tick, onChosen }: { job: Job; tick: number; onChosen: () => void }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  // The offer being turned down, while she confirms it.
  const [declining, setDeclining] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase?.rpc('job_offers', { p_job: job.id }).then(({ data }) => setOffers((data as Offer[]) ?? []));
  }, [job.id, job.live_offers, tick]);

  /**
   * "No thanks" to one offer. The database checks it is her job, still open,
   * and the offer still live; he is told it was not taken and cannot offer
   * on this job again. It leaves the list at once rather than at the next
   * refresh, so a second tap has nothing to land on.
   */
  const toast = useToast();
  const narrow = useWindowDimensions().width < 360;

  async function decline(id: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask('decline_offer', { p_offer: id });
    setBusy(false);
    setDeclining(null);
    if (!r.ok) return setMsg(r.why);
    setOffers((list) => (list ?? []).filter((x) => x.id !== id));
    toast.show(done('That offer is gone from your list.', 'Offer declined'));
    onChosen();
  }

  async function choose(id: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask('choose_offer', { p_offer: id });
    setBusy(false);
    setPicking(null);
    if (!r.ok) return setMsg(r.why);
    onChosen();
  }

  if (!offers?.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={s.sectionHead}>
        <Text style={s.h2} accessibilityRole="header">
          Offers
        </Text>
        <View style={s.count}>
          <Text style={s.countText}>{offers.length}</Text>
        </View>
      </View>
      {offers.map((o) => {
        const left = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - Date.now()) / 60000));
        return (
          <View key={o.id} style={s.panel}>
            <View style={s.offerTop}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{o.pro_first_name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.offerName}>{o.pro_first_name}</Text>
                  <DuoIcon name="shield" size={18} />
                </View>
                <View style={s.rating}>
                  {o.rating !== null && o.rating !== undefined ? (
                    <>
                      <Stars value={Math.round(Number(o.rating))} size={14} />
                      <Text style={s.ratingText}>{Number(o.rating).toFixed(1)}</Text>
                    </>
                  ) : (
                    <Text style={s.newPro}>New</Text>
                  )}
                  {o.jobs_done !== undefined ? <Text style={s.offerMeta}>{o.jobs_done} {o.jobs_done === 1 ? 'job' : 'jobs'} done</Text> : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.offerPrice}>{rupees(o.price_paisa)}</Text>
                <Text style={[s.offerTag, { color: o.is_counter ? colour.brick : colour.green }]}>{o.is_counter ? 'His price' : 'Took your price'}</Text>
              </View>
            </View>
            <View style={s.offerFacts}>
              <Fact icon="shield" text={`Checked by Pechkas · ${o.years} ${o.years === 1 ? 'year' : 'years'} in the trade`} />
              <Fact icon="clock" text={o.eta_minutes ? `Can be there in ${o.eta_minutes} minutes` : 'Can come at the time you asked'} />
              {o.note ? <Text style={s.quote}>“{o.note}”</Text> : null}
            </View>
            <Text style={s.small}>This offer stays open {left} more {left === 1 ? 'minute' : 'minutes'}.</Text>
            {picking === o.id ? (
              <View style={{ gap: 8 }}>
                <Text style={s.line}>
                  Choose {o.pro_first_name} for {rupees(o.price_paisa)}? He will get your address and number, and you will get his.
                </Text>
                <Button kind="green" label={`Yes, choose ${o.pro_first_name}`} onPress={() => choose(o.id)} busy={busy} />
                <Button kind="outline" label="Not yet" onPress={() => setPicking(null)} />
              </View>
            ) : (
              <>
                <Button icon="arrowRight" label={narrow ? `Choose ${o.pro_first_name}` : `Choose ${o.pro_first_name} · ${rupees(o.price_paisa)}`} onPress={() => setPicking(o.id)} />
                {declining === o.id ? (
                  <View style={{ gap: 8 }}>
                    <Text style={s.line}>
                      Turn down {o.pro_first_name}'s offer? He is told it was not taken, and he cannot offer on this job again. Other
                      technicians can still send offers.
                    </Text>
                    <Button kind="danger" label="Yes, turn it down" onPress={() => decline(o.id)} busy={busy} />
                    <Button kind="outline" label="Keep it" onPress={() => setDeclining(null)} />
                  </View>
                ) : (
                  <Press onPress={() => setDeclining(o.id)} accessibilityRole="button" accessibilityLabel={`No thanks to ${o.pro_first_name}`} style={s.noThanks}>
                    <Text style={s.noThanksText}>No thanks</Text>
                  </Press>
                )}
              </>
            )}
          </View>
        );
      })}
      <Notice text={msg} />
    </View>
  );
}

/** Once chosen: who is coming, what was agreed, and how to reach him. */

const s = StyleSheet.create({
  panel: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  panelClosed: { backgroundColor: colour.paper },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel },
  jobTitle: { fontFamily: font.displayBold, fontSize: 17, lineHeight: 22, color: colour.ink },
  price: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  priceInline: { fontFamily: font.bodyMedium, fontSize: 13, color: colour.steel, marginTop: 2 },
  priceInlineFigure: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  priceOff: { color: colour.steel },
  priceLabel: { fontFamily: font.bodyMedium, fontSize: 12, color: colour.steel },
  facts: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: colour.canvas },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  factText: { flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colour.paper2 },
  badgeOn: { backgroundColor: colour.greenSoft },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  badgeTextOn: { color: colour.greenDark },
  held: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: colour.greenSoft },
  heldHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginTop: 4 },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink },
  sectionTitle: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4 },
  count: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: font.display, fontSize: 13, color: colour.ink },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 20, color: colour.yellow },
  offerName: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  offerMeta: { fontFamily: font.body, fontSize: 12.5, color: colour.steel },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ratingText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  newPro: { fontFamily: font.bodySemi, fontSize: 12, color: colour.greenDark, backgroundColor: colour.greenSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  offerPrice: { fontFamily: font.display, fontSize: 21, color: colour.ink },
  offerTag: { fontFamily: font.bodySemi, fontSize: 12 },
  offerFacts: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: colour.canvas },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink, paddingLeft: 30 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, textDecorationLine: 'underline' },
  noThanks: { alignSelf: 'center', minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  noThanksText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.inkSoft, textDecorationLine: 'underline' },
});
