import { useState } from 'react';
import { router } from 'expo-router';
import { useAccount } from './account';
import { useSwitchCover } from './components/SwitchCover';
import { ask } from './supabase';

export type Mode = 'customer' | 'pro';

/** What the switch is called on each side, the way inDrive says "Driver mode". */
export const MODE_LABEL: Record<Mode, string> = {
  customer: 'Customer mode',
  pro: 'Technician mode',
};

/**
 * Said before a technician leaves technician mode, because it does more than
 * change the screen: public.switch_mode() takes him offline and takes back
 * any offer still waiting for an answer.
 */
export const LEAVING_PRO =
  'You will go offline, and any offer still waiting for an answer is taken back. You can switch back any time from the menu.';

/**
 * Switching between customer and technician mode. The database decides
 * whether it may happen (public.switch_mode): never in the middle of a job,
 * and technician mode only with an application on record — without one this
 * opens the application instead.
 */
export function useSwitchMode() {
  const { account, refresh } = useAccount();
  const cover = useSwitchCover();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const now: Mode = account?.role === 'pro' ? 'pro' : 'customer';
  const other: Mode = now === 'pro' ? 'customer' : 'pro';

  /**
   * `before` runs once the switch has happened, before the screen changes: the
   * menu closes itself there, under the cover. `from` is the centre of the
   * button that was tapped, where the new side's colour grows from
   * (SwitchCover.tsx); without it the screen simply changes.
   */
  async function go(before?: () => void, from?: { x: number; y: number }) {
    if (busy) return;
    setWhy(null);
    setBusy(true);
    if (from) cover.cover(other, from);
    const r = await ask<{ mode: Mode }>('switch_mode', { p_mode: other });
    if (!r.ok) {
      setBusy(false);
      if (from) cover.drop();
      if (r.field === 'apply') {
        before?.();
        router.push('/pro/apply');
      } else setWhy(r.why);
      return;
    }
    // The screens change under the colour, never in front of it — and the
    // account must not change before then either, because each side's
    // screens send the other side home the moment the role changes.
    if (from) await cover.covered();
    await refresh();
    setBusy(false);
    before?.();
    if (router.canDismiss()) router.dismissAll();
    router.replace(other === 'pro' ? '/pro' : '/');
    if (from) cover.lift();
  }

  return { now, other, label: MODE_LABEL[other], busy, why, clear: () => setWhy(null), go };
}
