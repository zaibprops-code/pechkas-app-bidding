import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees, showMobile, technicianKeeps } from '@pechkas/shared';
import { MenuButton } from '../components/Menu';
import { Mark } from '../components/Mark';
import { Press } from '../components/Press';
import { Button, Notice, NotifyCard } from '../components/ui';
import { RemoteMedia, type StoredMedia } from '../post/RemoteMedia';
import { Chosen, Finished, type ActiveJob, type FinishedJob } from './OnTheJob';
import { useAccount } from '../account';
import { useLists } from '../lists';
import { useNotify } from '../notifications';
import { ask, supabase } from '../supabase';
import { fill, useProWords, type ProWords } from '../words';
import { colour, font, radius } from '../theme';

/**
 * An approved technician's work: online or not, new jobs in his trades and
 * sectors, and the jobs he has been chosen for.
 *
 * Board 6 of the approved design. Nothing here arrives by notification yet:
 * while he is online and on this screen it asks again every 15 seconds.
 * The database decides everything shown — which jobs, whose address, what
 * he keeps — and checks every offer again when it arrives.
 */

type Offer = { price_paisa: number; eta_minutes: number | null; note: string | null; status: string; expires_at: string; live: boolean };
type FeedJob = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  description: string | null;
  offered_paisa: number;
  list_paisa: number | null;
  when_kind: 'now' | 'today' | 'tomorrow';
  when_part: 'morning' | 'afternoon' | 'evening' | null;
  sector: string;
  power: 'on' | 'off' | null;
  parts: 'pro_buys' | 'customer_has' | null;
  customer_first_name: string;
  media: StoredMedia[];
  my_offer: Offer | null;
  /** The customer asked for him by name: his alone until `asked_until`. */
  asked_you?: boolean;
  asked_until?: string | null;
  /** She has had a job done by him before, so his share is the lower one. */
  repeat?: boolean;
  commission_bps?: number;
};
type Feed = {
  approved: boolean;
  online: boolean;
  commission_bps: number;
  min_offer_paisa: number;
  max_counter_bps: number;
  owed_paisa?: number;
  credit_limit_paisa?: number;
  blocked?: boolean;
  jobs: FeedJob[];
};

const EVERY = 15000;
const ETAS = [15, 30, 45, 60, 90];

