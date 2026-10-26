import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ISLAMABAD, MapBox, mapsReady, PinPicker } from '../src/components/Map';
import { rupees } from '@pechkas/shared';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Button, Chip, Field, Loading, Notice, Screen, useScreenScroll } from '../src/components/ui';
import { Sheet, SheetOption } from '../src/components/Sheet';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { ask, supabase } from '../src/supabase';
import { clearDraft, EMPTY, loadDraft, saveDraft, type Draft } from '../src/post/draft';
import { afterSheet, clock, detailOf, LIMITS, recoverLostPick, takePhoto, takeVideo, tooBigWords, upload, type Media } from '../src/post/media';
import { tile, VoicePlayback, VoiceTile } from '../src/post/VoiceNote';
import { colour, font, radius } from '../src/theme';

/**
 * Posting a job: what is broken, shown rather than typed, where, when, and the
 * price the customer offers. One page in white cards, the owner's choice
 * over a page per step: two drop-downs for the job, one row of tiles to show
 * it, the address, when, and the price, with Post job always at the foot.
 *
 * The form is saved on the phone as it is filled in, files are uploaded only
 * when Post is pressed, and the database checks everything again — this page
 * runs in a stranger's phone and anything it sends can be changed.
 */

// Trades where whether the electricity is on decides if the visit is wasted.
const NEEDS_POWER = new Set(['ac', 'electrician', 'ups', 'solar', 'appliances', 'cctv', 'wifi', 'computers']);
const LAST_ADDRESS = 'pechkas.last-address';
// Every refusal this form can show beside its own box, and the card it is in,
// top to bottom: a refusal scrolls the page up to the first of them.
const CARD_OF: Record<string, string> = {
  trade: 'job', job_type: 'job',
  media: 'what', description: 'what',
  sector: 'address', street: 'address', house: 'address', landmark: 'address', gate_note: 'address', location: 'address',
  when: 'when',
  power: 'good', parts: 'good',
  offer: 'price',
};
const CARDS = ['job', 'what', 'address', 'when', 'good', 'price'];
// Which refusals a change to each part of the form answers.
const ANSWERS: Partial<Record<keyof Draft, string[]>> = {
  trade: ['trade', 'job_type'], jobType: ['job_type'],
  media: ['media'], description: ['media', 'description'],
  sector: ['sector'], street: ['street'], house: ['house'], landmark: ['landmark'], gateNote: ['gate_note'],
  whenKind: ['when'], whenPart: ['when'], power: ['power'], parts: ['parts'], offer: ['offer'],
};
const SHOWN = new Set(Object.keys(CARD_OF).filter((k) => k !== 'location'));
const FIX = 'Some details are missing. They are marked in red.';
// The database keeps an "ask again" for an hour (job_preferred()); so does the form.
const ASK_LASTS = 60 * 60 * 1000;
const PARTS_OF_DAY = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
] as const;

