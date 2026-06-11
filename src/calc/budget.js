// Budget tab: summary, monthly allocation, and budget CSV parse/generate.

import { generateRecordId as _generateId } from './util.js';

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
