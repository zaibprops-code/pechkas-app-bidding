import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { DuoIcon } from './DuoIcon';
import { colour, font } from '../theme';

/**
 * What goes on top of the drawn street plan (MapDrawing.tsx) when there is
 * no real map: a build without the Google key, and the browser. Each place
 * is put where it would be on a map of `zoom` degrees from top to bottom
 * around `center`, so the technicians near her, the man on his way and his
 * road sit where a real map would put them. A real map draws the same three
 * with its own markers (Map.tsx).
 */

type Point = { latitude: number; longitude: number };

export function DrawnMarks({ center, zoom, dots, other, path }: {
  center: Point;
  zoom: number;
  dots?: Point[] | null;
  other?: { point: Point; letter: string } | null;
  path?: Point[] | null;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const at = (p: Point) => {
    // Metres from the centre, then pixels: the box is `zoom` degrees of latitude tall.
    const pxPerDeg = size.h / zoom;
    const x = size.w / 2 + (p.longitude - center.longitude) * Math.cos((center.latitude * Math.PI) / 180) * pxPerDeg;
    const y = size.h / 2 - (p.latitude - center.latitude) * pxPerDeg;
    return { x, y };
  };
  const inside = ({ x, y }: { x: number; y: number }) => x > 12 && x < size.w - 12 && y > 12 && y < size.h - 12;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w && path && path.length > 1 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Polyline points={path.map((p) => { const q = at(p); return `${q.x},${q.y}`; }).join(' ')} fill="none" stroke={colour.ink} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
      {size.w
        ? (dots ?? []).map((d, i) => {
            const q = at(d);
            if (!inside(q)) return null;
            return (
              <View key={i} style={[s.dot, { left: q.x - 14, top: q.y - 14 }]}>
                <DuoIcon name="briefcase" size={16} />
              </View>
            );
          })
        : null}
      {size.w && other ? (() => {
        const q = at(other.point);
        return (
          <View style={[s.other, { left: q.x - 20, top: q.y - 20 }]}>
            <Text style={s.otherText}>{other.letter}</Text>
          </View>
        );
      })() : null}
    </View>
  );
}

/** One technician near her: a white disc with a yellow edge and the briefcase. Shared with the real map. */
export function TechDot() {
  return (
    <View style={[s.dot, { position: 'relative' }]}>
      <DuoIcon name="briefcase" size={16} />
    </View>
  );
}

const s = StyleSheet.create({
  dot: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: colour.white, borderWidth: 2, borderColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  other: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: colour.yellow, borderWidth: 3, borderColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  otherText: { fontFamily: font.display, fontSize: 16, color: colour.ink },
});
