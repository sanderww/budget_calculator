// "Where does the next rand work hardest?" (Budget allocation card).
// Compares five destinations for one amount over one horizon, after tax,
// using only assumptions the other tabs already hold. Not advice: it ranks
// the user's own numbers and flags what the number hides (lock-up, caps,
// guaranteed vs assumed).

import { fmtZARWhole } from '../lib/format.js';
import { CGT_INCLUSION_RATE } from './sa-tax.js';

const num = (v) => Number(v) || 0;
const R = fmtZARWhole;

// Value after selling a taxable investment: CGT on the gain at the inclusion
// rate × marginal rate. Assumes the annual exclusion is already used by other
// gains (worst case); a loss is not taxed.
function afterCgt(amount, ratePct, years, marginalPct) {
    const grown = amount * Math.pow(1 + ratePct / 100, years);
    const gain = grown - amount;
    return gain > 0 ? grown - gain * CGT_INCLUSION_RATE * (marginalPct / 100) : grown;
}

// input: { amount, years, bondRatePct (null/undefined = no bond),
//          discretionaryReturnPct, tfsaReturnPct, raReturnPct, cryptoReturnPct,
//          marginalRatePct, retirementTaxPct, tfsaRoom, raHeadroom, raRefundRatePct }
// Returns rows sorted by value (highest first):
//   { key, label, value, annualPct, flags: [{ text, tone }] }
// tone: 'good' | 'warn' | 'info' | 'muted'.
export function compareDestinations(input = {}) {
    const A = Math.max(0, num(input.amount));
    const n = Math.max(1, num(input.years));
    if (A <= 0) return [];
    const disc = num(input.discretionaryReturnPct);
    const tfsaR = num(input.tfsaReturnPct);
    const raR = num(input.raReturnPct);
    const cryptoR = num(input.cryptoReturnPct);
    const m = num(input.marginalRatePct);
    const rt = Math.min(100, Math.max(0, num(input.retirementTaxPct)));
    const rows = [];

    // Extra bond payment: every rand saves interest at the bond rate,
    // compounded monthly, with no tax on the saving.
    if (input.bondRatePct !== undefined && input.bondRatePct !== null && num(input.bondRatePct) > 0) {
        const b = num(input.bondRatePct);
        rows.push({
            key: 'bond', label: 'Extra bond payment',
            value: A * Math.pow(1 + b / 1200, 12 * n),
            flags: [{ text: `Guaranteed ${b}%`, tone: 'good' }, { text: 'Tax-free saving', tone: 'muted' }],
        });
    }

    // RA: the deductible part earns a refund at the user's rate, reinvested in
    // the TFSA; the pot is taxed as income on the way out.
    const deductible = Math.min(A, Math.max(0, num(input.raHeadroom)));
    const refund = deductible * Math.max(0, num(input.raRefundRatePct)) / 100;
    rows.push({
        key: 'ra', label: 'RA (refund reinvested)',
        value: A * Math.pow(1 + raR / 100, n) * (1 - rt / 100) + refund * Math.pow(1 + tfsaR / 100, n),
        flags: [
            { text: 'Locked until 55', tone: 'warn' },
            refund > 0
                ? { text: `Refund ${R(refund)}`, tone: 'good' }
                : { text: 'No refund: over this year\'s limit', tone: 'warn' },
        ],
    });

    // TFSA: only this tax year's room is tax-free; the rest falls back to a
    // taxable investment at the same return.
    const room = Math.max(0, num(input.tfsaRoom));
    const fits = Math.min(A, room);
    rows.push({
        key: 'tfsa', label: 'TFSA',
        value: fits * Math.pow(1 + tfsaR / 100, n) + afterCgt(A - fits, tfsaR, n, m),
        flags: fits < A
            ? [{ text: `Only ${R(fits)} fits this tax year`, tone: 'warn' }]
            : [{ text: 'Tax-free growth', tone: 'good' }, { text: `${R(room - A)} room left`, tone: 'muted' }],
    });

    rows.push({
        key: 'discretionary', label: 'Discretionary (ETF)',
        value: afterCgt(A, disc, n, m),
        flags: [{ text: 'CGT on sale', tone: 'muted' }, { text: `Assumed ${disc}%`, tone: 'info' }],
    });

    rows.push({
        key: 'crypto', label: 'Crypto',
        value: afterCgt(A, cryptoR, n, m),
        flags: [{ text: `Assumed ${cryptoR}%`, tone: 'info' }, { text: 'Most volatile', tone: 'warn' }],
    });

    return rows
        .map(r => ({ ...r, annualPct: (Math.pow(r.value / A, 1 / n) - 1) * 100 }))
        .sort((a, b) => b.value - a.value);
}
