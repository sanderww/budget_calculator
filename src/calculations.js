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

const RA_ANNUAL_CAP = 350000;

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

// ============================================================================
// Retirement Tab
// ============================================================================

export const RETIREMENT_CONSTANTS = {
    RA_ACCESS_AGE: 55,
    DUTCH_PENSION_AGE: 68,
    DUTCH_PENSION_EUR_MONTHLY: 900,
    TFSA_ANNUAL_CAP: 46_000,
    TFSA_LIFETIME_CAP: 500_000,
    RA_DEDUCTION_CAP: 430_000,
    DE_MINIMIS: 360_000,
    LIVING_ANNUITY_THRESHOLD: 150_000,
    LUMP_SUM_TAX_FREE: 550_000,
    SAVINGS_POT_SPLIT: 0.33,
    RETIREMENT_POT_SPLIT: 0.67,
    SAVINGS_POT_MIN_WITHDRAWAL: 2_000,
};

export function fvGrow(pv, annualRatePct, months) {
    const m = Math.max(0, Number(months) || 0);
    const rate = Number(annualRatePct) || 0;
    if (rate === 0 || m === 0) return Number(pv) || 0;
    const r = Math.pow(1 + rate / 100, 1 / 12) - 1;
    return (Number(pv) || 0) * Math.pow(1 + r, m);
}

export function realValue(nominal, cpiPct, years) {
    const cpi = Number(cpiPct) || 0;
    const y = Number(years) || 0;
    if (cpi === 0 || y === 0) return Number(nominal) || 0;
    return (Number(nominal) || 0) / Math.pow(1 + cpi / 100, y);
}

export function monthsToAge(dob, targetAge, today = new Date()) {
    if (!dob) return 0;
    const dobDate = (dob instanceof Date) ? dob : new Date(dob);
    if (Number.isNaN(dobDate.getTime())) return 0;
    const target = new Date(dobDate);
    target.setFullYear(dobDate.getFullYear() + Number(targetAge || 0));
    const months = (target.getFullYear() - today.getFullYear()) * 12
                 + (target.getMonth() - today.getMonth());
    return Math.max(0, months);
}

export function lumpSumTax(amount) {
    const a = Number(amount) || 0;
    if (a <= 550_000) return 0;
    if (a <= 770_000) return (a - 550_000) * 0.18;
    if (a <= 1_155_000) return 39_600 + (a - 770_000) * 0.27;
    return 143_550 + (a - 1_155_000) * 0.36;
}

function _grow(pv, annualRatePct, months, monthlyContrib = 0) {
    const m = Math.max(0, Number(months) || 0);
    const rate = Number(annualRatePct) || 0;
    const principal = Number(pv) || 0;
    const contrib = Number(monthlyContrib) || 0;
    if (m === 0) return principal;
    if (rate === 0) return principal + contrib * m;
    const r = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const grown = principal * Math.pow(1 + r, m);
    if (contrib === 0) return grown;
    const annuity = contrib * (Math.pow(1 + r, m) - 1) / r;
    return grown + annuity;
}

