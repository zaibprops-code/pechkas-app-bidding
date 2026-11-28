import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * The kinds of work, drawn the way the sign-in screens draw (design "C",
 * the owner's choice): one object each, an ink outline and the brand
 * yellow, sometimes green — never a person. On home, the search results,
 * a kind of work's page and the top of Post a job. A trade with no drawing
 * of its own gets the four squares, so a new trade added by migration is
 * never a blank tile. The groups on a kind of work's page have drawings
 * of their own (a geyser, a toilet, a fan…), named in packages/shared/src/work.ts.
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
  cleaning: () => (
    <>
      {/* A sofa, and the spray of the cleaning machine. */}
      <Rect x={8} y={24} width={48} height={20} rx={6} fill={W} {...L} />
      <Rect x={14} y={30} width={36} height={14} rx={3} fill={Y} {...L} />
      <Path d="M8 32h6M50 32h6M14 44v8M50 44v8" fill="none" {...L} />
      <Path d="M40 8l6 6M46 6l3 3M36 10l2 2" fill="none" {...L} />
    </>
  ),
  mason: () => (
    <>
      {/* Bricks and a trowel. */}
      <Rect x={8} y={36} width={23} height={9} rx={1.5} fill={W} {...L} />
      <Rect x={33} y={36} width={23} height={9} rx={1.5} fill={Y} {...L} />
      <Rect x={8} y={47} width={11} height={9} rx={1.5} fill={Y} {...L} />
      <Rect x={21} y={47} width={23} height={9} rx={1.5} fill={W} {...L} />
      <Rect x={46} y={47} width={10} height={9} rx={1.5} fill={W} {...L} />
      <Path d="M18 28l14-18 14 18z" fill={W} {...L} />
      <Path d="M32 10V5M28 5h8" fill="none" {...L} />
    </>
  ),
  garden: () => (
    <>
      {/* A plant in a pot. */}
      <Path d="M32 34V16" fill="none" {...L} />
      <Path d="M32 26c-10 0-16-6-16-14 10 0 16 6 16 14z" fill={W} {...L} />
      <Path d="M32 22c8 0 14-5 14-12-8 0-14 5-14 12z" fill={Y} {...L} />
      <Path d="M18 34h28l-4 22H22z" fill={Y} {...L} />
      <Path d="M16 34h32" {...L} />
    </>
  ),
  welding: () => (
    <>
      {/* A gate grill and a weld's spark. */}
      <Rect x={8} y={14} width={34} height={42} rx={2} fill={W} {...L} />
      <Path d="M16.5 14v42M25 14v42M33.5 14v42" {...L} />
      <Path d="M50 18l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={Y} {...L} />
      <Path d="M44 40l8 8" {...L} />
    </>
  ),
  helper: () => (
    <>
      {/* Boxes on a hand trolley. */}
      <Rect x={22} y={32} width={26} height={18} rx={2} fill={Y} {...L} />
      <Rect x={26} y={14} width={19} height={18} rx={2} fill={W} {...L} />
      <Path d="M12 8h5v42h33" fill="none" {...L} />
      <Circle cx={19} cy={54} r={4.5} fill={W} {...L} />
    </>
  ),
  tank: () => (
    <>
      {/* A water tank on its stand, on a roof. */}
      <Rect x={24} y={7} width={16} height={6} rx={2} fill={Y} {...L} />
      <Rect x={13} y={13} width={38} height={33} rx={7} fill={W} {...L} />
      <Path d="M14.5 34h35v5a5.5 5.5 0 0 1-5.5 5.5h-24a5.5 5.5 0 0 1-5.5-5.5z" fill={Y} />
      <Path d="M13 24h38M13 34h38" {...L} />
      <Path d="M20 46v10M44 46v10M15 56h34" fill="none" {...L} />
    </>
  ),
  computers: () => (
    <>
      <Rect x={8} y={9} width={48} height={33} rx={4} fill={W} {...L} />
      <Rect x={13} y={14} width={38} height={23} rx={2} fill={Y} />
      <Path d="M27 42l-3 10h16l-3-10M20 52h24" fill="none" {...L} />
    </>
  ),
  // The groups on a kind of work's page.
  'ac-service': () => (
    <>
      <Rect x={6} y={10} width={52} height={22} rx={5} fill={W} {...L} />
      <Path d="M12 25h40" {...L} />
      <Circle cx={50} cy={17} r={2} fill={INK} />
      <Path d="M24 52l14-14M34 34a6 6 0 1 1 8 8l-4-1-3-3z" fill={Y} {...L} />
    </>
  ),
  'ac-fitting': () => (
    <>
      <Rect x={10} y={10} width={44} height={20} rx={5} fill={W} {...L} />
      <Path d="M15 23h34" {...L} />
      <Rect x={14} y={40} width={36} height={16} rx={3} fill={Y} {...L} />
      <Path d="M14 56l-6 4M50 56l6 4M32 30v10" {...L} />
    </>
  ),
  fan: () => (
    <>
      <Path d="M32 6v12" {...L} />
      <Circle cx={32} cy={24} r={5} fill={INK} />
      <Path d="M30 22 8 18c-2 0-3 3-1 4l23 5M34 22l22-4c2 0 3 3 1 4l-23 5M32 29l-2 22c0 2 4 2 4 0z" fill={Y} {...L} />
    </>
  ),
  socket: () => (
    <>
      <Rect x={10} y={10} width={44} height={44} rx={8} fill={W} {...L} />
      <Circle cx={32} cy={32} r={13} fill={Y} {...L} />
      <Circle cx={27} cy={30} r={2.2} fill={INK} />
      <Circle cx={37} cy={30} r={2.2} fill={INK} />
      <Rect x={30.5} y={35} width={3} height={5} rx={1.5} fill={INK} />
    </>
  ),
  breaker: () => (
    <>
      <Rect x={8} y={8} width={48} height={48} rx={6} fill={W} {...L} />
      {[16, 28, 40].map((x) => (
        <Rect key={x} x={x} y={18} width={8} height={18} rx={2} fill={x === 28 ? Y : W} {...L} />
      ))}
      <Path d="M18 46h28" {...L} />
    </>
  ),
  toilet: () => (
    <>
      <Rect x={14} y={8} width={26} height={16} rx={3} fill={W} {...L} />
      <Path d="M10 30h40a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" fill={Y} {...L} />
      <Path d="M22 46l-2 10h20l-2-10" fill={W} {...L} />
      <Path d="M20 24v6" {...L} />
    </>
  ),
  geyser: () => (
    <>
      <Rect x={18} y={6} width={28} height={44} rx={12} fill={W} {...L} />
      <Circle cx={32} cy={22} r={6} fill={Y} {...L} />
      <Path d="M32 22l3-3M24 50v8M40 50v8" {...L} />
    </>
  ),
  motor: () => (
    <>
      <Rect x={10} y={22} width={32} height={24} rx={6} fill={Y} {...L} />
      <Path d="M18 22v24M26 22v24M34 22v24" {...L} />
      <Rect x={42} y={28} width={12} height={12} rx={2} fill={W} {...L} />
      <Path d="M54 34h6M14 46v8h24v-8" fill="none" {...L} />
    </>
  ),
  drain: () => (
    <>
      <Circle cx={32} cy={30} r={20} fill={W} {...L} />
      <Path d="M22 22h20M20 30h24M22 38h20" {...L} />
      <Path d="M32 50c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z" fill={Y} {...L} />
    </>
  ),
  door: () => (
    <>
      <Rect x={16} y={6} width={32} height={52} rx={3} fill={W} {...L} />
      <Rect x={22} y={12} width={20} height={16} rx={2} fill={Y} {...L} />
      <Circle cx={41} cy={36} r={3} fill={INK} />
      <Path d="M10 58h44" {...L} />
    </>
  ),
  cupboard: () => (
    <>
      <Rect x={10} y={8} width={44} height={46} rx={4} fill={W} {...L} />
      <Path d="M32 8v46M10 40h44" {...L} />
      <Rect x={10} y={40} width={44} height={14} rx={2} fill={Y} {...L} />
      <Path d="M28 22v6M36 22v6M16 54v4M48 54v4" {...L} />
    </>
  ),
  shelf: () => (
    <>
      <Path d="M8 12v44" {...L} />
      <Rect x={8} y={26} width={46} height={6} rx={2} fill={Y} {...L} />
      <Path d="M14 32l6 10M48 32l-6 10" {...L} />
      <Rect x={18} y={14} width={8} height={12} rx={1} fill={W} {...L} />
      <Rect x={28} y={18} width={14} height={8} rx={1} fill={W} {...L} />
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

// The taps group shares the plumber's tap (its picture is its own: WorkArt).
DRAWINGS.taps = DRAWINGS.plumber;

export function TradeArt({ trade, size }: { trade: string; size: number }) {
  const Drawing = DRAWINGS[trade] ?? Squares;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Drawing />
    </Svg>
  );
}
