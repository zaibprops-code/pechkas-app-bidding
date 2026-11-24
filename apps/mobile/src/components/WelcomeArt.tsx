import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colour, font } from '../theme';

/**
 * The three drawings on the welcome pages (the owner's choice, 24 November
 * 2026, replacing the drawings over a yellow sweep). Each is one whole object
 * somebody recognises, drawn flat in the brand colours, sitting on a faint
 * disc so it holds its place on the page's glowing background:
 *
 *   price    a price tag marked "Rs" on its string, with a screwdriver —
 *            what you pay, for the repair;
 *   checked  a technician's badge on a lanyard, his initial (never a face)
 *            and a checked seal;
 *   cash     the job slip with every line ticked, on banknotes.
 *
 * Objects, never people, as everywhere in the app (Art.tsx). Each says what
 * its page says in words, so each is hidden from screen readers. Drawn in a
 * 300 × 300 box and scaled to whatever square the page gives it.
 */
export type WelcomeArtName = 'price' | 'checked' | 'cash';

const SHADE = '#d9d5cc';
const WHITE = colour.white;
const INK = colour.ink;
const GREEN = colour.green;
const YELLOW = colour.yellow;

export function WelcomeArt({ name, size = 300 }: { name: WelcomeArtName; size?: number | string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessible={false}>
      {name === 'price' && (
        <G>
          <Circle cx={150} cy={150} r={128} fill="#b97800" opacity={0.13} />
          <Path d="M206 160 C 236 120, 236 78, 206 52" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
          <G transform="rotate(-14 150 165)">
            <Path d="M74 112 H196 L238 165 L196 218 H74 A14 14 0 0 1 60 204 V126 A14 14 0 0 1 74 112 Z" fill="#c98a0c" opacity={0.35} transform="translate(6 8)" />
            <Path d="M74 112 H196 L238 165 L196 218 H74 A14 14 0 0 1 60 204 V126 A14 14 0 0 1 74 112 Z" fill={WHITE} />
            <Circle cx={208} cy={165} r={9} fill="#f6b52a" />
            <SvgText x={82} y={168} fontFamily={font.display} fontSize={44} fill={INK} letterSpacing={-1}>
              Rs
            </SvgText>
            <Rect x={84} y={182} width={88} height={10} rx={5} fill={GREEN} />
          </G>
          <G transform="rotate(-16 150 246)">
            <Rect x={44} y={234} width={72} height={26} rx={13} fill={GREEN} />
            <Rect x={114} y={240} width={14} height={14} rx={3} fill={SHADE} />
            <Rect x={126} y={244} width={112} height={7} rx={2.5} fill={INK} />
            <Path d="M238 242 L252 245 V250 L238 253 Z" fill={INK} />
          </G>
        </G>
      )}
      {name === 'checked' && (
        <G>
          <Circle cx={150} cy={150} r={128} fill={WHITE} opacity={0.07} />
          <Path d="M112 22 L142 86 M188 22 L158 86" stroke={YELLOW} strokeWidth={14} strokeLinecap="round" />
          <Rect x={136} y={78} width={28} height={22} rx={6} fill="#c9cfcc" />
          <G transform="rotate(5 150 180)">
            <Rect x={92} y={106} width={128} height={170} rx={18} fill="#04302a" opacity={0.45} />
            <Rect x={86} y={98} width={128} height={170} rx={18} fill={WHITE} />
            <Rect x={134} y={108} width={32} height={8} rx={4} fill={SHADE} />
            <Rect x={106} y={128} width={88} height={70} rx={12} fill={colour.greenSoft} />
            <SvgText x={150} y={179} textAnchor="middle" fontFamily={font.display} fontSize={40} fill={GREEN}>
              B
            </SvgText>
            <Rect x={106} y={212} width={70} height={10} rx={5} fill={INK} />
            <Rect x={106} y={230} width={50} height={8} rx={4} fill={SHADE} />
          </G>
          <Circle cx={212} cy={236} r={34} fill={YELLOW} stroke={GREEN} strokeWidth={6} />
          <Path d="M196 236 l11 11 21-22" stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {name === 'cash' && (
        <G>
          <Circle cx={150} cy={150} r={128} fill={WHITE} opacity={0.07} />
          <G transform="rotate(-16 150 190)">
            <Rect x={40} y={168} width={200} height={96} rx={12} fill="#0e6457" />
            <Rect x={52} y={180} width={176} height={72} rx={8} fill="none" stroke={colour.greenSoft} strokeWidth={2} opacity={0.5} />
            <Circle cx={140} cy={216} r={20} fill={colour.greenSoft} opacity={0.55} />
          </G>
          <G transform="rotate(-6 150 200)">
            <Rect x={56} y={180} width={200} height={96} rx={12} fill={GREEN} />
            <Rect x={68} y={192} width={176} height={72} rx={8} fill="none" stroke={colour.greenSoft} strokeWidth={2} opacity={0.55} />
            <Circle cx={156} cy={228} r={20} fill={colour.greenSoft} opacity={0.65} />
          </G>
          <G transform="rotate(6 150 130)">
            <Path d="M92 40 H208 V196 l-14.5 12 -14.5 -12 -14.5 12 -14.5 -12 -14.5 12 -14.5 -12 -14.5 12 -14.5 -12 Z" fill={WHITE} />
            <Rect x={92} y={40} width={116} height={26} fill={INK} />
            <Rect x={104} y={50} width={48} height={7} rx={3.5} fill={YELLOW} />
            {[86, 116, 146].map((y) => (
              <G key={y}>
                <Circle cx={114} cy={y} r={10} fill={GREEN} />
                <Path d={`M109 ${y} l4 4 7-8`} stroke={WHITE} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Rect x={132} y={y - 4} width={y === 146 ? 44 : 60} height={8} rx={4} fill={SHADE} />
              </G>
            ))}
            <Rect x={104} y={170} width={92} height={3} rx={1.5} fill="#ece9e2" />
          </G>
          <Circle cx={86} cy={190} r={32} fill={YELLOW} />
          <Path d="M71 190 l10 10 20-21" stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
    </Svg>
  );
}
