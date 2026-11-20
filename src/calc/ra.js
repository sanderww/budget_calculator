// RA (Retirement Annuity) tab: tax-year projections, pot value, and RA CSV parse/generate.

import { generateRecordId as _generateId, csvText } from './util.js';
import { RA_DEDUCTION_CAP, raDeductionLimit, raRefund } from './sa-tax.js';

// ============================================================================
// RA (Retirement Annuity) Tab
// ============================================================================

export function taxYearLabel(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const startYear = m >= 3 ? y : y - 1;
    const endYY = String((startYear + 1) % 100).padStart(2, '0');
    return `${startYear}/${endYY}`;
}

// SA tax year of an ISO date (YYYY-MM-DD), e.g. '2026-03-01' → '2026/27'.
// The tax year runs 1 March to the end of February. Reads the string itself,
// so the result never shifts with the time zone. '' for a missing or invalid
// date. Groups the RA contributions ledger (UX-4.4).
export function saTaxYear(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof isoDate === 'string' ? isoDate : '');
    if (!m) return '';
    const y = +m[1];
    const month = +m[2];
    const day = +m[3];
    const d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return '';
    const startYear = month >= 3 ? y : y - 1;
    return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function parseRaCSV(text) {
    const rows = (text || '').split('\n').map(r => r.trim()).filter(r => r !== '');
    const transactions = [];
    const params = {};
    let currentValue;
    let currentValueDate;
    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'param') {
            const v = parseFloat(cols[2]);
            if (!Number.isNaN(v)) params[cols[1]] = v;
            return;
        }
        if (cols[0] === 'current_value' && cols[1] === 'RA') {
            const v = parseFloat(cols[2]);
            if (!Number.isNaN(v)) currentValue = v;
            // 4th column: ISO date the value was entered (blank in older files).
            currentValueDate = /^\d{4}-\d{2}-\d{2}$/.test(cols[3] || '') ? cols[3] : undefined;
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cols[0])) return;
        const amount = parseFloat(cols[2]);
        if (Number.isNaN(amount)) return;
        transactions.push({
            id: _generateId(),
            date: cols[0],
            description: cols[1] || '',
            amount,
        });
    });
    return { transactions, params, currentValue, currentValueDate };
}

export function generateRaTransactionsCSV(transactions, currentValue, currentValueDate) {
    let csv = '';
    (transactions || []).forEach(t => {
        csv += `${t.date},${csvText(t.description)},${t.amount}\n`;
    });
    if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        const v = Number(currentValue);
        if (!Number.isNaN(v)) csv += `current_value,RA,${v},${currentValueDate || ''}\n`;
    }
    return csv;
}

export function deriveAssumedFutureMonthly(transactions) {
    if (!transactions || transactions.length === 0) return 0;
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-3);
    const sum = recent.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return sum / recent.length;
}

function _isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function _taxYearEndDate(label) {
    const startYear = parseInt(label.split('/')[0], 10);
    return new Date(Date.UTC(startYear + 1, 1, _isLeapYear(startYear + 1) ? 29 : 28));
}

