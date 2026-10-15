import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../src/components/Mark';
import { Icon, type IconName } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { colour, font, radius, TAP } from '../src/theme';

/**
 * The customer's home screen — board 1 of the "Pechkas App Look" canvas.
 *
 * Phase 0 draws it; nothing here talks to the database yet. Every control
 * leads to an honest "being built" screen rather than doing nothing, because
 * a button that does nothing tells the customer the app is broken.
 */

const TRADES: { label: string; icon: IconName }[] = [
  { label: 'AC', icon: 'ac' },
  { label: 'Electrician', icon: 'bolt' },
  { label: 'Plumber', icon: 'drop' },
  { label: 'CCTV', icon: 'cctv' },
  { label: 'Wi-Fi', icon: 'wifi' },
  { label: 'UPS', icon: 'ups' },
];

const soon = () => router.push('/soon');

export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} bounces={false}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headerRow}>
            <View style={styles.brand}>
              <Mark size={32} />
              <Text style={styles.wordmark}>pechkas</Text>
            </View>
            <Press style={styles.area} onPress={soon} accessibilityRole="button" accessibilityLabel="Choose your area. Islamabad.">
              <Icon name="pin" size={16} color={colour.yellow} strokeWidth={2} />
              <Text style={styles.areaText}>Islamabad</Text>
              <Icon name="chevronDown" size={14} color={colour.paper} strokeWidth={2} />
            </Press>
          </View>

          <Text style={styles.salaam}>Assalam o Alaikum</Text>
          <Text style={styles.title} accessibilityRole="header">
            What needs fixing today?
          </Text>

          <View style={styles.startRow}>
            <StartCard icon="mic" title="Say it" sub="A voice note. Urdu is fine." />
            <StartCard icon="video" title="Show it" sub="A short video of the fault." />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.sectionRow}>
            <Text style={styles.h2} accessibilityRole="header">
              Or pick a trade
            </Text>
            <Press onPress={soon} accessibilityRole="link" hitSlop={10}>
              <Text style={styles.link}>See all</Text>
            </Press>
          </View>

          <View style={styles.grid}>
            {TRADES.map((t) => (
              <Press key={t.label} style={styles.trade} onPress={soon} accessibilityRole="button" accessibilityLabel={t.label}>
                <Icon name={t.icon} size={26} />
                <Text style={styles.tradeText}>{t.label}</Text>
              </Press>
            ))}
          </View>

          <View style={styles.promise}>
            <Text style={styles.promiseTitle}>How Pechkas is different</Text>
            <PromiseLine icon="shield" text="We meet every technician in person before he gets a single job." />
            <PromiseLine icon="lock" text="The price is fixed in the app before he comes. No bargaining at the gate." />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
        <NavItem icon="home" label="Home" active />
        <NavItem icon="jobs" label="My jobs" />
        <NavItem icon="chat" label="Chats" />
        <NavItem icon="me" label="Me" />
      </View>
    </View>
  );
}

function StartCard({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <Press style={styles.start} onPress={soon} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <View style={styles.startIcon}>
        <Icon name={icon} size={20} color={colour.ink} strokeWidth={2} />
      </View>
      <Text style={styles.startTitle}>{title}</Text>
      <Text style={styles.startSub}>{sub}</Text>
    </Press>
  );
}

function PromiseLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.promiseRow}>
      <Icon name={icon} size={18} strokeWidth={2.2} />
      <Text style={styles.promiseText}>{text}</Text>
    </View>
  );
}

function NavItem({ icon, label, active = false }: { icon: IconName; label: string; active?: boolean }) {
  return (
    <Press
      style={styles.navItem}
      onPress={active ? undefined : soon}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      sink={0.94}
    >
      <Icon name={icon} size={22} color={active ? colour.green : colour.steel} filled={active} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.paper },

  header: {
    backgroundColor: colour.green,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontFamily: font.display, fontSize: 21, color: colour.paper, letterSpacing: -0.4 },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TAP,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(250,246,239,0.3)',
  },
  areaText: { fontFamily: font.bodyMedium, fontSize: 14, color: colour.paper },

  salaam: { marginTop: 22, marginBottom: 2, fontFamily: font.bodyMedium, fontSize: 15, color: colour.yellow },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 35, color: colour.paper, letterSpacing: -0.8 },

  startRow: { marginTop: 18, flexDirection: 'row', gap: 10 },
  start: { flex: 1, gap: 8, padding: 14, borderRadius: radius.big, backgroundColor: colour.paper },
  startIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colour.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  startSub: { marginTop: -4, fontFamily: font.body, fontSize: 12, lineHeight: 16, color: colour.steel },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  h2: { fontFamily: font.displayBold, fontSize: 19, color: colour.ink },
  link: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trade: {
    flexBasis: '30%',
    flexGrow: 1,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: colour.white,
    borderWidth: 1,
    borderColor: colour.rule,
  },
  tradeText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },

  promise: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.big, backgroundColor: colour.paper2 },
  promiseTitle: { fontFamily: font.displayBold, fontSize: 16, color: colour.ink },
  promiseRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  promiseText: { flex: 1, fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.ink },

  nav: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 8,
    backgroundColor: colour.white,
    borderTopWidth: 1,
    borderTopColor: colour.rule,
  },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navText: { fontFamily: font.body, fontSize: 11, color: colour.steel },
  navTextActive: { fontFamily: font.bodySemi, color: colour.green },
});
