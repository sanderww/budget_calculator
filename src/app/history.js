// History tab: per-year totals of debt repayments and investment contributions.
import { getInvestmentData } from './investments.js';
import { getDebtData } from './debt.js';

const renderHistory = () => {
    const container = document.getElementById('history-content');

    // Group debt extra repayments by year
    const debtByYear = {};
    getDebtData().repayments.forEach(r => {
        const year = r.date ? r.date.split('-')[0] : null;
        if (!year || year.length !== 4) return;
        debtByYear[year] = (debtByYear[year] || 0) + (parseFloat(r.amount) || 0);
    });

    // Group investment transactions by year and account type
    const invByYear = {};
    getInvestmentData().transactions.forEach(t => {
        const year = t.date ? t.date.split('-')[0] : null;
        if (!year || year.length !== 4) return;
        if (!invByYear[year]) invByYear[year] = { TFSA: 0, Discretionary: 0, Crypto: 0 };
        if (invByYear[year].hasOwnProperty(t.type)) {
            invByYear[year][t.type] += (parseFloat(t.amount) || 0);
        }
    });

    // Collect and sort all years
    const years = [...new Set([...Object.keys(debtByYear), ...Object.keys(invByYear)])].sort();

    // Currency formatter
    const fmt = (val) => val > 0
        ? 'R\u00a0' + val.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '\u2014';

    // Build rows and accumulate totals
    let totalDebt = 0, totalTFSA = 0, totalDisc = 0, totalCrypto = 0;

    const rowsHtml = years.map(year => {
        const debt = debtByYear[year] || 0;
        const inv = invByYear[year] || {};
        const tfsa = inv.TFSA || 0;
        const disc = inv.Discretionary || 0;
        const crypto = inv.Crypto || 0;
        const invTotal = tfsa + disc + crypto;
        totalDebt += debt;
        totalTFSA += tfsa;
        totalDisc += disc;
        totalCrypto += crypto;
        return `<tr class="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                        <td class="py-2.5 px-4 font-medium text-slate-700">${year}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(debt)}</td>
                        <td class="py-2.5 px-4 font-medium text-slate-700 text-right tabular-nums">${fmt(invTotal)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(tfsa)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(disc)}</td>
                        <td class="py-2.5 px-4 text-slate-600 text-right tabular-nums">${fmt(crypto)}</td>
                    </tr>`;
    }).join('');

    const totalInvTotal = totalTFSA + totalDisc + totalCrypto;

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
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                    <tr class="border-t-2 border-slate-300 font-semibold text-slate-800 bg-slate-50">
                                        <td class="py-2.5 px-4">Total</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totalDebt)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totalInvTotal)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totalTFSA)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totalDisc)}</td>
                                        <td class="py-2.5 px-4 text-right tabular-nums">${fmt(totalCrypto)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
};

export { renderHistory };
