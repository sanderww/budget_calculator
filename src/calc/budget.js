// Budget tab: summary, monthly allocation, and budget CSV parse/generate.

import { generateRecordId as _generateId } from './util.js';
import { parseAmount } from '../lib/format.js';

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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];
const monthIndex = (token) => {
    const t = token.toLowerCase();
    const i = MONTHS.indexOf(t);
    return i >= 0 ? i : FULL_MONTHS.indexOf(t);
};
const isIsoDate = (token) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
// A bare 4-digit year ("2027") is only taken as the amount when nothing else
// in the text parses as one, so "2027 budget review 5k" means R 5,000.
const looksLikeYear = (token) => /^(19|20)\d{2}$/.test(token);

// Parses one line of the Budget quick-add field, e.g. "car service 6.5k mar 2027"
// or "credit card 12000 debt". Rules, applied in order:
//   1. kind: the word "debt" or "provision" anywhere (case-insensitive);
//      otherwise a future cost.
//   2. date: YYYY-MM-DD, or "<month name or 3-letter abbr> YYYY" (the 1st of
//      that month). Debts have no due date, so a date typed on a debt is dropped.
//   3. amount: the first token parseAmount accepts ("R 20,000" counts as one),
//      preferring anything over a bare year.
//   4. description: what remains, whitespace collapsed, first letter capitalised.
// Returns { kind, description, amount, date } (date '' when none), or
// { error: 'empty' | 'missing', missing: [...] } naming the missing parts.
export function parseQuickAdd(text) {
    let tokens = typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean) : [];
    if (tokens.length === 0) return { error: 'empty', missing: ['description', 'amount'] };

    let kind = 'futureCost';
    const kindAt = tokens.findIndex(t => /^(debt|provision)$/i.test(t));
    if (kindAt >= 0) {
        kind = tokens[kindAt].toLowerCase();
        tokens.splice(kindAt, 1);
    }

    let date = '';
    for (let i = 0; i < tokens.length; i++) {
        if (isIsoDate(tokens[i])) {
            date = tokens[i];
            tokens.splice(i, 1);
            break;
        }
        const month = monthIndex(tokens[i]);
        if (month >= 0 && /^\d{4}$/.test(tokens[i + 1] || '')) {
            date = `${tokens[i + 1]}-${String(month + 1).padStart(2, '0')}-01`;
            tokens.splice(i, 2);
            break;
        }
    }
    if (kind === 'debt') date = '';

    // Candidates: [start index, token count, value]. A lone "R" joins the
    // number after it, so "R 20,000" reads as one amount.
    const candidates = [];
    for (let i = 0; i < tokens.length; i++) {
        if (/^-?r$/i.test(tokens[i]) && i + 1 < tokens.length) {
            const v = parseAmount(tokens[i] + tokens[i + 1]);
            if (v !== null) { candidates.push([i, 2, v, false]); continue; }
        }
        const v = parseAmount(tokens[i]);
        if (v !== null) candidates.push([i, 1, v, looksLikeYear(tokens[i])]);
    }
    const pick = candidates.find(c => !c[3]) || candidates[0];
    let amount = null;
    if (pick) {
        amount = pick[2];
        tokens.splice(pick[0], pick[1]);
    }

    const rest = tokens.join(' ');
    const description = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';

    const missing = [];
    if (!description) missing.push('description');
    if (amount === null) missing.push('amount');
    if (missing.length) return { error: 'missing', missing };
    return { kind, description, amount, date };
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
