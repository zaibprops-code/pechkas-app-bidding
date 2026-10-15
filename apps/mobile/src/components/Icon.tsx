import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * One line-icon set for the whole app, drawn on a 24-unit grid with a single
 * stroke weight. No emoji anywhere in the interface: they look different on
 * every phone, and some cheap Android phones draw them as empty boxes.
 */
export type IconName =
  | 'pin'
  | 'chevronDown'
  | 'arrowRight'
  | 'mic'
  | 'video'
  | 'ac'
  | 'bolt'
  | 'drop'
  | 'cctv'
  | 'wifi'
  | 'ups'
  | 'shield'
  | 'lock'
  | 'home'
  | 'jobs'
  | 'chat'
  | 'me';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

export function Icon({ name, size = 24, color = colour.green, strokeWidth = 1.8, filled = false }: Props) {
  const s = { stroke: color, strokeWidth, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'pin' && (
        <>
          <Path {...s} d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
          <Circle {...s} cx={12} cy={10} r={2.5} />
        </>
      )}
      {name === 'chevronDown' && <Path {...s} d="M6 9l6 6 6-6" />}
      {name === 'arrowRight' && <Path {...s} d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'mic' && (
        <>
          <Rect {...s} x={9} y={2} width={6} height={12} rx={3} />
          <Path {...s} d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </>
      )}
      {name === 'video' && (
        <>
          <Rect {...s} x={2} y={6} width={14} height={12} rx={2} />
          <Path {...s} d="M16 10l6-3v10l-6-3z" />
        </>
      )}
      {name === 'ac' && (
        <>
          <Rect {...s} x={2} y={4} width={20} height={9} rx={2} />
          <Path {...s} d="M6 10h12M7 17l-1 3M12 17v3M17 17l1 3" />
        </>
      )}
      {name === 'bolt' && <Path {...s} d="M13 2L4 14h7l-1 8 9-12h-7z" />}
      {name === 'drop' && <Path {...s} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />}
      {name === 'cctv' && <Path {...s} d="M3 7l13 4-2 5-13-4zM16 11l4 1M9 15l-1 5H4" />}
      {name === 'wifi' && (
        <>
          <Path {...s} d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
          <Circle {...s} cx={12} cy={19.5} r={1} />
        </>
      )}
      {name === 'ups' && (
        <>
          <Rect {...s} x={3} y={6} width={18} height={12} rx={2} />
          <Path {...s} d="M7 10h4M7 14h2M15 10v4" />
        </>
      )}
      {name === 'shield' && <Path {...s} d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8.5 12l2.5 2.5 4.5-5" />}
      {name === 'lock' && (
        <>
          <Rect {...s} x={5} y={11} width={14} height={10} rx={2} />
          <Path {...s} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      )}
      {name === 'home' &&
        (filled ? (
          <Path fill={color} d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" />
        ) : (
          <Path {...s} d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" />
        ))}
      {name === 'jobs' && (
        <>
          <Rect {...s} x={4} y={3} width={16} height={18} rx={2} />
          <Path {...s} d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
      {name === 'chat' && <Path {...s} d="M4 5h16v11H9l-5 4z" />}
      {name === 'me' && (
        <>
          <Circle {...s} cx={12} cy={8} r={4} />
          <Path {...s} d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </>
      )}
    </Svg>
  );
}
