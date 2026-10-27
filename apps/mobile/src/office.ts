/**
 * The Pechkas office: the number customers and technicians are told to ring
 * when the app says "call the office". The same number as the website's
 * `contact.phoneDial` in zaibprops-code/Pechkas, src/data/site.js — change
 * both together.
 */
export const OFFICE_PHONE = '+923358855076';
export const OFFICE_PHONE_SHOWN = '0335 8855076';

/** The office on WhatsApp: the website's `contact.whatsapp`, the same number. Change both together. */
export const OFFICE_WHATSAPP = 'https://wa.me/923358855076';

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
