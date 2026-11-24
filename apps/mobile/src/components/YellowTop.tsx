import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { rupees } from '@pechkas/shared';
import { Icon } from './Icon';
import { Press } from './Press';
import { colour, font, glow, GLOW_STOPS, TAP } from '../theme';

/**
 * The yellow top of a page, as the sign-in pictures and home have it (the
 * owner's choice, 24 November 2026): the brand yellow, lit behind the
 * drawing and deeper at the edges, rounded at the foot, running up under the
 * clock. Search, a kind of work and Post a job open with it. `back` draws
 * the round back button in its top corner; `after` sits beside it.
 */
export function YellowTop({ back = true, after, children, light = 0.72 }: { back?: boolean; after?: ReactNode; children?: ReactNode; light?: number }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={[s.top, { paddingTop: insets.top + 6 }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? <Glow width={size.w} height={size.h} at={light} /> : null}
      {back || after ? (
        <View style={s.bar}>
          {back ? (
            <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.back}>
              <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
            </Press>
          ) : null}
          {after}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Glow({ width, height, at }: { width: number; height: number; at: number }) {
  const cx = width * at;
  const cy = height * 0.35;
  const r = Math.max(height, 1);
  const sx = (width * 0.9) / r;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="yellow-top" cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(${sx} 1) translate(${-cx} ${-cy})`}>
          {GLOW_STOPS.map((o, i) => (
            <Stop key={o} offset={o} stopColor={glow.yellow[i]} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#yellow-top)" />
    </Svg>
  );
}

/** A job's usual price as a pill: soft yellow with the figure, or a grey "After a look". */
export function PricePill({ paisa }: { paisa: number | null }) {
  return (
    <View style={[s.pill, !paisa && s.pillQuiet]}>
      <Text style={[s.pillText, !paisa && s.pillTextQuiet]}>{paisa ? rupees(paisa) : 'After a look'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', backgroundColor: colour.yellow },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP },
  pill: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colour.softYellow },
  pillQuiet: { backgroundColor: colour.canvas },
  pillText: { fontFamily: font.display, fontSize: 13.5, color: colour.ink, fontVariant: ['tabular-nums'] },
  pillTextQuiet: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
});
