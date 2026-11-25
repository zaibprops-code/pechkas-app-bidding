import { VisitFeeNote } from '../src/customer/VisitFee';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { asapDay, DAY_OPENS_HOUR, pkNow, PRICE_STEP_PAISA, rupees } from '@pechkas/shared';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Button, Chip, Loading, Notice, Screen } from '../src/components/ui';
import { Sheet, SheetOption } from '../src/components/Sheet';
import { useAccount } from '../src/account';
import { useLists } from '../src/lists';
import { TradeArt } from '../src/components/TradeArt';
import { YellowTop } from '../src/components/YellowTop';
import { workArt } from '@pechkas/shared/src/work';
import { usePriceRanges } from '../src/prices';
import { PriceRangeCard } from '../src/components/PriceRange';
import { ask, supabase } from '../src/supabase';
import { clearDraft, EMPTY, freshWhen, loadDraft, saveDraft, type Draft } from '../src/post/draft';
import { loadPlaces, rememberPlace, type Place, type PlaceLabel } from '../src/post/places';
import { Where } from '../src/post/Where';
import { switchedOff, type Message } from '../src/message';
import { afterSheet, clock, detailOf, LIMITS, recoverLostPick, takePhoto, takeVideo, tooBigWords, upload, type Media } from '../src/post/media';
import { VoicePlayback, VoiceTile } from '../src/post/VoiceNote';
import { colour, font, radius, TAP } from '../src/theme';

/**
 * Posting a job, in three steps (the owner's design, 25 November 2026, after
 * "people do not like filling large forms"): one thing on each screen and
 * one black button at the foot.
 *
 *   1  Show us the problem: the big record button, photo and video; typing
 *      is a small link. One of them is required, as the database says.
 *   2  Where: the map fills the screen (src/post/Where.tsx). The street and
 *      sector are read from the pin; the house number is the only typing.
 *      Anywhere in Islamabad (Bahria Town and DHA count); elsewhere is said
 *      plainly and cannot be posted.
 *   3  Your price: starts at the usual price; − stops at the job's lowest
 *      (price_floor(), a share the office sets); always "as soon as
 *      possible" — there is no day to pick. Then Post job.
 *
 * The yellow top carries the job, its drawing and Change, and the steps. The
 * form is saved on the phone as it is filled in (step included), files are
 * uploaded only when Post is pressed, and the database checks everything
 * again: this page runs in a stranger's phone.
 */

// Trades where whether the electricity is on decides if the visit is wasted.
const NEEDS_POWER = new Set(['ac', 'electrician', 'ups', 'solar', 'appliances', 'cctv', 'wifi', 'computers']);
// Which step each refusal belongs to: a refusal takes her back there.
const STEP_OF: Record<string, 1 | 2 | 3> = {
  trade: 1, job_type: 1, media: 1, description: 1, power: 1, parts: 1,
  sector: 2, street: 2, house: 2, landmark: 2, gate_note: 2, location: 2,
  when: 3, offer: 3,
};
// Which refusals a change to each part of the form answers.
const ANSWERS: Partial<Record<keyof Draft, string[]>> = {
  trade: ['trade', 'job_type'], jobType: ['job_type'],
  media: ['media'], description: ['media', 'description'],
  sector: ['sector'], lat: ['location', 'sector'], street: ['street'], house: ['house'], landmark: ['landmark'], gateNote: ['gate_note'],
  power: ['power'], parts: ['parts'], offer: ['offer'],
};
// The database keeps an "ask again" for an hour (job_preferred()); so does the form.
const ASK_LASTS = 60 * 60 * 1000;

/** A video that cannot go as it is: too long or too big, said as a warning with a title. */
function videoTrouble(e: unknown): Message | null {
  const big = tooBigWords(e);
  if (big) return { tone: 'warning', title: 'That video is too big', text: big };
  if (e instanceof Error && e.message === 'long') {
    return {
      tone: 'warning',
      title: 'That video is too long',
      text: `Choose or record one under ${LIMITS.videoSeconds} seconds. Pechkas' camera stops by itself at ${LIMITS.videoSeconds} seconds.`,
    };
  }
  return null;
}

