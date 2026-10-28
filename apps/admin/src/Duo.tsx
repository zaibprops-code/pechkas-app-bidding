import { DUO_ICONS, type DuoName, type DuoShape } from '@pechkas/shared/src/duo-icons.ts';
import { colour } from '@pechkas/shared/src/tokens.ts';

/**
 * The app's two-tone icons, drawn from the same shapes
 * (packages/shared/src/duo-icons.ts) as apps/mobile/src/components/DuoIcon.tsx,
 * so the office and the phones never show a different icon. Decoration:
 * the words beside it say what it means, so screen readers skip it.
 */
export function Duo({ name, size = 24, accent = colour.yellow, ink = colour.ink }: { name: DuoName; size?: number; accent?: string; ink?: string }) {
  const shapes: readonly DuoShape[] = DUO_ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {shapes.map((p, i) => {
        const paint =
          p.paint === 'accent'
            ? { fill: accent }
            : p.paint === 'ink'
              ? { fill: ink }
              : p.paint === 'white'
                ? { fill: colour.white, stroke: ink, strokeWidth: 1.8 }
                : { fill: 'none', stroke: ink, strokeWidth: p.strokeWidth ?? 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
        if (p.shape === 'path') return <path key={i} {...paint} d={p.d} />;
        if (p.shape === 'rect') return <rect key={i} {...paint} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} />;
        return <circle key={i} {...paint} cx={p.cx} cy={p.cy} r={p.r} />;
      })}
    </svg>
  );
}

/** A section's heading, the way the app heads a card: a two-tone icon on a soft yellow tile, then the title. */
export function Head({ icon, title }: { icon: DuoName; title: string }) {
  return (
    <div className="head">
      <span className="head-tile">
        <Duo name={icon} size={28} />
      </span>
      <h1>{title}</h1>
    </div>
  );
}
