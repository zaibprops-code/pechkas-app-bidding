import { Animated, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Art, type ArtName } from '../src/components/Art';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Screen, useArrive } from '../src/components/ui';
import { useAccount } from '../src/account';
import type { Mode } from '../src/mode';
import { colour, font, shadow, TAP } from '../src/theme';

/**
 * The first question after signing in for the first time: how is this
 * person going to use Pechkas? Two big cards and nothing else, the way
 * inDrive asks "passenger or driver" before anything else — so the choice
 * cannot be missed under a form.
 *
 * It is not for ever. Either side can switch from the menu later
 * (src/mode.ts, public.switch_mode), and the screen says so, so nobody
 * agonises over it.
 *
 * The two cards must never look alike (the owner's screenshot: two cream
 * cards on a cream-grey screen read as one block). The customer's is the
 * white card every screen uses; the technician's is the screen's one green
 * card. Each names its side ("Customer", "Technician") with its own icon,
 * and an "or" stands between them.
 */
export default function Choose() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { account, signOut } = useAccount();
  const arrive = useArrive();
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  // Already chosen: this screen has nothing to ask.
  if (account?.role) {
    if (account.needs_phone) return <Redirect href="/welcome" />;
    return <Redirect href={account.role === 'pro' ? '/pro' : '/'} />;
  }

  const pick = (as: Mode) => router.push({ pathname: '/welcome', params: { as, next: next ?? '' } });

  return (
    <Screen hero={{ title: 'How will you use Pechkas?', sub: 'Choose one. You can switch any time from the menu.' }}>
      <Animated.View style={{ gap: 14, transform: [{ translateY: rise }] }} accessibilityRole="radiogroup">
        <Card
          side="customer"
          icon="home"
          label="Customer"
          art="ac"
          title="I need something fixed"
          sub="Post a job and name your price. Checked technicians make offers, and you choose one."
          onPress={() => pick('customer')}
        />
        <View style={s.or} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={s.orLine} />
          <Text style={s.orText}>or</Text>
          <View style={s.orLine} />
        </View>
        <Card
          side="pro"
          icon="briefcase"
          label="Technician"
          art="electrician"
          title="I fix things"
          sub="Apply to work with Pechkas. Once we have checked you, jobs in your areas come to your phone."
          onPress={() => pick('pro')}
        />
      </Animated.View>
      <Press
        onPress={async () => {
          await signOut();
          router.replace('/start');
        }}
        accessibilityRole="button"
        style={s.out}
      >
        <Text style={s.outText}>Not you? Sign out</Text>
      </Press>
    </Screen>
  );
}

function Card({
  side,
  icon,
  label,
  art,
  title,
  sub,
  onPress,
}: {
  side: Mode;
  icon: DuoName;
  label: string;
  art: ArtName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const pro = side === 'pro';
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}. ${sub}`}
      sink={0.97}
      style={[s.card, pro ? s.cardPro : s.cardCustomer]}
    >
      <View style={s.side}>
        <View style={[s.tile, pro && s.tilePro]}>
          <DuoIcon name={icon} size={24} ink={pro ? colour.white : colour.ink} />
        </View>
        <Text style={[s.label, pro && s.labelPro]}>{label}</Text>
      </View>
      <View style={s.words}>
        <Text style={[s.title, pro && s.titlePro]}>{title}</Text>
        <Text style={[s.sub, pro && s.subPro]}>{sub}</Text>
      </View>
      <View style={s.foot}>
        <View style={s.go}>
          <Icon name="arrowRight" size={22} color={colour.ink} strokeWidth={2.2} />
        </View>
        <View style={s.art}>
          <Art name={art} width={112} height={84} />
        </View>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, gap: 12, overflow: 'hidden' },
  cardCustomer: { backgroundColor: colour.white, boxShadow: shadow.card },
  cardPro: { backgroundColor: colour.green },
  side: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  tilePro: { backgroundColor: colour.greenDark },
  label: { fontFamily: font.displayBold, fontSize: 12.5, letterSpacing: 1, textTransform: 'uppercase', color: colour.steel },
  labelPro: { color: colour.greenSoft },
  words: { gap: 6, maxWidth: 300 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 29, color: colour.ink },
  titlePro: { color: colour.white },
  sub: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft },
  subPro: { color: colour.greenSoft },
  foot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  go: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  art: { width: 124, height: 92, borderRadius: 18, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: colour.rule },
  orText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel },
  out: { alignSelf: 'center', minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12 },
  outText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
