// South African personal income tax constants and helpers — the single place
// to update after each Budget. Sources: SARS "Rates of tax for individuals"
// (2027 tax year, updated 25 Feb 2026) and Budget 2026 (RA cap R350k → R430k
// from 1 March 2026).

// Retirement fund contribution deduction (s11F): the lower of the rand cap and
// RA_DEDUCTION_PCT of the greater of remuneration or taxable income. Any excess
// carries forward to later tax years.
export const RA_DEDUCTION_CAP = 430_000;
export const RA_DEDUCTION_PCT = 27.5;

// Capital gains tax for individuals: the first CGT_ANNUAL_EXCLUSION of net
// gains in a tax year is exempt (Budget 2026: R40k → R50k from 2026/27), and
// CGT_INCLUSION_RATE of the rest is added to taxable income.
export const CGT_ANNUAL_EXCLUSION = 50_000;
export const CGT_INCLUSION_RATE = 0.40;

// Tax-free savings account limits (Budget 2026: annual R36k → R46k from
// 1 March 2026; lifetime unchanged). RETIREMENT_CONSTANTS re-exports these.
export const TFSA_ANNUAL_CAP = 46_000;
export const TFSA_LIFETIME_CAP = 500_000;

// The SA tax year ends on the last day of February.
export function taxYearEndIso(todayIso) {
    const [y, m] = String(todayIso).split('-').map(Number);
    const endYear = m >= 3 ? y + 1 : y;
    const leap = (endYear % 4 === 0 && endYear % 100 !== 0) || endYear % 400 === 0;
    return `${endYear}-02-${leap ? '29' : '28'}`;
}

// Whole days from todayIso to the end of its tax year (0 on the last day).
export function daysToTaxYearEnd(todayIso) {
    const end = Date.parse(taxYearEndIso(todayIso) + 'T00:00:00Z');
    const now = Date.parse(String(todayIso) + 'T00:00:00Z');
    return Math.round((end - now) / 86_400_000);
}

// Tax tables per SA tax year label ('2026/27'). Each bracket is
// [upper bound of taxable income, marginal rate]; the primary rebate applies
// to everyone (secondary/tertiary age rebates are not modelled).
export const SA_TAX_TABLES = {
    '2026/27': {
        brackets: [
            [245_100, 0.18],
            [383_100, 0.26],
            [530_200, 0.31],
            [695_800, 0.36],
            [887_000, 0.39],
            [1_878_600, 0.41],
            [Infinity, 0.45],
        ],
        primaryRebate: 17_820,
    },
};
export const LATEST_TAX_YEAR = '2026/27';

// The table for a tax year, falling back to the latest one we have.
export function taxTableFor(taxYear) {
    return SA_TAX_TABLES[taxYear] || SA_TAX_TABLES[LATEST_TAX_YEAR];
}

// Annual income tax on a taxable income, after the primary rebate (never < 0).
export function incomeTax(taxableIncome, taxYear = LATEST_TAX_YEAR) {
    const income = Math.max(0, Number(taxableIncome) || 0);
    const { brackets, primaryRebate } = taxTableFor(taxYear);
    let tax = 0;
    let lower = 0;
    for (const [upper, rate] of brackets) {
        if (income <= lower) break;
        tax += (Math.min(income, upper) - lower) * rate;
        lower = upper;
    }
    return Math.max(0, tax - primaryRebate);
}

// Marginal rate (0–1) at a taxable income.
export function marginalRate(taxableIncome, taxYear = LATEST_TAX_YEAR) {
    const income = Math.max(0, Number(taxableIncome) || 0);
    const { brackets } = taxTableFor(taxYear);
    let lower = 0;
    for (const [upper, rate] of brackets) {
        if (income <= upper && income >= lower) return rate;
        lower = upper;
    }
    return brackets[brackets.length - 1][1];
}

// Deductible limit for one tax year. Without a remuneration figure only the
// rand cap can be applied.
export function raDeductionLimit(remuneration) {
    const rem = Number(remuneration) || 0;
    if (rem <= 0) return RA_DEDUCTION_CAP;
    return Math.min(RA_DEDUCTION_CAP, rem * RA_DEDUCTION_PCT / 100);
}

// Tax saved by deducting `deductible`. With a remuneration figure this is the
// difference between the bracket tax with and without the deduction (so a
// deduction that crosses a bracket is priced correctly); otherwise a flat rate.
export function raRefund({ deductible, remuneration, flatRatePct, taxYear = LATEST_TAX_YEAR }) {
    const d = Math.max(0, Number(deductible) || 0);
    const rem = Number(remuneration) || 0;
    if (rem > 0) return incomeTax(rem, taxYear) - incomeTax(rem - d, taxYear);
    return d * (Number(flatRatePct) || 0) / 100;
}
