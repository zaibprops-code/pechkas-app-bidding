import { useCallback, useEffect, useState } from 'react';
import { router, Stack, useSegments } from 'expo-router';
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
import { AccountProvider, useAccount } from '../src/account';
import { routeFor } from '../src/route';
import { useNotificationTaps } from '../src/notifications';
import { colour } from '../src/theme';
import { LaunchScrew } from '../src/components/LaunchScrew';

// Keep the green splash up until the fonts are ready. Then LaunchScrew draws
// the same picture, hides the phone's, and turns the screw until the gate
// below has decided where this person belongs — so the first screen never
// flashes in a fallback typeface or flashes the wrong screen.
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
  const [decided, setDecided] = useState(false);
  const [launched, setLaunched] = useState(false);
  const onDecided = useCallback(() => setDecided(true), []);
  const onLaunched = useCallback(() => setLaunched(true), []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AccountProvider>
        <StatusBar style="light" />
        <NotificationTaps />
        <Gate onDecided={onDecided} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colour.paper },
          }}
        />
        {launched ? null : <LaunchScrew decided={decided} onDone={onLaunched} />}
      </AccountProvider>
    </SafeAreaProvider>
  );
}

/** Screens anybody may see without an account: the welcome screen and the steps of signing in. */
const OPEN = new Set(['start', 'sign-in', 'verify', 'auth-callback']);
/** Screens a signed-in account may be on before it has a role and a number. */
const SETTING_UP = new Set(['welcome', 'verify', 'auth-callback']);

/**
 * Like every big app: nothing opens until you have signed in. A phone with
 * nobody signed in goes to the welcome screen; a signed-in phone that lands
 * on the welcome or sign-in screen goes to its own home; an account that has
 * not finished setting up (no role yet, or an email account with no mobile
 * number) goes to finish it. The green cover stays up until this has been
 * decided, so the home screen never flashes before the welcome screen.
 */
function Gate({ onDecided }: { onDecided: () => void }) {
  const { ready, session, account } = useAccount();
  const first = useSegments()[0] ?? '';

  useEffect(() => {
    if (!ready) return;
    let moved = false;
    if (!session) {
      if (!OPEN.has(first)) {
        router.replace('/start');
        moved = true;
      }
    } else if (first === 'start' || first === 'sign-in') {
      // Wait for the account: routeFor() needs to know who this is.
      if (account) {
        routeFor(account);
        moved = true;
      }
    } else if (account && (!account.role || account.needs_phone) && !SETTING_UP.has(first)) {
      router.replace('/welcome');
      moved = true;
    }
    // Give a redirect a moment to draw before the green lifts off it.
    const t = setTimeout(onDecided, moved ? 150 : 0);
    return () => clearTimeout(t);
  }, [ready, session, account, first, onDecided]);

  return null;
}

/** Rendered beside the Stack, so a tapped notification only navigates once there is somewhere to go. */
function NotificationTaps() {
  useNotificationTaps();
  return null;
}
