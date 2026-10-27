import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colour } from '../theme';

/**
 * Two-tone icons for the side menu: an ink outline over a brand-yellow fill
 * on the part that matters — the door of the house, the body of the bell,
 * the inside of the shield. The style of a designed app, rather than the
 * thin single-line set the screens use (Icon.tsx), and in Pechkas' own two
 * colours. Drawn on the same 24-unit grid; they say what the words beside
 * them say, so screen readers skip them.
 */
export type DuoName = 'home' | 'jobs' | 'bell' | 'shield' | 'help' | 'support' | 'settings' | 'share' | 'briefcase' | 'wallet' | 'swap' | 'mic' | 'video' | 'lock' | 'search' | 'phone' | 'chat' | 'pin' | 'flag' | 'star' | 'camera' | 'clock' | 'mail' | 'doc' | 'logout' | 'trash';

export function DuoIcon({ name, size = 26, accent = colour.yellow, ink = colour.ink }: { name: DuoName; size?: number; accent?: string; ink?: string }) {
  const line = { stroke: ink, strokeWidth: 1.8, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const fill = { fill: accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' && (
        <>
          <Path {...fill} d="M9.5 21v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21z" />
          <Path {...line} d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
          <Path {...line} d="M9.5 21v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21" />
        </>
      )}
      {name === 'jobs' && (
        <>
          <Rect {...fill} x={8.5} y={2.5} width={7} height={4.5} rx={1.4} />
          <Rect {...line} x={4.5} y={4.5} width={15} height={17} rx={2.5} />
          <Rect {...line} x={8.5} y={2.5} width={7} height={4.5} rx={1.4} />
          <Path {...line} d="M8.5 12.2l1.8 1.8 3.4-3.4M8.5 17.5h7" />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path {...fill} d="M6 16.5V11a6 6 0 0 1 12 0v5.5z" />
          <Path {...line} d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" />
        </>
      )}
      {name === 'shield' && (
        <>
          <Path {...fill} d="M12 2.5l8 3.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
          <Path {...line} d="M12 2.5l8 3.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8.5 12l2.5 2.5 4.5-5" />
        </>
      )}
      {name === 'help' && (
        <>
          <Circle {...fill} cx={12} cy={12} r={9} />
          <Circle {...line} cx={12} cy={12} r={9} />
          <Path {...line} d="M9.6 9.6a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.5M12 17.2v.3" />
        </>
      )}
      {name === 'support' && (
        <>
          <Rect {...fill} x={3.5} y={12} width={4} height={6.5} rx={1.6} />
          <Rect {...fill} x={16.5} y={12} width={4} height={6.5} rx={1.6} />
          <Path {...line} d="M3.5 15v-3a8.5 8.5 0 0 1 17 0v3" />
          <Rect {...line} x={3.5} y={12} width={4} height={6.5} rx={1.6} />
          <Rect {...line} x={16.5} y={12} width={4} height={6.5} rx={1.6} />
          <Path {...line} d="M18.5 18.5c0 1.5-1.5 2.5-4 2.5h-1.5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle {...fill} cx={12} cy={12} r={3.2} />
          <Circle {...line} cx={12} cy={12} r={3.2} />
          <Path
            {...line}
            d="M10.3 3h3.4l.5 2.4 1.7.9 2.3-.8 1.7 2.9-1.8 1.7v1.9l1.8 1.7-1.7 2.9-2.3-.8-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.8-1.7-2.9 1.8-1.7v-1.9L4.3 8.4 6 5.5l2.3.8 1.7-.9z"
          />
        </>
      )}
      {name === 'share' && (
        <>
          <Circle {...fill} cx={18} cy={5.5} r={2.6} />
          <Circle {...fill} cx={6} cy={12} r={2.6} />
          <Circle {...fill} cx={18} cy={18.5} r={2.6} />
          <Circle {...line} cx={18} cy={5.5} r={2.6} />
          <Circle {...line} cx={6} cy={12} r={2.6} />
          <Circle {...line} cx={18} cy={18.5} r={2.6} />
          <Path {...line} d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1" />
        </>
      )}
      {name === 'briefcase' && (
        <>
          <Path {...fill} d="M3 12.5h18v5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
          <Rect {...line} x={3} y={7} width={18} height={13} rx={2.5} />
          <Path {...line} d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M3 12.5h18" />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect {...fill} x={13} y={11} width={7.5} height={6} rx={1.5} />
          <Path {...line} d="M4 7.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.5a2 2 0 0 0-2-2H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h10" />
          <Rect {...line} x={13} y={11} width={7.5} height={6} rx={1.5} />
          <Circle cx={16} cy={14} r={1} fill={ink} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect {...fill} x={9} y={2.5} width={6} height={11.5} rx={3} />
          <Rect {...line} x={9} y={2.5} width={6} height={11.5} rx={3} />
          <Path {...line} d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M9 21.5h6" />
        </>
      )}
      {name === 'video' && (
        <>
          <Rect {...fill} x={2.5} y={6} width={13} height={12} rx={2.5} />
          <Rect {...line} x={2.5} y={6} width={13} height={12} rx={2.5} />
          <Path {...line} d="M15.5 10.2l5.5-3v9.6l-5.5-3z" />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect {...fill} x={4.5} y={10.5} width={15} height={11} rx={2.5} />
          <Rect {...line} x={4.5} y={10.5} width={15} height={11} rx={2.5} />
          <Path {...line} d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v3" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...fill} cx={10.5} cy={10.5} r={6.5} />
          <Circle {...line} cx={10.5} cy={10.5} r={6.5} />
          <Path {...line} strokeWidth={2.2} d="M15.5 15.5l5 5" />
        </>
      )}
      {name === 'phone' && (
        <>
          <Path {...fill} d="M5 3.5h3.5l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8l1.6-2.4 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />
          <Path {...line} d="M5 3.5h3.5l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8l1.6-2.4 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />
        </>
      )}
      {name === 'chat' && (
        <>
          <Path {...fill} d="M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4.2A2 2 0 0 1 4 14.5z" />
          <Path {...line} d="M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4.2A2 2 0 0 1 4 14.5z" />
          <Path {...line} d="M8.5 10h.01M12 10h.01M15.5 10h.01" strokeWidth={2.6} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path {...fill} d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
          <Path {...line} d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
          <Circle {...line} cx={12} cy={10} r={2.6} />
        </>
      )}
      {name === 'flag' && (
        <>
          <Path {...fill} d="M5 4.5h12.5l-2.5 4 2.5 4H5z" />
          <Path {...line} d="M5 21V4.5h12.5l-2.5 4 2.5 4H5" />
        </>
      )}
      {name === 'star' && (
        <>
          <Path {...fill} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          <Path {...line} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path {...fill} d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.7-2.5h5l1.7 2.5h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <Path {...line} d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.7-2.5h5l1.7 2.5h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <Circle cx={12} cy={13} r={3.6} fill="#ffffff" stroke={ink} strokeWidth={1.8} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle {...fill} cx={12} cy={12} r={9} />
          <Circle {...line} cx={12} cy={12} r={9} />
          <Path {...line} strokeWidth={2} d="M12 7.5V12l3 2" />
        </>
      )}
      {name === 'mail' && (
        <>
          <Rect {...fill} x={3} y={5.5} width={18} height={13} rx={2.5} />
          <Rect {...line} x={3} y={5.5} width={18} height={13} rx={2.5} />
          <Path {...line} d="M3.8 7l8.2 6 8.2-6" />
        </>
      )}
      {name === 'doc' && (
        <>
          <Path {...fill} d="M14 3.5V8h4.5z" />
          <Path {...line} d="M6 3.5h8l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5zM14 3.5V8h4.5M8 12.5h8M8 16h5" />
        </>
      )}
      {name === 'logout' && (
        <>
          <Rect {...fill} x={3.5} y={3.5} width={10} height={17} rx={2} />
          <Rect {...line} x={3.5} y={3.5} width={10} height={17} rx={2} />
          <Path {...line} strokeWidth={2} d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path {...fill} d="M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5z" />
          <Path {...line} d="M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5zM4 7.5h16M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5M10.5 11v6M13.5 11v6" />
        </>
      )}
      {name === 'swap' && <Path {...line} strokeWidth={2.1} d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" />}
    </Svg>
  );
}
