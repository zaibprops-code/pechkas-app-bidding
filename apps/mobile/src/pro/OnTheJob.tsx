import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { commission, rupees, showMobile, technicianKeeps } from '@pechkas/shared';
import { Button } from '../components/ui';
import { Press } from '../components/Press';
import { Stars } from '../components/Stars';
import { OFFICE_PHONE } from '../office';
import { RemoteMedia, useSignedUrls, type StoredMedia } from '../post/RemoteMedia';
import { takePhoto, upload } from '../post/media';
import { ask } from '../supabase';
import { fill, proError, type ProWords } from '../words';
import { colour, font, radius } from '../theme';

/**
 * A job the technician has been chosen for, and the one button for the step
 * it is at: On my way → Arrived → (code and a photo) Start → (a photo) Done.
 *
 * The database decides every step. The button sends the step the screen was
 * showing, so a tap repeated on bad signal cannot move the job twice; a new
 * price is only a request until the customer approves it on her phone.
 */

export type Stage = 'chosen' | 'on_way' | 'arrived' | 'working';
export type Change = { id: string; from_paisa: number; price_paisa: number; reason: string; photo: string };
export type ActiveJob = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  when_kind: 'now' | 'today' | 'tomorrow';
  when_part: 'morning' | 'afternoon' | 'evening' | null;
  sector: string;
  street: string;
  house: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  gate_note: string | null;
  customer_first_name: string;
  customer_phone: string | null;
  agreed_paisa: number;
  keeps_paisa: number;
  media: StoredMedia[];
  stage: Stage;
  code_locked: boolean;
  code_tries_left: number;
  change: Change | null;
  visit_fee_paisa: number;
  photos: { stage: 'before' | 'after' | 'change'; path: string }[];
};
export type FinishedJob = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  status: 'done' | 'stopped';
  collect_paisa: number;
  customer_first_name: string;
  parts_paisa?: number | null;
  my_rating?: number | null;
  can_rate?: boolean;
};

type Props = { j: ActiveJob; w: ProWords; trade: string; when: string; userId: string; commissionBps: number | null; onChanged: () => void };