function _monthsBetween(fromDate, toDate) {
    if (toDate <= fromDate) return 0;
    const months = (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12
                 + (toDate.getUTCMonth() - fromDate.getUTCMonth());
    return Math.max(0, months);
}

export function calculateRaProjection({
    transactions,
    taxRefundRatePct,
    assumedFutureMonthly,
    futureYearsToProject,
    remuneration = 0,
}, today = new Date()) {
    const limit = raDeductionLimit(remuneration);
    const refundOf = (deductible, taxYear) =>
        raRefund({ deductible, remuneration, flatRatePct: taxRefundRatePct, taxYear });
    const future = Math.max(0, Math.floor(Number(futureYearsToProject) || 0));
    const monthly = Math.max(0, Number(assumedFutureMonthly) || 0);

    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const currentLabel = taxYearLabel(todayUTC);

    const buckets = new Map();
    (transactions || []).forEach(t => {
        const d = new Date(t.date + 'T00:00:00Z');
        if (Number.isNaN(d.getTime())) return;
        const label = taxYearLabel(d);
        const prev = buckets.get(label) || { actual: 0, count: 0 };
        prev.actual += Number(t.amount) || 0;
        prev.count += 1;
        buckets.set(label, prev);
    });

    const observedLabels = [...buckets.keys()];
    if (!observedLabels.includes(currentLabel)) observedLabels.push(currentLabel);
    observedLabels.sort();

    const rows = [];
    observedLabels.forEach(label => {
        const bucket = buckets.get(label) || { actual: 0, count: 0 };
        let contributions = bucket.actual;
        let status = 'actual';
        if (label === currentLabel) {
            const monthsRemaining = _monthsBetween(todayUTC, _taxYearEndDate(label));
            const projectedPart = monthly * monthsRemaining;
            contributions = bucket.actual + projectedPart;
            status = monthsRemaining > 0
                ? `partial (${bucket.count} actual + ${monthsRemaining} projected)`
                : 'actual';
            if (bucket.count === 0 && projectedPart === 0) {
                return; // skip empty current-year row
            }
        }
        const deductible = Math.min(contributions, limit);
        rows.push({
            taxYear: label,
            status,
            contributions,
            deductible,
            refund: refundOf(deductible, label),
            capHit: contributions > limit,
        });
    });

    const currentStartYear = parseInt(currentLabel.split('/')[0], 10);
    for (let i = 1; i <= future; i++) {
        const startYear = currentStartYear + i;
        const label = `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
        const contributions = monthly * 12;
        const deductible = Math.min(contributions, limit);
        rows.push({
            taxYear: label,
            status: 'projected',
            contributions,
            deductible,
            refund: refundOf(deductible, label),
            capHit: contributions > limit,
        });
    }

    rows.sort((a, b) => a.taxYear.localeCompare(b.taxYear));

    const total = rows.reduce((acc, r) => ({
        contributions: acc.contributions + r.contributions,
        refund: acc.refund + r.refund,
    }), { contributions: 0, refund: 0 });

    return { rows, total };
}

export function calculatePotValueToday(transactions, nominalReturnPct, today = new Date()) {
    if (!transactions || transactions.length === 0) return 0;
    const r = Number(nominalReturnPct) || 0;
    const r_m = Math.pow(1 + r / 100, 1 / 12) - 1;
    const todayY = today.getUTCFullYear();
    const todayM = today.getUTCMonth();
    return transactions.reduce((sum, t) => {
        const d = new Date(t.date + 'T00:00:00Z');
        if (Number.isNaN(d.getTime())) return sum;
        const months = Math.max(0, (todayY - d.getUTCFullYear()) * 12 + (todayM - d.getUTCMonth()));
        return sum + (Number(t.amount) || 0) * Math.pow(1 + r_m, months);
    }, 0);
}

// Typical monthly contribution: the median of the three most recent
// contributions, so a one-off lump sum among them does not skew it.
export function typicalMonthlyContribution(transactions) {
    const amounts = [...(transactions || [])]
        .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-3)
        .map(t => Number(t.amount) || 0)
        .sort((a, b) => a - b);
    if (amounts.length === 0) return 0;
    const mid = Math.floor(amounts.length / 2);
    return amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
}

// Monthly contributions still to come in the tax year of `todayIso`: the
// months after this one up to February, plus this month when no contribution
// is dated in it yet.
export function remainingContributionMonths(transactions, todayIso) {
    const label = saTaxYear(todayIso);
    if (!label) return 0;
    const [y, m] = todayIso.split('-').map(Number);
    const endYear = parseInt(label.split('/')[0], 10) + 1;
    const after = (endYear * 12 + 2) - (y * 12 + m);
    const thisMonth = todayIso.slice(0, 7);
    const paidThisMonth = (transactions || []).some(t => String(t.date).startsWith(thisMonth));
    return Math.max(0, after) + (paidThisMonth ? 0 : 1);
}

// Everything the RA Summary shows about tax: the deduction limit, the refund
// on contributions to date, the projected full-year refund (assuming the
// typical monthly contribution continues to the end of February), headroom
// left under the limit, and the refund earned across all tax years so far.
// remuneration: annual gross remuneration; 0 = unknown (rand cap and the flat
// refund rate only).
export function calculateRaTaxSummary({ transactions, remuneration = 0, refundRatePct = 0 }, todayIso) {
    const list = transactions || [];
    const currentYear = saTaxYear(todayIso);
    const rem = Number(remuneration) || 0;
    const limit = raDeductionLimit(rem);
    const limitSource = rem > 0 && limit < RA_DEDUCTION_CAP ? 'percentage' : 'cap';
    const refundOf = (deductible, taxYear) =>
        raRefund({ deductible, remuneration: rem, flatRatePct: refundRatePct, taxYear });

    const yearTotals = new Map();
    list.forEach(t => {
        const label = saTaxYear(t.date);
        if (!label) return;
        yearTotals.set(label, (yearTotals.get(label) || 0) + (Number(t.amount) || 0));
    });

    const actual = yearTotals.get(currentYear) || 0;
    // Project only a regular debit order: at least three contributions, the
    // latest within the last two months. A one-off lump sum is not repeated.
    const dated = list.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.date <= todayIso)
        .sort((a, b) => a.date.localeCompare(b.date));
    const last = dated.at(-1);
    const daysSinceLast = last
        ? (Date.parse(todayIso + 'T00:00:00Z') - Date.parse(last.date + 'T00:00:00Z')) / 86_400_000
        : Infinity;
    const regular = actual > 0 && dated.length >= 3 && daysSinceLast <= 62;
    const monthly = regular ? typicalMonthlyContribution(dated) : 0;
    const monthsRemaining = monthly > 0 ? remainingContributionMonths(list, todayIso) : 0;
    const projected = actual + monthly * monthsRemaining;

    const deductibleToDate = Math.min(actual, limit);
    const deductibleProjected = Math.min(projected, limit);
    const refundToDate = refundOf(deductibleToDate, currentYear);
    const refundProjected = refundOf(deductibleProjected, currentYear);
    const headroom = Math.max(0, limit - projected);
    const headroomRefund = refundOf(deductibleProjected + headroom, currentYear) - refundProjected;

    let refundAllYears = 0;
    const overLimitYears = [];
    [...yearTotals.entries()].sort().forEach(([label, total]) => {
        refundAllYears += refundOf(Math.min(total, limit), label);
        if (total > limit) overLimitYears.push(label);
    });

    return {
        taxYear: currentYear,
        limit,
        limitSource,
        usesBrackets: rem > 0,
        actual,
        monthly,
        monthsRemaining,
        projected,
        deductibleToDate,
        deductibleProjected,
        refundToDate,
        refundProjected,
        excessProjected: Math.max(0, projected - limit),
        headroom,
        headroomRefund,
        refundAllYears,
        overLimitYears,
    };
}
