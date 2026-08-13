import * as Sentry from '@sentry/react';

// Error reporting.
//
// Rorota is being sold to restaurants, which means an error nobody sees is an
// error nobody fixes: a white screen at 18:00 on a Friday in someone else's
// dining room is not something William is going to notice. The 6 Aug outage
// was found because he happened to be looking.
//
// WHAT GOES OUT, AND WHAT MUST NOT
//
// This sends data about a Danish restaurant's employees to a third-party
// processor. Names, phone numbers, wages and sickness records are exactly the
// data the GDPR work is about, so the rule here is narrow: a crash report may
// describe WHAT broke and WHERE, and must not carry WHO it happened to or WHAT
// THEY EARN.
//
// `scrubEvent` below is the enforcement, it runs on every event as Sentry's
// `beforeSend`, and it is the part that is unit tested. Sending a payslip to an
// error tracker would be a worse breach than the bug that triggered it.
//
// Also: create the Sentry project in the EU region, so the DSN points at
// ingest.de.sentry.io and the data does not leave the EU. The DSN carries the
// region — there is no separate setting.
//
// THE DSN IS READ AT BUILD TIME, NOT AT RUNTIME
//
// Vite inlines `import.meta.env.*` into the bundle when it builds. With no DSN
// set, `if (!dsn) return false` becomes dead code and the whole Sentry import
// tree-shakes away: measured 13 Aug, the difference was 581 bytes, i.e. this
// file and nothing else. With a DSN set it is +29 kB gzip.
//
// The consequence that matters: setting VITE_SENTRY_DSN in Vercel only takes
// effect on the NEXT BUILD. Adding the variable and not redeploying reports
// nothing, and looks identical to everything working.

// Matched on the WHOLE key, lowercased — never as a substring. That distinction
// is load-bearing: a substring match on "name" would also hit `filename` and
// `function`, redacting the stack trace and leaving a report that says
// something broke somewhere. The scrubber would then have destroyed the only
// useful part of the thing it was protecting.
const SENSITIVE_KEYS = new Set([
  'wage', 'wages', 'salary', 'pay', 'amount', 'revenue',
  'sick_pay_pct', 'sickpaypct',
  'name', 'full_name', 'fullname', 'sender_label', 'username',
  'email', 'phone', 'pin',
  'password', 'token', 'access_token', 'refresh_token', 'apikey', 'api_key', 'secret',
]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAX_STRING = 1000;

export function redactString(s){
  if (typeof s !== 'string') return s;
  const out = s.replace(EMAIL, '[email]');
  return out.length > MAX_STRING ? out.slice(0, MAX_STRING) + '…[truncated]' : out;
}

// Walks an event and redacts in place-ish (returns a new structure). Anything
// it does not understand is passed through unchanged rather than dropped — a
// scrubber that eats unfamiliar data would quietly gut future Sentry versions.
export function scrubEvent(event, seen = new WeakSet()){
  if (event == null) return event;
  if (typeof event === 'string') return redactString(event);
  if (typeof event !== 'object') return event;
  if (seen.has(event)) return '[circular]';
  seen.add(event);

  if (Array.isArray(event)) return event.map(v => scrubEvent(v, seen));

  const out = {};
  for (const [k, v] of Object.entries(event)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) { out[k] = '[redacted]'; continue; }
    out[k] = scrubEvent(v, seen);
  }
  return out;
}

// A crash report identifies the SESSION, not the person: the user id is a uuid
// that means nothing without database access, and it is what makes "three
// different people hit this" answerable. Email and name are never attached.
export function setMonitoringUser(userId){
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function initMonitoring(){
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  // Absent DSN is the normal state in development and in anyone's checkout.
  // Silently doing nothing is right here: this is instrumentation, and it must
  // never be the reason the app fails to start.
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No IP addresses, no cookies, no request bodies by default.
    sendDefaultPii: false,
    // Errors only. Performance tracing and session replay would both carry far
    // more of the screen — and the screen is full of names and wages.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubEvent(crumb),
  });
  return true;
}

// Explicit reporting, for places that already catch and would otherwise only
// reach the console — the ErrorBoundary, and any handler that swallows.
export function reportError(error, context){
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, context ? { extra: scrubEvent(context) } : undefined);
  }
  console.error(error, context ?? '');
}
