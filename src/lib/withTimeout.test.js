import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError } from './withTimeout';

// Real timers, tiny durations — the thing under test IS timing, and faking it
// away would leave the test asserting on the mock rather than the behaviour.
describe('withTimeout', () => {
  it('passes a fast result straight through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'x')).resolves.toBe('ok');
  });

  it('passes a fast rejection straight through, unchanged', async () => {
    // A real error must not be masked as a timeout — they mean different
    // things to whoever reads the console.
    await expect(withTimeout(Promise.reject(new Error('real')), 50, 'x')).rejects.toThrow('real');
  });

  it('rejects with TimeoutError when the promise NEVER settles', async () => {
    // The actual outage shape: a request that hangs rather than fails.
    const never = new Promise(() => {});
    await expect(withTimeout(never, 10, 'restaurants')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('names the thing that timed out, for a usable console message', async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 10, 'restaurants')).rejects.toThrow(/restaurants timed out after 10ms/);
  });

  it('clears its timer when the promise resolves first', async () => {
    const clearTimer = vi.fn();
    const setTimer = vi.fn(() => 'timer-id');
    await withTimeout(Promise.resolve('ok'), 1000, 'x', { setTimer, clearTimer });
    expect(clearTimer).toHaveBeenCalledWith('timer-id');
  });

  it('clears its timer when the promise rejects first', async () => {
    const clearTimer = vi.fn();
    const setTimer = vi.fn(() => 'timer-id');
    await expect(
      withTimeout(Promise.reject(new Error('nope')), 1000, 'x', { setTimer, clearTimer }),
    ).rejects.toThrow('nope');
    expect(clearTimer).toHaveBeenCalledWith('timer-id');
  });
});
