// Builds docs/Pechkas-briefing.pdf from docs/BRIEFING.md (the owner's standing
// request: the briefing and the decision map follow every decision).
//   node scripts/briefing-pdf.mjs            (from the repository's root)
// Needs `marked`, not a project dependency: `npm i --no-save marked@12` first,
// or point NODE_PATH at a folder that has it. Playwright is already there.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { marked } = createRequire(import.meta.url)('marked');
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const [src = `${ROOT}docs/BRIEFING.md`, out = `${ROOT}docs/Pechkas-briefing.pdf`] = process.argv.slice(2);
const FONT = `${ROOT}node_modules/@expo-google-fonts/plus-jakarta-sans`;
// The cover carries the date written at the top of BRIEFING.md, so the two always agree.
let md = await readFile(src, 'utf8');
const today = /updated ([^,]+),/.exec(md)?.[1] ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });
// The first heading and the dated line go on the cover instead.
md = md.replace(/^# .*\n/, '');
const html = marked.parse(md);

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: J; font-weight: 400; src: url(file://${FONT}/400Regular/PlusJakartaSans_400Regular.ttf); }
@font-face { font-family: J; font-weight: 400; font-style: italic; src: url(file://${FONT}/400Regular_Italic/PlusJakartaSans_400Regular_Italic.ttf); }
@font-face { font-family: J; font-weight: 600; src: url(file://${FONT}/600SemiBold/PlusJakartaSans_600SemiBold.ttf); }
@font-face { font-family: J; font-weight: 700; src: url(file://${FONT}/700Bold/PlusJakartaSans_700Bold.ttf); }
@font-face { font-family: J; font-weight: 800; src: url(file://${FONT}/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf); }
:root { --green: #0b5148; --yellow: #ffc53d; --soft: #fff4d6; --ink: #14171a; --grey: #5b6168; --line: #e3ddd2; --paper: #faf6ef; }
* { box-sizing: border-box; }
body { margin: 0; font-family: J, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.5; background: #fff; }
@page { size: A4; margin: 20mm 18mm 18mm; } @page :first { margin: 0; }
.cover { height: 297mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always;
  background: var(--green); color: #fff; padding: 30mm 22mm; width: 100%; }
.cover .brand { font-weight: 800; font-size: 20pt; letter-spacing: .5px; }
.cover .brand span { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--yellow); margin-right: 10px; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 0 0 6mm; font-weight: 800; }
.cover .bar { width: 40mm; height: 4px; background: var(--yellow); margin-bottom: 8mm; }
.cover p { font-size: 12pt; max-width: 130mm; color: #dbe9e6; margin: 0 0 3mm; }
.cover .foot { font-size: 9.5pt; color: #b9d3ce; }
h2 { color: var(--green); font-size: 16pt; font-weight: 800; margin: 9mm 0 3mm; padding-bottom: 2mm; border-bottom: 3px solid var(--yellow); page-break-after: avoid; }
h2:first-of-type { margin-top: 0; }
h3 { font-size: 12pt; font-weight: 700; margin: 6mm 0 2mm; color: var(--ink); page-break-after: avoid; }
p { margin: 0 0 2.5mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1.2mm; }
li > ul, li > ol { margin: 1.2mm 0 0; }
strong { font-weight: 700; }
code { font-family: J, sans-serif; font-weight: 600; background: var(--paper); border: 1px solid var(--line); border-radius: 3px; padding: 0 3px; font-size: 9.5pt; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: var(--green); color: #fff; text-align: left; padding: 2mm 3mm; font-weight: 700; }
td { padding: 2mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; }
td:first-child { width: 28%; }
tr:nth-child(even) td { background: var(--paper); }
hr { display: none; }
blockquote { margin: 0; }
body > p:first-of-type { background: var(--soft); border-left: 4px solid var(--yellow); padding: 3mm 4mm; border-radius: 2px; font-size: 9.5pt; color: var(--grey); }
body > p:nth-of-type(2) { background: var(--soft); border-left: 4px solid var(--yellow); padding: 3mm 4mm; border-radius: 2px; margin-bottom: 6mm; }
</style></head><body>
<section class="cover">
  <div class="brand"><span></span>Pechkas</div>
  <div>
    <div class="bar"></div>
    <h1>A complete briefing<br>for an adviser</h1>
    <p>What Pechkas is, how the app works from start to finish, the money, the safety rules, every decision made and every decision still open.</p>
    <p>Give this to Claude, or anyone helping you decide, so they start from the facts.</p>
  </div>
  <div class="foot">Written 16 November 2026, updated ${today}, from the website and app repositories.<br>Har pech ka hal.</div>
</section>
${html}
</body></html>`;

await writeFile(out.replace(/\.pdf$/, '.html'), page);
const browser = await chromium.launch();
const p = await browser.newPage();
await p.goto(`file://${out.replace(/\.pdf$/, '.html')}`);
await p.evaluate(() => document.fonts.ready);
await p.pdf({
  path: out,
  format: 'A4',
  preferCSSPageSize: true,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#5b6168;padding:0 18mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>Pechkas — briefing for an adviser</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await browser.close();
await rm(out.replace(/\.pdf$/, '.html'), { force: true });
console.log('wrote', out);
