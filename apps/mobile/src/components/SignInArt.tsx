import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colour, font } from '../theme';

/**
 * The drawings at the top of the sign-in screens (the owner's choice, design
 * "C", 24 November 2026): one picture that says what is happening before a
 * word is read — a phone getting a text, a letter with a code, a code beside
 * a padlock, a house and a toolbox, a name tag. Objects only, never people;
 * ink outlines and the brand yellow, like the welcome pages' drawings.
 *
 * Each picture moves once, when its screen opens, in under a second — then
 * it stays still, so nothing moves while somebody types. Only transforms
 * move (native driver): a part slides, grows from where it is fixed or turns
 * on its hook. With "remove animations" on, every part is simply in place.
 *
 * How it moves: every moving part is its own layer, the whole frame in size,
 * drawn on the same 220 × 150 grid. A layer turns or grows about a point on
 * that grid (`about()`), so a message grows out of its tail and a tag swings
 * from its hook, the way the real things do.
 */
export type ArtKind = 'phone' | 'mail' | 'code' | 'both' | 'tag';

const VW = 220;
const VH = 150;
const INK = colour.ink;
const LINE = { stroke: INK, strokeWidth: 3.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Whether the phone asks for less motion; `null` until it has answered. */
export function useStill(): boolean | null {
  const [still, setStill] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((v) => alive && setStill(v));
    return () => {
      alive = false;
    };
  }, []);
  return still;
}

/** A value from 0 to 1 that runs once when the picture opens (or is 1 at once, for less motion). */
function useOnce(still: boolean | null, run: (v: Animated.Value) => Animated.CompositeAnimation): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still === null) return;
    if (still) {
      v.setValue(1);
      return;
    }
    const a = run(v);
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);
  return v;
}

/** Several values that run one after another, `step` ms apart, starting at `start`. */
function useStagger(still: boolean | null, count: number, start: number, step: number): Animated.Value[] {
  const vs = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (still === null) return;
    if (still) {
      vs.forEach((v) => v.setValue(1));
      return;
    }
    const a = Animated.parallel(vs.map((v, i) => spring(v, start + i * step)));
    a.start();
    return () => a.stop();
  }, [still, vs, start, step]);
  return vs;
}

const spring = (v: Animated.Value, delay = 0) =>
  Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true })]);
const glide = (v: Animated.Value, ms: number, delay = 0) =>
  Animated.timing(v, { toValue: 1, duration: ms, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });

export function SignInArt({ kind, height, open = false, hop = null }: {
  kind: ArtKind;
  height: number;
  /** The code: the padlock opens when this turns true (the right code). */
  open?: boolean;
  /** Choose: which side was just picked, and a count so a second tap on the same side hops again. */
  hop?: { side: 'customer' | 'pro'; n: number } | null;
}) {
  const width = Math.round((height * VW) / VH);
  const k = width / VW;
  const still = useStill();
  const props = { k, width, height, still };
  return (
    <View style={{ width, height }} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      {kind === 'phone' ? <PhoneArt {...props} /> : null}
      {kind === 'mail' ? <MailArt {...props} /> : null}
      {kind === 'code' ? <CodeArt {...props} open={open} /> : null}
      {kind === 'both' ? <BothArt {...props} hop={hop} /> : null}
      {kind === 'tag' ? <TagArt {...props} /> : null}
    </View>
  );
}

type Frame = { k: number; width: number; height: number; still: boolean | null };

