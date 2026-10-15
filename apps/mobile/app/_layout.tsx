import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { AccountProvider } from '../src/account';
import { useNotificationTaps } from '../src/notifications';
import { colour } from '../src/theme';

// Keep the green splash up until the fonts are ready, so the first screen
// never flashes in a fallback typeface and then jumps.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, failed] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_600SemiBold,
  });

  // A font that will not load is not a reason to show nobody anything: the
  // system font is ugly, not broken.
  const ready = loaded || Boolean(failed);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AccountProvider>
        <StatusBar style="light" />
        <NotificationTaps />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colour.paper },
          }}
        />
      </AccountProvider>
    </SafeAreaProvider>
  );
}

/** Rendered beside the Stack, so a tapped notification only navigates once there is somewhere to go. */
function NotificationTaps() {
  useNotificationTaps();
  return null;
}
