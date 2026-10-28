import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, SystemBars } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { EmergencyTiles } from '../../src/components/EmergencyTiles';
import { DuoRow, RowCard } from '../../src/components/Rows';
import { useAccount } from '../../src/account';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN } from '../../src/office';
import { ask } from '../../src/supabase';
import { useProWords } from '../../src/words';
import { colour, font, shadow } from '../../src/theme';

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

  const tone = mistake || state === 'sent' ? 'ok' : state === 'failed' ? 'bad' : 'wait';

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 28, gap: 14 }}>
        {/* The one screen that is red at the top: nobody should wonder where they are. */}
        <View style={s.head}>
          <View style={s.headDisc}>
            <Icon name="alert" size={26} color={colour.brick} strokeWidth={2.4} />
          </View>
          <Text style={s.title} accessibilityRole="header">
            {w.emTitle}
          </Text>
        </View>

        {/* Whether Pechkas has been told, said first and plainly. */}
        <View style={[s.status, tone === 'bad' && s.statusBad]} accessibilityRole="alert">
          <View style={[s.statusIcon, tone === 'ok' ? s.statusIconOk : tone === 'bad' ? s.statusIconBad : null]}>
            {tone === 'wait' ? (
              <ScrewSpinner size={24} label={w.emSending} />
            ) : (
              <Icon name={tone === 'ok' ? 'check' : 'alert'} size={22} color={colour.white} strokeWidth={2.6} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.statusText, tone === 'bad' && { color: colour.brick }]}>{mistake ? w.emMistakeDone : status}</Text>
            {state === 'failed' && why ? <Text style={s.why}>{why}</Text> : null}
          </View>
        </View>

        <Text style={s.lead} accessibilityRole="header">
          {w.emCallFirst}
        </Text>
        <EmergencyTiles label={(k) => w[k]} />
        <RowCard>
          <DuoRow icon="support" label={w.emOffice} value={OFFICE_PHONE_SHOWN} onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} last />
        </RowCard>

        {state === 'sent' && !mistake ? <Button kind="outline" label={w.emMistake} onPress={takeBack} /> : null}
        <Button kind="outline" label={w.back} onPress={() => (router.canGoBack() ? router.back() : router.replace(pro ? '/pro' : '/jobs'))} />
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: colour.brick },
  headDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 28, color: colour.white },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  statusBad: { backgroundColor: '#f6e3dc' },
  statusIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  statusIconOk: { backgroundColor: colour.green },
  statusIconBad: { backgroundColor: colour.brick },
  statusText: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22, color: colour.greenDark },
  why: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.brick },
  lead: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: colour.ink, paddingHorizontal: 4, marginTop: 4 },
});
