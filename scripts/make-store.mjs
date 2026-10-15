/**
 * The two pictures Google Play asks for besides screenshots:
 *
 *   docs/store/graphics/icon-512.png        512 × 512, the app icon
 *   docs/store/graphics/feature-1024x500.png 1024 × 500, the banner
 *
 *   node scripts/make-store.mjs
 *
 * Both are drawn, never edited by hand. The icon is the app's own icon at
 * Play's size. The banner is the website's logo — copied unchanged into
 * docs/store/source/ from zaibprops-code/Pechkas public/logo/ — on Pechkas
 * green. The wordmark there is outlines, not text, so no font on this
 * machine can change it; and there is no other text on the banner for the
 * same reason, and because Google crops and covers banners on some screens.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'store', 'graphics');
const GREEN = '#0b5148';
await mkdir(OUT, { recursive: true });

// The icon: Play wants 512 × 512. The app's 1024 icon, made smaller.
await sharp(join(ROOT, 'apps', 'mobile', 'assets', 'icon.png')).resize(512, 512).removeAlpha().png().toFile(join(OUT, 'icon-512.png'));
console.log('  icon-512.png');

// The banner: the logo, 640 wide, in the middle of 1024 × 500 green. No
// transparency: Play refuses a banner with an alpha channel.
const logo = await readFile(join(ROOT, 'docs', 'store', 'source', 'pechkas-logo-on-dark.svg'), 'utf8');
const [, , vw, vh] = logo.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const width = 640;
const height = Math.round((width * vh) / vw);
const drawn = await sharp(Buffer.from(logo), { density: 300 }).resize(width, height).png().toBuffer();
await sharp({ create: { width: 1024, height: 500, channels: 3, background: GREEN } })
  .composite([{ input: drawn, left: Math.round((1024 - width) / 2), top: Math.round((500 - height) / 2) }])
  .png()
  .toBuffer()
  .then((png) => sharp(png).flatten({ background: GREEN }).removeAlpha().png().toFile(join(OUT, 'feature-1024x500.png')));
console.log('  feature-1024x500.png');
