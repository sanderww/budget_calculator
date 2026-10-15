// Shared ZAR currency formatters. One module, four canonical shapes.
//
// Notation is fixed app-wide: comma thousands separator, dot decimal —
// "R 3,000.50" means three thousand rand and fifty cents. The 'en-ZA' locale
// renders "3 000,50" instead, so every formatter pins 'en-US' deliberately.
export const ZAR_LOCALE = 'en-US';

// Two-decimal rand: used everywhere a cent-precise amount is displayed.
export const fmtZAR = (value) => {
    const num = parseFloat(value) || 0;
    return `R ${num.toLocaleString(ZAR_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Whole rand, rounded. Negative numbers keep the locale's own minus ("R -1,235").
export const fmtZARWhole = (n) => 'R ' + Math.round(Number(n) || 0).toLocaleString(ZAR_LOCALE);

// Whole rand with the minus hoisted in front of the R ("-R 1,235").
export const fmtZARSigned = (n) => {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    return sign + 'R ' + Math.abs(v).toLocaleString(ZAR_LOCALE);
};

// Chart axis/tooltip labels: same notation, whole rand.
export const fmtZARAxis = (value) => {
    const n = Math.round(parseFloat(value) || 0);
    return 'R ' + n.toLocaleString(ZAR_LOCALE);
};

// Bare grouped number, no currency prefix (e.g. the "40,000 before CGT" hints).
export const fmtNum = (n, digits = 0) => (Number(n) || 0).toLocaleString(ZAR_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
});

// Amount-input display: grouped, up to two decimals, no forced ".00"
// ("400,000" or "45,000.50"). Empty/non-numeric values show as an empty field.
export const fmtAmountInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString(ZAR_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Parse what a person types into an amount field. Accepts "45000", "45,000",
// "45000.5", "R 45,000.50", "45k", "1.2m" and a leading minus. Commas are only
// valid as thousands groups ("1,2" is rejected). Returns a number, or null for
// empty/unparseable text.
export const parseAmount = (text) => {
    if (typeof text === 'number') return Number.isFinite(text) ? text : null;
    if (typeof text !== 'string') return null;
    let s = text.replace(/\s+/g, '');
    s = s.replace(/^(-?)r/i, '$1');
    let mult = 1;
    const suffix = /[km]$/i.exec(s);
    if (suffix) {
        mult = suffix[0].toLowerCase() === 'k' ? 1e3 : 1e6;
        s = s.slice(0, -1);
    }
    const grouped = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
    const plain = /^-?(\d+\.?\d*|\.\d+)$/;
    if (!grouped.test(s) && !plain.test(s)) return null;
    const n = Number(s.replace(/,/g, '')) * mult;
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
};
