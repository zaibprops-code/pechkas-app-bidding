/**
 * Everything about the app is in app.json. This file adds the one thing that
 * cannot be written there: where Firebase's `google-services.json` is.
 *
 * Android notifications travel through Google's Firebase, and the build needs
 * that file to know which Firebase project is ours. It is not kept in this
 * repository. The owner uploads it once to Expo as a FILE environment
 * variable called GOOGLE_SERVICES_JSON (docs/OWNER.md, "Notifications"), and
 * Expo hands the build its path here.
 *
 * Without it the app still builds and works; it just cannot be sent
 * notifications, and the office's technician list says so.
 *
 * It also stamps the build with the commit it was made from, for the Me
 * screen's "This copy of the app".
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ config }) => {
  const local = join(__dirname, 'google-services.json');
  const file = process.env.GOOGLE_SERVICES_JSON || (existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    // Which commit Expo built, shown on the Me screen. EAS sets this during a
    // build; a local run has none and says "local copy".
    extra: {
      ...config.extra,
      commit: process.env.EAS_BUILD_GIT_COMMIT_HASH || null,
      builtAt: process.env.EAS_BUILD_GIT_COMMIT_HASH ? new Date().toISOString() : null,
    },
    android: {
      ...config.android,
      ...(file ? { googleServicesFile: file } : {}),
    },
  };
};
