// Shared ZAR currency formatters. One module, four canonical shapes.

// Two-decimal rand: used everywhere a cent-precise amount is displayed.
export const fmtZAR = (value) => {
    const num = parseFloat(value) || 0;
    return `R ${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Whole rand, rounded. Negative numbers keep the locale's own minus ("R -1 235").
export const fmtZARWhole = (n) => 'R ' + Math.round(Number(n) || 0).toLocaleString('en-ZA');

// Whole rand with the minus hoisted in front of the R ("-R 1 235").
export const fmtZARSigned = (n) => {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    return sign + 'R ' + Math.abs(v).toLocaleString('en-ZA');
};

// Chart axis/tooltip labels: group separators normalised to plain spaces.
export const fmtZARAxis = (value) => {
    const n = Math.round(parseFloat(value) || 0);
    return 'R ' + n.toLocaleString('en-ZA').replace(/,/g, ' ');
};
