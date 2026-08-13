import { describe, it, expect } from 'vitest';
import { scrubEvent, redactString } from './monitoring';

describe('redactString', () => {
  it('removes an email address from anywhere in a string', () => {
    expect(redactString('login failed for nikolaj@almus.dk on retry'))
      .toBe('login failed for [email] on retry');
  });

  it('truncates something enormous rather than shipping it', () => {
    expect(redactString('x'.repeat(5000))).toHaveLength(1000 + '…[truncated]'.length);
  });

  it('leaves an ordinary message alone', () => {
    expect(redactString('Cannot read properties of null')).toBe('Cannot read properties of null');
  });
});

describe('scrubEvent — what may leave the building', () => {
  it('redacts wages, names, phones and emails by key', () => {
    const out = scrubEvent({ employee: { name: 'Nikolaj Ry', wage: 200, phone: '+4512345678' } });
    expect(out.employee).toEqual({ name: '[redacted]', wage: '[redacted]', phone: '[redacted]' });
  });

  it('does NOT redact `filename` or `function` — the stack trace must survive', () => {
    // The reason keys are matched WHOLE and not as substrings. A substring
    // match on "name" hits `filename`, and the scrubber would then destroy the
    // only useful part of the report it exists to protect.
    const frame = { filename: 'src/components/Dashboard.jsx', function: 'renderName', lineno: 42 };
    expect(scrubEvent({ frames: [frame] }).frames[0]).toEqual(frame);
  });

  it('finds an email buried in an exception message', () => {
    const event = { exception: { values: [{ value: 'duplicate key for maja@almus.dk' }] } };
    expect(scrubEvent(event).exception.values[0].value).toBe('duplicate key for [email]');
  });

  it('keeps the shape of the event so Sentry still understands it', () => {
    const event = { event_id: 'abc', level: 'error', tags: { org: 'uuid-1' }, breadcrumbs: [] };
    expect(scrubEvent(event)).toEqual(event);
  });

  it('passes through data it does not recognise rather than dropping it', () => {
    // A scrubber that only allows known keys would quietly gut a future Sentry
    // version's payload, and nobody would notice until a report was useless.
    const out = scrubEvent({ some_future_field: { nested: 'value', n: 3 } });
    expect(out.some_future_field).toEqual({ nested: 'value', n: 3 });
  });

  it('survives nulls, arrays, primitives and circular references', () => {
    expect(scrubEvent(null)).toBe(null);
    expect(scrubEvent(7)).toBe(7);
    expect(scrubEvent(['a', { wage: 1 }])).toEqual(['a', { wage: '[redacted]' }]);
    const circular = { a: 1 }; circular.self = circular;
    expect(() => scrubEvent(circular)).not.toThrow();
    expect(scrubEvent(circular).self).toBe('[circular]');
  });

  it('is case-insensitive on keys', () => {
    expect(scrubEvent({ Wage: 200, SickPayPct: 60 })).toEqual({ Wage: '[redacted]', SickPayPct: '[redacted]' });
  });
});
