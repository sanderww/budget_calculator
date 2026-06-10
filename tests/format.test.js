import { describe, it, expect } from 'vitest';
import { fmtZAR, fmtZARWhole, fmtZARSigned, fmtZARAxis } from '../src/format.js';

// Expectations are built from toLocaleString so the tests are robust to the
// ICU grouping character; what they lock down is the wrapper logic
// (prefix, rounding, sign handling, fallback-to-zero).
const grouped = (n, dp = 0) =>
    n.toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });

describe('fmtZAR (two decimals)', () => {
    it('formats a number', () => expect(fmtZAR(1234.5)).toBe(`R ${grouped(1234.5, 2)}`));
    it('accepts numeric strings', () => expect(fmtZAR('99.9')).toBe(`R ${grouped(99.9, 2)}`));
    it('falls back to zero for garbage', () => expect(fmtZAR('abc')).toBe(`R ${grouped(0, 2)}`));
    it('falls back to zero for empty', () => expect(fmtZAR('')).toBe(`R ${grouped(0, 2)}`));
});

describe('fmtZARWhole (rounded rand)', () => {
    it('rounds to whole rand', () => expect(fmtZARWhole(1234.6)).toBe(`R ${grouped(1235)}`));
    it('keeps the native minus inside the number', () =>
        expect(fmtZARWhole(-1234.6)).toBe(`R ${grouped(-1235)}`));
    it('falls back to zero', () => expect(fmtZARWhole(undefined)).toBe(`R ${grouped(0)}`));
});

describe('fmtZARSigned (leading minus)', () => {
    it('positive has no sign', () => expect(fmtZARSigned(1234.6)).toBe(`R ${grouped(1235)}`));
    it('negative puts the minus before the R', () =>
        expect(fmtZARSigned(-1234.6)).toBe(`-R ${grouped(1235)}`));
});

describe('fmtZARAxis (chart axes, space-grouped)', () => {
    it('normalises group separators to plain spaces', () =>
        expect(fmtZARAxis(1234567)).toBe('R ' + grouped(1234567).replace(/,/g, ' ')));
    it('falls back to zero', () => expect(fmtZARAxis(null)).toBe('R ' + grouped(0)));
});
