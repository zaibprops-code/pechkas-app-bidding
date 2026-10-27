import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useSegments, type ErrorBoundaryProps } from 'expo-router';
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
import { ToastHost } from '../src/components/Toast';
import { Trouble } from '../src/components/Trouble';

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
        <ToastHost>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colour.paper },
            }}
          />
        </ToastHost>
        <LaunchTrouble />
        {launched ? null : <LaunchScrew decided={decided} onDone={onLaunched} />}
      </AccountProvider>
    </SafeAreaProvider>
  );
}

/** Screens anybody may see without an account: the welcome screen and the steps of signing in. */
const OPEN = new Set(['start', 'sign-in', 'verify', 'auth-callback', 'legal']);
/** Screens a signed-in account may be on before it has a mode and a number. */
const SETTING_UP = new Set(['choose', 'welcome', 'verify', 'auth-callback', 'legal']);

/**
 * Like every big app: nothing opens until you have signed in. A phone with
 * nobody signed in goes to the welcome screen; a signed-in phone that lands
 * on the welcome or sign-in screen goes to its own home; an account that has
 * not finished setting up goes to finish it: "How will you use Pechkas?"
 * when it has no mode yet, the welcome screen when an email account still
 * has no mobile number. The green cover stays up until this has been
 * decided, so the home screen never flashes before the welcome screen.
 */
function Gate({ onDecided }: { onDecided: () => void }) {
  const { ready, session, account, trouble } = useAccount();
  const first = useSegments()[0] ?? '';

  useEffect(() => {
    if (!ready) return;
    let moved = false;
    if (trouble) {
      // We do not know who this is yet: no internet, or Pechkas not
      // answering. Move nobody — "signed out" would be a guess — and let
      // the green lift off the trouble screen, which asks again.
    } else if (!session) {
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
      router.replace(account.role ? '/welcome' : '/choose');
      moved = true;
    }
    // Give a redirect a moment to draw before the green lifts off it.
    const t = setTimeout(onDecided, moved ? 150 : 0);
    return () => clearTimeout(t);
  }, [ready, session, account, trouble, first, onDecided]);

  return null;
}

/** Rendered beside the Stack, so a tapped notification only navigates once there is somewhere to go. */
function NotificationTaps() {
  useNotificationTaps();
  return null;
}

/**
 * Opening the app with no internet, or while Pechkas is not answering: the
 * full trouble screen, over whatever was underneath, until an answer comes.
 * It asks again by itself when the connection is back.
 */
function LaunchTrouble() {
  const { trouble, retry } = useAccount();
  if (!trouble) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Trouble kind={trouble} full onRetry={retry} />
    </View>
  );
}

/**
 * The crash screen. Anything a screen throws while it draws lands here
 * instead of leaving a blank white phone. "Try again" draws the same screen
 * again; "Go to home" starts from the top. The details are on the screen so
 * the owner's screenshot says what went wrong.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Trouble
      kind="broken"
      full
      detail={error?.message || null}
      onRetry={retry}
      onHome={() => {
        try {
          router.replace('/');
        } catch {
          // Nowhere to go yet: trying again starts from where we were.
        }
        retry();
      }}
    />
  );
}
