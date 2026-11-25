import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pkClock, showMobile } from '@pechkas/shared';
import { MapBox, type Point } from '../components/Map';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Notice, SystemBars, useScrollEnd } from '../components/ui';
import { supabase } from '../supabase';
import { colour, font, shadow } from '../theme';
import { Action } from './bits';
import { JobCard, type Job } from './JobCard';
import { decode } from './Live';

/**
 * Once she has chosen him, until he starts the work (the owner's approved
 * mocks, sheet 2: "On his way", "He has arrived"). The map fills the top
 * with her home; while he is on his way and his app is open, his disc and
 * the road from Google, with the minutes left (job_live(), never before he
 * sets off, never after he arrives). At her door, his disc at her home. A
 * sheet under the map says where he has got to in one big line, with Call,
 * Chat and Family; under it the start code and everything else about the
 * job, as before.
 */

type Live = { live: boolean; lat?: number; lng?: number; distance_m?: number; eta_seconds?: number | null; route_m?: number | null; polyline?: string | null };

export function ComingView({ job, trade, tick, onChanged, problem }: { job: Job; trade: string; tick: number; onChanged: () => void; problem: string | null }) {
  const insets = useSafeAreaInsets();
  const end = useScrollEnd(24);
  const { height } = useWindowDimensions();
  const pro = job.pro!;
  const [live, setLive] = useState<Live | null>(null);
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
  const zoom = him && home ? Math.max(0.012, Math.abs(him.latitude - home.latitude) * 2.6, Math.abs(him.longitude - home.longitude) * 2.6) : 0.012;
  const mapH = Math.round(Math.min(520, Math.max(300, height * 0.46)));

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

  const family = encodeURIComponent(
    `Pechkas is sending ${pro.first_name} for job ${job.ref} (${job.title}) at ${job.house}, ${job.street}, ${job.sector}.${pro.phone ? ` His number: ${showMobile(pro.phone)}.` : ''}`,
  );

  return (
    <View style={{ flex: 1, backgroundColor: colour.white }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: end }} bounces={false} style={{ backgroundColor: colour.canvas }}>
        <View style={{ height: mapH }}>
          <MapBox
            center={center}
            zoom={zoom}
            pin={arrived ? null : home}
            other={arrived && home ? { point: home, letter } : him ? { point: him, letter } : null}
            path={!arrived && live?.polyline ? decode(live.polyline) : null}
            style={StyleSheet.absoluteFill}
          />
          <Press
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            sink={0.92}
            style={[s.back, { top: insets.top + 10 }]}
          >
            <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.4} />
          </Press>
        </View>
        <View style={s.sheet}>
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
          {arrived ? null : (
            <View style={s.actions}>
              {pro.phone ? <Action icon="phone" label="Call" full={`Call ${pro.first_name}`} onPress={() => Linking.openURL(`tel:+${pro.phone!.replace(/^\+/, '')}`)} /> : null}
              <Action icon="chat" label="Chat" full={`Message ${pro.first_name}`} onPress={() => router.push({ pathname: '/chat/[job]', params: { job: job.id } })} />
              <Action icon="share" label="Family" full="Send his name to family on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${family}`)} />
            </View>
          )}
          <Notice text={problem} />
          <View style={{ gap: 14 }}>
            <JobCard job={job} trade={trade} tick={tick} onChanged={onChanged} coming />
          </View>
        </View>
      </ScrollView>
      <SystemBars bg={colour.white} />
    </View>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: 14, width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(20, 23, 26, 0.14)' },
  sheet: { gap: 14, marginTop: -24, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colour.white, boxShadow: shadow.card },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colour.rule },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  disc: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  discText: { fontFamily: font.display, fontSize: 19, color: colour.yellow },
  small: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  big: { fontFamily: font.display, fontSize: 26, letterSpacing: -0.4, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 13.5, color: colour.steel },
  actions: { flexDirection: 'row', gap: 10 },
});
