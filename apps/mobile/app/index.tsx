import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art, type ArtName } from '../src/components/Art';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Icon } from '../src/components/Icon';
import { askPosition, ISLAMABAD, knownPosition, MapBox, mapsReady, Pin, type Point } from '../src/components/Map';
import { MenuButton } from '../src/components/Menu';
import { Press } from '../src/components/Press';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { rupees } from '@pechkas/shared';
import { SystemBars, useArrive } from '../src/components/ui';
import { useAccount } from '../src/account';
import { supabase } from '../src/supabase';
import { colour, font, radius, TAP } from '../src/theme';

/**
 * The customer's home, laid out the way inDrive lays out its own (the
 * owner's reference): the map with the ☰ menu over it and a pin in the
 * middle saying "Set the job's address", a yellow bar when the phone's
 * location is off, the locate button at the map's lower right; then the
 * sheet — one big tile, one wide and two small, a row of small square tiles
 * with their names under them, and the one question Pechkas asks, what
 * needs fixing and for how much, with the last jobs under it.
 *
 * Every tile opens the post screen with its trade chosen. Recent jobs are
 * this person's own, from my_jobs(); with none, the list is simply absent.
 * No tile carries a discount or a count: there are none to show.
 */

/** The row of small tiles: every other trade, then all of them. */
const MORE: { slug: string | null; label: string; art: ArtName }[] = [
  { slug: 'cctv', label: 'CCTV', art: 'cctv' },
  { slug: 'wifi', label: 'Wi-Fi', art: 'wifi' },
  { slug: 'solar', label: 'Solar', art: 'solar' },
  { slug: 'appliances', label: 'Appliances', art: 'appliances' },
  { slug: 'carpentry', label: 'Carpentry', art: 'carpentry' },
  { slug: 'painting', label: 'Painting', art: 'painting' },
  { slug: 'computers', label: 'Computers', art: 'computers' },
  { slug: null, label: 'All trades', art: 'more' },
];

type Recent = {
  id: string;
  ref: string;
  title: string;
  trade: string;
  status: string;
  live_offers: number;
  offered_paisa: number;
  stage: 'chosen' | 'on_way' | 'arrived' | 'working' | null;
  pro: { first_name: string } | null;
};

const LIVE_EVERY = 10000;

/** A job still happening: the one the home screen puts on top, as inDrive puts the ride. */
const isLive = (j: Recent) => j.status === 'open' || j.status === 'assigned';

const post = (params: { trade?: string; start?: string; lat?: string; lng?: string } = {}) => router.push({ pathname: '/post', params });

