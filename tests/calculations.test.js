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
} from '../src/calculations.js';

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

describe('calculateMonthlyAllocation', () => {
    it('splits available money into buckets correctly', () => {
        const result = calculateMonthlyAllocation(10000, 2000, 30, 20, 10);
        expect(result.remainingMoney).toBe(8000);
        expect(result.mortgageAmount).toBe(2400);
        expect(result.eftAmount).toBe(1600);
        expect(result.cryptoAmount).toBe(800);
        expect(result.totalAllocated).toBe(6800);
        expect(result.leftover).toBe(3200);
    });

    it('passes the full amount through when savings target is zero', () => {
        const result = calculateMonthlyAllocation(5000, 0, 50, 0, 0);
        expect(result.remainingMoney).toBe(5000);
        expect(result.mortgageAmount).toBe(2500);
        expect(result.eftAmount).toBe(0);
        expect(result.cryptoAmount).toBe(0);
    });

    it('returns zero leftover when percentages sum to 100', () => {
        const result = calculateMonthlyAllocation(10000, 0, 40, 40, 20);
        expect(result.leftover).toBeCloseTo(0, 5);
    });

    it('correctly handles fractional percentages', () => {
        const result = calculateMonthlyAllocation(1000, 0, 33.33, 33.33, 33.34);
        expect(result.totalAllocated).toBeCloseTo(1000, 2);
    });
});

describe('calculateInvestmentPerformance', () => {
    it('returns zero/null result when no transactions', () => {
        const result = calculateInvestmentPerformance([], 0, new Date(2026, 0, 1));
        expect(result.totalInvested).toBe(0);
        expect(result.absoluteReturn).toBe(0);
        expect(result.percentageReturn).toBe(0);
        expect(result.annualizedReturn).toBeNull();
    });

    it('calculates absolute return and percentage return', () => {
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 12000, new Date(2026, 0, 1));
        expect(result.totalInvested).toBe(10000);
        expect(result.absoluteReturn).toBe(2000);
        expect(result.percentageReturn).toBeCloseTo(20, 5);
    });

    it('calculates savings comparison at 6% compound per transaction', () => {
        const txDate = new Date('2024-01-01'); // match implementation's new Date(t.date)
        const today = new Date(2026, 0, 1);
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 12000, today);
        const ageInDays = (today - txDate) / (1000 * 60 * 60 * 24);
        const expectedGain = 10000 * (Math.pow(1.06, ageInDays / 365.25) - 1);
        expect(result.savingsGain).toBeCloseTo(expectedGain, 2);
        expect(result.netVsSavings).toBeCloseTo(result.absoluteReturn - expectedGain, 2);
    });

    it('returns null for annualizedReturn when ratio is zero', () => {
        const txs = [{ amount: 10000, date: '2023-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 0, new Date(2026, 0, 1));
        expect(result.annualizedReturn).toBeNull();
    });

    it('returns null for annualizedReturn when yearsHeld <= 0.1', () => {
        const txs = [{ amount: 10000, date: '2026-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 10500, new Date(2026, 0, 6));
        expect(result.annualizedReturn).toBeNull();
    });

    it('computes annualizedReturn correctly for a known input', () => {
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'TFSA' }];
        const today = new Date(2026, 0, 1);
        const result = calculateInvestmentPerformance(txs, 12000, today);
        const ageInDays = (today - new Date(2024, 0, 1)) / (1000 * 60 * 60 * 24);
        const yearsHeld = ageInDays / 365.25;
        const expectedAnn = (Math.pow(1.2, 1 / yearsHeld) - 1) * 100;
        expect(result.annualizedReturn).toBeCloseTo(expectedAnn, 1);
    });

    it('sums totalCryptoValue from cryptoValue fields', () => {
        const txs = [
            { amount: 5000, date: '2024-01-01', type: 'Crypto', cryptoValue: '0.5' },
            { amount: 3000, date: '2024-06-01', type: 'Crypto', cryptoValue: '0.25' },
        ];
        const result = calculateInvestmentPerformance(txs, 9000, new Date(2026, 0, 1));
        expect(result.totalCryptoValue).toBeCloseTo(0.75, 5);
    });

    it('returns zero estimatedTax when marginalRate is omitted', () => {
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
        const r = calculateInvestmentPerformance(txs, 110000, new Date('2026-04-25'));
        expect(r.estimatedTax).toBe(0);
        expect(r.taxableGain).toBe(0);
        expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
    });

    it('returns zero estimatedTax when gain is below the R40k annual exclusion', () => {
        const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
        const r = calculateInvestmentPerformance(txs, 130000, new Date('2026-04-25'), 41);
        // gain = 30,000 < 40,000 exclusion
        expect(r.taxableGain).toBe(0);
        expect(r.estimatedTax).toBe(0);
        expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
    });

    it('calculates estimatedTax using 40% inclusion rate above the R40k exclusion', () => {
        const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
        const r = calculateInvestmentPerformance(txs, 200000, new Date('2026-04-25'), 41);
        // gain = 100,000; taxable = 60,000; included = 24,000; tax = 24,000 * 0.41 = 9,840
        expect(r.taxableGain).toBe(60000);
        expect(r.estimatedTax).toBeCloseTo(9840, 6);
        expect(r.netVsSavingsAfterTax).toBeCloseTo(r.netVsSavings - 9840, 6);
    });

    it('returns zero estimatedTax when there is a loss', () => {
        const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
        const r = calculateInvestmentPerformance(txs, 80000, new Date('2026-04-25'), 41);
        expect(r.taxableGain).toBe(0);
        expect(r.estimatedTax).toBe(0);
        expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
    });

    it('returns zero estimatedTax when totalInvested is 0', () => {
        const r = calculateInvestmentPerformance([], 0, new Date('2026-04-25'), 41);
        expect(r.taxableGain).toBe(0);
        expect(r.estimatedTax).toBe(0);
        expect(r.netVsSavingsAfterTax).toBe(0);
    });
});