export function Work({ firstName }: { firstName: string }) {
  const { w } = useProWords();
  const { notify, ask: askNotify } = useNotify(true);
  const lists = useLists();
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [mine, setMine] = useState<ActiveJob[]>([]);
  const [finished, setFinished] = useState<FinishedJob[]>([]);
  const { session } = useAccount();
  const [problem, setProblem] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [f, m, d] = await Promise.all([supabase.rpc('pro_feed'), supabase.rpc('pro_my_jobs'), supabase.rpc('pro_finished')]);
    if (f.error || m.error) {
      setProblem('No connection. Pull down to try again.');
      return;
    }
    setProblem(null);
    setFeed(f.data as Feed);
    setMine((m.data as ActiveJob[]) ?? []);
    setFinished((d.data as FinishedJob[]) ?? []);
  }, []);

  // While he is looking at this screen, ask again every 15 seconds. Stops the
  // moment he leaves it, so it costs nothing in his pocket.
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, EVERY);
      return () => clearInterval(t);
    }, [load]),
  );

  async function setOnline(next: boolean) {
    // Going online is when being told obviously helps, so that is when the
    // phone asks. He goes online whatever he answers.
    if (next && notify === 'ask') await askNotify();
    setSwitching(true);
    await ask('pro_set_online', { p_online: next });
    await load();
    setSwitching(false);
  }

  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const online = feed?.online ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: colour.ink }}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.yellow} />}
      >
        <View style={s.top}>
          <MenuButton dark />
          <View style={s.brand}>
            <Mark size={30} />
            <View>
              <Text style={s.brandText}>pechkas pro</Text>
              <Text style={s.who}>{firstName}</Text>
            </View>
          </View>
        </View>

        <Press
          onPress={() => setOnline(!online)}
          accessibilityRole="switch"
          accessibilityState={{ checked: online, busy: switching }}
          style={[s.toggle, { backgroundColor: online ? colour.yellow : '#2a3036' }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.toggleTitle, { color: online ? colour.ink : colour.paper }]}>{online ? w.online : w.offline}</Text>
            {!online ? <Text style={s.toggleSub}>{w.offlineText}</Text> : null}
          </View>
          <View style={[s.knob, { backgroundColor: online ? colour.green : '#4c565e', alignSelf: online ? 'flex-end' : 'flex-start' }]} />
        </Press>

        <Notice dark text={problem} />

        {/* What he owes Pechkas, always one tap from the details. */}
        {feed?.approved && feed.owed_paisa !== undefined ? (
          <Press onPress={() => router.push('/pro/money')} accessibilityRole="button" style={[s.owed, feed.blocked && s.owedBlocked]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.owedLabel, feed.blocked && { color: colour.white }]}>{feed.blocked ? w.blockedTitle : w.owe}</Text>
              {feed.blocked ? (
                <Text style={s.owedText}>{fill(w.blockedText, { owed: rupees(feed.owed_paisa), limit: rupees(feed.credit_limit_paisa ?? 0) })}</Text>
              ) : null}
            </View>
            <Text style={[s.owedAmount, feed.blocked && { color: colour.white }]}>{rupees(feed.owed_paisa)}</Text>
          </Press>
        ) : null}

        {online && notify === 'ask' ? <NotifyCard dark title={w.notifyAsk} text={w.notifyAskText} action={w.notifyTurnOn} onPress={askNotify} /> : null}
        {online && notify === 'off' ? <NotifyCard dark title={w.notifyOff} text={w.notifyOffText} action={w.openSettings} onPress={() => Linking.openSettings()} /> : null}

        {mine.length ? (
          <View style={{ gap: 10 }}>
            <Text style={s.section}>{w.myJobs}</Text>
            {mine.map((j) => (
              <Chosen
                key={j.id}
                j={j}
                w={w}
                trade={tradeName(j.trade)}
                when={whenText(j, w)}
                userId={session?.user.id ?? ''}
                commissionBps={j.commission_bps ?? feed?.commission_bps ?? null}
                onChanged={load}
              />
            ))}
          </View>
        ) : null}

        {online ? (
          <View style={{ gap: 10 }}>
            <Text style={s.section}>{w.newJob}</Text>
            {feed && feed.jobs.length === 0 ? <Text style={s.empty}>{w.noJobs}</Text> : null}
            {feed?.jobs.map((j) => (
              <JobCard key={j.id} j={j} feed={feed} w={w} trade={tradeName(j.trade)} onChanged={load} />
            ))}
          </View>
        ) : null}

        <Finished items={finished} w={w} tradeName={tradeName} onChanged={load} />

      </ScrollView>
    </View>
  );
}

function whenText(j: { when_kind: FeedJob['when_kind']; when_part: FeedJob['when_part'] }, w: ProWords) {
  return j.when_kind === 'now' ? w.now : `${j.when_kind === 'today' ? w.today : w.tomorrow} ${j.when_part ? w[j.when_part] : ''}`.trim();
}

