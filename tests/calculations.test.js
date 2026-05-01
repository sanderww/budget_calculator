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
    taxYearLabel,
    parseRaCSV,
    generateRaCSV,
    deriveAssumedFutureMonthly,
    calculateRaProjection,
    calculatePotValueToday,
    RETIREMENT_CONSTANTS,
    fvGrow,
    realValue,
    monthsToAge,
    lumpSumTax,
    raFutureValueTwoPot,
    tfsaFutureValue,
    raCommutationLumpSum,
    raMonthlyIncome,
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

        it('defaults marginalRate to 41 when no param row is present', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'current_value,Discretionary,2050,',
            ].join('\n');
            const r = parseInvestmentCSV(csv);
            expect(r.marginalRate).toBe(41);
        });

        it('parses the marginal_rate param row when present', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'current_value,Discretionary,2050,',
                'param,marginal_rate,36,',
            ].join('\n');
            const r = parseInvestmentCSV(csv);
            expect(r.marginalRate).toBe(36);
        });

        it('does not treat a param row as a transaction', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'param,marginal_rate,36,',
            ].join('\n');
            const r = parseInvestmentCSV(csv);
            expect(r.transactions).toHaveLength(1);
            expect(r.transactions[0].description).toBe('Stock');
        });

        it('emits a marginal_rate param row using data.marginalRate', () => {
            const data = {
                transactions: [],
                currentValues: { Discretionary: 0, TFSA: 0, Crypto: 0 },
                marginalRate: 36,
            };
            const csv = generateInvestmentCSV(data);
            expect(csv).toMatch(/^param,marginal_rate,36,$/m);
        });

        it('defaults to 41 when marginalRate is missing on data', () => {
            const data = {
                transactions: [],
                currentValues: { Discretionary: 0, TFSA: 0, Crypto: 0 },
            };
            const csv = generateInvestmentCSV(data);
            expect(csv).toMatch(/^param,marginal_rate,41,$/m);
        });

        it('round-trips marginalRate through generate -> parse', () => {
            const data = {
                transactions: [{ id: 'x', date: '2025-01-15', description: 'Stock', amount: 2000, type: 'Discretionary', cryptoValue: '' }],
                currentValues: { Discretionary: 2050, TFSA: 0, Crypto: 0 },
                marginalRate: 31,
            };
            const csv = generateInvestmentCSV(data);
            const parsed = parseInvestmentCSV(csv);
            expect(parsed.marginalRate).toBe(31);
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
        expect(typeof fvGrow).toBe('function');
        expect(typeof realValue).toBe('function');
        expect(typeof monthsToAge).toBe('function');
        expect(typeof lumpSumTax).toBe('function');
        expect(typeof raFutureValueTwoPot).toBe('function');
        expect(typeof tfsaFutureValue).toBe('function');
        expect(typeof raCommutationLumpSum).toBe('function');
        expect(typeof raMonthlyIncome).toBe('function');
    });
});

describe('taxYearLabel', () => {
    it('returns YYYY/YY for a March date (start of SA tax year)', () => {
        expect(taxYearLabel(new Date('2026-03-01'))).toBe('2026/27');
    });
    it('returns YYYY/YY for a February date (end of SA tax year)', () => {
        expect(taxYearLabel(new Date('2026-02-28'))).toBe('2025/26');
    });
    it('returns YYYY/YY for a mid-year date', () => {
        expect(taxYearLabel(new Date('2026-08-15'))).toBe('2026/27');
    });
    it('handles century rollover with leading zero', () => {
        expect(taxYearLabel(new Date('2099-12-01'))).toBe('2099/00');
    });
});