describe('monthlyInterestFactor', () => {
    const annualRate = 0.12;
    const dailyRate = annualRate / 365;

    it('uses 28 days for February in a non-leap year (2025)', () => {
        const factor = monthlyInterestFactor(dailyRate, 2025, 1);
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 28) - 1, 10);
    });

    it('uses 29 days for February in a leap year (2024)', () => {
        const factor = monthlyInterestFactor(dailyRate, 2024, 1);
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 29) - 1, 10);
    });

    it('uses 31 days for January', () => {
        const factor = monthlyInterestFactor(dailyRate, 2026, 0);
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 31) - 1, 10);
    });

    it('uses 30 days for April', () => {
        const factor = monthlyInterestFactor(dailyRate, 2026, 3);
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 30) - 1, 10);
    });

    it('returns 0 when dailyRate is 0', () => {
        expect(monthlyInterestFactor(0, 2026, 0)).toBe(0);
    });
});

describe('simulateDebt', () => {
    it('pays off a zero-interest loan in exactly the right number of months', () => {
        const result = simulateDebt(
            100000,
            new Date(2026, 0, 1),
            10000, // effectiveRepayment
            0,     // serviceFee
            0,     // dailyRate
            [],
            false
        );
        expect(result.months).toBe(10);
        expect(result.totalInterest).toBeCloseTo(0, 5);
        expect(result.totalFees).toBe(0);
    });

    it('accumulates service fees at rate of one fee per month', () => {
        const result = simulateDebt(100000, new Date(2026, 0, 1), 10000, 100, 0, [], false);
        expect(result.totalFees).toBe(result.months * 100);
    });

    it('applies extra repayments only in the matching month, reducing total months', () => {
        // R10000 extra in month 3 cuts a full month: 3 months (80k→60k) + 6 months (60k→0) = 9 vs 10
        const repayments = [{ date: '2026-03-15', amount: 10000 }];
        const withExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, true);
        const withoutExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, false);
        expect(withExtras.months).toBe(9);
        expect(withoutExtras.months).toBe(10);
    });

    it('does not apply extras when withExtras is false', () => {
        const repayments = [{ date: '2026-03-15', amount: 50000 }];
        const withExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, false);
        const noExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, [], false);
        expect(withExtras.months).toBe(noExtras.months);
    });

    it('stops when balance drops below 10', () => {
        const result = simulateDebt(50, new Date(2026, 0, 1), 100, 0, 0, [], false);
        expect(result.months).toBe(1);
    });
});

