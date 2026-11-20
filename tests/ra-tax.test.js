// SA income tax helpers (calc/sa-tax.js) and the RA tax summary (calc/ra.js).
import { describe, it, expect } from 'vitest';
import {
    incomeTax, marginalRate, raDeductionLimit, raRefund, RA_DEDUCTION_CAP,
    calculateRaTaxSummary, typicalMonthlyContribution, remainingContributionMonths,
    calculateRaProjection, RETIREMENT_CONSTANTS,
} from '../src/calculations.js';

// Sample-shaped contributions (not real data): R50k lump, then R20k a month.
const TX = [
    { date: '2026-05-07', amount: 50000 },
    { date: '2026-06-04', amount: 20000 },
    { date: '2026-07-01', amount: 20000 },
    { date: '2026-08-03', amount: 20000 },
    { date: '2026-09-02', amount: 20000 },
    { date: '2026-10-02', amount: 20000 },
    { date: '2026-11-04', amount: 20000 },
];

describe('incomeTax (2026/27 tables)', () => {
    it.each([
        [0, 0],
        [99_000, 0],                       // under the rebate threshold
        [245_100, 44_118 - 17_820],
        [887_000, 259_783 - 17_820],
        [1_440_000, 259_783 + 0.41 * 553_000 - 17_820],
        [2_000_000, 666_339 + 0.45 * 121_400 - 17_820],
    ])('taxable R%d → R%d', (income, tax) => {
        expect(incomeTax(income)).toBeCloseTo(tax, 2);
    });

    it('matches the SARS base amounts at every bracket edge', () => {
        expect(incomeTax(383_100) + 17_820).toBeCloseTo(79_998, 2);
        expect(incomeTax(530_200) + 17_820).toBeCloseTo(125_599, 2);
        expect(incomeTax(695_800) + 17_820).toBeCloseTo(185_215, 2);
        expect(incomeTax(1_878_600) + 17_820).toBeCloseTo(666_339, 2);
    });

    it('gives the marginal rate', () => {
        expect(marginalRate(1_210_000)).toBe(0.41);
        expect(marginalRate(800_000)).toBe(0.39);
        expect(marginalRate(3_000_000)).toBe(0.45);
    });
});

describe('raDeductionLimit', () => {
    it('is 27.5% of remuneration below the cap', () => {
        expect(raDeductionLimit(1_440_000)).toBeCloseTo(396_000, 6);
    });
    it('is the R430k cap at high incomes', () => {
        expect(raDeductionLimit(2_000_000)).toBe(430_000);
    });
    it('falls back to the cap when remuneration is unknown', () => {
        expect(raDeductionLimit(0)).toBe(RA_DEDUCTION_CAP);
        expect(raDeductionLimit(undefined)).toBe(RA_DEDUCTION_CAP);
    });
    it('is the single cap the retirement module uses too', () => {
        expect(RETIREMENT_CONSTANTS.RA_DEDUCTION_CAP).toBe(RA_DEDUCTION_CAP);
    });
});

describe('raRefund', () => {
    it('uses brackets when remuneration is known', () => {
        expect(raRefund({ deductible: 230_000, remuneration: 1_440_000 })).toBeCloseTo(94_300, 2);
    });
    it('prices a deduction that crosses into a lower bracket', () => {
        // R900k: R13k at 41%, the rest at 39%.
        expect(raRefund({ deductible: 100_000, remuneration: 900_000 }))
            .toBeCloseTo(13_000 * 0.41 + 87_000 * 0.39, 2);
    });
    it('uses the flat rate without remuneration', () => {
        expect(raRefund({ deductible: 170_000, flatRatePct: 41 })).toBeCloseTo(69_700, 6);
    });
});

