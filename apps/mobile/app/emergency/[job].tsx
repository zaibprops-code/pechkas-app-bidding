import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { useAccount } from '../../src/account';
import { EMERGENCY_NUMBERS } from '../../src/emergency';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../../src/office';
import { ask } from '../../src/supabase';
import { useProWords } from '../../src/words';
import { colour, font, radius } from '../../src/theme';

/**
 * The emergency button. Opening this screen IS pressing it: Pechkas is told
 * first, at once, and where the phone is follows a moment later if the phone
 * will say. Meanwhile the numbers that actually send help are the biggest
 * things on the screen. A press by mistake is one tap to take back, and the
 * office is told that too.
 */

const CUSTOMER = {
  emTitle: 'Emergency',
  emSending: 'Telling Pechkas…',
  emSent: 'Pechkas has been told. The office will call you.',
  emNotSent: 'Pechkas could not be told. Call the numbers below yourself.',
  emCallFirst: 'If anyone is in danger, call these first:',
  emPolice: 'Police',
  emRescue: 'Rescue',
  emFire: 'Fire brigade',
  emEdhi: 'Edhi ambulance',
  emOffice: 'Pechkas office',
  emMistake: 'Pressed by mistake',
  emMistakeDone: 'The office has been told it was a mistake.',
  back: 'Back',
};

export default function Emergency() {
  const { job } = useLocalSearchParams<{ job: string }>();
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  const { w: proWords } = useProWords();
  const w = pro ? proWords : CUSTOMER;
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'sending' | 'sent' | 'failed'>('sending');
  const [why, setWhy] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [mistake, setMistake] = useState(false);
  const pressed = useRef(false);

  useEffect(() => {
    // Once, however often this screen draws itself.
    if (pressed.current || !job) return;
    pressed.current = true;
    (async () => {
      const r = await ask<{ id: string }>('emergency', { p_job: job });
      if (!r.ok) {
        setState('failed');
        setWhy(r.why);
        return;
      }
      setId(r.id);
      setState('sent');
      // Where the phone is: only after Pechkas has already been told, and
      // never holding anything up. No permission, no fix — still told.
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await ask('emergency_where', { p_id: r.id, p_lat: here.coords.latitude, p_lng: here.coords.longitude });
      } catch {
        // The alert has gone; the place is a bonus.
      }
    })();
  }, [job]);

  async function takeBack() {
    if (!id) return;
    const r = await ask('emergency_mistake', { p_id: id });
    if (r.ok) setMistake(true);
  }

  const status = state === 'sending' ? w.emSending : state === 'sent' ? w.emSent : w.emNotSent;

  return (
    <View style={{ flex: 1, backgroundColor: pro ? colour.ink : colour.paper }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) + 8, gap: 14 }}>
        <View style={s.head}>
          <Icon name="alert" size={30} color={colour.white} strokeWidth={2.2} />
          <Text style={s.title} accessibilityRole="header">
            {w.emTitle}
          </Text>
        </View>
        <View style={[s.status, { backgroundColor: state === 'failed' ? '#f6e3dc' : colour.greenSoft }]} accessibilityRole="alert">
          <Text style={[s.statusText, { color: state === 'failed' ? colour.brick : colour.greenDark }]}>{mistake ? w.emMistakeDone : status}</Text>
          {state === 'failed' && why ? <Text style={s.why}>{why}</Text> : null}
        </View>

        <Text style={[s.lead, { color: pro ? colour.paper : colour.ink }]}>{w.emCallFirst}</Text>
        {EMERGENCY_NUMBERS.map((e) => (
          <Button key={e.number} kind="danger" label={`${w[e.key]} · ${e.number}`} onPress={() => Linking.openURL(`tel:${e.number}`)} />
        ))}
        <Button kind="green" label={`${w.emOffice} · ${OFFICE_PHONE_SHOWN}`} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />

        {state === 'sent' && !mistake ? <Button kind="outline" dark={pro} label={w.emMistake} onPress={takeBack} /> : null}
        <Button kind="outline" dark={pro} label={w.back} onPress={() => (router.canGoBack() ? router.back() : router.replace(pro ? '/pro' : '/jobs'))} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.big, backgroundColor: colour.brick },
  title: { fontFamily: font.display, fontSize: 28, color: colour.white },
  status: { padding: 14, borderRadius: radius.card, gap: 4 },
  statusText: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22 },
  why: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.brick },
  lead: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21 },
});