describe('parseRaCSV', () => {
    it('parses transactions and params', () => {
        const csv = `2026-03-15,monthly repayment,5000
2026-04-15,monthly repayment,5000
param,tax_refund_rate_pct,41,
param,nominal_return_pct,10,
param,future_years_to_project,10,
param,assumed_future_monthly,6000,
`;
        const result = parseRaCSV(csv);
        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].date).toBe('2026-03-15');
        expect(result.transactions[0].description).toBe('monthly repayment');
        expect(result.transactions[0].amount).toBe(5000);
        expect(result.params.tax_refund_rate_pct).toBe(41);
        expect(result.params.nominal_return_pct).toBe(10);
        expect(result.params.future_years_to_project).toBe(10);
        expect(result.params.assumed_future_monthly).toBe(6000);
    });

    it('returns empty arrays and undefined params for empty input', () => {
        const result = parseRaCSV('');
        expect(result.transactions).toEqual([]);
        expect(result.params).toEqual({});
    });

    it('skips an optional header row', () => {
        const csv = `date,description,amount
2026-03-15,monthly repayment,5000
`;
        const result = parseRaCSV(csv);
        expect(result.transactions).toHaveLength(1);
    });

    it('tolerates blank lines', () => {
        const csv = `2026-03-15,monthly repayment,5000

param,tax_refund_rate_pct,41,
`;
        const result = parseRaCSV(csv);
        expect(result.transactions).toHaveLength(1);
        expect(result.params.tax_refund_rate_pct).toBe(41);
    });
});

describe('generateRaCSV', () => {
    it('round-trips transactions and params', () => {
        const data = {
            transactions: [
                { id: 'a', date: '2026-03-15', description: 'monthly repayment', amount: 5000 },
                { id: 'b', date: '2026-04-15', description: 'monthly repayment', amount: 5000 },
            ],
            params: {
                tax_refund_rate_pct: 41,
                nominal_return_pct: 10,
                future_years_to_project: 10,
            },
        };
        const csv = generateRaCSV(data);
        const parsed = parseRaCSV(csv);
        expect(parsed.transactions).toHaveLength(2);
        expect(parsed.transactions[0].date).toBe('2026-03-15');
        expect(parsed.transactions[0].amount).toBe(5000);
        expect(parsed.params.tax_refund_rate_pct).toBe(41);
        expect(parsed.params.nominal_return_pct).toBe(10);
        expect(parsed.params.future_years_to_project).toBe(10);
    });

    it('omits assumed_future_monthly when not set', () => {
        const csv = generateRaCSV({
            transactions: [],
            params: { tax_refund_rate_pct: 41, nominal_return_pct: 10, future_years_to_project: 10 },
        });
        expect(csv).not.toMatch(/assumed_future_monthly/);
    });

    it('writes assumed_future_monthly when set', () => {
        const csv = generateRaCSV({
            transactions: [],
            params: { tax_refund_rate_pct: 41, nominal_return_pct: 10, future_years_to_project: 10, assumed_future_monthly: 6000 },
        });
        expect(csv).toMatch(/param,assumed_future_monthly,6000,/);
    });
});

describe('deriveAssumedFutureMonthly', () => {
    it('returns 0 when there are no transactions', () => {
        expect(deriveAssumedFutureMonthly([])).toBe(0);
    });

    it('returns the only amount when there is one transaction', () => {
        expect(deriveAssumedFutureMonthly([
            { date: '2026-03-15', amount: 5000 },
        ])).toBe(5000);
    });

    it('averages the most recent up-to-3 transactions', () => {
        const txs = [
            { date: '2026-01-15', amount: 3000 },
            { date: '2026-02-15', amount: 4000 },
            { date: '2026-03-15', amount: 5000 },
            { date: '2026-04-15', amount: 6000 },
        ];
        expect(deriveAssumedFutureMonthly(txs)).toBe(5000);
    });

    it('is order-independent (sorts by date internally)', () => {
        const txs = [
            { date: '2026-04-15', amount: 6000 },
            { date: '2026-01-15', amount: 3000 },
            { date: '2026-03-15', amount: 5000 },
            { date: '2026-02-15', amount: 4000 },
        ];
        expect(deriveAssumedFutureMonthly(txs)).toBe(5000);
    });
});

