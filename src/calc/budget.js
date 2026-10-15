// Budget tab: summary, monthly allocation, and budget CSV parse/generate.

import { generateRecordId as _generateId } from './util.js';
import { parseQuickAddTokens } from '../lib/quick-add.js';

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
// Keeps Mortgage % + ETF % + Crypto % at exactly 100. Crypto is derived (the
// remainder). The field the user edited wins: if Mortgage + ETF would exceed
// 100, the OTHER field is reduced to fit. Works in integer tenths so rounding
// to 0.1 never drifts. `eft` keeps its internal name; the UI label is "ETF".
export function balanceAllocation({ mortgage, eft }, changedField) {
    const tenths = (v) => {
        const n = Math.round((Number(v) || 0) * 10);
        return Math.min(1000, Math.max(0, n));
    };
    let m = tenths(mortgage);
    let e = tenths(eft);
    if (m + e > 1000) {
        if (changedField === 'eft') m = 1000 - e;
        else e = 1000 - m;
    }
    return { mortgage: m / 10, eft: e / 10, crypto: (1000 - m - e) / 10 };
}
// True only for a parseable date strictly before today. Both sides are
// normalised to local midnight, so a row dated today reads as still pending
// rather than flipping to "due" partway through the day.
export function isPastDue(date, today = new Date()) {
    const t = Date.parse(date);
    if (Number.isNaN(t)) return false;
    const due = new Date(t);
    due.setHours(0, 0, 0, 0);
    const ref = new Date(today);
    ref.setHours(0, 0, 0, 0);
    return due < ref;
}

// Moves one past-due future cost into provisions, carrying its description,
// amount and date across untouched. The date is deliberately preserved so the
// provision stays identifiable as "the cost that was due on that date".
//
// Deliberately manual, never automatic: once a future cost's date passes, the
// money was either saved (it becomes a provision) or spent (the row is simply
// deleted). Only the user knows which, so the app never infers it.
//
// Returns a new data object on success, leaving the input and its arrays
// unmutated. Returns the input object by reference when the move is refused,
// so callers can detect a no-op with `!==`.
export function convertFutureCostToProvision(data, id, today = new Date()) {
    const index = data.futureCosts.findIndex(c => c.id === id);
    if (index === -1) return data;

    const cost = data.futureCosts[index];
    if (!isPastDue(cost.date, today)) return data;

    return {
        ...data,
        futureCosts: data.futureCosts.filter((_, i) => i !== index),
        provisions: [...data.provisions, { ...cost }],
    };
}

// "Commitment" is the umbrella term for a debt, a provision or a future cost.
// budgetData keeps one array per kind; the Budget ledger is a view over all
// three. Kinds in display order:
export const COMMITMENT_KINDS = ['debt', 'provision', 'futureCost'];
const KIND_LIST = { debt: 'debts', provision: 'provisions', futureCost: 'futureCosts' };

// Moves the commitment `id` to the `newKind` list (appended at the end),
// keeping its id, description and amount. Moving to a debt drops the date
// (the budget CSV stores none for debts); moving a debt elsewhere gives it an
// empty date. Returns a new data object without mutating the input, or the
// input by reference when nothing moves (unknown id or kind, or same kind).
export function changeCommitmentType(data, id, newKind) {
    const toList = KIND_LIST[newKind];
    if (!toList) return data;
    const fromKind = COMMITMENT_KINDS.find(k => data[KIND_LIST[k]].some(i => i.id === id));
    if (!fromKind || fromKind === newKind) return data;
    const fromList = KIND_LIST[fromKind];
    const item = data[fromList].find(i => i.id === id);
    const moved = { id: item.id, description: item.description, amount: item.amount };
    if (newKind !== 'debt') moved.date = item.date || '';
    return {
        ...data,
        [fromList]: data[fromList].filter(i => i.id !== id),
        [toList]: [...data[toList], moved],
    };
}

// Row counts and amount totals per kind, plus `all`, for the ledger filters
// and footer. Blank or non-numeric amounts count as 0.
export function summariseCommitments(data) {
    const count = { all: 0 };
    const total = { all: 0 };
    for (const kind of COMMITMENT_KINDS) {
        const list = data[KIND_LIST[kind]];
        count[kind] = list.length;
        total[kind] = list.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        count.all += count[kind];
        total.all += total[kind];
    }
    return { count, total };
}

// Parses one line of the Budget quick-add field, e.g. "car service 6.5k mar 2027"
// or "credit card 12000 debt", on top of parseQuickAddTokens (src/lib/quick-add.js):
//   1. kind: the word "debt" or "provision" anywhere (case-insensitive);
//      otherwise a future cost.
//   2. date: YYYY-MM-DD, or "<month name or 3-letter abbr> YYYY" (the 1st of
//      that month). Debts have no due date, so a date typed on a debt is dropped.
//   3. amount: the first token parseAmount accepts ("R 20,000" counts as one),
//      preferring anything over a bare year.
//   4. description: what remains, whitespace collapsed, first letter capitalised.
// Returns { kind, description, amount, date } (date '' when none), or
// { error: 'empty' | 'missing', missing: [...] } naming the missing parts.
const COMMITMENT_KEYWORDS = { debt: 'debt', provision: 'provision' };
export function parseQuickAdd(text) {
    const t = parseQuickAddTokens(text, { keywords: COMMITMENT_KEYWORDS });
    if (t.empty) return { error: 'empty', missing: ['description', 'amount'] };
    const kind = t.keyword || 'futureCost';
    const missing = [];
    if (!t.description) missing.push('description');
    if (t.amount === null) missing.push('amount');
    if (missing.length) return { error: 'missing', missing };
    return { kind, description: t.description, amount: t.amount, date: kind === 'debt' ? '' : t.date };
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
