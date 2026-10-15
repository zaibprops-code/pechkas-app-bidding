import { Redirect } from 'expo-router';
import { Loading } from '../src/components/ui';
import { useAccount } from '../src/account';

/**
 * "Work with Pechkas": the one door for a technician, wherever he is in the
 * sign-in. Not signed in → sign in first; signed in → his application.
 */
export default function Join() {
  const { ready, session, account } = useAccount();
  if (!ready) return <Loading dark />;
  if (!session) return <Redirect href={{ pathname: '/sign-in', params: { next: 'join' } }} />;
  if (!account?.role) return <Redirect href={{ pathname: '/welcome', params: { next: 'join' } }} />;
  return <Redirect href={account.pro ? '/pro' : '/pro/apply'} />;
}
