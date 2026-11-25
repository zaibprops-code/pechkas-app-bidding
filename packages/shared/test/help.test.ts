import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CUSTOMER_HELP, TECHNICIAN_HELP, boldParts, searchHelp } from '../../../apps/mobile/src/help.ts';

const mobile = new URL('../../../apps/mobile/', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
// Every screen's words, except Help's own.
const screens = [...files(join(mobile, 'app')), ...files(join(mobile, 'src'))]
  .filter((p) => !p.endsWith('src/help.ts') && !p.includes('/app/help/'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');
const straight = (s: string) => s.replace(/[’‘]/g, "'");

for (const [side, topics] of [['customer', CUSTOMER_HELP], ['technician', TECHNICIAN_HELP]] as const) {
  test(`${side} help: every topic has questions, and no question is asked twice`, () => {
    assert.ok(topics.length >= 8);
    const keys = new Set(topics.map((t) => t.key));
    assert.equal(keys.size, topics.length);
    const qs = topics.flatMap((t) => t.qa.map((x) => x.q));
    assert.equal(new Set(qs).size, qs.length);
    for (const t of topics) {
      assert.ok(t.qa.length >= 3, t.title);
      for (const x of t.qa) assert.ok(x.a.length > 20, x.q);
    }
  });

  test(`${side} help: every button named in bold is one a screen really draws`, () => {
    const s = straight(screens);
    for (const t of topics) {
      for (const x of t.qa) {
        for (const p of boldParts(x.a).filter((p) => p.bold)) {
          assert.ok(s.includes(straight(p.text)), `"${p.text}" (in "${x.q}") is not on any screen`);
        }
      }
    }
  });

  test(`${side} help: never a phone number, never "call the office"`, () => {
    for (const t of topics) {
      for (const x of t.qa) {
        assert.doesNotMatch(x.a, /\b0?3\d{2}\s?\d{7}\b/);
        assert.doesNotMatch(x.a, /call the (pechkas )?office/i, x.q);
      }
    }
  });
}

test('the guarantee answer names the button the terms quote', () => {
  const all = CUSTOMER_HELP.flatMap((t) => t.qa).map((x) => x.a).join(' ');
  assert.match(all, /\*\*It has failed again\*\*/);
});

test('search finds by any word, best match first, and nothing for a blank', () => {
  assert.equal(searchHelp(CUSTOMER_HELP, ' ').length, 0);
  const fee = searchHelp(CUSTOMER_HELP, 'visit fee');
  assert.ok(fee.length >= 2);
  assert.match(fee[0].qa.q, /visit fee/i);
  assert.ok(searchHelp(TECHNICIAN_HELP, 'owe').length >= 1);
  assert.equal(searchHelp(CUSTOMER_HELP, 'zzqx').length, 0);
  // A typed word starts a word: "fee" is not "feel".
  assert.ok(!fee.some((f) => /feel/.test(f.qa.q)));
  assert.ok(!searchHelp(CUSTOMER_HELP, 'fee').some((f) => f.qa.q === 'What if I feel unsafe?'));
});

test('bold parts split cleanly', () => {
  assert.deepEqual(boldParts('Tap **Share receipt** now'), [
    { text: 'Tap ', bold: false },
    { text: 'Share receipt', bold: true },
    { text: ' now', bold: false },
  ]);
});

test('everything with the office happens in the app: no call, no WhatsApp (the owner\'s rule)', () => {
  // No office number or office WhatsApp link anywhere in the app.
  assert.doesNotMatch(screens, /OFFICE_(PHONE|WHATSAPP)/);
  const lines = screens.split('\n').filter(
    (l) =>
      /\b(call|ring|phone|whatsapp|message)\s+(the\s+)?(pechkas\s+)?office\b/i.test(l) ||
      /\boffice\b[^'`"]{0,60}\b(on whatsapp|will (call|ring)|calls? you|rings? you)/i.test(l) ||
      /(office|Pechkas|They)\b[^'`"]*\b(will call|calls? you)/i.test(l) ||
      /\b(office|Pechkas)\b[^'`"]{0,40}\b(rings?|calls?) (her|him|them|you|both)\b/i.test(l),
  );
  assert.deepEqual(lines, []);
});
