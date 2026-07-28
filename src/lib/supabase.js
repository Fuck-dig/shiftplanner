import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('Supabase env vars missing — check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.');
}

// By default the Supabase client persists its session in localStorage,
// which is shared by every tab/window of the same browser profile — so
// logging in as a second person in a normal new tab just reuses (and
// overwrites) whoever's already logged in there, and incognito becomes the
// only way to have two logins open side by side.
//
// ?altsession=1 (same URL-flag convention as ?kiosk=1 above in App.jsx)
// opts a single tab out of that shared session: it stores its auth state
// in sessionStorage instead, which belongs to that one tab alone. Open the
// app normally in one tab and with ?altsession=1 in another, log into a
// different account in the second, and both stay independently signed in —
// no incognito needed. The tradeoff is scoped to that tab only: closing it
// clears that login, unlike the normal persistent session everyone else
// gets by default.
const useAltSession = typeof window!=='undefined' && new URLSearchParams(window.location.search).has('altsession');

export const supabase = createClient(url, anon, useAltSession ? { auth: { storage: window.sessionStorage } } : undefined);

// Edge Functions live at <project-url>/functions/v1/<name> — small helper so
// callers don't each hardcode that path (see TeamAccess.jsx's send-invite
// call, which predates this and still hardcodes its own URL directly).
export const functionsUrl = (name) => `${url}/functions/v1/${name}`;
