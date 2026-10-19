/**
 * Draws the app's icons and splash image from the Pechkas mark.
 *
 *    node scripts/make-icons.mjs
 *
 * The mark is the website's machined screw head: bevel lit from the upper
 * left, a slot with a floor and a bronze wall, one glint. Its shapes are
 * copied from src/lib/mark.js in zaibprops-code/Pechkas by
 * scripts/copy-mark.mjs into packages/shared/src/mark-paths.ts, and read
 * from there — Mark.tsx and the admin panel read the same file. Nothing in
 * apps/mobile/assets is edited by hand.
 *
 * Rules from the website's BRAND.md that matter here too:
 *  - the slot never runs edge to edge (at small sizes it reads as "not
 *    allowed");
 *  - in one colour the slot is cut out as a hole, never painted on top, or
 *    the whole mark becomes a plain dot. Android's themed icon and the
 *    notification icon are one colour, and small, so they are the FLAT
 *    one-colour mark: the machined head's fine ring would be under a pixel.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps', 'mobile', 'assets');

const { MARK_PATHS } = await import('../packages/shared/src/mark-paths.ts');

const GREEN = '#0b5148';
const YELLOW = '#ffc53d';
const INK = '#14171a';

/** The mark at `size` px, centred in a `box` px square, on `background`. */
function markSvg({ box, size, background = null, mono = null, flat = false }) {
  const scale = size / 64;
  const offset = (box - size) / 2;
  const ground = background ? `<rect width="${box}" height="${box}" fill="${background}"/>` : '';
  const mark = mono
    ? `<path fill="${mono}" fill-rule="evenodd" d="${MARK_PATHS.flatOne}"/>`
    : flat
      ? `<path fill="${YELLOW}" d="${MARK_PATHS.flat.disc}"/><path fill="${INK}" d="${MARK_PATHS.flat.slot}"/>`
      : MARK_PATHS.machined
          .map((p) =>
            'stroke' in p
              ? `<path fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linecap="round" d="${p.d}"/>`
              : `<path fill="${p.fill}" d="${p.d}"/>`,
          )
          .join('');
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

// The browser tab, where the machined detail is under a pixel: flat.
await draw('favicon.png', markSvg({ box: 48, size: 44, flat: true }));
