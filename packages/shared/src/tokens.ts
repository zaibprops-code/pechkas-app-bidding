/**
 * The colours and the card shadow, in ONE place, for both the app
 * (apps/mobile/src/theme.ts re-exports them) and the admin panel (which
 * turns them into CSS variables). The website's colours
 * (src/styles/global.css in zaibprops-code/Pechkas), so the app, the
 * office and pechkas.net read as one business. docs/DESIGN.md says what
 * each one is for. Every text and background pair used is at least 4.5:1.
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
  /** The fill of a two-tone icon on a soft brick tile (Delete my account). */
  brickTint: '#f3b9a8',
  brick: '#9e3b22',
  /** Quiet words on the brand yellow (a greeting, a line under a name): a warm dark brown, 7:1 on yellow. */
  onYellow: '#3d2f12',
  white: '#ffffff',
  rule: 'rgba(20,23,26,0.1)',
} as const;

/**
 * The welcome pages' backgrounds (the owner's choice, 24 November 2026): each
 * page's own colour with a soft light behind its drawing, fading darker to the
 * edges. The sign-in screens' picture card uses the yellow one. Four stops each, at GLOW_STOPS; the middle one is the brand colour
 * itself, so the words sit on the colour they were checked against.
 */
export const glow = {
  yellow: ['#fff1c2', '#ffd45c', '#ffc53d', '#f0a316'],
  green: ['#1f8a76', '#11695b', '#0b5148', '#063a33'],
  ink: ['#20453f', '#1a2624', '#14171a', '#0b0d0f'],
} as const;
export const GLOW_STOPS = [0, 0.38, 0.62, 1] as const;

/** The one shadow under a white card: barely there, as inDrive's. */
export const shadow = { card: '0px 2px 10px rgba(20, 23, 26, 0.05)' } as const;
