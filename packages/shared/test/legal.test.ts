import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL_DOCS, LEGAL_SLUGS, legalLink, legalLinkText, type Block, type Run } from '../src/legal.ts';

const runsOf = (b: Block): Run[] =>
  'c' in b ? b.c : b.k === 'review' ? b.paras.flat() : b.k === 'ul' || b.k === 'ol' || b.k === 'cross' ? b.items.flat() : [];
const allRuns = (slug: keyof typeof LEGAL_DOCS) => LEGAL_DOCS[slug].blocks.flatMap(runsOf);
const textOf = (slug: keyof typeof LEGAL_DOCS) =>
  LEGAL_DOCS[slug].blocks.map((b) => ('text' in b ? b.text : runsOf(b).map((r) => r.t).join(''))).join('\n');

test('all four pages are in the app, each with a title and something to read', () => {
  assert.deepEqual([...LEGAL_SLUGS].sort(), ['delete-account', 'privacy', 'technician-agreement', 'terms']);
  for (const slug of LEGAL_SLUGS) {
    const d = LEGAL_DOCS[slug];
    assert.ok(d.title && d.lede, slug);
    assert.ok(d.blocks.some((b) => b.k === 'h2'), `${slug} has headings`);
    assert.equal(d.web, `https://pechkas.net/app/${slug}`);
  }
});

test('every link inside the pages goes somewhere real', () => {
  for (const slug of LEGAL_SLUGS) {
    const hrefs = [
      ...allRuns(slug).filter((r) => r.href).map((r) => r.href!),
      ...LEGAL_DOCS[slug].blocks.flatMap((b) => (b.k === 'actions' ? b.items.map((i) => i.href) : [])),
    ];
    for (const href of hrefs) {
      const to = legalLink(href);
      if (to.kind === 'doc') assert.ok(LEGAL_SLUGS.includes(to.slug), href);
      else assert.match(to.url, /^(https:\/\/(pechkas\.net|wa\.me)\/|tel:\+92)/, `${slug}: ${href}`);
    }
  }
});

test('a link to another of these pages opens it in the app; the rest of the website opens outside', () => {
  assert.deepEqual(legalLink('/app/terms'), { kind: 'doc', slug: 'terms' });
  assert.deepEqual(legalLink('https://pechkas.net/app/privacy'), { kind: 'doc', slug: 'privacy' });
  assert.deepEqual(legalLink('/app/delete-account/'), { kind: 'doc', slug: 'delete-account' });
  assert.deepEqual(legalLink('/guarantee'), { kind: 'out', url: 'https://pechkas.net/guarantee' });
  assert.deepEqual(legalLink('/app/somewhere-else'), { kind: 'out', url: 'https://pechkas.net/app/somewhere-else' });
  assert.deepEqual(legalLink('tel:+923358855076'), { kind: 'out', url: 'tel:+923358855076' });
});

test('a bare address reads as the whole address; ordinary words are left alone', () => {
  assert.equal(legalLinkText({ t: '/app/delete-account', href: '/app/delete-account' }), 'pechkas.net/app/delete-account');
  assert.equal(legalLinkText({ t: 'app privacy policy', href: '/app/privacy' }), 'app privacy policy');
});

test('the gaps stay visible gaps, and nothing meant for the owner reaches the app', () => {
  assert.ok(allRuns('privacy').some((r) => r.ph && r.t === '[DATE YOU PUBLISHED THIS]'));
  assert.ok(allRuns('terms').some((r) => r.mark && /DECIDE WITH A LAWYER/.test(r.t)));
  for (const slug of LEGAL_SLUGS) {
    assert.ok(!allRuns(slug).some((r) => r.code), `${slug}: no code`);
    assert.doesNotMatch(textOf(slug), /Edit this page at|src\/pages/, slug);
  }
});

test('the pages name the screens the app really has', () => {
  // The app has had no "Me" tab since the inDrive layout: deleting is under the menu's Settings.
  for (const slug of LEGAL_SLUGS) {
    assert.ok(!allRuns(slug).some((r) => r.b && r.t === 'Me'), `${slug} still says Me`);
  }
  assert.match(textOf('delete-account'), /Settings/);
  // The terms tell a customer which button claims the guarantee; the job screen must have it, word for word.
  const job = readFileSync(new URL('../../../apps/mobile/src/customer/UnderWay.tsx', import.meta.url), 'utf8');
  const guarantee = allRuns('terms').find((r, i, all) => r.b && /If it fails in that time, tap $/.test(all[i - 1]?.t ?? ''));
  assert.ok(guarantee, 'the terms name the guarantee button');
  assert.ok(job.includes(`label="${guarantee!.t}"`), `the job screen has a "${guarantee!.t}" button, as the terms say`);
  assert.ok(allRuns('delete-account').some((r) => r.b && r.t === 'Delete my account'));
});