describe('calculateRaProjection', () => {
    const rate = 41;
    const cap = 350000;

    it('returns empty rows when no transactions and no future projection', () => {
        const today = new Date('2026-04-29');
        const result = calculateRaProjection({
            transactions: [],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 0,
            futureYearsToProject: 0,
        }, today);
        expect(result.rows).toHaveLength(0);
        expect(result.total.contributions).toBe(0);
        expect(result.total.refund).toBe(0);
    });

    it('buckets a past tax year as actual', () => {
        const today = new Date('2026-04-29');  // we are in 2026/27
        const result = calculateRaProjection({
            transactions: [
                { date: '2025-06-15', amount: 10000 },
                { date: '2025-12-15', amount: 10000 },
                { date: '2026-02-15', amount: 10000 },
            ],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 0,
            futureYearsToProject: 0,
        }, today);
        const past = result.rows.find(r => r.taxYear === '2025/26');
        expect(past).toBeTruthy();
        expect(past.status).toBe('actual');
        expect(past.contributions).toBe(30000);
        expect(past.deductible).toBe(30000);
        expect(past.refund).toBe(30000 * 0.41);
        expect(past.capHit).toBe(false);
    });

    it('caps deductible at R350k and flags capHit', () => {
        const today = new Date('2027-04-29');
        const result = calculateRaProjection({
            transactions: [
                { date: '2025-06-15', amount: 400000 },
            ],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 0,
            futureYearsToProject: 0,
        }, today);
        const past = result.rows.find(r => r.taxYear === '2025/26');
        expect(past.contributions).toBe(400000);
        expect(past.deductible).toBe(cap);
        expect(past.refund).toBe(cap * 0.41);
        expect(past.capHit).toBe(true);
    });

    it('mixes actual + projected for the current tax year', () => {
        // Current year: 2026/27 (starts 2026-03-01).
        // Today: 2026-08-15. Months remaining (after Aug → Sep..Feb) = 6.
        // 2 actual contributions of 5000, 6 projected of 5000 → year_total = 10000 + 30000 = 40000
        const today = new Date('2026-08-15');
        const result = calculateRaProjection({
            transactions: [
                { date: '2026-03-15', amount: 5000 },
                { date: '2026-04-15', amount: 5000 },
            ],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 5000,
            futureYearsToProject: 0,
        }, today);
        const cur = result.rows.find(r => r.taxYear === '2026/27');
        expect(cur).toBeTruthy();
        expect(cur.status).toMatch(/^partial/);
        expect(cur.contributions).toBe(40000);
        expect(cur.deductible).toBe(40000);
        expect(cur.refund).toBeCloseTo(40000 * 0.41, 2);
    });

    it('emits projected rows for futureYearsToProject years after current', () => {
        const today = new Date('2026-04-29');
        const result = calculateRaProjection({
            transactions: [],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 5000,
            futureYearsToProject: 3,
        }, today);
        const projected = result.rows.filter(r => r.status === 'projected');
        expect(projected).toHaveLength(3);
        expect(projected.map(r => r.taxYear)).toEqual(['2027/28', '2028/29', '2029/30']);
        projected.forEach(r => {
            expect(r.contributions).toBe(60000);
            expect(r.deductible).toBe(60000);
            expect(r.refund).toBeCloseTo(60000 * 0.41, 2);
        });
    });

    it('sums totals across all rows', () => {
        const today = new Date('2026-04-29');
        const result = calculateRaProjection({
            transactions: [
                { date: '2025-06-15', amount: 10000 },
            ],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 5000,
            futureYearsToProject: 2,
        }, today);
        const sumContribs = result.rows.reduce((s, r) => s + r.contributions, 0);
        const sumRefund   = result.rows.reduce((s, r) => s + r.refund, 0);
        expect(result.total.contributions).toBeCloseTo(sumContribs, 2);
        expect(result.total.refund).toBeCloseTo(sumRefund, 2);
    });

    it('orders rows chronologically', () => {
        const today = new Date('2026-04-29');
        const result = calculateRaProjection({
            transactions: [
                { date: '2024-06-15', amount: 1000 },
                { date: '2025-06-15', amount: 1000 },
                { date: '2026-06-15', amount: 1000 },
            ],
            taxRefundRatePct: rate,
            assumedFutureMonthly: 1000,
            futureYearsToProject: 2,
        }, today);
        const labels = result.rows.map(r => r.taxYear);
        expect(labels).toEqual(['2024/25', '2025/26', '2026/27', '2027/28', '2028/29']);
    });
});

