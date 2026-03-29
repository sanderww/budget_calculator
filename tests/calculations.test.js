import { describe, it, expect } from 'vitest';
import {
    getUpcoming25th,
    calculateBudgetSummary,
    calculateMonthlyAllocation,
    calculateInvestmentPerformance,
    monthlyInterestFactor,
    simulateDebt,
    calculateDebtResults,
    xirr,
    parseBudgetCSV,
    generateBudgetCSV,
    parseInvestmentCSV,
    generateInvestmentCSV,
    parseDebtCSV,
    generateDebtCSV,
} from '../calculations.js';

describe('getUpcoming25th', () => {
    it('returns the 25th of the current month when today is before the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 10))).toBe('2026-03-25');
    });

    it('returns the 25th of the next month when today is after the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 26))).toBe('2026-04-25');
    });

    it('returns the 25th of the same month when today is exactly the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 25))).toBe('2026-03-25');
    });

    it('handles year rollover correctly', () => {
        expect(getUpcoming25th(new Date(2026, 11, 26))).toBe('2027-01-25');
    });
});

describe('calculateBudgetSummary', () => {
    it('calculates current net amount correctly', () => {
        const result = calculateBudgetSummary(
            10000,
            [{ amount: 2000 }, { amount: 1500 }],
            [{ amount: 500 }],
            [],
            null,
            new Date(2026, 0, 1)
        );
        expect(result.totalDebts).toBe(3500);
        expect(result.totalProvisions).toBe(500);
        expect(result.currentNetAmount).toBe(6000);
        expect(result.futureNetAmount).toBe(6000);
        expect(result.monthlySavingsTarget).toBe(0);
    });

    it('filters future costs by date', () => {
        const futureDate = new Date(2026, 5, 15);
        const futureCosts = [
            { amount: 300, date: '2026-04-01' },
            { amount: 200, date: '2026-07-01' },
        ];
        const result = calculateBudgetSummary(5000, [], [], futureCosts, futureDate, new Date(2026, 0, 1));
        expect(result.relevantFutureCosts).toBe(300);
        expect(result.futureNetAmount).toBe(4700);
    });

    it('sets monthlySavingsTarget when futureNetAmount is negative', () => {
        const today = new Date(2026, 0, 1);
        const futureDate = new Date(2026, 6, 1);
        const result = calculateBudgetSummary(
            1000,
            [{ amount: 2000 }],
            [],
            [{ amount: 500, date: '2026-03-01' }],
            futureDate,
            today
        );
        expect(result.futureNetAmount).toBeLessThan(0);
        expect(result.monthlySavingsTarget).toBeCloseTo(1500 / 7, 1);
    });

    it('sets monthlySavingsTarget when both net amounts positive but future is less', () => {
        const today = new Date(2026, 0, 1);
        const futureDate = new Date(2026, 6, 1);
        const result = calculateBudgetSummary(
            5000, [], [],
            [{ amount: 500, date: '2026-03-01' }],
            futureDate,
            today
        );
        expect(result.currentNetAmount).toBe(5000);
        expect(result.futureNetAmount).toBe(4500);
        expect(result.monthlySavingsTarget).toBeCloseTo(500 / 7, 1);
    });

    it('returns zero monthlySavingsTarget with no future date', () => {
        const result = calculateBudgetSummary(5000, [], [], [], null, new Date(2026, 0, 1));
        expect(result.monthlySavingsTarget).toBe(0);
    });

    it('handles empty arrays and zero savings', () => {
        const result = calculateBudgetSummary(0, [], [], [], null, new Date(2026, 0, 1));
        expect(result.totalDebts).toBe(0);
        expect(result.totalProvisions).toBe(0);
        expect(result.currentNetAmount).toBe(0);
    });
});

describe('smoke', () => {
    it('imports all functions', () => {
        expect(typeof getUpcoming25th).toBe('function');
        expect(typeof calculateBudgetSummary).toBe('function');
        expect(typeof calculateMonthlyAllocation).toBe('function');
        expect(typeof calculateInvestmentPerformance).toBe('function');
        expect(typeof monthlyInterestFactor).toBe('function');
        expect(typeof simulateDebt).toBe('function');
        expect(typeof calculateDebtResults).toBe('function');
        expect(typeof xirr).toBe('function');
        expect(typeof parseBudgetCSV).toBe('function');
        expect(typeof generateBudgetCSV).toBe('function');
        expect(typeof parseInvestmentCSV).toBe('function');
        expect(typeof generateInvestmentCSV).toBe('function');
        expect(typeof parseDebtCSV).toBe('function');
        expect(typeof generateDebtCSV).toBe('function');
    });
});
