// compareDestinations (Budget "Compare where money goes") and the two code
// findings it sits beside: the CGT exclusion constant and dated balances.
import { describe, it, expect } from 'vitest';
import {
    compareDestinations, calculateInvestmentPerformance, CGT_ANNUAL_EXCLUSION,
    parseInvestmentCSV, generateInvestmentCSV, parseRaCSV, generateRaTransactionsCSV,
    parseBudgetCSV, generateBudgetCSV,
} from '../src/calculations.js';

const BASE = {
    amount: 10_000, years: 10, bondRatePct: 11.25,
    discretionaryReturnPct: 10, tfsaReturnPct: 10, raReturnPct: 10, cryptoReturnPct: 0,
    marginalRatePct: 41, retirementTaxPct: 18, tfsaRoom: 21_000, raHeadroom: 187_500, raRefundRatePct: 41,
};
const byKey = (rows) => Object.fromEntries(rows.map(r => [r.key, r]));

describe('compareDestinations', () => {
    it('values each destination after tax', () => {
        const r = byKey(compareDestinations(BASE));
        const g = Math.pow(1.1, 10);
        expect(r.bond.value).toBeCloseTo(10_000 * Math.pow(1 + 11.25 / 1200, 120), 4);
        expect(r.tfsa.value).toBeCloseTo(10_000 * g, 4);
        expect(r.discretionary.value).toBeCloseTo(10_000 + 10_000 * (g - 1) * (1 - 0.4 * 0.41), 4);
        expect(r.ra.value).toBeCloseTo(10_000 * g * 0.82 + 4_100 * g, 4);
        expect(r.crypto.value).toBeCloseTo(10_000, 6);
    });
    it('sorts highest value first and reports an annual after-tax return', () => {
        const rows = compareDestinations(BASE);
        expect(rows.map(r => r.key)).toEqual(['ra', 'bond', 'tfsa', 'discretionary', 'crypto']);
        expect(rows.find(r => r.key === 'tfsa').annualPct).toBeCloseTo(10, 6);
    });
    it('puts only the TFSA room in the TFSA and taxes the rest', () => {
        const r = byKey(compareDestinations({ ...BASE, amount: 30_000 }));
        const g = Math.pow(1.1, 10);
        const rest = 9_000 + 9_000 * (g - 1) * (1 - 0.4 * 0.41);
        expect(r.tfsa.value).toBeCloseTo(21_000 * g + rest, 4);
        expect(r.tfsa.flags[0].text).toBe('Only R 21,000 fits this tax year');
    });
    it('gives no refund above the RA headroom', () => {
        const r = byKey(compareDestinations({ ...BASE, raHeadroom: 0 }));
        expect(r.ra.value).toBeCloseTo(10_000 * Math.pow(1.1, 10) * 0.82, 4);
        expect(r.ra.flags[1].text).toContain('No refund');
    });
    it('omits the bond without a bond rate and returns nothing for no amount', () => {
        expect(compareDestinations({ ...BASE, bondRatePct: null }).some(r => r.key === 'bond')).toBe(false);
        expect(compareDestinations({ ...BASE, amount: 0 })).toEqual([]);
    });
    it('does not tax a loss', () => {
        const r = byKey(compareDestinations({ ...BASE, cryptoReturnPct: -10 }));
        expect(r.crypto.value).toBeCloseTo(10_000 * Math.pow(0.9, 10), 6);
    });
});

describe('CGT annual exclusion (Budget 2026)', () => {
    it('is R 50,000 and drives the CGT estimate', () => {
        expect(CGT_ANNUAL_EXCLUSION).toBe(50_000);
        const perf = calculateInvestmentPerformance(
            [{ date: '2020-01-01', amount: 100_000 }], 200_000, new Date('2026-11-20'), 41);
        expect(perf.taxableGain).toBe(50_000);
        expect(perf.estimatedTax).toBeCloseTo(50_000 * 0.4 * 0.41, 6);
    });
});

describe('dated balances', () => {
    it('round-trips the investment value dates and reads older rows as undated', () => {
        const csv = 'Date,Description,amount,account type,crypto_value\n'
            + 'current_value,Discretionary,2050,2026-11-01\n'
            + 'current_value,TFSA,5100,\n';
        const parsed = parseInvestmentCSV(csv);
        expect(parsed.currentValueDates).toEqual({ Discretionary: '2026-11-01' });
        const out = generateInvestmentCSV({ transactions: [], currentValues: parsed.currentValues, currentValueDates: parsed.currentValueDates });
        expect(out).toContain('current_value,Discretionary,2050,2026-11-01\n');
        expect(out).toContain('current_value,TFSA,5100,\n');
    });
    it('round-trips the RA value date', () => {
        const parsed = parseRaCSV('2026-04-25,monthly,5000\ncurrent_value,RA,620000,2026-11-01\n');
        expect(parsed.currentValueDate).toBe('2026-11-01');
        expect(generateRaTransactionsCSV(parsed.transactions, 620000, '2026-11-01'))
            .toBe('2026-04-25,monthly,5000\ncurrent_value,RA,620000,2026-11-01\n');
        expect(generateRaTransactionsCSV([], 1)).toBe('current_value,RA,1,\n');
    });
    it('round-trips the savings balance date', () => {
        const parsed = parseBudgetCSV('type,description,amount,date\nsavings,,15000,2026-11-18\n');
        expect(parsed.savingsDate).toBe('2026-11-18');
        expect(generateBudgetCSV(parsed)).toBe('type,description,amount,date\nsavings,,15000,2026-11-18\n');
        expect(generateBudgetCSV(parseBudgetCSV('type,description,amount,date\nsavings,,15000,\n')))
            .toBe('type,description,amount,date\nsavings,,15000,\n');
    });
});
