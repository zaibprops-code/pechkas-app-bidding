import { useCallback, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art, type ArtName } from '../src/components/Art';
import { Icon, type IconName } from '../src/components/Icon';
import { MenuButton } from '../src/components/Menu';
import { Press } from '../src/components/Press';
import { useArrive } from '../src/components/ui';
import { useAccount } from '../src/account';
import { supabase } from '../src/supabase';
import { colour, font, radius, TAP } from '../src/theme';

/**
 * The customer's home, laid out the way inDrive lays out its own: the ☰
 * menu top left (there is no tab bar), one big tile for the commonest job
 * with smaller ones beside it, then the one question Pechkas asks — what
 * needs fixing, and for how much — with the last jobs under it.
 *
 * Every tile opens the post screen with its trade chosen. Recent jobs are
 * this person's own, from my_jobs(); with none, the list is simply absent.
 */

type Recent = { id: string; ref: string; title: string; trade: string; status: string; live_offers: number };

const post = (params: { trade?: string; start?: string } = {}) => router.push({ pathname: '/post', params });

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
  const [recent, setRecent] = useState<Recent[]>([]);
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  useFocusEffect(
    useCallback(() => {
      if (!supabase || account?.role !== 'customer') return;
      let alive = true;
      supabase.rpc('my_jobs').then(({ data }) => {
        if (alive && Array.isArray(data)) setRecent((data as Recent[]).slice(0, 2));
      });
      return () => {
        alive = false;
      };
    }, [account?.role]),
  );

  if (account?.role === 'pro') return <Redirect href="/pro" />;

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

        <View style={s.greeting}>
          <Text style={s.hello}>{account?.first_name ? `Hello, ${account.first_name}` : 'Hello'}</Text>
          <Text style={s.title} accessibilityRole="header">
            What needs fixing?
          </Text>
        </View>

        <Animated.View style={{ gap: 12, transform: [{ translateY: rise }] }}>
          {/* The tiles: one big and two beside it, as inDrive's are. */}
          <View style={s.sheet}>
            <View style={s.tiles}>
              <Tile big label="AC" art="ac" onPress={() => post({ trade: 'ac' })} />
              <View style={s.column}>
                <Tile wide label="Electrician" art="electrician" onPress={() => post({ trade: 'electrician' })} />
                <Tile wide label="Plumber" art="plumber" onPress={() => post({ trade: 'plumber' })} />
              </View>
            </View>
          </View>

          {/* The one question, and the last two jobs under it. */}
          <View style={s.sheet}>
            <Press onPress={() => post()} accessibilityRole="button" sink={0.98} style={s.search}>
              <Icon name="search" size={24} color={colour.ink} strokeWidth={2.2} />
              <Text style={s.searchText}>What needs fixing & for how much?</Text>
            </Press>
            {recent.map((j) => (
              <Press key={j.id} onPress={() => router.push('/jobs')} accessibilityRole="button" sink={0.98} style={s.recent}>
                <Icon name="clock" size={22} color={colour.steel} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={s.recentTitle} numberOfLines={1}>
                    {j.title}
                  </Text>
                  <Text style={s.recentSub} numberOfLines={1}>
                    {j.ref} · {statusLine(j)}
                  </Text>
                </View>
              </Press>
            ))}
          </View>

          {/* More trades, side by side, like inDrive's ride types. */}
          <View style={s.sheet}>
            <Press onPress={() => post()} accessibilityRole="link" style={s.sectionHead} sink={0.98}>
              <Text style={s.h2}>More trades</Text>
              <View style={s.chev}>
                <Icon name="chevronRight" size={14} color={colour.ink} strokeWidth={2.6} />
              </View>
            </Press>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
              <Card label="UPS" art="ups" onPress={() => post({ trade: 'ups' })} />
              <Card label="CCTV" art="cctv" onPress={() => post({ trade: 'cctv' })} />
              <Card label="Wi-Fi" art="wifi" onPress={() => post({ trade: 'wifi' })} />
              <Card label="All trades" art="more" onPress={() => post()} />
            </ScrollView>
          </View>

          {/* Two ways to say what is wrong without typing. */}
          <View style={s.sheet}>
            <Text style={s.h2}>Describe it your way</Text>
            <Way icon="mic" title="Send a voice note" sub="Urdu or English, as you like." onPress={() => post({ start: 'voice' })} />
            <Way icon="video" title="Show a short video" sub="Point the camera at the fault." onPress={() => post({ start: 'video' })} last />
          </View>

          <View style={s.sheet}>
            <Text style={s.h2}>How Pechkas is different</Text>
            <Promise icon="shield" text="Every technician is checked before his first job: who he is, a trial job and our rules." />
            <Promise icon="lock" text="The price is agreed in the app before he comes. It changes only if you approve it." />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Tile({ label, art, onPress, big = false, wide = false, small = false }: { label: string; art: ArtName; onPress: () => void; big?: boolean; wide?: boolean; small?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} sink={0.97} style={[s.tile, big && s.tileBig, wide && s.tileWide, small && s.tileSmall]}>
      <Text style={[s.tileText, big && s.tileTextBig]}>{label}</Text>
      <View style={[s.tileArt, small && s.tileArtSmall]}>
        <Art name={art} width={big ? 150 : small ? 78 : 112} height={big ? 112 : small ? 58 : 84} />
      </View>
    </Press>
  );
}

