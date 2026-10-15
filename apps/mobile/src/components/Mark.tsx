import Svg, { Path } from 'react-native-svg';

/**
 * The Pechkas mark: a yellow screw head with an inset slot rising to the
 * right. The paths are the website's (public/logo/pechkas-mark.svg) and must
 * stay identical to scripts/make-icons.mjs, so the icon on the home screen
 * and the logo inside the app are the same drawing.
 */
export const DISC = 'M32,0 A32,32 0 1 0 32,64 A32,32 0 1 0 32,0 Z';
export const SLOT =
  'M16.193,33.621 L41.307,19.121 A6.5,6.5 0 0 1 47.807,30.379 L22.693,44.879 A6.5,6.5 0 0 1 16.193,33.621 Z';

export function Mark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Pechkas logo">
      <Path fill="#ffc53d" d={DISC} />
      <Path fill="#14171a" d={SLOT} />
    </Svg>
  );
}
