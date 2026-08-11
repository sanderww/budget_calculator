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
