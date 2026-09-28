// @vitest-environment jsdom
//
// TimePicker — the control that makes "Lunch, 18:00" unrepresentable.
//
// Named after the component rather than its file: it is exported from ui.jsx
// alongside a dozen unrelated things, and a single ui.test.jsx would become
// the same kind of grab-bag the file already is.
//
// WHAT IS ACTUALLY BEING PROTECTED
//
// Two things, and both are invisible in review.
//
// 1. THE WINDOW HAS A BACK DOOR. `min`/`max` grey out the hour and minute
//    columns, which is the obvious half. But the field is also a TEXT input,
//    so anyone can type 18:00 into a Lunch shift and skip the columns
//    entirely. `commitText` fences typing too. Delete that one line and the
//    picker still looks correct — the columns still grey out — while the
//    contradiction it exists to prevent walks straight back in.
//
// 2. THE PROP-SYNC PATTERN. `text` is real local state (you can type a
//    partial time), but it must reset when `value` changes from outside.
//    This was an effect once, which rendered the stale time and corrected it
//    on a second pass. It is now the same adjusting-state-during-render
//    pattern as SettingsView, and it is just as deletable-looking.
//
// The arithmetic underneath (`withinWindow`, including midnight-crossing) is
// already covered in lib/withinWindow.test.js. These tests are about whether
// the COMPONENT consults it — in both places.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimePicker } from './ui';

afterEach(cleanup);

const field = () => screen.getByPlaceholderText('00:00');
const openPicker = () => fireEvent.click(screen.getByTitle('Pick time'));

// Lunch. Chosen so the assertions below never collide with the minute column,
// which only ever holds 00,05,…,55 — '12' and '18' appear exactly once on
// screen, in the hours.
const LUNCH = { min: '11:00', max: '15:00' };

describe('TimePicker', () => {
  it('shows the time it was given', () => {
    render(<TimePicker value="12:30" onChange={() => {}} />);
    expect(field().value).toBe('12:30');
  });

  it('commits a typed time on blur', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: '13:30' } });
    fireEvent.blur(field(), { target: { value: '13:30' } });
    expect(onChange).toHaveBeenCalledWith('13:30');
  });

  it('accepts a bare hour and pads it', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} />);
    fireEvent.blur(field(), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith('09:00');
  });

  // Drive this the way a person does: type (change), then leave (blur).
  //
  // Both halves matter. Without the `change`, React never learns the text and
  // the revert sets state to what it already held, so nothing re-renders and
  // the DOM keeps whatever the test poked in. And the `blur` must NOT carry a
  // `target` of its own — the element already holds the typed text, and
  // re-assigning .value immediately before dispatch desyncs React's internal
  // value tracker from its state, after which the re-render does not reach
  // the DOM.
  //
  // Either mistake fails against a component that is behaving perfectly,
  // which is the expensive kind of wrong: it sends you looking for a bug in
  // the source.
  it('reverts nonsense instead of storing it', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: '99:99' } });
    fireEvent.blur(field());

    expect(field().value).toBe('12:00');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stays quiet when the typed time is the one already set', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} />);
    fireEvent.blur(field(), { target: { value: '12:00' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Escape is pressed while the field is FOCUSED — that is the only way a
  // person can press it. The focus matters: the handler calls e.target.blur(),
  // and jsdom only fires a blur event on an element that actually had focus.
  // Skip the focus and this test passes without exercising the path it names.
  it('abandons an edit on Escape', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} />);
    field().focus();
    fireEvent.change(field(), { target: { value: '14:00' } });
    fireEvent.keyDown(field(), { key: 'Escape' });

    expect(field().value).toBe('12:00');
    expect(onChange).not.toHaveBeenCalled();
  });

  // The prop-sync pattern. Half-typed text must not survive the parent
  // handing this control a different shift's hours.
  it('drops a half-typed edit when the value changes underneath it', () => {
    const { rerender } = render(<TimePicker value="12:00" onChange={() => {}} />);
    fireEvent.change(field(), { target: { value: '14:' } });
    expect(field().value).toBe('14:');

    rerender(<TimePicker value="09:00" onChange={() => {}} />);
    expect(field().value).toBe('09:00');
  });

  describe('fenced to a block', () => {
    // THE BACK DOOR. The columns are not the only way in.
    it('refuses a typed time outside the window', () => {
      const onChange = vi.fn();
      render(<TimePicker value="12:00" onChange={onChange} {...LUNCH} />);
      fireEvent.change(field(), { target: { value: '18:00' } });
      fireEvent.blur(field());

      expect(field().value).toBe('12:00');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('still accepts a typed time inside it', () => {
      const onChange = vi.fn();
      render(<TimePicker value="12:00" onChange={onChange} {...LUNCH} />);
      fireEvent.blur(field(), { target: { value: '14:00' } });
      expect(onChange).toHaveBeenCalledWith('14:00');
    });

    it('ignores a click on an hour outside the window', () => {
      const onChange = vi.fn();
      render(<TimePicker value="12:00" onChange={onChange} {...LUNCH} />);
      openPicker();
      fireEvent.click(screen.getByText('18'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('takes a click on an hour inside it', () => {
      const onChange = vi.fn();
      render(<TimePicker value="12:00" onChange={onChange} {...LUNCH} />);
      openPicker();
      fireEvent.click(screen.getByText('13'));
      expect(onChange).toHaveBeenCalledWith('13:00');
    });

    // Dinner, 16:30–00:00 — an end that reads as earlier than its start is
    // taken to cross midnight. Without that, the entire evening service is
    // unselectable, which is the more common block of the two.
    it('handles a window that crosses midnight', () => {
      const onChange = vi.fn();
      render(<TimePicker value="18:00" onChange={onChange} min="16:30" max="00:00" />);
      openPicker();

      fireEvent.click(screen.getByText('23'));
      expect(onChange).toHaveBeenCalledWith('23:00');

      onChange.mockClear();
      fireEvent.click(screen.getByText('09'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves every hour open when no window is given', () => {
      const onChange = vi.fn();
      render(<TimePicker value="12:00" onChange={onChange} />);
      openPicker();
      fireEvent.click(screen.getByText('03'));
      expect(onChange).toHaveBeenCalledWith('03:00');
    });
  });
});
