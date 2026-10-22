import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ISLAMABAD, MapBox, mapsReady, PinPicker } from '../src/components/Map';
import { rupees } from '@pechkas/shared';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Body, Button, Chip, Field, Loading, Notice, Screen, Title } from '../src/components/ui';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { ask, supabase } from '../src/supabase';
import { clearDraft, EMPTY, loadDraft, saveDraft, type Draft } from '../src/post/draft';
import { LIMITS, takePhoto, takeVideo, upload, type Media } from '../src/post/media';
import { VoiceNote } from '../src/post/VoiceNote';
import { colour, font, radius } from '../src/theme';

/**
 * Posting a job: what is broken, shown rather than typed, where, when, and the
 * price the customer offers. Board 2 of the approved design.
 *
 * The form is saved on the phone as it is filled in, files are uploaded only
 * when Post is pressed, and the database checks everything again — this page
 * runs in a stranger's phone and anything it sends can be changed.
 */

// Trades where whether the electricity is on decides if the visit is wasted.
const NEEDS_POWER = new Set(['ac', 'electrician', 'ups', 'solar', 'appliances', 'cctv', 'wifi', 'computers']);
const LAST_ADDRESS = 'pechkas.last-address';
// The database keeps an "ask again" for an hour (job_preferred()); so does the form.
const ASK_LASTS = 60 * 60 * 1000;
const PARTS_OF_DAY = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
] as const;

