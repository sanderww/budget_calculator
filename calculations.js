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
export function calculateInvestmentPerformance(transactions, currentValue, today = new Date()) {
    const totalInvested = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalCryptoValue = transactions.reduce((sum, t) => sum + (parseFloat(t.cryptoValue) || 0), 0);

    if (totalInvested === 0) {
        return { totalInvested: 0, totalCryptoValue: 0, absoluteReturn: 0, percentageReturn: 0, savingsGain: 0, netVsSavings: 0, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
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

    if (validTxCount === 0 || weightedAgeSum === 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const averageAgeDays = weightedAgeSum / totalInvested;
    const yearsHeld = averageAgeDays / 365.25;

    if (yearsHeld <= 0.1) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const ratio = currentValue / totalInvested;
    if (ratio <= 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const annualizedReturn = (Math.pow(ratio, 1 / yearsHeld) - 1) * 100;
    return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn };
}
export function monthlyInterestFactor() { return 0; }
export function simulateDebt() { return {}; }
export function calculateDebtResults() { return {}; }
export function xirr() { return 0; }
export function parseBudgetCSV() { return {}; }
export function generateBudgetCSV() { return ''; }
export function parseInvestmentCSV() { return {}; }
export function generateInvestmentCSV() { return ''; }
export function parseDebtCSV() { return {}; }
export function generateDebtCSV() { return ''; }
