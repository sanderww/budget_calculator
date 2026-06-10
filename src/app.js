        import {
            getUpcoming25th as _getUpcoming25th,
            calculateBudgetSummary as _calculateBudgetSummary,
            calculateMonthlyAllocation as _calcMonthlyAllocation,
            calculateInvestmentPerformance as _calculateInvestmentPerformance,
            monthlyInterestFactor as _monthlyInterestFactor,
            calculateDebtResults as _calculateDebtResults,
            xirr as _xirr,
            parseBudgetCSV as _parseBudgetCSV,
            generateBudgetCSV as _generateBudgetCSV,
            parseInvestmentCSV as _parseInvestmentCSV,
            generateInvestmentCSV as _generateInvestmentCSV,
            parseDebtCSV as _parseDebtCSV,
            generateDebtCSV as _generateDebtCSV,
            taxYearLabel as _taxYearLabel,
            parseRaCSV as _parseRaCSV,
            generateRaTransactionsCSV as _generateRaTransactionsCSV,
            calculatePotValueToday as _calculatePotValueToday,
            RETIREMENT_CONSTANTS as _RET_CONSTS,
            getDefaultRetirementParams as _getDefaultRetirementParams,
            parseRetirementCSV as _parseRetirementCSV,
            calculateRetirementSnapshot as _calculateRetirementSnapshot,
            tfsaLifetimeContributions as _tfsaLifetimeContributions,
            parseConfigJSON as _parseConfigJSON,
            generateConfigJSON as _generateConfigJSON,
            PUBLIC_PARAMS as _PUBLIC_PARAMS,
        } from './calculations.js';
        import { renderBudgetTimeline as _renderBudgetTimeline } from './chart_budget_timeline.js';
        import { renderRetirementCharts as _renderRetirementCharts } from './chart_retirement.js';

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

            const switchTab = (tab) => {
                // Reset all tabs
                [tabBudget, tabInvestment, tabDebt, tabHistory, tabRa, tabRetirement].forEach(t => {
                    t.classList.remove('border-indigo-500', 'text-indigo-600');
                    t.classList.add('border-transparent', 'text-slate-500');
                });
                [contentBudget, contentInvestment, contentDebt, contentHistory, contentRa, contentRetirement].forEach(c => c.classList.add('hidden'));

                // Activate selected tab
                if (tab === 'budget') {
                    tabBudget.classList.add('border-indigo-500', 'text-indigo-600');
                    tabBudget.classList.remove('border-transparent', 'text-slate-500');
                    contentBudget.classList.remove('hidden');
                } else if (tab === 'investment') {
                    tabInvestment.classList.add('border-indigo-500', 'text-indigo-600');
                    tabInvestment.classList.remove('border-transparent', 'text-slate-500');
                    contentInvestment.classList.remove('hidden');
                } else if (tab === 'debt') {
                    tabDebt.classList.add('border-indigo-500', 'text-indigo-600');
                    tabDebt.classList.remove('border-transparent', 'text-slate-500');
                    contentDebt.classList.remove('hidden');
                } else if (tab === 'ra') {
                    tabRa.classList.add('border-indigo-500', 'text-indigo-600');
                    tabRa.classList.remove('border-transparent', 'text-slate-500');
                    contentRa.classList.remove('hidden');
                    renderRa();
                } else if (tab === 'retirement') {
                    tabRetirement.classList.add('border-indigo-500', 'text-indigo-600');
                    tabRetirement.classList.remove('border-transparent', 'text-slate-500');
                    contentRetirement.classList.remove('hidden');
                    renderRetirement();
                } else if (tab === 'history') {
                    tabHistory.classList.add('border-indigo-500', 'text-indigo-600');
                    tabHistory.classList.remove('border-transparent', 'text-slate-500');
                    contentHistory.classList.remove('hidden');
                    renderHistory();
                }
            };

            tabBudget.addEventListener('click', () => switchTab('budget'));
            tabInvestment.addEventListener('click', () => switchTab('investment'));
            tabDebt.addEventListener('click', () => switchTab('debt'));
            tabRa.addEventListener('click', () => switchTab('ra'));
            tabRetirement.addEventListener('click', () => switchTab('retirement'));
            tabHistory.addEventListener('click', () => switchTab('history'));

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

            // --- TEST MODE ---
            let testMode = false;
            const dbPath = (filename) => testMode ? `db/test/${filename}` : `db/${filename}`;
            const saveKey = (name) => testMode ? `test_${name}` : name;

            // --- SERVER SAVE HELPERS ---
            const _saveTimers = {};
            const debouncedSave = (name, csvFn, btnId, delayMs = 800) => {
                clearTimeout(_saveTimers[name]);
                _saveTimers[name] = setTimeout(() => saveToServer(name, csvFn, btnId), delayMs);
            };

            const saveToServer = async (name, csvFn, btnId) => {
                const csv = csvFn();
                try {
                    const headers = { 'Content-Type': 'text/csv' };
                    if (testMode) headers['X-Test-Mode'] = 'true';
                    const res = await fetch(`/api/save/${saveKey(name)}`, {
                        method: 'POST',
                        headers,
                        body: csv
                    });
                    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
                    if (btnId) {
                        const btn = document.getElementById(btnId);
                        if (btn) {
                            const orig = btn.innerHTML;
                            btn.innerHTML = 'Saved!';
                            setTimeout(() => btn.innerHTML = orig, 1500);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to save ${name}:`, err);
                }
            };

            // --- SHARED CONFIG LAYER ---
            // Single source of truth for every param-style value. Loaded from
            // db/config.public.json + db/config.private.json at startup and
            // rewritten on any change.
            let configMap = {};

            const loadConfigFromServer = async () => {
                try {
                    const [pubRes, privRes] = await Promise.all([
                        fetch(dbPath('config.public.json'), { cache: 'no-store' }),
                        fetch(dbPath('config.private.json'), { cache: 'no-store' }),
                    ]);
                    const pubText  = pubRes.ok  ? await pubRes.text()  : '';
                    const privText = privRes.ok ? await privRes.text() : '';
                    configMap = { ..._parseConfigJSON(pubText), ..._parseConfigJSON(privText) };
                } catch (err) {
                    console.error('Failed to load config:', err);
                    configMap = {};
                }
            };

            const persistConfig = () => {
                debouncedSave('config_public',
                    () => _generateConfigJSON(configMap, { public: true }),
                    null);
                debouncedSave('config_private',
                    () => _generateConfigJSON(configMap, { public: false }),
                    null);
            };

            const setConfig = (key, value) => {
                configMap[key] = value;
                persistConfig();
            };

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
            const raFmtZARShort = (n) => 'R ' + Math.round(Number(n) || 0).toLocaleString('en-ZA');
            const raFmtZAR = (n) => `R ${(parseFloat(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            function updateRaPerformanceDisplay() {
                const cv = (raCurrentValue !== undefined && raCurrentValue !== null && raCurrentValue !== '')
                    ? Number(raCurrentValue) || 0
                    : 0;
                const r = _calculateInvestmentPerformance(raTransactions, cv, new Date(), 0);

                document.getElementById('ra-invested').textContent = raFmtZAR(r.totalInvested);

                const gainEl     = document.getElementById('ra-gain');
                const annEl      = document.getElementById('ra-ann');
                const moneyEl    = document.getElementById('ra-gain-money');
                const savingsEl  = document.getElementById('ra-savings-gain');
                const netEl      = document.getElementById('ra-net-savings');

                if (r.totalInvested === 0) {
                    gainEl.textContent = '0.00%';   gainEl.className = 'font-bold text-slate-800';
                    annEl.textContent  = '0.00%';   annEl.className  = 'font-bold text-slate-800';
                    moneyEl.textContent = 'R 0.00'; moneyEl.className = 'font-bold text-slate-800';
                    savingsEl.textContent = 'R 0.00';
                    netEl.textContent     = 'R 0.00';
                    netEl.className       = 'font-medium text-slate-800';
                    return;
                }

                gainEl.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
                gainEl.className   = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

                moneyEl.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${raFmtZAR(r.absoluteReturn)}`;
                moneyEl.className   = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

                savingsEl.textContent = `+${raFmtZAR(r.savingsGain)}`;

                netEl.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${raFmtZAR(r.netVsSavings)}`;
                netEl.className   = `font-bold ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;

                if (r.annualizedReturn === null) {
                    annEl.textContent = 'N/A';
                    annEl.className   = 'font-bold text-slate-400';
                } else {
                    annEl.textContent = `${r.annualizedReturn >= 0 ? '+' : ''}${r.annualizedReturn.toFixed(2)}%`;
                    annEl.className   = `font-bold ${r.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                }
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
                list.innerHTML = sortedDesc.map(t => `
                    <div class="grid gap-2 items-center bg-slate-50 p-2 rounded" style="grid-template-columns: 1fr 2fr 1fr auto;" data-id="${t.id}">
                        <input type="date" class="input-field text-sm ra-row-date" value="${t.date}">
                        <input type="text" class="input-field text-sm ra-row-desc" value="${(t.description || '').replace(/"/g, '&quot;')}">
                        <div class="relative">
                            <span class="currency-prefix text-sm">R</span>
                            <input type="number" class="input-field amount-input text-sm ra-row-amount" value="${t.amount}" step="0.01" min="0">
                        </div>
                        <button class="btn btn-danger text-xs ra-row-delete">×</button>
                    </div>
                `).join('');

                list.querySelectorAll('[data-id]').forEach(row => {
                    const id = row.getAttribute('data-id');
                    row.querySelector('.ra-row-date').addEventListener('change', (e) => {
                        const tx = raTransactions.find(t => t.id === id);
                        if (tx) { tx.date = e.target.value; raPersist(); renderRa(); }
                    });
                    row.querySelector('.ra-row-desc').addEventListener('change', (e) => {
                        const tx = raTransactions.find(t => t.id === id);
                        if (tx) { tx.description = e.target.value; raPersist(); }
                    });
                    row.querySelector('.ra-row-amount').addEventListener('change', (e) => {
                        const tx = raTransactions.find(t => t.id === id);
                        if (tx) { tx.amount = parseFloat(e.target.value) || 0; raPersist(); renderRa(); }
                    });
                    row.querySelector('.ra-row-delete').addEventListener('click', () => {
                        raTransactions = raTransactions.filter(t => t.id !== id);
                        raPersist();
                        renderRa();
                    });
                });
            }

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
                            tax_refund_rate_pct: configMap.tax_refund_rate_pct ?? parsed.params.tax_refund_rate_pct ?? 41,
                            nominal_return_pct:  configMap.nominal_return_pct  ?? parsed.params.nominal_return_pct  ?? 10,
                        };
                        let dirty = false;
                        if (configMap.tax_refund_rate_pct === undefined && parsed.params.tax_refund_rate_pct !== undefined) {
                            configMap.tax_refund_rate_pct = parsed.params.tax_refund_rate_pct;
                            dirty = true;
                        }
                        if (configMap.nominal_return_pct === undefined && parsed.params.nominal_return_pct !== undefined) {
                            configMap.nominal_return_pct = parsed.params.nominal_return_pct;
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
                    tax_refund_rate_pct: configMap.tax_refund_rate_pct ?? 41,
                    nominal_return_pct:  configMap.nominal_return_pct  ?? 10,
                };
                renderRa();
            };
            // Note: do NOT call loadRaCSVFromServer() here. It depends on
            // configMap being loaded first; the init IIFE invokes it.

            // --- BUDGET CALCULATOR LOGIC ---
            // (Existing Logic Wrapped)
            let budgetData = {
                savings: 0,
                debts: [],
                provisions: [],
                futureCosts: []
            };

            const savingsInput = document.getElementById('savings');
            const debtList = document.getElementById('debt-list');
            const provisionList = document.getElementById('provision-list');
            const futureCostList = document.getElementById('future-cost-list');
            const futureDateInput = document.getElementById('future-date');

            const addDebtBtn = document.getElementById('add-debt');
            const addProvisionBtn = document.getElementById('add-provision');
            const addFutureCostBtn = document.getElementById('add-future-cost');

            const saveCsvBtn = document.getElementById('save-csv');

            const availableMoneyInput = document.getElementById('available-money');
            const mortgagePercentageInput = document.getElementById('mortgage-percentage');
            const eftPercentageInput = document.getElementById('eft-percentage');
            const cryptoPercentageInput = document.getElementById('crypto-percentage');
            const calculateAllocationBtn = document.getElementById('calculate-allocation');
            const allocationResults = document.getElementById('allocation-results');

            const formatCurrency = (value) => {
                const num = parseFloat(value) || 0;
                return `R ${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };

            const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const getUpcoming25th = () => _getUpcoming25th(new Date());

            const renderBudget = () => {
                savingsInput.value = budgetData.savings || '';
                renderList(debtList, budgetData.debts, createDebtItem);
                renderList(provisionList, budgetData.provisions, createProvisionItem);
                renderList(futureCostList, budgetData.futureCosts, createFutureCostItem);
                calculateAndDisplaySummary();
            };

            const renderList = (container, items, createItemFn) => {
                container.innerHTML = '';
                if (items.length === 0) {
                    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">No items added yet.</p>`;
                } else {
                    items.forEach(item => container.appendChild(createItemFn(item)));
                }
            };

            const createGenericItem = (item, hasDate = false) => {
                const div = document.createElement('div');
                div.className = 'grid gap-2 items-center';
                div.style.gridTemplateColumns = hasDate ? '1fr 1fr 1fr auto' : '1fr 1fr auto';
                div.dataset.id = item.id;

                const descInput = document.createElement('input');
                descInput.type = 'text';
                descInput.value = item.description;
                descInput.placeholder = 'Description';
                descInput.className = 'input-field description-input';

                const amountDiv = document.createElement('div');
                amountDiv.className = 'relative';
                const amountPrefix = document.createElement('span');
                amountPrefix.className = 'currency-prefix';
                amountPrefix.textContent = 'R';
                const amountInput = document.createElement('input');
                amountInput.type = 'number';
                amountInput.value = item.amount;
                amountInput.placeholder = '0.00';
                amountInput.className = 'input-field amount-input';
                amountDiv.append(amountPrefix, amountInput);

                div.appendChild(descInput);
                div.appendChild(amountDiv);

                if (hasDate) {
                    const dateInput = document.createElement('input');
                    dateInput.type = 'date';
                    dateInput.value = item.date || '';
                    dateInput.className = 'input-field date-input';
                    div.appendChild(dateInput);
                }

                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                removeBtn.className = 'btn btn-danger remove-btn p-2';
                div.appendChild(removeBtn);

                return div;
            };

            const createDebtItem = (item) => createGenericItem(item, false);
            const createProvisionItem = (item) => createGenericItem(item, true);
            const createFutureCostItem = (item) => createGenericItem(item, true);

            let currentMonthlySavingsTarget = 0;

            const calculateAndDisplaySummary = () => {
                const savings = parseFloat(budgetData.savings) || 0;
                const futureDate = futureDateInput.value ? new Date(futureDateInput.value) : null;

                const r = _calculateBudgetSummary(
                    savings,
                    budgetData.debts,
                    budgetData.provisions,
                    budgetData.futureCosts,
                    futureDate,
                    new Date()
                );

                document.getElementById('current-savings').textContent = formatCurrency(savings);

                document.getElementById('current-net-amount').textContent = formatCurrency(r.currentNetAmount);
                document.getElementById('current-net-amount').style.color = r.currentNetAmount >= 0 ? '#16a34a' : '#ef4444';

                document.getElementById('future-net-amount').textContent = formatCurrency(r.futureNetAmount);
                document.getElementById('future-net-amount').style.color = r.futureNetAmount >= 0 ? '#4f46e5' : '#ef4444';

                currentMonthlySavingsTarget = r.monthlySavingsTarget;

                try {
                    const plannedInput = document.getElementById('budget-timeline-planned-savings');
                    const plannedRaw = plannedInput && plannedInput.value !== '' ? parseFloat(plannedInput.value) : NaN;
                    const planned = Number.isFinite(plannedRaw) && plannedRaw >= 0 ? plannedRaw : undefined;
                    const result = _renderBudgetTimeline({
                        container: document.getElementById('budget-timeline-chart'),
                        headline: document.getElementById('budget-timeline-headline'),
                        savings,
                        totalDebts: r.totalDebts,
                        totalProvisions: r.totalProvisions,
                        futureCosts: budgetData.futureCosts,
                        futureDate,
                        plannedMonthlySavings: planned,
                    });
                    // Show the recommended amount as the placeholder so the default is
                    // visible when the input is blank (blank = follow the recommendation).
                    if (plannedInput && result && Number.isFinite(result.requiredMonthlySavings)) {
                        plannedInput.placeholder = String(Math.round(result.requiredMonthlySavings));
                    }
                } catch (err) {
                    console.error('Timeline chart failed:', err);
                }
            };

            const calculateMonthlyAllocation = () => {
                const availableMoney = parseFloat(availableMoneyInput.value) || 0;
                const mortgagePercentage = parseFloat(mortgagePercentageInput.value) || 0;
                const eftPercentage = parseFloat(eftPercentageInput.value) || 0;
                const cryptoPercentage = parseFloat(cryptoPercentageInput.value) || 0;
                const monthlySavingsTarget = currentMonthlySavingsTarget || 0;

                const totalPercentage = mortgagePercentage + eftPercentage + cryptoPercentage;

                if (totalPercentage > 100) {
                    alert('Total percentage cannot exceed 100%. Please adjust your percentages.');
                    return;
                }
                if (totalPercentage === 0) {
                    alert('Please enter at least one percentage allocation.');
                    return;
                }

                const r = _calcMonthlyAllocation(availableMoney, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage);

                if (r.remainingMoney < 0) {
                    alert('Available money is less than required monthly savings. You need to increase your available money or reduce your financial commitments.');
                    return;
                }

                document.getElementById('allocation-savings').textContent = formatCurrency(monthlySavingsTarget);
                document.getElementById('allocation-mortgage').textContent = formatCurrency(r.mortgageAmount);
                document.getElementById('allocation-eft').textContent = formatCurrency(r.eftAmount);
                document.getElementById('allocation-crypto').textContent = formatCurrency(r.cryptoAmount);
                document.getElementById('allocation-total').textContent = formatCurrency(r.totalAllocated);

                allocationResults.classList.remove('hidden');
            };

            const handleListChange = (e, list) => {
                const target = e.target;
                const itemDiv = target.closest('[data-id]');
                if (!itemDiv) return;

                const id = itemDiv.dataset.id;
                const item = list.find(i => i.id === id);
                if (!item) return;

                if (target.classList.contains('remove-btn')) {
                    const index = list.findIndex(i => i.id === id);
                    if (index > -1) {
                        list.splice(index, 1);
                        renderBudget();
                    }
                } else if (target.classList.contains('description-input')) {
                    item.description = target.value;
                } else if (target.classList.contains('amount-input')) {
                    item.amount = target.value;
                } else if (target.classList.contains('date-input')) {
                    item.date = target.value;
                }
                calculateAndDisplaySummary();
            };

            addDebtBtn.addEventListener('click', () => {
                budgetData.debts.push({ id: generateId(), description: '', amount: '' });
                renderBudget();
                debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv');
            });

            addProvisionBtn.addEventListener('click', () => {
                budgetData.provisions.push({ id: generateId(), description: '', amount: '', date: '' });
                renderBudget();
                debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv');
            });

            addFutureCostBtn.addEventListener('click', () => {
                budgetData.futureCosts.push({ id: generateId(), description: '', amount: '', date: '' });
                renderBudget();
                debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv');
            });

            savingsInput.addEventListener('input', (e) => {
                budgetData.savings = e.target.value;
                calculateAndDisplaySummary();
                debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv');
            });

            futureDateInput.addEventListener('input', calculateAndDisplaySummary);

            const plannedSavingsInput = document.getElementById('budget-timeline-planned-savings');
            const plannedSavingsReset = document.getElementById('budget-timeline-reset-planned');
            // Persist the planned monthly-savings override to config.private.json
            // (auto-save, same mechanism as the rest of the page). Blank/invalid
            // removes the override so the chart follows the recommended amount.
            const persistPlannedSavings = () => {
                if (!plannedSavingsInput) return;
                const raw = plannedSavingsInput.value;
                const val = raw !== '' ? parseFloat(raw) : NaN;
                if (Number.isFinite(val) && val >= 0) {
                    setConfig('budget_planned_monthly_savings', val);
                } else if ('budget_planned_monthly_savings' in configMap) {
                    delete configMap.budget_planned_monthly_savings;
                    persistConfig();
                }
            };
            if (plannedSavingsInput) {
                plannedSavingsInput.addEventListener('input', () => {
                    persistPlannedSavings();
                    calculateAndDisplaySummary();
                });
            }
            if (plannedSavingsReset) {
                plannedSavingsReset.addEventListener('click', () => {
                    if (plannedSavingsInput) plannedSavingsInput.value = '';
                    if ('budget_planned_monthly_savings' in configMap) {
                        delete configMap.budget_planned_monthly_savings;
                        persistConfig();
                    }
                    calculateAndDisplaySummary();
                });
            }
            // Prefill the planned-savings input from the saved override (config.private.json).
            // Must run after loadConfigFromServer and before the first chart render.
            const applyPlannedSavingsFromConfig = () => {
                if (!plannedSavingsInput) return;
                const saved = configMap.budget_planned_monthly_savings;
                plannedSavingsInput.value = (saved !== undefined && saved !== null && saved !== '') ? saved : '';
            };

            debtList.addEventListener('input', (e) => { handleListChange(e, budgetData.debts); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });
            provisionList.addEventListener('input', (e) => { handleListChange(e, budgetData.provisions); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });
            futureCostList.addEventListener('input', (e) => { handleListChange(e, budgetData.futureCosts); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });

            debtList.addEventListener('click', (e) => { handleListChange(e, budgetData.debts); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });
            provisionList.addEventListener('click', (e) => { handleListChange(e, budgetData.provisions); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });
            futureCostList.addEventListener('click', (e) => { handleListChange(e, budgetData.futureCosts); debouncedSave('transactions_budget', generateBudgetCSV, 'save-csv'); });

            calculateAllocationBtn.addEventListener('click', calculateMonthlyAllocation);

            const parseBudgetCSV = (text) => _parseBudgetCSV(text);
            const generateBudgetCSV = () => _generateBudgetCSV(budgetData);

            const loadBudgetCSVFromServer = async () => {
                const response = await fetch(dbPath('transactions/budget.csv'), { cache: 'no-store' });
                if (!response.ok) throw new Error(`Failed to load CSV: ${response.status}`);
                const text = await response.text();
                budgetData = parseBudgetCSV(text);
                if (!futureDateInput.value) {
                    const today = new Date();
                    const oneYearFromToday = new Date(today);
                    oneYearFromToday.setDate(oneYearFromToday.getDate() + 365);
                    const yyyy = oneYearFromToday.getFullYear();
                    const mm = String(oneYearFromToday.getMonth() + 1).padStart(2, '0');
                    const dd = String(oneYearFromToday.getDate()).padStart(2, '0');
                    futureDateInput.value = `${yyyy}-${mm}-${dd}`;
                }
                renderBudget();
            };

            const saveBudgetCSV = () => saveToServer('transactions_budget', generateBudgetCSV, 'save-csv');

            saveCsvBtn.addEventListener('click', saveBudgetCSV);


            // --- INVESTMENT TRACKER LOGIC ---
            let investmentData = {
                transactions: [],
                currentValues: {
                    Discretionary: 0,
                    TFSA: 0,
                    Crypto: 0
                },
                marginalRate: 41
            };

            const transactionList = document.getElementById('transaction-list');
            const addTransactionBtn = document.getElementById('add-transaction');
            const loadInvCsvBtn = document.getElementById('load-inv-csv');
            const saveInvCsvBtn = document.getElementById('save-inv-csv');

            // Inputs for current values
            const valDiscretionary = document.getElementById('val-discretionary');
            const valTfsa = document.getElementById('val-tfsa');
            const valCrypto = document.getElementById('val-crypto');
            const marginalRateInput = document.getElementById('marginal-rate-discretionary');

            const updatePerformanceDisplay = () => {
                calculatePerformance('Discretionary', investmentData.currentValues.Discretionary, 'inv-discretionary', 'gain-discretionary', 'ann-discretionary', 'gain-money-discretionary');
                calculatePerformance('TFSA', investmentData.currentValues.TFSA, 'inv-tfsa', 'gain-tfsa', 'ann-tfsa', 'gain-money-tfsa');
                calculatePerformance('Crypto', investmentData.currentValues.Crypto, 'inv-crypto', 'gain-crypto', 'ann-crypto', 'gain-money-crypto');
                updateTfsaCapDisplay();
            };

            const updateTfsaCapDisplay = () => {
                const tfsaTxs = investmentData.transactions.filter(t => t.type === 'TFSA');
                const cap = _tfsaLifetimeContributions(tfsaTxs);
                const contribEl = document.getElementById('tfsa-lifetime-contrib');
                const barEl = document.getElementById('tfsa-cap-bar');
                const pctEl = document.getElementById('tfsa-cap-pct');
                const remEl = document.getElementById('tfsa-cap-remaining');
                if (contribEl) contribEl.textContent = formatCurrency(Math.max(0, cap.contributed));
                if (barEl) {
                    barEl.style.width = `${cap.percentUsed.toFixed(1)}%`;
                    barEl.className = `h-1.5 rounded-full transition-all ${cap.percentUsed >= 100 ? 'bg-red-500' : cap.percentUsed >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`;
                }
                if (pctEl) pctEl.textContent = `${cap.percentUsed.toFixed(1)}%`;
                if (remEl) remEl.textContent = Math.round(cap.remaining).toLocaleString('en-ZA');
            };

            const renderTransactions = () => {
                transactionList.innerHTML = '';
                if (investmentData.transactions.length === 0) {
                    transactionList.innerHTML = `<p class="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">No transactions added yet.</p>`;
                } else {
                    // Sort by date descending (latest on top), then by ID (creation time) descending
                    const sorted = [...investmentData.transactions].sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        if (dateA > dateB) return -1;
                        if (dateA < dateB) return 1;
                        // If dates are equal, sort by ID descending (assuming ID contains timestamp)
                        if (a.id > b.id) return -1;
                        if (a.id < b.id) return 1;
                        return 0;
                    });
                    sorted.forEach(t => transactionList.appendChild(createTransactionItem(t)));
                }
            };

            const renderFullInvestmentUI = () => {
                // Update Inputs from State
                valDiscretionary.value = investmentData.currentValues.Discretionary || '';
                valTfsa.value = investmentData.currentValues.TFSA || '';
                valCrypto.value = investmentData.currentValues.Crypto || '';
                marginalRateInput.value = (investmentData.marginalRate ?? 41);

                renderTransactions();
                updatePerformanceDisplay();
            };

            const createTransactionItem = (item) => {
                const div = document.createElement('div');
                div.className = 'grid gap-2 items-center';
                div.style.gridTemplateColumns = '1fr 2fr 1fr 0.8fr 1fr auto';
                div.dataset.id = item.id;

                // Date
                const dateInput = document.createElement('input');
                dateInput.type = 'date';
                dateInput.value = item.date;
                dateInput.className = 'input-field date-input text-xs';
                div.appendChild(dateInput);

                // Description
                const descInput = document.createElement('input');
                descInput.type = 'text';
                descInput.value = item.description;
                descInput.placeholder = 'Description';
                descInput.className = 'input-field description-input text-xs';
                div.appendChild(descInput);

                // Amount
                const amountDiv = document.createElement('div');
                amountDiv.className = 'relative';
                const amountPrefix = document.createElement('span');
                amountPrefix.className = 'currency-prefix text-xs';
                amountPrefix.textContent = 'R';
                const amountInput = document.createElement('input');
                amountInput.type = 'number';
                amountInput.value = item.amount;
                amountInput.placeholder = '0.00';
                amountInput.className = 'input-field amount-input text-xs';
                amountDiv.append(amountPrefix, amountInput);
                div.appendChild(amountDiv);

                // Crypto Value (BTC)
                const cryptoValDiv = document.createElement('div');
                cryptoValDiv.className = `relative ${item.type === 'Crypto' ? '' : 'invisible'}`;
                const cryptoValInput = document.createElement('input');
                cryptoValInput.type = 'number';
                cryptoValInput.value = item.cryptoValue || '';
                cryptoValInput.placeholder = 'BTC';
                cryptoValInput.className = 'input-field crypto-value-input text-xs';
                cryptoValDiv.appendChild(cryptoValInput);
                div.appendChild(cryptoValDiv);

                // Account Type
                const typeSelect = document.createElement('select');
                typeSelect.className = 'input-field type-input text-xs';
                ['Discretionary', 'TFSA', 'Crypto'].forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    if (item.type === opt) option.selected = true;
                    typeSelect.appendChild(option);
                });
                div.appendChild(typeSelect);

                // Remove
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                removeBtn.className = 'btn btn-danger remove-btn p-1.5';
                div.appendChild(removeBtn);

                return div;
            };

            const calculatePerformance = (type, currentValueStr, invId, gainId, annId, moneyGainId) => {
                const currentValue = parseFloat(currentValueStr) || 0;
                const txs = investmentData.transactions.filter(t => t.type === type);

                const rate = (type === 'Discretionary') ? (parseFloat(investmentData.marginalRate) || 0) : 0;
                const r = _calculateInvestmentPerformance(txs, currentValue, new Date(), rate);

                const invEl = document.getElementById(invId);
                if (invEl) invEl.textContent = formatCurrency(r.totalInvested);

                if (type === 'Crypto') {
                    const cryptoValEl = document.getElementById('total-crypto-value');
                    if (cryptoValEl) cryptoValEl.textContent = r.totalCryptoValue.toFixed(8);
                }

                const gainEl = document.getElementById(gainId);
                const annEl = document.getElementById(annId);
                const moneyGainEl = document.getElementById(moneyGainId);

                if (!gainEl) return;

                const typeKey = type.toLowerCase();
                const taxEl = document.getElementById(`tax-${typeKey}`);
                const netAfterTaxEl = document.getElementById(`net-savings-after-tax-${typeKey}`);

                if (r.totalInvested === 0) {
                    gainEl.textContent = '0.00%';
                    gainEl.className = 'font-bold text-slate-800';
                    if (annEl) { annEl.textContent = '0.00%'; annEl.className = 'font-bold text-slate-800'; }
                    if (moneyGainEl) { moneyGainEl.textContent = 'R 0.00'; moneyGainEl.className = 'font-bold text-slate-800'; }
                    const sg0 = document.getElementById(`savings-gain-${typeKey}`);
                    const ns0 = document.getElementById(`net-savings-${typeKey}`);
                    if (sg0) sg0.textContent = 'R 0.00';
                    if (ns0) { ns0.textContent = 'R 0.00'; ns0.className = (typeKey === 'discretionary' ? 'font-medium text-slate-400' : 'font-bold text-slate-800'); }
                    if (taxEl) { taxEl.textContent = 'R 0.00'; taxEl.className = 'font-medium text-red-500'; }
                    if (netAfterTaxEl) { netAfterTaxEl.textContent = 'R 0.00'; netAfterTaxEl.className = 'font-bold text-slate-800'; }
                    return;
                }

                gainEl.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
                gainEl.className = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

                if (moneyGainEl) {
                    moneyGainEl.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${formatCurrency(r.absoluteReturn)}`;
                    moneyGainEl.className = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                }

                const savingsGainEl = document.getElementById(`savings-gain-${typeKey}`);
                const netSavingsEl = document.getElementById(`net-savings-${typeKey}`);
                if (savingsGainEl) savingsGainEl.textContent = `+${formatCurrency(r.savingsGain)}`;
                if (netSavingsEl) {
                    netSavingsEl.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${formatCurrency(r.netVsSavings)}`;
                    if (typeKey === 'discretionary') {
                        netSavingsEl.className = 'font-medium text-slate-400';
                    } else {
                        netSavingsEl.className = `font-bold ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;
                    }
                }

                if (taxEl) {
                    taxEl.textContent = r.estimatedTax > 0 ? `-${formatCurrency(r.estimatedTax)}` : 'R 0.00';
                    taxEl.className = 'font-medium text-red-500';
                }
                if (netAfterTaxEl) {
                    netAfterTaxEl.textContent = `${r.netVsSavingsAfterTax >= 0 ? '+' : ''}${formatCurrency(r.netVsSavingsAfterTax)}`;
                    netAfterTaxEl.className = `font-bold ${r.netVsSavingsAfterTax >= 0 ? 'text-green-600' : 'text-red-500'}`;
                }

                if (r.annualizedReturn === null) {
                    if (annEl) { annEl.textContent = 'N/A'; annEl.className = 'font-bold text-slate-400'; }
                } else {
                    if (annEl) {
                        annEl.textContent = `${r.annualizedReturn >= 0 ? '+' : ''}${r.annualizedReturn.toFixed(2)}%`;
                        annEl.className = `font-bold ${r.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                    }
                }
            };

            // Investment Event Handlers
            addTransactionBtn.addEventListener('click', () => {
                const today = new Date().toISOString().split('T')[0];
                investmentData.transactions.push({
                    id: generateId(),
                    date: today,
                    description: '',
                    amount: '',
                    cryptoValue: '',
                    type: 'Discretionary'
                });
                renderTransactions();
                updatePerformanceDisplay();
                debouncedSave('transactions_investments', generateInvestmentCSV, 'save-inv-csv');
            });

            transactionList.addEventListener('input', (e) => {
                const target = e.target;
                const itemDiv = target.closest('[data-id]');
                if (!itemDiv) return;
                const id = itemDiv.dataset.id;
                const item = investmentData.transactions.find(i => i.id === id);
                if (!item) return;

                if (target.classList.contains('description-input')) item.description = target.value;
                else if (target.classList.contains('amount-input')) item.amount = target.value;
                else if (target.classList.contains('date-input')) item.date = target.value;
                else if (target.classList.contains('type-input')) {
                    item.type = target.value;
                    const cryptoInputDiv = itemDiv.querySelector('.crypto-value-input').parentElement;
                    if (item.type === 'Crypto') {
                        cryptoInputDiv.classList.remove('invisible');
                    } else {
                        cryptoInputDiv.classList.add('invisible');
                        item.cryptoValue = '';
                        cryptoInputDiv.querySelector('input').value = '';
                    }
                } else if (target.classList.contains('crypto-value-input')) {
                    item.cryptoValue = target.value;
                }

                updatePerformanceDisplay();
                debouncedSave('transactions_investments', generateInvestmentCSV, 'save-inv-csv');
            });

            transactionList.addEventListener('click', (e) => {
                if (e.target.closest('.remove-btn')) {
                    const itemDiv = e.target.closest('[data-id]');
                    const id = itemDiv.dataset.id;
                    const index = investmentData.transactions.findIndex(i => i.id === id);
                    if (index > -1) {
                        investmentData.transactions.splice(index, 1);
                        renderTransactions();
                        updatePerformanceDisplay();
                        debouncedSave('transactions_investments', generateInvestmentCSV, 'save-inv-csv');
                    }
                }
            });

            [valDiscretionary, valTfsa, valCrypto].forEach(input => {
                input.addEventListener('input', (e) => {
                    const id = e.target.id;
                    if (id === 'val-discretionary') investmentData.currentValues.Discretionary = e.target.value;
                    if (id === 'val-tfsa') investmentData.currentValues.TFSA = e.target.value;
                    if (id === 'val-crypto') investmentData.currentValues.Crypto = e.target.value;
                    updatePerformanceDisplay();
                    // Retirement projection reads these current values live — keep it in sync.
                    if (typeof renderRetirement === 'function') renderRetirement();
                    debouncedSave('transactions_investments', generateInvestmentCSV, 'save-inv-csv');
                });
            });

            marginalRateInput.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                investmentData.marginalRate = Number.isNaN(v) ? 0 : v;
                setConfig('marginal_rate', investmentData.marginalRate);
                updatePerformanceDisplay();
                debouncedSave('transactions_investments', generateInvestmentCSV, 'save-inv-csv');
            });

            // Investment CSV Handling
            const parseInvestmentCSV = (text) => _parseInvestmentCSV(text);
            const generateInvestmentCSV = () => _generateInvestmentCSV(investmentData);

            // Try to auto-load investments.csv if available
            const loadInvestmentCSVFromServer = async () => {
                try {
                    const response = await fetch(dbPath('transactions/investments.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        const parsed = parseInvestmentCSV(text);
                        investmentData.transactions = parsed.transactions;
                        investmentData.currentValues = parsed.currentValues;
                        investmentData.marginalRate = (configMap.marginal_rate ?? parsed.marginalRate ?? 41);
                        renderFullInvestmentUI();
                    }
                } catch (e) {
                    console.log('Could not auto-load investments.csv');
                }
            };

            const saveInvestmentCSV = () => saveToServer('transactions_investments', generateInvestmentCSV, 'save-inv-csv');

            loadInvCsvBtn.addEventListener('click', async () => {
                if (!window.showOpenFilePicker) return;
                try {
                    const [handle] = await window.showOpenFilePicker({
                        multiple: false,
                        types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
                    });
                    const file = await handle.getFile();
                    const text = await file.text();
                    const parsed = parseInvestmentCSV(text);
                    investmentData.transactions = parsed.transactions;
                    investmentData.currentValues = parsed.currentValues;
                    investmentData.marginalRate = (configMap.marginal_rate ?? parsed.marginalRate ?? 41);
                    if (configMap.marginal_rate === undefined && parsed.marginalRate !== undefined) {
                        configMap.marginal_rate = parsed.marginalRate;
                        persistConfig();
                    }
                    renderFullInvestmentUI();
                } catch (err) {
                    console.error(err);
                }
            });

            saveInvCsvBtn.addEventListener('click', saveInvestmentCSV);


            // --- DEBT CALCULATOR LOGIC ---
            let debtData = {
                repayments: []
            };

            const repaymentList = document.getElementById('repayment-list');
            const addRepaymentBtn = document.getElementById('add-repayment');
            const loadDebtCsvBtn = document.getElementById('load-debt-csv');
            const saveDebtCsvBtn = document.getElementById('save-debt-csv');

            // Inputs
            const debtAmountInput = document.getElementById('debt-amount');
            const debtCurrentBalanceInput = document.getElementById('debt-current-balance');
            const debtRepaymentInput = document.getElementById('debt-repayment');
            const debtServiceFeeInput = document.getElementById('debt-service-fee');
            const debtInterestRateInput = document.getElementById('debt-interest-rate');
            const debtNextPaymentInput = document.getElementById('debt-next-payment');
            const debtLoanStartInput = document.getElementById('debt-loan-start');
            const debtOriginalTermInput = document.getElementById('debt-original-term');

            // Results
            const debtSavedAmountEl = document.getElementById('debt-saved-amount');
            const debtTotalExtraEl = document.getElementById('debt-total-extra');
            const debtNetReturnEl = document.getElementById('debt-net-return');
            const debtYieldEl = document.getElementById('debt-yield');
            const debtTimeReducedEl = document.getElementById('debt-time-reduced');
            const debtNewEndDateEl = document.getElementById('debt-new-end-date');
            const debtOriginalEndDateEl = document.getElementById('debt-original-end-date');

            const calculateDebtProjection = () => {
                const currentPrincipal = parseFloat(debtCurrentBalanceInput.value) || parseFloat(debtAmountInput.value) || 0;
                const totalRepayment = parseFloat(debtRepaymentInput.value) || 0;
                const serviceFee = parseFloat(debtServiceFeeInput.value) || 0;
                const interestRate = parseFloat(debtInterestRateInput.value) || 0;
                const nextPaymentDateStr = debtNextPaymentInput.value;

                if (currentPrincipal <= 0 || totalRepayment <= 0 || !nextPaymentDateStr) return;

                const dailyRate = (interestRate / 100) / 365;
                const effectiveRepayment = totalRepayment - serviceFee;

                // Guard: repayment must exceed one month's interest
                const npd = new Date(nextPaymentDateStr);
                const guardFactor = _monthlyInterestFactor(dailyRate, npd.getFullYear(), npd.getMonth());
                if (effectiveRepayment <= (currentPrincipal * guardFactor)) {
                    debtSavedAmountEl.textContent = 'N/A';
                    debtTimeReducedEl.textContent = 'Never';
                    debtNewEndDateEl.textContent = 'Never';
                    debtOriginalEndDateEl.textContent = 'Original: Never';
                    return;
                }

                const { moneySaved, diffMonths, totalExtra, baseline, actual } = _calculateDebtResults({
                    currentPrincipal, totalRepayment, serviceFee, interestRate,
                    nextPaymentDateStr, repayments: debtData.repayments,
                });

                debtTotalExtraEl.textContent = formatCurrency(totalExtra);

                debtSavedAmountEl.textContent = formatCurrency(moneySaved);
                debtSavedAmountEl.className = moneySaved >= 0 ? 'text-lg font-bold text-green-600' : 'text-lg font-bold text-red-600';

                debtNetReturnEl.textContent = formatCurrency(moneySaved);
                debtNetReturnEl.className = moneySaved >= 0 ? 'text-lg font-bold text-indigo-600' : 'text-lg font-bold text-orange-600';

                if (diffMonths > 0) {
                    const diffY = Math.floor(diffMonths / 12);
                    const diffM = diffMonths % 12;
                    debtTimeReducedEl.textContent = `${diffY}y ${diffM}m`;
                } else {
                    debtTimeReducedEl.textContent = '0 Months';
                }

                // XIRR: build cash flows and compute yield
                const cashFlows = [];
                debtData.repayments.forEach(rep => {
                    if (rep.amount > 0 && rep.date) {
                        cashFlows.push({ amount: -parseFloat(rep.amount), date: new Date(rep.date) });
                    }
                });

                if (cashFlows.length > 0 && diffMonths > 0) {
                    let flowDate = new Date(actual.endDate);
                    flowDate.setMonth(flowDate.getMonth() + 1);
                    const endDate = new Date(baseline.endDate);
                    while (flowDate <= endDate) {
                        cashFlows.push({ amount: totalRepayment, date: new Date(flowDate) });
                        flowDate.setMonth(flowDate.getMonth() + 1);
                    }
                    try {
                        cashFlows.sort((a, b) => a.date - b.date);
                        if (cashFlows.length > 0) {
                            const rate = _xirr(cashFlows);
                            debtYieldEl.textContent = `${(rate * 100).toFixed(2)}%`;
                        } else {
                            debtYieldEl.textContent = '0.00%';
                        }
                    } catch (e) {
                        debtYieldEl.textContent = 'N/A';
                    }
                } else {
                    debtYieldEl.textContent = '0.00%';
                }

                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                debtNewEndDateEl.textContent = actual.endDate.toLocaleDateString('en-ZA', options);
                const loanStartStr = debtLoanStartInput.value;
                const originalTerm = parseInt(debtOriginalTermInput.value) || 0;
                if (loanStartStr && originalTerm > 0) {
                    const origEnd = new Date(loanStartStr);
                    origEnd.setMonth(origEnd.getMonth() + originalTerm);
                    debtOriginalEndDateEl.textContent = `Original: ${origEnd.toLocaleDateString('en-ZA', options)}`;
                } else {
                    debtOriginalEndDateEl.textContent = `Original: ${baseline.endDate.toLocaleDateString('en-ZA', options)}`;
                }
            };

            const renderRepayments = () => {
                repaymentList.innerHTML = '';
                if (debtData.repayments.length === 0) {
                    repaymentList.innerHTML = `<p class="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">No extra repayments added.</p>`;
                } else {
                    // Sort by date descending (latest on top)
                    const sorted = [...debtData.repayments].sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        if (dateA > dateB) return -1;
                        if (dateA < dateB) return 1;
                        // If dates are equal, sort by ID descending (newest added first)
                        if (a.id > b.id) return -1;
                        if (a.id < b.id) return 1;
                        return 0;
                    });
                    sorted.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'grid gap-2 items-center';
                        div.style.gridTemplateColumns = '1fr 2fr 1fr auto';
                        div.dataset.id = item.id;

                        // Date
                        const dateInput = document.createElement('input');
                        dateInput.type = 'date';
                        dateInput.value = item.date;
                        dateInput.className = 'input-field date-input text-xs';
                        div.appendChild(dateInput);

                        // Description
                        const descInput = document.createElement('input');
                        descInput.type = 'text';
                        descInput.value = item.description;
                        descInput.placeholder = 'Description';
                        descInput.className = 'input-field description-input text-xs';
                        div.appendChild(descInput);

                        // Amount
                        const amountDiv = document.createElement('div');
                        amountDiv.className = 'relative';
                        const amountPrefix = document.createElement('span');
                        amountPrefix.className = 'currency-prefix text-xs';
                        amountPrefix.textContent = 'R';
                        const amountInput = document.createElement('input');
                        amountInput.type = 'number';
                        amountInput.value = item.amount;
                        amountInput.placeholder = '0.00';
                        amountInput.className = 'input-field amount-input text-xs';
                        amountDiv.append(amountPrefix, amountInput);
                        div.appendChild(amountDiv);

                        // Remove
                        const removeBtn = document.createElement('button');
                        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                        removeBtn.className = 'btn btn-danger remove-btn p-1.5';
                        div.appendChild(removeBtn);

                        repaymentList.appendChild(div);
                    });
                }
                calculateDebtProjection();
            };

            // Event Listeners
            addRepaymentBtn.addEventListener('click', () => {
                const today = new Date().toISOString().split('T')[0];
                debtData.repayments.push({
                    id: generateId(),
                    date: today,
                    description: '',
                    amount: ''
                });
                renderRepayments();
                debouncedSave('transactions_debt', generateDebtCSV, null);
            });

            repaymentList.addEventListener('input', (e) => {
                const target = e.target;
                const itemDiv = target.closest('[data-id]');
                if (!itemDiv) return;
                const id = itemDiv.dataset.id;
                const item = debtData.repayments.find(i => i.id === id);
                if (!item) return;

                if (target.classList.contains('description-input')) item.description = target.value;
                else if (target.classList.contains('amount-input')) item.amount = target.value;
                else if (target.classList.contains('date-input')) item.date = target.value;

                calculateDebtProjection();
                debouncedSave('transactions_debt', generateDebtCSV, null);
            });

            repaymentList.addEventListener('click', (e) => {
                if (e.target.closest('.remove-btn')) {
                    const itemDiv = e.target.closest('[data-id]');
                    const id = itemDiv.dataset.id;
                    const index = debtData.repayments.findIndex(i => i.id === id);
                    if (index > -1) {
                        debtData.repayments.splice(index, 1);
                        renderRepayments();
                        debouncedSave('transactions_debt', generateDebtCSV, null);
                    }
                }
            });

            const _debtInputBindings = [
                ['principal',       debtAmountInput],
                ['current_balance', debtCurrentBalanceInput],
                ['repayment',       debtRepaymentInput],
                ['service_fee',     debtServiceFeeInput],
                ['interest_rate',   debtInterestRateInput],
                ['next_payment',    debtNextPaymentInput],
                ['loan_start',      debtLoanStartInput],
                ['original_term',   debtOriginalTermInput],
            ];
            _debtInputBindings.forEach(([key, input]) => {
                input.addEventListener('input', () => {
                    setConfig(key, input.value);
                    calculateDebtProjection();
                });
            });

            // CSV Handling
            const parseDebtCSV = (text) => _parseDebtCSV(text);
            const generateDebtCSV = () => _generateDebtCSV(debtData.repayments);

            const loadDebtCSVFromServer = async () => {
                try {
                    const response = await fetch(dbPath('transactions/debt.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        const parsed = parseDebtCSV(text);
                        debtData.repayments = parsed.repayments;

                        const _debtKeys = [
                            ['principal',       debtAmountInput],
                            ['current_balance', debtCurrentBalanceInput],
                            ['repayment',       debtRepaymentInput],
                            ['service_fee',     debtServiceFeeInput],
                            ['interest_rate',   debtInterestRateInput],
                            ['next_payment',    debtNextPaymentInput],
                            ['loan_start',      debtLoanStartInput],
                            ['original_term',   debtOriginalTermInput],
                        ];
                        _debtKeys.forEach(([k, el]) => {
                            const v = configMap[k] ?? parsed.params[k];
                            if (v !== undefined && v !== '') el.value = v;
                        });

                        // Default to upcoming 25th only if no persisted value.
                        if (!debtNextPaymentInput.value) debtNextPaymentInput.value = getUpcoming25th();

                        renderRepayments();
                    } else {
                        // Initialize with default extra repayments from prompt if file not found?
                        // "Add extra repayments to the csv: ..."
                        // The prompt lists specific repayments. I should pre-populate them if starting fresh?
                        // "Add extra repayments to the csv:" implies I should add them to the file or the initial state.
                        // I will add them to the initial state if no CSV is found.

                        debtData.repayments = [
                            { id: generateId(), date: '2025-11-25', description: 'Extra Repayment', amount: 9500 },
                            { id: generateId(), date: '2025-10-25', description: 'Extra Repayment', amount: 8600 },
                            { id: generateId(), date: '2025-09-05', description: 'Extra Repayment', amount: 4000 },
                            { id: generateId(), date: '2025-07-25', description: 'Extra Repayment', amount: 4000 },
                            { id: generateId(), date: '2025-07-01', description: 'Extra Repayment', amount: 4000 },
                            { id: generateId(), date: '2025-05-31', description: 'Extra Repayment', amount: 4000 }
                        ];
                        debtNextPaymentInput.value = getUpcoming25th();
                        renderRepayments();
                    }
                } catch (e) {
                    console.log('Could not auto-load debt.csv');
                }
            };

            const saveDebtCSV = () => saveToServer('transactions_debt', generateDebtCSV, null);

            loadDebtCsvBtn.addEventListener('click', async () => {
                if (!window.showOpenFilePicker) return;
                try {
                    const [handle] = await window.showOpenFilePicker({
                        multiple: false,
                        types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
                    });
                    const file = await handle.getFile();
                    const text = await file.text();
                    const parsed = parseDebtCSV(text);
                    debtData.repayments = parsed.repayments;

                    const _debtKeys = [
                        ['principal',       debtAmountInput],
                        ['current_balance', debtCurrentBalanceInput],
                        ['repayment',       debtRepaymentInput],
                        ['service_fee',     debtServiceFeeInput],
                        ['interest_rate',   debtInterestRateInput],
                        ['next_payment',    debtNextPaymentInput],
                        ['loan_start',      debtLoanStartInput],
                        ['original_term',   debtOriginalTermInput],
                    ];
                    _debtKeys.forEach(([k, el]) => {
                        const v = parsed.params[k];
                        if (v !== undefined && v !== '') el.value = v;
                    });
                    _debtKeys.forEach(([k, el]) => {
                        if (el.value !== '') configMap[k] = el.value;
                    });
                    persistConfig();

                    // Default to upcoming 25th only if no persisted value.
                    if (!debtNextPaymentInput.value) debtNextPaymentInput.value = getUpcoming25th();

                    renderRepayments();
                } catch (err) {
                    console.error(err);
                }
            });

            saveDebtCsvBtn.addEventListener('click', saveDebtCSV);


            // --- HISTORY TAB ---
            const renderHistory = () => {
                const container = document.getElementById('history-content');

                // Group debt extra repayments by year
                const debtByYear = {};
                debtData.repayments.forEach(r => {
                    const year = r.date ? r.date.split('-')[0] : null;
                    if (!year || year.length !== 4) return;
                    debtByYear[year] = (debtByYear[year] || 0) + (parseFloat(r.amount) || 0);
                });

                // Group investment transactions by year and account type
                const invByYear = {};
                investmentData.transactions.forEach(t => {
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
                if (testMode) {
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
                testMode = !testMode;
                updateTestModeUI();
                try {
                    await loadConfigFromServer();           // configMap first — tabs read it
                    applyPlannedSavingsFromConfig();        // prefill planned-savings input
                    await Promise.all([
                        loadBudgetCSVFromServer(),
                        loadInvestmentCSVFromServer(),
                        loadDebtCSVFromServer(),
                        loadRaCSVFromServer(),
                    ]);
                    loadRetirementFromConfig();             // synchronous — uses configMap
                } catch (err) {
                    console.error('Test mode load failed, reverting:', err);
                    testMode = !testMode;
                    updateTestModeUI();
                }
            });

            // --- INITIALIZATION ---
            (async () => {
                await loadConfigFromServer();          // must run before tabs that read configMap
                applyPlannedSavingsFromConfig();       // prefill planned-savings input
                try {
                    await loadBudgetCSVFromServer();
                } catch (err) {
                    console.warn('Automatic Budget CSV load failed.', err);
                    // initializeEmptyState(); // Already empty by default
                    renderBudget();
                }

                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
                await loadRaCSVFromServer();
                loadRetirementFromConfig();
            })();

            // --- RETIREMENT STATE ---
            let retirementParams = _getDefaultRetirementParams();

            const retFmtZAR = (n) => 'R ' + Math.round(Number(n) || 0).toLocaleString('en-ZA');
            const retFmtZARSign = (n) => {
                const v = Math.round(Number(n) || 0);
                const sign = v < 0 ? '-' : '';
                return sign + 'R ' + Math.abs(v).toLocaleString('en-ZA');
            };

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
                Object.keys(retirementParams).forEach(k => { configMap[k] = retirementParams[k]; });
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
                    Object.keys(retirementParams).forEach(k => { configMap[k] = retirementParams[k]; });
                    saveToServer('config_public',
                        () => _generateConfigJSON(configMap, { public: true }),
                        'ret-save-csv');
                    saveToServer('config_private',
                        () => _generateConfigJSON(configMap, { public: false }),
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
                    discretionaryToday: Number(investmentData.currentValues.Discretionary) || 0,
                    tfsaToday: Number(investmentData.currentValues.TFSA) || 0,
                    cryptoToday: Number(investmentData.currentValues.Crypto) || 0,
                    tfsaTransactions: (investmentData.transactions || []).filter(t => t.type === 'TFSA'),
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
                    const tfsaTxs = (investmentData.transactions || []).filter(t => t.type === 'TFSA');
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
                    ['TFSA cap remaining', retFmtZAR(Math.max(0, _RET_CONSTS.TFSA_LIFETIME_CAP - (investmentData.transactions || []).filter(t => t.type === 'TFSA').reduce((s, t) => s + (Number(t.amount) || 0), 0)))],
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

            retApplyParamsToInputs();
            retWireInputs();

            const loadRetirementFromConfig = () => {
                retirementParams = { ..._getDefaultRetirementParams(), ...configMap };
                retApplyParamsToInputs();
                renderRetirement();
            };
            // Note: do NOT call loadRetirementFromConfig() here. It depends
            // on configMap being loaded; the init IIFE invokes it.
        });