export default function Post() {
  const params = useLocalSearchParams<{ trade?: string; start?: string; ask?: string; minutes?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // The map, when this build has one (src/components/Map.tsx says when).
  const withMap = mapsReady();
  const [picking, setPicking] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const opened = useRef(false);

  // Start from the draft on this phone, or from the last address used.
  useEffect(() => {
    (async () => {
      const saved = await loadDraft();
      let next: Draft = saved ?? { ...EMPTY };
      if (!saved) {
        try {
          const raw = await AsyncStorage.getItem(LAST_ADDRESS);
          if (raw) next = { ...next, ...(JSON.parse(raw) as Partial<Draft>) };
        } catch {}
      }
      if (params.trade && params.trade !== next.trade) {
        next = { ...next, trade: params.trade, jobType: null, offer: null };
        // Kept on the phone at once, so a trade chosen before signing in is
        // still chosen when the form comes back after it.
        saveDraft(next);
      }
      // Arriving from "Ask Bilal again": the database already has the request.
      if (params.ask && params.trade) {
        next = { ...next, askFor: { name: params.ask, trade: params.trade, minutes: Number(params.minutes) || 10, at: Date.now() } };
        saveDraft(next);
      } else if (next.askFor && !(Date.now() - (next.askFor.at ?? 0) < ASK_LASTS)) {
        next = { ...next, askFor: null };
      }
      setD(next);
    })();
  }, [params.trade, params.ask, params.minutes]);

  const update = (patch: Partial<Draft>) => {
    // Any change answers the last complaint; do not leave it on screen.
    setNotice(null);
    setD((prev) => {
      const next = { ...(prev ?? EMPTY), ...patch };
      saveDraft(next);
      return next;
    });
  };

  const types = useMemo(() => (lists && d?.trade ? lists.job_types.filter((t) => t.trade === d.trade) : []), [lists, d?.trade]);
  const chosen = types.find((t) => t.id === d?.jobType) ?? null;
  const min = lists?.min_offer_paisa ?? 100000;
  const offer = Math.max(min, d?.offer ?? chosen?.list_paisa ?? min);

  // "Say it" and "Show it" on the home screen open the right recorder.
  useEffect(() => {
    if (!d || opened.current || !session) return;
    opened.current = true;
    if (params.start === 'video' && !d.media.some((m) => m.kind === 'video')) addVideo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, session]);

  if (!ready || !d) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (!account?.role) return <Redirect href={{ pathname: '/welcome', params: { as: 'customer', next: 'post' } }} />;
  if (account.role === 'pro') return <Redirect href="/pro" />;

  const voice = d.media.find((m) => m.kind === 'voice') ?? null;
  const video = d.media.find((m) => m.kind === 'video') ?? null;
  const photos = d.media.filter((m) => m.kind === 'photo');
  const setMedia = (kind: Media['kind'], items: Media[]) => update({ media: [...d.media.filter((m) => m.kind !== kind), ...items] });

  function problem(e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'camera') setNotice('Pechkas needs the camera for this. Allow it in your phone settings.');
    else if (msg === 'photos') setNotice('Pechkas needs your photos for this. Allow it in your phone settings.');
    else if (msg === 'long') setNotice(`Keep the video under ${LIMITS.videoSeconds} seconds.`);
    else if (msg === 'big') setNotice('That video is too big to send. Record a shorter one.');
    else setNotice('That did not work. Please try again.');
  }

  async function addVideo(camera: boolean) {
    setNotice(null);
    try {
      const m = await takeVideo(camera);
      if (m) setMedia('video', [m]);
    } catch (e) {
      problem(e);
    }
  }

  async function addPhoto(camera: boolean) {
    setNotice(null);
    if (photos.length >= LIMITS.photos) return;
    try {
      const m = await takePhoto(camera);
      if (m) setMedia('photo', [...photos, m]);
    } catch (e) {
      problem(e);
    }
  }

  /** Another trade is another job: he was asked for this one, so the request goes. */
  function chooseTrade(slug: string) {
    if (d?.askFor && d.askFor.trade !== slug) forgetAsk();
    update({ trade: slug, jobType: null, offer: null });
  }

  function forgetAsk() {
    update({ askFor: null });
    ask('forget_ask_again', {}).catch(() => {});
  }

  /** "Pechkas is not in G-9 yet": counted, and nothing promised in return. */
  async function askForSector(name: string) {
    if (!d?.trade) {
      setErrors((e) => ({ ...e, elsewhere: 'Choose what needs fixing first, at the top.' }));
      return;
    }
    setErrors((e) => ({ ...e, elsewhere: '' }));
    setAsking(name);
    const r = await ask('ask_for_sector', { p_trade: d.trade, p_sector: name });
    setAsking(null);
    if (!r.ok) {
      setErrors((e) => ({ ...e, elsewhere: r.why }));
      return;
    }
    setAsked(name);
  }

  async function locate() {
    setLocating(true);
    setErrors((e) => ({ ...e, location: '' }));
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setErrors((e) => ({ ...e, location: 'Allow location in your phone settings, or leave it out. The address is enough.' }));
        return;
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      update({ lat: here.coords.latitude, lng: here.coords.longitude, accuracy: here.coords.accuracy ?? null });
    } catch {
      setErrors((e) => ({ ...e, location: 'Your location could not be found. Leave it out; the address is enough.' }));
    } finally {
      setLocating(false);
    }
  }

  async function post() {
    if (!d || !session) return;
    setErrors({});
    setNotice(null);

    const early: Record<string, string> = {};
    if (!d.trade) early.trade = 'Choose what kind of work it is.';
    if (!d.sector) early.sector = 'Choose your sector.';
    if (!d.street.trim()) early.street = 'Write your street.';
    if (!d.house.trim()) early.house = 'Write your house number.';
    if (d.media.length === 0 && d.description.trim().length < 10) early.media = 'Show us what is wrong: a voice note, a video, a photo, or a few words.';
    if (Object.keys(early).length) {
      setErrors(early);
      setNotice('Please fix what is marked above.');
      return;
    }

    setBusy(true);
    let media = d.media;
    try {
      for (let i = 0; i < media.length; i += 1) {
        if (media[i].path) continue;
        const label = media[i].kind === 'voice' ? 'voice note' : media[i].kind;
        setProgress(`Sending the ${label}… ${i + 1} of ${media.length}`);
        const path = await upload(media[i], session.user.id);
        media = media.map((m, j) => (j === i ? { ...m, path } : m));
        update({ media });
      }
    } catch (e) {
      setBusy(false);
      setProgress(null);
      setNotice(e instanceof Error && e.message === 'big' ? 'That video is too big to send. Record a shorter one.' : 'Sending did not finish. Check your signal and press Post again: what was already sent is kept.');
      return;
    }

    setProgress('Posting…');
    const r = await ask<{ id: string; ref: string }>('post_job', {
      p_trade: d.trade,
      p_job_type: d.jobType,
      p_description: d.description,
      p_offer_paisa: offer,
      p_when_kind: d.whenKind,
      p_when_part: d.whenKind === 'now' ? null : d.whenPart,
      p_sector: d.sector,
      p_street: d.street,
      p_house: d.house,
      p_landmark: d.landmark,
      p_lat: d.lat,
      p_lng: d.lng,
      p_power: d.trade && NEEDS_POWER.has(d.trade) ? d.power : null,
      p_parts: d.parts,
      p_gate_note: d.gateNote,
      p_media: media.map((m) => ({ kind: m.kind, path: m.path, seconds: m.seconds ?? null })),
    });
    setBusy(false);
    setProgress(null);
    if (!r.ok) {
      if (r.field) setErrors({ [r.field]: r.why });
      setNotice(r.field ? 'Please fix what is marked above.' : r.why);
      return;
    }
    AsyncStorage.setItem(
      LAST_ADDRESS,
      JSON.stringify({ sector: d.sector, street: d.street, house: d.house, landmark: d.landmark, gateNote: d.gateNote }),
    ).catch(() => {});
    clearDraft();
    // Straight to the job's own live screen, the way a ride app goes to the
    // search — on top of home, so Back from it is home, not the empty form.
    const live = { pathname: '/job/[id]', params: d.askFor ? { id: r.id, asked: d.askFor.name } : { id: r.id } } as const;
    if (router.canDismiss()) {
      router.dismissAll();
      router.push(live);
    } else router.replace(live);
  }

  const zone = !chosen?.list_paisa
    ? 'There is no fixed price for this. Technicians may reply with their own.'
    : offer < chosen.list_paisa * 0.8
      ? 'Low. Fewer technicians will take it at this price.'
      : offer <= chosen.list_paisa * 1.2
        ? 'Fair. Close to the Pechkas website price.'
        : 'Generous. You should hear back quickly.';
  const live = lists?.live_sectors ?? [];
  const notYet = (lists?.sectors ?? []).filter((x) => !live.includes(x));
  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;

  return (
    <Screen
      hero={{ title: 'Post a job', sub: 'Six short steps. Saved on your phone as you go.', back: true }}
      footer={<Button label={progress ?? 'Post job'} onPress={post} busy={busy && !progress} disabled={busy} />}
    >

      {d.askFor ? (
        <View style={s.askFor}>
          <Text style={s.askForTitle}>Asking {d.askFor.name} first</Text>
          <Text style={s.askForText}>
            {d.askFor.name} sees this {tradeName(d.askFor.trade)} job first, for {d.askFor.minutes} minutes. Then every checked technician can
            send an offer. If he is not working right now, it goes to everyone straight away.
          </Text>
          <Press onPress={forgetAsk} accessibilityRole="button" style={s.askForLink}>
            <Text style={s.askForLinkText}>Ask everyone instead</Text>
          </Press>
        </View>
      ) : null}

      <Section n={1} title="What needs fixing?" error={errors.trade || errors.job_type}>
        <View style={s.wrap}>
          {(lists?.trades ?? []).map((t) => (
            <Chip key={t.slug} label={t.name} on={d.trade === t.slug} onPress={() => chooseTrade(t.slug)} />
          ))}
        </View>
        {d.trade ? (
          <View style={s.types}>
            {types.map((t) => (
              <TypeRow key={t.id} name={t.name} price={t.list_paisa} on={d.jobType === t.id} onPress={() => update({ jobType: t.id, offer: t.list_paisa ?? null })} />
            ))}
            <TypeRow name="Something else, or not sure" price={null} on={d.jobType === null} onPress={() => update({ jobType: null })} />
          </View>
        ) : null}
      </Section>

      <Section n={2} title="Show us" hint="A voice note or a short video says more than typing." error={errors.media}>
        <VoiceNote value={voice} onChange={(m) => setMedia('voice', m ? [m] : [])} onProblem={setNotice} />
        {video ? (
          <View style={s.fileRow}>
            <View style={[s.thumb, { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="video" size={22} color={colour.yellow} strokeWidth={2} />
            </View>
            <Text style={s.fileText}>Video{video.seconds ? ` · 0:${String(video.seconds).padStart(2, '0')}` : ''}</Text>
            <Remove label="Delete the video" onPress={() => setMedia('video', [])} />
          </View>
        ) : (
          <View style={s.twoUp}>
            <Small icon="video" label="Record a video" onPress={() => addVideo(true)} />
            <Small icon="jobs" label="Choose a video" onPress={() => addVideo(false)} />
          </View>
        )}
        {photos.length ? (
          <View style={s.photos}>
            {photos.map((p, i) => (
              <View key={p.uri} style={s.photoBox}>
                <Image source={{ uri: p.uri }} style={s.photo} accessibilityLabel={`Photo ${i + 1}`} />
                <Press onPress={() => setMedia('photo', photos.filter((x) => x !== p))} accessibilityRole="button" accessibilityLabel={`Delete photo ${i + 1}`} style={s.photoX}>
                  <Text style={s.photoXText}>×</Text>
                </Press>
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < LIMITS.photos ? (
          <View style={s.twoUp}>
            <Small icon="cctv" label="Take a photo" onPress={() => addPhoto(true)} />
            <Small icon="jobs" label="Choose a photo" onPress={() => addPhoto(false)} />
          </View>
        ) : null}
        <Field
          label="Or write it (optional)"
          value={d.description}
          onChangeText={(v) => update({ description: v })}
          placeholder="Blows air but it is not cold"
          multiline
          maxLength={500}
          style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }}
          error={errors.description}
        />
      </Section>

      <Section n={3} title="Where" hint={live.length ? `Pechkas works in ${live.join(', ')} for now.` : undefined} error={errors.sector}>
        <View style={s.wrap}>
          {live.map((name) => (
            <Chip key={name} label={name} on={d.sector === name} onPress={() => update({ sector: name })} />
          ))}
        </View>
        <Field label="Street" value={d.street} onChangeText={(v) => update({ street: v })} placeholder="Street 34" error={errors.street} autoComplete="street-address" />
        <Field
          label="House number"
          value={d.house}
          onChangeText={(v) => update({ house: v })}
          placeholder="House 12"
          error={errors.house}
          hint="Only the technician you choose will see this."
        />
        <Field label="Landmark (optional)" value={d.landmark} onChangeText={(v) => update({ landmark: v })} placeholder="Behind the markaz mosque" maxLength={120} error={errors.landmark} />
        {/* With a map: pin the house by moving the map. Without one: the phone's own position. */}
        {d.lat !== null && d.lng !== null && withMap ? (
          <View style={{ gap: 8 }}>
            <MapBox center={{ latitude: d.lat, longitude: d.lng }} pin={{ latitude: d.lat, longitude: d.lng }} zoom={0.004} style={s.mapPreview} />
            <View style={s.fileRow}>
              <Icon name="pin" size={20} strokeWidth={2} />
              <Text style={s.fileText}>Your house is pinned on the map</Text>
              <Press onPress={() => setPicking(true)} accessibilityRole="button" style={s.change}>
                <Text style={s.changeText}>Change</Text>
              </Press>
              <Remove label="Remove the pin" onPress={() => update({ lat: null, lng: null, accuracy: null })} />
            </View>
          </View>
        ) : d.lat !== null ? (
          <View style={s.fileRow}>
            <Icon name="pin" size={20} strokeWidth={2} />
            <Text style={s.fileText}>Your location is added{d.accuracy ? ` (within ${Math.round(d.accuracy)} m)` : ''}</Text>
            <Remove label="Remove the location" onPress={() => update({ lat: null, lng: null, accuracy: null })} />
          </View>
        ) : withMap ? (
          <Button kind="outline" icon="pin" label="Pin my house on the map" onPress={() => setPicking(true)} />
        ) : (
          <Button kind="outline" label={locating ? 'Finding you…' : 'Add my exact location'} onPress={locate} busy={locating} />
        )}
        {errors.location ? <Text style={s.error}>{errors.location}</Text> : null}
        {asked ? (
          <View style={s.asked} accessibilityRole="alert">
            <Text style={s.askedTitle}>Thank you. We have counted you in {asked}.</Text>
            <Text style={s.line}>
              Pechkas does not work in {asked} yet, so a job cannot be posted there: nobody could honestly be promised. Knowing where people
              need us helps decide where to go next.
            </Text>
          </View>
        ) : elsewhere ? (
          <View style={{ gap: 8 }}>
            <Text style={s.hint}>Tap your sector. It tells Pechkas you need {d.trade ? tradeName(d.trade) : 'this'} there. Nothing else is sent.</Text>
            <View style={s.wrap}>
              {notYet.map((name) => (
                <Chip key={name} label={asking === name ? 'Sending…' : name} on={false} onPress={() => askForSector(name)} />
              ))}
            </View>
            {errors.elsewhere ? <Text style={s.error}>{errors.elsewhere}</Text> : null}
          </View>
        ) : (
          <Press onPress={() => setElsewhere(true)} accessibilityRole="button" style={s.askForLink}>
            <Text style={s.elsewhereText}>My sector is not listed</Text>
          </Press>
        )}
      </Section>

      <Section n={4} title="When" error={errors.when}>
        <View style={s.wrap}>
          <Chip label="Now" on={d.whenKind === 'now'} onPress={() => update({ whenKind: 'now', whenPart: null })} />
          <Chip label="Today" on={d.whenKind === 'today'} onPress={() => update({ whenKind: 'today', whenPart: d.whenPart ?? 'evening' })} />
          <Chip label="Tomorrow" on={d.whenKind === 'tomorrow'} onPress={() => update({ whenKind: 'tomorrow', whenPart: d.whenPart ?? 'morning' })} />
        </View>
        {d.whenKind !== 'now' ? (
          <View style={s.wrap}>
            {PARTS_OF_DAY.map(([k, label]) => (
              <Chip key={k} label={label} on={d.whenPart === k} onPress={() => update({ whenPart: k })} />
            ))}
          </View>
        ) : null}
      </Section>

      <Section n={5} title="Good to know">
        {d.trade && NEEDS_POWER.has(d.trade) ? (
          <View style={s.wrap}>
            <Chip label="Electricity is on now" on={d.power === 'on'} onPress={() => update({ power: d.power === 'on' ? null : 'on' })} />
            <Chip label="Load-shedding right now" on={d.power === 'off'} onPress={() => update({ power: d.power === 'off' ? null : 'off' })} />
          </View>
        ) : null}
        <View style={s.wrap}>
          <Chip label="The technician brings parts; I pay the shop receipt" on={d.parts === 'pro_buys'} onPress={() => update({ parts: d.parts === 'pro_buys' ? null : 'pro_buys' })} />
          <Chip label="I already have the part" on={d.parts === 'customer_has'} onPress={() => update({ parts: d.parts === 'customer_has' ? null : 'customer_has' })} />
        </View>
        <Field label="Note for the gate (optional)" value={d.gateNote} onChangeText={(v) => update({ gateNote: v })} placeholder="The guard will open the gate. Please ring twice." maxLength={120} error={errors.gate_note} />
      </Section>

      <View style={s.offer}>
        <View style={s.offerTop}>
          <Text style={s.offerLabel}>6 · Your offer</Text>
          {chosen?.list_paisa ? <Text style={s.offerList}>Pechkas website price: {rupees(chosen.list_paisa)}</Text> : null}
        </View>
        <View style={s.offerRow}>
          <Press
            onPress={() => update({ offer: Math.max(min, offer - 10000) })}
            sink={0.9}
            accessibilityRole="button"
            accessibilityLabel="Lower by Rs 100"
            style={[s.step, offer <= min && { opacity: 0.4 }]}
          >
            <Text style={[s.stepText, { color: colour.paper }]}>−</Text>
          </Press>
          <Text style={s.price} accessibilityLiveRegion="polite">
            {rupees(offer)}
          </Text>
          <Press onPress={() => update({ offer: Math.min(50000000, offer + 10000) })} sink={0.9} accessibilityRole="button" accessibilityLabel="Raise by Rs 100" style={[s.step, s.stepPlus]}>
            <Text style={s.stepText}>+</Text>
          </Press>
        </View>
        <Text style={s.zone}>{zone}</Text>
        <Text style={s.min}>Lowest offer: {rupees(min)}, what it costs for somebody to come and look.</Text>
        {lists?.visit_fee_min_paisa && lists.visit_fee_max_paisa ? (
          <Text style={s.min}>
            If the job turns out bigger, the technician must ask you a new price in the app. Say no, and you pay only a visit fee for
            his petrol: {rupees(lists.visit_fee_min_paisa)} to {rupees(lists.visit_fee_max_paisa)}.
          </Text>
        ) : null}
        {errors.offer ? <Text style={[s.error, { color: '#ffd2c6' }]}>{errors.offer}</Text> : null}
      </View>

      <Body muted>You pay the technician after the job, in cash or by JazzCash or Easypaisa. Nothing in advance.</Body>
      <Notice text={notice} />
      {picking ? (
        <PinPicker
          start={d.lat !== null && d.lng !== null ? { latitude: d.lat, longitude: d.lng } : ISLAMABAD}
          onCancel={() => setPicking(false)}
          onConfirm={(p) => {
            update({ lat: p.latitude, lng: p.longitude, accuracy: null });
            setPicking(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

function Section({ n, title, hint, error, children }: { n: number; title: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">
        {n} · {title}
      </Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function TypeRow({ name, price, on, onPress }: { name: string; price: number | null; on: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.type, on && s.typeOn]}>
      <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
      <Text style={s.typeName}>{name}</Text>
      <Text style={s.typePrice}>{price ? rupees(price) : 'Price after a look'}</Text>
    </Press>
  );
}

function Small({ icon, label, onPress }: { icon: 'video' | 'jobs' | 'cctv'; label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={s.small}>
      <Icon name={icon} size={18} strokeWidth={2} />
      <Text style={s.smallText}>{label}</Text>
    </Press>
  );
}

function Remove({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} sink={0.94} accessibilityRole="button" accessibilityLabel={label} style={s.remove}>
      <Text style={s.removeText}>Delete</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  mapPreview: { height: 150, borderRadius: 18 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  changeText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green, textDecorationLine: 'underline' },
  section: { gap: 10, paddingTop: 6 },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 18, color: colour.ink },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel, marginTop: -4 },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.brick },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  types: { borderRadius: radius.big, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule, overflow: 'hidden' },
  type: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colour.rule },
  typeOn: { backgroundColor: colour.greenSoft },
  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(20,23,26,0.35)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colour.green },
  radioDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: colour.green },
  typeName: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 19, color: colour.ink },
  typePrice: { fontFamily: font.bodySemi, fontSize: 13, color: colour.green },
  twoUp: { flexDirection: 'row', gap: 10 },
  small: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(20,23,26,0.18)' },
  smallText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.big, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule },
  fileText: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoBox: { width: 76, height: 76 },
  photo: { width: 76, height: 76, borderRadius: 12, backgroundColor: colour.paper2 },
  photoX: { position: 'absolute', top: -10, right: -10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  photoXText: { width: 26, height: 26, borderRadius: 999, backgroundColor: colour.ink, color: colour.paper, textAlign: 'center', lineHeight: 25, fontFamily: font.bodySemi, fontSize: 18 },
  remove: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  askFor: { gap: 6, padding: 14, borderRadius: radius.big, backgroundColor: colour.greenSoft },
  askForTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.greenDark },
  askForText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  askForLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  askForLinkText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.greenDark, textDecorationLine: 'underline' },
  elsewhereText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink, textDecorationLine: 'underline' },
  asked: { gap: 6, padding: 14, borderRadius: radius.big, backgroundColor: colour.white, borderWidth: 1, borderColor: colour.rule },
  askedTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  offer: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: colour.green, marginTop: 6 },
  offerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  offerLabel: { fontFamily: font.bodySemi, fontSize: 13, color: colour.yellow },
  offerList: { fontFamily: font.body, fontSize: 12, color: colour.paper },
  offerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { width: 52, height: 52, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(250,246,239,0.4)', alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 26, color: colour.ink, marginTop: -2 },
  price: { fontFamily: font.display, fontSize: 40, color: colour.paper, letterSpacing: -1 },
  zone: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.paper },
  min: { fontFamily: font.body, fontSize: 12, lineHeight: 17, color: 'rgba(250,246,239,0.85)' },
});
