import { Animated, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Art, type ArtName } from '../src/components/Art';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Screen, useArrive } from '../src/components/ui';
import { useAccount } from '../src/account';
import type { Mode } from '../src/mode';
import { colour, font, TAP } from '../src/theme';

/**
 * The first question after signing in for the first time: how is this
 * person going to use Pechkas? Two big cards and nothing else, the way
 * inDrive asks "passenger or driver" before anything else — so the choice
 * cannot be missed under a form.
 *
 * It is not for ever. Either side can switch from the menu later
 * (src/mode.ts, public.switch_mode), and the screen says so, so nobody
 * agonises over it.
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
      <Animated.View style={{ gap: 12, transform: [{ translateY: rise }] }} accessibilityRole="radiogroup">
        <Card
          art="ac"
          title="I need something fixed"
          sub="Post a job and name your price. Checked technicians make offers, and you choose one."
          onPress={() => pick('customer')}
        />
        <Card
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

function Card({ art, title, sub, onPress }: { art: ArtName; title: string; sub: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} sink={0.97} style={s.card}>
      <View style={s.words}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      <View style={s.foot}>
        <View style={s.go}>
          <Icon name="arrowRight" size={22} color={colour.ink} strokeWidth={2.2} />
        </View>
        <View style={s.art}>
          <Art name={art} width={132} height={99} />
        </View>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, backgroundColor: colour.tile, padding: 18, minHeight: 200, overflow: 'hidden', justifyContent: 'space-between' },
  words: { gap: 6, maxWidth: 300 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 29, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  foot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
  go: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  art: { marginRight: -10, marginBottom: -12 },
  out: { alignSelf: 'center', minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12 },
  outText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
