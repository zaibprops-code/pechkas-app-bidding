import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_PRICE, commission, rupees, technicianKeeps } from '../src/index.ts';

test('a price reads the way it is written on a receipt', () => {
  assert.equal(rupees(250000), 'Rs 2,500');
  assert.equal(rupees(100), 'Rs 1');
  assert.equal(rupees(0), 'Rs 0');
  assert.equal(rupees(1234567800), 'Rs 12,345,678');
  assert.equal(rupees(250050), 'Rs 2,500.50');
});

test('no agreed price is "no price yet", never Rs 0', () => {
  assert.equal(rupees(null), NO_PRICE);
  assert.equal(rupees(undefined), NO_PRICE);
});

test('money that is not whole paisa is a bug, not something to round', () => {
  assert.throws(() => rupees(2500.5));
  assert.throws(() => commission(2500.5, 1000));
});

test('commission is worked out in whole paisa and rounds in the technician’s favour', () => {
  assert.equal(commission(250000, 1000), 25000);
  assert.equal(technicianKeeps(250000, 1000), 225000);
  // 10% of Rs 9.99 is 99.9 paisa: Pechkas takes 99, the odd fraction stays with him.
  assert.equal(commission(999, 1000), 99);
  assert.equal(technicianKeeps(999, 1000), 900);
  assert.equal(commission(250000, 0), 0);
});

test('a commission outside 0–100% is refused', () => {
  assert.throws(() => commission(250000, -1));
  assert.throws(() => commission(250000, 10001));
});
