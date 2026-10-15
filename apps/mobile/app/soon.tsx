import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../src/components/Mark';
import { Press } from '../src/components/Press';
import { colour, font, radius } from '../src/theme';

/**
 * Where every unbuilt button leads during the early phases.
 *
 * It says plainly that the part is not built yet. A button that does nothing
 * reads as a broken app; a button that says "not yet" reads as an honest one.
 * This screen is deleted when phase 4 has given every button its real job.
 */
export default function Soon() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      {/* Cream background, so the clock and battery icons must be dark. */}
      <StatusBar style="dark" />
      <View style={styles.middle}>
        <Mark size={72} />
        <Text style={styles.title} accessibilityRole="header">
          Being built
        </Text>
        <Text style={styles.text}>
          This part of Pechkas is not ready yet. Posting a job and getting offers come in the next steps.
        </Text>
      </View>
      <Press style={styles.button} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button">
        <Text style={styles.buttonText}>Back</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.paper, paddingHorizontal: 24 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontFamily: font.display, fontSize: 28, color: colour.ink, letterSpacing: -0.6 },
  text: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.inkSoft, textAlign: 'center', maxWidth: 300 },
  button: {
    minHeight: 56,
    borderRadius: radius.big,
    backgroundColor: colour.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: font.display, fontSize: 18, color: colour.ink },
});
