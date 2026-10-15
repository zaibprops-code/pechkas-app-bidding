import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { ask } from './supabase';
import type { Lang } from './words';

/**
 * Notifications, from the phone's side. The database decides who is told
 * what and sends it (supabase/migrations/…_notifications.sql); all the phone
 * does is say "yes, and this is my address", and open the right screen when
 * one is tapped.
 *
 * Asked at the moment it obviously helps — a technician going online, a
 * customer who has just posted — never on the first screen, where "allow
 * notifications?" from an app you opened ten seconds ago gets a no.
 */

export type NotifyState = 'on' | 'ask' | 'off' | 'unavailable';

const KEY = 'pechkas.pushToken';
const SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';
const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;

// While the app is open a notification still shows at the top, quietly: the
// person may be on another screen. The screen it is about updates by itself.
if (SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android shows nothing without a channel, and from Android 13 will not even
 * ask permission until one exists. Its name is what the person sees in the
 * phone's settings, so it says what it is for.
 */
async function channel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('jobs', {
    name: 'Jobs and offers',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#ffc53d',
    sound: 'default',
  });
}

async function state(): Promise<NotifyState> {
  if (!SUPPORTED) return 'unavailable';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'on';
  return p.canAskAgain ? 'ask' : 'off';
}

/**
 * Sends this phone's address to the database, if the person has said yes.
 * Called whenever a screen that wants notifications opens, so an address
 * Google has changed is put right the next time the app is used. Fails
 * quietly: a build without Firebase set up still works, it just cannot be
 * told anything, and the office sees that in the technician list.
 */
export async function register(lang: Lang): Promise<NotifyState> {
  const now = await state().catch(() => 'unavailable' as const);
  if (now !== 'on') return now;
  try {
    await channel();
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const r = await ask('save_push_token', { p_token: data, p_platform: Platform.OS, p_lang: lang });
    if (r.ok) await AsyncStorage.setItem(KEY, data);
    return 'on';
  } catch {
    return 'unavailable';
  }
}

/** Asks the person, then registers. Only ever from a button they pressed or a switch they flipped. */
export async function turnOn(lang: Lang): Promise<NotifyState> {
  if (!SUPPORTED) return 'unavailable';
  try {
    await channel();
    const p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return p.canAskAgain ? 'ask' : 'off';
  } catch {
    return 'unavailable';
  }
  return register(lang);
}

/**
 * Signing out: this phone stops being told about this person. Must happen
 * BEFORE the sign-out, while the database still knows who is asking.
 */
export async function forget(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (token) await ask('forget_push_token', { p_token: token });
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Signing out must work with no signal at all.
  }
}

/**
 * Whether this phone can be told, kept current, and registered on the way.
 * Checked again whenever the app comes back to the front, because "turn it
 * on in Settings" means the person leaves and comes back.
 */
export function useNotify(lang: Lang) {
  const [notify, setNotify] = useState<NotifyState | null>(null);

  const check = useCallback(() => {
    register(lang).then(setNotify);
  }, [lang]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const ask = useCallback(async () => {
    setNotify(await turnOn(lang));
  }, [lang]);

  return { notify, ask };
}

/** Only screens a notification is allowed to open. */
const PLACES = new Set(['/pro', '/jobs']);

/**
 * Tapping a notification opens what it is about. Once per notification: the
 * last one tapped is remembered by the phone and would otherwise reopen its
 * screen every time the app starts.
 */
export function useNotificationTaps() {
  const response = SUPPORTED ? Notifications.useLastNotificationResponse() : null;
  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    const url = response.notification.request.content.data?.url;
    AsyncStorage.getItem('pechkas.lastTap')
      .then(async (last) => {
        if (last === id) return;
        await AsyncStorage.setItem('pechkas.lastTap', id);
        if (typeof url === 'string' && PLACES.has(url)) router.push(url as '/pro' | '/jobs');
      })
      .catch(() => {});
  }, [response]);
}
