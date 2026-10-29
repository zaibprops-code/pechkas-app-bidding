import Constants from 'expo-constants';

/**
 * Which copy of the app this is, and which database it expects.
 *
 * NEWEST_MIGRATION is the last file in supabase/migrations/ when this copy
 * was built. `npm run check` fails if it is not, so it cannot be forgotten
 * when a migration is added. The Me screen compares it with the database's
 * own record (public.db_version()) and says plainly when the database is
 * behind — the owner runs migrations by hand, and a skipped one makes whole
 * features quietly do nothing.
 */
export const NEWEST_MIGRATION = '20261102000000_offer_says_when';

const extra = (Constants.expoConfig?.extra ?? {}) as { commit?: string | null; builtAt?: string | null };

/** The first seven letters of the commit Expo built, or null when run locally. */
export const COMMIT = extra.commit ? extra.commit.slice(0, 7) : null;
export const BUILT_AT = extra.builtAt ?? null;
export const APP_VERSION = Constants.expoConfig?.version ?? '';
