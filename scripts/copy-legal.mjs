/**
 * Copies the app's privacy policy, terms, technician agreement and
 * delete-account page from the website into this repository, so the app can
 * show them on its own screens.
 *
 *    (in ../Pechkas)  npm run build
 *    (here)           node scripts/copy-legal.mjs ../Pechkas
 *
 * The wording lives in ONE place: src/pages/app/*.astro in
 * zaibprops-code/Pechkas. The stores link to those pages, so they must stay on
 * the website; the app must not send people to a browser to read them. This
 * reads the BUILT pages (dist/client/app/<page>/index.html), where the
 * business name, the phone number and every other value from the website's
 * data are already filled in, and writes packages/shared/src/legal-docs.ts.
 * Nobody types the text twice.
 *
 * Only the handful of elements the pages use are understood. Anything else
 * stops the script with its name, rather than being quietly left out of a
 * legal document. One thing is left out on purpose: the "Edit this page at
 * src/pages/…" sentence in the draft box, which is addressed to the owner.
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const site = resolve(process.argv[2] || '../Pechkas');
const PAGES = ['privacy', 'terms', 'technician-agreement', 'delete-account'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    if (!(e in ENTITIES)) throw new Error(`Unknown entity ${m}`);
    return ENTITIES[e];
  });

/** A small tree of the HTML: elements with their class and href, and text. */
function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input']);
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.children.push({ tag: '#text', text: decode(m[4]) });
      continue;
    }
    const [, close, tag, attrs] = m;
    if (close) {
      if (top.tag !== tag) throw new Error(`Expected </${top.tag}>, found </${tag}>`);
      stack.pop();
      continue;
    }
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const href = /href="([^"]*)"/.exec(attrs)?.[1];
    const node = { tag, cls, href: href === undefined ? undefined : decode(href), children: [] };
    top.children.push(node);
    if (VOID.has(tag)) throw new Error(`<${tag}> is not understood in a legal page`);
    stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].tag}>`);
  return root;
}

const textOf = (n) => (n.tag === '#text' ? n.text : n.children.map(textOf).join(''));
const squash = (s) => s.replace(/\s+/g, ' ');

/** Inline content: runs of text, each with how it is marked. */
function inlines(node, marks = {}) {
  const out = [];
  for (const c of node.children) {
    if (c.tag === '#text') {
      out.push({ t: squash(c.text), ...marks });
      continue;
    }
    const cls = c.cls.split(/\s+/);
    let m;
    if (c.tag === 'strong') m = cls.includes('legal__mark') ? { mark: true } : { b: true };
    else if (c.tag === 'em') m = { i: true };
    else if (c.tag === 'code') m = { code: true };
    else if (c.tag === 'a' && c.href) m = { href: c.href };
    else if (c.tag === 'span' && cls.includes('ph')) m = { ph: true };
    else if (c.tag === 'span' && cls.includes('legal__mark')) m = { mark: true };
    else throw new Error(`<${c.tag} class="${c.cls}"> is not understood inside a paragraph`);
    out.push(...inlines(c, { ...marks, ...m }));
  }
  return out;
}

/** Joins neighbouring runs marked the same way and trims the ends. */
function tidy(runs) {
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    const same = last && JSON.stringify({ ...last, t: '' }) === JSON.stringify({ ...r, t: '' });
    if (same) last.t += r.t;
    else out.push({ ...r });
  }
  if (out.length) {
    out[0].t = out[0].t.replace(/^\s+/, '');
    out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, '');
  }
  return out.filter((r) => r.t !== '');
}

/** The draft box ends with a note to the owner about which file to edit: not for the app. */
function withoutEditNote(runs) {
  const i = runs.findIndex((r) => r.code);
  if (i < 0) return runs;
  const before = runs.slice(0, i);
  const prev = before[before.length - 1];
  if (!prev || !/Edit this page at\s*$/.test(prev.t)) throw new Error('A <code> that is not the "Edit this page at" note');
  prev.t = prev.t.replace(/\s*Edit this page at\s*$/, '');
  const after = runs.slice(i + 1);
  if (after[0]) after[0].t = after[0].t.replace(/^\./, '');
  return tidy([...before, ...after]);
}

const items = (list) =>
  list.children
    .filter((c) => c.tag !== '#text' || c.text.trim())
    .map((li) => {
      if (li.tag !== 'li') throw new Error(`<${li.tag}> inside a list`);
      return tidy(inlines(li));
    });

function blocks(section) {
  const out = [];
  for (const n of section.children) {
    if (n.tag === '#text') {
      if (n.text.trim()) throw new Error(`Loose text in the page: "${n.text.trim()}"`);
      continue;
    }
    const cls = n.cls.split(/\s+/);
    if (n.tag === 'h2' || n.tag === 'h3') out.push({ k: n.tag, text: squash(textOf(n)).trim() });
    else if (n.tag === 'p' && cls.includes('actions')) {
      out.push({
        k: 'actions',
        items: n.children
          .filter((c) => c.tag !== '#text' || c.text.trim())
          .map((a) => {
            if (a.tag !== 'a' || !a.href) throw new Error('Only links belong in .actions');
            return { label: squash(textOf(a)).trim(), href: a.href, kind: a.cls.includes('btn-wa') ? 'whatsapp' : 'call' };
          }),
      });
    } else if (n.tag === 'p') {
      const k = cls.includes('legal__meta') ? 'meta' : cls.includes('legal__decide') ? 'decide' : 'p';
      if (n.cls && k === 'p') throw new Error(`<p class="${n.cls}"> is not understood`);
      out.push({ k, c: tidy(inlines(n)) });
    } else if (n.tag === 'ul') {
      if (n.cls && !cls.includes('cross-list')) throw new Error(`<ul class="${n.cls}"> is not understood`);
      out.push({ k: cls.includes('cross-list') ? 'cross' : 'ul', items: items(n) });
    } else if (n.tag === 'ol') out.push({ k: 'ol', items: items(n) });
    else if (n.tag === 'div' && cls.includes('legal__review')) {
      out.push({
        k: 'review',
        paras: n.children
          .filter((c) => c.tag !== '#text' || c.text.trim())
          .map((p) => {
            if (p.tag !== 'p') throw new Error(`<${p.tag}> inside the review box`);
            return withoutEditNote(tidy(inlines(p)));
          })
          .filter((runs) => runs.length),
      });
    } else throw new Error(`<${n.tag} class="${n.cls}"> is not understood in a legal page`);
  }
  // A <code> anywhere but the draft box would be shown as code to a customer.
  if (JSON.stringify(out).includes('"code":true')) throw new Error('<code> outside the draft box');
  return out;
}

function element(root, test) {
  const seen = [root];
  while (seen.length) {
    const n = seen.shift();
    if (n.tag !== '#text' && test(n)) return n;
    if (n.children) seen.push(...n.children);
  }
  return null;
}

const docs = {};
for (const page of PAGES) {
  const file = join(site, 'dist/client/app', page, 'index.html');
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    throw new Error(`No ${file}. Run \`npm run build\` in the website first.`);
  }
  html = html.replace(/\s+data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
  const tree = parse(main);
  const h1 = element(tree, (n) => n.tag === 'h1');
  const lede = element(tree, (n) => n.tag === 'p' && n.cls.split(/\s+/).includes('lede'));
  const section = element(tree, (n) => n.tag === 'section' && n.cls.split(/\s+/).includes('legal'));
  if (!h1 || !lede || !section) throw new Error(`${page}: no title, lede or legal section`);
  const title = squash(textOf(h1)).trim().replace(/^Pechkas app: /, '');
  docs[page] = {
    title: title[0].toUpperCase() + title.slice(1),
    lede: squash(textOf(lede)).trim(),
    web: `https://pechkas.net/app/${page}`,
    blocks: blocks(section),
  };
}

const git = (...a) => execFileSync('git', ['-C', site, ...a], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'src/pages/app') !== '';
if (dirty) console.warn('Warning: the website has uncommitted changes to src/pages/app. Commit them there too.');

await writeFile(
  'packages/shared/src/legal-docs.ts',
  `// Copied from zaibprops-code/Pechkas src/pages/app/*.astro (built) by scripts/copy-legal.mjs.\n` +
    `// Do not edit by hand: change the website's page, build it, then run that script.\n` +
    `import type { LegalDoc, LegalSlug } from './legal.ts';\n\n` +
    `/** The website commit these were copied from. */\n` +
    `export const LEGAL_FROM = ${JSON.stringify(commit + (dirty ? '+' : ''))};\n\n` +
    `export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = ${JSON.stringify(docs, null, 2)};\n`,
);
console.log(`Wrote packages/shared/src/legal-docs.ts from ${commit}${dirty ? ' (with uncommitted changes)' : ''}: ${PAGES.join(', ')}`);
