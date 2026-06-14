// Retirement tab: snapshot, projections, charts. Reads live state from the
// investments and RA modules; re-rendered by them via their setOnStateChanged
// notifiers (wired in the app bootstrap).
import {
    calculatePotValueToday as _calculatePotValueToday,
    RETIREMENT_CONSTANTS as _RET_CONSTS,
    getDefaultRetirementParams as _getDefaultRetirementParams,
    parseRetirementCSV as _parseRetirementCSV,
    calculateRetirementSnapshot as _calculateRetirementSnapshot,
    generateConfigJSON as _generateConfigJSON,
} from '../calculations.js';
import { renderRetirementScenarioCharts as _renderRetirementScenarioCharts } from '../charts/chart_retirement.js';
import { fmtZARWhole, fmtZARSigned } from '../lib/format.js';
import { getConfigMap, persistConfig, saveToServer } from './persistence.js';
import { getInvestmentData } from './investments.js';
import { getRaState } from './ra.js';

// --- RETIREMENT STATE ---
let retirementParams = _getDefaultRetirementParams();

const retFmtZAR = fmtZARWhole;
const retFmtZARSign = fmtZARSigned;

// Returns the RA pot today (live read from RA tab state).
// Prefer the user-entered actual fund value (real situation). Fall back to the
// contributions × nominal-return estimate when no actual value has been entered.
const retRaPotToday = () => {
    const { transactions, currentValue, params } = getRaState();
    if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        return Number(currentValue) || 0;
    }
    return _calculatePotValueToday(
        transactions || [],
        (params && params.nominal_return_pct) || retirementParams.return_ra_pct,
        new Date()
    );
};
const retRaPotTodayIsActual = () => {
    const { currentValue } = getRaState();
    return (currentValue !== undefined && currentValue !== null && currentValue !== '');
};

// Sum of last-12-months RA contributions for deduction-cap headroom display.
const retRaAnnualLast12 = () => {
    const { transactions } = getRaState();
    const today = new Date();
    const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    return (transactions || [])
        .filter(t => t.date && new Date(t.date) >= cutoff)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
};

const retInputBindings = [
    ['ret-dob',                       'dob',                                   'string'],
    ['ret-retirement-age',            'retirement_age',                        'number'],
    ['ret-life-expectancy',           'life_expectancy',                       'number'],
    ['ret-lump-sum-drawdown-return',  'lump_sum_drawdown_return_pct',          'number'],
    ['ret-wd-rate',                   'withdrawal_rate_pct',                   'number'],
    ['ret-tax-rate',                  'effective_tax_rate_pct',                'number'],
    ['ret-cpi',                       'cpi_pct',                               'number'],
    ['ret-real-terms',                'show_real_terms',                       'checkbox'],

    ['ret-return-discretionary',      'return_discretionary_pct',              'number'],
    ['ret-return-tfsa',               'return_tfsa_pct',                       'number'],
    ['ret-return-crypto',             'return_crypto_pct',                     'number'],
    ['ret-return-ra',                 'return_ra_pct',                         'number'],

    ['ret-offshore-discretionary',    'offshore_discretionary_pct',            'number'],
    ['ret-offshore-tfsa',             'offshore_tfsa_pct',                     'number'],
    ['ret-zar-depre',                 'zar_depreciation_pct',                  'number'],

    ['ret-include-discretionary',     'opt_include_discretionary',             'checkbox'],
    ['ret-include-tfsa',              'opt_include_tfsa',                      'checkbox'],
    ['ret-include-crypto',            'opt_include_crypto',                    'checkbox'],

    ['ret-ra-commute',                'ra_commute_third',                      'checkbox'],
    ['ret-ra-vested',                 'ra_vested_balance',                     'number'],

    ['ret-opt-dutch',                 'opt_dutch_enabled',                     'checkbox'],
    ['ret-opt-dutch-rate',            'opt_dutch_eur_zar',                     'number'],
    ['ret-opt-dutch-age',             'opt_dutch_age',                         'number'],
    ['ret-opt-dutch-eur',             'opt_dutch_eur_monthly',                 'number'],
    ['ret-opt-tfsa',                  'opt_tfsa_enabled',                      'checkbox'],
    ['ret-opt-ra-monthly',            'opt_ra_monthly_enabled',                'checkbox'],
    ['ret-opt-ra-monthly-amount',     'opt_ra_monthly_amount',                 'number'],
    ['ret-opt-house',                 'opt_house_enabled',                     'checkbox'],
    ['ret-opt-house-value',           'opt_house_value',                       'number'],
    ['ret-opt-inherit',               'opt_inheritance_enabled',               'checkbox'],
    ['ret-opt-inherit-eur',           'opt_inheritance_eur',                   'number'],
    ['ret-opt-bond',                  'opt_bond_enabled',                      'checkbox'],
    ['ret-opt-bond-balance',          'opt_bond_balance',                      'number'],
    ['ret-opt-savings-pot',           'opt_savings_pot_withdrawal_enabled',    'checkbox'],
    ['ret-opt-savings-pot-amount',    'opt_savings_pot_withdrawal_annual',     'number'],

    ['ret-scenario-drawdown',         'ret_scenario_monthly_drawdown',         'number'],
];

