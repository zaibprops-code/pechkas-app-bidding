import { Animated, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MARK_PATHS } from '@pechkas/shared/src/mark-paths';

/**
 * The Pechkas mark: the machined screw head — bevel lit from the upper left,
 * a slot with a floor and a bronze wall, one glint. The shapes are the
 * website's (src/lib/mark.js in zaibprops-code/Pechkas), copied by
 * scripts/copy-mark.mjs into packages/shared, and scripts/make-icons.mjs
 * draws the home-screen icon from the same copy.
 *
 * Below `machinedFromPx` (28) the detail is a fraction of a pixel and turns
 * to mush, so it is drawn flat. The outline is identical, so it never looks
 * like a different logo.
 *
 * `turn` turns the SLOT, not the whole head. That is how a real screw looks
 * when it turns: the rim is round, so its lit side stays where the light is
 * and only the slot goes round. Turning the whole drawing would swing the
 * highlight round with it, which no screw has ever done. The slot sits on its
 * own layer and is rotated by the native driver, so it stays smooth while
 * the JavaScript thread is busy loading — which is exactly when it is shown.
 *
 * `colour` draws the flat one-colour mark (slot cut out as a hole) for a
 * spinner sitting on a button or a coloured panel.
 */
type Turn = Animated.AnimatedInterpolation<string> | string;

const LAYER = { position: 'absolute', left: 0, top: 0 } as const;

function shape(p: (typeof MARK_PATHS.machined)[number], i: number) {
  return 'stroke' in p ? (
    <Path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeLinecap="round" />
  ) : (
    <Path key={i} d={p.d} fill={p.fill} />
  );
}

export function Mark({ size = 32, turn, colour }: { size?: number; turn?: Turn; colour?: string }) {
  const box = { width: size, height: size };

  if (colour) {
    // One colour: the slot is a hole, so turning it means turning the whole
    // disc — which looks identical, because the disc is round.
    const flat = (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Path fill={colour} fillRule="evenodd" d={MARK_PATHS.flatOne} />
      </Svg>
    );
    return turn ? <Animated.View style={[box, { transform: [{ rotate: turn }] }]}>{flat}</Animated.View> : flat;
  }

  const machined = size >= MARK_PATHS.machinedFromPx;
  // The head is every layer up to the glint; the slot is the wall and floor.
  const head = machined ? MARK_PATHS.machined.slice(0, 5) : [];
  const slot = machined ? MARK_PATHS.machined.slice(5) : [];

  if (!turn) {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Pechkas logo">
        {machined ? (
          MARK_PATHS.machined.map(shape)
        ) : (
          <>
            <Path fill={MARK_PATHS.flat.fill.disc} d={MARK_PATHS.flat.disc} />
            <Path fill={MARK_PATHS.flat.fill.slot} d={MARK_PATHS.flat.slot} />
          </>
        )}
      </Svg>
    );
  }

  return (
    <View style={box} accessibilityLabel="Pechkas logo" accessible>
      <Svg width={size} height={size} viewBox="0 0 64 64" style={LAYER}>
        {machined ? head.map(shape) : <Path fill={MARK_PATHS.flat.fill.disc} d={MARK_PATHS.flat.disc} />}
      </Svg>
      <Animated.View style={[LAYER, box, { transform: [{ rotate: turn }] }]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {machined ? slot.map((p, i) => shape(p, i + 5)) : <Path fill={MARK_PATHS.flat.fill.slot} d={MARK_PATHS.flat.slot} />}
        </Svg>
      </Animated.View>
    </View>
  );
}
