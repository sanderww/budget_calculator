import { describe, it, expect } from 'vitest';
import { parseQuickAddTokens, todayISO } from '../src/lib/quick-add.js';

const BUDGET = { keywords: { debt: 'debt', provision: 'provision' } };
const INVEST = {
    keywords: { tfsa: 'TFSA', crypto: 'Crypto', btc: 'Crypto', disc: 'Discretionary', discretionary: 'Discretionary' },
    units: ['btc'],
};
const tok = (over = {}) => ({ empty: false, keyword: null, description: '', amount: null, date: '', units: {}, ...over });

describe('parseQuickAddTokens', () => {
    it.each([
        ['car service 6.5k mar 2027', tok({ description: 'Car service', amount: 6500, date: '2027-03-01' })],
        ['credit card 12000 debt', tok({ keyword: 'debt', description: 'Credit card', amount: 12000 })],
        ['DEBT store account 1,250.50', tok({ keyword: 'debt', description: 'Store account', amount: 1250.5 })],
        ['2027 budget review 5k', tok({ description: '2027 budget review', amount: 5000 })],
        ['bike 2026 3000', tok({ description: 'Bike 2026', amount: 3000 })],
        ['car 2000', tok({ description: 'Car', amount: 2000 })],
        ['Provision holiday R 20,000 dec 2026', tok({ keyword: 'provision', description: 'Holiday', amount: 20000, date: '2026-12-01' })],
        ['new geyser 20000 January 2034', tok({ description: 'New geyser', amount: 20000, date: '2034-01-01' })],
        ['medical 3k 2027-02-30', tok({ description: 'Medical 2027-02-30', amount: 3000 })],
        ['rates 1500 300', tok({ description: 'Rates 300', amount: 1500 })],
        ['debts are bad 500', tok({ description: 'Debts are bad', amount: 500 })],
    ])('splits %j with the budget keywords', (text, expected) => {
        expect(parseQuickAddTokens(text, BUDGET)).toEqual(expected);
    });

    it('keeps the date on every keyword (callers decide what to drop)', () => {
        expect(parseQuickAddTokens('car loan 50k debt 2027-01-01', BUDGET))
            .toEqual(tok({ keyword: 'debt', description: 'Car loan', amount: 50000, date: '2027-01-01' }));
    });

    it('flags empty input, including non-strings', () => {
        expect(parseQuickAddTokens('   ', BUDGET)).toEqual(tok({ empty: true }));
        expect(parseQuickAddTokens(undefined, BUDGET)).toEqual(tok({ empty: true }));
    });

    it('treats no keyword map as plain text', () => {
        expect(parseQuickAddTokens('debt 500')).toEqual(tok({ description: 'Debt', amount: 500 }));
    });

    it('reads a number followed by a unit word into units, not the amount', () => {
        expect(parseQuickAddTokens('0.012 btc 5000 luno', INVEST))
            .toEqual(tok({ description: 'Luno', amount: 5000, units: { btc: 0.012 } }));
        expect(parseQuickAddTokens('crypto 0.5 BTC 2k', INVEST))
            .toEqual(tok({ keyword: 'Crypto', description: '', amount: 2000, units: { btc: 0.5 } }));
    });

    it('still reads a bare unit word as a keyword', () => {
        expect(parseQuickAddTokens('btc buy 3k', INVEST))
            .toEqual(tok({ keyword: 'Crypto', description: 'Buy', amount: 3000 }));
    });

    it('fills a default date only when none was typed', () => {
        const opts = { ...BUDGET, defaultDate: () => '2026-10-15' };
        expect(parseQuickAddTokens('bonus 5k', opts).date).toBe('2026-10-15');
        expect(parseQuickAddTokens('bonus 5k 2026-01-02', opts).date).toBe('2026-01-02');
        expect(parseQuickAddTokens('bonus 5k', { defaultDate: '2025-05-05' }).date).toBe('2025-05-05');
        expect(parseQuickAddTokens('', opts)).toEqual(tok({ empty: true }));
    });
});

describe('todayISO', () => {
    it('formats the local date as YYYY-MM-DD', () => {
        expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
        expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
