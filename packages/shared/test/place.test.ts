import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectorIn, streetIn } from '../src/index.ts';

const SECTORS = ['F-11', 'E-11', 'G-13', 'DHA', 'Bahria Town', 'F-10', 'G-11', 'F-6', 'G-6', 'G-7', 'I-8', 'Gulberg Greens', 'Gulberg Residencia', 'Rawalpindi', 'Saddar'];

test('the sector is read from how the phone writes it', () => {
  assert.equal(sectorIn(['F-11/2'], SECTORS), 'F-11');
  assert.equal(sectorIn(['F 11 Markaz'], SECTORS), 'F-11');
  assert.equal(sectorIn(['f‑11'], SECTORS), 'F-11');
  assert.equal(sectorIn([null, 'Street 34, G-13/1, Islamabad'], SECTORS), 'G-13');
  assert.equal(sectorIn(['Bahria Town Phase 7'], SECTORS), 'Bahria Town');
  assert.equal(sectorIn(['Defence Housing Authority Phase II'], SECTORS), 'DHA');
});

test('a short sector is never read out of a longer one', () => {
  assert.equal(sectorIn(['F-11'], ['F-1', 'F-11']), 'F-11');
  assert.equal(sectorIn(['G-13'], ['G-1']), null);
  assert.equal(sectorIn(['F-110'], SECTORS), null);
  assert.equal(sectorIn(['Street 11'], SECTORS), null);
});

test('the most precise line wins: the district before the city', () => {
  assert.equal(sectorIn(['Saddar', 'Rawalpindi'], SECTORS), 'Saddar');
  assert.equal(sectorIn(['G-6/2', 'Islamabad'], SECTORS), 'G-6');
});

test('nothing on the list means no answer, never a guess', () => {
  assert.equal(sectorIn(['Islamabad', 'Islamabad Capital Territory', 'Pakistan'], SECTORS), null);
  assert.equal(sectorIn([], SECTORS), null);
  assert.equal(sectorIn(['H-12'], SECTORS), null);
});

test('the street fills the box only when it is a street', () => {
  assert.equal(streetIn('Street 34', 'F-11'), 'Street 34');
  assert.equal(streetIn('  Nazim-ud-din Road ', 'F-8'), 'Nazim-ud-din Road');
  assert.equal(streetIn('8M4R+2V', 'F-11'), '');
  assert.equal(streetIn('F-11/2', 'F-11'), '');
  assert.equal(streetIn(null, 'F-11'), '');
  assert.equal(streetIn('x'.repeat(61), 'F-11'), '');
});
