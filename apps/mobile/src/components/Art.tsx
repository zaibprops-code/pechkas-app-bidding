import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * The drawings on the home screen's trade tiles — the thing being fixed,
 * not a person. Flat shapes in the brand's colours over a yellow sweep, the
 * way inDrive puts its cars over a lime one. Drawn here rather than shipped
 * as pictures, so they stay sharp on every phone and cost nothing to load.
 *
 * Every drawing is decoration for a tile that already says its trade in
 * words, so each one is hidden from screen readers.
 */

export type ArtName = 'ac' | 'electrician' | 'plumber' | 'cctv' | 'wifi' | 'ups' | 'solar' | 'appliances' | 'carpentry' | 'painting' | 'computers' | 'more';

/** The drawing for a trade's slug, when it has one. Post a job and My jobs both use it. */
const BY_TRADE: Record<string, ArtName> = {
  ac: 'ac', electrician: 'electrician', plumber: 'plumber', ups: 'ups', cctv: 'cctv', wifi: 'wifi',
  solar: 'solar', appliances: 'appliances', carpentry: 'carpentry', painting: 'painting', computers: 'computers',
};
export const artFor = (trade: string): ArtName | undefined => BY_TRADE[trade];

const SHADE = '#d9d5cc';
const WHITE = colour.white;
const INK = colour.ink;

/** The yellow sweep behind each drawing. */
function Sweep() {
  return <Path d="M8 78 C 30 30, 70 18, 112 22 L 112 52 C 84 50, 60 62, 46 90 L 8 90 Z" fill={colour.yellow} />;
}

