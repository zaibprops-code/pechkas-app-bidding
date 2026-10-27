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
  | 'arrowLeft'
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
  | 'me'
  | 'star'
  | 'alert'
  | 'chevronRight'
  | 'bell'
  | 'logout'
  | 'doc'
  | 'trash'
  | 'phone'
  | 'mail'
  | 'tool'
  | 'menu'
  | 'search'
  | 'clock'
  | 'settings'
  | 'help'
  | 'whatsapp'
  | 'locate'
  | 'cross'
  | 'check'
  | 'camera'
  | 'image'
  | 'clipboard'
  | 'briefcase'
  | 'wallet'
  | 'share'
  | 'swap';

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
      {name === 'arrowLeft' && <Path {...s} d="M19 12H5M11 6l-6 6 6 6" />}
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
      {name === 'star' && (
        <Path
          {...s}
          fill={filled ? color : 'none'}
          d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"
        />
      )}
      {name === 'alert' && <Path {...s} d="M12 3L2 20h20zM12 10v4M12 17v.5" />}
      {name === 'cross' && <Path {...s} d="M6 6l12 12M18 6L6 18" />}
      {name === 'check' && <Path {...s} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === 'camera' && (
        <>
          <Path {...s} d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20v10.5H4z" />
          <Circle {...s} cx={12} cy={13.5} r={3.4} />
        </>
      )}
      {name === 'image' && (
        <>
          <Rect {...s} x={4} y={5} width={16} height={14} rx={2.5} />
          <Circle {...s} cx={9} cy={10} r={1.6} />
          <Path {...s} d="M20 15.5l-4.5-4.5L7 19" />
        </>
      )}
      {name === 'chevronRight' && <Path {...s} d="M9 6l6 6-6 6" />}
      {name === 'bell' && <Path {...s} d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />}
      {name === 'logout' && <Path {...s} d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h10" />}
      {name === 'doc' && <Path {...s} d="M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6" />}
      {name === 'trash' && <Path {...s} d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />}
      {name === 'phone' && <Path {...s} d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />}
      {name === 'mail' && (
        <>
          <Rect {...s} x={3} y={5} width={18} height={14} rx={2} />
          <Path {...s} d="M3 7l9 6 9-6" />
        </>
      )}
      {name === 'tool' && <Path {...s} d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-5-5l2.5 2.5-1.5 1.5z" />}
      {name === 'menu' && <Path {...s} d="M4 7h16M4 12h16M4 17h16" />}
      {name === 'search' && (
        <>
          <Circle {...s} cx={11} cy={11} r={6.5} />
          <Path {...s} d="M16 16l4.5 4.5" />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle {...s} cx={12} cy={12} r={8.5} />
          <Path {...s} d="M12 7.5V12l3 2" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle {...s} cx={12} cy={12} r={3} />
          <Path
            {...s}
            d="M10.3 3.2h3.4l.5 2.4 1.7.9 2.3-.8 1.7 2.9-1.8 1.7v1.9l1.8 1.7-1.7 2.9-2.3-.8-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.8-1.7-2.9 1.8-1.7v-1.9L4.4 8.6l1.7-2.9 2.3.8 1.7-.9z"
          />
        </>
      )}
      {name === 'help' && (
        <>
          <Circle {...s} cx={12} cy={12} r={8.5} />
          <Path {...s} d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.5M12 17v.5" />
        </>
      )}
      {name === 'whatsapp' && <Path {...s} d="M4 20l1.3-3.9A8 8 0 1 1 8 19zM9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1.5 2 .8" />}
      {name === 'locate' && <Path {...s} d="M20 4L4 11l7 2 2 7z" />}
      {name === 'clipboard' && (
        <>
          <Rect {...s} x={5} y={4.5} width={14} height={16.5} rx={2.5} />
          <Rect {...s} x={9} y={2.5} width={6} height={4} rx={1.2} />
          <Path {...s} d="M8.8 11.5l1.6 1.6 3-3M8.8 17h6.4" />
        </>
      )}
      {name === 'briefcase' && (
        <>
          <Rect {...s} x={3} y={7} width={18} height={13} rx={2.5} />
          <Path {...s} d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M3 12.5h18M11 12.5v2h2v-2" />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Path {...s} d="M4 7.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.5a2 2 0 0 0-2-2H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h10" />
          <Circle {...s} cx={16} cy={14} r={1.2} />
        </>
      )}
      {name === 'share' && (
        <>
          <Circle {...s} cx={18} cy={5.5} r={2.5} />
          <Circle {...s} cx={6} cy={12} r={2.5} />
          <Circle {...s} cx={18} cy={18.5} r={2.5} />
          <Path {...s} d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" />
        </>
      )}
      {name === 'swap' && <Path {...s} d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" />}
      {name === 'me' && (
        <>
          <Circle {...s} cx={12} cy={8} r={4} />
          <Path {...s} d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </>
      )}
    </Svg>
  );
}
