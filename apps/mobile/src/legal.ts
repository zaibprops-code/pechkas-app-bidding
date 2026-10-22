import { router } from 'expo-router';
import type { LegalSlug } from '@pechkas/shared/src/legal';

/**
 * Opens one of the app's legal pages on its own screen (app/legal/[doc].tsx).
 * The app never sends anybody to a browser to read them; the website keeps
 * its copy only because the stores need one at a public address.
 */
export function openLegal(slug: LegalSlug) {
  router.push({ pathname: '/legal/[doc]', params: { doc: slug } });
}
