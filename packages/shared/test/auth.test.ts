import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorDetails, explainAuthError } from '../src/index.ts';

test('a refusal from Supabase is never blamed on the signal', () => {
  for (const [message, status] of [
    ['Error sending confirmation OTP to provider: Authenticate', 422],
    ['Signups not allowed for otp', 422],
    ['Unsupported phone provider', 400],
    ['Invalid phone number format (E.164 required)', 400],
    ['Something nobody expected', 500],
  ] as const) {
    assert.doesNotMatch(explainAuthError(message, status), /signal|internet/i, message);
  }
});

test('each refusal gets its own sentence', () => {
  assert.match(explainAuthError('Error sending confirmation OTP to provider', 422), /could not be sent to this number/);
  assert.match(explainAuthError('Signups not allowed for otp', 422), /New accounts/);
  assert.match(explainAuthError('Unsupported phone provider', 400), /switched off/);
  assert.match(explainAuthError('Invalid phone number format', 400), /not accepted/);
  assert.match(explainAuthError('For security purposes, you can only request this after 52 seconds. Too many', 429), /Too many/);
});

test('only a real network failure is called a connection problem', () => {
  assert.match(explainAuthError('Network request failed', 0), /internet/);
  assert.match(explainAuthError('TypeError: Failed to fetch', undefined), /internet/);
});

test('the details name what Supabase said and which project the app is talking to', () => {
  assert.equal(authErrorDetails('Signups not allowed for otp', 422, 'https://abcd.supabase.co'), 'Details: Signups not allowed for otp (422) · abcd.supabase.co');
  assert.equal(authErrorDetails('', 0, ''), 'Details: no message · no address');
  assert.match(authErrorDetails('x', 400, 'abcd.supabase.co'), /not a web address/);
});
