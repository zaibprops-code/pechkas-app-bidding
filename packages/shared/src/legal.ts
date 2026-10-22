/**
 * The app's legal pages — privacy policy, terms, technician agreement and how
 * to delete an account — shown on the app's own screens.
 *
 * The words are the website's (zaibprops-code/Pechkas, src/pages/app/), copied
 * into legal-docs.ts by scripts/copy-legal.mjs. The stores link to the
 * website's copies, so both must say the same thing: never edit the words
 * here. This file is only the shape and where a link inside a page goes.
 */
import { LEGAL_DOCS, LEGAL_FROM } from './legal-docs.ts';

export type LegalSlug = 'privacy' | 'terms' | 'technician-agreement' | 'delete-account';

/** A run of text and how it is marked. `ph` is a visible [PLACEHOLDER]; `mark` a lawyer's decision still open. */
export type Run = { t: string; b?: boolean; i?: boolean; ph?: boolean; mark?: boolean; code?: boolean; href?: string };

export type Block =
  | { k: 'h2' | 'h3'; text: string }
  | { k: 'p' | 'meta' | 'decide'; c: Run[] }
  | { k: 'ul' | 'ol' | 'cross'; items: Run[][] }
  | { k: 'review'; paras: Run[][] }
  | { k: 'actions'; items: { label: string; href: string; kind: 'whatsapp' | 'call' }[] };

export type LegalDoc = { title: string; lede: string; web: string; blocks: Block[] };

export { LEGAL_DOCS, LEGAL_FROM };

export const LEGAL_SLUGS = Object.keys(LEGAL_DOCS) as LegalSlug[];

export function isLegalSlug(s: unknown): s is LegalSlug {
  return typeof s === 'string' && (LEGAL_SLUGS as string[]).includes(s);
}

export type LegalLink =
  /** Another of these pages: open it in the app. */
  | { kind: 'doc'; slug: LegalSlug }
  /** Anywhere else: a WhatsApp chat, a phone call, or a page of the website. */
  | { kind: 'out'; url: string };

const SITE = 'https://pechkas.net';

/**
 * Where a link inside a page goes. The pages are written for the website, so
 * their links are the website's: `/app/terms` is the terms, which the app has
 * on its own screen; `/guarantee` is a website page, opened in the browser.
 */
export function legalLink(href: string): LegalLink {
  const path = href.startsWith(SITE) ? href.slice(SITE.length) || '/' : href;
  const m = /^\/app\/([a-z-]+)\/?$/.exec(path);
  if (m && isLegalSlug(m[1])) return { kind: 'doc', slug: m[1] };
  if (path.startsWith('/')) return { kind: 'out', url: SITE + path };
  return { kind: 'out', url: href };
}

/**
 * The words a link shows. A page names another by its bare address
 * ("/app/delete-account"), which reads as nothing without the website round
 * it; the app shows the whole address instead. Anything else is unchanged.
 */
export function legalLinkText(run: Run): string {
  if (run.href && run.t === run.href && run.href.startsWith('/')) return `pechkas.net${run.href}`;
  return run.t;
}
