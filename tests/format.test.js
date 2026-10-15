import { describe, it, expect } from 'vitest';
import { fmtZAR, fmtZARWhole, fmtZARSigned, fmtZARAxis, fmtNum, parseAmount, fmtAmountInput } from '../src/lib/format.js';

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

describe('parseAmount', () => {
    const table = [
        ['45000', 45000],
        ['45,000', 45000],
        ['45000.5', 45000.5],
        ['R 45,000.50', 45000.5],
        ['r45000', 45000],
        ['45k', 45000],
        ['45K', 45000],
        ['1.2m', 1200000],
        ['1.1k', 1100],
        ['1,234,567.89', 1234567.89],
        ['-500', -500],
        ['-R 500', -500],
        ['.5', 0.5],
        ['  400 000 ', 400000],
        ['', null],
        ['   ', null],
        ['abc', null],
        ['1,2', null],
        ['1,23,456', null],
        ['12abc', null],
        ['k', null],
        ['1.2.3', null],
        [null, null],
        [undefined, null],
    ];
    it.each(table)('parseAmount(%j) -> %j', (input, expected) => {
        expect(parseAmount(input)).toBe(expected);
    });
    it('passes finite numbers through', () => {
        expect(parseAmount(12.5)).toBe(12.5);
        expect(parseAmount(NaN)).toBe(null);
    });
});

describe('fmtAmountInput', () => {
    it('groups and keeps up to two decimals', () => {
        expect(fmtAmountInput(400000)).toBe('400,000');
        expect(fmtAmountInput('45000.5')).toBe('45,000.5');
        expect(fmtAmountInput(45000.567)).toBe('45,000.57');
    });
    it('shows empty for blank or non-numeric', () => {
        expect(fmtAmountInput('')).toBe('');
        expect(fmtAmountInput(null)).toBe('');
        expect(fmtAmountInput('abc')).toBe('');
    });
});