describe('calculatePotValueToday', () => {
    it('returns 0 with no transactions', () => {
        expect(calculatePotValueToday([], 10, new Date('2026-04-29'))).toBe(0);
    });

    it('returns the principal sum when nominal rate is 0', () => {
        const txs = [
            { date: '2025-04-01', amount: 5000 },
            { date: '2026-01-01', amount: 5000 },
        ];
        expect(calculatePotValueToday(txs, 0, new Date('2026-04-29'))).toBe(10000);
    });

    it('compounds at the monthly rate from each contribution', () => {
        // R10,000 made exactly 12 months ago at 12% nominal:
        // (1+r_m)^12 = 1.12, so the value today should be 11200.
        const today = new Date('2026-04-29');
        const oneYearAgo = '2025-04-29';
        const result = calculatePotValueToday(
            [{ date: oneYearAgo, amount: 10000 }],
            12,
            today
        );
        expect(result).toBeCloseTo(11200, 0);
    });

    it('treats future-dated contributions as having grown 0 months', () => {
        const today = new Date('2026-04-29');
        const future = '2027-04-29';
        const result = calculatePotValueToday(
            [{ date: future, amount: 5000 }],
            10,
            today
        );
        expect(result).toBe(5000);
    });
});

describe('fvGrow', () => {
    it('returns pv when rate is 0', () => {
        expect(fvGrow(1000, 0, 120)).toBe(1000);
    });
    it('returns pv when months is 0', () => {
        expect(fvGrow(1000, 10, 0)).toBe(1000);
    });
    it('compounds monthly: 10% over 12 months ≈ 10%', () => {
        expect(fvGrow(1000, 10, 12)).toBeCloseTo(1100, 2);
    });
    it('compounds monthly: 10% over 24 months ≈ 21%', () => {
        expect(fvGrow(1000, 10, 24)).toBeCloseTo(1210, 1);
    });
});

describe('realValue', () => {
    it('returns nominal when cpi is 0', () => {
        expect(realValue(1000, 0, 10)).toBe(1000);
    });
    it('deflates by CPI compounded annually', () => {
        // 1000 / 1.05^10 ≈ 613.91
        expect(realValue(1000, 5, 10)).toBeCloseTo(613.91, 1);
    });
});

describe('monthsToAge', () => {
    it('returns months to a target age from today', () => {
        // DOB 1990-01-15, target age 35 → 2025-01-15. From 2024-01-15 = 12 months.
        expect(monthsToAge('1990-01-15', 35, new Date(2024, 0, 15))).toBe(12);
    });
    it('returns 0 when target is in the past', () => {
        expect(monthsToAge('1990-01-15', 30, new Date(2026, 0, 15))).toBe(0);
    });
    it('returns 0 for invalid dob', () => {
        expect(monthsToAge('', 65, new Date(2026, 0, 1))).toBe(0);
        expect(monthsToAge('not-a-date', 65, new Date(2026, 0, 1))).toBe(0);
    });
});

describe('lumpSumTax', () => {
    it('zero tax under R550k', () => {
        expect(lumpSumTax(500_000)).toBe(0);
        expect(lumpSumTax(550_000)).toBe(0);
    });
    it('18% in the R550k–R770k bracket', () => {
        expect(lumpSumTax(700_000)).toBeCloseTo((700_000 - 550_000) * 0.18, 5);
    });
    it('R39,600 + 27% in the R770k–R1.155m bracket', () => {
        expect(lumpSumTax(1_000_000)).toBeCloseTo(39_600 + (1_000_000 - 770_000) * 0.27, 5);
    });
    it('R143,550 + 36% above R1.155m', () => {
        expect(lumpSumTax(2_000_000)).toBeCloseTo(143_550 + (2_000_000 - 1_155_000) * 0.36, 5);
    });
});

