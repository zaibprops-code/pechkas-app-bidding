/**
 * Draws the app's icons and splash image from the Pechkas mark.
 *
 *    node scripts/make-icons.mjs
 *
 * The mark is the website's: a yellow screw head with an inset slot rising
 * to the right. The two paths below are copied from the website's generated
 * `public/logo/pechkas-mark.svg`, whose geometry lives in `src/lib/mark.js`
 * in zaibprops-code/Pechkas. If that ever changes, copy the new paths here
 * and run this again. Nothing in apps/mobile/assets is edited by hand.
 *
 * Two rules from the website's BRAND.md that matter here too:
 *  - the slot never runs edge to edge (at small sizes it reads as "not
 *    allowed"), and
 *  - in one colour the slot is cut out as a hole, never painted on top,
 *    or the whole mark becomes a plain dot. Android's themed icon is one
 *    colour, so the monochrome version is drawn that way.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps', 'mobile', 'assets');

const DISC = 'M32,0 A32,32 0 1 0 32,64 A32,32 0 1 0 32,0 Z';
const SLOT =
  'M16.193,33.621 L41.307,19.121 A6.5,6.5 0 0 1 47.807,30.379 L22.693,44.879 A6.5,6.5 0 0 1 16.193,33.621 Z';

const GREEN = '#0b5148';
const YELLOW = '#ffc53d';
const INK = '#14171a';

/** The mark at `size` px, centred in a `box` px square, on `background`. */
function markSvg({ box, size, background = null, mono = null }) {
  const scale = size / 64;
  const offset = (box - size) / 2;
  const ground = background ? `<rect width="${box}" height="${box}" fill="${background}"/>` : '';
  const mark = mono
    ? `<path fill="${mono}" fill-rule="evenodd" d="${DISC} ${SLOT}"/>`
    : `<path fill="${YELLOW}" d="${DISC}"/><path fill="${INK}" d="${SLOT}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">${ground}<g transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g></svg>`;
}

async function draw(name, svg) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, name));
  console.log(`  ${name}`);
}

await mkdir(OUT, { recursive: true });
console.log('Drawing app icons:');

// The store and iPhone icon: no transparency allowed, so the mark sits on green.
await draw('icon.png', markSvg({ box: 1024, size: 620, background: GREEN }));

// Android's adaptive icon. The launcher crops the outer third in any shape it
// likes, so the mark stays inside the middle 66%.
await draw('adaptive-icon-foreground.png', markSvg({ box: 1024, size: 560 }));
await draw('adaptive-icon-monochrome.png', markSvg({ box: 1024, size: 560, mono: '#ffffff' }));

// Android's notification icon: the status bar draws it in one colour from
// its shape alone, so it is the mono mark, white on nothing, 24dp at the
// largest screen density (96px) with Google's 2dp of air around it.
await draw('notification-icon.png', markSvg({ box: 96, size: 80, mono: '#ffffff' }));

// Shown on green while the app starts.
await draw('splash-icon.png', markSvg({ box: 512, size: 400 }));

await draw('favicon.png', markSvg({ box: 48, size: 44 }));