export default function Post() {
  const params = useLocalSearchParams<{ trade?: string; type?: string; start?: string; ask?: string; minutes?: string; again?: string }>();
  const { ready, session, account } = useAccount();
  const lists = useLists();
  const ranges = usePriceRanges();
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'trade' | 'type' | 'video' | 'photo' | 'pay'>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [saveAs, setSaveAs] = useState<PlaceLabel | null>(null);
  const [typing, setTyping] = useState(false);
  // From the price step, "change this" goes to its step and Next comes straight back.
  const [backToPrice, setBackToPrice] = useState(false);
  const [noticeKey, setNoticeKey] = useState(0);
  const opened = useRef(false);
  const { width } = useWindowDimensions();

  // Start from the draft on this phone, or from the address used last.
  useEffect(() => {
    (async () => {
      const saved = await loadDraft();
      const known = await loadPlaces();
      setPlaces(known);
      let next: Draft = saved ?? { ...EMPTY };
      // A new form starts at the address used last, pin and all; one tap changes it.
      if (!saved && known[0]) {
        next = { ...next, ...fromPlace(known[0]) };
        setSaveAs(known[0].label);
      }
      // "Book again" on a finished job: the same work and address, filled in. The
      // files belong to that visit, so they are left for her.
      if (params.again && supabase) {
        const { data } = await supabase.rpc('my_jobs');
        const old = Array.isArray(data) ? (data as Record<string, unknown>[]).find((j) => j.id === params.again) : null;
        if (old) {
          const hasPin = typeof old.lat === 'number' && typeof old.lng === 'number';
          next = {
            ...EMPTY,
            trade: old.trade as string,
            jobType: (old.job_type_id as number | null) ?? null,
            description: (old.description as string | null) ?? '',
            sector: old.sector as string,
            sectorRead: false,
            street: (old.street as string) ?? '',
            house: (old.house as string) ?? '',
            landmark: (old.landmark as string | null) ?? '',
            gateNote: (old.gate_note as string | null) ?? '',
            lat: hasPin ? (old.lat as number) : null,
            lng: hasPin ? (old.lng as number) : null,
            offer: (old.offered_paisa as number) ?? null,
          };
          saveDraft(next);
        }
      }
      // Arriving with the work chosen — from a kind of work's page or from
      // search: that job, or the trade with Something else when no job is named.
      const type = params.type && Number.isFinite(Number(params.type)) ? Number(params.type) : null;
      if (params.trade && !params.again && (params.trade !== next.trade || type !== (next.jobType ?? null))) {
        next = { ...next, trade: params.trade, jobType: type, offer: params.trade === next.trade ? next.offer : null, step: 1 };
        // Kept on the phone at once, so a job chosen before signing in is
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
      if (params.start === 'pin') next = { ...next, step: 2 };
      setTyping(Boolean(next.description));
      setD(freshWhen({ ...next, step: next.step ?? 1 }));
    })();
  }, [params.trade, params.type, params.ask, params.minutes, params.again, params.start]);

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

  const update = useCallback((patch: Partial<Draft>) => {
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
  }, []);

  const go = useCallback((step: 1 | 2 | 3) => update({ step }), [update]);

  // The phone's Back goes one step back, never out of the form by surprise.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) {
        setSheet(null);
        return true;
      }
      if (d && d.step > 1) {
        go((d.step - 1) as 1 | 2);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [d, sheet, go]);

  const types = useMemo(() => (lists && d?.trade ? lists.job_types.filter((t) => t.trade === d.trade) : []), [lists, d?.trade]);
  const chosen = types.find((t) => t.id === d?.jobType) ?? null;

  // D37: risky kinds of job are closed where nobody can do them yet. Asked
  // for once the sector is known; a closed kind says so and offers to tell her.
  const [closed, setClosed] = useState<{ trade: string; job_type_id: number | null; asked: boolean }[]>([]);
  const [telling, setTelling] = useState(false);
  const refreshClosed = useCallback(() => {
    if (!supabase || !d?.sector) return setClosed([]);
    supabase.rpc('job_types_closed', { p_sector: d.sector }).then(({ data, error }) => setClosed(error ? [] : ((data as typeof closed) ?? [])));
  }, [d?.sector]);
  useEffect(refreshClosed, [refreshClosed]);
  const isClosed = (trade: string | null | undefined, type: number | null) => closed.find((c) => c.trade === trade && c.job_type_id === type) ?? null;
  const closedNow = d?.trade ? isClosed(d.trade, d.jobType ?? null) : null;
  async function tellMe() {
    if (!d?.trade || !d.sector) return;
    setTelling(true);
    const r = await ask('tell_me_when', { p_trade: d.trade, p_type: d.jobType ?? null, p_sector: d.sector });
    setTelling(false);
    if (!r.ok) return setNotice(r.why);
    refreshClosed();
  }

  // The lowest for this job: the database's figure (price_floor()), or the old floor from an older database.
  const min = lists?.min_offer_paisa ?? 100000;
  const floor = Math.max(min, chosen?.floor_paisa ?? min);
  const offer = Math.max(floor, d?.offer ?? chosen?.list_paisa ?? floor);

  // A photo or video Android kept when it closed the app while the camera was open.
  const recovered = useRef(false);
  useEffect(() => {
    if (!d || recovered.current) return;
    recovered.current = true;
    recoverLostPick()
      .then((m) => {
        if (!m) return;
        changeMedia((all) => (m.kind === 'photo' ? (all.filter((x) => x.kind === 'photo').length >= LIMITS.photos ? all : [...all, m]) : [...all.filter((x) => x.kind !== m.kind), m]));
      })
      .catch((e) => setNotice(videoTrouble(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // "Show it" on home opens the video camera.
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
  const setMedia = (kind: Media['kind'], items: Media[]) => changeMedia((all) => [...all.filter((m) => m.kind !== kind), ...items]);
  const shown = d.media.length > 0 || d.description.trim().length >= 10;

  function problem(e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'camera') setNotice(switchedOff('camera', 'Pechkas needs the camera to take a photo or a video.'));
    else setNotice(videoTrouble(e) ?? { title: 'That did not work', text: 'Please try again.', detail: detailOf(e) });
  }

  /** A video: Pechkas' own camera screen on a phone, the picker in a browser. */
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

  /** "Tell me when you come to Rawalpindi": counted, and nothing promised in return. */
  async function askForCity(city: string): Promise<string | null> {
    if (!d?.trade) return 'Choose what needs fixing first.';
    const r = await ask('ask_for_sector', { p_trade: d.trade, p_sector: city });
    return r.ok ? null : r.why;
  }

  /** The refusals, beside their boxes, and her taken to the step they belong to. */
  function refuse(errs: Record<string, string>, text?: string) {
    setErrors(errs);
    const first = Object.keys(errs).map((k) => STEP_OF[k]).filter(Boolean).sort()[0];
    if (first) go(first);
    if (text) {
      setNotice(text);
      setNoticeKey((n) => n + 1);
    }
  }

  async function post() {
    if (!d || !session) return;
    setErrors({});
    setNotice(null);

    const early: Record<string, string> = {};
    if (!d.trade) early.trade = 'Choose what kind of work it is.';
    if (!shown) early.media = 'Show us what is wrong: a voice note, a video, a photo, or a few words.';
    if (d.lat === null || d.lng === null) early.location = 'Put the pin on the house first.';
    else {
      if (!d.sector) early.sector = 'Choose your sector.';
      if (!d.house.trim()) early.house = 'Write the house or flat number.';
      if (!d.street.trim()) early.street = 'Write the street.';
    }
    if (Object.keys(early).length) return refuse(early, 'Something is missing. It is marked in red.');

    // As soon as possible: today until 9pm, tomorrow after that (jobs run 7am to 10pm, A116).
    const day = asapDay(pkNow());

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
      setNotice(videoTrouble(e) ?? { title: 'Your job was not sent', text: 'Check your signal and press Post again. Anything already sent is kept.', detail: detailOf(e) });
      return;
    }

    setProgress('Posting…');
    const r = await ask<{ id: string; ref: string }>('post_job', {
      p_trade: d.trade,
      p_job_type: d.jobType,
      p_description: d.description,
      p_offer_paisa: offer,
      p_when_kind: 'today',
      p_when_part: null,
      p_when_date: day,
      p_when_from: null,
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
      // A refusal about a box on the form is shown beside it, on its step; any other is shown in full.
      if (r.field && STEP_OF[r.field]) refuse({ [r.field]: r.why }, r.field === 'offer' || r.field === 'when' ? undefined : r.why);
      else setNotice(r.why);
      return;
    }
    // Kept on this phone only: next time the form starts here, and a named one stays in the list.
    rememberPlace({ label: saveAs, sector: d.sector!, street: d.street.trim(), house: d.house.trim(), landmark: d.landmark.trim(), gateNote: d.gateNote.trim(), lat: d.lat!, lng: d.lng! }).catch(() => {});
    clearDraft();
    // Straight to the job's own live screen, the way a ride app goes to the
    // search — on top of home, so Back from it is home, not the empty form.
    const live = { pathname: '/job/[id]', params: d.askFor ? { id: r.id, asked: d.askFor.name } : { id: r.id } } as const;
    if (router.canDismiss()) {
      router.dismissAll();
      router.push(live);
    } else router.replace(live);
  }

  const tradeName = (slug: string) => lists?.trades.find((t) => t.slug === slug)?.name ?? slug;
  const back = () => (d.step > 1 ? go((d.step - 1) as 1 | 2) : router.canGoBack() ? router.back() : router.replace('/'));
  const next = (to: 2 | 3) => {
    if (backToPrice) {
      setBackToPrice(false);
      return go(3);
    }
    go(to);
  };

  // --- Sheets, shared by every step ----------------------------------------------------------
  const sheets = (
    <>
      <Notice key={noticeKey} text={notice} />
      {sheet === 'trade' ? (
        <Sheet title="Kind of work" onClose={() => setSheet(null)}>
          {(lists?.trades ?? []).map((t) => (
            <SheetOption
              key={t.slug}
              label={t.name}
              on={d.trade === t.slug}
              onPress={() => {
                chooseTrade(t.slug);
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
              sub={isClosed(d.trade, t.id) ? 'Not available here yet' : undefined}
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
            sub={isClosed(d.trade, null) ? 'Not available here yet' : undefined}
            on={d.jobType === null}
            onPress={() => {
              update({ jobType: null, offer: null });
              setSheet(null);
            }}
          />
        </Sheet>
      ) : null}
      {sheet === 'video' || sheet === 'photo' ? (
        <Sheet title={sheet === 'video' ? 'Add a video' : 'Add a photo'} onClose={() => setSheet(null)}>
          <SheetOption
            label={sheet === 'video' ? 'Record a video' : 'Take a photo'}
            sub={sheet === 'video' ? `Up to ${LIMITS.videoSeconds} seconds, with the time left on the screen. It stops by itself.` : undefined}
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
      {sheet === 'pay' ? (
        <Sheet title="How paying works" onClose={() => setSheet(null)}>
          <View style={{ gap: 12, paddingHorizontal: 4, paddingBottom: 8 }}>
            <PayFact text="You pay him after the job, in cash or by JazzCash or Easypaisa. Nothing in advance." />
            <PayFact text="Bigger than it looked? He must ask you a new price in the app, with a photo. Nothing changes unless you approve." />
            <PayFact text={`The lowest for this job is ${rupees(floor)}.`} />
            {/* The visit fee, said before she posts and again before she chooses (visit_fee): never only in the terms. */}
            {lists?.visit_fee_min_paisa ? <VisitFeeNote fee={lists.visit_fee_min_paisa} /> : null}
          </View>
        </Sheet>
      ) : null}
    </>
  );

  const steps = (n: 1 | 2 | 3, onYellow: boolean) => <StepBar n={n} onYellow={onYellow} />;

  // --- Step 2: where, on a map that fills the screen -------------------------------------------
  if (d.step === 2) {
    return (
      <>
        <Where
          d={d}
          places={places}
          islamabad={lists?.islamabad_sectors ?? lists?.live_sectors ?? []}
          sectors={lists?.sectors ?? []}
          saveAs={saveAs}
          errors={errors}
          onPatch={update}
          onSaveAs={setSaveAs}
          onAsk={askForCity}
          onBack={back}
          onNext={() => next(3)}
          progress={steps(2, false)}
        />
        {sheets}
      </>
    );
  }

  /** The yellow top of steps 1 and 3: back, the steps, and the job with Change. */
  const top = (
    <YellowTop
      back={false}
      after={
        <>
          <Press onPress={back} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.back}>
            <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
          </Press>
          <View style={{ flex: 1 }}>{steps(d.step, true)}</View>
        </>
      }
    >
      {d.trade ? (
        <View style={s.topJob}>
          <View style={s.topArt}>
            <TradeArt trade={chosen ? workArt(d.trade, chosen.name) : d.trade} size={width < 360 ? 46 : 54} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.topTrade}>{tradeName(d.trade)}</Text>
            <Text style={[s.topName, width < 360 && { fontSize: 17, lineHeight: 22 }]}>{chosen?.name ?? 'Something else, or not sure'}</Text>
            <Press onPress={() => setSheet('type')} accessibilityRole="button" accessibilityLabel="Change the job" sink={0.94} style={s.topChange}>
              <Text style={s.topChangeText}>Change</Text>
            </Press>
          </View>
        </View>
      ) : null}
    </YellowTop>
  );

  // --- Step 3: the price ------------------------------------------------------------------------
  if (d.step === 3) {
    const usual = chosen?.list_paisa ?? null;
    const range = chosen ? ranges[String(chosen.id)] : undefined;
    const atFloor = offer <= floor;
    const now = pkNow();
    const today = asapDay(now) === now.date;
    const early = today && now.hour < DAY_OPENS_HOUR;
    const parts = [voice ? 'voice note' : null, photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : null, video ? '1 video' : null, d.description.trim() ? 'your words' : null].filter(Boolean).join(', ');
    const what = parts ? parts[0].toUpperCase() + parts.slice(1) : '';
    return (
      <>
        <Screen key="step3" top={top} footer={<Button kind="ink" label={progress ?? `Post job · ${rupees(offer)}`} icon={progress ? undefined : 'arrowRight'} onPress={post} busy={busy && !progress} disabled={busy} />}>
          <Heading title="Your price" sub="Technicians accept it or offer theirs. You choose." />
          <View style={s.stepper}>
            <Press
              onPress={atFloor ? undefined : () => update({ offer: Math.max(floor, offer - PRICE_STEP_PAISA) })}
              sink={0.9}
              accessibilityRole="button"
              accessibilityState={{ disabled: atFloor }}
              accessibilityLabel={`Lower by ${rupees(PRICE_STEP_PAISA)}`}
              style={[s.step, width < 360 && s.stepNarrow, atFloor && s.stepOff]}
            >
              <Text style={[s.stepText, atFloor && { color: '#c9cdd0' }]}>−</Text>
            </Press>
            <Text style={[s.price, width < 360 && { fontSize: 30 }]} numberOfLines={1} accessibilityLiveRegion="polite">
              {rupees(offer)}
            </Text>
            <Press
              onPress={() => update({ offer: Math.min(50000000, offer + PRICE_STEP_PAISA) })}
              sink={0.9}
              accessibilityRole="button"
              accessibilityLabel={`Raise by ${rupees(PRICE_STEP_PAISA)}`}
              style={[s.step, width < 360 && s.stepNarrow, s.stepPlus]}
            >
              <Text style={s.stepText}>+</Text>
            </Press>
          </View>
          {atFloor ? (
            <View style={s.floorBox}>
              <View style={s.floorTile}>
                <DuoIcon name="tag" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.floorTitle}>{rupees(floor)} is the lowest for this job</Text>
                <Text style={s.hint}>You can go higher with +.</Text>
              </View>
            </View>
          ) : usual ? (
            <FloorBar floor={floor} usual={usual} offer={offer} />
          ) : null}
          {/* From real finished jobs, once there are enough of them (price_ranges()). */}
          {range ? (
            <PriceRangeCard
              range={range}
              price={offer}
              say={{
                below: ['Below most jobs like this', 'Fewer technicians may take it at this price.'],
                within: ['In line with most jobs like this', 'A fair price for this job.'],
                above: ['Above most jobs like this', 'You should hear back quickly.'],
              }}
              foot={`From ${range.n} finished Pechkas jobs in the last ${range.days} days. For the work only; parts are extra.`}
            />
          ) : null}
          <Press onPress={() => setSheet('pay')} accessibilityRole="button" sink={0.98} style={s.payRow}>
            <DuoIcon name="wallet" size={22} />
            <Text style={s.payText}>
              Pay him after the work{lists?.visit_fee_min_paisa ? ` · Visit fee ${rupees(lists.visit_fee_min_paisa)} only if you say no` : ''}
            </Text>
            <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} />
          </Press>
          <View style={s.summary}>
            <SummaryRow icon="clock" tone="green" title={today && !early ? 'As soon as possible' : `${today ? 'This' : 'Tomorrow'} morning, as soon as possible`} sub={today && !early ? 'Each offer shows how many minutes away he is' : 'Pechkas visits run from 7am to 10pm'} />
            <SummaryRow
              icon="mic"
              title={what || 'Show us the problem'}
              onPress={() => {
                setBackToPrice(true);
                go(1);
              }}
            />
            <SummaryRow
              icon="pin"
              title={[saveAs, d.sector?.replace(/-/g, '‑')].filter(Boolean).join(' · ') || 'Where'}
              onPress={() => {
                setBackToPrice(true);
                go(2);
              }}
            />
          </View>
          {errors.offer ? <Text style={s.error}>{errors.offer}</Text> : null}
        </Screen>
        {sheets}
      </>
    );
  }

  // --- Step 1: show us the problem ------------------------------------------------------------
  return (
    <>
      <Screen
        key="step1"
        top={top}
        footer={<Button kind="ink" label="Next" icon="arrowRight" disabled={!shown || !d.trade} onPress={() => next(2)} />}
      >
        {d.askFor ? (
          <View style={s.askFor}>
            <Text style={s.askForTitle}>Asking {d.askFor.name} first</Text>
            <Text style={s.askForText}>
              {d.askFor.name} sees this {tradeName(d.askFor.trade)} job first, for {d.askFor.minutes} minutes. Then every checked technician can send an offer. If he is not
              working right now, it goes to everyone straight away.
            </Text>
            <Press onPress={forgetAsk} accessibilityRole="button" style={s.linkBox}>
              <Text style={s.linkGreen}>Ask everyone instead</Text>
            </Press>
          </View>
        ) : null}

        {!d.trade ? (
          <Press onPress={() => setSheet('trade')} accessibilityRole="button" sink={0.98} style={s.choose}>
            <View style={s.chooseTile}>
              <DuoIcon name="briefcase" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.hint}>Kind of work</Text>
              <Text style={s.chooseText}>Choose what needs fixing</Text>
            </View>
            <Icon name="chevronDown" size={20} color={colour.ink} strokeWidth={2.2} />
          </Press>
        ) : null}
        {errors.trade || errors.job_type ? <Text style={s.error}>{errors.trade || errors.job_type}</Text> : null}
        {closedNow && d.sector ? (
          <View style={s.closed}>
            <Text style={s.closedTitle}>This kind of job is not available on Pechkas yet.</Text>
            {closedNow.asked ? (
              <Text style={s.hint}>You will be told when it opens in Sector {d.sector.replace(/-/g, '‑')}.</Text>
            ) : (
              <Button kind="outline" label="Tell me when it is" busy={telling} onPress={tellMe} />
            )}
          </View>
        ) : null}

        <Heading title="Show us the problem" sub={shown ? 'Got it. Add more if it helps.' : 'Say it in Urdu or English. A photo helps too.'} />

        {voice ? <VoicePlayback media={voice} onRemove={() => setMedia('voice', [])} /> : <VoiceTile big onDone={(m) => setMedia('voice', [m])} onProblem={setNotice} />}

        {/* Photos and the video, big, with ✕; then what can still be added. */}
        {photos.length || video ? (
          <View style={s.thumbs}>
            {photos.map((p, i) => (
              <View key={p.uri} style={[s.thumb, width < 360 && s.thumbSmall]}>
                <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} accessibilityLabel={`Photo ${i + 1}`} />
                <Remove label={`Delete photo ${i + 1}`} onPress={() => setMedia('photo', photos.filter((x) => x !== p))} />
              </View>
            ))}
            {video ? (
              <View style={[s.thumb, s.thumbVideo, width < 360 && s.thumbSmall]}>
                <Icon name="video" size={28} color={colour.yellow} strokeWidth={2} />
                <Text style={s.thumbText}>{video.seconds ? clock(video.seconds) : 'Video'}</Text>
                <Remove label="Delete the video" onPress={() => setMedia('video', [])} />
              </View>
            ) : null}
          </View>
        ) : null}
        {!video || photos.length < LIMITS.photos ? (
          <View style={s.tiles}>
            {photos.length < LIMITS.photos ? (
              <BigTile icon="camera" label={photos.length ? 'Add a photo' : 'Photo'} limit={photos.length ? `${LIMITS.photos - photos.length} more` : `Up to ${LIMITS.photos}`} onPress={() => setSheet('photo')} />
            ) : null}
            {video ? null : <BigTile icon="video" label="Video" limit={`Up to ${LIMITS.videoSeconds} sec`} onPress={() => setSheet('video')} />}
          </View>
        ) : null}
        {errors.media || errors.description ? <Text style={s.error}>{errors.media || errors.description}</Text> : null}

        {typing ? (
          <View style={s.typed}>
            <TextInput
              value={d.description}
              onChangeText={(v) => update({ description: v })}
              placeholder="A few words: it blows air but is not cold"
              placeholderTextColor="#7a838a"
              multiline
              maxLength={500}
              autoFocus={!d.description}
              accessibilityLabel="What is wrong, in words"
              style={s.words}
            />
            {/* Good to know: optional, tucked in with the words. */}
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
          </View>
        ) : (
          <Press onPress={() => setTyping(true)} accessibilityRole="button" sink={0.98} style={s.typeLink}>
            <Text style={s.typeLinkText}>Rather type it?</Text>
          </Press>
        )}
      </Screen>
      {sheets}
    </>
  );
}

/** What a saved address puts in the form. */
function fromPlace(p: Place): Partial<Draft> {
  return { sector: p.sector, sectorRead: false, street: p.street, house: p.house, landmark: p.landmark, gateNote: p.gateNote, lat: p.lat, lng: p.lng, accuracy: null };
}

/** "1 of 3" and three bars: dark on the yellow top, dark on the map's light top too. */
function StepBar({ n, onYellow }: { n: 1 | 2 | 3; onYellow: boolean }) {
  return (
    <View style={s.steps} accessible accessibilityLabel={`Step ${n} of 3`}>
      <View style={s.stepBars}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[s.stepBar, { backgroundColor: i <= n ? colour.ink : onYellow ? 'rgba(255,255,255,0.6)' : colour.rule }]} />
        ))}
      </View>
      <Text style={s.stepCount}>{n} of 3</Text>
    </View>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.heading} accessibilityRole="header">
        {title}
      </Text>
      <Text style={s.sub}>{sub}</Text>
    </View>
  );
}