export default function Post() {
  const params = useLocalSearchParams<{ trade?: string; start?: string; ask?: string; minutes?: string; lat?: string; lng?: string }>();
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
  // Which drop-down is open, if any.
  const [sheet, setSheet] = useState<null | 'trade' | 'type' | 'video' | 'photo'>(null);
  const [more, setMore] = useState(false);
  // Where each card sits, and a request to scroll to one (see Jump).
  const ys = useRef<Record<string, number>>({}).current;
  const atY = (id: string, y: number) => (ys[id] = y);
  const [jump, setJump] = useState<{ card: string; n: number } | null>(null);
  /** Show the refusals, and take the person to the first box that needs them. */
  const refuse = (errs: Record<string, string>) => {
    setErrors(errs);
    const card = CARDS.find((c) => Object.keys(errs).some((k) => errs[k] && CARD_OF[k] === c));
    if (card) setJump((j) => ({ card, n: (j?.n ?? 0) + 1 }));
  };
  const { width } = useWindowDimensions();
  // Where the home map was when "Set the job's address" was tapped, if the phone had been found.
  const fromHome = Number.isFinite(Number(params.lat)) && Number.isFinite(Number(params.lng)) && params.lat && params.lng
    ? { latitude: Number(params.lat), longitude: Number(params.lng) }
    : null;
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

  /**
   * Media is changed from the newest copy of the form, never from the one the
   * screen had when the camera opened: the camera can take a minute, and a
   * voice note recorded or a photo recovered in the meantime must survive.
   */
  const changeMedia = (fn: (all: Media[]) => Media[]) => {
    setNotice(null);
    setErrors((e) => (e.media || e.description ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'media')) : e));
    setD((prev) => {
      const next = { ...(prev ?? EMPTY), media: fn((prev ?? EMPTY).media) };
      saveDraft(next);
      return next;
    });
  };

  const update = (patch: Partial<Draft>) => {
    // Any change answers the last complaint; do not leave it on screen.
    setNotice(null);
    // And the red line under the box just filled in goes with it.
    const answered = Object.keys(patch).flatMap((k) => ANSWERS[k as keyof Draft] ?? []);
    if (answered.length) setErrors((e) => (answered.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !answered.includes(k))) : e));
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

  // A photo or video Android kept when it closed the app while the camera was open.
  const recovered = useRef(false);
  useEffect(() => {
    if (!d || recovered.current) return;
    recovered.current = true;
    recoverLostPick()
      .then((m) => {
        if (!m) return;
        changeMedia((all) =>
          m.kind === 'photo'
            ? all.filter((x) => x.kind === 'photo').length >= LIMITS.photos
              ? all
              : [...all, m]
            : [...all.filter((x) => x.kind !== m.kind), m],
        );
      })
      .catch((e) => setNotice(tooBigWords(e) ?? (e instanceof Error && e.message === 'long' ? `Keep the video under ${LIMITS.videoSeconds} seconds.` : null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // "Say it" and "Show it" on the home screen open the right recorder.
  useEffect(() => {
    if (!d || opened.current || !session) return;
    opened.current = true;
    if (params.start === 'video' && !d.media.some((m) => m.kind === 'video')) addVideo(true);
    // "Set the job's address" on the home map: straight to the pin, where the map was.
    if (params.start === 'pin' && mapsReady()) setPicking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, session]);

  if (!ready || !d) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (!account?.role) return <Redirect href={{ pathname: '/welcome', params: { as: 'customer', next: 'post' } }} />;
  if (account.role === 'pro') return <Redirect href="/pro" />;

  const voice = d.media.find((m) => m.kind === 'voice') ?? null;
  const video = d.media.find((m) => m.kind === 'video') ?? null;
  const photos = d.media.filter((m) => m.kind === 'photo');
  const setMedia = (kind: Media['kind'], items: Media[]) => changeMedia((all) => [...all.filter((m) => m.kind !== kind), ...items]);

  function problem(e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'camera') setNotice('Pechkas needs the camera for this. Allow it in your phone settings.');
    else if (msg === 'photos') setNotice('Pechkas needs your photos for this. Allow it in your phone settings.');
    else if (msg === 'long') setNotice(`That video is longer than ${LIMITS.videoSeconds} seconds. Choose or record a shorter one: the camera stops by itself at ${LIMITS.videoSeconds} seconds.`);
    else if (tooBigWords(e)) setNotice(tooBigWords(e));
    else setNotice(`That did not work. Please try again. (Details: ${detailOf(e)})`);
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
      if (m) changeMedia((all) => (all.filter((x) => x.kind === 'photo').length >= LIMITS.photos ? all : [...all, m]));
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
      refuse(early);
      setNotice(FIX);
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
      setNotice(tooBigWords(e) ?? 'Sending did not finish. Check your signal and press Post again: what was already sent is kept.');
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
      // A refusal about a box on the form is shown beside it; any other is shown here, in full.
      const shown = r.field && SHOWN.has(r.field);
      if (shown) refuse({ [r.field!]: r.why });
      setNotice(shown ? FIX : r.why);
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
  // The landmark and the gate note are tucked away until wanted — or until they hold something.
  const extrasOpen = more || Boolean(d.landmark || d.gateNote || errors.landmark || errors.gate_note);
  const pinned = d.lat !== null && d.lng !== null;

  return (
    <Screen
      hero={{ title: 'Post a job', back: true }}
      footer={<Button label={progress ?? `Post job · ${rupees(offer)}`} onPress={post} busy={busy && !progress} disabled={busy} />}
    >
      {d.askFor ? (
        <View style={s.askFor}>
          <Text style={s.askForTitle}>Asking {d.askFor.name} first</Text>
          <Text style={s.askForText}>
            {d.askFor.name} sees this {tradeName(d.askFor.trade)} job first, for {d.askFor.minutes} minutes. Then every checked technician can
            send an offer. If he is not working right now, it goes to everyone straight away.
          </Text>
          <Press onPress={forgetAsk} accessibilityRole="button" style={s.link}>
            <Text style={s.linkGreen}>Ask everyone instead</Text>
          </Press>
        </View>
      ) : null}

      <Card id="job" onY={atY} title="The job" error={errors.trade || errors.job_type}>
        <Select label="Kind of work" value={d.trade ? tradeName(d.trade) : null} placeholder="Choose" onPress={() => setSheet('trade')} />
        {d.trade ? (
          <Select
            label="Which job"
            value={chosen?.name ?? 'Something else, or not sure'}
            right={chosen?.list_paisa ? rupees(chosen.list_paisa) : 'Price after a look'}
            onPress={() => setSheet('type')}
          />
        ) : null}
      </Card>

      <Card id="what" onY={atY} title="What is wrong?" hint="Say it, show it, or type it. Urdu is fine." error={errors.media || errors.description}>
        {!voice || !video || photos.length < LIMITS.photos ? (
          <View style={s.tiles}>
            {voice ? null : <VoiceTile onDone={(m) => setMedia('voice', [m])} onProblem={setNotice} />}
            {video ? null : <MediaTile icon="video" label="Video" limit={`Up to ${LIMITS.videoSeconds} sec`} onPress={() => setSheet('video')} />}
            {photos.length < LIMITS.photos ? (
              <MediaTile icon="camera" label={photos.length ? 'Add photo' : 'Photo'} limit={photos.length ? `${LIMITS.photos - photos.length} more` : `Up to ${LIMITS.photos}`} onPress={() => setSheet('photo')} />
            ) : null}
          </View>
        ) : null}
        {voice ? <VoicePlayback media={voice} onRemove={() => setMedia('voice', [])} /> : null}
        {video ? (
          <View style={s.fileRow}>
            <View style={s.thumb}>
              <Icon name="video" size={22} color={colour.yellow} strokeWidth={2} />
            </View>
            <Text style={s.fileText}>Video{video.seconds ? ` · ${clock(video.seconds)} of ${clock(LIMITS.videoSeconds)}` : ''}</Text>
            <Remove label="Delete the video" onPress={() => setMedia('video', [])} />
          </View>
        ) : null}
        {photos.length ? (
          <View style={s.photos}>
            {photos.map((p, i) => (
              <View key={p.uri} style={s.photoBox}>
                <Image source={{ uri: p.uri }} style={s.photo} accessibilityLabel={`Photo ${i + 1}`} />
                <Press onPress={() => setMedia('photo', photos.filter((x) => x !== p))} accessibilityRole="button" accessibilityLabel={`Delete photo ${i + 1}`} style={s.photoX}>
                  <View style={s.photoXDot}>
                    <Icon name="cross" size={14} color={colour.paper} strokeWidth={2.6} />
                  </View>
                </Press>
              </View>
            ))}
          </View>
        ) : null}
        <TextInput
          value={d.description}
          onChangeText={(v) => update({ description: v })}
          placeholder="Or type a few words: it blows air but is not cold"
          placeholderTextColor="#7a838a"
          multiline
          maxLength={500}
          accessibilityLabel="Or type what is wrong"
          style={s.words}
        />
      </Card>

      <Card
        id="address"
        onY={atY}
        title="Address"
        hint={live.length ? `Pechkas works in ${live.join(', ')} for now. Only the technician you choose sees your street and house.` : 'Only the technician you choose sees your street and house.'}
      >
        <View style={s.wrap}>
          {live.map((name) => (
            <Chip key={name} label={name} on={d.sector === name} onPress={() => update({ sector: name })} />
          ))}
        </View>
        {/* Right under the sectors, not at the foot of the card, so it is beside what it is about. */}
        {errors.sector ? <Text style={s.error}>{errors.sector}</Text> : null}
        <View style={s.pair}>
          <View style={{ flex: 1 }}>
            <Field label="Street" value={d.street} onChangeText={(v) => update({ street: v })} placeholder="Street 34" error={errors.street} autoComplete="street-address" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="House" value={d.house} onChangeText={(v) => update({ house: v })} placeholder="House 12" error={errors.house} />
          </View>
        </View>
        {/* With a map: pin the house by moving the map. Without one: the phone's own position. */}
        {pinned && withMap ? (
          <View style={{ gap: 8 }}>
            <MapBox center={{ latitude: d.lat!, longitude: d.lng! }} pin={{ latitude: d.lat!, longitude: d.lng! }} zoom={0.004} style={s.mapPreview} />
            <View style={s.fileRow}>
              <Icon name="pin" size={20} strokeWidth={2} />
              <Text style={s.fileText}>Pinned on the map</Text>
              <Press onPress={() => setPicking(true)} accessibilityRole="button" style={s.change}>
                <Text style={s.changeText}>Change</Text>
              </Press>
              <Remove label="Remove the pin" onPress={() => update({ lat: null, lng: null, accuracy: null })} />
            </View>
          </View>
        ) : pinned ? (
          <View style={s.fileRow}>
            <Icon name="pin" size={20} strokeWidth={2} />
            <Text style={s.fileText}>Location added{d.accuracy ? ` (within ${Math.round(d.accuracy)} m)` : ''}</Text>
            <Remove label="Remove the location" onPress={() => update({ lat: null, lng: null, accuracy: null })} />
          </View>
        ) : withMap ? (
          <LinkRow icon="pin" label="Pin my house on the map" onPress={() => setPicking(true)} />
        ) : (
          <LinkRow icon="locate" label={locating ? 'Finding you…' : 'Add my exact location'} onPress={locating ? undefined : locate} />
        )}
        {errors.location ? <Text style={s.error}>{errors.location}</Text> : null}
        {extrasOpen ? (
          <>
            <Field label="Landmark (optional)" value={d.landmark} onChangeText={(v) => update({ landmark: v })} placeholder="Behind the markaz mosque" maxLength={120} error={errors.landmark} />
            <Field label="Note for the gate (optional)" value={d.gateNote} onChangeText={(v) => update({ gateNote: v })} placeholder="The guard will open. Please ring twice." maxLength={120} error={errors.gate_note} />
          </>
        ) : (
          <LinkRow icon="doc" label="Add a landmark or a note for the gate" onPress={() => setMore(true)} />
        )}
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
          <Press onPress={() => setElsewhere(true)} accessibilityRole="button" style={s.link}>
            <Text style={s.linkInk}>My sector is not listed</Text>
          </Press>
        )}
      </Card>

      <Card id="when" onY={atY} title="When" error={errors.when}>
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
      </Card>

      <Card id="good" onY={atY} title="Good to know" hint="Optional. Tap what is true." error={errors.power || errors.parts}>
        {d.trade && NEEDS_POWER.has(d.trade) ? (
          <View style={s.wrap}>
            <Chip label="Electricity is on" on={d.power === 'on'} onPress={() => update({ power: d.power === 'on' ? null : 'on' })} />
            <Chip label="Load-shedding now" on={d.power === 'off'} onPress={() => update({ power: d.power === 'off' ? null : 'off' })} />
          </View>
        ) : null}
        <View style={s.wrap}>
          <Chip label="He brings parts, I pay the receipt" on={d.parts === 'pro_buys'} onPress={() => update({ parts: d.parts === 'pro_buys' ? null : 'pro_buys' })} />
          <Chip label="I have the part" on={d.parts === 'customer_has'} onPress={() => update({ parts: d.parts === 'customer_has' ? null : 'customer_has' })} />
        </View>
      </Card>

      <Card id="price" onY={atY} title="Your price" error={errors.offer}>
        <View style={s.offerRow}>
          <Press
            onPress={() => update({ offer: Math.max(min, offer - 10000) })}
            sink={0.9}
            accessibilityRole="button"
            accessibilityLabel="Lower by Rs 100"
            style={[s.step, offer <= min && { opacity: 0.4 }]}
          >
            <Text style={s.stepText}>−</Text>
          </Press>
          <Text style={[s.price, width < 360 && { fontSize: 30 }]} numberOfLines={1} accessibilityLiveRegion="polite">
            {rupees(offer)}
          </Text>
          <Press onPress={() => update({ offer: Math.min(50000000, offer + 10000) })} sink={0.9} accessibilityRole="button" accessibilityLabel="Raise by Rs 100" style={[s.step, s.stepPlus]}>
            <Text style={s.stepText}>+</Text>
          </Press>
        </View>
        <Text style={s.zone}>{zone}</Text>
        <Text style={s.small}>
          {chosen?.list_paisa ? `Website price ${rupees(chosen.list_paisa)} · ` : ''}Lowest offer {rupees(min)}, the cost of coming to look.
        </Text>
        {lists?.visit_fee_min_paisa && lists.visit_fee_max_paisa ? (
          <Text style={s.small}>
            If the job turns out bigger, he must ask you a new price in the app. Say no, and you pay only a visit fee for his petrol:{' '}
            {rupees(lists.visit_fee_min_paisa)} to {rupees(lists.visit_fee_max_paisa)}.
          </Text>
        ) : null}
        <Text style={s.small}>You pay after the job, in cash or by JazzCash or Easypaisa. Nothing in advance.</Text>
      </Card>

      {/* A new key each refusal, so the same sentence comes back after its banner was closed. */}
      <Notice key={jump?.n ?? 0} text={notice} />
      <Jump to={jump} ys={ys} />

      {sheet === 'trade' ? (
        <Sheet title="Kind of work" onClose={() => setSheet(null)}>
          {(lists?.trades ?? []).map((t) => (
            <SheetOption
              key={t.slug}
              label={t.name}
              on={d.trade === t.slug}
              onPress={() => {
                chooseTrade(t.slug);
                // Straight on to which job: the next thing anybody has to answer.
                setSheet('type');
              }}
            />
          ))}
        </Sheet>
      ) : null}
      {sheet === 'type' && d.trade ? (
        <Sheet title={tradeName(d.trade)} onClose={() => setSheet(null)}>
          {types.map((t) => (
            <SheetOption
              key={t.id}
              label={t.name}
              right={t.list_paisa ? rupees(t.list_paisa) : 'Price after a look'}
              on={d.jobType === t.id}
              onPress={() => {
                update({ jobType: t.id, offer: t.list_paisa ?? null });
                setSheet(null);
              }}
            />
          ))}
          <SheetOption
            label="Something else, or not sure"
            right="Price after a look"
            on={d.jobType === null}
            onPress={() => {
              update({ jobType: null });
              setSheet(null);
            }}
          />
        </Sheet>
      ) : null}
      {sheet === 'video' || sheet === 'photo' ? (
        <Sheet title={sheet === 'video' ? 'Add a video' : 'Add a photo'} onClose={() => setSheet(null)}>
          <SheetOption
            label={sheet === 'video' ? 'Record a video' : 'Take a photo'}
            sub={sheet === 'video' ? `Up to ${LIMITS.videoSeconds} seconds. The camera stops by itself when the time is up.` : undefined}
            icon={<Icon name="camera" size={22} color={colour.ink} strokeWidth={2} />}
            onPress={() => {
              const kind = sheet;
              setSheet(null);
              afterSheet(() => (kind === 'video' ? addVideo(true) : addPhoto(true)));
            }}
          />
          <SheetOption
            label="Choose from the gallery"
            sub={sheet === 'video' ? `A video up to ${LIMITS.videoSeconds} seconds long.` : undefined}
            icon={<Icon name="image" size={22} color={colour.ink} strokeWidth={2} />}
            onPress={() => {
              const kind = sheet;
              setSheet(null);
              afterSheet(() => (kind === 'video' ? addVideo(false) : addPhoto(false)));
            }}
          />
        </Sheet>
      ) : null}
      {picking ? (
        <PinPicker
          start={pinned ? { latitude: d.lat!, longitude: d.lng! } : fromHome ?? ISLAMABAD}
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

/** One part of the form: a white card with its title, and its own error at the foot. */
function Card({ id, onY, title, hint, error, children }: { id: string; onY: (id: string, y: number) => void; title: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={s.card} onLayout={(e) => onY(id, e.nativeEvent.layout.y)}>
      <View style={{ gap: 2 }}>
        <Text style={s.cardTitle} accessibilityRole="header">
          {title}
        </Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * Inside the Screen, where its scrolling can be reached: each time `to`
 * changes, the page scrolls up to that card.
 */
function Jump({ to, ys }: { to: { card: string; n: number } | null; ys: Record<string, number> }) {
  const scrollTo = useScreenScroll();
  useEffect(() => {
    if (to && ys[to.card] !== undefined) scrollTo(ys[to.card]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to?.n]);
  return null;
}

/** A drop-down: what is chosen, and a tap opens the choices in a sheet. */
function Select({ label, value, placeholder, right, onPress }: { label: string; value: string | null; placeholder?: string; right?: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? placeholder ?? ''}. Change`} sink={0.98} style={s.select}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.selectLabel}>{label}</Text>
        <Text style={[s.selectValue, !value && { color: colour.steel }]} numberOfLines={2}>
          {value ?? placeholder}
        </Text>
      </View>
      {right ? <Text style={s.selectRight}>{right}</Text> : null}
      <Icon name="chevronDown" size={20} color={colour.ink} strokeWidth={2.2} />
    </Press>
  );
}

function MediaTile({ icon, label, limit, onPress }: { icon: 'video' | 'camera'; label: string; limit: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${limit}`} sink={0.96} style={tile.box}>
      <View style={tile.dot}>
        <Icon name={icon} size={22} color={colour.ink} strokeWidth={2} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={tile.label}>{label}</Text>
        <Text style={tile.limit}>{limit}</Text>
      </View>
    </Press>
  );
}

/** A quiet optional step: an icon and words, the whole row to tap. */
function LinkRow({ icon, label, onPress }: { icon: 'pin' | 'locate' | 'doc'; label: string; onPress?: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" sink={0.98} style={s.linkRow}>
      <Icon name={icon} size={20} color={colour.green} strokeWidth={2} />
      <Text style={s.linkRowText}>{label}</Text>
      <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.2} />
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
  card: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: colour.white },
  cardTitle: { fontFamily: font.displayBold, fontSize: 18, color: colour.ink },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.brick },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colour.canvas },
  selectLabel: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  selectValue: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 21, color: colour.ink },
  selectRight: { fontFamily: font.bodySemi, fontSize: 13, color: colour.green, maxWidth: 110, textAlign: 'right' },
  tiles: { flexDirection: 'row', gap: 10 },
  words: { minHeight: 72, padding: 12, paddingTop: 12, borderRadius: 16, backgroundColor: colour.canvas, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink, textAlignVertical: 'top', outlineWidth: 0 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.big, backgroundColor: colour.canvas },
  fileText: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  thumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoBox: { width: 72, height: 72 },
  photo: { width: 72, height: 72, borderRadius: 12, backgroundColor: colour.paper2 },
  photoX: { position: 'absolute', top: -12, right: -12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  photoXDot: { width: 26, height: 26, borderRadius: 999, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  mapPreview: { height: 140, borderRadius: 16 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  changeText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green, textDecorationLine: 'underline' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  linkRowText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colour.green },
  remove: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  askFor: { gap: 6, padding: 14, borderRadius: radius.big, backgroundColor: colour.greenSoft },
  askForTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.greenDark },
  askForText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkGreen: { fontFamily: font.bodySemi, fontSize: 14, color: colour.greenDark, textDecorationLine: 'underline' },
  linkInk: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, textDecorationLine: 'underline' },
  asked: { gap: 6, padding: 14, borderRadius: radius.big, backgroundColor: colour.canvas },
  askedTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  offerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { width: 52, height: 52, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(20,23,26,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepPlus: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 26, color: colour.ink, marginTop: -2 },
  price: { flex: 1, textAlign: 'center', fontFamily: font.display, fontSize: 38, color: colour.ink, letterSpacing: -1 },
  zone: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.green, textAlign: 'center' },
  small: { fontFamily: font.body, fontSize: 12, lineHeight: 17, color: colour.steel },
});
