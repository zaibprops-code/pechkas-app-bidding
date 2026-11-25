import { router } from 'expo-router';
/**
 * The Pechkas office is reached only inside the app (the owner's rule, 25
 * November 2026): no call and no WhatsApp, either way. Every "Get help" or
 * "Write to the office" button opens Write to the office (`app/office.tsx`),
 * with the job it is about already chosen. There is deliberately no office
 * phone number or WhatsApp link in this app; `help.test.ts` fails if one
 * comes back.
 */
export function toOffice(job?: string | null) {
  router.push(job ? { pathname: '/office', params: { job } } : '/office');
}

/**
 * The app's privacy policy and how to delete an account, on the website
 * (zaibprops-code/Pechkas, src/pages/app/). The stores link to these two
 * addresses. The app itself never opens them: it shows the same words on its
 * own screen (openLegal() in src/legal.ts, copied by scripts/copy-legal.mjs).
 */
export const PRIVACY_URL = 'https://pechkas.net/app/privacy';
export const DELETE_ACCOUNT_URL = 'https://pechkas.net/app/delete-account';

/** The customer terms and the technician agreement, on the same site. Drafts until a lawyer has read them. */
export const TERMS_URL = 'https://pechkas.net/app/terms';
export const AGREEMENT_URL = 'https://pechkas.net/app/technician-agreement';

/**
 * Where "Update Pechkas" goes. Android opens the Play Store's own page for
 * the app (the package name in app.json). The App Store page needs Apple's
 * number for the app, which exists only once it is listed: until then the
 * button opens the App Store and the screen says to update from there.
 */
export const PLAY_STORE_APP = 'market://details?id=net.pechkas.app';
export const PLAY_STORE_WEB = 'https://play.google.com/store/apps/details?id=net.pechkas.app';
export const APP_STORE_ID = '';
export const APP_STORE_APP = APP_STORE_ID ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}` : 'itms-apps://apps.apple.com/';
