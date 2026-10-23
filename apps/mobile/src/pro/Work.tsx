import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees, showMobile, technicianKeeps } from '@pechkas/shared';
import { MenuButton } from '../components/Menu';
import { Mark } from '../components/Mark';
import { Press } from '../components/Press';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Button, Notice, NotifyCard, SystemBars } from '../components/ui';
import { RemoteMedia, type StoredMedia } from '../post/RemoteMedia';
import { Chosen, Finished, type ActiveJob, type FinishedJob } from './OnTheJob';
import { useAccount } from '../account';
import { useLists } from '../lists';
import { useNotify } from '../notifications';
import { ask, supabase } from '../supabase';
import { fill, useProWords, type ProWords } from '../words';
import { colour, font, radius } from '../theme';

/**
 * An approved technician's work, laid out as inDrive's driver side (the
 * owner's reference): the ☰ menu, the Online / Offline switch in the middle
 * and what he owes on the right; offline, one big "Go online"; online, a
 * list of short request cards — who, what, where, when, and the price large
 * — and a tap opens the job in a sheet from the bottom, with "Accept for
 * Rs …", steps to ask for more, and how soon he can come.
 *
 * While he is online and on this screen it asks again every 15 seconds.
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
  created_at?: string;
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
/** Asking for more is in plain steps above her price, never a price we suggest. */
const STEPS = [20000, 50000, 100000];

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
  const [open, setOpen] = useState<string | null>(null);

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
  const opened = feed?.jobs.find((j) => j.id === open) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      {/* inDrive's driver bar: menu, the switch in the middle, money on the right. */}
      <View style={[s.bar, { paddingTop: insets.top + 10 }]}>
        <MenuButton />
        <Press
          onPress={() => setOnline(!online)}
          accessibilityRole="switch"
          accessibilityLabel={online ? w.online : w.offline}
          accessibilityState={{ checked: online, busy: switching }}
          sink={0.96}
          style={[s.switch, online && s.switchOn]}
        >
          <Text style={s.switchText}>{online ? w.online : w.offline}</Text>
          <View style={[s.track, online && s.trackOn]}>
            <View style={[s.knob, online && s.knobOn]} />
          </View>
        </Press>
        {feed?.approved && feed.owed_paisa !== undefined ? (
          <Press
            onPress={() => router.push('/pro/money')}
            accessibilityRole="button"
            accessibilityLabel={`${w.owe}: ${rupees(feed.owed_paisa)}`}
            sink={0.94}
            style={[s.owedPill, feed.blocked && s.owedPillBlocked]}
          >
            <Text style={[s.owedPillLabel, feed.blocked && { color: colour.white }]}>{w.owedShort}</Text>
            <Text style={[s.owedPillAmount, feed.blocked && { color: colour.white }]}>{rupees(feed.owed_paisa)}</Text>
          </Press>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Notice text={problem} />

        {feed?.blocked ? (
          <Press onPress={() => router.push('/pro/money')} accessibilityRole="button" style={s.blocked}>
            <Text style={s.blockedTitle}>{w.blockedTitle}</Text>
            <Text style={s.blockedText}>{fill(w.blockedText, { owed: rupees(feed.owed_paisa ?? 0), limit: rupees(feed.credit_limit_paisa ?? 0) })}</Text>
          </Press>
        ) : null}

        {online && notify === 'ask' ? <NotifyCard title={w.notifyAsk} text={w.notifyAskText} action={w.notifyTurnOn} onPress={askNotify} /> : null}
        {online && notify === 'off' ? <NotifyCard title={w.notifyOff} text={w.notifyOffText} action={w.openSettings} onPress={() => Linking.openSettings()} /> : null}

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

        {feed && !online ? (
          <View style={s.offline}>
            <Mark size={72} />
            <Text style={s.offlineTitle}>{w.offlineTitle}</Text>
            <Text style={s.offlineText}>{w.offlineText}</Text>
            <View style={{ alignSelf: 'stretch' }}>
              <Button label={w.goOnline} onPress={() => setOnline(true)} busy={switching} />
            </View>
          </View>
        ) : null}

        {online ? (
          <View style={{ gap: 8 }}>
            <View style={s.listHead}>
              <Text style={s.listTitle}>{w.requestsTitle}</Text>
              {feed?.jobs.length ? (
                <View style={s.count}>
                  <Text style={s.countText}>{feed.jobs.length}</Text>
                </View>
              ) : null}
            </View>
            {feed && feed.jobs.length === 0 ? <Text style={s.empty}>{w.noJobs}</Text> : null}
            {feed?.jobs.map((j) => (
              <RequestRow key={j.id} j={j} w={w} trade={tradeName(j.trade)} onOpen={() => setOpen(j.id)} />
            ))}
          </View>
        ) : null}

        <Finished items={finished} w={w} tradeName={tradeName} onChanged={load} />
      </ScrollView>
      {/* The top bar already covers the clock; this keeps the list clear of the button bar. */}
      <SystemBars bg={colour.canvas} top={false} />

      {opened && feed ? (
        <Sheet onClose={() => setOpen(null)} closeLabel={w.closeJob}>
          <JobCard j={opened} feed={feed} w={w} trade={tradeName(opened.trade)} onChanged={load} />
        </Sheet>
      ) : null}
    </View>
  );
}