function Facts({ j, w }: { j: { power: FeedJob['power']; parts: FeedJob['parts'] }; w: ProWords }) {
  const lines = [j.power === 'on' ? w.powerOn : j.power === 'off' ? w.powerOff : null, j.parts === 'pro_buys' ? w.partsPro : j.parts === 'customer_has' ? w.partsCustomer : null].filter(Boolean);
  if (!lines.length) return null;
  return (
    <View style={{ gap: 2 }}>
      {lines.map((l) => (
        <Text key={l} style={s.fact}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function JobCard({ j, feed, w, trade, onChanged }: { j: FeedJob; feed: Feed; w: ProWords; trade: string; onChanged: () => void }) {
  const live = j.my_offer?.live ? j.my_offer : null;
  const [editing, setEditing] = useState(!live);
  const [price, setPrice] = useState(live?.price_paisa ?? j.offered_paisa);
  const [eta, setEta] = useState<number | null>(live?.eta_minutes ?? (j.when_kind === 'now' ? 30 : null));
  const [note, setNote] = useState(live?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wasLive = useRef(Boolean(live));

  // An offer that just went live closes the editor; one that ran out opens it.
  useEffect(() => {
    if (Boolean(live) !== wasLive.current) {
      wasLive.current = Boolean(live);
      setEditing(!live);
    }
  }, [live]);

  const min = feed.min_offer_paisa;
  const max = Math.floor((j.offered_paisa * feed.max_counter_bps) / 10000 / 100) * 100;
  // Per job: 7% for a customer he has worked for before, 10% otherwise.
  const bps = j.commission_bps ?? feed.commission_bps;
  const pct = Math.round(bps / 100);
  const minutesLeft = live ? Math.max(0, Math.ceil((new Date(live.expires_at).getTime() - Date.now()) / 60000)) : 0;

  async function send(p: number) {
    setErrors({});
    setMsg(null);
    setBusy(true);
    const r = await ask('make_offer', { p_job: j.id, p_price_paisa: p, p_eta_minutes: j.when_kind === 'now' ? eta : null, p_note: note });
    setBusy(false);
    if (!r.ok) {
      if (r.field === 'price') setErrors({ price: fill(w.errPrice, { min: rupees(min), max: rupees(max) }) });
      else if (r.field === 'eta') setErrors({ eta: w.errEta });
      else if (r.field === 'note') setErrors({ note: w.errNote });
      else setMsg(w.gone);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function pass() {
    setBusy(true);
    const r = await ask('pass_asked', { p_job: j.id });
    setBusy(false);
    if (!r.ok) setMsg(w.gone);
    onChanged();
  }

  async function withdraw() {
    setBusy(true);
    await ask('withdraw_offer', { p_job: j.id });
    setBusy(false);
    setEditing(true);
    onChanged();
  }

  return (
    <View style={[s.card, j.asked_you && s.cardAsked]}>
      {j.asked_you && j.asked_until ? (
        <View style={{ gap: 8 }}>
          <Text style={s.asked}>
            {fill(w.askedYou, { name: j.customer_first_name, time: new Date(j.asked_until).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' }) })}
          </Text>
          {!live ? <Button dark kind="outline" label={w.passAsked} onPress={pass} busy={busy} /> : null}
        </View>
      ) : null}
      <View style={s.cardTop}>
        <View style={s.badge}>
          <Text style={s.badgeText}>
            {trade} · {j.sector}
          </Text>
        </View>
        <Text style={s.when}>{whenText(j, w)}</Text>
      </View>
      <Text style={s.title}>{j.title}</Text>
      {j.description ? <Text style={s.desc}>“{j.description}”</Text> : null}
      <Text style={s.cust}>{j.customer_first_name}</Text>
      <RemoteMedia items={j.media} voiceLabel={w.playVoice} videoLabel={w.watchVideo} dark />
      <Facts j={j} w={w} />

      <View style={s.money}>
        <View>
          <Text style={s.moneyLabel}>{editing ? (price === j.offered_paisa ? w.customerOffers : w.yourPrice) : w.yourOffer}</Text>
          <Text style={s.moneyBig}>{rupees(editing ? price : live?.price_paisa ?? price)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.moneyLabel}>{w.youKeep}</Text>
          <Text style={s.keep}>{rupees(technicianKeeps(editing ? price : live?.price_paisa ?? price, bps))}</Text>
        </View>
      </View>
      <Text style={s.fee}>{j.repeat ? fill(w.feeRepeat, { name: j.customer_first_name, pct }) : fill(w.feeLine, { pct })}</Text>

      {!editing && live ? (
        <View style={{ gap: 8 }}>
          <Text style={s.waiting}>
            {w.waiting} · {fill(w.minutesLeft, { n: minutesLeft })}
          </Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Button kind="outline" label={w.change} onPress={() => setEditing(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="outline" label={w.withdraw} onPress={withdraw} busy={busy} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {j.my_offer && !j.my_offer.live && j.my_offer.status === 'pending' ? <Text style={s.expired}>{w.expired}</Text> : null}
          <View style={s.stepper}>
            <Press onPress={() => setPrice(Math.max(min, price - 10000))} sink={0.9} accessibilityRole="button" accessibilityLabel="−100" style={s.step}>
              <Text style={[s.stepText, { color: colour.paper }]}>−</Text>
            </Press>
            <Text style={s.stepPrice}>{rupees(price)}</Text>
            <Press onPress={() => setPrice(Math.min(max, price + 10000))} sink={0.9} accessibilityRole="button" accessibilityLabel="+100" style={[s.step, s.stepPlus]}>
              <Text style={s.stepText}>+</Text>
            </Press>
          </View>
          {errors.price ? <Text style={s.error}>{errors.price}</Text> : null}

          {j.when_kind === 'now' ? (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>{w.howSoon}</Text>
              <View style={s.chips}>
                {ETAS.map((m) => (
                  <Press key={m} onPress={() => setEta(m)} sink={0.94} accessibilityRole="radio" accessibilityState={{ selected: eta === m }} style={[s.chip, eta === m && s.chipOn]}>
                    <Text style={[s.chipText, eta === m && { color: colour.ink }]}>
                      {m} {w.minutes}
                    </Text>
                  </Press>
                ))}
              </View>
              {errors.eta ? <Text style={s.error}>{errors.eta}</Text> : null}
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text style={s.label}>{w.noteLabel}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={w.notePlaceholder}
              placeholderTextColor="#8f9aa3"
              maxLength={200}
              accessibilityLabel={w.noteLabel}
              style={[s.input, errors.note && { borderColor: '#ffb4a3', borderWidth: 2 }]}
            />
            {errors.note ? <Text style={s.error}>{errors.note}</Text> : null}
          </View>

          <Button
            kind={price === j.offered_paisa ? 'yellow' : 'green'}
            label={`${price === j.offered_paisa ? w.accept : w.sendOffer} · ${rupees(price)}`}
            onPress={() => send(price)}
            busy={busy}
          />
        </View>
      )}
      <Notice dark text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  owed: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 14, borderRadius: radius.big, backgroundColor: '#22282d' },
  owedBlocked: { backgroundColor: colour.brick },
  owedLabel: { fontFamily: font.bodySemi, fontSize: 14, color: '#b9c2c9' },
  owedText: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.white, marginTop: 2 },
  owedAmount: { fontFamily: font.display, fontSize: 20, color: colour.yellow },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: font.display, fontSize: 18, color: colour.paper },
  who: { fontFamily: font.body, fontSize: 12, color: '#b9c2c9' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.big },
  toggleTitle: { fontFamily: font.display, fontSize: 20 },
  toggleSub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: '#b9c2c9', marginTop: 2 },
  knob: { width: 34, height: 34, borderRadius: 999 },
  section: { fontFamily: font.bodySemi, fontSize: 14, color: '#b9c2c9', marginTop: 4 },
  empty: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: '#b9c2c9' },
  card: { gap: 10, padding: 14, borderRadius: 22, backgroundColor: '#22282d' },
  cardAsked: { borderWidth: 2, borderColor: colour.yellow },
  asked: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.yellow },
  chosen: { backgroundColor: colour.paper },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colour.yellow },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.ink },
  when: { fontFamily: font.bodySemi, fontSize: 13, color: colour.paper },
  title: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 24, color: colour.paper },
  desc: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.paper },
  cust: { fontFamily: font.body, fontSize: 13, color: '#b9c2c9' },
  fact: { fontFamily: font.bodyMedium, fontSize: 13, color: '#e8ecef' },
  money: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  moneyLabel: { fontFamily: font.body, fontSize: 12, color: '#b9c2c9' },
  moneyBig: { fontFamily: font.display, fontSize: 26, color: colour.paper },
  keep: { fontFamily: font.display, fontSize: 20, color: colour.yellow },
  fee: { fontFamily: font.body, fontSize: 12, color: '#b9c2c9', marginTop: -6 },
  waiting: { fontFamily: font.bodySemi, fontSize: 14, color: colour.yellow },
  expired: { fontFamily: font.bodySemi, fontSize: 13, color: '#ffb4a3' },
  row: { flexDirection: 'row', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6, borderRadius: radius.big, backgroundColor: colour.ink },
  step: { width: 48, height: 48, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(250,246,239,0.4)', alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 24, color: colour.ink, marginTop: -2 },
  stepPrice: { fontFamily: font.display, fontSize: 24, color: colour.paper },
  label: { fontFamily: font.bodySemi, fontSize: 13, color: colour.paper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'rgba(250,246,239,0.3)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  chipText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.paper },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1, borderColor: 'transparent' },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: '#ffb4a3' },
  addr: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  addrSub: { fontFamily: font.body, fontSize: 14, color: colour.inkSoft },
});
