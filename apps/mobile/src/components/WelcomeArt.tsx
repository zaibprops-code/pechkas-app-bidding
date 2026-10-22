import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * The three drawings on the welcome pages, where inDrive puts its people
 * over a lime sweep. Pechkas draws objects, never people — the same rule as
 * the home tiles (Art.tsx) — over the same yellow sweep, in the same flat
 * brand colours. Each says what its page says in words, so each is hidden
 * from screen readers.
 */
export type WelcomeArtName = 'price' | 'checked' | 'cash';

const SHADE = '#d9d5cc';
const WHITE = colour.white;
const INK = colour.ink;
const GREEN = colour.green;

export function WelcomeArt({ name, width = 240, height = 180 }: { name: WelcomeArtName; width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 240 180" accessible={false}>
      <Path d="M14 158 C 54 58, 140 30, 228 40 L 228 108 C 170 102, 124 126, 98 180 L 14 180 Z" fill={colour.yellow} />
      {name === 'price' && (
        <G>
          {/* A price tag, and the screwdriver in front of it: what you pay, and the job. */}
          <Path d="M64 40 H148 L182 74 L148 108 H64 A10 10 0 0 1 54 98 V50 A10 10 0 0 1 64 40 Z" fill={SHADE} />
          <Path d="M60 34 H144 L178 68 L144 102 H60 A10 10 0 0 1 50 92 V44 A10 10 0 0 1 60 34 Z" fill={WHITE} />
          <Circle cx={150} cy={68} r={7} fill={SHADE} />
          <Rect x={66} y={52} width={58} height={10} rx={5} fill={INK} />
          <Rect x={66} y={72} width={38} height={8} rx={4} fill={GREEN} />
          <G transform="rotate(-18 120 138)">
            <Rect x={34} y={127} width={60} height={22} rx={11} fill={GREEN} />
            <Rect x={92} y={132} width={12} height={12} rx={2} fill={SHADE} />
            <Rect x={102} y={135} width={92} height={6} rx={2} fill={INK} />
            <Path d="M194 133 L206 135 V141 L194 143 Z" fill={INK} />
          </G>
        </G>
      )}
      {name === 'checked' && (
        <G>
          {/* An identity card and a shield with a tick: checked before anybody comes. */}
          <Rect x={30} y={62} width={116} height={78} rx={12} fill={SHADE} />
          <Rect x={26} y={56} width={116} height={78} rx={12} fill={WHITE} />
          <Rect x={40} y={72} width={34} height={42} rx={7} fill={colour.paper2} />
          <Rect x={84} y={76} width={44} height={8} rx={4} fill={INK} />
          <Rect x={84} y={92} width={34} height={6} rx={3} fill={SHADE} />
          <Rect x={84} y={104} width={40} height={6} rx={3} fill={SHADE} />
          <Path d="M172 36 L212 52 V88 C212 116 196 134 172 146 C148 134 132 116 132 88 V52 Z" fill={GREEN} />
          <Path d="M152 90 L166 104 L194 74" stroke={WHITE} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
      )}
      {name === 'cash' && (
        <G>
          {/* Notes and a finished job list: paid in cash, when the work is done. */}
          <G transform="rotate(-10 100 110)">
            <Rect x={36} y={78} width={128} height={66} rx={8} fill={colour.greenDark} />
          </G>
          <Rect x={40} y={86} width={128} height={66} rx={8} fill={GREEN} />
          <Rect x={50} y={96} width={108} height={46} rx={5} fill="none" stroke={colour.greenSoft} strokeWidth={2} />
          <Circle cx={104} cy={119} r={14} fill={colour.greenSoft} />
          <Rect x={150} y={36} width={62} height={84} rx={9} fill={SHADE} />
          <Rect x={146} y={30} width={62} height={84} rx={9} fill={WHITE} />
          <Rect x={164} y={24} width={26} height={12} rx={5} fill={INK} />
          <Path d="M156 54 l5 5 9 -10 M156 76 l5 5 9 -10 M156 98 l5 5 9 -10" stroke={GREEN} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M178 56 h20 M178 78 h20 M178 100 h16" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </G>
      )}
    </Svg>
  );
}
