import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sectorIn, streetIn } from '@pechkas/shared';
import { askPosition, ISLAMABAD, knownPosition, MapStage, mapsReady, readPlace, type Point, type StageApi } from '../components/Map';
import { DuoIcon } from '../components/DuoIcon';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Field } from '../components/ui';
import { ScrewSpinner } from '../components/ScrewSpinner';
import { placeLine, type Place, type PlaceLabel } from './places';
import type { Draft } from './draft';
import { colour, font, shadow, TAP } from '../theme';

/**
 * Post a job, step 2: where (the owner's design, 25 November 2026, inDrive's
 * way). The map fills the screen and the pin stays in the middle; the street
 * and the sector are read from it by the phone's own map service, so the
 * only thing typed is the house number, which no map in Islamabad knows.
 *
 *   saved   her last address is already under the pin: Edit or Next.
 *   browse  she is moving the map: "Reading the address…", then the place
 *           in big words and Confirm this spot — or, outside Islamabad,
 *           "Pechkas works in Islamabad only, for now" and no way on.
 *   house   after Confirm: the house number, the street (filled from the
 *           pin), the sector if the map could not read it, Save as, and the
 *           landmark and gate note behind a link. Then Next.
 *
 * The search box shows her saved places first; typed words go to the
 * phone's own map service (`geocodeAsync`), which moves the map there — no
 * paid search service. A build without the Google Maps key cannot move a
 * map: it finds her with "Use my location" instead, and goes on the same way.
 * Nothing here is final: post_job() checks the sector, the street and the
 * house again, and refuses a place outside Islamabad.
 */

type Read = { state: 'idle' } | { state: 'reading' } | { state: 'read'; sector: string | null; street: string; outside: string | null };

