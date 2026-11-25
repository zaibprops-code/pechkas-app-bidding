import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pkClock, showMobile } from '@pechkas/shared';
import { MapBox, type Point } from '../components/Map';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Notice, SystemBars } from '../components/ui';
import { supabase } from '../supabase';
import { colour, font, shadow } from '../theme';
import { Action } from './bits';
import { JobCard, type Job } from './JobCard';
import { decode } from './Live';

/**
 * Once she has chosen him, until he starts the work (the owner's approved
 * mocks, sheet 2: "On his way", "He has arrived"). The map fills the whole
 * screen: her home as a green dot; while he is on his way and his app is
 * open, his disc and the road from Google (job_live(), never before he sets
 * off, never after he arrives); at her door, his disc at her home. A small
 * sheet at the foot says where he has got to in one big line, with Call,
 * Chat and Family — or, at the door, the start code. Pulled up, the sheet
 * carries everything else about the job (steps, Report, Emergency, the
 * job), as before.
 */

type Live = { live: boolean; lat?: number; lng?: number; distance_m?: number; eta_seconds?: number | null; route_m?: number | null; polyline?: string | null };

export function ComingView({ job, trade, tick, onChanged, problem }: { job: Job; trade: string; tick: number; onChanged: () => void; problem: string | null }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const pro = job.pro!;
  const [live, setLive] = useState<Live | null>(null);
  const [peek, setPeek] = useState(230);
  const load = useCallback(() => {
    if (job.stage !== 'on_way') return setLive(null);
    supabase?.rpc('job_live', { p_job: job.id }).then(({ data, error }) => setLive(error ? null : ((data as Live) ?? null)));
  }, [job.id, job.stage]);
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 10000);
      return () => clearInterval(t);
    }, [load]),
  );
  useEffect(load, [load, tick]);

  const home: Point | null = typeof job.lat === 'number' && typeof job.lng === 'number' ? { latitude: job.lat, longitude: job.lng } : null;
  const him: Point | null = live?.live && live.lat !== undefined && live.lng !== undefined ? { latitude: live.lat, longitude: live.lng } : null;
  const letter = pro.first_name.charAt(0).toUpperCase();
  const arrived = job.stage === 'arrived';
  const center = him && home ? { latitude: (him.latitude + home.latitude) / 2, longitude: (him.longitude + home.longitude) / 2 } : home ?? { latitude: 33.6844, longitude: 73.0479 };
  const zoom = him && home ? Math.max(0.012, Math.abs(him.latitude - home.latitude) * 3, Math.abs(him.longitude - home.longitude) * 3) : 0.012;

  const min = live?.eta_seconds !== null && live?.eta_seconds !== undefined ? Math.max(1, Math.round(live.eta_seconds / 60)) : null;
  const km = live ? ((live.route_m ?? live.distance_m ?? 0) / 1000).toFixed(1) : null;
  const arrives = min !== null ? pkClock(new Date(Date.now() + min * 60000).toISOString()) : null;
  const due = job.due_at && (job.when_from === null || job.when_from === undefined) ? pkClock(job.due_at) : null;

  const small = arrived ? `${pro.first_name} is at your door` : job.stage === 'on_way' ? `${pro.first_name} is on his way` : `${pro.first_name} is your technician`;
  const big = arrived ? 'He has arrived' : min !== null ? `${min} min away` : due ? `Due by ${due}` : job.stage === 'on_way' ? 'On his way' : 'Coming';
  const line = arrived
    ? 'Check it is him, then give him your start code.'
    : min !== null
      ? `${km} km · arrives about ${arrives}`
      : job.stage === 'on_way'
        ? 'His minutes appear here while his app is open.'
        : 'Your phone tells you when he sets off.';
  // The code waits for her to confirm his photo at the door (D37), exactly as before.
  const code = arrived && job.start_code && !job.code_locked && !job.face_needed ? job.start_code : null;

  const family = encodeURIComponent(
    `Pechkas is sending ${pro.first_name} for job ${job.ref} (${job.title}) at ${job.house}, ${job.street}, ${job.sector}.${pro.phone ? ` His number: ${showMobile(pro.phone)}.` : ''}`,
  );

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <MapBox
        center={center}
        zoom={zoom}
        home={arrived ? null : home}
        other={arrived && home ? { point: home, letter } : him ? { point: him, letter } : null}
        path={!arrived && live?.polyline ? decode(live.polyline) : null}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ paddingTop: Math.max(120, height - peek) }} showsVerticalScrollIndicator={false}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20, minHeight: peek }]}>
          <View
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height + 26 + insets.bottom);
              if (Math.abs(h - peek) > 2) setPeek(h);
            }}
            style={{ gap: 14 }}
          >
            <View style={s.handle} />
            <View style={s.head}>
              <View style={s.disc}>
                <Text style={s.discText}>{letter}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.small}>{small}</Text>
                <Text style={s.big} accessibilityLiveRegion="polite">
                  {big}
                </Text>
                <Text style={s.line}>{line}</Text>
              </View>
            </View>
            {code ? (
              <View style={s.code} accessibilityLabel={`Your start code ${code.split('').join(' ')}. Give it only when he is at your door.`}>
                <View>
                  <Text style={s.codeLabel}>Your start code</Text>
                  <Text style={s.codeDigits}>{code.split('').join(' ')}</Text>
                </View>
                <Text style={s.codeNote}>Give it only when he is at your door.</Text>
              </View>
            ) : arrived ? null : (
              <View style={s.actions}>
                {pro.phone ? <Action icon="phone" label="Call" full={`Call ${pro.first_name}`} onPress={() => Linking.openURL(`tel:+${pro.phone!.replace(/^\+/, '')}`)} /> : null}
                <Action icon="chat" label="Chat" full={`Message ${pro.first_name}`} onPress={() => router.push({ pathname: '/chat/[job]', params: { job: job.id } })} />
                <Action icon="share" label="Family" full="Send his name to family on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${family}`)} />
              </View>
            )}
          </View>
          {/* Pulled up: everything else about the job, as before (steps, Report, Emergency, the job). */}
          <Notice text={problem} />
          <View style={{ gap: 14, marginTop: 18 }}>
            <JobCard job={job} trade={trade} tick={tick} onChanged={onChanged} coming />
          </View>
        </View>
      </ScrollView>
      <Press
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        sink={0.92}
        style={[s.back, { top: insets.top + 10 }]}
      >
        <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.4} />
      </Press>
      <SystemBars bg={colour.white} top={false} />
    </View>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: 14, width: 46, height: 46, borderRadius: 23, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.14)' },
  sheet: { paddingHorizontal: 14, paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colour.white, boxShadow: shadow.card },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colour.rule },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  disc: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  discText: { fontFamily: font.display, fontSize: 19, color: colour.yellow },
  small: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  big: { fontFamily: font.display, fontSize: 26, letterSpacing: -0.4, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 13.5, color: colour.steel },
  actions: { flexDirection: 'row', gap: 10 },
  code: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 18, backgroundColor: colour.ink },
  codeLabel: { fontFamily: font.body, fontSize: 13, color: colour.paper },
  codeDigits: { fontFamily: font.mono, fontSize: 32, letterSpacing: 2, color: colour.yellow },
  codeNote: { flex: 1, maxWidth: 150, textAlign: 'right', fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.paper },
});