function retApplyParamsToInputs() {
    retInputBindings.forEach(([id, key, type]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (type === 'checkbox') el.checked = !!retirementParams[key];
        else el.value = retirementParams[key] ?? '';
    });
}

function retReadInput(el, type) {
    if (type === 'checkbox') return el.checked ? 1 : 0;
    if (type === 'string') return el.value;
    const v = parseFloat(el.value);
    return Number.isNaN(v) ? 0 : v;
}

function retPersist() {
    Object.keys(retirementParams).forEach(k => { getConfigMap()[k] = retirementParams[k]; });
    persistConfig();
}

function retWireInputs() {
    retInputBindings.forEach(([id, key, type]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = (type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, () => {
            retirementParams[key] = retReadInput(el, type);
            // Enabling TFSA contributions implies including TFSA in the projection.
            if (id === 'ret-opt-tfsa' && retirementParams.opt_tfsa_enabled && !retirementParams.opt_include_tfsa) {
                retirementParams.opt_include_tfsa = 1;
                const incEl = document.getElementById('ret-include-tfsa');
                if (incEl) incEl.checked = true;
            }
            // Excluding TFSA from projection disables its contribution projection too.
            if (id === 'ret-include-tfsa' && !retirementParams.opt_include_tfsa && retirementParams.opt_tfsa_enabled) {
                retirementParams.opt_tfsa_enabled = 0;
                const contribEl = document.getElementById('ret-opt-tfsa');
                if (contribEl) contribEl.checked = false;
            }
            retPersist();
            renderRetirement();
        });
    });

    document.getElementById('ret-save-csv').addEventListener('click', () => {
        Object.keys(retirementParams).forEach(k => { getConfigMap()[k] = retirementParams[k]; });
        saveToServer('config_public',
            () => _generateConfigJSON(getConfigMap(), { public: true }),
            'ret-save-csv');
        saveToServer('config_private',
            () => _generateConfigJSON(getConfigMap(), { public: false }),
            null);
    });

    document.getElementById('ret-load-csv').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                retirementParams = _parseRetirementCSV(ev.target.result);
                retApplyParamsToInputs();
                renderRetirement();
            };
            reader.readAsText(f);
        };
        input.click();
    });
}

