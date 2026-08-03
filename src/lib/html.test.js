import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes all 5 HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes a mix of characters embedded in ordinary text', () => {
    expect(escapeHtml('Fish & Chips <shift="6-14">')).toBe('Fish &amp; Chips &lt;shift=&quot;6-14&quot;&gt;');
  });

  it('leaves plain text with no special characters untouched', () => {
    expect(escapeHtml('Kitchen Staff 6-14')).toBe('Kitchen Staff 6-14');
  });

  it('returns an empty string for an empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('is null/undefined-safe (returns empty string rather than throwing)', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string input to a string first', () => {
    expect(escapeHtml(123)).toBe('123');
  });
});
