// @vitest-environment jsdom
//
// KioskView — the PIN pad on the wall-mounted device.
//
// WHY THIS ONE EARNED TESTS
//
// It was rewritten three times and shipped two bugs to a live restaurant:
//
//   v1  checked on every keystroke and counted every check, so a wrong
//       6-digit PIN burned three of five attempts and could lock someone out
//       WHILE THEY WERE STILL TYPING. Reported as "it says too many tries
//       before I've even finished".
//   v2  checked 450ms after typing stopped — which still fired early for
//       anyone who paused between the 4th and 5th digit, and still charged
//       them. Reported as "it sometimes checks after 4 digits".
//
// Both bugs came from the browser trying to infer something only the server
// knows: how long the stored PIN is. It cannot — that is the point of hashing
// it. The fix was to stop guessing and let a wrong-LENGTH attempt cost
// nothing server-side (20260813200000), so the client can safely ask after
// every digit from the fourth.
//
// That history is why the tests below are mostly about WHEN a check fires and
// which reply is allowed to act, rather than about the keypad rendering.
//
// NOT COVERED YET: the 1200ms deferred "wrong PIN" message. It needs fake
// timers interleaved with real promises, which is a different piece of
// machinery — deliberately left for its own pass rather than bolted on here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeT, detectLang } from '../i18n';

vi.mock('../lib/data', () => ({
  fetchEmployees: vi.fn(), fetchBlocks: vi.fn(), fetchSchedules: vi.fn(),
  fetchRoleStyles: vi.fn(), updateShiftAssignment: vi.fn(), verifyKioskPin: vi.fn(),
}));

// The punch clock is a screen in its own right. Standing in for it keeps
// these tests about the gate rather than about what is behind it.
vi.mock('./views/PunchClockView', () => ({
  default: () => <div data-testid="punch-clock" />,
}));

import KioskView from './KioskView';
import {
  fetchEmployees, fetchBlocks, fetchSchedules, fetchRoleStyles, verifyKioskPin,
} from '../lib/data';

// Built the same way the component builds it, so these assertions match
// whatever language jsdom reports rather than hardcoding English.
const t = makeT(detectLang());

const ADA = { id: 'e1', name: 'Ada', roles: [], hasPin: true };
const BO = { id: 'e2', name: 'Bo', roles: [], hasPin: false };
const ZED = { id: 'e3', name: 'Zed', roles: [], hasPin: true, archived: true };

beforeEach(() => {
  vi.clearAllMocks();
  fetchEmployees.mockResolvedValue([ADA, BO, ZED]);
  fetchBlocks.mockResolvedValue([]);
  fetchSchedules.mockResolvedValue({});
  fetchRoleStyles.mockResolvedValue({});
  verifyKioskPin.mockResolvedValue({ ok: false, lockedSeconds: 0 });
});
afterEach(cleanup);

async function openKiosk() {
  render(<KioskView orgId="o1" orgName="Almus" toggleTheme={() => {}} onExitKiosk={() => {}} />);
  await screen.findByText('Ada');
}

const pad = (d) => screen.getByRole('button', { name: d });

// Every keypress kicks off an async check, so each one is followed by a flush
// — otherwise the assertion runs before the reply lands and passes or fails
// for the wrong reason.
async function type(digits) {
  for (const d of digits) {
    fireEvent.click(pad(d));
    await act(async () => {});
  }
}