export function Where({
  d,
  places,
  islamabad,
  sectors,
  saveAs,
  errors,
  onPatch,
  onSaveAs,
  onAsk,
  onBack,
  onNext,
  progress,
}: {
  d: Draft;
  places: Place[];
  /** The places in Islamabad (Bahria Town and DHA among them), from app_lists(). */
  islamabad: string[];
  /** Every place on the list, Rawalpindi's too, so a pin there can be named. */
  sectors: string[];
  saveAs: PlaceLabel | null;
  errors: Record<string, string>;
  onPatch: (patch: Partial<Draft>) => void;
  onSaveAs: (label: PlaceLabel | null) => void;
  onAsk: (city: string) => Promise<string | null>;
  onBack: () => void;
  onNext: () => void;
  progress: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const withMap = mapsReady();
  const stage = useRef<StageApi>(null);
  const pinned = d.lat !== null && d.lng !== null;
  const [mode, setMode] = useState<'saved' | 'browse' | 'house'>(pinned && d.house.trim() ? 'saved' : pinned ? 'house' : 'browse');
  const [start, setStart] = useState<Point | null>(pinned ? { latitude: d.lat!, longitude: d.lng! } : null);
  const [here, setHere] = useState<Point | null>(pinned ? { latitude: d.lat!, longitude: d.lng! } : null);
  const [read, setRead] = useState<Read>({ state: 'idle' });
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [extras, setExtras] = useState(Boolean(d.landmark || d.gateNote));
  const [local, setLocal] = useState<Record<string, string>>({});
  const seq = useRef(0);

  // Where the map opens: her pin, else where the phone already is (never asks), else Islamabad.
  useEffect(() => {
    if (start) return;
    let alive = true;
    knownPosition().then((p) => alive && setStart(p ?? ISLAMABAD));
    return () => {
      alive = false;
    };
  }, [start]);

  /** The pin has stopped: what the phone's map service says is there. */
  async function settle(p: Point) {
    setHere(p);
    if (mode === 'saved' && pinned && Math.abs(p.latitude - d.lat!) < 1e-5 && Math.abs(p.longitude - d.lng!) < 1e-5) return;
    const mine = ++seq.current;
    setRead({ state: 'reading' });
    const place = await readPlace(p);
    if (mine !== seq.current) return;
    const texts = place?.texts ?? [];
    const sector = sectorIn(texts, sectors);
    const all = texts.join(' ');
    // A place on the list says which city it is in; without one, the map's own words do.
    const outside = sector
      ? islamabad.includes(sector)
        ? null
        : /rawalpindi|saddar|chaklala|satellite town|westridge/i.test(`${sector} ${all}`)
          ? 'Rawalpindi'
          : sector
      : /rawalpindi/i.test(all) && !/islamabad/i.test(all)
        ? 'Rawalpindi'
        : texts.length && !/islamabad|bahria|dha|defen[cs]e/i.test(all)
          ? 'this place'
          : null;
    setRead({ state: 'read', sector: outside ? null : sector, street: streetIn(place?.street, sector), outside });
  }

  function moved() {
    seq.current += 1;
    setRead({ state: 'reading' });
    setNote(null);
    setAsked(null);
    if (mode !== 'browse') setMode('browse');
  }

  /** Confirm this spot: the pin, and what was read from it, go into the form. */
  function confirm() {
    if (!here || read.state !== 'read' || read.outside) return;
    const patch: Partial<Draft> = { lat: here.latitude, lng: here.longitude, accuracy: null };
    if (read.sector) Object.assign(patch, { sector: read.sector, sectorRead: true });
    else Object.assign(patch, { sector: null, sectorRead: false });
    // A new spot is a new address: what was typed for the last one does not belong to it.
    const far = !pinned || Math.abs(here.latitude - d.lat!) > 0.0015 || Math.abs(here.longitude - d.lng!) > 0.0015;
    if (far) Object.assign(patch, { street: read.street, house: '', landmark: '', gateNote: '' });
    else if (read.street && !d.street.trim()) patch.street = read.street;
    if (far) onSaveAs(null);
    onPatch(patch);
    setMode('house');
  }

  /** A saved place from the search: everything at once, then Next. */
  function choose(p: Place) {
    setSearching(false);
    setQuery('');
    onSaveAs(p.label);
    onPatch({ sector: p.sector, sectorRead: false, street: p.street, house: p.house, landmark: p.landmark, gateNote: p.gateNote, lat: p.lat, lng: p.lng, accuracy: null });
    seq.current += 1;
    setRead({ state: 'idle' });
    setMode('saved');
    const at = { latitude: p.lat, longitude: p.lng };
    setHere(at);
    stage.current?.goTo(at);
  }

  /** Typed words: the phone's own map service, inside Islamabad. */
  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    setFinding(true);
    setNote(null);
    try {
      const found = await Location.geocodeAsync(/islamabad|rawalpindi/i.test(q) ? q : `${q}, Islamabad`);
      if (!found.length) setNote('That place could not be found. Move the map by hand.');
      else {
        setSearching(false);
        stage.current?.goTo({ latitude: found[0].latitude, longitude: found[0].longitude });
      }
    } catch {
      setNote('Search is not working on this phone. Move the map by hand.');
    } finally {
      setFinding(false);
    }
  }

  /** The round button: where the phone is now, asking first. */
  async function findMe() {
    setNote(null);
    setFinding(true);
    const p = await askPosition();
    setFinding(false);
    if (p === 'refused') return setNote('Allow location for Pechkas in your phone settings, or move the map by hand.');
    if (!p) return setNote('Your location could not be found. Step near a window, or move the map by hand.');
    moved();
    if (withMap) stage.current?.goTo(p);
    else settle(p);
  }

  /** Next from the house card: what the database would refuse, said here first. */
  function next() {
    const e: Record<string, string> = {};
    if (!d.sector) e.sector = 'Choose your sector.';
    if (!d.house.trim()) e.house = 'Write the house or flat number.';
    if (!d.street.trim()) e.street = 'Write the street.';
    setLocal(e);
    if (Object.keys(e).length) return;
    onNext();
  }

  const err = { ...local, ...errors };
  const line = (sector: string | null, street: string) => [street, sector ? `Sector ${sector.replace(/-/g, '‑')}` : null].filter(Boolean).join(', ') || 'Islamabad';

  return (
    <View style={s.page}>
      {start ? <MapStage ref={stage} start={start} pinOffset={withMap ? 120 : 140} onMove={moved} onIdle={settle} /> : null}

      {/* The top: back, the steps, and the search. */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]}>
        <View style={s.bar}>
          <Press onPress={searching ? () => setSearching(false) : onBack} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.round}>
            <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
          </Press>
          <View style={{ flex: 1 }}>{progress}</View>
        </View>
        {withMap ? (
          <View style={[s.search, searching && s.searchOn]}>
            <Icon name="search" size={20} color={colour.ink} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearching(true)}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder="Search a street or place"
              placeholderTextColor="#7a838a"
              accessibilityLabel="Search a street or place"
              style={s.searchInput}
            />
            {finding ? <ScrewSpinner size={20} /> : null}
          </View>
        ) : null}
        {searching ? (
          <View style={s.results}>
            {places.length ? <Text style={s.small}>Your places</Text> : null}
            {places.map((p) => (
              <Press key={`${p.label}-${p.lat}-${p.lng}`} onPress={() => choose(p)} accessibilityRole="button" sink={0.98} style={s.result}>
                <View style={s.tile}>
                  <DuoIcon name={p.label === 'Office' ? 'briefcase' : p.label === 'Home' ? 'home' : 'pin'} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.resultTitle}>{p.label ?? 'Used last time'}</Text>
                  <Text style={s.small} numberOfLines={1}>
                    {placeLine(p)} · {p.sector.replace(/-/g, '‑')}
                  </Text>
                </View>
              </Press>
            ))}
            <Text style={[s.small, { paddingVertical: 10 }]}>{query.trim().length > 1 ? 'Press search on the keyboard to go there.' : 'Or type a street, a sector or a place.'}</Text>
            {note ? <Text style={s.error}>{note}</Text> : null}
          </View>
        ) : null}
      </View>

      {withMap && !searching && mode !== 'house' ? (
        <Press onPress={findMe} accessibilityRole="button" accessibilityLabel="Go to where I am now" sink={0.9} style={[s.me, { bottom: 260 }]}>
          <Icon name="locate" size={24} color={colour.ink} strokeWidth={2.2} />
        </Press>
      ) : null}

      {/* The card at the foot. */}
      {!searching ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.foot}>
          <View style={[s.card, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
            <View style={s.grab} />
            {mode === 'saved' && pinned ? (
              <>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Where is the job?{saveAs ? ` · ${saveAs}` : ''}</Text>
                    <Text style={s.big}>{[d.house, d.street, d.sector?.replace(/-/g, '‑')].filter(Boolean).join(', ')}</Text>
                  </View>
                  <Press onPress={() => setMode('house')} accessibilityRole="button" accessibilityLabel="Edit the address" style={s.linkBox}>
                    <Text style={s.link}>Edit</Text>
                  </Press>
                </View>
                <Main label="Next" onPress={next} />
              </>
            ) : mode === 'house' ? (
              <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
                <View style={s.row}>
                  <View style={s.tile}>
                    <DuoIcon name="pin" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{line(d.sector, d.street)}</Text>
                    <Text style={s.title}>The house number</Text>
                  </View>
                  {withMap ? (
                    <Press onPress={() => setMode('browse')} accessibilityRole="button" style={s.linkBox}>
                      <Text style={s.link}>Move pin</Text>
                    </Press>
                  ) : null}
                </View>
                {!d.sector ? (
                  <View style={{ gap: 8 }}>
                    <Text style={s.label}>The map could not tell the sector. Tap yours.</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {islamabad.map((name) => (
                        <Pill key={name} label={name} on={false} onPress={() => onPatch({ sector: name, sectorRead: false })} />
                      ))}
                    </ScrollView>
                    {err.sector ? <Text style={s.error}>{err.sector}</Text> : null}
                  </View>
                ) : null}
                <Field label="House or flat" value={d.house} onChangeText={(v) => onPatch({ house: v })} placeholder="House 12" error={err.house} autoFocus={!d.house} />
                <Text style={s.small}>Maps don’t know house numbers. Only the technician you choose sees it.</Text>
                <Field label="Street" value={d.street} onChangeText={(v) => onPatch({ street: v })} placeholder="Street 34" error={err.street} autoComplete="street-address" />
                <View style={{ gap: 8 }}>
                  <Text style={s.label}>Save as</Text>
                  <View style={s.wrap}>
                    {(['Home', 'Office', 'Other'] as const).map((label) => (
                      <Pill key={label} label={label} on={saveAs === label} onPress={() => onSaveAs(saveAs === label ? null : label)} />
                    ))}
                  </View>
                </View>
                {extras ? (
                  <>
                    <Field label="Landmark (optional)" value={d.landmark} onChangeText={(v) => onPatch({ landmark: v })} placeholder="Behind the markaz mosque" maxLength={120} error={err.landmark} />
                    <Field label="Note for the gate (optional)" value={d.gateNote} onChangeText={(v) => onPatch({ gateNote: v })} placeholder="The guard will open. Please ring twice." maxLength={120} error={err.gate_note} />
                  </>
                ) : (
                  <Press onPress={() => setExtras(true)} accessibilityRole="button" sink={0.98} style={s.more}>
                    <Icon name="doc" size={20} color={colour.ink} strokeWidth={2} />
                    <Text style={s.moreText}>Add a landmark or a note for the gate</Text>
                  </Press>
                )}
                <Main label="Next" onPress={next} />
              </ScrollView>
            ) : !withMap && !here ? (
              // No map to move: find her, or take a saved place.
              <>
                <Text style={s.label}>Where is the job?</Text>
                <Text style={s.big}>Find your house</Text>
                {places.map((p) => (
                  <Press key={`${p.label}-${p.lat}`} onPress={() => choose(p)} accessibilityRole="button" sink={0.98} style={s.result}>
                    <View style={s.tile}>
                      <DuoIcon name={p.label === 'Office' ? 'briefcase' : p.label === 'Home' ? 'home' : 'pin'} size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultTitle}>{p.label ?? 'Used last time'}</Text>
                      <Text style={s.small} numberOfLines={1}>
                        {placeLine(p)} · {p.sector.replace(/-/g, '‑')}
                      </Text>
                    </View>
                  </Press>
                ))}
                {note ? <Text style={s.error}>{note}</Text> : null}
                <Main label={finding ? 'Finding you…' : 'Use my location'} onPress={findMe} disabled={finding} />
              </>
            ) : (
              <>
                <Text style={s.label}>Where is the job?</Text>
                {read.state === 'reading' || read.state === 'idle' ? (
                  <>
                    <View style={s.reading}>
                      <ScrewSpinner size={18} />
                      <Text style={s.small}>Reading the address…</Text>
                    </View>
                    <Text style={[s.big, { color: '#c9cdd0' }]}> </Text>
                    <Main label="Confirm this spot" disabled onPress={() => undefined} />
                  </>
                ) : read.outside ? (
                  <>
                    <Text style={s.big}>{read.outside === 'this place' ? 'This place' : read.outside}</Text>
                    <View style={s.no}>
                      <Text style={s.noText}>Pechkas works in Islamabad only, for now</Text>
                    </View>
                    <Text style={s.small}>Move the pin if the job is in Islamabad.</Text>
                    {read.outside === 'Rawalpindi' ? (
                      asked ? (
                        <Text style={s.thanks}>{asked}</Text>
                      ) : (
                        <Press
                          onPress={async () => {
                            setAsking(true);
                            const why = await onAsk('Rawalpindi');
                            setAsking(false);
                            setAsked(why ?? 'Thank you. We will tell you when Pechkas comes to Rawalpindi.');
                          }}
                          accessibilityRole="button"
                          sink={0.97}
                          style={s.outline}
                        >
                          <Text style={s.outlineText}>{asking ? 'Sending…' : 'Tell me when you come to Rawalpindi'}</Text>
                        </Press>
                      )
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={s.big}>{line(read.sector, read.street)}</Text>
                    {note ? <Text style={s.error}>{note}</Text> : null}
                    <Main label="Confirm this spot" onPress={confirm} />
                  </>
                )}
              </>
            )}
            {err.location ? <Text style={s.error}>{err.location}</Text> : null}
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function Main({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled }} sink={0.97} style={[s.main, disabled && s.mainOff]}>
      <Text style={[s.mainText, disabled && { color: '#9aa1a6' }]}>{label}</Text>
    </Press>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} sink={0.95} style={[s.pill, on && s.pillOn]}>
      <Text style={[s.pillText, on && { color: colour.white }]}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colour.tile },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14, gap: 10, paddingBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP },
  round: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.16)' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colour.white, boxShadow: '0px 3px 12px rgba(20, 23, 26, 0.16)', borderWidth: 2, borderColor: colour.white },
  searchOn: { borderColor: colour.ink },
  searchInput: { flex: 1, minHeight: 48, fontFamily: font.bodySemi, fontSize: 15, color: colour.ink, outlineWidth: 0 },
  results: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colour.white, boxShadow: shadow.card },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  resultTitle: { fontFamily: font.display, fontSize: 15.5, color: colour.ink },
  tile: { width: 42, height: 42, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  me: { position: 'absolute', right: 14, width: 52, height: 52, borderRadius: 26, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 12px rgba(20, 23, 26, 0.2)' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { gap: 12, paddingHorizontal: 18, paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colour.white, boxShadow: '0px -8px 30px rgba(0, 0, 0, 0.14)' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colour.rule },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  title: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  big: { fontFamily: font.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  error: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.brick },
  thanks: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.green },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  no: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: colour.softBrick },
  noText: { fontFamily: font.display, fontSize: 13, color: colour.brick },
  linkBox: { minHeight: TAP, minWidth: TAP, justifyContent: 'center', alignItems: 'flex-end' },
  link: { fontFamily: font.display, fontSize: 14, color: colour.ink, textDecorationLine: 'underline' },
  main: { minHeight: 56, borderRadius: 18, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  mainOff: { backgroundColor: colour.rule },
  mainText: { fontFamily: font.display, fontSize: 16.5, color: colour.white },
  outline: { minHeight: 54, borderRadius: 16, borderWidth: 2, borderColor: colour.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  outlineText: { fontFamily: font.display, fontSize: 15, color: colour.ink, textAlign: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: TAP, paddingHorizontal: 16, borderRadius: TAP / 2, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colour.ink },
  pillText: { fontFamily: font.display, fontSize: 14, color: colour.ink },
  more: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP },
  moreText: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink, textDecorationLine: 'underline' },
});
