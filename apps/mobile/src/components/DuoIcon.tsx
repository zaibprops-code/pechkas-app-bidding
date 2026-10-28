import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DUO_ICONS, type DuoName, type DuoShape } from '@pechkas/shared/src/duo-icons';
import { colour } from '../theme';

/**
 * Two-tone icons: an ink outline over a brand-yellow fill on the part that
 * matters — the door of the house, the body of the bell, the inside of the
 * shield. The style of a designed app, rather than the thin single-line set
 * the screens use inside buttons (Icon.tsx), and in Pechkas' own two colours.
 *
 * The shapes live in packages/shared/src/duo-icons.ts, which the admin
 * panel draws too, so the app and the office can never show a different
 * icon. They say what the words beside them say, so screen readers skip them.
 */
export type { DuoName };

export function DuoIcon({ name, size = 26, accent = colour.yellow, ink = colour.ink }: { name: DuoName; size?: number; accent?: string; ink?: string }) {
  const shapes: readonly DuoShape[] = DUO_ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {shapes.map((p, i) => {
        const paint =
          p.paint === 'accent'
            ? { fill: accent }
            : p.paint === 'ink'
              ? { fill: ink }
              : p.paint === 'white'
                ? { fill: colour.white, stroke: ink, strokeWidth: 1.8 }
                : { fill: 'none', stroke: ink, strokeWidth: p.strokeWidth ?? 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
        if (p.shape === 'path') return <Path key={i} {...paint} d={p.d} />;
        if (p.shape === 'rect') return <Rect key={i} {...paint} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} />;
        return <Circle key={i} {...paint} cx={p.cx} cy={p.cy} r={p.r} />;
      })}
    </Svg>
  );
}
