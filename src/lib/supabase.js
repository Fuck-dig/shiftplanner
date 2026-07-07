import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('Supabase env vars missing — check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.');
}

export const supabase = createClient(url, anon);