/** One layer: the whole frame, the 220 × 150 grid, moved as a piece. */
function Layer({ f, children, move }: { f: Frame; children: ReactNode; move?: object[] }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, move ? { transform: move as never } : null]}>
      <Svg width={f.width} height={f.height} viewBox={`0 0 ${VW} ${VH}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/**
 * Turns, grows and moves about a point on the grid, not about the middle of
 * the frame: shift so the point sits in the middle, do the move, shift back.
 */
function about(f: Frame, x: number, y: number, moves: object[]): object[] {
  const dx = x * f.k - f.width / 2;
  const dy = y * f.k - f.height / 2;
  return [{ translateX: dx }, { translateY: dy }, ...moves, { translateX: -dx }, { translateY: -dy }];
}

const from = (v: Animated.Value, start: number | string, end: number | string = 0) =>
  v.interpolate({ inputRange: [0, 1], outputRange: [start, end] as never });

/** Your number: the phone stands up, its message grows out of its tail, the dots arrive one by one. */
function PhoneArt({ k, width, height, still }: Frame) {
  const f = { k, width, height, still };
  const phone = useOnce(still, (v) => spring(v));
  const bubble = useOnce(still, (v) => spring(v, 260));
  const dots = useStagger(still, 6, 560, 90);
  return (
    <>
      <Layer f={f} move={about(f, 91, 138, [{ translateY: from(phone, 30 * k) }, { rotate: from(phone, '-8deg', '0deg') }])}>
        <Rect x={58} y={14} width={66} height={124} rx={14} fill={colour.white} {...LINE} />
        <Rect x={67} y={30} width={48} height={84} rx={5} fill={colour.greenSoft} />
        <Circle cx={91} cy={126} r={4} fill={INK} />
        <Rect x={80} y={21} width={22} height={3.5} rx={1.7} fill={INK} />
      </Layer>
      <Layer f={f} move={about(f, 124, 103, [{ scale: from(bubble, 0.2, 1) }])}>
        <Path d="M112 36h82a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12h-58l-14 13v-13h-10a12 12 0 0 1-12-12V48a12 12 0 0 1 12-12z" fill={colour.yellow} {...LINE} />
      </Layer>
      {dots.map((d, i) => (
        <Layer key={i} f={f} move={about(f, 132 + i * 12, 63, [{ scale: d }])}>
          <Circle cx={132 + i * 12} cy={63} r={4.2} fill={INK} />
        </Layer>
      ))}
    </>
  );
}

/** Email: the envelope drops in and a letter with the code rises out of it. */
function MailArt({ k, width, height, still }: Frame) {
  const f = { k, width, height, still };
  const env = useOnce(still, (v) => spring(v));
  const letter = useOnce(still, (v) => spring(v, 300));
  return (
    <>
      <Layer f={f} move={[{ translateY: from(env, 24 * k) }, { translateY: from(letter, 34 * k) }]}>
        <Rect x={62} y={14} width={96} height={80} rx={8} fill={colour.white} {...LINE} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Circle key={i} cx={80 + i * 12} cy={42} r={4.2} fill={INK} />
        ))}
      </Layer>
      <Layer f={f} move={[{ translateY: from(env, 24 * k) }]}>
        <Path d="M40 62h140v66a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8z" fill={colour.yellow} {...LINE} />
        <Path d="M40 64l70 44 70-44" fill="none" {...LINE} />
      </Layer>
    </>
  );
}

/** The code: the message slides in, its digits appear, the padlock drops; the right code opens it. */
function CodeArt({ k, width, height, still, open }: Frame & { open: boolean }) {
  const f = { k, width, height, still };
  const bubble = useOnce(still, (v) => spring(v));
  const lock = useOnce(still, (v) => spring(v, 180));
  const digits = useStagger(still, 6, 420, 70);
  const shackle = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) {
      shackle.setValue(0);
      wobble.setValue(0);
      return;
    }
    if (still) {
      shackle.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(shackle, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(wobble, { toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [open, still, shackle, wobble]);
  const tilt = wobble.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: ['0deg', '-6deg', '3deg', '0deg'] });
  return (
    <>
      <Layer f={f} move={about(f, 46, 124, [{ translateX: from(bubble, -40 * k) }, { scale: from(bubble, 0.6, 1) }])}>
        <Path d="M30 46h96a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H62l-16 14v-14H30a12 12 0 0 1-12-12V58a12 12 0 0 1 12-12z" fill={colour.white} {...LINE} />
      </Layer>
      {['4', '8', '1', '3', '0', '6'].map((d, i) => (
        <Layer key={i} f={f} move={about(f, 40 + i * 16, 79, [{ translateX: from(bubble, -40 * k) }, { scale: digits[i] }])}>
          <SvgText x={34 + i * 16} y={86} fontSize={22} fontFamily={font.display} fill={INK}>
            {d}
          </SvgText>
        </Layer>
      ))}
      <Layer f={f} move={about(f, 178, 118, [{ translateY: from(lock, -36 * k) }, { rotate: tilt }])}>
        <Rect x={146} y={62} width={64} height={56} rx={10} fill={colour.yellow} {...LINE} />
        <Circle cx={178} cy={85} r={6} fill={INK} />
        <Rect x={175.5} y={88} width={5} height={14} rx={2.5} fill={INK} />
      </Layer>
      <Layer f={f} move={about(f, 178, 118, [{ translateY: from(lock, -36 * k) }, { rotate: tilt }, { translateY: from(shackle, 0, -12 * k) }])}>
        <Path d="M158 62v-12a20 20 0 0 1 40 0v12" fill="none" {...LINE} />
      </Layer>
    </>
  );
}

/** Customer or technician: the house rises, then the toolbox; the side just picked gives a small hop. */
function BothArt({ k, width, height, still, hop }: Frame & { hop: { side: 'customer' | 'pro'; n: number } | null }) {
  const f = { k, width, height, still };
  const house = useOnce(still, (v) => spring(v));
  const box = useOnce(still, (v) => spring(v, 160));
  const hopHouse = useRef(new Animated.Value(0)).current;
  const hopBox = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!hop || still) return;
    const v = hop.side === 'customer' ? hopHouse : hopBox;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [hop, still, hopHouse, hopBox]);
  const up = (v: Animated.Value) => v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -12 * k, 0] });
  return (
    <>
      <Layer f={f} move={about(f, 64, 134, [{ translateY: from(house, 40 * k) }, { translateY: up(hopHouse) }, { scale: from(house, 0.8, 1) }])}>
        <Path d="M18 74 64 36l46 38" fill="none" {...LINE} />
        <Path d="M30 66v68h68V66" fill={colour.yellow} {...LINE} />
        <Rect x={54} y={96} width={20} height={38} fill={colour.white} {...LINE} />
      </Layer>
      <Layer f={f} move={about(f, 164, 134, [{ translateY: from(box, 40 * k) }, { translateY: up(hopBox) }, { scale: from(box, 0.8, 1) }])}>
        <Rect x={124} y={78} width={80} height={56} rx={8} fill={colour.green} {...LINE} />
        <Path d="M148 78v-10a8 8 0 0 1 8-8h16a8 8 0 0 1 8 8v10" fill="none" {...LINE} />
        <Path d="M124 100h80" {...LINE} />
        <Rect x={157} y={94} width={14} height={14} rx={3} fill={colour.yellow} {...LINE} />
      </Layer>
    </>
  );
}

/**
 * Your name: the tag swings in from its hook and settles, a little crooked,
 * as a hung tag does; then the signature is written across it — a white
 * strip, the tag's own colour, slides off it from left to right.
 */
function TagArt({ k, width, height, still }: Frame) {
  const f = { k, width, height, still };
  const swing = useOnce(still, (v) => Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }));
  const write = useOnce(still, (v) => glide(v, 700, 800));
  const turn = swing.interpolate({ inputRange: [0, 0.45, 0.7, 0.88, 1], outputRange: ['-26deg', '10deg', '-5deg', '2deg', '0deg'] });
  // The signature's strip, on the grid: 52..170 across, 76..106 down.
  const sx = 52 * k;
  const sy = 76 * k;
  const sw = 118 * k;
  const sh = 30 * k;
  // The tag rests turned 6° about (110, 80); the strip turns with it.
  const ddx = 110 * k - (sx + sw / 2);
  const ddy = 80 * k - (sy + sh / 2);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: about(f, 110, 6, [{ translateY: from(swing, -30 * k) }, { rotate: turn }]) as never }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
        <G rotation={-6} origin="110, 80">
          <Rect x={38} y={26} width={144} height={104} rx={14} fill={colour.white} {...LINE} />
          <Path d="M38 40a14 14 0 0 1 14-14h116a14 14 0 0 1 14 14v18H38z" fill={colour.yellow} {...LINE} />
          <SvgText x={110} y={49} textAnchor="middle" fontSize={15} fontFamily={font.display} letterSpacing={2} fill={INK}>
            HELLO
          </SvgText>
          <Path d="M60 94q10-16 20 0t20 0 20 0 20 0 16-4" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
          <Path d="M60 114h100" stroke={colour.tile} strokeWidth={3} strokeLinecap="round" />
        </G>
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: sw,
          height: sh,
          overflow: 'hidden',
          transform: [{ translateX: ddx }, { translateY: ddy }, { rotate: '-6deg' }, { translateX: -ddx }, { translateY: -ddy }],
        }}
      >
        <Animated.View style={{ flex: 1, backgroundColor: colour.white, transform: [{ translateX: from(write, 0, sw) }] }} />
      </View>
    </Animated.View>
  );
}

/** A small thing that pops in when it appears — a tick, a dot — and is simply there for less motion. */
export function Pop({ children, style }: { children: ReactNode; style?: object }) {
  const still = useStill();
  const v = useOnce(still, (x) => Animated.spring(x, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }));
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}
