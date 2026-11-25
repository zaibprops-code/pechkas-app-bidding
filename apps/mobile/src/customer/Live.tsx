import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MapBox, type Point } from '../components/Map';
import { supabase } from '../supabase';
import { colour, font, shadow } from '../theme';

/**
 * He is on his way (job_live(), migration google_minutes): like a ride app,
 * his disc on her map, the road he is taking and the minutes left — Google's,
 * asked at most every two minutes. Only between "On my way" and arriving,
 * only while his app is open and has sent a position in the last three
 * minutes; otherwise this shows nothing, and the job's own card says where
 * he has got to. Asked again every 10 seconds while the screen is open.
 */

type Live = {
  live: boolean;
  lat?: number;
  lng?: number;
  at?: string;
  distance_m?: number;
  eta_seconds?: number | null;
  route_m?: number | null;
  polyline?: string | null;
  chosen_eta_seconds?: number | null;
};

/** Google's encoded polyline, as points. */
function decode(line: string): Point[] {
  const out: Point[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < line.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = line.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < line.length + 1);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

export function OnHisWay({ job, home, name }: { job: string; home: Point | null; name: string }) {
  const [live, setLive] = useState<Live | null>(null);
  const load = useCallback(() => {
    supabase?.rpc('job_live', { p_job: job }).then(({ data, error }) => setLive(error ? null : ((data as Live) ?? null)));
  }, [job]);
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 10000);
      return () => clearInterval(t);
    }, [load]),
  );
  useEffect(load, [load]);
  if (!live?.live || live.lat === undefined || live.lng === undefined || !home) return null;

  const him = { latitude: live.lat, longitude: live.lng };
  const center = { latitude: (him.latitude + home.latitude) / 2, longitude: (him.longitude + home.longitude) / 2 };
  const zoom = Math.max(0.01, Math.abs(him.latitude - home.latitude) * 2.6, Math.abs(him.longitude - home.longitude) * 2.6);
  const min = live.eta_seconds !== null && live.eta_seconds !== undefined ? Math.max(1, Math.round(live.eta_seconds / 60)) : null;
  const km = ((live.route_m ?? live.distance_m ?? 0) / 1000).toFixed(1);

  return (
    <View style={s.card}>
      <MapBox center={center} zoom={zoom} pin={home} other={{ point: him, letter: name.charAt(0).toUpperCase() }} path={live.polyline ? decode(live.polyline) : null} style={s.map} />
      <View style={s.foot}>
        <Text style={s.label}>{name} is on his way</Text>
        <Text style={s.big} accessibilityLiveRegion="polite">
          {min !== null ? `${min} min away` : `About ${km} km away`}
        </Text>
        <Text style={s.small}>{min !== null ? `${km} km by road · from Google Maps` : 'Minutes appear here when Google Maps answers.'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: colour.white, boxShadow: shadow.card },
  map: { height: 260 },
  foot: { padding: 16, gap: 2 },
  label: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  big: { fontFamily: font.display, fontSize: 26, letterSpacing: -0.4, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, color: colour.steel },
});