function statusLine(j: Recent): string {
  if (j.status === 'open') return j.live_offers ? `${j.live_offers} ${j.live_offers === 1 ? 'offer' : 'offers'} to choose from` : 'Waiting for offers';
  if (j.status === 'assigned') return 'Technician chosen';
  if (j.status === 'done') return 'Done';
  if (j.status === 'stopped') return 'Stopped';
  return 'Cancelled';
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const { width, height } = useWindowDimensions();
  const [jobs, setJobs] = useState<Recent[]>([]);
  const live = jobs.filter(isLive).slice(0, 2);
  // The last two that are over; the ones still happening are in the live cards.
  const recent = jobs.filter((j) => !isLive(j)).slice(0, 2);
  // The map shows where the phone is only if the person has already allowed
  // it; otherwise Islamabad. It asks only when the locate button is pressed.
  const withMap = mapsReady();
  const [me, setMe] = useState<Point | null>(null);
  // Whether the phone could be found: 'off' until it is, 'refused' once the
  // person has said no, when only the phone's settings can change it.
  const [where, setWhere] = useState<'looking' | 'found' | 'off' | 'refused'>('looking');
  useEffect(() => {
    if (!withMap) return;
    knownPosition().then((p) => {
      if (p) setMe(p);
      setWhere(p ? 'found' : 'off');
    });
  }, [withMap]);
  const locate = async () => {
    if (where === 'refused') return Linking.openSettings();
    const p = await askPosition();
    if (p && p !== 'refused') {
      setMe(p);
      setWhere('found');
    } else setWhere(p === 'refused' ? 'refused' : 'off');
  };
  // "Set the job's address": the post screen opens on the pin, starting here.
  const setAddress = () =>
    post(me ? { start: 'pin', lat: String(me.latitude), lng: String(me.longitude) } : { start: 'pin' });
  // Never so short that the pin and its bubble have no room under the menu.
  const mapHeight = Math.max(Math.round(height * 0.42), 330);
  // The buttons over the map scroll away with it, rather than sitting on the cards.
  const scrollY = useRef(new Animated.Value(0)).current;
  const lift = scrollY.interpolate({ inputRange: [0, 1000], outputRange: [0, -1000], extrapolateLeft: 'clamp' });
  // The map is meant to show under the clock, the sheet is not: as the
  // sheet's top edge reaches the clock, a strip of its own colour follows the
  // edge up and stays there, so its words never scroll under the clock.
  // Moved by transform only, inside a box the height of the status bar.
  const sheetTop = mapHeight - 28;
  const capY = scrollY.interpolate({ inputRange: [sheetTop - insets.top, sheetTop], outputRange: [insets.top, 0], extrapolate: 'clamp' });
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  useFocusEffect(
    useCallback(() => {
      if (!supabase || account?.role !== 'customer') return;
      let alive = true;
      const load = () =>
        supabase?.rpc('my_jobs').then(({ data }) => {
          if (alive && Array.isArray(data)) setJobs(data as Recent[]);
        });
      load();
      // Offers arrive while she is looking at home, as they do on inDrive's.
      const t = setInterval(load, LIVE_EVERY);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }, [account?.role]),
  );

  if (account?.role === 'pro') return <Redirect href="/pro" />;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const body = (
    <>
        {/* Who this is for, and the one question, before anything to tap. */}
        <View style={s.greet}>
          <Text style={s.hello} numberOfLines={1}>
            {greeting}
            {account?.first_name ? `, ${account.first_name}` : ''}
          </Text>
          <Text style={s.ask} accessibilityRole="header">
            What needs fixing?
          </Text>
        </View>
        {live.length ? (
          <View style={s.liveStack}>
            {live.map((j) => (
              <LiveCard key={j.id} job={j} />
            ))}
          </View>
        ) : null}
        <Animated.View style={{ gap: 12, paddingTop: 12, transform: [{ translateY: rise }] }}>
          {/* One big tile, one wide and two small, then every other trade in a neat grid. */}
          <View style={[s.sheet, { gap: 14 }]} accessibilityLabel="Choose the kind of work">
            <View style={s.tiles}>
              <Tile big label="AC" art="ac" onPress={() => post({ trade: 'ac' })} />
              {/* On a narrow phone the right-hand column takes a little more, so "Plumber" fits its tile. */}
              <View style={[s.column, width < 360 && { flex: 1.45 }]}>
                <Tile wide label="Electrician" art="electrician" onPress={() => post({ trade: 'electrician' })} />
                <View style={s.row}>
                  <Tile small label="Plumber" art="plumber" onPress={() => post({ trade: 'plumber' })} />
                  <Tile small label="UPS" art="ups" onPress={() => post({ trade: 'ups' })} />
                </View>
              </View>
            </View>
            <View style={s.grid}>
              {MORE.map((m) => (
                <Small key={m.label} label={m.label} art={m.art} onPress={() => post(m.slug ? { trade: m.slug } : {})} />
              ))}
            </View>
          </View>

          {/* The question Pechkas is built on, as the one big call to action. */}
          <Press onPress={() => post()} accessibilityRole="button" accessibilityLabel="Post a job. What needs fixing and for how much?" sink={0.98} style={s.cta}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.ctaTitle}>What needs fixing & for how much?</Text>
              <Text style={s.ctaText}>Name your price. Checked technicians send you offers.</Text>
            </View>
            <View style={s.ctaGo}>
              <Icon name="arrowRight" size={22} color={colour.ink} strokeWidth={2.4} />
            </View>
          </Press>

          {recent.length ? (
            <View style={s.sheet}>
              <View style={s.head}>
                <Text style={s.h2}>Recent jobs</Text>
                <Press onPress={() => router.push('/jobs')} accessibilityRole="link" sink={0.95} style={s.seeAll}>
                  <Text style={s.seeAllText}>See all</Text>
                </Press>
              </View>
              {recent.map((j, i) => (
                <Press key={j.id} onPress={() => router.push(`/job/${j.id}`)} accessibilityRole="button" sink={0.98} style={[s.recent, i < recent.length - 1 && s.rule]}>
                  <View style={s.soft}>
                    <DuoIcon name="jobs" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recentTitle} numberOfLines={1}>
                      {j.title}
                    </Text>
                    <Text style={s.recentSub} numberOfLines={1}>
                      {j.ref}
                    </Text>
                  </View>
                  <View style={[s.chip, j.status === 'done' && s.chipDone]}>
                    <Text style={[s.chipText, j.status === 'done' && s.chipTextDone]}>{statusLine(j)}</Text>
                  </View>
                </Press>
              ))}
            </View>
          ) : null}

          {/* Two ways to say what is wrong without typing. */}
          <View style={s.sheet}>
            <Text style={[s.h2, s.h2Alone]}>Describe it your way</Text>
            <Way icon="mic" title="Send a voice note" sub="Urdu or English, as you like." onPress={() => post({ start: 'voice' })} />
            <Way icon="video" title="Show a short video" sub="Point the camera at the fault." onPress={() => post({ start: 'video' })} last />
          </View>

          <View style={s.sheet}>
            <Text style={[s.h2, s.h2Alone]}>Why Pechkas</Text>
            <Promise icon="shield" title="Checked technicians" text="Every technician is checked before his first job: who he is, a trial job and our rules." />
            <Promise icon="lock" title="Your price, agreed first" text="The price is agreed in the app before he comes. It changes only if you approve it." last />
          </View>
        </Animated.View>
    </>
  );

  if (withMap) {
    // Under the yellow bar when it shows, as the menu button is on inDrive.
    const top = where === 'off' || where === 'refused' ? insets.top + 58 : insets.top;
    return (
      <View style={s.screen}>
        <StatusBar style="dark" />
        <MapBox center={me ?? ISLAMABAD} zoom={me ? 0.012 : 0.09} showsUser={Boolean(me)} style={[s.map, { height: mapHeight + 40 }]} />
        <Animated.ScrollView
          contentContainerStyle={{ paddingTop: mapHeight - 28, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          <View style={s.sheetBase}>
            <View style={s.handle} />
            {body}
          </View>
        </Animated.ScrollView>
        <View pointerEvents="none" style={[s.cap, { height: insets.top }]}>
          <Animated.View style={{ height: insets.top, backgroundColor: colour.canvas, transform: [{ translateY: capY }] }} />
        </View>
        <SystemBars bg={colour.canvas} top={false} />
        {/* The pin stays in the middle of what can be seen of the map, with the one thing to do above it. */}
        <Animated.View
          pointerEvents="box-none"
          style={[s.centre, { top: Math.max(top + 66, top + (mapHeight - 28 - top) / 2 - 92), transform: [{ translateY: lift }] }]}
        >
          <Press onPress={setAddress} accessibilityRole="button" sink={0.96} style={s.bubble}>
            <Text style={s.bubbleText}>Set the job's address</Text>
            <Icon name="chevronRight" size={18} color={colour.ink} strokeWidth={2.4} />
          </Press>
          <Pin />
        </Animated.View>
        <Animated.View style={[s.top, s.floating, { top: top + 10, transform: [{ translateY: lift }] }]} pointerEvents="box-none">
          <MenuButton />
        </Animated.View>
        <Animated.View style={[s.floating, { top: mapHeight - 28 - 64, alignItems: 'flex-end', paddingRight: 16, transform: [{ translateY: lift }] }]} pointerEvents="box-none">
          <Press onPress={locate} accessibilityRole="button" accessibilityLabel="Show where I am" sink={0.9} style={s.locate}>
            <Icon name="locate" size={22} color={colour.ink} strokeWidth={2.2} />
          </Press>
        </Animated.View>
        {/* The phone could not be found: say so across the top, as inDrive does, and let a tap fix it. */}
        {where === 'off' || where === 'refused' ? (
          <Press onPress={locate} accessibilityRole="button" sink={1} style={[s.banner, { paddingTop: insets.top + 6 }]}>
            <Text style={s.bannerTitle}>We could not find you</Text>
            <Text style={s.bannerText}>{where === 'refused' ? 'Tap to allow location in the phone settings' : 'Tap to turn on location'}</Text>
          </Press>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 16) + 8 }} bounces={false}>
        <View style={s.top}>
          <MenuButton />
          {/* Islamabad is the only city, so this says where, and is not a button. */}
          <View style={s.city} accessibilityLabel="Pechkas works in Islamabad">
            <Icon name="pin" size={16} color={colour.green} strokeWidth={2.2} />
            <Text style={s.cityText}>Islamabad</Text>
          </View>
        </View>

        {body}
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

function Tile({ label, art, onPress, big = false, wide = false, small = false }: { label: string; art: ArtName; onPress: () => void; big?: boolean; wide?: boolean; small?: boolean }) {
  // On a narrow phone the two small tiles are about 70 points wide: "Plumber" fits at 12.
  const { width } = useWindowDimensions();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} sink={0.97} style={[s.tile, big && s.tileBig, wide && s.tileWide, small && s.tileSmall]}>
      <Text style={[s.tileText, big && s.tileTextBig, small && { fontSize: width < 360 ? 12 : 14 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <View style={[s.tileArt, small && s.tileArtSmall]}>
        <Art name={art} width={big ? 150 : small ? 78 : 112} height={big ? 112 : small ? 58 : 84} />
      </View>
      {/* The big tiles say "tap here" the way designed apps do: a small arrow in a white disc. */}
      {big || wide ? (
        <View style={[s.tileGo, big ? s.tileGoBig : s.tileGoWide]} accessible={false}>
          <Icon name="arrowRight" size={16} color={colour.ink} strokeWidth={2.4} />
        </View>
      ) : null}
    </Press>
  );
}

/** A trade in the grid of four across: a square with its drawing, its name under it. */
function Small({ label, art, onPress }: { label: string; art: ArtName; onPress: () => void }) {
  const { width } = useWindowDimensions();
  // Four across the sheet, whatever the phone: the sheet's sides and three gaps come off first.
  // On a narrow phone the gaps close up, so "Appliances" and "Computers" keep every letter.
  const narrow = width < 360;
  const cell = Math.floor((width - 20 - 24 - 3 * (narrow ? 5 : 10)) / 4);
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} sink={0.95} style={[s.small, { width: cell }]}>
      <View style={[s.smallArt, { width: cell, height: Math.round(cell * 0.92) }]}>
        <Art name={art} width={Math.round(cell * 0.9)} height={Math.round(cell * 0.68)} />
      </View>
      <Text style={[s.smallText, narrow && { fontSize: 11 }]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

function Way({ icon, title, sub, onPress, last = false }: { icon: DuoName; title: string; sub: string; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" sink={0.98} style={[s.way, !last && s.rule]}>
      <View style={s.soft}>
        <DuoIcon name={icon} size={24} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.wayTitle}>{title}</Text>
        <Text style={s.waySub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color="#b4babe" strokeWidth={2.2} />
    </Press>
  );
}

function Promise({ icon, title, text, last = false }: { icon: DuoName; title: string; text: string; last?: boolean }) {
  return (
    <View style={[s.promise, !last && s.rule]}>
      <View style={s.soft}>
        <DuoIcon name={icon} size={24} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.wayTitle}>{title}</Text>
        <Text style={s.promiseText}>{text}</Text>
      </View>
    </View>
  );
}

/**
 * A job in progress, on top of home. Open: the screw turning, and how many
 * offers there are — yellow, the one highlight, once there is something to
 * choose. Chosen: who is coming and where he has got to. Tapping it opens
 * the job's live screen.
 */
function LiveCard({ job }: { job: Recent }) {
  const name = job.pro?.first_name;
  const offers = job.live_offers;
  const title =
    job.status === 'open'
      ? offers
        ? 'Choose a technician'
        : 'Finding a technician'
      : !name
        ? 'Technician chosen'
        : job.stage === 'on_way'
          ? `${name} is on his way`
          : job.stage === 'arrived'
            ? `${name} has arrived`
            : job.stage === 'working'
              ? `${name} is working on it`
              : `${name} is your technician`;
  return (
    <Press onPress={() => router.push(`/job/${job.id}`)} accessibilityRole="button" accessibilityLabel={`${title}. ${job.title}`} sink={0.98} style={s.live}>
      {job.status === 'open' ? (
        <ScrewSpinner size={40} label={title} />
      ) : (
        <View style={s.liveAvatar}>
          <Text style={s.liveAvatarText}>{name?.charAt(0) ?? '·'}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={s.liveTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.liveSub} numberOfLines={1}>
          {job.title} · {rupees(job.offered_paisa)}
        </Text>
      </View>
      {job.status === 'open' && offers ? (
        <View style={s.livePill}>
          <Text style={s.livePillText}>
            {offers} {offers === 1 ? 'offer' : 'offers'}
          </Text>
        </View>
      ) : (
        <Icon name="chevronRight" size={20} color={colour.ink} strokeWidth={2.2} />
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  liveStack: { gap: 8, paddingHorizontal: 10, paddingTop: 12 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 22, backgroundColor: colour.white, borderWidth: 2, borderColor: colour.green },
  liveAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  liveAvatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  liveTitle: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  liveSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  livePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colour.yellow },
  livePillText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  screen: { flex: 1, backgroundColor: colour.canvas },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colour.white, boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.10)' },
  cityText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  map: { position: 'absolute', top: 0, left: 0, right: 0 },
  cap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  floating: { position: 'absolute', left: 0, right: 0 },
  sheetBase: { backgroundColor: colour.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, minHeight: 600 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(20, 23, 26, 0.18)' },
  locate: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.10)' },
  centre: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingLeft: 18, paddingRight: 12, borderRadius: radius.pill, backgroundColor: colour.white, boxShadow: '0px 4px 14px rgba(20, 23, 26, 0.18)' },
  bubbleText: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 10, backgroundColor: colour.yellow },
  bannerTitle: { fontFamily: font.display, fontSize: 17, color: colour.ink },
  bannerText: { fontFamily: font.bodyMedium, fontSize: 14, color: colour.ink },

  greet: { paddingHorizontal: 20, paddingTop: 10, gap: 2 },
  hello: { fontFamily: font.bodyMedium, fontSize: 15, color: colour.steel },
  ask: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: colour.ink },

  sheet: { marginHorizontal: 10, padding: 12, borderRadius: 26, backgroundColor: colour.white, gap: 4, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  tiles: { flexDirection: 'row', gap: 10 },
  column: { flex: 1.2, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  tile: { borderRadius: 22, backgroundColor: colour.cream, padding: 12, overflow: 'hidden' },
  tileBig: { flex: 1, minHeight: 212 },
  tileWide: { flex: 1, minHeight: 100 },
  tileSmall: { flex: 1, minHeight: 100, paddingHorizontal: 8, paddingVertical: 10 },
  tileText: { fontFamily: font.displayBold, fontSize: 15, color: colour.ink },
  tileTextBig: { fontFamily: font.display, fontSize: 24, paddingRight: 40 },
  tileArt: { position: 'absolute', right: -6, bottom: -4 },
  tileArtSmall: { right: -4, bottom: -2 },
  // The big tile's drawing fills its foot, so its arrow sits in the empty top corner.
  tileGoBig: { right: 12, top: 14 },
  tileGoWide: { left: 12, bottom: 12 },
  tileGo: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(20, 23, 26, 0.12)' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, paddingHorizontal: 2 },
  small: { alignItems: 'center', gap: 6 },
  smallArt: { borderRadius: 18, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  smallText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.ink },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 10, paddingVertical: 18, paddingLeft: 18, paddingRight: 14, borderRadius: 24, backgroundColor: colour.green },
  ctaTitle: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.white },
  ctaText: { fontFamily: font.bodyMedium, fontSize: 13.5, lineHeight: 19, color: '#cfe2de' },
  ctaGo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontFamily: font.display, fontSize: 18, color: colour.ink, paddingHorizontal: 4 },
  h2Alone: { paddingTop: 6, paddingBottom: 6 },
  seeAll: { minHeight: TAP, minWidth: TAP, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 6 },
  seeAllText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  soft: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 4 },
  recentTitle: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  recentSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colour.canvas },
  chipDone: { backgroundColor: colour.greenSoft },
  chipText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.inkSoft },
  chipTextDone: { color: colour.greenDark },

  way: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingHorizontal: 4 },
  wayTitle: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  waySub: { fontFamily: font.body, fontSize: 13, color: colour.steel },

  promise: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 4, paddingVertical: 12 },
  promiseText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
});
