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
