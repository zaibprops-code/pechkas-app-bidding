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
  /** Warm cream behind a drawing: the trade tiles, the media tiles, the choose cards. */
  cream: '#f6f2e8',
  /** Soft yellow: the tile behind a two-tone icon, a money card, the menu's current row. */
  softYellow: '#fff6dc',
  /** Soft brick: the tile behind the one row that cannot be undone. */
  softBrick: '#fbe6df',
  brick: '#9e3b22',
  white: '#ffffff',
  rule: 'rgba(20,23,26,0.1)',
} as const;

/**
 * Font family names, as registered in app/_layout.tsx. The fonts ship inside
 * the app: nothing is fetched over the network, so a weak signal never
 * leaves the screen in a fallback typeface.
 *
 * Plus Jakarta Sans for everything people read and tap — the owner found the
 * first pair (Bricolage Grotesque headings, IBM Plex Sans text) not
 * professional enough for an app; Jakarta is a clean, modern app face with
 * the weights a phone screen needs. `brand` keeps Bricolage for the word
 * "Pechkas" beside the mark, because that is the logo's own lettering
 * (BRAND.md in the website repository) and a logo does not change typeface.
 */
export const font = {
  display: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  mono: 'IBMPlexMono_600SemiBold',
  brand: 'BricolageGrotesque_800ExtraBold',
} as const;

export const radius = {
  card: 16,
  big: 18,
  sheet: 28,
  pill: 999,
} as const;

/** The one shadow under a white card: barely there, as inDrive's. */
export const shadow = { card: '0px 2px 10px rgba(20, 23, 26, 0.05)' } as const;

/** Nothing anybody taps is smaller than this, in either direction. */
export const TAP = 44;
