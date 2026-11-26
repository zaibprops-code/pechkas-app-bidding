import { Redirect } from 'expo-router';

/**
 * Where the identity company's page sends the phone back
 * (pechkas://identity-done): straight to his first-jobs page, which shows
 * whether the check is still waiting. The answer itself reaches Pechkas
 * from the company, never through this address.
 */
export default function IdentityDone() {
  return <Redirect href="/pro/first-jobs" />;
}
