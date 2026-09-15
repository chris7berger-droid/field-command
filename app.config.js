const path = require('path');
const { load, isEnabled: dotenvEnabled } = require('@expo/env');

load(path.resolve(__dirname));

const REQUIRED_PUBLIC_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_POWERSYNC_URL',
];

function assertPublicClientEnv() {
  const missing = REQUIRED_PUBLIC_ENV.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    // EAS init/config probes run `expo config --json` with EXPO_NO_DOTENV set
    // and without a build-profile env. Do not invent values here — skip the
    // missing-env throw so project initialization can read app.json. Runtime
    // (src/lib/env.js) and EAS profile env remain fail-closed / explicit.
    if (!dotenvEnabled()) {
      return;
    }
    throw new Error(
      `Field Command missing ${missing.join(', ')}. ` +
        'Set them in .env for local native builds (`npx expo run:ios`) ' +
        'or in eas.json env for EAS. Expo Go is not a valid runtime.'
    );
  }

  const anon = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (/service[_-]?role/i.test(anon)) {
    throw new Error('Refusing to configure Field Command with a Supabase service-role key.');
  }
}

module.exports = ({ config }) => {
  assertPublicClientEnv();
  return config;
};