export function raFutureValueTwoPot({
    vestedToday = 0,
    savingsToday = 0,
    retirementToday = 0,
    annualRatePct = 0,
    extraMonthly = 0,
    months = 0,
    savingsPotAnnualWithdrawal = 0,
    taxRatePct = 18,
    offshorePct = 0,
    zarDeprePct = 0,
}) {
    const m = Math.max(0, Math.floor(Number(months) || 0));
    const extra = Math.max(0, Number(extraMonthly) || 0);
    const savingsContribMonthly = extra * RETIREMENT_CONSTANTS.SAVINGS_POT_SPLIT;
    const retirementContribMonthly = extra * RETIREMENT_CONSTANTS.RETIREMENT_POT_SPLIT;

    let vestedFV = _grow(vestedToday, annualRatePct, m);
    let retirementFV = _grow(retirementToday, annualRatePct, m, retirementContribMonthly);

    let savingsFV = Number(savingsToday) || 0;
    let totalWithdrawnGross = 0;
    const yearsFull = Math.floor(m / 12);
    const monthsRemainder = m % 12;
    const wd = Math.max(0, Number(savingsPotAnnualWithdrawal) || 0);
    for (let y = 0; y < yearsFull; y++) {
        savingsFV = _grow(savingsFV, annualRatePct, 12, savingsContribMonthly);
        if (wd > 0) {
            const taken = Math.min(wd, savingsFV);
            savingsFV -= taken;
            totalWithdrawnGross += taken;
        }
    }
    if (monthsRemainder > 0) {
        savingsFV = _grow(savingsFV, annualRatePct, monthsRemainder, savingsContribMonthly);
    }

    let total = vestedFV + savingsFV + retirementFV;
    const off = Math.max(0, Number(offshorePct) || 0);
    const dep = Number(zarDeprePct) || 0;
    if (off > 0 && dep !== 0 && total > 0) {
        const offshoreShare = total * (off / 100);
        const localShare = total - offshoreShare;
        const offshoreGrown = offshoreShare * Math.pow(1 + dep / 100, m / 12);
        const newTotal = localShare + offshoreGrown;
        const scale = newTotal / total;
        vestedFV *= scale;
        savingsFV *= scale;
        retirementFV *= scale;
        total = newTotal;
    }

    const tax = Math.max(0, Math.min(100, Number(taxRatePct) || 0)) / 100;
    const totalWithdrawnNet = totalWithdrawnGross * (1 - tax);
    return {
        vested: vestedFV,
        savings: savingsFV,
        retirement: retirementFV,
        total,
        savingsPotWithdrawnGross: totalWithdrawnGross,
        savingsPotWithdrawnNet: totalWithdrawnNet,
        savingsPotTaxPaid: totalWithdrawnGross - totalWithdrawnNet,
    };
}

export function tfsaFutureValue({
    currentValue = 0,
    annualRatePct = 0,
    monthsToRetirement = 0,
    optEnabled = false,
    transactions = [],
}, today = new Date()) {
    const months = Math.max(0, Math.floor(Number(monthsToRetirement) || 0));
    let fv = fvGrow(currentValue, annualRatePct, months);
    if (!optEnabled || months === 0) return fv;

    // SA tax year: 1 March → end Feb. February = month 1, March = month 2.
    const taxYearStart = (today.getMonth() >= 2)
        ? new Date(today.getFullYear(), 2, 1)
        : new Date(today.getFullYear() - 1, 2, 1);

    const lifetimeContributed = (transactions || [])
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const thisYearContrib = (transactions || [])
        .filter(t => t.date && new Date(t.date) >= taxYearStart)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    let lifetimeRemaining = Math.max(0, RETIREMENT_CONSTANTS.TFSA_LIFETIME_CAP - lifetimeContributed);
    if (lifetimeRemaining === 0) return fv;

    const thisYearRemaining = Math.max(0, RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP - thisYearContrib);

    // Months until end of current tax year (end Feb of next year, equivalently start of next March).
    const nextTaxYearStart = new Date(taxYearStart.getFullYear() + 1, 2, 1);
    const monthsToTaxYearEnd = Math.max(0,
        (nextTaxYearStart.getFullYear() - today.getFullYear()) * 12
        + (nextTaxYearStart.getMonth() - today.getMonth()));

    if (thisYearRemaining > 0) {
        const topUp = Math.min(thisYearRemaining, lifetimeRemaining);
        fv += fvGrow(topUp, annualRatePct, months);
        lifetimeRemaining -= topUp;
    }

    const yearsAvailable = months > monthsToTaxYearEnd
        ? Math.max(0, Math.floor((months - monthsToTaxYearEnd - 1) / 12) + 1)
        : 0;
    const yearsByCap = Math.floor(lifetimeRemaining / RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP);
    const fullYears = Math.min(yearsByCap, yearsAvailable);
    for (let y = 0; y < fullYears; y++) {
        const monthsRemaining = months - monthsToTaxYearEnd - y * 12;
        if (monthsRemaining < 0) break;
        fv += fvGrow(RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP, annualRatePct, monthsRemaining);
        lifetimeRemaining -= RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP;
    }

    if (lifetimeRemaining > 0 && lifetimeRemaining < RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP) {
        const monthsRemaining = months - monthsToTaxYearEnd - fullYears * 12;
        if (monthsRemaining >= 0) {
            fv += fvGrow(lifetimeRemaining, annualRatePct, monthsRemaining);
        }
    }

    return fv;
}

