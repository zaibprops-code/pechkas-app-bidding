import { router } from 'expo-router';
import type { Account } from './account';

/**
 * Where to go once we know who this is. One rule, used after every sign-in
 * and by every screen that needs somebody signed in.
 */
export function routeFor(account: Account | null, next?: string) {
  // Signing in is a fresh start: drop the screens stacked up on the way here
  // (account, sign-in, code), so Back cannot land on a stale signed-out page.
  if (router.canDismiss()) router.dismissAll();
  if (!account?.role) return router.replace({ pathname: '/welcome', params: { next: next ?? '' } });
  if (account.role === 'pro') return router.replace(account.pro ? '/pro' : '/pro/apply');
  if (next === 'join') return router.replace('/pro/apply');
  return router.replace('/');
}
