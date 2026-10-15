// App bootstrap: tab navigation, sample-data mode, and the load sequence.
import { isTestMode, loadConfigFromServer, retryFailedSaves } from './persistence.js';
import { switchDataMode } from './data-mode.js';
import { initPopovers } from '../lib/popover.js';
import { renderBudget, loadBudgetCSVFromServer,
         applyBudgetConfig } from './budget.js';
import { loadInvestmentCSVFromServer,
         setOnStateChanged as setInvestmentsChanged } from './investments.js';
import { loadDebtCSVFromServer } from './debt.js';
import { renderHistory } from './history.js';
import { renderRa, loadRaCSVFromServer,
         setOnStateChanged as setRaChanged } from './ra.js';
import { renderRetirement, loadRetirementFromConfig } from './retirement.js';

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

// onShow thunks re-render tabs whose content depends on other tabs' state.
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

const updateTestModeUI = () => {
    const btn = document.getElementById('test-mode-btn');
    const dot = document.getElementById('test-mode-dot');
    const banner = document.getElementById('sample-banner');
    if (isTestMode()) {
        btn.classList.remove('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
        btn.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-700');
        dot.classList.remove('bg-slate-300');
        dot.classList.add('bg-amber-400');
        banner.classList.remove('hidden');
    } else {
        btn.classList.add('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
        btn.classList.remove('border-amber-300', 'bg-amber-50', 'text-amber-700');
        dot.classList.add('bg-slate-300');
        dot.classList.remove('bg-amber-400');
        banner.classList.add('hidden');
    }
};

// Loads every dataset for the current mode (init and the sample-data toggle).
// Every loader runs even when another fails, so as much as possible is
// replaced; the call then rejects so a toggle can revert (functional §8).
const loadAll = async () => {
    const failures = [];
    try {
        await loadConfigFromServer();       // config first — tabs read it
    } catch (err) {
        failures.push(err);
    }
    applyBudgetConfig();                    // prefill planned savings, buffer, allocation
    const results = await Promise.allSettled([
        loadBudgetCSVFromServer(),
        loadInvestmentCSVFromServer(),
        loadDebtCSVFromServer(),
        loadRaCSVFromServer(),
    ]);
    results.forEach(r => { if (r.status === 'rejected') failures.push(r.reason); });
    loadRetirementFromConfig();             // synchronous — uses getConfigMap()
    if (failures.length) throw new AggregateError(failures, 'Some data failed to load');
};

const toggleSampleData = () => switchDataMode({ loadAll, onModeChange: updateTestModeUI });

document.getElementById('test-mode-btn').addEventListener('click', toggleSampleData);
document.getElementById('sample-switch-btn').addEventListener('click', toggleSampleData);
document.getElementById('save-status').addEventListener('click', () => retryFailedSaves());
initPopovers();

// --- INITIALIZATION ---
(async () => {
    try {
        await loadAll();
    } catch (err) {
        console.warn('Some data failed to load on start-up.', err);
        renderBudget();                    // show the empty budget if its CSV failed
    }
})();
