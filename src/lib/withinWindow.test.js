import { describe, it, expect } from 'vitest';
import { withinWindow } from './dates';

describe('withinWindow — fencing a shift to its service', () => {
  const LUNCH = ['10:00', '16:00'];
  const DINNER = ['16:30', '00:00'];      // ends at midnight
  const LATE = ['18:00', '02:00'];        // genuinely crosses into the next day

  it('accepts a time inside the window', () => {
    expect(withinWindow('12:00', ...LUNCH)).toBe(true);
  });

  it('rejects the case this exists for: 18:00 under Lunch', () => {
    // The whole point. Posting "Lunch, 18:00–22:00" was possible in three
    // earlier versions of the dialog; now the time cannot be entered at all.
    expect(withinWindow('18:00', ...LUNCH)).toBe(false);
  });

  it('includes BOTH ends, so a whole block is expressible', () => {
    // Exclusive ends would make "the entire lunch service" unsayable, which is
    // the most common thing anyone wants.
    expect(withinWindow('10:00', ...LUNCH)).toBe(true);
    expect(withinWindow('16:00', ...LUNCH)).toBe(true);
    expect(withinWindow('09:55', ...LUNCH)).toBe(false);
    expect(withinWindow('16:05', ...LUNCH)).toBe(false);
  });

  it('handles a window ending at midnight', () => {
    expect(withinWindow('23:30', ...DINNER)).toBe(true);
    expect(withinWindow('00:00', ...DINNER)).toBe(true);
    expect(withinWindow('16:00', ...DINNER)).toBe(false);
  });

  it('handles a window that crosses midnight', () => {
    expect(withinWindow('23:00', ...LATE)).toBe(true);
    expect(withinWindow('01:00', ...LATE)).toBe(true);
    expect(withinWindow('02:00', ...LATE)).toBe(true);
    expect(withinWindow('03:00', ...LATE)).toBe(false);
    expect(withinWindow('17:00', ...LATE)).toBe(false);
  });

  it('is unfenced when either bound is missing', () => {
    // Every other TimePicker in the app passes no bounds and must keep working.
    expect(withinWindow('03:00')).toBe(true);
    expect(withinWindow('03:00', '10:00', undefined)).toBe(true);
  });

  it('rejects a malformed time rather than throwing', () => {
    expect(withinWindow(undefined, ...LUNCH)).toBe(false);
    expect(withinWindow('nonsense', ...LUNCH)).toBe(false);
  });
});
