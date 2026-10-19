import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../src/components/Mark';
import { Icon, type IconName } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { ThisCopy } from '../src/components/ThisCopy';
import { Button } from '../src/components/ui';
import { useAccount } from '../src/account';
import { PRIVACY_URL, TERMS_URL } from '../src/office';
import { colour, font, radius, TAP } from '../src/theme';

/**
 * The first screen after installing, and after signing out: who Pechkas is,
 * then sign in or sign up — the same step, since a new number or email
 * simply becomes a new account. Nothing else in the app opens until then
 * (the gate is in app/_layout.tsx).
 *
 * Every line here must stay true of the app: checked technicians, a price
 * agreed before he comes, cash after the job.
 */
export default function Start() {
  const insets = useSafeAreaInsets();
  const { connected } = useAccount();
  const go = (mode: 'phone' | 'email') => router.push({ pathname: '/sign-in', params: { mode } });

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 28, paddingBottom: Math.max(insets.bottom, 20) }]} bounces={false}>
        <View style={s.brand}>
          <Mark size={44} />
          <Text style={s.wordmark}>pechkas</Text>
        </View>

        <View style={s.middle}>
          <Text style={s.kicker}>Home repairs in Islamabad</Text>
          <Text style={s.title} accessibilityRole="header">
            Checked technicians, at a price you agree first.
          </Text>
          <View style={s.points}>
            <Point icon="shield" text="Every technician is checked in person before he gets a single job." />
            <Point icon="lock" text="You name your price. Nothing changes unless you approve it in the app." />
            <Point icon="jobs" text="Pay in cash when the job is done." />
          </View>
        </View>

        <View style={s.bottom}>
          {connected ? null : (
            <View style={s.offline}>
              <Text style={s.offlineText}>This copy of the app is not connected to Pechkas yet, so nobody can sign in. Please install the newest version.</Text>
              <ThisCopy dark />
            </View>
          )}
          <Button label="Continue with mobile number" onPress={() => go('phone')} />
          <Button kind="outline" dark label="Continue with email" onPress={() => go('email')} />
          <Text style={s.small}>New to Pechkas? Continuing creates your account. Customers and technicians use the same sign-in.</Text>
          <View style={s.legal}>
            <Text style={s.small}>By continuing you agree to the</Text>
            <View style={s.links}>
              <Press onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" style={s.link}>
                <Text style={s.linkText}>Terms of use</Text>
              </Press>
              <Text style={s.small}>and the</Text>
              <Press onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" style={s.link}>
                <Text style={s.linkText}>Privacy policy</Text>
              </Press>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Point({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.point}>
      <View style={s.pointIcon}>
        <Icon name={icon} size={18} color={colour.ink} strokeWidth={2.2} />
      </View>
      <Text style={s.pointText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.green },
  content: { flexGrow: 1, paddingHorizontal: 22, gap: 28, justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wordmark: { fontFamily: font.display, fontSize: 28, color: colour.paper, letterSpacing: -0.6 },
  middle: { gap: 14 },
  kicker: { fontFamily: font.bodySemi, fontSize: 15, color: colour.yellow },
  title: { fontFamily: font.display, fontSize: 34, lineHeight: 38, color: colour.paper, letterSpacing: -0.8 },
  points: { gap: 14, marginTop: 8 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 36, height: 36, borderRadius: radius.card - 4, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.paper },
  bottom: { gap: 12 },
  offline: { gap: 10, padding: 14, borderRadius: radius.big, backgroundColor: colour.ink },
  offlineText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.paper },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.paper, textAlign: 'center' },
  legal: { alignItems: 'center' },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', columnGap: 6 },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.yellow, textDecorationLine: 'underline' },
});
