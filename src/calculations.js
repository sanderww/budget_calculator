// Internal helper used by CSV parsers (not exported)
const _generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function getUpcoming25th(today = new Date()) {
    let year = today.getFullYear();
    let month = today.getMonth();
    if (today.getDate() > 25) {
        month++;
    }
    const targetDate = new Date(year, month, 25);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-25`;
}
export function calculateBudgetSummary(savings, debts, provisions, futureCosts, futureDate, today = new Date()) {
    const totalDebts = debts.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const totalProvisions = provisions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const currentNetAmount = savings - totalDebts - totalProvisions;

    const relevantFutureCosts = futureDate
        ? futureCosts.reduce((sum, item) => {
            const itemDate = item.date ? new Date(item.date) : null;
            if (itemDate && itemDate <= futureDate) {
                return sum + (parseFloat(item.amount) || 0);
            }
            return sum;
        }, 0)
        : 0;

    const futureNetAmount = currentNetAmount - relevantFutureCosts;

    let monthlySavingsTarget = 0;
    let monthsDiff = 0;

    if (futureDate) {
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        const fd = new Date(futureDate);
        fd.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((fd - t) / (1000 * 60 * 60 * 24));
        monthsDiff = Math.max(1, Math.ceil(daysDiff / 30));

        if (daysDiff > 0) {
            if (futureNetAmount < 0) {
                monthlySavingsTarget = Math.abs(futureNetAmount) / monthsDiff;
            } else if (futureNetAmount < currentNetAmount) {
                monthlySavingsTarget = (currentNetAmount - futureNetAmount) / monthsDiff;
            } else if (currentNetAmount < 0 && futureNetAmount >= 0) {
                monthlySavingsTarget = (Math.abs(currentNetAmount) + futureNetAmount) / monthsDiff;
            }
        }
    }

    return { totalDebts, totalProvisions, currentNetAmount, relevantFutureCosts, futureNetAmount, monthsDiff, monthlySavingsTarget };
}
export function calculateMonthlyAllocation(availableMoney, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage) {
    const remainingMoney = availableMoney - monthlySavingsTarget;
    const mortgageAmount = (remainingMoney * mortgagePercentage) / 100;
    const eftAmount = (remainingMoney * eftPercentage) / 100;
    const cryptoAmount = (remainingMoney * cryptoPercentage) / 100;
    const totalAllocated = monthlySavingsTarget + mortgageAmount + eftAmount + cryptoAmount;
    const leftover = availableMoney - totalAllocated;
    return { remainingMoney, mortgageAmount, eftAmount, cryptoAmount, totalAllocated, leftover };
}
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

    if (yearsHeld <= 0.1) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const ratio = currentValue / totalInvested;
    if (ratio <= 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const annualizedReturn = (Math.pow(ratio, 1 / yearsHeld) - 1) * 100;
    return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn };
}
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
export function xirr(cashFlows, guess = 0.1) {
    const xnpv = (rate) => cashFlows.reduce((sum, item) => {
        const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
        return sum + item.amount / Math.pow(1 + rate, days / 365);
    }, 0);

    let rate = guess;
    for (let i = 0; i < 20; i++) {
        const fValue = xnpv(rate);
        if (Math.abs(fValue) < 1) break;

        const derivative = cashFlows.reduce((sum, item) => {
            const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
            return sum - (days / 365) * item.amount / Math.pow(1 + rate, (days / 365) + 1);
        }, 0);

        const newRate = rate - fValue / derivative;
        if (Math.abs(newRate - rate) < 0.0001) { rate = newRate; break; }
        rate = newRate;
    }
    return rate;
}
export function parseBudgetCSV(text) {
    const newData = { savings: 0, debts: [], provisions: [], futureCosts: [] };
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const contentRows = rows.slice(1);

    contentRows.forEach(row => {
        const [type, description, amount, date] = row.split(',').map(s => s.trim());
        const item = { id: _generateId(), description, amount: parseFloat(amount) || 0, date };

        switch (type) {
            case 'savings':
                newData.savings = parseFloat(amount) || 0;
                break;
            case 'debt':
                newData.debts.push(item);
                break;
            case 'provision':
                newData.provisions.push(item);
                break;
            case 'costfuturecost':
                newData.futureCosts.push(item);
                break;
        }
    });
    return newData;
}

export function generateBudgetCSV(data) {
    let csv = 'type,description,amount,date\n';
    csv += `savings,,${data.savings || 0},\n`;
    data.debts.forEach(d => { csv += `debt,${d.description || ''},${d.amount || 0},\n`; });
    data.provisions.forEach(p => { csv += `provision,${p.description || ''},${p.amount || 0},${p.date || ''}\n`; });
    data.futureCosts.forEach(c => { csv += `costfuturecost,${c.description || ''},${c.amount || 0},${c.date || ''}\n`; });
    return csv;
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
    const rate = (data.marginalRate === undefined || data.marginalRate === null || Number.isNaN(parseFloat(data.marginalRate)))
        ? 41
        : parseFloat(data.marginalRate);
    csv += `param,marginal_rate,${rate},\n`;
    return csv;
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

export function generateDebtCSV(repayments, params) {
    let csv = 'Date,Description,Amount\n';
    csv += `param,principal,${params.principal || ''}\n`;
    csv += `param,current_balance,${params.current_balance || ''}\n`;
    csv += `param,repayment,${params.repayment || ''}\n`;
    csv += `param,service_fee,${params.service_fee || ''}\n`;
    csv += `param,interest_rate,${params.interest_rate || ''}\n`;
    csv += `param,next_payment,${params.next_payment || ''}\n`;
    csv += `param,loan_start,${params.loan_start || ''}\n`;
    csv += `param,original_term,${params.original_term || ''}\n`;
    repayments.forEach(r => { csv += `${r.date},${r.description},${r.amount}\n`; });
    return csv;
}

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
    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'param') {
            const v = parseFloat(cols[2]);
            if (!Number.isNaN(v)) params[cols[1]] = v;
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
    return { transactions, params };
}

export function generateRaCSV(data) {
    let csv = '';
    (data.transactions || []).forEach(t => {
        csv += `${t.date},${t.description},${t.amount}\n`;
    });
    const p = data.params || {};
    const writeParam = (key) => {
        if (p[key] !== undefined && p[key] !== null && p[key] !== '') {
            csv += `param,${key},${p[key]},\n`;
        }
    };
    writeParam('tax_refund_rate_pct');
    writeParam('nominal_return_pct');
    writeParam('future_years_to_project');
    writeParam('assumed_future_monthly');
    return csv;
}

export function deriveAssumedFutureMonthly(transactions) {
    if (!transactions || transactions.length === 0) return 0;
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-3);
    const sum = recent.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return sum / recent.length;
}
