import { describe, it, expect } from 'vitest';
import { STRINGS, LANGUAGES, LOCALES, makeT, detectLang } from './i18n';

// A missing translation key doesn't throw — makeT falls back to English, and
// failing that returns the key string itself. That's the right runtime
// behaviour (better a stray English word than a crash) but it means a typo or
// a half-finished translation stays invisible until someone using that
// language reaches that exact screen. These tests turn that into a build
// failure instead. Both real bugs this caught so far were in the same shape:
// a key added to four languages out of five.
describe('i18n key parity', () => {
  const langs = Object.keys(STRINGS);
  const enKeys = Object.keys(STRINGS.en);

  it('has every language declared in LANGUAGES present in STRINGS, and vice versa', () => {
    expect(new Set(LANGUAGES.map(l => l.code))).toEqual(new Set(langs));
  });

  it('has a locale mapping for every language (used for date/number formatting)', () => {
    for (const lang of langs) expect(LOCALES[lang], `LOCALES is missing '${lang}'`).toBeTruthy();
  });

  it.each(langs.filter(l => l !== 'en'))('%s has exactly the same keys as en', lang => {
    const keys = Object.keys(STRINGS[lang]);
    const missing = enKeys.filter(k => !keys.includes(k));
    const extra = keys.filter(k => !enKeys.includes(k));
    // Named in the assertion so a failure says WHICH key, not just a count.
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('has a string value for every key', () => {
    for (const lang of langs) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        expect(typeof v, `${lang}.${k} should be a string`).toBe('string');
      }
    }
  });

  it('has no key that is empty in EVERY language', () => {
    // Not "no empty strings anywhere" — an individual language may
    // legitimately be empty. cov.removeRolePre/Post wrap a bold role name
    // ("Remove **Waiter**?"), and German word order puts the verb last
    // ("**Kellner** entfernen?"), so the German prefix is correctly empty.
    // A key blank in all five, though, is genuinely dead or unfinished.
    for (const k of enKeys) {
      const allBlank = langs.every(l => (STRINGS[l][k] ?? '').trim() === '');
      expect(allBlank, `'${k}' is empty in every language`).toBe(false);
    }
  });

  it('keeps the same {placeholders} across every language', () => {
    // A translation that drops {name} silently renders a sentence with a
    // hole in it; one that invents {naem} renders the literal braces.
    const placeholders = s => (s.match(/\{(\w+)\}/g) || []).sort();
    for (const lang of langs.filter(l => l !== 'en')) {
      for (const k of enKeys) {
        if (!(k in STRINGS[lang])) continue;
        expect(placeholders(STRINGS[lang][k]), `${lang}.${k} placeholders differ from en`)
          .toEqual(placeholders(STRINGS.en[k]));
      }
    }
  });
});

describe('makeT', () => {
  it('returns the translation for the requested language', () => {
    expect(makeT('da')('common.cancel')).toBe(STRINGS.da['common.cancel']);
  });

  it('falls back to English for an unknown language rather than throwing', () => {
    expect(makeT('xx')('common.cancel')).toBe(STRINGS.en['common.cancel']);
  });

  it('returns the key itself for an unknown key rather than undefined', () => {
    expect(makeT('en')('nope.not.a.key')).toBe('nope.not.a.key');
  });

  it('substitutes every occurrence of a placeholder', () => {
    expect(makeT('en')('swap.handover', { name: 'Ann' })).toContain('Ann');
  });

  it('t.n picks the one/other plural form', () => {
    const t = makeT('en');
    expect(t.n('sched.warnings', 1)).toBe(STRINGS.en['sched.warnings.one'].replace('{n}', '1'));
    expect(t.n('sched.warnings', 3)).toBe(STRINGS.en['sched.warnings.other'].replace('{n}', '3'));
  });

  it('every .one plural key has a matching .other (and vice versa)', () => {
    for (const lang of Object.keys(STRINGS)) {
      for (const k of Object.keys(STRINGS[lang])) {
        if (k.endsWith('.one')) expect(STRINGS[lang], `${lang}: ${k} has no .other`).toHaveProperty(k.replace(/\.one$/, '.other'));
        if (k.endsWith('.other')) expect(STRINGS[lang], `${lang}: ${k} has no .one`).toHaveProperty(k.replace(/\.other$/, '.one'));
      }
    }
  });
});

describe('detectLang', () => {
  it('returns a language that actually exists in STRINGS', () => {
    expect(Object.keys(STRINGS)).toContain(detectLang());
  });
});