export function Chosen({ j, w, trade, when, userId, commissionBps, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Which box the refusal is about, so it shows beside that box and not
  // at the bottom of a long card he has to scroll.
  const [msgField, setMsgField] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  // What of the price was parts. The receipt photo is asked for only once
  // there is a figure; commission is shown on what is left.
  const [parts, setParts] = useState('');
  const [receipt, setReceipt] = useState<string[]>([]);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reported, setReported] = useState(false);
  const partsPaisa = Number(parts || '0') * 100;
  const labour = Math.max(j.agreed_paisa - partsPaisa, 0);
  const [changing, setChanging] = useState(false);

  const map =
    j.lat !== null && j.lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${j.house} ${j.street} ${j.sector} Islamabad`)}`;

  async function run(fn: string, args: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setMsg(null);
    setMsgField(null);
    const r = await ask(fn, args);
    setBusy(false);
    if (!r.ok) {
      setMsg(proError(w, r.field, r.why));
      setMsgField(r.field ?? null);
      if (r.field === 'stage' || r.field === 'code') onChanged();
      return;
    }
    after?.();
    onChanged();
  }

  const reset = () => {
    setPhotos([]);
    setCode('');
    setParts('');
    setReceipt([]);
  };

  async function sendReport() {
    setBusy(true);
    setMsg(null);
    setMsgField(null);
    const r = await ask('report', { p_job: j.id, p_kind: 'problem', p_text: reportText });
    setBusy(false);
    if (!r.ok) {
      setMsg(proError(w, r.field, r.why));
      setMsgField('report');
      return;
    }
    setReported(true);
    setReporting(false);
    setReportText('');
  }

  return (
    <View style={[s.card, s.chosen]}>
      <View style={s.cardTop}>
        <View style={s.badge}>
          <Text style={s.badgeText}>
            {trade} · {j.ref}
          </Text>
        </View>
        <Text style={s.when}>{j.stage === 'working' ? w.working : when}</Text>
      </View>
      <Text style={s.title}>{j.title}</Text>
      <Text style={s.addr}>
        {j.house}, {j.street}, {j.sector}
      </Text>
      {j.landmark ? (
        <Text style={s.addrSub}>
          {w.landmark}: {j.landmark}
        </Text>
      ) : null}
      {j.gate_note ? (
        <Text style={s.addrSub}>
          {w.gate}: {j.gate_note}
        </Text>
      ) : null}
      <Text style={s.addrSub}>
        {j.customer_first_name}
        {j.customer_phone ? ` · ${showMobile(j.customer_phone)}` : ''}
      </Text>
      <View style={s.money}>
        <View>
          <Text style={s.moneyLabel}>{w.agreed}</Text>
          <Text style={s.moneyBig}>{rupees(j.agreed_paisa)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.moneyLabel}>{w.youKeep}</Text>
          {/* Follows the parts as he types them: the fee is on his labour only. */}
          <Text style={s.keep}>{rupees(commissionBps !== null ? j.agreed_paisa - commission(labour, commissionBps) : j.keeps_paisa)}</Text>
        </View>
      </View>
      <RemoteMedia items={j.media} voiceLabel={w.playVoice} videoLabel={w.watchVideo} />
      <View style={s.row}>
        {j.customer_phone ? (
          <View style={{ flex: 1 }}>
            <Button kind="green" label={w.callCustomer} onPress={() => Linking.openURL(`tel:+${j.customer_phone!.replace(/^\+/, '')}`)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button kind="outline" label={w.message} onPress={() => router.push({ pathname: '/chat/[job]', params: { job: j.id } })} />
        </View>
      </View>
      {j.stage === 'chosen' || j.stage === 'on_way' ? <Button kind="outline" label={w.openMap} onPress={() => Linking.openURL(map)} /> : null}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button kind="outline" label={w.reportProblem} onPress={() => setReporting(!reporting)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="danger" label={w.emergency} onPress={() => router.push({ pathname: '/emergency/[job]', params: { job: j.id } })} />
        </View>
      </View>
      {reporting ? (
        <View style={s.step}>
          <TextInput
            value={reportText}
            onChangeText={setReportText}
            maxLength={500}
            multiline
            placeholder={w.reportPlaceholder}
            placeholderTextColor={colour.steel}
            accessibilityLabel={w.reportPlaceholder}
            style={[s.input, { minHeight: 72, paddingTop: 12 }]}
          />
          {msg && msgField === 'report' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          <Button kind="green" label={w.reportSend} busy={busy} onPress={sendReport} />
        </View>
      ) : null}
      {reported ? <Text style={s.note}>{w.reportSent}</Text> : null}

      <View style={s.rule} />

      {j.stage === 'chosen' ? (
        <View style={s.step}>
          <Button kind="yellow" label={w.onWay} busy={busy} onPress={() => run('tech_step', { p_job: j.id, p_from: 'chosen' })} />
          <Text style={s.note}>{w.onWayNote}</Text>
        </View>
      ) : null}

      {j.stage === 'on_way' ? (
        <View style={s.step}>
          <Button kind="yellow" label={w.arrived} busy={busy} onPress={() => run('tech_step', { p_job: j.id, p_from: 'on_way' })} />
          <Text style={s.note}>{w.arrivedNote}</Text>
        </View>
      ) : null}

      {j.stage === 'arrived' && j.code_locked ? (
        <View style={s.step}>
          <Text style={s.warn}>{w.codeLocked}</Text>
          <Button kind="green" label={w.callOffice} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
        </View>
      ) : null}

      {j.stage === 'arrived' && !j.code_locked && !changing ? (
        <View style={s.step}>
          <Text style={s.label}>{w.askCode}</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="0000"
            placeholderTextColor={colour.steel}
            accessibilityLabel={w.codeLabel}
            style={s.code}
          />
          {msg && msgField === 'code' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          {j.code_tries_left < 5 ? <Text style={s.warnSmall}>{fill(w.triesLeft, { n: j.code_tries_left })}</Text> : null}
          <Photos label={w.beforePhoto} paths={photos} setPaths={setPhotos} userId={userId} w={w} onProblem={(m) => { setMsg(m); setMsgField(m ? 'photos' : null); }} />
          {msg && msgField === 'photos' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          <Button
            kind="yellow"
            label={w.start}
            busy={busy}
            onPress={() => run('start_work', { p_job: j.id, p_code: code, p_photos: photos }, reset)}
          />
        </View>
      ) : null}

      {j.change ? (
        <View style={s.step}>
          <Text style={s.waiting}>{fill(w.waitingAnswer, { price: rupees(j.change.price_paisa), was: rupees(j.change.from_paisa) })}</Text>
          <Text style={s.note}>{fill(w.declineFee, { fee: rupees(j.visit_fee_paisa) })}</Text>
          <Button kind="outline" label={w.withdrawChange} busy={busy} onPress={() => run('withdraw_change', { p_job: j.id })} />
        </View>
      ) : null}

      {(j.stage === 'arrived' || j.stage === 'working') && !j.change && !j.code_locked ? (
        changing ? (
          <ChangeForm j={j} w={w} userId={userId} commissionBps={commissionBps} onDone={() => { setChanging(false); onChanged(); }} onBack={() => setChanging(false)} />
        ) : (
          <Button kind="outline" label={w.newPrice} onPress={() => setChanging(true)} />
        )
      ) : null}

      {j.stage === 'working' && !j.change && !changing ? (
        <View style={s.step}>
          <Photos label={w.afterPhoto} paths={photos} setPaths={setPhotos} userId={userId} w={w} onProblem={(m) => { setMsg(m); setMsgField(m ? 'photos' : null); }} />
          {msg && msgField === 'photos' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          <Text style={s.label}>{w.partsLabel}</Text>
          <TextInput
            value={parts}
            onChangeText={(t) => setParts(t.replace(/[^0-9]/g, '').slice(0, 7))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colour.steel}
            accessibilityLabel={w.partsLabel}
            style={s.input}
          />
          {msg && msgField === 'parts' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          {partsPaisa > 0 ? (
            <Photos label={w.receiptPhoto} paths={receipt} setPaths={setReceipt} userId={userId} w={w} max={1} onProblem={(m) => { setMsg(m); setMsgField(m ? 'receipt' : null); }} />
          ) : null}
          {msg && msgField === 'receipt' ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
          <Text style={s.note}>{w.partsNote}</Text>
          {commissionBps !== null ? (
            <Text style={s.feeLine}>{fill(w.feeKeep, { fee: rupees(commission(labour, commissionBps)), keep: rupees(j.agreed_paisa - commission(labour, commissionBps)) })}</Text>
          ) : null}
          <Button
            kind="yellow"
            label={w.finish}
            busy={busy}
            onPress={() => run('finish_work', { p_job: j.id, p_photos: photos, p_parts_paisa: partsPaisa, p_receipt: partsPaisa > 0 ? (receipt[0] ?? null) : null }, reset)}
          />
          <Text style={s.note}>{fill(w.finishNote, { price: rupees(j.agreed_paisa) })}</Text>
        </View>
      ) : null}

      {msg && !j.code_locked && !['code', 'photos', 'parts', 'receipt', 'report'].includes(msgField ?? '') ? <Text style={s.error} accessibilityRole="alert">{msg}</Text> : null}
    </View>
  );
}

/** "Photo lein": straight from the camera, uploaded at once, so a failed tap later does not lose it. */
function Photos({ label, paths, setPaths, userId, w, onProblem, max = 4 }: { label: string; paths: string[]; setPaths: (p: string[]) => void; userId: string; w: ProWords; onProblem: (m: string | null) => void; max?: number }) {
  const [busy, setBusy] = useState(false);
  const urls = useSignedUrls(paths.map((path) => ({ kind: 'photo', path, seconds: null })));

  async function add() {
    onProblem(null);
    setBusy(true);
    try {
      const m = await takePhoto(true);
      if (m) setPaths([...paths, await upload(m, userId)]);
    } catch (e) {
      onProblem(e instanceof Error && e.message === 'camera' ? w.errCamera : w.errPhotos);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.photos}>
        {paths.map((p) => (urls[p] ? <Image key={p} source={{ uri: urls[p] }} style={s.photo} /> : <View key={p} style={[s.photo, { backgroundColor: colour.paper2 }]} />))}
        {paths.length < max ? (
          <Press onPress={add} disabled={busy} accessibilityRole="button" accessibilityLabel={label} style={s.addPhoto}>
            <Text style={s.addPhotoText}>{busy ? '…' : '+'}</Text>
          </Press>
        ) : null}
      </View>
      {busy ? <Text style={s.note}>{w.uploading}</Text> : paths.length === 0 ? <Text style={s.note}>{w.addPhoto}</Text> : null}
    </View>
  );
}

/** A new price: the figure, why, and a photo. Shows what he would keep, worked out the database's way. */
function ChangeForm({ j, w, userId, commissionBps, onDone, onBack }: { j: ActiveJob; w: ProWords; userId: string; commissionBps: number | null; onDone: () => void; onBack: () => void }) {
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const rupeesTyped = Number(price.replace(/[^0-9]/g, ''));
  const paisa = Number.isFinite(rupeesTyped) && rupeesTyped > 0 ? rupeesTyped * 100 : null;

  async function send() {
    setErrors({});
    if (!paisa) return setErrors({ price: w.errNewPrice });
    setBusy(true);
    const r = await ask('ask_change', { p_job: j.id, p_price_paisa: paisa, p_reason: reason, p_photo: photo[0] ?? null });
    setBusy(false);
    if (!r.ok) {
      const field = r.field ?? 'form';
      const words: Record<string, string> = { price: w.errNewPrice, reason: w.errReason, photos: w.errPhotos, stage: w.errStage };
      return setErrors({ [field]: words[field] ?? r.why });
    }
    onDone();
  }

  return (
    <View style={[s.step, s.form]}>
      <Text style={s.formTitle}>{w.newPrice}</Text>
      <Text style={s.note}>{w.newPriceNote}</Text>
      <Text style={s.label}>{w.newPriceLabel}</Text>
      <TextInput
        value={price}
        onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, '').slice(0, 7))}
        keyboardType="number-pad"
        accessibilityLabel={w.newPriceLabel}
        placeholder={String(j.agreed_paisa / 100)}
        placeholderTextColor={colour.steel}
        style={s.input}
      />
      {paisa && commissionBps !== null ? (
        <Text style={s.note}>
          {w.youKeep}: {rupees(technicianKeeps(paisa, commissionBps))}
        </Text>
      ) : null}
      {errors.price ? <Text style={s.error}>{errors.price}</Text> : null}
      <Text style={s.label}>{w.reasonLabel}</Text>
      <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline accessibilityLabel={w.reasonLabel} style={[s.input, { minHeight: 72, paddingTop: 12 }]} />
      {errors.reason ? <Text style={s.error}>{errors.reason}</Text> : null}
      <Photos label={w.changePhoto} paths={photo} setPaths={setPhoto} userId={userId} w={w} onProblem={(m) => setErrors(m ? { photos: m } : {})} max={1} />
      {errors.photos ? <Text style={s.error}>{errors.photos}</Text> : null}
      <Text style={s.note}>{fill(w.declineFee, { fee: rupees(j.visit_fee_paisa) })}</Text>
      <Button kind="yellow" label={w.sendChange} busy={busy} onPress={send} />
      <Button kind="outline" label={w.back} onPress={onBack} />
      {errors.stage || errors.form ? <Text style={s.error}>{errors.stage ?? errors.form}</Text> : null}
    </View>
  );
}

/** The last day's finished jobs: what to collect, and no address. */
export function Finished({ items, w, tradeName, onChanged }: { items: FinishedJob[]; w: ProWords; tradeName: (slug: string) => string; onChanged: () => void }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.section}>{w.finishedToday}</Text>
      {items.map((f) => (
        <View key={f.id} style={s.done}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.doneTitle}>
              {tradeName(f.trade)} · {f.ref} · {f.sector}
            </Text>
            <Text style={s.doneSub}>
              {f.customer_first_name}
              {f.status === 'stopped' ? ` · ${w.stoppedLine}` : ''}
            </Text>
          </View>
          <Text style={s.doneMoney}>{fill(w.collect, { price: rupees(f.collect_paisa) })}</Text>
          {f.can_rate ? <RateCustomer f={f} w={w} onDone={onChanged} /> : null}
          {f.my_rating ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
              <Text style={s.doneSub}>{w.rated}</Text>
              <Stars value={f.my_rating} size={14} dark />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** He rates the customer: only Pechkas sees it, and the screen says so. */
function RateCustomer({ f, w, onDone }: { f: FinishedJob; w: ProWords; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (!stars) return setMsg(w.errStars);
    setBusy(true);
    const r = await ask('rate_job', { p_job: f.id, p_stars: stars, p_words: words });
    setBusy(false);
    if (!r.ok) return setMsg(proError(w, r.field, r.why));
    onDone();
  }

  return (
    <View style={{ width: '100%', gap: 6 }}>
      <Text style={s.doneSub}>{fill(w.rateCustomer, { name: f.customer_first_name })}</Text>
      <Stars value={stars} onPick={setStars} size={26} dark label={fill(w.rateCustomer, { name: f.customer_first_name })} />
      {stars ? (
        <>
          <TextInput value={words} onChangeText={setWords} maxLength={300} placeholder={w.rateWords} placeholderTextColor={colour.steel} accessibilityLabel={w.rateWords} style={s.input} />
          <Text style={s.doneSub}>{w.rateNote}</Text>
          <Button kind="yellow" dark label={w.rateSend} busy={busy} onPress={send} />
        </>
      ) : null}
      {msg ? <Text style={[s.error, { color: '#ffb4a3' }]}>{msg}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 22 },
  feeLine: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green },
  chosen: { backgroundColor: colour.paper },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colour.ink },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.yellow },
  when: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  title: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 24, color: colour.ink },
  addr: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  addrSub: { fontFamily: font.body, fontSize: 14, color: colour.inkSoft },
  money: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  moneyLabel: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  moneyBig: { fontFamily: font.display, fontSize: 26, color: colour.ink },
  keep: { fontFamily: font.display, fontSize: 20, color: colour.green },
  row: { flexDirection: 'row', gap: 8 },
  rule: { height: 1, backgroundColor: colour.rule, marginVertical: 2 },
  step: { gap: 8 },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  code: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colour.ink,
    backgroundColor: colour.white,
    textAlign: 'center',
    fontFamily: font.mono,
    fontSize: 32,
    letterSpacing: 12,
    color: colour.ink,
  },
  input: { minHeight: 52, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 16, borderWidth: 1.5, borderColor: colour.rule },
  warn: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.brick },
  warnSmall: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  waiting: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.brick },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  addPhoto: { width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colour.steel, alignItems: 'center', justifyContent: 'center' },
  addPhotoText: { fontFamily: font.display, fontSize: 28, color: colour.ink },
  form: { padding: 12, borderRadius: radius.card, backgroundColor: colour.paper2 },
  formTitle: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  section: { fontFamily: font.bodySemi, fontSize: 14, color: '#b9c2c9', marginTop: 4 },
  done: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: '#22282d' },
  doneTitle: { fontFamily: font.bodySemi, fontSize: 14, color: colour.paper },
  doneSub: { fontFamily: font.body, fontSize: 13, color: '#b9c2c9' },
  doneMoney: { fontFamily: font.display, fontSize: 15, color: colour.yellow },
});
