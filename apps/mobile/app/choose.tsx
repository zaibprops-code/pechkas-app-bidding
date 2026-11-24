import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { showMobile } from '@pechkas/shared';
import { AuthButton, AuthScreen } from '../src/components/AuthScreen';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import type { Mode } from '../src/mode';
import { amber, colour, font } from '../src/theme';

/**
 * The first question after signing in for the first time: how is this
 * person going to use Pechkas? On the amber sign-in screen (AuthScreen), so
 * it follows the code without a jump — there is no separate "signed in"
 * screen (the owner's choice, 24 November 2026): the code's boxes turn green,
 * and the app comes straight here.
 *
 * Two big cards and nothing else, the way inDrive asks "passenger or driver"
 * before anything else. The two must never look alike: the customer's is
 * white, the technician's green, each naming its side with its own icon.
 * No back button: going back to the code would make no sense once it has
 * worked. It is not for ever — either side can switch from the menu later
 * (src/mode.ts, public.switch_mode) — and the screen says so, so nobody
 * agonises over it. Which account this is, and Sign out, are at the foot.
 */
export default function Choose() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { account, signOut } = useAccount();

  // Already chosen: this screen has nothing to ask.
  if (account?.role) {
    if (account.needs_phone) return <Redirect href="/welcome" />;
    return <Redirect href={account.role === 'pro' ? '/pro' : '/'} />;
  }

  const pick = (as: Mode) => router.push({ pathname: '/welcome', params: { as, next: next ?? '' } });
  const who = account?.phone ? showMobile(account.phone) : account?.email ?? null;

  return (
    <AuthScreen
      title="How will you use Pechkas?"
      sub="Choose one. You can switch any time from the menu."
      back={false}
      footer={
        <>
          {who ? <Text style={s.who}>Signed in as {who}</Text> : null}
          <AuthButton
            kind="second"
            icon="logout"
            label="Not you? Sign out"
            onPress={async () => {
              await signOut();
              router.replace('/start');
            }}
          />
        </>
      }
    >
      <View style={{ gap: 12 }} accessibilityRole="radiogroup">
        <Card side="customer" icon="home" label="Customer" title="I need something fixed" sub="Post a job, name your price and choose who comes." onPress={() => pick('customer')} />
        <Card side="pro" icon="briefcase" label="Technician" title="I fix things" sub="Apply to work with Pechkas and get jobs in your areas." onPress={() => pick('pro')} />
      </View>
    </AuthScreen>
  );
}

function Card({ side, icon, label, title, sub, onPress }: { side: Mode; icon: DuoName; label: string; title: string; sub: string; onPress: () => void }) {
  const pro = side === 'pro';
  // A small phone keeps the title on one line and the card short.
  const narrow = useWindowDimensions().width < 360;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}. ${sub}`}
      sink={0.97}
      style={[s.card, pro ? s.cardPro : s.cardCustomer, narrow && s.cardNarrow]}
    >
      <View style={[s.tile, pro && s.tilePro, narrow && s.tileNarrow]}>
        <DuoIcon name={icon} size={26} ink={pro ? colour.white : colour.ink} />
      </View>
      <View style={s.words}>
        <Text style={[s.label, pro && s.labelPro]}>{label}</Text>
        <Text style={[s.title, pro && s.titlePro, narrow && s.titleNarrow]}>{title}</Text>
        <Text style={[s.sub, pro && s.subPro]}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={22} color={pro ? colour.white : colour.ink} strokeWidth={2.2} />
    </Press>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 18, minHeight: 96 },
  cardCustomer: { backgroundColor: colour.white, boxShadow: '0px 6px 18px rgba(120, 70, 0, 0.12)' },
  cardPro: { backgroundColor: colour.green, boxShadow: '0px 10px 24px rgba(11, 81, 72, 0.28)' },
  tile: { width: 52, height: 52, borderRadius: 16, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  tilePro: { backgroundColor: colour.greenDark },
  cardNarrow: { padding: 14, gap: 12 },
  tileNarrow: { width: 44, height: 44, borderRadius: 14 },
  titleNarrow: { fontSize: 17, lineHeight: 22 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontFamily: font.displayBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: amber.ink },
  labelPro: { color: colour.greenSoft },
  title: { fontFamily: font.display, fontSize: 19, lineHeight: 24, color: colour.ink },
  titlePro: { color: colour.white },
  sub: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft, marginTop: 2 },
  subPro: { color: colour.greenSoft },
  who: { fontFamily: font.bodyMedium, fontSize: 14, color: amber.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
