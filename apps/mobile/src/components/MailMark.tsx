import Svg, { Path, Rect } from 'react-native-svg';

/**
 * The email mark on the welcome screen, beside Google's own G (the owner's
 * choice, 26 November 2026, "D"): a plain envelope outline in dark grey, the
 * ordinary colour of an email sign-in, not Pechkas' yellow or green. It sits
 * on the same grey circle as the G, so the two ways in look like a pair. The
 * words beside it say what it is, so screen readers skip it.
 */
const GREY = '#3c4043';

export function MailMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      <Rect x={5} y={11} width={38} height={27} rx={5} fill="#ffffff" stroke={GREY} strokeWidth={3.5} />
      <Path d="M8 15 L24 27 L40 15" fill="none" stroke={GREY} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
