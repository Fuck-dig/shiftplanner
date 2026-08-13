import { describe, it, expect } from 'vitest';
import { shouldShowRoleRow } from './schedule';

describe('shouldShowRoleRow — why a role row exists in the Week grid', () => {
  it('shows a row the block asks for, even with nobody on it', () => {
    // The gap has to be visible or you cannot tell you are short-staffed.
    expect(shouldShowRoleRow({ required: 2, assigned: 0, openShifts: 0 })).toBe(true);
  });

  it('shows a row somebody is assigned to, even if the block does not ask for it', () => {
    // Covering a one-off shift outside the usual roles.
    expect(shouldShowRoleRow({ required: 0, assigned: 1, openShifts: 0 })).toBe(true);
  });

  it('shows a row that ONLY has an open shift', () => {
    // The bug, 13 Aug. An open shift lives in shift_swaps, so it is neither
    // required nor assigned. Posting a Waiter shift on a day Lunch needs no
    // waiters put it on the rota in a row that was never rendered: the manager
    // could not see what they had just created, and staff could.
    expect(shouldShowRoleRow({ required: 0, assigned: 0, openShifts: 1 })).toBe(true);
  });

  it('hides a row with none of the three', () => {
    // Deliberate: the grid is roles × blocks and would otherwise be mostly
    // empty rows.
    expect(shouldShowRoleRow({ required: 0, assigned: 0, openShifts: 0 })).toBe(false);
  });

  it('defaults every count to zero, so a missing argument hides rather than throws', () => {
    expect(shouldShowRoleRow({})).toBe(false);
    expect(shouldShowRoleRow()).toBe(false);
    expect(shouldShowRoleRow({ openShifts: 1 })).toBe(true);
  });
});
