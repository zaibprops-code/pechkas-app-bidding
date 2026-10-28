import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayLabel, openWindows, pkNow, WINDOWS, whenLabel, windowLabel } from '../src/index.ts';

test('the seven windows read the way the database writes them', () => {
  // Must match public.window_text() in the days_profiles_again migration.
  assert.deepEqual(WINDOWS.map(windowLabel), ['8–10am', '10am–12pm', '12–2pm', '2–4pm', '4–6pm', '6–8pm', '8–10pm']);
});

test("Pakistan's today, whatever the phone's own clock", () => {
  assert.deepEqual(pkNow(new Date('2026-10-31T20:30:00Z')), { date: '2026-11-01', hour: 1 });
  assert.deepEqual(pkNow(new Date('2026-10-31T04:00:00Z')), { date: '2026-10-31', hour: 9 });
});

test('days are named as the notification names them', () => {
  assert.equal(dayLabel('2026-10-31', '2026-10-31'), 'Today');
  assert.equal(dayLabel('2026-11-01', '2026-10-31'), 'Tomorrow');
  assert.equal(dayLabel('2026-11-07', '2026-10-31'), 'Sat 7 Nov');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('a window that has started can no longer be chosen today', () => {
  assert.deepEqual(openWindows('2026-10-31', { date: '2026-10-31', hour: 13 }), [14, 16, 18, 20]);
  assert.deepEqual(openWindows('2026-10-31', { date: '2026-10-31', hour: 21 }), []);
  assert.deepEqual(openWindows('2026-11-01', { date: '2026-10-31', hour: 21 }), [...WINDOWS]);
});

test('when a job is wanted, on every screen', () => {
  assert.equal(whenLabel({ when_kind: 'now' }), 'As soon as possible');
  assert.equal(whenLabel({ when_kind: 'later', when_date: '2026-11-07', when_from: 10 }, '2026-10-31'), 'Sat 7 Nov, 10am–12pm');
  assert.equal(whenLabel({ when_kind: 'today', when_date: '2026-10-31', when_from: 18 }, '2026-10-31'), 'Today, 6–8pm');
  // An older job: the part of the day, read from its date.
  assert.equal(whenLabel({ when_kind: 'tomorrow', when_part: 'morning', when_date: '2026-11-01' }, '2026-11-01'), 'Today, morning');
  assert.equal(whenLabel({ when_kind: 'today', when_part: 'evening' }, '2026-11-01'), 'Today, evening');
});
