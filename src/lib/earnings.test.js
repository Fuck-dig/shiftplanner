import { describe, it, expect } from 'vitest';
import { earningsInRange } from './earnings';
import { payPeriodFor } from './payPeriod';

// Mon 2026-08-10 is a Monday, so this is a valid week key.
const WK = '2026-08-10';
const LUNCH = { id: 'lunch', name: 'Lunch', start: '10:00', end: '18:00' };   // 8h
const ME = { id: 'me', name: 'Me', wage: 200, contractType: 'hourly', contractPeriod: 'week', maxHours: 40 };

const week = (days) => ({ [WK]: { schedule: days } });
const shift = (extra = {}) => ({ empId: 'me', name: 'Me', role: 'Waiter', ...extra });

// 10–16 Aug 2026, which the WK week sits entirely inside.
const AUG = { startISO: '2026-08-01', endISO: '2026-08-31' };

describe('earningsInRange', () => {
  it('pays scheduled hours at the person\'s own rate', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift()] } }), blocks: [LUNCH], emp: ME, range: AUG,
    });
    expect(r.hours).toBe(8);
    expect(r.total).toBe(1600);
  });

  it('uses CLOCKED hours when they exist — punch out early and the pay drops', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift({ actualStart: '10:00', actualEnd: '14:00' })] } }),
      blocks: [LUNCH], emp: ME, range: AUG,
    });
    expect(r.hours).toBe(4);
    expect(r.total).toBe(800);
  });

  it('a no-show earns nothing', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift({ noShow: true })] } }), blocks: [LUNCH], emp: ME, range: AUG,
    });
    expect(r.hours).toBe(0);
    expect(r.total).toBe(0);
  });

  it('a sick shift is paid at the sick rate and counts as zero hours worked', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift({ sick: true })] } }),
      blocks: [LUNCH], emp: { ...ME, sickPayPct: 60 }, range: AUG,
    });
    expect(r.hours).toBe(0);          // not worked
    expect(r.sickHours).toBe(8);
    expect(r.total).toBe(960);        // 8 × 200 × 0.60
  });

  it('falls back to the org sick rate when the person has none', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift({ sick: true })] } }),
      blocks: [LUNCH], emp: ME, range: AUG, orgSickPct: 100,
    });
    expect(r.total).toBe(1600);
  });

  it('adds up several shifts, and ignores other people', () => {
    const r = earningsInRange({
      schedules: week({
        Mon: { lunch: [shift(), { empId: 'someone-else', role: 'Waiter' }] },
        Tue: { lunch: [shift()] },
      }),
      blocks: [LUNCH], emp: ME, range: AUG,
    });
    expect(r.hours).toBe(16);
    expect(r.shifts).toHaveLength(2);
  });

  it('counts only shifts INSIDE the range', () => {
    // The week runs Mon 10 – Sun 16 Aug; this range stops on the 12th.
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift()] }, Fri: { lunch: [shift()] } }),
      blocks: [LUNCH], emp: ME,
      range: { startISO: '2026-08-10', endISO: '2026-08-12' },
    });
    expect(r.hours).toBe(8);
    expect(r.shifts[0].iso).toBe('2026-08-10');
  });

  it('respects a pay period boundary — the 15th is in, the 16th is out', () => {
    // Sat 15 Aug and Sun 16 Aug are the last two days of the WK week, and they
    // fall either side of a 16th-to-15th period end.
    const period = payPeriodFor(new Date(2026, 6, 20));   // 16 Jul – 15 Aug
    const r = earningsInRange({
      schedules: week({ Sat: { lunch: [shift()] }, Sun: { lunch: [shift()] } }),
      blocks: [LUNCH], emp: ME, range: period,
    });
    expect(r.hours).toBe(8);
    expect(r.shifts[0].iso).toBe('2026-08-15');
  });

  it('separates upcoming hours so an estimate can be labelled as one', () => {
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift()] }, Fri: { lunch: [shift()] } }),
      blocks: [LUNCH], emp: ME, range: AUG, todayISO: '2026-08-12',
    });
    expect(r.hours).toBe(16);
    expect(r.upcomingHours).toBe(8);   // Friday the 14th only
  });

  it('converts a monthly salary to an hourly equivalent, like Costs does', () => {
    const salaried = { id: 'me', wage: 34640, contractType: 'salary', contractPeriod: 'month', maxHours: 40 };
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift()] } }), blocks: [LUNCH], emp: salaried, range: AUG,
    });
    expect(r.total).toBeCloseTo(1600, 0);   // 34640 / (40 × 4.33) ≈ 200/h
  });

  it('reports hours but NO money when no wage is set', () => {
    // Deliberately not the manager's priority-based "cost index": showing an
    // employee a number that isn't their pay is worse than showing none.
    const r = earningsInRange({
      schedules: week({ Mon: { lunch: [shift()] } }),
      blocks: [LUNCH], emp: { id: 'me', priority: 100 }, range: AUG,
    });
    expect(r.hours).toBe(8);
    expect(r.total).toBe(0);
    expect(r.hasRate).toBe(false);
  });

  it('survives missing or malformed inputs rather than throwing', () => {
    expect(earningsInRange({}).total).toBe(undefined);          // empty shape, no crash
    expect(earningsInRange({ schedules: {}, blocks: [], emp: ME, range: AUG }).hours).toBe(0);
    // A schedule referencing a block that no longer exists must not blow up.
    expect(earningsInRange({
      schedules: week({ Mon: { deleted: [shift()] } }), blocks: [LUNCH], emp: ME, range: AUG,
    }).hours).toBe(0);
  });
});