function BigTile({ icon, label, limit, onPress }: { icon: 'video' | 'camera'; label: string; limit: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${limit}`} sink={0.96} style={s.bigTile}>
      <View style={s.bigTileDot}>
        <DuoIcon name={icon} size={30} />
      </View>
      <Text style={s.bigTileLabel}>{label}</Text>
      <Text style={s.hint}>{limit}</Text>
    </Press>
  );
}

/** The lowest and the usual price as a bar, her price filling it. */
function FloorBar({ floor, usual, offer }: { floor: number; usual: number; offer: number }) {
  // The usual price sits in the middle; the bar runs to twice the gap above it.
  const span = Math.max(1, (usual - floor) * 2);
  const at = Math.min(1, Math.max(0, (offer - floor) / span));
  return (
    <View style={s.bar} accessible accessibilityLabel={`Lowest ${rupees(floor)}, usual ${rupees(usual)}`}>
      <View style={s.barTrack}>
        <View style={[s.barFill, { transform: [{ scaleX: at }] }]} />
      </View>
      <View style={[s.barTick, { left: 0 }]} />
      <View style={[s.barTick, s.barUsual, { left: '50%' }]} />
      <View style={s.barLabels}>
        <Text style={s.barLabel}>
          Lowest{'\n'}
          <Text style={s.barFigure}>{rupees(floor)}</Text>
        </Text>
        <Text style={[s.barLabel, { textAlign: 'center' }]}>
          Usual{'\n'}
          <Text style={s.barFigure}>{rupees(usual)}</Text>
        </Text>
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function SummaryRow({ icon, title, sub, tone, onPress }: { icon: DuoName; title: string; sub?: string; tone?: 'green'; onPress?: () => void }) {
  const body = (
    <>
      <View style={[s.sumTile, tone === 'green' && { backgroundColor: colour.greenSoft }]}>
        <DuoIcon name={icon} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.sumTitle} numberOfLines={2}>
          {title}
        </Text>
        {sub ? <Text style={s.hint}>{sub}</Text> : null}
      </View>
      {onPress ? <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} /> : null}
    </>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" sink={0.98} style={s.sumRow}>
      {body}
    </Press>
  ) : (
    <View style={s.sumRow}>{body}</View>
  );
}

function Remove({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} sink={0.9} accessibilityRole="button" accessibilityLabel={label} style={s.x}>
      <View style={s.xDot}>
        <Icon name="cross" size={13} color={colour.white} strokeWidth={2.6} />
      </View>
    </Press>
  );
}

/** One line of how paying works: a green tick and the words. */
function PayFact({ text }: { text: string }) {
  return (
    <View style={s.fact}>
      <Icon name="check" size={16} color={colour.green} strokeWidth={2.4} />
      <Text style={s.factText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBars: { flex: 1, flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 5, borderRadius: 3 },
  stepCount: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  topJob: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  topArt: { width: 66, height: 66, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  topTrade: { fontFamily: font.displayBold, fontSize: 13, color: colour.onYellow },
  topName: { fontFamily: font.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.3, color: colour.ink },
  topChange: { minHeight: 36, minWidth: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  topChangeText: { fontFamily: font.display, fontSize: 14, color: colour.ink, textDecorationLine: 'underline' },
  heading: { fontFamily: font.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.7, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.steel },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  error: { fontFamily: font.bodySemi, fontSize: 13.5, lineHeight: 19, color: colour.brick },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tiles: { flexDirection: 'row', gap: 10 },
  bigTile: { flex: 1, minHeight: 118, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 24, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.05)' },
  bigTileDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bigTileLabel: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 104, height: 104, borderRadius: 20, overflow: 'hidden', backgroundColor: colour.tile },
  thumbSmall: { width: 86, height: 86 },
  thumbVideo: { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center', gap: 4 },
  thumbText: { fontFamily: font.display, fontSize: 13, color: colour.white },
  x: { position: 'absolute', top: 0, right: 0, width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  xDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(20,23,26,0.65)', alignItems: 'center', justifyContent: 'center' },
  typeLink: { alignSelf: 'center', minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12 },
  typeLinkText: { fontFamily: font.display, fontSize: 15, color: colour.ink, textDecorationLine: 'underline' },
  typed: { gap: 12 },
  words: { minHeight: 96, padding: 14, borderRadius: 18, backgroundColor: colour.white, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink, textAlignVertical: 'top', outlineWidth: 0 },
  choose: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colour.white },
  chooseTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  chooseText: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  closed: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.softBrick },
  closedTitle: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
  askFor: { gap: 6, padding: 14, borderRadius: radius.big, backgroundColor: colour.greenSoft },
  askForTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.greenDark },
  askForText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  linkBox: { alignSelf: 'flex-start', minHeight: TAP, justifyContent: 'center' },
  linkGreen: { fontFamily: font.bodySemi, fontSize: 14, color: colour.greenDark, textDecorationLine: 'underline' },
  stepper: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 28, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.05)' },
  step: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(20,23,26,0.18)', backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  stepNarrow: { width: 50, height: 50 },
  stepOff: { borderColor: colour.rule },
  stepPlus: { backgroundColor: colour.yellow, borderColor: colour.yellow },
  stepText: { fontFamily: font.display, fontSize: 28, color: colour.ink, marginTop: -2 },
  price: { flex: 1, textAlign: 'center', fontFamily: font.display, fontSize: 38, color: colour.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  floorBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 2, borderColor: colour.yellow, backgroundColor: colour.softYellow },
  floorTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  floorTitle: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  bar: { height: 62, marginHorizontal: 4 },
  barTrack: { position: 'absolute', left: 0, right: 0, top: 12, height: 8, borderRadius: 4, backgroundColor: colour.rule, overflow: 'hidden' },
  barFill: { width: '100%', height: '100%', backgroundColor: colour.yellow, transformOrigin: 'left' },
  barTick: { position: 'absolute', top: 4, width: 4, height: 24, marginLeft: -2, borderRadius: 2, backgroundColor: colour.ink },
  barUsual: { backgroundColor: colour.green },
  barLabels: { position: 'absolute', left: 0, right: 0, top: 32, flexDirection: 'row' },
  barLabel: { flex: 1, fontFamily: font.bodySemi, fontSize: 12, lineHeight: 15, color: colour.steel },
  barFigure: { fontFamily: font.display, fontSize: 12.5, color: colour.ink },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colour.white },
  payText: { flex: 1, fontFamily: font.bodySemi, fontSize: 13.5, lineHeight: 19, color: colour.ink },
  summary: { paddingHorizontal: 14, borderRadius: 22, backgroundColor: colour.white },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colour.rule },
  sumTile: { width: 36, height: 36, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  sumTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  factText: { flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
});