describe('RETIREMENT_CONSTANTS', () => {
    it('exposes the SARS / SA-Budget hardcoded constants', () => {
        expect(RETIREMENT_CONSTANTS.RA_ACCESS_AGE).toBe(55);
        expect(RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP).toBe(46_000);
        expect(RETIREMENT_CONSTANTS.TFSA_LIFETIME_CAP).toBe(500_000);
        expect(RETIREMENT_CONSTANTS.DE_MINIMIS).toBe(360_000);
        expect(RETIREMENT_CONSTANTS.LIVING_ANNUITY_THRESHOLD).toBe(150_000);
    });
});

describe('raFutureValueTwoPot', () => {
    it('grows three components passively when no contributions', () => {
        const r = raFutureValueTwoPot({
            vestedToday: 100_000, savingsToday: 50_000, retirementToday: 100_000,
            annualRatePct: 10, extraMonthly: 0, months: 12,
        });
        expect(r.vested).toBeCloseTo(110_000, 0);
        expect(r.savings).toBeCloseTo(55_000, 0);
        expect(r.retirement).toBeCloseTo(110_000, 0);
        expect(r.total).toBeCloseTo(275_000, 0);
        expect(r.savingsPotWithdrawnGross).toBe(0);
    });

    it('splits new monthly contributions 33/67 into savings/retirement', () => {
        // 12 months, R1000 extra, 0% rate → savings += 1000*0.33*12 = 3960, retirement += 1000*0.67*12 = 8040
        const r = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 0, retirementToday: 0,
            annualRatePct: 0, extraMonthly: 1000, months: 12,
        });
        expect(r.savings).toBeCloseTo(3960, 5);
        expect(r.retirement).toBeCloseTo(8040, 5);
        expect(r.vested).toBe(0);
    });

    it('applies annual savings-pot withdrawals capped at balance', () => {
        const r = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 100_000, retirementToday: 0,
            annualRatePct: 0, extraMonthly: 0, months: 36,
            savingsPotAnnualWithdrawal: 30_000,
        });
        // 100k → after y1 -30k = 70k → after y2 -30k = 40k → after y3 -30k = 10k
        expect(r.savings).toBeCloseTo(10_000, 5);
        expect(r.savingsPotWithdrawnGross).toBeCloseTo(90_000, 5);
    });

    it('caps a too-large withdrawal at the available balance', () => {
        const r = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 5_000, retirementToday: 0,
            annualRatePct: 0, extraMonthly: 0, months: 24,
            savingsPotAnnualWithdrawal: 10_000,
        });
        expect(r.savings).toBeCloseTo(0, 5);
        expect(r.savingsPotWithdrawnGross).toBeCloseTo(5_000, 5);
    });

    it('computes net withdrawn at the configured tax rate', () => {
        const r = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 100_000, retirementToday: 0,
            annualRatePct: 0, extraMonthly: 0, months: 12,
            savingsPotAnnualWithdrawal: 30_000, taxRatePct: 30,
        });
        expect(r.savingsPotWithdrawnGross).toBeCloseTo(30_000, 5);
        expect(r.savingsPotWithdrawnNet).toBeCloseTo(21_000, 5);
        expect(r.savingsPotTaxPaid).toBeCloseTo(9_000, 5);
    });

    it('applies ZAR depreciation to offshore portion of total', () => {
        const baseline = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 0, retirementToday: 100_000,
            annualRatePct: 0, extraMonthly: 0, months: 12,
            offshorePct: 0, zarDeprePct: 2,
        });
        const offshore = raFutureValueTwoPot({
            vestedToday: 0, savingsToday: 0, retirementToday: 100_000,
            annualRatePct: 0, extraMonthly: 0, months: 12,
            offshorePct: 50, zarDeprePct: 2,
        });
        expect(baseline.total).toBeCloseTo(100_000, 5);
        // Half offshore, depreciated 2% over 1 year: 50,000*1.02 + 50,000 = 101,000
        expect(offshore.total).toBeCloseTo(101_000, 5);
    });
});

