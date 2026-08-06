// Collapse concurrent calls of an async function into one.
//
// Why this exists: App.jsx starts a session from BOTH `getSession()` and
// `onAuthStateChange()`, and each branch fired acceptPendingInvitations().
// Two calls, two database transactions, both trying to insert the same
// membership row and update the same invitation rows. Harmless when the writes
// were fast and independent; not harmless once accepting became one
// transaction holding locks across two tables (20260804180000).
//
// Deduping at the call site instead — "only call it from onAuthStateChange" —
// looked simpler and was wrong: getSession() has to keep its call, because a
// page load with an already-established session does not always fire an auth
// state change, and that is exactly the path someone accepting an invite takes.
// Both call sites are load-bearing. So the dedupe belongs here.
//
// While a call is in flight, every caller gets THAT SAME promise: same result,
// same rejection, one round trip. Once it settles the slot is cleared, so a
// later call (a genuine second login, say) runs for real.
export function singleFlight(fn) {
  let inFlight = null;
  return function (...args) {
    if (inFlight) return inFlight;
    // Promise.resolve().then(...) so a fn that throws SYNCHRONOUSLY still
    // rejects the shared promise rather than blowing up the caller and
    // leaving `inFlight` unassigned.
    inFlight = Promise.resolve()
      .then(() => fn.apply(this, args))
      .finally(() => { inFlight = null; });
    return inFlight;
  };
}