describe('KioskView', () => {
  it('offers a tile for each employee who still works here', async () => {
    await openKiosk();
    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.getByText('Bo')).toBeDefined();
  });

  // The kiosk is the one screen anyone walking past can use, and someone who
  // has left should not be able to punch in on it.
  it('does not offer a tile to someone who has left', async () => {
    await openKiosk();
    expect(screen.queryByText('Zed')).toBeNull();
  });

  it('says so plainly when someone has no PIN, instead of an unusable keypad', async () => {
    await openKiosk();
    fireEvent.click(screen.getByText('Bo'));

    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
    expect(screen.getByText(t('kiosk.noPinSet', { name: 'Bo' }))).toBeDefined();
  });

  describe('when to ask the server', () => {
    // The browser is not allowed to guess the PIN's length, so it asks from
    // the fourth digit on — but not before, because three digits cannot be
    // anyone's PIN and the round trip would be pure noise.
    it('asks nothing before the fourth digit', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('123');

      expect(verifyKioskPin).not.toHaveBeenCalled();
    });

    it('asks on the fourth digit, with what has been typed', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('1234');

      expect(verifyKioskPin).toHaveBeenCalledTimes(1);
      expect(verifyKioskPin).toHaveBeenCalledWith('e1', '1234');
    });

    // This is what makes a 6-digit PIN work without the client knowing it is
    // 6 digits. It is only affordable because a wrong-LENGTH attempt costs
    // nothing server-side — the fix that closed both shipped bugs.
    it('asks again on every digit after that', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('123456');

      expect(verifyKioskPin).toHaveBeenCalledTimes(3);
      expect(verifyKioskPin).toHaveBeenNthCalledWith(2, 'e1', '12345');
      expect(verifyKioskPin).toHaveBeenNthCalledWith(3, 'e1', '123456');
    });

    it('signs in on the last digit, with no OK to press', async () => {
      verifyKioskPin
        .mockResolvedValueOnce({ ok: false, lockedSeconds: 0 })
        .mockResolvedValueOnce({ ok: false, lockedSeconds: 0 })
        .mockResolvedValueOnce({ ok: true });

      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('123456');

      expect(screen.getByTestId('punch-clock')).toBeDefined();
    });
  });

  // THE RACE. Typing "1234" then "12345" starts two checks, and nothing
  // guarantees the replies come back in that order.
  //
  // The damage a stale reply does is to the entry IN PROGRESS, not to a
  // session already started — no path in runVerify sets `verified` back to
  // false, so asserting that someone stays signed in proves nothing. What a
  // superseded reply can do is wipe the digits under someone's fingers and
  // impose a lockout for an attempt that has already been overtaken. That is
  // v1's bug wearing a different hat: being locked out mid-typing.
  //
  // Verified by mutation — delete the seq guard in runVerify and this fails.
  it('ignores a reply that a later keystroke has superseded', async () => {
    let answerTheStaleOne;
    verifyKioskPin
      .mockImplementationOnce(() => new Promise(r => { answerTheStaleOne = r; }))
      .mockResolvedValueOnce({ ok: false, lockedSeconds: 0 });

    await openKiosk();
    fireEvent.click(screen.getByText('Ada'));
    await type('12345');

    // The 4-digit check finally answers — with a lockout, far too late.
    await act(async () => { answerTheStaleOne({ ok: false, lockedSeconds: 30 }); });

    expect(screen.queryByText(t('kiosk.lockedFor', { n: 30 }))).toBeNull();
    expect(pad('1')).toBeDefined();
  });

  describe('lockout', () => {
    it('reports the lockout rather than calling the PIN wrong', async () => {
      verifyKioskPin.mockResolvedValue({ ok: false, lockedSeconds: 30 });

      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('1234');

      expect(screen.getByText(t('kiosk.lockedFor', { n: 30 }))).toBeDefined();
      expect(screen.queryByText(t('kiosk.wrongPin'))).toBeNull();
    });

    it('stops asking the server while locked out', async () => {
      verifyKioskPin.mockResolvedValue({ ok: false, lockedSeconds: 30 });

      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('1234');
      verifyKioskPin.mockClear();

      await type('5678');
      expect(verifyKioskPin).not.toHaveBeenCalled();
    });
  });

  // Most "shared kiosk device" setups are a laptop, not a touchscreen.
  describe('physical keyboard', () => {
    it('accepts typed digits exactly like taps', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));

      for (const key of '1234') {
        fireEvent.keyDown(window, { key });
        await act(async () => {});
      }
      expect(verifyKioskPin).toHaveBeenCalledWith('e1', '1234');
    });

    it('backspaces without asking the server about the shorter code', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      await type('1234');
      verifyKioskPin.mockClear();

      fireEvent.keyDown(window, { key: 'Backspace' });
      await act(async () => {});
      expect(verifyKioskPin).not.toHaveBeenCalled();
    });

    it('escapes back to the employee list', async () => {
      await openKiosk();
      fireEvent.click(screen.getByText('Ada'));
      expect(pad('1')).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      await act(async () => {});

      expect(screen.queryByRole('button', { name: '1' })).toBeNull();
      expect(screen.getByText('Bo')).toBeDefined();
    });
  });

  it('starts a different employee from a clean slate', async () => {
    await openKiosk();
    fireEvent.click(screen.getByText('Ada'));
    await type('1234');
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => {});

    verifyKioskPin.mockClear();
    fireEvent.click(screen.getByText('Ada'));
    await type('123');

    // If the old digits had survived, three more would have reached four and
    // fired a check.
    expect(verifyKioskPin).not.toHaveBeenCalled();
  });
});
