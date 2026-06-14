// Investments tab: performance metrics and investment CSV parse/generate.

import { generateRecordId as _generateId, xirr } from './util.js';

export function calculateInvestmentPerformance(transactions, currentValue, today = new Date(), marginalRate = 0) {
    const totalInvested = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalCryptoValue = transactions.reduce((sum, t) => sum + (parseFloat(t.cryptoValue) || 0), 0);

    if (totalInvested === 0) {
        return { totalInvested: 0, totalCryptoValue: 0, absoluteReturn: 0, percentageReturn: 0, savingsGain: 0, netVsSavings: 0, taxableGain: 0, estimatedTax: 0, netVsSavingsAfterTax: 0, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const absoluteReturn = currentValue - totalInvested;
    const percentageReturn = (absoluteReturn / totalInvested) * 100;

    let savingsGain = 0;
    let weightedAgeSum = 0;
    let validTxCount = 0;

    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        if (amount > 0 && t.date) {
            const txDate = new Date(t.date);
            const ageInDays = (today - txDate) / (1000 * 60 * 60 * 24);
            if (ageInDays > 0) {
                savingsGain += amount * (Math.pow(1.06, ageInDays / 365.25) - 1);
                weightedAgeSum += amount * ageInDays;
                validTxCount++;
            }
        }
    });

    const netVsSavings = absoluteReturn - savingsGain;

    const ANNUAL_EXCLUSION = 40000;
    const INCLUSION_RATE = 0.40;
    const rate = parseFloat(marginalRate) || 0;
    const taxableGain = (absoluteReturn > 0 && rate > 0) ? Math.max(0, absoluteReturn - ANNUAL_EXCLUSION) : 0;
    const estimatedTax = taxableGain * INCLUSION_RATE * (rate / 100);
    const netVsSavingsAfterTax = netVsSavings - estimatedTax;

    if (validTxCount === 0 || weightedAgeSum === 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const averageAgeDays = weightedAgeSum / totalInvested;
    const yearsHeld = averageAgeDays / 365.25;

    // Don't annualize very short holding periods — annualizing a few weeks'
    // gain produces meaningless extremes (e.g. a 5% gain over 5 days → ~3600%).
    if (yearsHeld <= 0.1) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    // Build cash flows for XIRR
    const cashFlows = [];
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        if (amount > 0 && t.date) {
            cashFlows.push({ amount: -amount, date: new Date(t.date) });
        }
    });

    if (cashFlows.length > 0 && currentValue > 0) {
        cashFlows.push({ amount: currentValue, date: today });
        cashFlows.sort((a, b) => a.date - b.date);
    }

    let annualizedReturn = null;
    if (cashFlows.length >= 2 && currentValue > 0) {
        try {
            const rate = xirr(cashFlows);
            if (!isNaN(rate) && Number.isFinite(rate)) {
                annualizedReturn = rate * 100;
            }
        } catch (e) {
            // Ignore and let fallback handle it
        }
    }

    // Fallback to simple annualized return if XIRR calculation is not available/failed
    if (annualizedReturn === null) {
        const ratio = currentValue / totalInvested;
        if (ratio > 0) {
            annualizedReturn = (Math.pow(ratio, 1 / yearsHeld) - 1) * 100;
        }
    }

    return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn };
}

export function parseInvestmentCSV(text) {
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const contentRows = rows.slice(1);
    const transactions = [];
    const currentValues = { Discretionary: 0, TFSA: 0, Crypto: 0 };
    let marginalRate = 41;

    contentRows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'current_value') {
            const type = cols[1];
            const amount = parseFloat(cols[2]) || 0;
            if (Object.prototype.hasOwnProperty.call(currentValues, type)) {
                currentValues[type] = amount;
            }
        } else if (cols[0] === 'param') {
            if (cols[1] === 'marginal_rate') {
                const v = parseFloat(cols[2]);
                if (!Number.isNaN(v)) marginalRate = v;
            }
        } else {
            let dateStr = cols[0];
            if (dateStr && dateStr.includes('-') && dateStr.split('-')[0].length === 2) {
                const [dd, mm, yyyy] = dateStr.split('-');
                dateStr = `${yyyy}-${mm}-${dd}`;
            }
            transactions.push({
                id: _generateId(),
                date: dateStr,
                description: cols[1],
                amount: parseFloat(cols[2]) || 0,
                type: cols[3],
                cryptoValue: cols[4] || '',
            });
        }
    });
    return { transactions, currentValues, marginalRate };
}

export function generateInvestmentCSV(data) {
    let csv = 'Date,Description,amount,account type,crypto_value\n';
    data.transactions.forEach(t => {
        let dateStr = t.date;
        if (dateStr && dateStr.includes('-')) {
            const [yyyy, mm, dd] = dateStr.split('-');
            dateStr = `${dd}-${mm}-${yyyy}`;
        }
        csv += `${dateStr},${t.description},${t.amount},${t.type},${t.cryptoValue || ''}\n`;
    });
    Object.keys(data.currentValues).forEach(type => {
        csv += `current_value,${type},${data.currentValues[type]},\n`;
    });
    return csv;
}
