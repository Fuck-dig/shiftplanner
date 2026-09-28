// @vitest-environment jsdom
//
// The first component test in Rorota.
//
// WHY THIS COMPONENT FIRST
//
// Every UI bug found this year was found by William in a browser after the
// gates went green: the staff row showing block hours, the pay card in the
// wrong tab, the settings form seeded from null, a modal built inside a
// flatMap. The suite protects the arithmetic in lib/ and nothing anyone
// touches. This is the start of closing that gap.
//
// CurrencySelect is the right place to start because its logic is invisible.
// It looks like a dropdown, but the interesting part is the rule for WHEN the
// free-text box appears, and getting that wrong silently rewrites a
// restaurant's saved currency to whatever happens to be first in the list.
// Nobody would see that in review, and the restaurant would see every total
// change overnight.
//
// WHY jsdom IS SET PER FILE
//
// The docblock above applies jsdom to THIS file only. The 278 lib/ tests stay
// in the node environment, which is several times faster — making the whole
// suite pay for a DOM that only component tests need would be a tax on every
// run forever.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CurrencySelect from './CurrencySelect';
import { CURRENCIES } from '../lib/currencies';

// Vitest globals are off in this project, so RTL's automatic cleanup never
// registers. Without this, each test's DOM stacks on the last one and
// getByRole starts finding two comboboxes.
afterEach(cleanup);

const combo = () => screen.getByRole('combobox');
// The free-text escape. Deliberately found by ROLE rather than by placeholder
// or test id: "is there a textbox on screen" is the actual question every test
// below is asking, and it stays true if the placeholder is reworded.
const textbox = () => screen.queryByRole('textbox');

describe('CurrencySelect', () => {
  it('offers every currency in the list, plus Other', () => {
    render(<CurrencySelect value="" onChange={() => {}} />);
    // +1 for Other, +1 for the placeholder shown while nothing is chosen.
    expect(screen.getAllByRole('option')).toHaveLength(CURRENCIES.length + 2);
  });

  it('shows the placeholder only until something is chosen', () => {
    const { rerender } = render(<CurrencySelect value="" onChange={() => {}} placeholder="kr" />);
    expect(screen.getByRole('option', { name: 'kr' })).toBeDefined();

    rerender(<CurrencySelect value="€" onChange={() => {}} placeholder="kr" />);
    expect(screen.queryByRole('option', { name: 'kr' })).toBeNull();
  });

  it('reports the symbol, not the label, when a currency is picked', () => {
    const onChange = vi.fn();
    render(<CurrencySelect value="" onChange={onChange} />);
    fireEvent.change(combo(), { target: { value: '€' } });
    // '€' — never '€ — Euro', which is what the option displays.
    expect(onChange).toHaveBeenCalledWith('€');
  });

  it('starts closed: no free-text box for a known currency', () => {
    render(<CurrencySelect value="kr" onChange={() => {}} />);
    expect(textbox()).toBeNull();
    expect(combo().value).toBe('kr');
  });

  // THE ONE THAT MATTERS.
  //
  // A restaurant set up before this dropdown existed can hold any symbol its
  // owner typed. If `custom` were driven by a mode flag alone, that value
  // would not match any option, the select would fall back to its first
  // entry, and the next save would write 'kr' over their real currency —
  // without anyone touching the field.
  it('opens in custom mode for a symbol the list does not contain', () => {
    render(<CurrencySelect value="₫" onChange={() => {}} />);
    expect(textbox().value).toBe('₫');
    expect(combo().value).toBe('__other__');
  });

  it('clears the value when Other is chosen, so the box starts empty', () => {
    const onChange = vi.fn();
    render(<CurrencySelect value="kr" onChange={onChange} />);
    fireEvent.change(combo(), { target: { value: '__other__' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  // The reason `chosenOther` exists as state at all. Deriving custom purely
  // from the value would mean an empty box is "not custom", so clearing the
  // text mid-edit would yank the field away and snap back to the dropdown
  // while the user was still typing.
  it('stays in custom mode while the box is empty', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CurrencySelect value="kr" onChange={onChange} />);
    fireEvent.change(combo(), { target: { value: '__other__' } });

    // Re-render with the cleared value the parent now holds.
    rerender(<CurrencySelect value="" onChange={onChange} />);
    expect(textbox()).not.toBeNull();
  });

  it('passes typed text straight through', () => {
    const onChange = vi.fn();
    render(<CurrencySelect value="₫" onChange={onChange} />);
    fireEvent.change(textbox(), { target: { value: '₴' } });
    expect(onChange).toHaveBeenCalledWith('₴');
  });

  it('returns to the dropdown when a listed currency is chosen again', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CurrencySelect value="₫" onChange={onChange} />);
    expect(textbox()).not.toBeNull();

    fireEvent.change(combo(), { target: { value: '$' } });
    rerender(<CurrencySelect value="$" onChange={onChange} />);
    expect(textbox()).toBeNull();
  });

  it('disables both controls together', () => {
    render(<CurrencySelect value="₫" onChange={() => {}} disabled />);
    expect(combo().disabled).toBe(true);
    expect(textbox().disabled).toBe(true);
  });

  // The column is a display symbol, not free-form text. Without a cap, a
  // pasted paragraph reaches the database and every money figure on the page
  // is prefixed with it.
  it('caps a custom symbol at 5 characters', () => {
    render(<CurrencySelect value="₫" onChange={() => {}} />);
    expect(textbox().maxLength).toBe(5);
  });

  it('falls back to English when no translator is passed', () => {
    render(<CurrencySelect value="" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'Other…' })).toBeDefined();
  });

  it('uses the translator when there is one', () => {
    render(<CurrencySelect value="" onChange={() => {}} t={() => 'Andet…'} />);
    expect(screen.getByRole('option', { name: 'Andet…' })).toBeDefined();
  });
});
