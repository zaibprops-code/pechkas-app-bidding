import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorDetails, CODE_DIGITS, explainAuthError, readCode } from '../src/index.ts';

test('a refusal from Supabase is never blamed on the signal', () => {
  for (const [message, status] of [
    ['Error sending confirmation OTP to provider: Authenticate', 422],
    ['Signups not allowed for otp', 422],
    ['Unsupported phone provider', 400],
    ['Invalid phone number format (E.164 required)', 400],
    ['Error sending magic link email', 500],
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
  assert.match(explainAuthError('Error sending magic link email', 500), /could not be emailed/);
  assert.match(explainAuthError('Error sending confirmation email', 500), /could not be emailed/);
  assert.match(explainAuthError('Email address "x@y" is invalid', 400), /email address was not accepted/);
  assert.match(explainAuthError('Email logins are disabled', 422), /email is switched off/);
  assert.match(explainAuthError('Email rate limit exceeded', 429), /Too many/);
  // Too soon for another code: the real wait, in seconds, and the old code still works.
  assert.match(explainAuthError('For security purposes, you can only request this after 52 seconds.', 429), /another in 52 seconds/);
  assert.match(explainAuthError('For security purposes, you can only request this after 52 seconds.', 429), /still works/);
  assert.match(explainAuthError('For security purposes, you can only request this after 1 second.', 429), /in 1 second\./);
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

test('a sign-in code is always 6 digits, and a longer one is noticed rather than cut short', () => {
  assert.equal(CODE_DIGITS, 6);
  assert.deepEqual(readCode('123456'), { digits: '123456', extra: null });
  assert.deepEqual(readCode(' 12 34-56 '), { digits: '123456', extra: null });
  assert.deepEqual(readCode('123'), { digits: '123', extra: null });
  assert.deepEqual(readCode(''), { digits: '', extra: null });
  assert.deepEqual(readCode(null), { digits: '', extra: null });
  // An 8-digit email code: kept to six, and the 8 is reported.
  assert.deepEqual(readCode('29216021'), { digits: '292160', extra: 8 });
});

test('a first name from Google fills the box only when it is plainly a name', async () => {
  const { firstNameFrom } = await import('../src/index.ts');
  assert.equal(firstNameFrom({ given_name: 'Nida', full_name: 'Nida Khan' }), 'Nida');
  assert.equal(firstNameFrom({ full_name: 'Zohaib Khan' }), 'Zohaib');
  assert.equal(firstNameFrom({ name: '  Ayesha  ' }), 'Ayesha');
  assert.equal(firstNameFrom({ email: 'someone@gmail.com' }), '');
  assert.equal(firstNameFrom({ name: 'someone@gmail.com' }), '');
  assert.equal(firstNameFrom({ given_name: 'x'.repeat(41) }), '');
  assert.equal(firstNameFrom(null), '');
});
