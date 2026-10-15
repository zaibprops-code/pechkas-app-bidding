import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pakistaniMobile, showMobile } from '../src/index.ts';

test('every way people type a mobile number becomes the same number', () => {
  for (const typed of ['03001234567', '0300 1234567', '0300-1234567', '+92 300 1234567', '923001234567', '+923001234567', '3001234567', ' 0300 123 4567 ']) {
    assert.equal(pakistaniMobile(typed), '+923001234567', typed);
  }
});

test('anything that cannot receive a code is refused, not guessed at', () => {
  for (const typed of ['', '051 1234567', '0300123456', '030012345678', '0400 1234567', 'abc', '+44 7700 900123', '0300-12a4567']) {
    assert.equal(pakistaniMobile(typed), null, typed);
  }
});

test('a number is shown back the way people read their own', () => {
  assert.equal(showMobile('+923001234567'), '0300 1234567');
  assert.equal(showMobile('923001234567'), '0300 1234567');
});
