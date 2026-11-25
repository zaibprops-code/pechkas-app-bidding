import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { Button, SystemBars } from '../src/components/ui';
import { colour, font, glow } from '../src/theme';

/**
 * After deleting an account: a calm goodbye, then back to the start. The
 * person is already signed out, so this screen is open to nobody signed in
 * (`OPEN` in `_layout.tsx`) and holds nothing of theirs but the first name
 * it was handed.
 */
export default function Goodbye() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <View style={s.middle}>
        <View style={s.disc}>
          <Svg width={78} height={78} viewBox="0 0 24 24" fill="none">
            <Path d="M4 12.5l5 5L20 6.5" stroke={colour.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <Text style={s.title} accessibilityRole="header">
          Your account is deleted
        </Text>
        <Text style={s.text}>{name ? `Goodbye, ${name}. ` : ''}Thank you for using Pechkas. You can sign up again any time.</Text>
      </View>
      <View style={s.foot}>
        <Button kind="ink" label="Back to the start" onPress={() => router.replace('/start')} />
      </View>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.canvas, justifyContent: 'center', padding: 24 },
  middle: { alignItems: 'center', gap: 12 },
  disc: { width: 150, height: 150, borderRadius: 75, backgroundColor: glow.yellow[1], alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontFamily: font.display, fontSize: 26, color: colour.ink, textAlign: 'center' },
  text: { fontFamily: font.body, fontSize: 15.5, lineHeight: 23, color: colour.steel, textAlign: 'center', maxWidth: 320 },
  foot: { marginTop: 32 },
});
