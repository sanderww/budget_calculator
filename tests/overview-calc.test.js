// Pure Overview helpers: balance sheet, mix lenses, insights, next steps,
// savings rate, retirement levers, plus the tax-year helpers they use.
import { describe, it, expect } from 'vitest';
import {
    buildBalanceSheet, groupHoldings, withDrift, mixInsights, buildNextSteps,
    tfsaUsage, savingsRate, retirementIncome, retirementLevers, valueAgeDays,
    fmtShortDate, taxYearEndIso, daysToTaxYearEnd,
} from '../src/calculations.js';

const SHEET_INPUT = {
    provisions: 85_000, includeProvisions: true,
    discretionary: 310_000, tfsa: 240_000, crypto: 95_000,
    investmentDates: { Discretionary: '2026-11-01', TFSA: '2026-11-01', Crypto: '2026-09-07' },
    ra: 620_000, raDate: '2026-11-01',
    homeValue: 2_000_000, bondBalance: 1_150_000,
};

describe('tax-year helpers', () => {
    it('ends the tax year on the last day of February', () => {
        expect(taxYearEndIso('2026-11-20')).toBe('2027-02-28');
        expect(taxYearEndIso('2027-02-28')).toBe('2027-02-28');
        expect(taxYearEndIso('2027-03-01')).toBe('2028-02-29');
    });
    it('counts whole days to the end of the tax year', () => {
        expect(daysToTaxYearEnd('2026-11-20')).toBe(100);
        expect(daysToTaxYearEnd('2027-02-28')).toBe(0);
    });
});

describe('dates', () => {
    it('ages a value in days and returns null when the date is unknown', () => {
        expect(valueAgeDays('2026-09-07', '2026-11-20')).toBe(74);
        expect(valueAgeDays(undefined, '2026-11-20')).toBeNull();
    });
    it('formats a short date', () => {
        expect(fmtShortDate('2027-03-15')).toBe('15 Mar 2027');
        expect(fmtShortDate(Date.UTC(2027, 2, 15))).toBe('15 Mar 2027');
    });
});

describe('buildBalanceSheet', () => {
    it('sums assets and liabilities into net worth', () => {
        const s = buildBalanceSheet(SHEET_INPUT);
        expect(s.assets).toBe(3_350_000);
        expect(s.owed).toBe(1_150_000);
        expect(s.netWorth).toBe(2_200_000);
        expect(s.holdings.map(h => h.key)).toEqual(['provisions', 'discretionary', 'tfsa', 'crypto', 'ra', 'home']);
    });
    it('counts provisions only when asked and never Budget savings or debts', () => {
        const s = buildBalanceSheet({ ...SHEET_INPUT, includeProvisions: false, cash: 50_000, budgetDebts: 12_000 });
        expect(s.holdings.some(h => h.key === 'provisions' || h.key === 'cash')).toBe(false);
        expect(s.liabilities.map(l => l.key)).toEqual(['bond']);
        expect(s.netWorth).toBe(2_200_000 - 85_000);
        expect(buildBalanceSheet(SHEET_INPUT).holdings[0]).toMatchObject({ label: 'Provisions', undated: true });
    });
    it('leaves the home out without a home value and still subtracts the bond', () => {
        const s = buildBalanceSheet({ ...SHEET_INPUT, homeValue: 0 });
        expect(s.holdings.some(h => h.key === 'home')).toBe(false);
        expect(s.netWorth).toBe(1_350_000 - 1_150_000);
    });
});

describe('groupHoldings', () => {
    const sheet = buildBalanceSheet(SHEET_INPUT);
    it('groups by asset type with home equity = home − bond', () => {
        const { rows, total } = groupHoldings(sheet, 'type');
        const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
        expect(by).toEqual({ cash: 85_000, funds: 550_000, ra: 620_000, crypto: 95_000, home: 850_000 });
        expect(total).toBe(2_200_000);
        expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 6);
    });
    it('drops the home when includeHome is off', () => {
        const { rows, total } = groupHoldings(sheet, 'type', { includeHome: false });
        expect(rows.some(r => r.key === 'home')).toBe(false);
        expect(total).toBe(1_350_000);
    });
    it('splits the RA into savings pot and age-55 money, net of the vested part', () => {
        const { rows } = groupHoldings(sheet, 'access', { includeHome: false, raVested: 20_000 });
        const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
        expect(by.pot).toBeCloseTo(600_000 * 0.33, 6);
        expect(by.age55).toBeCloseTo(620_000 - 600_000 * 0.33, 6);
        expect(by.days).toBe(490_000);
        expect(by.tfsa).toBe(240_000);
    });
    it('uses the offshore % for Discretionary and TFSA in the currency lens', () => {
        const { rows } = groupHoldings(sheet, 'currency', {
            includeHome: false, offshoreDiscretionaryPct: 30, offshoreTfsaPct: 20,
        });
        const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
        expect(by.offshore).toBeCloseTo(93_000 + 48_000, 6);
        expect(by.usd).toBe(95_000);
        expect(by.zar).toBeCloseTo(1_350_000 - 141_000 - 95_000, 6);
    });
});

