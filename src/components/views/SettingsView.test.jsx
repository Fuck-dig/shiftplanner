// @vitest-environment jsdom
//
// SettingsView — the form that nearly overwrote a restaurant's real pay rules.
//
// THE BUG THESE TESTS EXIST FOR
//
// Settings are FETCHED, so the first render gets `settings = null`. The draft
// was seeded once, in useState's initializer, from that null — which meant the
// form displayed 100% sick pay and day 16, the DEFAULTS, dressed up as the
// restaurant's saved values. Typing did nothing visible either, because
// `dirty` needs `settings` and there wasn't one, so Save stayed dead and the
// screen just looked broken.
//
// Looking broken was the lucky part. Had Save been reachable, it would have
// written those defaults over a sick-pay rate the owner had never touched, and
// the first anyone would know is a payslip.
//
// The fix is React's documented "adjusting state when a prop changes": compare
// against the last prop during render and correct immediately. It is four
// lines and it looks removable. These tests are what make it not removable.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsView from './SettingsView';

afterEach(cleanup);

const SAVED = { currency: '€', sickPayPct: 80, payPeriodStartDay: 1 };

// t returns the key, so assertions name the key rather than a translation —
// these tests should not start failing because someone rewords a label.
const t = (k) => k;

function setup(overrides = {}) {
  const props = {
    orgName: 'Almus', isOwner: true, settings: SAVED,
    onSave: vi.fn(), saving: false, error: '',
    s: { card: {} }, t,
    ...overrides,
  };
  return { ...render(<SettingsView {...props} />), props };
}

const currency = () => screen.getByRole('combobox');
const sickPay = () => screen.getAllByRole('spinbutton')[0];
const periodDay = () => screen.getAllByRole('spinbutton')[1];
const save = () => screen.getByRole('button');

describe('SettingsView', () => {
  it('will not offer to save before the settings have loaded', () => {
    setup({ settings: null });
    expect(save().disabled).toBe(true);
  });

  // The regression test proper. If the draft is seeded only once, this fails
  // with 100 and 16 — the defaults — while claiming to show Almus's settings.
  it("shows the restaurant's own values once they arrive, not the defaults", () => {
    const { rerender, props } = setup({ settings: null });
    rerender(<SettingsView {...props} settings={SAVED} />);

    expect(sickPay().value).toBe('80');
    expect(periodDay().value).toBe('1');
    expect(currency().value).toBe('€');
  });

  // Switching restaurants without unmounting. Same failure mode, and the one
  // more likely to survive a careless refactor of the block above.
  it('re-seeds when a different restaurant is selected', () => {
    const { rerender, props } = setup();
    rerender(<SettingsView {...props} settings={{ currency: 'kr', sickPayPct: 50, payPeriodStartDay: 16 }} />);

    expect(sickPay().value).toBe('50');
    expect(periodDay().value).toBe('16');
    expect(currency().value).toBe('kr');
  });

  it('keeps Save dead until something actually changes', () => {
    setup();
    expect(save().disabled).toBe(true);

    fireEvent.change(sickPay(), { target: { value: '90' } });
    expect(save().disabled).toBe(false);
  });

  it('counts a currency change as a change', () => {
    setup();
    fireEvent.change(currency(), { target: { value: '£' } });
    expect(save().disabled).toBe(false);
  });

  it('saves the whole draft, not only the field that moved', () => {
    const { props } = setup();
    fireEvent.change(sickPay(), { target: { value: '90' } });
    fireEvent.click(save());

    expect(props.onSave).toHaveBeenCalledWith({
      currency: '€', sickPayPct: 90, payPeriodStartDay: 1,
    });
  });

  // A database trigger is what actually rejects a manager changing these
  // (20260813100000). The disabled attribute is a courtesy so nobody types
  // into a field whose save will bounce — but currency is NOT owner-only, and
  // locking it here would take a setting away from the people who need it.
  it('locks the pay fields for a manager, and leaves the currency alone', () => {
    setup({ isOwner: false });

    expect(sickPay().disabled).toBe(true);
    expect(periodDay().disabled).toBe(true);
    expect(currency().disabled).toBe(false);
  });

  // 29, 30 and 31 do not exist in every month, so a period anchored there
  // would fail to open in February. Same bound as the CHECK constraint on the
  // column — the input is the friendly half of a rule the database enforces.
  it('clamps the pay-period day to a day every month has', () => {
    setup();
    fireEvent.change(periodDay(), { target: { value: '31' } });
    expect(periodDay().value).toBe('28');

    fireEvent.change(periodDay(), { target: { value: '0' } });
    expect(periodDay().value).toBe('1');
  });

  it('clamps sick pay to a percentage', () => {
    setup();
    fireEvent.change(sickPay(), { target: { value: '150' } });
    expect(sickPay().value).toBe('100');
  });

  // "Starts on the 16th" is abstract; "16 Jul – 15 Aug, paid 31 Aug" is not.
  // It also makes a typo obvious immediately rather than at the end of a month.
  it('previews the period a valid day produces', () => {
    setup();
    expect(screen.queryByText('settings.periodPreview')).not.toBeNull();
  });

  it('drops the preview rather than inventing one while the field is empty', () => {
    setup();
    fireEvent.change(periodDay(), { target: { value: '' } });
    expect(screen.queryByText('settings.periodPreview')).toBeNull();
  });

  it('shuts the form while a save is in flight', () => {
    setup({ saving: true });
    expect(currency().disabled).toBe(true);
    expect(sickPay().disabled).toBe(true);
    expect(save().disabled).toBe(true);
  });

  it('surfaces a save failure instead of swallowing it', () => {
    setup({ error: 'Could not save' });
    expect(screen.getByText('Could not save')).toBeDefined();
  });
});