describe('typicalMonthlyContribution / remainingContributionMonths', () => {
    it('takes the median of the last three, ignoring an old lump sum', () => {
        expect(typicalMonthlyContribution(TX)).toBe(20000);
        expect(typicalMonthlyContribution([
            { date: '2026-05-07', amount: 50000 },
            { date: '2026-06-04', amount: 20000 },
        ])).toBe(35000);
        expect(typicalMonthlyContribution([])).toBe(0);
    });
    it('counts months left to February, plus this month when not yet paid', () => {
        expect(remainingContributionMonths(TX, '2026-11-04')).toBe(3);
        expect(remainingContributionMonths(TX.slice(0, 6), '2026-11-01')).toBe(4);
        expect(remainingContributionMonths([{ date: '2027-02-02', amount: 1 }], '2027-02-20')).toBe(0);
        expect(remainingContributionMonths([], '2027-02-20')).toBe(1);
        expect(remainingContributionMonths([], '2026-03-01')).toBe(12);
    });
});

describe('calculateRaTaxSummary', () => {
    it('with remuneration: 27.5% limit, bracket refund, projection and headroom', () => {
        const s = calculateRaTaxSummary({ transactions: TX, remuneration: 1_440_000, refundRatePct: 41 }, '2026-11-04');
        expect(s.taxYear).toBe('2026/27');
        expect(s.limit).toBeCloseTo(396_000, 6);
        expect(s.limitSource).toBe('percentage');
        expect(s.actual).toBe(170_000);
        expect(s.monthsRemaining).toBe(3);
        expect(s.projected).toBe(230_000);
        expect(s.refundToDate).toBeCloseTo(69_700, 2);
        expect(s.refundProjected).toBeCloseTo(94_300, 2);
        expect(s.headroom).toBeCloseTo(166_000, 6);
        expect(s.headroomRefund).toBeCloseTo(68_060, 2);
        expect(s.refundAllYears).toBeCloseTo(69_700, 2);
        expect(s.overLimitYears).toEqual([]);
    });

    it('without remuneration: cap only and the flat rate', () => {
        const s = calculateRaTaxSummary({ transactions: TX, refundRatePct: 41 }, '2026-11-04');
        expect(s.limit).toBe(430_000);
        expect(s.usesBrackets).toBe(false);
        expect(s.refundToDate).toBeCloseTo(69_700, 6);
        expect(s.refundProjected).toBeCloseTo(94_300, 6);
    });

    it('caps the deductible at the 27.5% limit and flags the year', () => {
        const big = [{ date: '2026-03-10', amount: 300_000 }];
        const s = calculateRaTaxSummary({ transactions: big, remuneration: 800_000 }, '2027-02-27');
        expect(s.limit).toBeCloseTo(220_000, 6);
        expect(s.deductibleToDate).toBeCloseTo(220_000, 6);
        expect(s.monthsRemaining).toBe(0);           // a lone lump sum is not repeated
        expect(s.excessProjected).toBeCloseTo(80_000, 6);
        expect(s.overLimitYears).toEqual(['2026/27']);
    });

    it('stops projecting when contributions have lapsed', () => {
        const s = calculateRaTaxSummary({ transactions: TX, remuneration: 1_440_000 }, '2027-02-20');
        expect(s.monthsRemaining).toBe(0);
        expect(s.projected).toBe(170_000);
    });

    it('projects nothing for a tax year with no contributions yet', () => {
        const s = calculateRaTaxSummary({ transactions: TX, remuneration: 1_440_000 }, '2027-03-05');
        expect(s.actual).toBe(0);
        expect(s.projected).toBe(0);
        expect(s.refundProjected).toBe(0);
        expect(s.refundAllYears).toBeCloseTo(69_700, 2);
    });
});

describe('calculateRaProjection with remuneration', () => {
    it('applies the 27.5% limit and bracket refund per tax year', () => {
        const { rows } = calculateRaProjection({
            transactions: [{ date: '2026-04-01', amount: 500_000 }],
            taxRefundRatePct: 41, assumedFutureMonthly: 0, futureYearsToProject: 0,
            remuneration: 1_440_000,
        }, new Date('2026-11-04T00:00:00Z'));
        expect(rows[0].deductible).toBeCloseTo(396_000, 6);
        expect(rows[0].capHit).toBe(true);
        expect(rows[0].refund).toBeCloseTo(396_000 * 0.41, 2);
    });
});
