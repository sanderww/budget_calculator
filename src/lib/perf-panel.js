// Shared renderer for the gain/loss performance panels (Investments + RA tabs).
// All class strings are the exact strings the two previous implementations set.
//
// r:   result object from calculateInvestmentPerformance
// els: { invested?, gain, ann?, money?, savingsGain?, netVsSavings?, tax?, netAfterTax? }
// opts.mutedNet: discretionary panel mutes "net vs savings" (pre-tax line is
//                informational there; the after-tax line is the bold one).
// opts.fmt:      currency formatter (fmtZAR).
export function renderPerformancePanel(r, els, { mutedNet = false, fmt }) {
    if (els.invested) els.invested.textContent = fmt(r.totalInvested);

    if (r.totalInvested === 0) {
        els.gain.textContent = '0.00%';
        els.gain.className = 'font-bold text-slate-800';
        if (els.ann) { els.ann.textContent = '0.00%'; els.ann.className = 'font-bold text-slate-800'; }
        if (els.money) { els.money.textContent = 'R 0.00'; els.money.className = 'font-bold text-slate-800'; }
        if (els.savingsGain) els.savingsGain.textContent = 'R 0.00';
        if (els.netVsSavings) {
            els.netVsSavings.textContent = 'R 0.00';
            els.netVsSavings.className = mutedNet ? 'font-medium text-slate-400' : 'font-bold text-slate-800';
        }
        if (els.tax) { els.tax.textContent = 'R 0.00'; els.tax.className = 'font-medium text-red-500'; }
        if (els.netAfterTax) { els.netAfterTax.textContent = 'R 0.00'; els.netAfterTax.className = 'font-bold text-slate-800'; }
        return;
    }

    els.gain.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
    els.gain.className = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

    if (els.money) {
        els.money.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${fmt(r.absoluteReturn)}`;
        els.money.className = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
    }

    if (els.savingsGain) els.savingsGain.textContent = `+${fmt(r.savingsGain)}`;

    if (els.netVsSavings) {
        els.netVsSavings.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${fmt(r.netVsSavings)}`;
        els.netVsSavings.className = mutedNet
            ? 'font-medium text-slate-400'
            : `font-bold ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;
    }

    if (els.tax) {
        els.tax.textContent = r.estimatedTax > 0 ? `-${fmt(r.estimatedTax)}` : 'R 0.00';
        els.tax.className = 'font-medium text-red-500';
    }
    if (els.netAfterTax) {
        els.netAfterTax.textContent = `${r.netVsSavingsAfterTax >= 0 ? '+' : ''}${fmt(r.netVsSavingsAfterTax)}`;
        els.netAfterTax.className = `font-bold ${r.netVsSavingsAfterTax >= 0 ? 'text-green-600' : 'text-red-500'}`;
    }

    if (r.annualizedReturn === null) {
        if (els.ann) { els.ann.textContent = 'N/A'; els.ann.className = 'font-bold text-slate-400'; }
    } else if (els.ann) {
        els.ann.textContent = `${r.annualizedReturn >= 0 ? '+' : ''}${r.annualizedReturn.toFixed(2)}%`;
        els.ann.className = `font-bold ${r.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
    }
}
