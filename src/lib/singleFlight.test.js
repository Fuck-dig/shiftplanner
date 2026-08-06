import { describe, it, expect, vi } from 'vitest';
import { singleFlight } from './singleFlight';

describe('singleFlight', () => {
  it('runs the underlying function ONCE for concurrent callers', async () => {
    // The actual outage shape: two boot paths calling the same mutation at the
    // same instant.
    let resolve;
    const fn = vi.fn(() => new Promise((r) => { resolve = r; }));
    const wrapped = singleFlight(fn);

    const a = wrapped();
    const b = wrapped();
    expect(fn).toHaveBeenCalledTimes(0); // not yet — deferred a microtask
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hands both callers the same promise object', async () => {
    const wrapped = singleFlight(() => Promise.resolve('x'));
    const a = wrapped();
    const b = wrapped();
    expect(a).toBe(b);
    await a;
  });

  it('runs again once the first call has SETTLED', async () => {
    // Not a permanent latch — a real second login must still be accepted.
    const fn = vi.fn(() => Promise.resolve(1));
    const wrapped = singleFlight(fn);
    await wrapped();
    await wrapped();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('shares a rejection with every concurrent caller, and clears the slot', async () => {
    // If a failure left `inFlight` set, every later call would replay the same
    // stale rejection forever and the app could never recover.
    const fn = vi.fn(() => Promise.reject(new Error('boom')));
    const wrapped = singleFlight(fn);
    const a = wrapped();
    const b = wrapped();
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);

    fn.mockImplementation(() => Promise.resolve('recovered'));
    await expect(wrapped()).resolves.toBe('recovered');
  });

  it('rejects rather than throwing when the function throws synchronously', async () => {
    const wrapped = singleFlight(() => { throw new Error('sync boom'); });
    await expect(wrapped()).rejects.toThrow('sync boom');
    // Slot cleared, so the next call is not poisoned.
    await expect(wrapped()).rejects.toThrow('sync boom');
  });
});
