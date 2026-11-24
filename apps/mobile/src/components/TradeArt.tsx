import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * The kinds of work, drawn the way the sign-in screens draw (design "C",
 * the owner's choice): one object each, an ink outline and the brand
 * yellow, sometimes green — never a person. On home, the search results,
 * a kind of work's page and the top of Post a job. A trade with no drawing
 * of its own gets the four squares, so a new trade added by migration is
 * never a blank tile.
 */
const INK = colour.ink;
const Y = colour.yellow;
const W = colour.white;
const L = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

const DRAWINGS: Record<string, () => ReactNode> = {
  ac: () => (
    <>
      <Rect x={6} y={12} width={52} height={22} rx={5} fill={W} {...L} />
      <Path d="M12 27h40" {...L} />
      <Circle cx={50} cy={19} r={2} fill={INK} />
      <Path d="M20 41q-3 5 0 10M32 41q-3 5 0 10M44 41q-3 5 0 10" fill="none" {...L} />
    </>
  ),
  electrician: () => (
    <>
      <Path d="M32 7a16 16 0 0 0-9 29v7h18v-7a16 16 0 0 0-9-29z" fill={Y} {...L} />
      <Rect x={24} y={46} width={16} height={9} rx={2} fill={W} {...L} />
      <Path d="M34 15l-7 12h9l-5 9" fill="none" {...L} />
    </>
  ),
  plumber: () => (
    <>
      <Rect x={7} y={16} width={12} height={13} rx={2} fill={W} {...L} />
      <Path d="M19 22h17a9 9 0 0 1 9 9v4" fill="none" {...L} />
      <Path d="M13 16V9M8 9h10" {...L} />
      <Rect x={39} y={35} width={12} height={6} rx={2} fill={Y} {...L} />
      <Path d="M45 47c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z" fill={W} {...L} />
    </>
  ),
  ups: () => (
    <>
      <Rect x={13} y={12} width={38} height={44} rx={6} fill={W} {...L} />
      <Path d="M13 22h38" {...L} />
      <Rect x={24} y={7} width={16} height={5} rx={2} fill={Y} {...L} />
      <Path d="M35 28l-7 11h8l-5 10" fill="none" {...L} />
    </>
  ),
  cctv: () => (
    <>
      <Path d="M10 18l32-8 5 15-32 8z" fill={W} {...L} />
      <Circle cx={40} cy={20} r={3} fill={INK} />
      <Path d="M47 18l8-2 2 7-8 2" fill={Y} {...L} />
      <Path d="M22 31l3 11H12M10 34v18" fill="none" {...L} />
    </>
  ),
  wifi: () => (
    <>
      <Rect x={9} y={36} width={46} height={15} rx={5} fill={Y} {...L} />
      <Circle cx={18} cy={43.5} r={2} fill={INK} />
      <Circle cx={25} cy={43.5} r={2} fill={INK} />
      <Path d="M17 36v-7M47 36v-7" {...L} />
      <Path d="M22 20a14 14 0 0 1 20 0M26.5 25.5a7.5 7.5 0 0 1 11 0" fill="none" {...L} />
    </>
  ),
  solar: () => (
    <>
      <Circle cx={50} cy={14} r={6} fill={Y} {...L} />
      <Path d="M7 50l9-22h40l-9 22z" fill={colour.green} {...L} />
      <Path d="M12 39h40M27 28l-5 22M41 28l-5 22" stroke={W} strokeWidth={2} />
      <Path d="M28 50v6M22 56h12" {...L} />
    </>
  ),
  appliances: () => (
    <>
      <Rect x={14} y={7} width={36} height={50} rx={5} fill={W} {...L} />
      <Path d="M14 18h36" {...L} />
      <Circle cx={21} cy={12.5} r={1.6} fill={INK} />
      <Circle cx={32} cy={37} r={11} fill={Y} {...L} />
      <Circle cx={32} cy={37} r={5} fill={W} {...L} />
    </>
  ),
  carpentry: () => (
    <>
      <Rect x={28} y={24} width={8} height={33} rx={3} fill={Y} {...L} />
      <Path d="M14 11h30l6 6v6h-9l-3-4H14z" fill={W} {...L} />
    </>
  ),
  painting: () => (
    <>
      <Rect x={10} y={9} width={38} height={15} rx={4} fill={Y} {...L} />
      <Path d="M48 16h6v12H33v9" fill="none" {...L} />
      <Rect x={29} y={37} width={8} height={20} rx={3} fill={W} {...L} />
    </>
  ),
  computers: () => (
    <>
      <Rect x={8} y={9} width={48} height={33} rx={4} fill={W} {...L} />
      <Rect x={13} y={14} width={38} height={23} rx={2} fill={Y} />
      <Path d="M27 42l-3 10h16l-3-10M20 52h24" fill="none" {...L} />
    </>
  ),
};

function Squares() {
  return (
    <>
      <Rect x={9} y={9} width={20} height={20} rx={5} fill={Y} {...L} />
      <Rect x={35} y={9} width={20} height={20} rx={5} fill={W} {...L} />
      <Rect x={9} y={35} width={20} height={20} rx={5} fill={W} {...L} />
      <Rect x={35} y={35} width={20} height={20} rx={5} fill={Y} {...L} />
    </>
  );
}

export function TradeArt({ trade, size }: { trade: string; size: number }) {
  const Drawing = DRAWINGS[trade] ?? Squares;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Drawing />
    </Svg>
  );
}
