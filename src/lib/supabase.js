import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('Supabase env vars missing — check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.');
}

export const supabase = createClient(url, anon);

// Edge Functions live at <project-url>/functions/v1/<name> — small helper so
// callers don't each hardcode that path (see TeamAccess.jsx's send-invite
// call, which predates this and still hardcodes its own URL directly).
export const functionsUrl = (name) => `${url}/functions/v1/${name}`;
