import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://pbgvgjjuhnpsumnowuym.supabase.co';

const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_v7XktVvkAlX7y5f6xoFjng_AaLaWKoK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true },
});

export { SUPABASE_URL, SUPABASE_KEY };