function Card({ label, art, onPress }: { label: string; art: ArtName; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} sink={0.97} style={s.card}>
      <View style={s.cardArt}>
        <Art name={art} width={112} height={84} />
      </View>
      <Text style={s.cardText}>{label}</Text>
    </Press>
  );
}

function Way({ icon, title, sub, onPress, last = false }: { icon: IconName; title: string; sub: string; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" sink={0.98} style={[s.way, !last && s.wayRule]}>
      <View style={s.wayIcon}>
        <Icon name={icon} size={20} color={colour.ink} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.wayTitle}>{title}</Text>
        <Text style={s.waySub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2} />
    </Press>
  );
}

function Promise({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.promise}>
      <Icon name={icon} size={20} color={colour.green} strokeWidth={2.2} />
      <Text style={s.promiseText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colour.white, boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.10)' },
  cityText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  greeting: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 2 },
  hello: { fontFamily: font.bodyMedium, fontSize: 16, color: colour.steel },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: colour.ink, letterSpacing: -0.8 },

  sheet: { marginHorizontal: 10, padding: 12, borderRadius: 28, backgroundColor: colour.white, gap: 6 },
  tiles: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  tile: { borderRadius: 20, backgroundColor: colour.tile, padding: 12, overflow: 'hidden' },
  tileBig: { flex: 1.1, minHeight: 208 },
  tileWide: { flex: 1, minHeight: 100 },
  tileSmall: { flex: 1, minHeight: 100, padding: 10 },
  tileText: { fontFamily: font.displayBold, fontSize: 15, color: colour.ink },
  tileTextBig: { fontFamily: font.display, fontSize: 22 },
  tileArt: { position: 'absolute', right: -6, bottom: -4 },
  tileArtSmall: { right: -4, bottom: -2 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colour.canvas },
  searchText: { flex: 1, fontFamily: font.displayBold, fontSize: 16, color: colour.ink },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingHorizontal: 8 },
  recentTitle: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  recentSub: { fontFamily: font.body, fontSize: 13, color: colour.steel },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP, paddingHorizontal: 4 },
  h2: { fontFamily: font.display, fontSize: 20, color: colour.ink, paddingHorizontal: 4, paddingVertical: 6 },
  chev: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  card: { width: 132, gap: 8 },
  cardArt: { height: 112, borderRadius: 20, backgroundColor: colour.tile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink, paddingHorizontal: 4 },

  way: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 4 },
  wayRule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  wayIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  wayTitle: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  waySub: { fontFamily: font.body, fontSize: 13, color: colour.steel },

  promise: { flexDirection: 'row', gap: 12, paddingHorizontal: 4, paddingVertical: 6 },
  promiseText: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft },
});
