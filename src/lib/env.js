/**
 * Explicit public client environment. No silent source-code fallbacks.
 * Local native builds load .env. EAS builds inject the same keys from eas.json.
 * Expo Go is not a valid runtime for this app.
 */

function requiredPublicEnv(name) {
  const value = typeof process.env[name] === 'string' ? process.env[name].trim() : '';
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env (local native) or eas.json env (EAS). Expo Go is not a valid runtime.`
    );
  }
  return value;
}

const SUPABASE_URL = requiredPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = requiredPublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const POWERSYNC_URL = requiredPublicEnv('EXPO_PUBLIC_POWERSYNC_URL');

if (/service[_-]?role/i.test(SUPABASE_ANON_KEY)) {
  throw new Error('Refusing to start Field Command with a Supabase service-role key.');
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, POWERSYNC_URL };
