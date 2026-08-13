import { describe, it, expect } from 'vitest';
import { swapTimes } from './schedule';

describe('swapTimes — what hours an open shift actually runs', () => {
  const BLOCK2 = { start: '10:00', end: '16:00' };

  it("uses the shift's own hours when a manager set them", () => {
    // The bug this exists to stop. Three render sites each independently
    // reached for the BLOCK's hours, so an 18:00–22:00 open shift told staff it
    // ran 10:00–16:00 — six hours instead of four, discovered on the day.
    expect(swapTimes({ start: '18:00', end: '22:00' }, BLOCK2))
      .toEqual({ start: '18:00', end: '22:00' });
  });

  it('falls back to the block when the shift has none', () => {
    // Which is what every existing open shift means, so this is the common path.
    expect(swapTimes({}, BLOCK2)).toEqual({ start: '10:00', end: '16:00' });
  });

  it('does not throw on a missing shift or block', () => {
    expect(swapTimes(null, BLOCK2)).toEqual({ start: '10:00', end: '16:00' });
    expect(swapTimes({ start: '18:00', end: '22:00' }, null)).toEqual({ start: '18:00', end: '22:00' });
    expect(swapTimes(null, null)).toEqual({ start: '', end: '' });
  });
});
