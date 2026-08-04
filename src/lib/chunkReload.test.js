import { describe, it, expect, vi } from 'vitest';
import { retryChunkLoad, RELOAD_FLAG } from './chunkReload';

// Minimal sessionStorage stand-in. `failOn` lets a test simulate a browser
// that throws on storage access (Safari private mode), which must degrade to
// "no retry" rather than taking the app down.
function fakeStorage(initial = {}, failOn = null) {
  const data = { ...initial };
  const guard = (op) => { if (failOn === op || failOn === 'all') throw new Error('storage blocked'); };
  return {
    getItem: (k) => { guard('get'); return k in data ? data[k] : null; },
    setItem: (k, v) => { guard('set'); data[k] = String(v); },
    removeItem: (k) => { guard('remove'); delete data[k]; },
    _data: data,
  };
}


// Did this promise settle? Promise.race against an already-resolved promise
// does NOT work here — the resolved one always wins the microtask race, so the
// assertion passes even when the promise under test settled immediately. Flush
// a macrotask instead and see whether the handler actually ran.
async function settledYet(p) {
  let settled = false;
  p.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 0));
  return settled;
}

describe('retryChunkLoad', () => {
  it('passes the module through untouched when the import succeeds', async () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    const mod = { default: 'Dashboard' };
    await expect(retryChunkLoad(() => Promise.resolve(mod), { storage, reload })).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears a leftover flag on success, so the next deploy can retry too', async () => {
    // Without this the flag survives from an earlier recovery and the NEXT
    // stale-chunk failure in the same tab would go straight to the error
    // boundary instead of reloading.
    const storage = fakeStorage({ [RELOAD_FLAG]: '1' });
    await retryChunkLoad(() => Promise.resolve({}), { storage, reload: vi.fn() });
    expect(storage.getItem(RELOAD_FLAG)).toBe(null);
  });

  it('reloads once on a failed import and never settles', async () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    const p = retryChunkLoad(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), { storage, reload });

    // Settling either way would let React paint error UI in the instant before
    // the reload tears the document down.
    expect(await settledYet(p)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(RELOAD_FLAG)).toBe('1');
  });

  it('does NOT reload a second time — it rethrows so the error is visible', async () => {
    // The whole point of the flag. A genuinely missing chunk (bad deploy)
    // would otherwise reload forever, leaving a flickering page and no error.
    const storage = fakeStorage({ [RELOAD_FLAG]: '1' });
    const reload = vi.fn();
    const err = new Error('still missing');
    await expect(retryChunkLoad(() => Promise.reject(err), { storage, reload })).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the flag when it gives up, so a later real deploy can recover', async () => {
    const storage = fakeStorage({ [RELOAD_FLAG]: '1' });
    await retryChunkLoad(() => Promise.reject(new Error('x')), { storage, reload: vi.fn() }).catch(() => {});
    expect(storage.getItem(RELOAD_FLAG)).toBe(null);
  });

  it('rethrows instead of reloading when storage is unavailable', async () => {
    // No storage means no loop guard, and an unguarded reload is worse than
    // an error message.
    const storage = fakeStorage({}, 'set');
    const reload = vi.fn();
    await expect(retryChunkLoad(() => Promise.reject(new Error('boom')), { storage, reload })).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });

  it('survives storage that throws on read', async () => {
    const storage = fakeStorage({}, 'get');
    const reload = vi.fn();
    const p = retryChunkLoad(() => Promise.reject(new Error('boom')), { storage, reload });
    expect(await settledYet(p)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
