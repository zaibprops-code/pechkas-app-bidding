import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainLinkError, readSignInLink } from '../src/index.ts';

test('a link with a one-time code is read', () => {
  assert.deepEqual(readSignInLink('pechkas://auth-callback?code=3f2a9c1e-77b0-4c1d-9e0a-5b6c7d8e9f01'), {
    kind: 'code',
    code: '3f2a9c1e-77b0-4c1d-9e0a-5b6c7d8e9f01',
  });
});

test('a link carrying a finished session is never accepted', () => {
  // Anybody can open a pechkas:// address; tokens chosen by a stranger would sign the phone into his account.
  assert.deepEqual(readSignInLink('pechkas://auth-callback#access_token=aaa.bbb.ccc&refresh_token=xyz&type=magiclink'), { kind: 'none' });
  assert.deepEqual(readSignInLink('pechkas://auth-callback#code=3f2a9c1e-77b0-4c1d'), { kind: 'none' });
});

test('an expired or used link says so, in the query or after the #', () => {
  const said = 'This link has expired or was already used. Ask for a new code.';
  assert.deepEqual(readSignInLink('pechkas://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), { kind: 'error', why: said });
  assert.deepEqual(readSignInLink('pechkas://auth-callback?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired'), { kind: 'error', why: said });
  assert.match((readSignInLink('pechkas://auth-callback?error=server_error&error_description=Something+else') as { why: string }).why, /Something else/);
});

test('nothing usable is nothing', () => {
  for (const link of [null, '', 'pechkas://auth-callback', 'pechkas://auth-callback?code=', 'pechkas://auth-callback?code=<script>']) {
    assert.deepEqual(readSignInLink(link), { kind: 'none' }, String(link));
  }
});

test('a code that cannot be traded is explained', () => {
  assert.match(explainLinkError('invalid flow state, no valid flow state found'), /older email|different phone/);
  assert.match(explainLinkError('code verifier not found in storage'), /older email|different phone/);
  assert.match(explainLinkError('Network request failed'), /internet/);
  assert.match(explainLinkError('?'), /Type the code/);
});