describe('tfsaFutureValue', () => {
    it('returns simple FV when option disabled', () => {
        const r = tfsaFutureValue({
            currentValue: 100_000, annualRatePct: 10, monthsToRetirement: 12, optEnabled: false,
        });
        expect(r).toBeCloseTo(110_000, 0);
    });

    it('caps annual contributions when option enabled', () => {
        // Today = 2026-03-01 (start of 2026/27 tax year). 12 months to retirement.
        // Plug 46k current-year top-up, FV grown 12 months at 0%.
        const r = tfsaFutureValue({
            currentValue: 0, annualRatePct: 0, monthsToRetirement: 12, optEnabled: true,
            transactions: [],
        }, new Date(2026, 2, 1));
        // Year 1 top-up: 46k contributed at month 0, no further years (only 12 mo horizon = ends 2027-03 which is end of current year exactly).
        expect(r).toBeCloseTo(46_000, 0);
    });

    it('respects R500k lifetime cap', () => {
        // Already contributed full lifetime → no further contributions added.
        const txs = [{ date: '2024-03-01', amount: 500_000 }];
        const r = tfsaFutureValue({
            currentValue: 600_000, annualRatePct: 0, monthsToRetirement: 120,
            optEnabled: true, transactions: txs,
        }, new Date(2026, 2, 1));
        expect(r).toBeCloseTo(600_000, 0);
    });

    it('skips current-year top-up when annual cap already hit', () => {
        const txs = [{ date: '2026-03-15', amount: 46_000 }];
        const r = tfsaFutureValue({
            currentValue: 46_000, annualRatePct: 0, monthsToRetirement: 12,
            optEnabled: true, transactions: txs,
        }, new Date(2026, 5, 1));
        // Current value 46k passive, 12 months 0% → 46k. No additional this-year top-up. Next March (still inside horizon? months=12 from June 2026 → end of horizon is June 2027; tax-year-end is March 2027 = 9 months in). At month 9, full 46k contribution → fv += 46k grown 3 months at 0% = 46k.
        expect(r).toBeCloseTo(92_000, 0);
    });
});

describe('raCommutationLumpSum', () => {
    it('returns zeros when commutation is off', () => {
        const r = raCommutationLumpSum(3_000_000, false);
        expect(r).toEqual({ gross: 0, tax: 0, net: 0 });
    });

    it('takes 1/3 and applies the lump-sum tax table', () => {
        // pot 3m → gross = 1m → tax = 39_600 + (1m - 770k)*0.27 = 39_600 + 62_100 = 101_700
        const r = raCommutationLumpSum(3_000_000, true);
        expect(r.gross).toBeCloseTo(1_000_000, 5);
        expect(r.tax).toBeCloseTo(101_700, 5);
        expect(r.net).toBeCloseTo(898_300, 5);
    });

    it('zero tax under R550k commutation', () => {
        // pot 1.5m → gross 500k → no tax
        const r = raCommutationLumpSum(1_500_000, true);
        expect(r.tax).toBe(0);
        expect(r.net).toBeCloseTo(500_000, 5);
    });
});

describe('raMonthlyIncome', () => {
    it('flags fullCommutation when pot is below R360k de minimis', () => {
        const r = raMonthlyIncome(300_000, 4, 18, true);
        expect(r.fullCommutation).toBe(true);
        expect(r.gross).toBe(0);
        expect(r.net).toBe(0);
    });

    it('annuitises 2/3 when commutation is on', () => {
        // pot 3m → annuitised 2m → 4% / 12 = 6,666.67
        const r = raMonthlyIncome(3_000_000, 4, 0, true);
        expect(r.gross).toBeCloseTo(6_666.67, 1);
        expect(r.net).toBeCloseTo(6_666.67, 1);
    });

    it('annuitises full pot when commutation is off', () => {
        const r = raMonthlyIncome(3_000_000, 4, 0, false);
        expect(r.gross).toBeCloseTo(10_000, 1);
    });

    it('applies tax rate to net', () => {
        const r = raMonthlyIncome(3_000_000, 4, 25, true);
        expect(r.gross).toBeCloseTo(6_666.67, 1);
        expect(r.net).toBeCloseTo(5_000, 1);
    });
});
