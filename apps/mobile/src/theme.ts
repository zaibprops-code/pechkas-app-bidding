/**
 * The look, in one place.
 *
 * Colours are the website's (src/styles/global.css in zaibprops-code/Pechkas),
 * so the app and pechkas.net read as one business. Every text and background
 * pair used here is at least 4.5:1. Green means trust; yellow means "tap
 * here" or money; brick is for warnings and nothing else.
 *
 * No patterns and no decoration: the owner tried truck-art and ajrak and
 * turned them down. The app is Pakistani in how it works, not in ornament.
 */
export const colour = {
  green: '#0b5148',
  greenDark: '#073b34',
  greenSoft: '#e3eeec',
  yellow: '#ffc53d',
  ink: '#14171a',
  inkSoft: '#2b3238',
  steel: '#4c565e',
  paper: '#faf6ef',
  paper2: '#f2ece1',
  /** The light grey the customer's screens sit on, with white cards on top, as inDrive does. */
  canvas: '#f2f1ed',
  /** A tile's own grey, a step darker than the canvas. */
  tile: '#e9e7e1',
  brick: '#9e3b22',
  white: '#ffffff',
  rule: 'rgba(20,23,26,0.1)',
} as const;

/**
 * Font family names, as registered in app/_layout.tsx. The fonts ship inside
 * the app: nothing is fetched over the network, so a weak signal never
 * leaves the screen in a fallback typeface.
 */
export const font = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemi: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_600SemiBold',
} as const;

export const radius = {
  card: 16,
  big: 18,
  sheet: 28,
  pill: 999,
} as const;

/** Nothing anybody taps is smaller than this, in either direction. */
export const TAP = 44;
