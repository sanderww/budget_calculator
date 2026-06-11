// RA (Retirement Annuity) tab: tax-year projections, pot value, and RA CSV parse/generate.

import { generateRecordId as _generateId } from './util.js';

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

export function parseRaCSV(text) {
    const rows = (text || '').split('\n').map(r => r.trim()).filter(r => r !== '');
    const transactions = [];
    const params = {};
    let currentValue;
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
    return { transactions, params, currentValue };
}

export function generateRaTransactionsCSV(transactions, currentValue) {
    let csv = '';
    (transactions || []).forEach(t => {
        csv += `${t.date},${t.description},${t.amount}\n`;
    });
    if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        const v = Number(currentValue);
        if (!Number.isNaN(v)) csv += `current_value,RA,${v},\n`;
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

const RA_ANNUAL_CAP = 430000;

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
}, today = new Date()) {
    const rate = (Number(taxRefundRatePct) || 0) / 100;
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
        const deductible = Math.min(contributions, RA_ANNUAL_CAP);
        rows.push({
            taxYear: label,
            status,
            contributions,
            deductible,
            refund: deductible * rate,
            capHit: contributions > RA_ANNUAL_CAP,
        });
    });

    const currentStartYear = parseInt(currentLabel.split('/')[0], 10);
    for (let i = 1; i <= future; i++) {
        const startYear = currentStartYear + i;
        const label = `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
        const contributions = monthly * 12;
        const deductible = Math.min(contributions, RA_ANNUAL_CAP);
        rows.push({
            taxYear: label,
            status: 'projected',
            contributions,
            deductible,
            refund: deductible * rate,
            capHit: contributions > RA_ANNUAL_CAP,
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