function renderRetirement() {
    const today = new Date();
    const snap = _calculateRetirementSnapshot({
        params: retirementParams,
        discretionaryToday: Number(getInvestmentData().currentValues.Discretionary) || 0,
        tfsaToday: Number(getInvestmentData().currentValues.TFSA) || 0,
        cryptoToday: Number(getInvestmentData().currentValues.Crypto) || 0,
        tfsaTransactions: (getInvestmentData().transactions || []).filter(t => t.type === 'TFSA'),
        raPotToday: retRaPotToday(),
        raAnnualContributionLast12: retRaAnnualLast12(),
    }, today);

    // Sidebar derived labels
    if (snap.ageNow !== null) {
        document.getElementById('ret-current-age').textContent = snap.ageNow.toFixed(1);
    } else {
        document.getElementById('ret-current-age').textContent = '—';
    }
    document.getElementById('ret-years-to-retirement').textContent = snap.yearsToRet.toFixed(1);
    document.getElementById('ret-drawdown-years').textContent = (snap.monthly.lumpSumDrawdownMonths / 12).toFixed(0);

    // Sidebar warnings
    const monthlyExtra = (retirementParams.opt_ra_monthly_enabled ? Number(retirementParams.opt_ra_monthly_amount) || 0 : 0);
    document.getElementById('ret-opt-ra-cap-warn').classList.toggle('hidden', monthlyExtra * 12 <= _RET_CONSTS.RA_DEDUCTION_CAP);

    const wd = retirementParams.opt_savings_pot_withdrawal_annual || 0;
    const wdEnabled = !!retirementParams.opt_savings_pot_withdrawal_enabled;
    document.getElementById('ret-opt-savings-pot-warn').classList.toggle('hidden', !(wdEnabled && wd > 0 && wd < _RET_CONSTS.SAVINGS_POT_MIN_WITHDRAWAL));

    const vestedHint = (Number(retirementParams.ra_vested_balance) || 0) === 0;
    document.getElementById('ret-ra-vested-hint').classList.toggle('hidden', !vestedHint);

    // Card placeholders — filled in subsequent tasks.
    let retirementBanner = '';
    if (snap.ageNow !== null && snap.ageNow >= Number(retirementParams.retirement_age)) {
        retirementBanner = `<div class="mb-4 p-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">You are already past your selected retirement age. All projections collapse to today's values.</div>`;
    }
    // Vested-balance validation
    if ((Number(retirementParams.ra_vested_balance) || 0) > retRaPotToday()) {
        retirementBanner += `<div class="mb-4 p-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">Vested balance exceeds current RA pot — using min(vested, raPotToday) for calculations.</div>`;
    }
    const realLabel = retirementParams.show_real_terms ? "today's money" : 'nominal';
    const cell = (current, projected) => {
        if (Math.round(current) === Math.round(projected)) {
            return `<div class="text-2xl font-bold text-indigo-700">${retFmtZAR(projected)}</div>`;
        }
        return `
            <div class="text-2xl font-bold text-indigo-700">${retFmtZAR(projected)}</div>
            <div class="text-xs text-slate-500">current: ${retFmtZAR(current)}</div>
        `;
    };
    document.getElementById('retirement-card-snapshot').innerHTML = `
        ${retirementBanner}
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 class="text-xl font-semibold text-slate-800">Snapshot</h2>
            <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${realLabel}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div></div>
            <div class="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Age 55</div>
            <div class="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Age ${Number(retirementParams.opt_dutch_age) || 68}</div>

            <div class="text-xs text-slate-600 self-center">Funds available (lump sum)</div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">${cell(snap.lumpSum.current55, snap.lumpSum.projected55)}</div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">${cell(snap.lumpSum.projected68, snap.lumpSum.projected68)}</div>

            <div class="text-xs text-slate-600 self-center">Monthly income (net)</div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                ${cell(snap.monthly.current55.net, snap.monthly.projected55.net)}
                ${snap.lumpSum.ra55IsDeMinimis ? `<div class="text-[10px] text-amber-700 mt-1">RA pot below R360k at 55 — full pot shown as lump sum above; monthly RA drawdown N/A.</div>` : ''}
            </div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">${cell(snap.monthly.projected68.net, snap.monthly.projected68.net)}</div>

            <div class="text-xs text-slate-600 self-center">Monthly from lump sum<div class="text-[10px] text-slate-400">PMT to age ${snap.monthly.lifeExpectancy} @ ${snap.monthly.lumpSumDrawdownReturnPct}%</div></div>
            <div class="md:col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-200"><div class="text-2xl font-bold text-indigo-700">${retFmtZAR(snap.monthly.lumpSumDrawdown)}</div><div class="text-xs text-slate-500">over ${snap.monthly.lumpSumDrawdownMonths} months (${(snap.monthly.lumpSumDrawdownMonths/12).toFixed(0)} yrs)</div></div>

            <div class="text-xs text-slate-700 font-semibold self-center">Max estimated monthly income<div class="text-[10px] text-slate-400 font-normal">RA + lump-sum drawdown; assumes all funds depleted by age ${snap.monthly.lifeExpectancy}</div></div>
            <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200"><div class="text-2xl font-bold text-emerald-700">${retFmtZAR(snap.monthly.maxAt55)}</div></div>
            <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200"><div class="text-2xl font-bold text-emerald-700">${retFmtZAR(snap.monthly.maxAt68)}</div></div>
        </div>
    `;
    const retAge = Number(retirementParams.retirement_age) || 65;
    const dutchAge = Number(retirementParams.opt_dutch_age) || _RET_CONSTS.DUTCH_PENSION_AGE;
    const monthlyPhases = [];
    if (retAge < _RET_CONSTS.RA_ACCESS_AGE) {
        monthlyPhases.push({
            title: `At retirement (age ${retAge}, before 55)`,
            net: 0, gross: 0,
            note: `RA not yet accessible. Until age 55: ${(_RET_CONSTS.RA_ACCESS_AGE - retAge)} years.`,
        });
        monthlyPhases.push({
            title: 'From age 55',
            net: snap.monthly.projected55.net,
            gross: snap.monthly.projected55.gross,
            note: 'RA drawdown begins.',
        });
    } else if (retAge < dutchAge) {
        monthlyPhases.push({
            title: `At retirement (age ${retAge})`,
            net: snap.monthly.atRetirement.net,
            gross: snap.monthly.atRetirement.gross,
            note: `RA drawdown.`,
        });
        monthlyPhases.push({
            title: `From age ${dutchAge}`,
            net: snap.monthly.projected68.net,
            gross: snap.monthly.projected68.gross,
            note: retirementParams.opt_dutch_enabled ? '+ Dutch pension' : '(Dutch pension disabled)',
        });
    } else {
        monthlyPhases.push({
            title: `At retirement (age ${retAge}, ≥ ${dutchAge})`,
            net: snap.monthly.atRetirement.net + snap.monthly.dutchMonthlyNet,
            gross: snap.monthly.atRetirement.gross + snap.monthly.dutchMonthlyZAR,
            note: 'RA drawdown + Dutch pension combined.',
        });
    }

    const deMinimisBanner = snap.monthly.atRetirement.fullCommutation
        ? `<div class="mb-3 p-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">Pot below de minimis (R360,000) — full commutation possible, drawdown N/A.</div>`
        : '';

    document.getElementById('retirement-card-monthly').innerHTML = `
        <h2 class="text-xl font-semibold text-slate-800 mb-4">Monthly income (net of tax)</h2>
        ${deMinimisBanner}
        <div class="space-y-3">
            ${monthlyPhases.map(ph => `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div class="text-xs text-slate-500">${ph.title}</div>
                    <div class="text-xl font-bold text-indigo-700">${retFmtZAR(ph.net)}</div>
                    <div class="text-xs text-slate-500">gross: ${retFmtZAR(ph.gross)}</div>
                    <div class="text-[11px] text-slate-500 mt-1">${ph.note}</div>
                </div>
            `).join('')}
        </div>
    `;
    const yearsTilTfsaCap = (() => {
        if (!retirementParams.opt_tfsa_enabled) return null;
        const tfsaTxs = (getInvestmentData().transactions || []).filter(t => t.type === 'TFSA');
        const lifetime = tfsaTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const remaining = Math.max(0, _RET_CONSTS.TFSA_LIFETIME_CAP - lifetime);
        return Math.ceil(remaining / _RET_CONSTS.TFSA_ANNUAL_CAP);
    })();

    const rows = [
        ['Discretionary', snap.liquid.atRetirement.discretionary, ''],
        ['TFSA', snap.liquid.atRetirement.tfsa,
            retirementParams.opt_tfsa_enabled
                ? `R${_RET_CONSTS.TFSA_ANNUAL_CAP.toLocaleString()}/yr; ~${yearsTilTfsaCap ?? 0} more years until lifetime cap.`
                : ''],
        ['Crypto', snap.liquid.atRetirement.crypto, ''],
    ];
    if (retirementParams.ra_commute_third) {
        rows.push(['1/3 RA commutation (gross)',
            snap.lumpSum.raCommutationAtRetirement.gross,
            `tax: ${retFmtZAR(snap.lumpSum.raCommutationAtRetirement.tax)} (first R550k tax-free)`]);
        rows.push(['1/3 RA commutation (net of tax)', snap.lumpSum.raCommutationAtRetirement.net, '']);
    }
    if (snap.ra.atRetirement.savingsPotWithdrawnNet > 0) {
        rows.push(['Savings-pot withdrawals (net)', snap.ra.atRetirement.savingsPotWithdrawnNet,
            `gross: ${retFmtZAR(snap.ra.atRetirement.savingsPotWithdrawnGross)}; tax: ${retFmtZAR(snap.ra.atRetirement.savingsPotTaxPaid)}`]);
    }
    if (retirementParams.opt_house_enabled) rows.push(['House sale', snap.lumpSum.houseSale, '']);
    if (retirementParams.opt_inheritance_enabled) rows.push(['Inheritance (ZAR)', snap.lumpSum.inheritanceZar,
        `${Number(retirementParams.opt_inheritance_eur)||0} EUR × ${retirementParams.opt_dutch_eur_zar} ZAR/EUR`]);
    if (retirementParams.opt_bond_enabled) rows.push(['Less: outstanding bond', -snap.lumpSum.bondPayoff, '']);

    const totalRow = snap.lumpSum.atRetirement;
    const totalClass = totalRow < 0 ? 'text-red-600' : 'text-indigo-700';

    document.getElementById('retirement-card-lumpsum').innerHTML = `
        <h2 class="text-xl font-semibold text-slate-800 mb-4">Instantly available at retirement (age ${retAge})</h2>
        <table class="w-full text-sm">
            <thead>
                <tr class="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">
                    <th class="text-left py-2">Source</th>
                    <th class="text-right py-2">Value at age ${retAge}</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(([label, value, note]) => `
                    <tr class="border-b border-slate-100">
                        <td class="py-2">
                            <div>${label}</div>
                            ${note ? `<div class="text-[11px] text-slate-500">${note}</div>` : ''}
                        </td>
                        <td class="py-2 text-right font-medium">${retFmtZARSign(value)}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr class="font-bold border-t border-slate-300">
                    <td class="py-2">Total</td>
                    <td class="py-2 text-right ${totalClass}">${retFmtZARSign(totalRow)}</td>
                </tr>
            </tfoot>
        </table>
        ${totalRow < 0 ? '<div class="mt-2 text-xs text-red-600">Outstanding bond exceeds lump-sum funds. You may need additional liquidity at retirement.</div>' : ''}
    `;
    const ra = snap.ra;
    const raPotTodayValue = retRaPotToday();
    let depletionLine = '';
    if (ra.depletion) {
        const depAge = ra.depletion.ageAtThreshold.toFixed(1);
        if (ra.depletion.ageAtThreshold <= dutchAge && retirementParams.opt_dutch_enabled) {
            depletionLine = `<div class="mt-3 p-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">RA pot expected to deplete below R150k by age ${depAge} — drawdown income ends, full commutation triggers; from then on income = Dutch pension only.</div>`;
        } else {
            depletionLine = `<div class="mt-3 p-2 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded">Living-annuity threshold note: pot expected below R150,000 by age ${depAge}.</div>`;
        }
    }

    const savingsWdLine = (retirementParams.opt_savings_pot_withdrawal_enabled && ra.atRetirement.savingsPotWithdrawnGross > 0)
        ? `<div class="text-xs text-slate-600 mt-2">
            Pre-retirement savings-pot withdrawals:
            gross ${retFmtZAR(ra.atRetirement.savingsPotWithdrawnGross)},
            tax ${retFmtZAR(ra.atRetirement.savingsPotTaxPaid)},
            net to discretionary ${retFmtZAR(ra.atRetirement.savingsPotWithdrawnNet)}.
           </div>`
        : '';

    // Compute monthly drawdown for display (mirrors raMonthlyIncome but without the de minimis branch).
    const _drawdownAnnuitised = retirementParams.ra_commute_third ? ra.atRetirement.total * 2 / 3 : ra.atRetirement.total;
    const _drawdownGross = _drawdownAnnuitised * ((Number(retirementParams.withdrawal_rate_pct) || 0) / 100) / 12;
    const _drawdownNet = _drawdownGross * (1 - (Number(retirementParams.effective_tax_rate_pct) || 0) / 100);

    document.getElementById('retirement-card-rapot').innerHTML = `
        <h2 class="text-xl font-semibold text-slate-800 mb-4">RA pot at retirement</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider">${retRaPotTodayIsActual() ? 'Today (actual fund value from RA tab)' : 'Today (estimated from contributions × return)'}</div>
                <div class="text-xl font-bold text-slate-800">${retFmtZAR(raPotTodayValue)}</div>
                <div class="text-xs text-slate-500 mt-1">Vested: ${retFmtZAR(ra.vestedToday)}</div>
                <div class="text-xs text-slate-500">Savings: ${retFmtZAR(ra.savingsToday)}</div>
                <div class="text-xs text-slate-500">Retirement: ${retFmtZAR(ra.retirementToday)}</div>
                ${retRaPotTodayIsActual() ? '' : '<div class="text-[10px] text-slate-400 mt-1">Set a current fund value on the RA tab to use the real situation.</div>'}
            </div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider">At retirement age ${retirementParams.retirement_age}</div>
                <div class="text-xl font-bold text-indigo-700">${retFmtZAR(ra.atRetirement.total)}</div>
                <div class="text-xs text-slate-500 mt-1">Vested: ${retFmtZAR(ra.atRetirement.vested)}</div>
                <div class="text-xs text-slate-500">Savings: ${retFmtZAR(ra.atRetirement.savings)}</div>
                <div class="text-xs text-slate-500">Retirement: ${retFmtZAR(ra.atRetirement.retirement)}</div>
            </div>
        </div>
        ${savingsWdLine}
        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider">${retirementParams.ra_commute_third ? '1/3 commuted (gross / tax / net)' : 'Commutation off'}</div>
                <div class="text-sm font-medium text-slate-800">
                    ${retirementParams.ra_commute_third
                        ? `${retFmtZAR(ra.commutationAtRetirement.gross)} / ${retFmtZAR(ra.commutationAtRetirement.tax)} / ${retFmtZAR(ra.commutationAtRetirement.net)}`
                        : '—'}
                </div>
            </div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider">Monthly drawdown</div>
                <div class="text-sm font-medium text-slate-800">gross ${retFmtZAR(_drawdownGross)} / net ${retFmtZAR(_drawdownNet)}</div>
            </div>
        </div>
        ${depletionLine}
    `;
    const assumptionRows = [
        ['Date of birth', retirementParams.dob],
        ['Retirement age', retirementParams.retirement_age],
        ['CPI', `${retirementParams.cpi_pct}%`],
        ['Effective retirement income tax', `${retirementParams.effective_tax_rate_pct}%`],
        ['Withdrawal rate', `${retirementParams.withdrawal_rate_pct}%`],
        ['Returns (Discretionary / TFSA / Crypto / RA)', `${retirementParams.return_discretionary_pct}% / ${retirementParams.return_tfsa_pct}% / ${retirementParams.return_crypto_pct}% / ${retirementParams.return_ra_pct}%`],
        ['Offshore (Discretionary / TFSA)', `${retirementParams.offshore_discretionary_pct}% / ${retirementParams.offshore_tfsa_pct}%`],
        ['ZAR depreciation', `${retirementParams.zar_depreciation_pct}%/yr`],
        ['Two-pot split', '33% savings / 67% retirement (post-Sep-2024 contributions)'],
        ['Commutation', retirementParams.ra_commute_third ? '1/3 lump sum on' : 'off'],
        ['TFSA cap remaining', retFmtZAR(Math.max(0, _RET_CONSTS.TFSA_LIFETIME_CAP - (getInvestmentData().transactions || []).filter(t => t.type === 'TFSA').reduce((s, t) => s + (Number(t.amount) || 0), 0)))],
        ['RA deduction-cap headroom', retFmtZAR(snap.ra.deductionCapHeadroom) + ' / yr'],
        ['Hard constants', `de minimis R${_RET_CONSTS.DE_MINIMIS.toLocaleString()}, living-annuity threshold R${_RET_CONSTS.LIVING_ANNUITY_THRESHOLD.toLocaleString()}, lump-sum tax-free R${_RET_CONSTS.LUMP_SUM_TAX_FREE.toLocaleString()}`],
    ];
    document.getElementById('retirement-card-assumptions').innerHTML = `
        <details>
            <summary class="cursor-pointer">
                <span class="text-xl font-semibold text-slate-800">Assumptions</span>
                <span class="text-xs text-slate-500 ml-2">(click to expand)</span>
            </summary>
            <table class="w-full text-sm mt-3">
                <tbody>
                    ${assumptionRows.map(([k, v]) => `
                        <tr class="border-b border-slate-100">
                            <td class="py-1.5 text-slate-500">${k}</td>
                            <td class="py-1.5 text-slate-800 text-right">${v}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </details>
    `;

    window.__retirementSnapshot = snap; // Exposed for manual debugging only.

    _renderRetirementScenarioCharts({
        containerIncome: document.getElementById('retirement-chart-income'),
        containerCapital: document.getElementById('retirement-chart-capital'),
        badge: document.getElementById('retirement-scenario-badge'),
        snapshot: snap,
    });
}

retApplyParamsToInputs();
retWireInputs();

const loadRetirementFromConfig = () => {
    retirementParams = { ..._getDefaultRetirementParams(), ...getConfigMap() };
    retApplyParamsToInputs();
    renderRetirement();
};
// Note: do NOT call loadRetirementFromConfig() here. It depends
// on the config being loaded; the init IIFE invokes it.

export { renderRetirement, loadRetirementFromConfig };
