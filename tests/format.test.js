import { describe, it, expect } from 'vitest';
import { fmtZAR, fmtZARWhole, fmtZARSigned, fmtZARAxis, fmtNum } from '../src/lib/format.js';

// The notation itself is the requirement: comma thousands separator, dot
// decimal — "R 3,000.50" is three thousand rand and fifty cents. These
// expectations are literals on purpose so a locale change can't drift them.

describe('fmtZAR (two decimals)', () => {
    it('uses comma groups and a dot decimal', () => expect(fmtZAR(3000.5)).toBe('R 3,000.50'));
    it('formats a number', () => expect(fmtZAR(1234.5)).toBe('R 1,234.50'));
    it('groups millions', () => expect(fmtZAR(1234567.891)).toBe('R 1,234,567.89'));
    it('accepts numeric strings', () => expect(fmtZAR('99.9')).toBe('R 99.90'));
    it('falls back to zero for garbage', () => expect(fmtZAR('abc')).toBe('R 0.00'));
    it('falls back to zero for empty', () => expect(fmtZAR('')).toBe('R 0.00'));
});

describe('fmtZARWhole (rounded rand)', () => {
    it('rounds to whole rand', () => expect(fmtZARWhole(1234.6)).toBe('R 1,235'));
    it('keeps the native minus inside the number', () =>
        expect(fmtZARWhole(-1234.6)).toBe('R -1,235'));
    it('falls back to zero', () => expect(fmtZARWhole(undefined)).toBe('R 0'));
});

describe('fmtZARSigned (leading minus)', () => {
    it('positive has no sign', () => expect(fmtZARSigned(1234.6)).toBe('R 1,235'));
    it('negative puts the minus before the R', () =>
        expect(fmtZARSigned(-1234.6)).toBe('-R 1,235'));
});

describe('fmtZARAxis (chart axes)', () => {
    it('uses the same comma grouping as the rest of the app', () =>
        expect(fmtZARAxis(1234567)).toBe('R 1,234,567'));
    it('falls back to zero', () => expect(fmtZARAxis(null)).toBe('R 0'));
});

describe('fmtNum (bare grouped number)', () => {
    it('groups without a currency prefix', () => expect(fmtNum(40000)).toBe('40,000'));
    it('honours a decimal count', () => expect(fmtNum(3000.5, 2)).toBe('3,000.50'));
    it('falls back to zero', () => expect(fmtNum(undefined)).toBe('0'));
});
