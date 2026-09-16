/**
 * Explicit public client environment. No silent source-code fallbacks.
 * Local native builds load .env. EAS builds inject the same keys from eas.json.
 * Expo Go is not a valid runtime for this app.
 *
 * Read EXPO_PUBLIC_* with static process.env.EXPO_PUBLIC_* member access so
 * babel-preset-expo can inline them in production. Indexed process.env
 * lookup is undefined in a Hermes store bundle and whitescreens before React mounts.
 */

function requiredPublicEnv(name, value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(
      `Missing ${name}. Set it in .env (local native) or eas.json env (EAS). Expo Go is not a valid runtime.`
    );
  }
  return trimmed;
}

const SUPABASE_URL = requiredPublicEnv(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL
);
const SUPABASE_ANON_KEY = requiredPublicEnv(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
const POWERSYNC_URL = requiredPublicEnv(
  'EXPO_PUBLIC_POWERSYNC_URL',
  process.env.EXPO_PUBLIC_POWERSYNC_URL
);

if (/service[_-]?role/i.test(SUPABASE_ANON_KEY)) {
  throw new Error('Refusing to start Field Command with a Supabase service-role key.');
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, POWERSYNC_URL };
