        import {
            calculateInvestmentPerformance as _calculateInvestmentPerformance,
            taxYearLabel as _taxYearLabel,
            parseRaCSV as _parseRaCSV,
            generateRaTransactionsCSV as _generateRaTransactionsCSV,
            calculatePotValueToday as _calculatePotValueToday,
            RETIREMENT_CONSTANTS as _RET_CONSTS,
            getDefaultRetirementParams as _getDefaultRetirementParams,
            parseRetirementCSV as _parseRetirementCSV,
            calculateRetirementSnapshot as _calculateRetirementSnapshot,
            generateConfigJSON as _generateConfigJSON,
            PUBLIC_PARAMS as _PUBLIC_PARAMS,
        } from './calculations.js';
        import { renderRetirementCharts as _renderRetirementCharts } from './chart_retirement.js';
        import { fmtZAR, fmtZARWhole, fmtZARSigned } from './format.js';
        import { createRowElement } from './app/rows.js';
        import { renderPerformancePanel } from './app/perf-panel.js';
        import { isTestMode, setTestMode, dbPath, debouncedSave, saveToServer,
                 getConfigMap, loadConfigFromServer, persistConfig, setConfig, unsetConfig } from './app/persistence.js';
        import { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer,
                 applyPlannedSavingsFromConfig } from './app/budget.js';
        import { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer,
                 getInvestmentData, setOnStateChanged as setInvestmentsChanged } from './app/investments.js';
        import { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer, getDebtData } from './app/debt.js';

        document.addEventListener('DOMContentLoaded', () => {
            // --- TAB NAVIGATION ---
            const tabBudget = document.getElementById('tab-budget');
            const tabInvestment = document.getElementById('tab-investment');
            const tabDebt = document.getElementById('tab-debt');
            const tabHistory = document.getElementById('tab-history');
            const tabRa = document.getElementById('tab-ra');
            const tabRetirement = document.getElementById('tab-retirement');
            const contentBudget = document.getElementById('budget-content');
            const contentInvestment = document.getElementById('investment-content');
            const contentDebt = document.getElementById('debt-content');
            const contentHistory = document.getElementById('history-content');
            const contentRa = document.getElementById('ra-content');
            const contentRetirement = document.getElementById('retirement-content');

            // onShow thunks are evaluated at click time, so they may reference render
            // functions defined later in this file.
            const TABS = {
                budget:     { tab: tabBudget,     content: contentBudget },
                investment: { tab: tabInvestment, content: contentInvestment },
                debt:       { tab: tabDebt,       content: contentDebt },
                ra:         { tab: tabRa,         content: contentRa,         onShow: () => renderRa() },
                retirement: { tab: tabRetirement, content: contentRetirement, onShow: () => renderRetirement() },
                history:    { tab: tabHistory,    content: contentHistory,    onShow: () => renderHistory() },
            };

            const switchTab = (name) => {
                Object.values(TABS).forEach(({ tab, content }) => {
                    tab.classList.remove('border-indigo-500', 'text-indigo-600');
                    tab.classList.add('border-transparent', 'text-slate-500');
                    content.classList.add('hidden');
                });
                const target = TABS[name];
                target.tab.classList.add('border-indigo-500', 'text-indigo-600');
                target.tab.classList.remove('border-transparent', 'text-slate-500');
                target.content.classList.remove('hidden');
                if (target.onShow) target.onShow();
            };

            Object.entries(TABS).forEach(([name, { tab }]) =>
                tab.addEventListener('click', () => switchTab(name)));

            document.getElementById('refresh-budget').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('budget');
                calculateAndDisplaySummary();
                renderBudget();
            });

            document.getElementById('refresh-investment').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('investment');
                renderFullInvestmentUI();
                updatePerformanceDisplay();
            });

            document.getElementById('refresh-debt').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('debt');
                calculateDebtProjection();
                renderRepayments();
            });

            document.getElementById('refresh-ra').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('ra');
                renderRa();
            });

            document.getElementById('refresh-retirement').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('retirement');
                renderRetirement();
            });

            // --- RA STATE ---
            let raTransactions = [];
            // Actual current fund value reported by the user (from RA statement).
            // `undefined` means not entered → fall back to the contributions-based estimate.
            let raCurrentValue;
            let raParams = {
                tax_refund_rate_pct: 41,
                nominal_return_pct: 10,
            };

            const raMakeId = () => 'ra_' + Math.random().toString(36).slice(2, 9);
            const raFmtZARShort = fmtZARWhole;
            const raFmtZAR = fmtZAR;

            function updateRaPerformanceDisplay() {
                const cv = (raCurrentValue !== undefined && raCurrentValue !== null && raCurrentValue !== '')
                    ? Number(raCurrentValue) || 0
                    : 0;
                const r = _calculateInvestmentPerformance(raTransactions, cv, new Date(), 0);
                renderPerformancePanel(r, {
                    invested:     document.getElementById('ra-invested'),
                    gain:         document.getElementById('ra-gain'),
                    ann:          document.getElementById('ra-ann'),
                    money:        document.getElementById('ra-gain-money'),
                    savingsGain:  document.getElementById('ra-savings-gain'),
                    netVsSavings: document.getElementById('ra-net-savings'),
                }, { fmt: fmtZAR });
            }

            function renderRa() {
                document.getElementById('ra-refund-rate').value      = raParams.tax_refund_rate_pct;
                document.getElementById('ra-current-value').value    = (raCurrentValue ?? '');

                const total = raTransactions.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                document.getElementById('ra-total-contributed').textContent = raFmtZARShort(total);
                document.getElementById('ra-count').textContent = raTransactions.length;
                if (raTransactions.length > 0) {
                    const sortedAsc = [...raTransactions].sort((a, b) => a.date.localeCompare(b.date));
                    document.getElementById('ra-first-date').textContent = sortedAsc[0].date;
                    document.getElementById('ra-last-date').textContent  = sortedAsc[sortedAsc.length - 1].date;
                } else {
                    document.getElementById('ra-first-date').textContent = '—';
                    document.getElementById('ra-last-date').textContent  = '—';
                }

                const today = new Date();
                const currentYearLabel = _taxYearLabel(today);
                const currentYearTotal = raTransactions
                    .filter(t => _taxYearLabel(new Date(t.date + 'T00:00:00Z')) === currentYearLabel)
                    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
                document.getElementById('ra-current-year-total').textContent = raFmtZARShort(currentYearTotal);

                const RA_DEDUCTIBLE_CAP = 430000;
                const expectedCurrentYearRefund = Math.min(currentYearTotal, RA_DEDUCTIBLE_CAP) * (raParams.tax_refund_rate_pct / 100);
                document.getElementById('ra-current-year-refund').textContent = raFmtZARShort(expectedCurrentYearRefund);
                updateRaPerformanceDisplay();

                const yearTotals = new Map();
                raTransactions.forEach(t => {
                    const d = new Date(t.date + 'T00:00:00Z');
                    if (Number.isNaN(d.getTime())) return;
                    const label = _taxYearLabel(d);
                    yearTotals.set(label, (yearTotals.get(label) || 0) + (Number(t.amount) || 0));
                });
                const anyCapHit = [...yearTotals.values()].some(v => v > RA_DEDUCTIBLE_CAP);
                document.getElementById('ra-cap-warning').classList.toggle('hidden', !anyCapHit);

                const list = document.getElementById('ra-list');
                const sortedDesc = [...raTransactions].sort((a, b) => b.date.localeCompare(a.date));
                list.innerHTML = '';
                sortedDesc.forEach(t => {
                    list.appendChild(createRowElement(t, {
                        gridTemplateColumns: '1fr 2fr 1fr auto',
                        fields: ['date', 'description', 'amount'],
                        compact: true,
                    }));
                });
            }

            const raList = document.getElementById('ra-list');
            raList.addEventListener('change', (e) => {
                const row = e.target.closest('[data-id]');
                if (!row) return;
                const tx = raTransactions.find(t => t.id === row.dataset.id);
                if (!tx) return;
                if (e.target.classList.contains('date-input')) {
                    tx.date = e.target.value; raPersist(); renderRa();
                } else if (e.target.classList.contains('description-input')) {
                    tx.description = e.target.value; raPersist();
                } else if (e.target.classList.contains('amount-input')) {
                    tx.amount = parseFloat(e.target.value) || 0; raPersist(); renderRa();
                }
            });
            raList.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-btn')) return;
                const row = e.target.closest('[data-id]');
                if (!row) return;
                raTransactions = raTransactions.filter(t => t.id !== row.dataset.id);
                raPersist();
                renderRa();
            });

            const raTodayIso = () => new Date().toISOString().slice(0, 10);

            document.getElementById('ra-add-contribution').addEventListener('click', () => {
                raTransactions.push({
                    id: raMakeId(),
                    date: raTodayIso(),
                    description: 'monthly repayment',
                    amount: 0,
                });
                raPersist();
                renderRa();
            });

            document.getElementById('ra-refund-rate').addEventListener('input', (e) => {
                raParams.tax_refund_rate_pct = parseFloat(e.target.value) || 0;
                setConfig('tax_refund_rate_pct', raParams.tax_refund_rate_pct);
                renderRa();
            });
            document.getElementById('ra-current-value').addEventListener('input', (e) => {
                const raw = e.target.value;
                if (raw === '') {
                    raCurrentValue = undefined;
                } else {
                    const v = parseFloat(raw);
                    raCurrentValue = Number.isNaN(v) ? undefined : v;
                }
                raPersist();
                updateRaPerformanceDisplay();
                if (typeof renderRetirement === 'function') renderRetirement();
            });
            const generateRaCSVFromState = () => _generateRaTransactionsCSV(raTransactions, raCurrentValue);

            function raPersist() {
                debouncedSave('transactions_ra', generateRaCSVFromState, 'save-ra-csv');
            }

            document.getElementById('save-ra-csv').addEventListener('click', () => {
                saveToServer('transactions_ra', generateRaCSVFromState, 'save-ra-csv');
            });

            document.getElementById('load-ra-csv').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const parsed = _parseRaCSV(ev.target.result);
                        raTransactions = parsed.transactions;
                        raCurrentValue = parsed.currentValue;
                        raParams = {
                            tax_refund_rate_pct: getConfigMap().tax_refund_rate_pct ?? parsed.params.tax_refund_rate_pct ?? 41,
                            nominal_return_pct:  getConfigMap().nominal_return_pct  ?? parsed.params.nominal_return_pct  ?? 10,
                        };
                        let dirty = false;
                        if (getConfigMap().tax_refund_rate_pct === undefined && parsed.params.tax_refund_rate_pct !== undefined) {
                            getConfigMap().tax_refund_rate_pct = parsed.params.tax_refund_rate_pct;
                            dirty = true;
                        }
                        if (getConfigMap().nominal_return_pct === undefined && parsed.params.nominal_return_pct !== undefined) {
                            getConfigMap().nominal_return_pct = parsed.params.nominal_return_pct;
                            dirty = true;
                        }
                        if (dirty) persistConfig();
                        renderRa();
                    };
                    reader.readAsText(f);
                };
                input.click();
            });

            // Initial render so the empty state is visible immediately
            renderRa();

            const loadRaCSVFromServer = async () => {
                try {
                    const response = await fetch(dbPath('transactions/ra.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        const parsed = _parseRaCSV(text);
                        raTransactions = parsed.transactions;
                        raCurrentValue = parsed.currentValue;
                    } else {
                        raTransactions = [];
                        raCurrentValue = undefined;
                    }
                } catch (err) {
                    console.error('Failed to load RA transactions:', err);
                    raTransactions = [];
                    raCurrentValue = undefined;
                }
                raParams = {
                    tax_refund_rate_pct: getConfigMap().tax_refund_rate_pct ?? 41,
                    nominal_return_pct:  getConfigMap().nominal_return_pct  ?? 10,
                };
                renderRa();
            };
            // Note: do NOT call loadRaCSVFromServer() here. It depends on
            // the config being loaded first; the init IIFE invokes it.


            // --- HISTORY TAB ---
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

            const updateTestModeUI = () => {
                const btn = document.getElementById('test-mode-btn');
                const dot = document.getElementById('test-mode-dot');
                const label = document.getElementById('test-mode-label');
                if (isTestMode()) {
                    btn.classList.remove('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
                    btn.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-700');
                    dot.classList.remove('bg-slate-300');
                    dot.classList.add('bg-amber-400');
                    label.classList.remove('hidden');
                } else {
                    btn.classList.add('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
                    btn.classList.remove('border-amber-300', 'bg-amber-50', 'text-amber-700');
                    dot.classList.add('bg-slate-300');
                    dot.classList.remove('bg-amber-400');
                    label.classList.add('hidden');
                }
            };

            document.getElementById('test-mode-btn').addEventListener('click', async () => {
                setTestMode(!isTestMode());
                updateTestModeUI();
                try {
                    await loadConfigFromServer();           // config first — tabs read it
                    applyPlannedSavingsFromConfig();        // prefill planned-savings input
                    await Promise.all([
                        loadBudgetCSVFromServer(),
                        loadInvestmentCSVFromServer(),
                        loadDebtCSVFromServer(),
                        loadRaCSVFromServer(),
                    ]);
                    loadRetirementFromConfig();             // synchronous — uses getConfigMap()
                } catch (err) {
                    console.error('Test mode load failed, reverting:', err);
                    setTestMode(!isTestMode());
                    updateTestModeUI();
                }
            });

            // --- INITIALIZATION ---
            (async () => {
                await loadConfigFromServer();          // must run before tabs that read the config
                applyPlannedSavingsFromConfig();       // prefill planned-savings input
                try {
                    await loadBudgetCSVFromServer();
                } catch (err) {
                    console.warn('Automatic Budget CSV load failed.', err);
                    renderBudget();
                }

                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
                await loadRaCSVFromServer();
                loadRetirementFromConfig();
            })();

            // --- RETIREMENT STATE ---
            let retirementParams = _getDefaultRetirementParams();

            const retFmtZAR = fmtZARWhole;
            const retFmtZARSign = fmtZARSigned;

            // Returns the RA pot today (live read from RA tab state).
            // Prefer the user-entered actual fund value (real situation). Fall back to the
            // contributions × nominal-return estimate when no actual value has been entered.
            const retRaPotToday = () => {
                if (raCurrentValue !== undefined && raCurrentValue !== null && raCurrentValue !== '') {
                    return Number(raCurrentValue) || 0;
                }
                return _calculatePotValueToday(
                    raTransactions || [],
                    (raParams && raParams.nominal_return_pct) || retirementParams.return_ra_pct,
                    new Date()
                );
            };
            const retRaPotTodayIsActual = () =>
                (raCurrentValue !== undefined && raCurrentValue !== null && raCurrentValue !== '');

            // Sum of last-12-months RA contributions for deduction-cap headroom display.
            const retRaAnnualLast12 = () => {
                const today = new Date();
                const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
                return (raTransactions || [])
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

                _renderRetirementCharts({
                    containerIncome: document.getElementById('retirement-chart-income'),
                    containerCapital: document.getElementById('retirement-chart-capital'),
                    badge: document.getElementById('retirement-charts-badge'),
                    snapshot: snap,
                });
            }

            setInvestmentsChanged(() => renderRetirement());

            retApplyParamsToInputs();
            retWireInputs();

            const loadRetirementFromConfig = () => {
                retirementParams = { ..._getDefaultRetirementParams(), ...getConfigMap() };
                retApplyParamsToInputs();
                renderRetirement();
            };
            // Note: do NOT call loadRetirementFromConfig() here. It depends
            // on the config being loaded; the init IIFE invokes it.
        });