export function Art({ name, width = 120, height = 90 }: { name: ArtName; width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 120 90" accessible={false}>
      <Sweep />
      {name === 'ac' && (
        <G>
          <Rect x={14} y={24} width={94} height={34} rx={9} fill={SHADE} />
          <Rect x={12} y={20} width={94} height={34} rx={9} fill={WHITE} />
          <Rect x={20} y={42} width={78} height={5} rx={2.5} fill={INK} />
          <Circle cx={96} cy={30} r={2.6} fill={colour.green} />
          <Path d="M26 64c4 4 4 8 0 12M46 64c4 4 4 8 0 12M66 64c4 4 4 8 0 12M86 64c4 4 4 8 0 12" stroke={colour.green} strokeWidth={3} strokeLinecap="round" fill="none" />
        </G>
      )}
      {name === 'electrician' && (
        <G>
          <Path d="M60 10a22 22 0 0 0-13 39.7c2.6 2 4 4.6 4 7.3v3h18v-3c0-2.7 1.4-5.3 4-7.3A22 22 0 0 0 60 10z" fill={WHITE} />
          <Path d="M54 30l-4 10h8l-3 11 11-15h-8l3-6z" fill={colour.yellow} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <Rect x={50} y={60} width={20} height={6} rx={2} fill={SHADE} />
          <Rect x={52} y={67} width={16} height={6} rx={2} fill={INK} />
          <Path d="M28 22l-7-4M92 22l7-4M24 40h-8M96 40h8" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        </G>
      )}
      {name === 'plumber' && (
        <G>
          <Rect x={18} y={20} width={44} height={14} rx={5} fill={WHITE} />
          <Rect x={52} y={14} width={16} height={26} rx={5} fill={SHADE} />
          <Path d="M62 34h22a10 10 0 0 1 10 10v6H82v-4H62z" fill={WHITE} />
          <Rect x={50} y={8} width={20} height={6} rx={3} fill={INK} />
          <Rect x={80} y={50} width={16} height={5} rx={2} fill={INK} />
          <Path d="M88 60c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z" fill={colour.green} />
        </G>
      )}
      {name === 'cctv' && (
        <G>
          <Rect x={14} y={12} width={10} height={40} rx={3} fill={SHADE} />
          <Path d="M24 30h14v8H24z" fill={INK} />
          <Path d="M36 22l58 12-6 20-58-12z" fill={WHITE} />
          <Rect x={86} y={34} width={14} height={18} rx={4} transform="rotate(12 93 43)" fill={INK} />
          <Circle cx={93} cy={43} r={4} fill={colour.green} />
          <Circle cx={48} cy={32} r={2.5} fill={colour.brick} />
        </G>
      )}
      {name === 'wifi' && (
        <G>
          <Path d="M32 28l4 22M88 28l-4 22" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Rect x={22} y={48} width={76} height={22} rx={8} fill={SHADE} />
          <Rect x={20} y={45} width={76} height={22} rx={8} fill={WHITE} />
          <Circle cx={36} cy={56} r={2.6} fill={colour.green} />
          <Circle cx={46} cy={56} r={2.6} fill={colour.green} />
          <Circle cx={56} cy={56} r={2.6} fill={colour.yellow} />
          <Path d="M48 24a17 17 0 0 1 24 0M53 30a9 9 0 0 1 14 0" stroke={colour.green} strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </G>
      )}
      {name === 'ups' && (
        <G>
          <Rect x={36} y={16} width={52} height={62} rx={8} fill={SHADE} />
          <Rect x={32} y={12} width={52} height={62} rx={8} fill={WHITE} />
          <Rect x={40} y={20} width={36} height={12} rx={3} fill={INK} />
          <Rect x={44} y={24} width={18} height={4} rx={2} fill={colour.green} />
          <Path d="M60 40l-7 14h7l-3 12 11-17h-7l3-9z" fill={colour.yellow} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        </G>
      )}
      {name === 'solar' && (
        <G>
          {/* A panel on its stand, under the sun. */}
          <Circle cx={92} cy={20} r={9} fill={WHITE} />
          <Path d="M92 4v4M92 32v4M76 20h4M104 20h4M81 9l3 3M100 28l3 3M81 31l3-3M100 12l3-3" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M22 62 L40 30 H84 L66 62 Z" fill={INK} />
          <Path d="M31 46 H75 M53 30 L35 62 M68 30 L50 62" stroke={SHADE} strokeWidth={2} />
          <Rect x={48} y={62} width={6} height={16} fill={SHADE} />
          <Rect x={36} y={76} width={30} height={5} rx={2} fill={INK} />
        </G>
      )}
      {name === 'appliances' && (
        <G>
          {/* A washing machine. */}
          <Rect x={38} y={14} width={50} height={66} rx={7} fill={SHADE} />
          <Rect x={34} y={10} width={50} height={66} rx={7} fill={WHITE} />
          <Rect x={34} y={10} width={50} height={12} rx={6} fill={INK} />
          <Circle cx={74} cy={16} r={2.5} fill={colour.green} />
          <Circle cx={59} cy={48} r={17} fill={SHADE} />
          <Circle cx={59} cy={48} r={11} fill={colour.green} />
          <Path d="M52 46a8 8 0 0 1 9-6" stroke={WHITE} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        </G>
      )}
      {name === 'carpentry' && (
        <G>
          {/* A hammer across a plank. */}
          <Rect x={16} y={58} width={88} height={14} rx={3} fill={WHITE} />
          <Path d="M24 62h20M54 66h26" stroke={SHADE} strokeWidth={2} strokeLinecap="round" />
          <G transform="rotate(-35 60 40)">
            <Rect x={56} y={22} width={9} height={52} rx={4} fill={colour.green} />
            <Path d="M44 12 H78 V24 H44 Z" fill={INK} />
            <Path d="M78 12 L88 8 L86 20 L78 24 Z" fill={INK} />
          </G>
        </G>
      )}
      {name === 'painting' && (
        <G>
          {/* A paint roller and the stripe it has just laid. */}
          <Rect x={14} y={64} width={70} height={10} rx={5} fill={colour.green} />
          <Rect x={30} y={14} width={56} height={22} rx={8} fill={WHITE} />
          <Rect x={30} y={28} width={56} height={8} rx={4} fill={colour.green} />
          <Path d="M86 25 H96 V46 H62 V56" stroke={INK} strokeWidth={4} strokeLinejoin="round" fill="none" />
          <Rect x={57} y={54} width={10} height={24} rx={4} fill={INK} />
        </G>
      )}
      {name === 'computers' && (
        <G>
          {/* A laptop. */}
          <Rect x={30} y={14} width={62} height={42} rx={5} fill={INK} />
          <Rect x={35} y={19} width={52} height={32} rx={2} fill={WHITE} />
          <Rect x={41} y={26} width={26} height={5} rx={2.5} fill={colour.green} />
          <Rect x={41} y={36} width={36} height={4} rx={2} fill={SHADE} />
          <Path d="M20 60 H102 L96 70 H26 Z" fill={SHADE} />
          <Rect x={52} y={60} width={18} height={3} rx={1.5} fill={INK} />
        </G>
      )}
      {name === 'more' && (
        <G>
          <Circle cx={40} cy={46} r={9} fill={WHITE} />
          <Circle cx={62} cy={46} r={9} fill={WHITE} />
          <Circle cx={84} cy={46} r={9} fill={INK} />
        </G>
      )}
    </Svg>
  );
}
