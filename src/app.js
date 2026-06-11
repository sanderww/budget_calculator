        import { isTestMode, setTestMode, loadConfigFromServer } from './app/persistence.js';
        import { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer,
                 applyPlannedSavingsFromConfig } from './app/budget.js';
        import { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer,
                 setOnStateChanged as setInvestmentsChanged } from './app/investments.js';
        import { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer } from './app/debt.js';
        import { renderHistory } from './app/history.js';
        import { renderRa, loadRaCSVFromServer,
                 setOnStateChanged as setRaChanged } from './app/ra.js';
        import { renderRetirement, loadRetirementFromConfig } from './app/retirement.js';

        document.addEventListener('DOMContentLoaded', () => {
            // Cross-tab live updates: investments + RA current values feed the retirement projection.
            setInvestmentsChanged(() => renderRetirement());
            setRaChanged(() => renderRetirement());

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
        });