function ago(iso: string | undefined, w: ProWords): string | null {
  if (!iso) return null;
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return w.justNow;
  if (min < 60) return fill(w.minAgo, { n: min });
  return fill(w.hoursAgo, { n: Math.floor(min / 60) });
}

function mediaLine(media: StoredMedia[], w: ProWords): string | null {
  const photos = media.filter((m) => m.kind === 'photo').length;
  const parts = [
    media.some((m) => m.kind === 'voice') ? w.voiceNote : null,
    media.some((m) => m.kind === 'video') ? w.videoOne : null,
    photos === 1 ? w.photoOne : photos > 1 ? fill(w.photosN, { n: photos }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One request in the list, as inDrive shows a ride: who and when on top, the
 * price large on the right, then what and where. A tap opens the job.
 */
function RequestRow({ j, w, trade, onOpen }: { j: FeedJob; w: ProWords; trade: string; onOpen: () => void }) {
  const live = j.my_offer?.live ? j.my_offer : null;
  const media = mediaLine(j.media, w);
  const when = ago(j.created_at, w);
  return (
    <Press onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${j.title}, ${j.sector}, ${rupees(j.offered_paisa)}`} sink={0.98} style={[s.req, (j.asked_you || live) && s.reqMarked]}>
      <View style={s.reqTop}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{j.customer_first_name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.reqName} numberOfLines={1}>
            {j.customer_first_name}
          </Text>
          <Text style={s.reqWhen} numberOfLines={1}>
            {[whenText(j, w), when].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={s.reqPrice}>{rupees(j.offered_paisa)}</Text>
      </View>
      <View style={s.reqBody}>
        <Icon name="pin" size={18} color={colour.green} strokeWidth={2.2} />
        <View style={{ flex: 1 }}>
          <Text style={s.reqTitle} numberOfLines={2}>
            {j.title}
          </Text>
          <Text style={s.reqSub} numberOfLines={1}>
            {trade} · {j.sector}
          </Text>
        </View>
      </View>
      {media || j.asked_you || live ? (
        <View style={s.reqTags}>
          {j.asked_you ? (
            <View style={[s.tag, s.tagYellow]}>
              <Text style={s.tagText}>{w.askedBadge}</Text>
            </View>
          ) : null}
          {live ? (
            <View style={[s.tag, s.tagGreen]}>
              <Text style={[s.tagText, { color: colour.white }]}>{fill(w.offerSent, { price: rupees(live.price_paisa) })}</Text>
            </View>
          ) : null}
          {media ? (
            <View style={s.tag}>
              <Text style={s.tagText}>{media}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Press>
  );
}

/**
 * The job, opened from the list: a sheet that rises from the bottom over a
 * dimmed screen, as inDrive's ride request does. It moves by transform only;
 * the words never fade. Tapping outside or Close puts it away.
 */
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
      {/* The price she named, large, first: the thing a driver reads first on inDrive. */}
      {j.asked_you && j.asked_until ? (
        <View style={{ gap: 8 }}>
          <Text style={s.asked}>
            {fill(w.askedYou, { name: j.customer_first_name, time: new Date(j.asked_until).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' }) })}
          </Text>
          {!live ? <Button kind="outline" label={w.passAsked} onPress={pass} busy={busy} /> : null}
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
      <RemoteMedia items={j.media} voiceLabel={w.playVoice} videoLabel={w.watchVideo} />
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
              <Text style={[s.stepText, { color: colour.ink }]}>−</Text>
            </Press>
            <Text style={s.stepPrice}>{rupees(price)}</Text>
            <Press onPress={() => setPrice(Math.min(max, price + 10000))} sink={0.9} accessibilityRole="button" accessibilityLabel="+100" style={[s.step, s.stepPlus]}>
              <Text style={s.stepText}>+</Text>
            </Press>
          </View>
          {/* Ask for more in plain steps above her price, as inDrive's drivers do. */}
          <View style={s.steps}>
            {STEPS.filter((d) => j.offered_paisa + d <= max).map((d) => {
              const on = price === j.offered_paisa + d;
              return (
                <Press key={d} onPress={() => setPrice(on ? j.offered_paisa : j.offered_paisa + d)} sink={0.94} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.chip, s.stepChip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && { color: colour.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    +{rupees(d)}
                  </Text>
                </Press>
              );
            })}
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
              style={[s.input, errors.note && { borderColor: colour.brick, borderWidth: 2 }]}
            />
            {errors.note ? <Text style={s.error}>{errors.note}</Text> : null}
          </View>

          <Button
            kind={price === j.offered_paisa ? 'yellow' : 'green'}
            label={price === j.offered_paisa ? fill(w.acceptFor, { price: rupees(price) }) : fill(w.offerFor, { price: rupees(price) })}
            onPress={() => send(price)}
            busy={busy}
          />
        </View>
      )}
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 16, paddingRight: 8, borderRadius: radius.pill, backgroundColor: colour.white, boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.12)' },
  switchOn: { backgroundColor: colour.yellow },
  switchText: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  track: { width: 44, height: 28, borderRadius: 14, backgroundColor: colour.tile, padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: colour.green },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.steel },
  knobOn: { backgroundColor: colour.white, alignSelf: 'flex-end' },
  owedPill: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.12)' },
  owedPillBlocked: { backgroundColor: colour.brick },
  owedPillLabel: { fontFamily: font.body, fontSize: 11, color: colour.steel },
  owedPillAmount: { fontFamily: font.display, fontSize: 15, color: colour.green },
  blocked: { gap: 4, padding: 14, borderRadius: radius.big, backgroundColor: colour.brick },
  blockedTitle: { fontFamily: font.display, fontSize: 17, color: colour.white },
  blockedText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.white },
  offline: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 24, borderRadius: 28, backgroundColor: colour.white },
  offlineTitle: { fontFamily: font.display, fontSize: 24, color: colour.ink, marginTop: 6 },
  offlineText: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.steel, textAlign: 'center', marginBottom: 8 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 },
  listTitle: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  count: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  req: { gap: 12, padding: 14, borderRadius: 22, backgroundColor: colour.white },
  reqMarked: { borderWidth: 2, borderColor: colour.yellow },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colour.tile, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  reqName: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  reqWhen: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  reqPrice: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  reqBody: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reqTitle: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 21, color: colour.ink },
  reqSub: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  reqTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colour.canvas },
  tagYellow: { backgroundColor: colour.yellow },
  tagGreen: { backgroundColor: colour.green },
  tagText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.ink },
  steps: { flexDirection: 'row', gap: 8 },
  stepChip: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  section: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, marginTop: 4 },
  empty: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel },
  card: { gap: 10, padding: 14, borderRadius: 22, backgroundColor: colour.white },
  cardAsked: { borderWidth: 2, borderColor: colour.yellow },
  asked: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.green },
  chosen: { backgroundColor: colour.white },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colour.yellow },
  badgeText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.ink },
  when: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  title: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 24, color: colour.ink },
  desc: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  cust: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  fact: { fontFamily: font.bodyMedium, fontSize: 13, color: colour.inkSoft },
  money: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  moneyLabel: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  moneyBig: { fontFamily: font.display, fontSize: 26, color: colour.ink },
  keep: { fontFamily: font.display, fontSize: 20, color: colour.green },
  fee: { fontFamily: font.body, fontSize: 12, color: colour.steel, marginTop: -6 },
  waiting: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green },
  expired: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  row: { flexDirection: 'row', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6, borderRadius: radius.big, backgroundColor: colour.canvas },
  step: { width: 48, height: 48, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(20,23,26,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 24, color: colour.ink, marginTop: -2 },
  stepPrice: { fontFamily: font.display, fontSize: 24, color: colour.ink },
  label: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'rgba(20,23,26,0.2)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  chipText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colour.canvas, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 15, borderWidth: 1, borderColor: 'transparent' },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.brick },
  addr: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  addrSub: { fontFamily: font.body, fontSize: 14, color: colour.inkSoft },
});
