// Debt tab: repayment simulation and debt CSV parse/generate.

import { generateRecordId as _generateId } from './util.js';

export function monthlyInterestFactor(dailyRate, year, month) {
    const days = new Date(year, month + 1, 0).getDate();
    return Math.pow(1 + dailyRate, days) - 1;
}
export function simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, withExtras) {
    let balance = startPrincipal;
    let totalInterest = 0;
    let totalFees = 0;
    let months = 0;
    let simDate = new Date(startDate);

    while (balance > 10 && months < 1200) {
        totalFees += serviceFee;

        const interest = balance * monthlyInterestFactor(dailyRate, simDate.getFullYear(), simDate.getMonth());
        totalInterest += interest;
        balance += interest;

        let payment = effectiveRepayment;

        if (withExtras) {
            const currentMonthStr = `${simDate.getFullYear()}-${String(simDate.getMonth() + 1).padStart(2, '0')}`;
            repayments.forEach(rep => {
                if (rep.date && rep.date.startsWith(currentMonthStr)) {
                    payment += (parseFloat(rep.amount) || 0);
                }
            });
        }

        if (balance < payment) payment = balance;
        balance -= payment;
        months++;
        simDate.setMonth(simDate.getMonth() + 1);
    }

    return { totalInterest, totalFees, endDate: simDate, months };
}
export function calculateDebtResults({ currentPrincipal, totalRepayment, serviceFee, interestRate, nextPaymentDateStr, repayments }) {
    const dailyRate = (interestRate / 100) / 365;
    const effectiveRepayment = totalRepayment - serviceFee;

    let startDate = new Date(nextPaymentDateStr);
    startDate.setDate(1);

    if (repayments.length > 0) {
        const dates = repayments.map(r => new Date(r.date));
        const earliest = new Date(Math.min.apply(null, dates));
        earliest.setDate(1);
        if (earliest < startDate) startDate = earliest;
    }

    // Back-calculate to find the starting balance at startDate
    let simulatedBalance = currentPrincipal;
    let iterDate = new Date(nextPaymentDateStr);
    iterDate.setDate(1);

    while (iterDate > startDate) {
        iterDate.setMonth(iterDate.getMonth() - 1);
        const monthStr = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}`;
        let monthlyExtra = 0;
        repayments.forEach(rep => {
            if (rep.date && rep.date.startsWith(monthStr)) {
                monthlyExtra += (parseFloat(rep.amount) || 0);
            }
        });
        const factor = monthlyInterestFactor(dailyRate, iterDate.getFullYear(), iterDate.getMonth());
        simulatedBalance = (simulatedBalance + effectiveRepayment + monthlyExtra) / (1 + factor);
    }

    const startPrincipal = simulatedBalance;
    const baseline = simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, false);
    const actual = simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, true);

    const moneySaved = (baseline.totalInterest + baseline.totalFees) - (actual.totalInterest + actual.totalFees);
    const diffMonths = baseline.months - actual.months;
    const totalExtra = repayments.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    return { moneySaved, diffMonths, totalExtra, baseline, actual };
}
export function parseDebtCSV(text) {
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const repayments = [];
    const params = {};

    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'param') {
            params[cols[1]] = cols[2];
        } else if (cols[0] !== 'Date' && cols[0] !== 'type') {
            if (cols.length >= 3 && !isNaN(parseFloat(cols[2]))) {
                repayments.push({
                    id: _generateId(),
                    date: cols[0],
                    description: cols[1],
                    amount: parseFloat(cols[2]),
                });
            }
        }
    });
    return { repayments, params };
}

export function generateDebtCSV(repayments) {
    let csv = 'Date,Description,Amount\n';
    (repayments || []).forEach(r => { csv += `${r.date},${r.description},${r.amount}\n`; });
    return csv;
}