describe('calculateDebtResults', () => {
    it('returns zero moneySaved and diffMonths with no extras and no interest', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 10000,
            serviceFee: 0,
            interestRate: 0,
            nextPaymentDateStr: '2026-02-01',
            repayments: [],
        });
        expect(result.moneySaved).toBeCloseTo(0, 2);
        expect(result.diffMonths).toBe(0);
        expect(result.totalExtra).toBe(0);
    });

    it('reports positive moneySaved when extra repayments reduce interest paid', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 5000,
            serviceFee: 0,
            interestRate: 12,
            nextPaymentDateStr: '2026-02-01',
            repayments: [{ date: '2026-02-15', amount: 10000 }],
        });
        expect(result.moneySaved).toBeGreaterThan(0);
        expect(result.diffMonths).toBeGreaterThan(0);
        expect(result.totalExtra).toBe(10000);
    });

    it('returns baseline and actual simulation objects', () => {
        const result = calculateDebtResults({
            currentPrincipal: 50000,
            totalRepayment: 4000,
            serviceFee: 0,
            interestRate: 10,
            nextPaymentDateStr: '2026-02-01',
            repayments: [],
        });
        expect(result.baseline).toBeDefined();
        expect(result.actual).toBeDefined();
        expect(typeof result.baseline.months).toBe('number');
        expect(typeof result.baseline.endDate).toBe('object');
    });

    it('moneySaved equals difference in total costs between baseline and actual', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 5000,
            serviceFee: 100,
            interestRate: 12,
            nextPaymentDateStr: '2026-02-01',
            repayments: [{ date: '2026-03-15', amount: 20000 }],
        });
        const baselineCost = result.baseline.totalInterest + result.baseline.totalFees;
        const actualCost = result.actual.totalInterest + result.actual.totalFees;
        expect(result.moneySaved).toBeCloseTo(baselineCost - actualCost, 5);
    });
});

describe('xirr', () => {
    it('converges to ~10% for a simple 1-year investment', () => {
        const cashFlows = [
            { amount: -10000, date: new Date(2025, 0, 1) },
            { amount: 11000,  date: new Date(2026, 0, 1) },
        ];
        expect(xirr(cashFlows)).toBeCloseTo(0.10, 2);
    });

    it('converges to ~9.54% for a 2-year 20% total return', () => {
        const cashFlows = [
            { amount: -10000, date: new Date(2024, 0, 1) },
            { amount: 12000,  date: new Date(2026, 0, 1) },
        ];
        // (1.2)^(1/2) - 1 ≈ 0.0954
        expect(xirr(cashFlows)).toBeCloseTo(0.0954, 2);
    });

    it('accepts a custom initial guess', () => {
        const cashFlows = [
            { amount: -10000, date: new Date(2025, 0, 1) },
            { amount: 11000,  date: new Date(2026, 0, 1) },
        ];
        expect(xirr(cashFlows, 0.5)).toBeCloseTo(0.10, 2);
    });
});

