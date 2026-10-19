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
 */
export function Mark({ size = 32 }: { size?: number }) {
  const machined = size >= MARK_PATHS.machinedFromPx;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Pechkas logo">
      {machined ? (
        MARK_PATHS.machined.map((p, i) =>
          'stroke' in p ? (
            <Path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeLinecap="round" />
          ) : (
            <Path key={i} d={p.d} fill={p.fill} />
          ),
        )
      ) : (
        <>
          <Path fill={MARK_PATHS.flat.fill.disc} d={MARK_PATHS.flat.disc} />
          <Path fill={MARK_PATHS.flat.fill.slot} d={MARK_PATHS.flat.slot} />
        </>
      )}
    </Svg>
  );
}
