import { StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * A drawn street plan that fills a map's box when no real map can be drawn:
 * an Android build made before the Google Maps key was added to Expo
 * (docs/OWNER.md, "Maps"), and the browser, where the screens are clicked
 * through and photographed. The owner asked for the box to always be there,
 * so every screen keeps its map layout and nothing jumps when the key arrives.
 *
 * It is a picture of streets, not a map of anywhere: a grid of sectors with
 * green belts between them, the way Islamabad is laid out, and no names.
 * Nothing on it claims to show where anybody is.
 */
export function MapDrawing() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      accessible={false}
    >
      <Rect x={0} y={0} width={400} height={300} fill={colour.tile} />
      {/* Green belts between the sectors. */}
      <Path d="M-10 92 L410 72 L410 96 L-10 116 Z M150 -10 L174 -10 L188 310 L164 310 Z" fill={colour.greenSoft} />
      <Path d="M300 196 q34 -22 70 0 v74 h-70 z M20 210 h52 v44 h-52 z" fill={colour.greenSoft} />
      {/* Blocks of houses. */}
      <Path
        d="M20 20 h50 v28 h-50z M88 18 h44 v30 h-44z M200 14 h46 v32 h-46z M262 12 h42 v30 h-42z M330 10 h50 v30 h-50z M20 140 h52 v40 h-52z M92 136 h46 v44 h-46z M206 130 h40 v40 h-40z M262 126 h44 v46 h-44z M330 122 h50 v44 h-50z M96 214 h44 v40 h-44z M206 206 h70 v48 h-70z"
        fill={colour.paper2}
      />
      {/* The main roads, then the smaller streets. */}
      <Path d="M-10 64 L410 44 M-10 196 L410 176 M80 -10 L92 310 M300 -10 L292 310" stroke={colour.white} strokeWidth={14} strokeLinecap="round" />
      <Path d="M-10 124 L410 104 M196 -10 L204 310 M-10 266 L410 250 M360 -10 L352 310" stroke={colour.white} strokeWidth={7} strokeLinecap="round" />
      {/* One road across the grid, as the highway crosses the sectors. */}
      <Path d="M-10 300 L410 -10" stroke={colour.white} strokeWidth={10} strokeLinecap="round" />
    </Svg>
  );
}