describe('CSV round-trips', () => {
    describe('budget', () => {
        it('round-trips budget data without data loss', () => {
            const data = {
                savings: 15000,
                debts: [{ id: 'x1', description: 'Car loan', amount: 3000, date: '' }],
                provisions: [{ id: 'x2', description: 'Holiday', amount: 2000, date: '2026-12-01' }],
                futureCosts: [{ id: 'x3', description: 'Laptop', amount: 1500, date: '2026-06-01' }],
            };
            const csv = generateBudgetCSV(data);
            const parsed = parseBudgetCSV(csv);
            expect(parsed.savings).toBe(15000);
            expect(parsed.debts).toHaveLength(1);
            expect(parsed.debts[0].description).toBe('Car loan');
            expect(parsed.debts[0].amount).toBe(3000);
            expect(parsed.provisions[0].date).toBe('2026-12-01');
            expect(parsed.futureCosts[0].amount).toBe(1500);
        });

        it('handles items with no date', () => {
            const csv = 'type,description,amount,date\ndebt,Test debt,500,\n';
            const parsed = parseBudgetCSV(csv);
            expect(parsed.debts).toHaveLength(1);
            expect(parsed.debts[0].amount).toBe(500);
        });

        it('skips unknown row types silently', () => {
            const csv = 'type,description,amount,date\nunknown,foo,100,\nsavings,,5000,\n';
            const parsed = parseBudgetCSV(csv);
            expect(parsed.savings).toBe(5000);
            expect(parsed.debts).toHaveLength(0);
        });
    });

    describe('investments', () => {
        it('round-trips investment transactions and current values', () => {
            const data = {
                transactions: [{
                    id: 'x1', date: '2024-06-15', description: 'Buy ETF',
                    amount: 5000, type: 'TFSA', cryptoValue: ''
                }],
                currentValues: { Discretionary: 1000, TFSA: 6500, Crypto: 0 },
            };
            const csv = generateInvestmentCSV(data);
            const parsed = parseInvestmentCSV(csv);
            expect(parsed.transactions).toHaveLength(1);
            expect(parsed.transactions[0].description).toBe('Buy ETF');
            expect(parsed.transactions[0].amount).toBe(5000);
            expect(parsed.transactions[0].type).toBe('TFSA');
            expect(parsed.transactions[0].date).toBe('2024-06-15');
            expect(parsed.currentValues.TFSA).toBe(6500);
            expect(parsed.currentValues.Discretionary).toBe(1000);
        });

        it('converts DD-MM-YYYY dates to YYYY-MM-DD on parse', () => {
            const csv = 'Date,Description,amount,account type,crypto_value\n15-06-2024,Buy,5000,TFSA,\n';
            const parsed = parseInvestmentCSV(csv);
            expect(parsed.transactions[0].date).toBe('2024-06-15');
        });
    });

    describe('debt', () => {
        it('round-trips debt repayments and params', () => {
            const repayments = [{ id: 'x1', date: '2026-02-15', description: 'Bonus', amount: 5000 }];
            const params = {
                principal: '500000', current_balance: '450000', repayment: '4500',
                service_fee: '69', interest_rate: '11.25', next_payment: '2026-02-25',
                loan_start: '2020-01-01', original_term: '240',
            };
            const csv = generateDebtCSV(repayments, params);
            const parsed = parseDebtCSV(csv);
            expect(parsed.params.principal).toBe('500000');
            expect(parsed.params.interest_rate).toBe('11.25');
            expect(parsed.params.original_term).toBe('240');
            expect(parsed.repayments).toHaveLength(1);
            expect(parsed.repayments[0].amount).toBe(5000);
            expect(parsed.repayments[0].description).toBe('Bonus');
        });

        it('handles empty repayments list', () => {
            const csv = generateDebtCSV([], { principal: '100000', current_balance: '', repayment: '', service_fee: '', interest_rate: '', next_payment: '', loan_start: '', original_term: '' });
            const parsed = parseDebtCSV(csv);
            expect(parsed.repayments).toHaveLength(0);
            expect(parsed.params.principal).toBe('100000');
        });
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
