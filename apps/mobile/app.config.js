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
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ config }) => {
  const local = join(__dirname, 'google-services.json');
  const file = process.env.GOOGLE_SERVICES_JSON || (existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: {
      ...config.android,
      ...(file ? { googleServicesFile: file } : {}),
    },
  };
};
