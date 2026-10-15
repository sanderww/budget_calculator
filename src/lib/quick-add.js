// General quick-add token parser shared by every ledger (UX-4.1). Pure.
// Each tab supplies its own keyword map and turns the tokens into a row;
// Budget's parseQuickAdd (src/calc/budget.js) is built on it.
import { parseAmount } from './format.js';

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

// Today's local date as YYYY-MM-DD (the default date on transaction tabs).
export function todayISO(now = new Date()) {
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
}

// Splits one quick-add line into its parts. Steps, in order, on
// whitespace-separated tokens:
//   0. units: a number directly followed by a unit word from `units`
//      (e.g. "0.012 btc" with units ['btc']) goes to units[unit] and is not
//      read as the amount (full precision). First occurrence per unit.
//   1. keyword: the first token whose lower-case form is a key of `keywords`
//      (case-insensitive); result.keyword is the mapped value, else null.
//   2. date: YYYY-MM-DD, or "<month name or 3-letter abbr> YYYY" (the 1st of
//      that month). When none is typed, `defaultDate` (a string or a function
//      returning one) is used, else ''.
//   3. amount: the first token parseAmount accepts ("R 20,000" counts as one),
//      preferring anything over a bare year; null when none.
//   4. description: what remains, whitespace collapsed, first letter capitalised.
// Returns { empty, keyword, description, amount, date, units }. `empty` is
// true only when the text has no tokens at all (then nothing else is filled).
export function parseQuickAddTokens(text, { keywords = {}, units: unitWords = [], defaultDate } = {}) {
    const tokens = typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean) : [];
    const units = {};
    if (tokens.length === 0) {
        return { empty: true, keyword: null, description: '', amount: null, date: '', units };
    }

    const unitSet = new Set(unitWords.map(u => u.toLowerCase()));
    for (let i = 0; i + 1 < tokens.length; i++) {
        const unit = tokens[i + 1].toLowerCase();
        if (!unitSet.has(unit) || unit in units) continue;
        // Plain decimal, not parseAmount: BTC needs more than 2 decimals.
        if (!/^\d*\.?\d+$/.test(tokens[i])) continue;
        units[unit] = Number(tokens[i]);
        tokens.splice(i, 2);
        i--;
    }

    let keyword = null;
    const keyAt = tokens.findIndex(t => Object.hasOwn(keywords, t.toLowerCase()));
    if (keyAt >= 0) {
        keyword = keywords[tokens[keyAt].toLowerCase()];
        tokens.splice(keyAt, 1);
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
    if (!date && defaultDate) date = typeof defaultDate === 'function' ? defaultDate() : defaultDate;

    // Candidates: [start index, token count, value, is a bare year]. A lone
    // "R" joins the number after it, so "R 20,000" reads as one amount.
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
    return { empty: false, keyword, description, amount, date, units };
}

// ---- Transaction tabs (UX-4.2 to UX-4.4) -----------------------------------
// Rows on these tabs record things that already happened, so a line without
// a date is dated `today` (a YYYY-MM-DD string or a function returning one;
// default todayISO). Both a description and an amount are required.
// Returns the row fields, or { error: 'empty' | 'missing', missing: [...] }.
const missingParts = (t) => {
    if (t.empty) return { error: 'empty', missing: ['description', 'amount'] };
    const missing = [];
    if (!t.description) missing.push('description');
    if (t.amount === null) missing.push('amount');
    return missing.length ? { error: 'missing', missing } : null;
};

// Debt extra repayments and RA contributions: "5k bonus repayment".
// → { description, amount, date }
export function parseTransactionQuickAdd(text, { today = todayISO } = {}) {
    const t = parseQuickAddTokens(text, { defaultDate: today });
    return missingParts(t) || { description: t.description, amount: t.amount, date: t.date };
}

// Investment accounts by quick-add keyword (case-insensitive).
export const INVESTMENT_KEYWORDS = {
    tfsa: 'TFSA', crypto: 'Crypto', btc: 'Crypto', disc: 'Discretionary', discretionary: 'Discretionary',
};

// Investment transactions: "tfsa etf 3000", "luno 0.012 btc 6k".
// → { account, description, amount, date, btc }
// account: the keyword's account, else Crypto when a BTC quantity was typed,
// else Discretionary. A number followed by "btc" is the BTC quantity, not
// the rand amount; it is kept only on Crypto rows (btc '' otherwise), so an
// explicit "tfsa"/"disc" wins over a BTC quantity.
export function parseInvestmentQuickAdd(text, { today = todayISO } = {}) {
    const t = parseQuickAddTokens(text, { keywords: INVESTMENT_KEYWORDS, units: ['btc'], defaultDate: today });
    const bad = missingParts(t);
    if (bad) return bad;
    const hasBtc = 'btc' in t.units;
    const account = t.keyword || (hasBtc ? 'Crypto' : 'Discretionary');
    return {
        account,
        description: t.description,
        amount: t.amount,
        date: t.date,
        btc: account === 'Crypto' && hasBtc ? t.units.btc : '',
    };
}