export function raCommutationLumpSum(raPot, commuteThird) {
    if (!commuteThird) return { gross: 0, tax: 0, net: 0 };
    const gross = (Number(raPot) || 0) / 3;
    const tax = lumpSumTax(gross);
    return { gross, tax, net: gross - tax };
}

export function raMonthlyIncome(raPot, withdrawalRatePct, taxRatePct, commuteThird) {
    const pot = Number(raPot) || 0;
    if (pot < RETIREMENT_CONSTANTS.DE_MINIMIS) {
        return { gross: 0, net: 0, fullCommutation: true };
    }
    const annuitisedPot = commuteThird ? pot * 2 / 3 : pot;
    const rate = (Number(withdrawalRatePct) || 0) / 100;
    const tax = Math.max(0, Math.min(100, Number(taxRatePct) || 0)) / 100;
    const gross = annuitisedPot * rate / 12;
    const net = gross * (1 - tax);
    return { gross, net, fullCommutation: false };
}

export function projectLivingAnnuityDepletion(
    annuitisedPot, annualReturnPct, withdrawalRatePct, retirementAge,
    horizonAge = 95,
    threshold = RETIREMENT_CONSTANTS.LIVING_ANNUITY_THRESHOLD
) {
    let pot = Number(annuitisedPot) || 0;
    const rate = Number(annualReturnPct) || 0;
    const wdRate = (Number(withdrawalRatePct) || 0) / 100;
    if (pot <= 0) return null;
    const r = (rate === 0) ? 0 : Math.pow(1 + rate / 100, 1 / 12) - 1;
    const monthlyDrawdownRate = wdRate / 12;
    const startAge = Math.max(0, Math.floor(Number(retirementAge) || 0));
    const endAge = Math.max(startAge, Math.floor(Number(horizonAge) || 95));
    for (let age = startAge; age < endAge; age++) {
        for (let m = 0; m < 12; m++) {
            const drawdown = pot * monthlyDrawdownRate;
            pot = pot * (1 + r) - drawdown;
            if (pot < threshold) {
                return {
                    ageAtThreshold: age + (m + 1) / 12,
                    potAtThreshold: Math.max(0, pot),
                    canCommute: true,
                    commutationTax: lumpSumTax(Math.max(0, pot)),
                };
            }
        }
    }
    return null;
}

const RETIREMENT_DEFAULT_PARAMS = {
    dob: '1985-08-08',
    retirement_age: 65,
    withdrawal_rate_pct: 4,
    cpi_pct: 5,
    show_real_terms: 0,
    effective_tax_rate_pct: 18,

    return_discretionary_pct: 10,
    return_tfsa_pct: 10,
    return_crypto_pct: 7,
    return_ra_pct: 10,

    offshore_discretionary_pct: 0,
    offshore_tfsa_pct: 0,
    zar_depreciation_pct: 2,

    ra_commute_third: 1,
    ra_savings_component_pct: 33,
    ra_vested_balance: 0,
    opt_savings_pot_withdrawal_enabled: 0,
    opt_savings_pot_withdrawal_annual: 0,

    opt_dutch_enabled: 0,
    opt_dutch_eur_zar: 20,
    opt_tfsa_enabled: 0,
    opt_ra_monthly_enabled: 0,
    opt_ra_monthly_amount: 10_000,
    opt_house_enabled: 0,
    opt_house_value: 2_000_000,
    opt_inheritance_enabled: 0,
    opt_inheritance_eur: 0,
    opt_bond_enabled: 0,
    opt_bond_balance: 0,
};

export function getDefaultRetirementParams() {
    return { ...RETIREMENT_DEFAULT_PARAMS };
}

export function parseRetirementCSV(text) {
    const params = { ...RETIREMENT_DEFAULT_PARAMS };
    const rows = (text || '').split('\n').map(r => r.trim()).filter(r => r !== '');
    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] !== 'param') return;
        const key = cols[1];
        const raw = cols[2];
        if (!key || raw === undefined) return;
        if (key === 'dob') {
            params[key] = raw;
            return;
        }
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) params[key] = v;
    });
    return params;
}

export function generateRetirementCSV(params) {
    const p = { ...RETIREMENT_DEFAULT_PARAMS, ...(params || {}) };
    let csv = '';
    Object.keys(RETIREMENT_DEFAULT_PARAMS).forEach(key => {
        csv += `param,${key},${p[key]},\n`;
    });
    return csv;
}
