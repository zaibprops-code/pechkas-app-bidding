import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colour, font } from '../theme';

/**
 * A real street map for the BROWSER only, and only when a screenshot for the
 * owner asks for it (`window.__pechkasRealMap`, set by the screenshot script):
 * the owner's standing rule is that every screen he is shown looks as it will
 * on his phone, where Google's map is drawn, never the demo's street drawing.
 * The phone never runs this file (Map.tsx draws Google's or Apple's map); the
 * published demo cannot load outside pictures, so it keeps the drawing.
 *
 * Tiles are OpenStreetMap's own (tile.openstreetmap.org, a few at a time, for
 * screenshots only, as its tile policy allows), placed so that the
 * box shows `zoom` degrees of latitude from top to bottom around `center` —
 * the same projection DrawnMarks uses for the dots, his disc and the road.
 */

type Point = { latitude: number; longitude: number };

export function realMapWanted(): boolean {
  return Boolean((globalThis as { __pechkasRealMap?: boolean }).__pechkasRealMap);
}

export function TileMap({ center, zoom }: { center: Point; zoom: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tiles: { key: string; uri: string; left: number; top: number; px: number }[] = [];
  if (size.w && size.h) {
    const phi = (center.latitude * Math.PI) / 180;
    const want = size.h / zoom; // screen pixels per degree of latitude
    const z = Math.max(1, Math.min(19, Math.floor(Math.log2((want * 360 * Math.cos(phi)) / 256))));
    const world = 256 * 2 ** z;
    const scale = want / (world / 360 / Math.cos(phi));
    const cx = ((center.longitude + 180) / 360) * world;
    const cy = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world;
    const halfW = size.w / 2 / scale;
    const halfH = size.h / 2 / scale;
    const px = 256 * scale;
    for (let tx = Math.floor((cx - halfW) / 256); tx <= Math.floor((cx + halfW) / 256); tx++) {
      for (let ty = Math.floor((cy - halfH) / 256); ty <= Math.floor((cy + halfH) / 256); ty++) {
        tiles.push({
          key: `${z}/${tx}/${ty}`,
          uri: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`,
          left: size.w / 2 + (tx * 256 - cx) * scale,
          top: size.h / 2 + (ty * 256 - cy) * scale,
          px,
        });
      }
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: t.uri }} style={{ position: 'absolute', left: t.left, top: t.top, width: t.px + 0.5, height: t.px + 0.5 }} />
      ))}
      <Text style={s.credit}>© OpenStreetMap</Text>
    </View>
  );
}

const s = StyleSheet.create({
  credit: { position: 'absolute', right: 4, bottom: 2, fontFamily: font.body, fontSize: 8, color: colour.steel },
});
