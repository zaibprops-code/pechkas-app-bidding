import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { showMobile } from '@pechkas/shared';
import { AuthButton, AuthNote, AuthScreen } from '../src/components/AuthScreen';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Pop } from '../src/components/SignInArt';
import { useAccount } from '../src/account';
import type { Mode } from '../src/mode';
import { colour, font } from '../src/theme';

/**
 * The first question after signing in for the first time: customer or
 * technician? On the sign-in screen (AuthScreen, design "C"), so it follows
 * the code without a jump — there is no separate "signed in" screen (the
 * owner's choice, 24 November 2026): the code's boxes turn green, and the
 * app comes straight here.
 *
 * Two cards side by side, each with its own drawing and the words people
 * use: "I need something repaired" / "I repair things and want work". A tap
 * picks a card — a tick pops in, its drawing in the picture above gives a
 * small hop — and the button underneath says what was picked ("Continue as
 * a customer"), so a slip of the finger goes nowhere. No back button: going
 * back to the code makes no sense once it has worked. It is not for ever —
 * either side can switch from the menu later (src/mode.ts,
 * public.switch_mode) — and the screen says so, so nobody agonises over it.
 * Which account this is, and Not you? Sign out, are at the foot.
 */
export default function Choose() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { account, signOut } = useAccount();
  const [picked, setPicked] = useState<Mode | null>(null);
  const [hop, setHop] = useState<{ side: Mode; n: number } | null>(null);

  // Already chosen: this screen has nothing to ask.
  if (account?.role) {
    if (account.needs_phone) return <Redirect href="/welcome" />;
    return <Redirect href={account.role === 'pro' ? '/pro' : '/'} />;
  }

  const pick = (as: Mode) => {
    setPicked(as);
    setHop((h) => ({ side: as, n: (h?.n ?? 0) + 1 }));
  };
  const go = () => picked && router.push({ pathname: '/welcome', params: { as: picked, next: next ?? '' } });
  const who = account?.phone ? showMobile(account.phone) : account?.email ?? null;

  return (
    <AuthScreen
      art="both"
      artHop={hop}
      title="Are you a customer or a technician?"
      back={false}
      footer={
        <>
          <AuthButton
            label={picked === 'customer' ? 'Continue as a customer' : picked === 'pro' ? 'Continue as a technician' : 'Continue'}
            arrow
            off={!picked}
            hint="Choose customer or technician first."
            onPress={go}
          />
          <View style={s.foot}>
            {who ? (
              <Text style={s.who} numberOfLines={1}>
                Signed in as {who}
              </Text>
            ) : null}
            <Press
              onPress={async () => {
                await signOut();
                router.replace('/start');
              }}
              accessibilityRole="button"
              accessibilityLabel="Not you? Sign out"
              sink={0.94}
              style={s.out}
            >
              <Text style={s.outText}>Not you? Sign out</Text>
            </Press>
          </View>
        </>
      }
    >
      <View style={s.cards} accessibilityRole="radiogroup">
        <Card side="customer" picked={picked} label="Customer" line="I need something repaired" onPress={() => pick('customer')} />
        <Card side="pro" picked={picked} label="Technician" line="I repair things and want work" onPress={() => pick('pro')} />
      </View>
      <AuthNote icon="swap" text="You can change this later from the menu." />
    </AuthScreen>
  );
}

function Card({ side, picked, label, line, onPress }: { side: Mode; picked: Mode | null; label: string; line: string; onPress: () => void }) {
  const on = picked === side;
  // A small phone keeps both cards side by side; only the drawing and the type shrink.
  const narrow = useWindowDimensions().width < 360;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}. ${line}.`}
      sink={0.97}
      style={[s.card, on ? s.cardOn : s.cardOff, narrow && s.cardNarrow]}
    >
      {on ? (
        <Pop style={[s.mark, s.markOn]}>
          <Icon name="check" size={14} color={colour.white} strokeWidth={3} />
        </Pop>
      ) : (
        <View style={[s.mark, s.markOff]} />
      )}
      <View style={narrow ? s.drawingNarrow : s.drawing}>{side === 'customer' ? <House /> : <Toolbox />}</View>
      <Text style={[s.label, narrow && s.labelNarrow]}>{label}</Text>
      <Text style={s.line}>{line}</Text>
    </Press>
  );
}

const LINE = { stroke: colour.ink, strokeWidth: 3.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** The customer's card: a house, its door yellow. */
function House() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 120 110">
      <Path d="M10 52 60 12l50 40" fill="none" {...LINE} />
      <Path d="M22 44v58h76V44" fill={colour.white} {...LINE} />
      <Rect x={50} y={68} width={20} height={34} fill={colour.yellow} {...LINE} />
      <Rect x={30} y={56} width={14} height={14} fill={colour.greenSoft} {...LINE} />
    </Svg>
  );
}

/** The technician's card: a toolbox. */
function Toolbox() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 120 110">
      <Rect x={12} y={40} width={96} height={62} rx={9} fill={colour.yellow} {...LINE} />
      <Path d="M42 40V28a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v12" fill="none" {...LINE} />
      <Path d="M12 64h96" {...LINE} />
      <Rect x={52} y={57} width={16} height={15} rx={3} fill={colour.white} {...LINE} />
    </Svg>
  );
}

const s = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, borderRadius: 22, padding: 14, paddingBottom: 16, minHeight: 180 },
  cardOn: { backgroundColor: colour.softYellow, borderWidth: 2.5, borderColor: colour.ink },
  cardOff: { backgroundColor: colour.white, borderWidth: 1.5, borderColor: 'rgba(20,23,26,0.14)' },
  cardNarrow: { padding: 12, minHeight: 0 },
  mark: { position: 'absolute', right: 12, top: 12, width: 26, height: 26, borderRadius: 13 },
  markOn: { backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  markOff: { borderWidth: 2, borderColor: 'rgba(20,23,26,0.25)' },
  drawing: { width: 74, height: 66 },
  drawingNarrow: { width: 60, height: 54 },
  label: { fontFamily: font.display, fontSize: 19, color: colour.ink, marginTop: 10 },
  labelNarrow: { fontSize: 17 },
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel, marginTop: 3 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 4 },
  who: { fontFamily: font.bodyMedium, fontSize: 14, color: colour.steel, fontVariant: ['tabular-nums'] },
  out: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  outText: { fontFamily: font.display, fontSize: 14, color: colour.ink, textDecorationLine: 'underline' },
});
