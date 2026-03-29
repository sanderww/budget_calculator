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
