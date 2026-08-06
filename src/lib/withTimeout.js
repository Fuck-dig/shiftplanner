// Reject a promise that takes too long, so a hang becomes a visible failure.
//
// Why this exists: on 6 Aug 2026 Supabase's API layer wedged. The requests
// rorota.net made never failed — they never came back AT ALL. A `.catch()` is
// no help against that: nothing rejects, so the app sat on the loading splash
// indefinitely with no error, no retry and nothing to tell the person whether
// it was their connection, their account, or the server.
//
// A promise that never settles is worse than one that rejects, because every
// piece of error handling downstream is written against rejection. This turns
// the first into the second.
//
// The underlying request is NOT cancelled — we just stop waiting on it. If it
// eventually lands, its result is ignored. That's the right trade for a read:
// the person has already been shown a retry button and can ask again.
export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout(promise, ms, label = 'request', { setTimer, clearTimer } = {}) {
  const set = setTimer ?? ((fn, d) => setTimeout(fn, d));
  const clear = clearTimer ?? ((id) => clearTimeout(id));
  let timer;
  return Promise.race([
    // Clear the timer on BOTH paths. Left dangling, a pending timer keeps the
    // event loop alive and, in tests, leaks between cases.
    promise.then(
      (v) => { clear(timer); return v; },
      (e) => { clear(timer); throw e; },
    ),
    new Promise((_resolve, reject) => {
      timer = set(() => reject(new TimeoutError(label, ms)), ms);
    }),
  ]);
}
