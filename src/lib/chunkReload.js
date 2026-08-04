// Recover from a failed lazy-chunk import after a deploy.
//
// THE FAILURE: vite-plugin-pwa runs with registerType 'autoUpdate', so a new
// service worker takes over as soon as it's installed and purges the previous
// precache. But a tab that was already open is still running the OLD index
// chunk, which references the OLD hashed filenames. The moment it lazy-loads
// a route — Dashboard, EmployeeView, KioskView — it requests a file the server
// no longer has, the dynamic import rejects, and React's error boundary shows
// a full-page "something went wrong".
//
// Observed live on rorota.net on 4 Aug 2026:
//   TypeError: Failed to fetch dynamically imported module:
//   https://rorota.net/assets/Dashboard-CKNS1qLv.js
//
// This is not one unlucky browser. Because the app is installable and
// precached, EVERY user with a tab or installed window open can hit it on
// EVERY deploy, and the only escape is knowing to reload — which staff won't.
//
// THE FIX: a failed chunk fetch is almost always a stale document rather than
// a broken build, and reloading picks up the new index and the new hashes. So
// reload once, automatically.
//
// The reason this is a module and not three lines inlined into App.jsx is the
// loop. If the chunk is genuinely missing — a bad deploy, a truncated upload —
// reloading fixes nothing and an unguarded version would reload forever,
// leaving the user with a flickering page and no error to report. The flag
// makes the recovery strictly one attempt: succeed and it's cleared, fail
// twice and the error is rethrown so the error boundary can do its job.
//
// sessionStorage rather than localStorage on purpose: the flag should die with
// the tab. A stuck flag in localStorage would silently disable this recovery
// for that browser forever.

export const RELOAD_FLAG = 'rorota:chunk-reload';

// `storage` and `reload` are injected so this is testable without a DOM, and
// so a browser that blocks storage (Safari private mode throws on write)
// degrades to "no retry" instead of taking the whole app down.
export function retryChunkLoad(factory, { storage, reload } = {}) {
  const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const doReload = reload ?? (() => window.location.reload());

  const read = () => { try { return store?.getItem(RELOAD_FLAG); } catch { return null; } };
  const write = () => { try { store?.setItem(RELOAD_FLAG, '1'); return true; } catch { return false; } };
  const clear = () => { try { store?.removeItem(RELOAD_FLAG); } catch { /* nothing to clean up */ } };

  return factory().then(
    (mod) => { clear(); return mod; },
    (err) => {
      // Already retried this session — the chunk really is gone. Let it through
      // to the error boundary rather than reloading on a loop.
      if (read()) { clear(); throw err; }
      if (!write()) throw err;
      doReload();
      // Deliberately never settles: the reload is already tearing this document
      // down, and resolving or rejecting here would let React render a flash of
      // error UI in the moment before it does.
      return new Promise(() => {});
    }
  );
}
