// History tab: per-year totals of debt repayments, investment contributions, and
// RA contributions — shown as a table plus a category pie and a stacked timeline.
import { getInvestmentData } from './investments.js';
import { getDebtData } from './debt.js';
import { getRaState } from './ra.js';
import { renderHistoryCharts } from '../charts/chart_history.js';

// Calendar year from an ISO date, or null when it can't be parsed. Every source
// (debt, investments, RA) is grouped by calendar year so the table has one row
// per year.
const yearOf = (iso) => {
    const year = iso ? iso.split('-')[0] : null;
    return (year && year.length === 4) ? year : null;
};

const renderHistory = () => {
    const container = document.getElementById('history-content');

    // perYear[year] = { debt, tfsa, discretionary, crypto, ra }.
    const perYear = {};
    const bucket = (year) => {
        if (!perYear[year]) perYear[year] = { debt: 0, tfsa: 0, discretionary: 0, crypto: 0, ra: 0 };
        return perYear[year];
    };

    // Debt: extra repayments.
    getDebtData().repayments.forEach(r => {
        const year = yearOf(r.date);
        if (year) bucket(year).debt += parseFloat(r.amount) || 0;
    });

    // Investments: split by account type.
    const INV_KEY = { TFSA: 'tfsa', Discretionary: 'discretionary', Crypto: 'crypto' };
    getInvestmentData().transactions.forEach(t => {
        const year = yearOf(t.date);
        const key = INV_KEY[t.type];
        if (year && key) bucket(year)[key] += parseFloat(t.amount) || 0;
    });

    // RA: contributions, kept separate from the investments total.
    getRaState().transactions.forEach(t => {
        const year = yearOf(t.date);
        if (year) bucket(year).ra += parseFloat(t.amount) || 0;
    });

    const years = Object.keys(perYear).sort();

    // Currency formatter: positive amounts only, an em dash otherwise.
    const fmt = (val) => val > 0
        ? 'R ' + val.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '—';

    // Grand totals per category (drives the pie and the table's total row).
    const totals = { debt: 0, tfsa: 0, discretionary: 0, crypto: 0, ra: 0 };

    const rowsHtml = years.map(year => {
        const y = perYear[year];
        const invTotal = y.tfsa + y.discretionary + y.crypto;
        totals.debt += y.debt;
        totals.tfsa += y.tfsa;
        totals.discretionary += y.discretionary;
        totals.crypto += y.crypto;
        totals.ra += y.ra;
        return `<tr class="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                        <td class="py-2.5 px-4 font-medium text-slate-700">${year}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(y.debt)}</td>
                        <td class="py-2.5 px-4 font-medium text-slate-700 text-right tabular-nums">${fmt(invTotal)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(y.tfsa)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(y.discretionary)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(y.crypto)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(y.ra)}</td>
                    </tr>`;
    }).join('');

    const invTotalAll = totals.tfsa + totals.discretionary + totals.crypto;

    container.innerHTML = `
                    <div class="card">
                        <h2 class="text-base font-semibold text-slate-800 mb-4">Money Allocated Over Time</h2>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="text-xs text-slate-500 uppercase tracking-wide">
                                        <th class="py-2 px-4 font-medium text-left">Year</th>
                                        <th class="py-2 px-4 font-medium text-right">Debt Repaid</th>
                                        <th class="py-2 px-4 font-medium text-right">Investments Total</th>
                                        <th class="py-2 px-4 font-medium text-right">TFSA</th>
                                        <th class="py-2 px-4 font-medium text-right">Discretionary</th>
                                        <th class="py-2 px-4 font-medium text-right">Crypto</th>
                                        <th class="py-2 px-4 font-medium text-right">RA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                    <tr class="border-t-2 border-slate-300 font-semibold text-slate-800 bg-slate-50">
                                        <td class="py-2.5 px-4">Total</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totals.debt)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(invTotalAll)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totals.tfsa)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totals.discretionary)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totals.crypto)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totals.ra)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="card">
                        <h2 class="text-base font-semibold text-slate-800 mb-4">Total Allocated by Category</h2>
                        <div id="history-pie"></div>
                    </div>
                    <div class="card">
                        <h2 class="text-base font-semibold text-slate-800 mb-4">Allocation Timeline</h2>
                        <div id="history-timeline"></div>
                    </div>
                `;

    renderHistoryCharts({
        pieContainer: document.getElementById('history-pie'),
        barContainer: document.getElementById('history-timeline'),
        years,
        perYear,
        totals,
    });
};

export { renderHistory };
