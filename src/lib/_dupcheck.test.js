// TEMPORARY SCRATCH FILE — safe to delete.
//
// Created to reproduce a drag-and-drop duplication bug. The sandbox I work in
// can't delete files in this folder (same restriction that left a stray
// .git/index.lock earlier today), so it's neutered rather than removed. The
// real regression tests for that bug live in schedule.test.js, where they
// belong.
//
//   rm src/lib/_dupcheck.test.js
//
import { describe, it, expect } from 'vitest';

describe('scratch file (safe to delete — see schedule.test.js)', () => {
  it('is a no-op placeholder', () => {
    expect(true).toBe(true);
  });
});