describe('withDrift and mixInsights', () => {
    const sheet = buildBalanceSheet(SHEET_INPUT);
    const { rows, total } = groupHoldings(sheet, 'type', { includeHome: false });
    it('adds target and drift only where a target is set', () => {
        const d = withDrift(rows, { crypto: 5, ra: '' });
        const crypto = d.find(r => r.key === 'crypto');
        expect(crypto.target).toBe(5);
        expect(crypto.drift).toBeCloseTo(95_000 / 1_350_000 * 100 - 5, 6);
        expect(d.find(r => r.key === 'ra').drift).toBeNull();
    });
    it('calls out a drift of 2 points or more with the rand amount', () => {
        const d = withDrift(rows, { crypto: 5 });
        const lines = mixInsights({ lens: 'type', rows: d, total, includeHome: false, hasHome: true });
        expect(lines.some(l => l.includes('over your 5% target') && l.includes('R 27,500'))).toBe(true);
    });
    it('reports reachable and locked money in the access lens', () => {
        const a = groupHoldings(sheet, 'access', { includeHome: false });
        const lines = mixInsights({ lens: 'access', rows: a.rows, total: a.total, raAccessYear: 2045 });
        expect(lines[0]).toContain('R 730,000');
        expect(lines[1]).toContain('(2045)');
    });
});

describe('buildNextSteps', () => {
    const base = {
        todayIso: '2026-11-20',
        runway: { belowBuffer: true, lowest: { value: 4200, x: Date.UTC(2027, 2, 15) }, buffer: 10_000, bufferMonthlySavings: 7950, plannedMonthly: 6500 },
        raTax: { taxYear: '2026/27', limit: 247_500, projected: 60_000, headroom: 187_500, headroomRefund: 76_875 },
        tfsa: { thisYear: 25_000, lifetime: 195_000 },
        discretionaryGain: 60_000,
        marginalRatePct: 41,
        pastDue: [{ description: 'Car service', date: '2026-11-02' }],
        values: [
            { label: 'Crypto', value: 95_000, asOf: '2026-09-07', tab: 'investment' },
            { label: 'TFSA', value: 240_000, asOf: '2026-11-01', tab: 'investment' },
        ],
    };
    it('ranks act-now first, then deadlines, tax ideas and tidy-ups', () => {
        const steps = buildNextSteps(base);
        expect(steps.map(s => s.id)).toEqual(['runway-buffer', 'ra-headroom', 'tfsa-room', 'cgt-harvest', 'past-due', 'stale-values']);
    });
    it('prices the buffer raise, the RA refund, the TFSA room and the CGT saving', () => {
        const by = Object.fromEntries(buildNextSteps(base).map(s => [s.id, s]));
        expect(by['runway-buffer'].body).toContain('R 1,450 more per month');
        expect(by['ra-headroom'].title).toBe('RA: R 10,000 more before 28 Feb returns about R 4,100');
        expect(by['tfsa-room'].title).toContain('R 21,000');
        expect(by['cgt-harvest'].body).toContain('R 50,000');
        expect(by['cgt-harvest'].body).toContain('R 8,200');
        expect(by['stale-values'].title).toBe('Update Crypto');
        expect(by['stale-values'].body).toContain('74 days old');
    });
    it('holds tax-year deadlines back until 120 days before the year ends', () => {
        const ids = buildNextSteps({ ...base, todayIso: '2026-06-01' }).map(s => s.id);
        expect(ids).not.toContain('ra-headroom');
        expect(ids).not.toContain('tfsa-room');
        expect(ids).not.toContain('cgt-harvest');
    });
    it('treats an undated balance as stale, skips empty ones and provisions', () => {
        const steps = buildNextSteps({ todayIso: '2026-11-20', values: [
            { label: 'RA', value: 1, tab: 'ra' }, { label: 'Crypto', value: 0, tab: 'investment' },
            { label: 'Provisions', value: 40_000, tab: 'budget', undated: true },
        ] });
        expect(steps).toHaveLength(1);
        expect(steps[0].body).toContain('RA (date unknown)');
    });
    it('returns nothing when all is well', () => {
        expect(buildNextSteps({ todayIso: '2026-11-20' })).toEqual([]);
    });
});

describe('tfsaUsage and savingsRate', () => {
    it('splits TFSA contributions into this tax year and lifetime', () => {
        const u = tfsaUsage([
            { date: '2026-02-20', amount: 10_000 },
            { date: '2026-03-01', amount: 5_000 },
            { date: '2026-11-01', amount: 20_000 },
        ], '2026-11-20');
        expect(u).toEqual({ thisYear: 25_000, lifetime: 35_000 });
    });
    it('sums the last 12 months of saving against remuneration', () => {
        const r = savingsRate({
            investmentTransactions: [{ date: '2026-01-10', amount: 100_000 }, { date: '2025-10-01', amount: 999 }],
            raTransactions: [{ date: '2026-05-25', amount: 60_000 }],
            extraRepayments: [{ date: '2026-07-01', amount: 56_000 }],
            remuneration: 900_000,
        }, '2026-11-20');
        expect(r.saved).toBe(216_000);
        expect(r.rate).toBeCloseTo(24, 6);
        expect(savingsRate({ remuneration: 0 }, '2026-11-20').rate).toBeNull();
    });
});

describe('retirement helpers', () => {
    it('adds RA drawdown and lump-sum drawdown', () => {
        expect(retirementIncome({ monthly: { atRetirement: { net: 30_000 }, lumpSumDrawdown: 18_200 } })).toBe(48_200);
        expect(retirementIncome(null)).toBe(0);
    });
    it('offers retiring later, more RA, and TFSA top-ups when not already on', () => {
        const levers = retirementLevers({ retirement_age: 65, life_expectancy: 95, opt_ra_monthly_enabled: 1, opt_ra_monthly_amount: 2000, opt_tfsa_enabled: 0 });
        expect(levers.map(l => l.id)).toEqual(['later', 'ra-extra', 'tfsa-max']);
        expect(levers[0].overrides).toEqual({ retirement_age: 67 });
        expect(levers[1].overrides).toEqual({ opt_ra_monthly_enabled: 1, opt_ra_monthly_amount: 5000 });
        expect(retirementLevers({ retirement_age: 65, opt_tfsa_enabled: 1 }).map(l => l.id)).toEqual(['later', 'ra-extra']);
    });
});
