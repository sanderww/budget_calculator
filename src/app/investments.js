// Investment tab: portfolio performance panels and the transaction list.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    parseInvestmentCSV as _parseInvestmentCSV,
    generateInvestmentCSV as _generateInvestmentCSV,
    tfsaLifetimeContributions as _tfsaLifetimeContributions,
} from '../calculations.js';
import { fmtZAR as formatCurrency, fmtZAR, fmtZARWhole, fmtNum } from '../lib/format.js';
import { generateId, bindAmountInput } from '../lib/rows.js';
import { createLedger, strong } from '../lib/ledger.js';
import { parseInvestmentQuickAdd, todayISO } from '../lib/quick-add.js';
import { renderPerformancePanel } from '../lib/perf-panel.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, persistConfig } from './persistence.js';

// main.js points this at the retirement re-render — the
// retirement tab reads live investment values; importing that renderer here
// directly would create a module cycle.
let onStateChanged = () => {};
export const setOnStateChanged = (fn) => { onStateChanged = fn; };

let investmentData = {
    transactions: [],
    currentValues: {
        Discretionary: 0,
        TFSA: 0,
        Crypto: 0
    },
    marginalRate: 41
};

const loadInvCsvBtn = document.getElementById('load-inv-csv');

// Inputs for current values
const valDiscretionary = document.getElementById('val-discretionary');
const valTfsa = document.getElementById('val-tfsa');
const valCrypto = document.getElementById('val-crypto');
const marginalRateInput = document.getElementById('marginal-rate-discretionary');

// Current-value fields are formatted amount inputs; state keeps plain numbers.
const refreshCurrentValues = [
    ['Discretionary', valDiscretionary],
    ['TFSA', valTfsa],
    ['Crypto', valCrypto],
].map(([key, input]) => bindAmountInput(input, {
    get: () => investmentData.currentValues[key],
    set: (v) => {
        investmentData.currentValues[key] = v === null ? '' : v;
        updatePerformanceDisplay();
        // Retirement projection reads these current values live — keep it in sync.
        onStateChanged();
        debouncedSave('transactions_investments', generateInvestmentCSV);
    },
}));

const updatePerformanceDisplay = () => {
    calculatePerformance('Discretionary', investmentData.currentValues.Discretionary, 'inv-discretionary', 'gain-discretionary', 'ann-discretionary', 'gain-money-discretionary');
    calculatePerformance('TFSA', investmentData.currentValues.TFSA, 'inv-tfsa', 'gain-tfsa', 'ann-tfsa', 'gain-money-tfsa');
    calculatePerformance('Crypto', investmentData.currentValues.Crypto, 'inv-crypto', 'gain-crypto', 'ann-crypto', 'gain-money-crypto');
    updateTfsaCapDisplay();

    // Mirror the combined current value into the header KPI strip.
    const kpiPortfolio = document.getElementById('kpi-portfolio');
    if (kpiPortfolio) {
        const total = ['Discretionary', 'TFSA', 'Crypto']
            .reduce((s, k) => s + (parseFloat(investmentData.currentValues[k]) || 0), 0);
        kpiPortfolio.textContent = formatCurrency(total);
    }
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
    if (remEl) remEl.textContent = fmtNum(Math.round(cap.remaining));
};

// Progress toward the annual CGT exclusion (gain vs R40,000) for Discretionary.
const updateCgtExclusionDisplay = (gain) => {
    const exclusion = 40000;
    const g = Math.max(0, gain || 0);
    const pct = (g / exclusion) * 100;
    const remaining = Math.max(0, exclusion - g);
    const barEl = document.getElementById('cgt-excl-bar');
    const pctEl = document.getElementById('cgt-excl-pct');
    const remEl = document.getElementById('cgt-excl-remaining');
    if (barEl) {
        barEl.style.width = `${Math.min(100, pct)}%`;
        barEl.className = `h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`;
    }
    if (pctEl) pctEl.textContent = `${pct.toFixed(1)}%`;
    if (remEl) remEl.textContent = fmtNum(Math.round(remaining));
};

// ---- Transactions ledger (UX-4.2) -------------------------------------------
// Built on the shared ledger (src/lib/ledger.js) over
// investmentData.transactions, newest-first; each row's group is its account.
const ACCOUNTS = ['Discretionary', 'TFSA', 'Crypto'];
const TRANSACTION_COLUMNS = [
    { key: 'date', type: 'date', label: 'Date' },
    { key: 'description', type: 'text', label: 'Description' },
    { key: 'amount', type: 'amount', label: 'Amount' },
    // A select styled as a chip; the ledger keeps data-value = the account,
    // which app.css colours like the History donut.
    { key: 'type', type: 'select', label: 'Account', options: ACCOUNTS, inputClass: 'type-input account-chip' },
    // BTC quantity, only on Crypto rows.
    { key: 'cryptoValue', type: 'number', label: 'BTC', ariaLabel: 'BTC quantity', inputClass: 'crypto-value-input',
        when: (item) => item.type === 'Crypto' },
];
let ledger;
const renderTransactions = () => ledger.render();
const saveInvestments = () => debouncedSave('transactions_investments', generateInvestmentCSV);

const MISSING_TEXT = {
    'description,amount': 'Add a description and an amount.',
    description: 'Add a description.',
    amount: 'Add an amount, e.g. 3k or 3000.',
};
const quickAddPreviewFor = (parsed) => {
    if (parsed.error === 'empty') {
        return { state: 'idle', content: 'Press Enter on an empty field to add a blank row dated today.' };
    }
    if (parsed.error) return { state: 'error', content: MISSING_TEXT[parsed.missing.join(',')] };
    const parts = ['Will add ', strong(parsed.account), ' · ', strong(parsed.description), ' · ',
        strong(formatCurrency(parsed.amount))];
    if (parsed.btc !== '') parts.push(' · ', strong(`${parsed.btc} BTC`));
    parts.push(' on ', strong(parsed.date));
    return { state: 'ok', content: parts };
};

const addTransaction = (fields) => {
    const item = { id: generateId(), ...fields };
    investmentData.transactions.push(item);
    ledger.ensureVisible({ item, group: item.type });
    renderTransactions();
    updatePerformanceDisplay();
    saveInvestments();
    return item;
};

// Enter: add the parsed row and clear the field. On an empty field, add a
// blank Discretionary row dated today and focus its description.
const submitQuickAdd = (parsed) => {
    if (parsed.error === 'empty') {
        const item = addTransaction({ date: todayISO(), description: '', amount: '', cryptoValue: '', type: 'Discretionary' });
        ledger.rowElement(item.id)?.querySelector('.description-input')?.focus();
        return false;
    }
    if (parsed.error) return false;
    addTransaction({
        date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        type: parsed.account,
        cryptoValue: parsed.btc === '' ? '' : String(parsed.btc),
    });
    return true;
};

ledger = createLedger({
    elements: {
        list: document.getElementById('transaction-list'),
        filters: document.getElementById('transaction-filters'),
        footer: document.getElementById('transaction-footer'),
        head: document.getElementById('transaction-head'),
        quickAdd: document.getElementById('transaction-quick-add'),
        preview: document.getElementById('transaction-quick-add-preview'),
    },
    getRows: () => investmentData.transactions.map(item => ({ item, group: item.type })),
    getList: () => investmentData.transactions,
    columns: TRANSACTION_COLUMNS,
    rowClass: 'ledger-row inv-ledger',
    filters: {
        storageKey: 'investments.accountFilter',
        options: [{ value: 'all', label: 'All' }, ...ACCOUNTS.map(a => ({ value: a, label: a }))],
        chipText: (o, { count, total }) => `${o.label} (${count}) · ${fmtZARWhole(total)}`,
    },
    footer: ({ filter, stats }) => {
        const total = document.createElement('span');
        total.className = 'font-semibold text-slate-800';
        total.textContent = `${filter === 'all' ? 'Total' : filter} contributed ${formatCurrency(stats[filter].total)}`;
        return [total];
    },
    empty: { none: 'No transactions yet. Type one above, for example "tfsa etf 3000".' },
    quickAdd: { parse: (text) => parseInvestmentQuickAdd(text), preview: quickAddPreviewFor, onSubmit: submitQuickAdd },
    onChange: ({ item, field }) => {
        // A BTC quantity belongs to Crypto rows only.
        if (field === 'type' && item.type !== 'Crypto') item.cryptoValue = '';
        updatePerformanceDisplay();
        saveInvestments();
    },
    onRemove: () => { updatePerformanceDisplay(); saveInvestments(); },
});

const renderFullInvestmentUI = () => {
    // Update Inputs from State
    refreshCurrentValues.forEach(refresh => refresh());
    marginalRateInput.value = (investmentData.marginalRate ?? 41);

    renderTransactions();
    updatePerformanceDisplay();
};

const calculatePerformance = (type, currentValueStr, invId, gainId, annId, moneyGainId) => {
    const currentValue = parseFloat(currentValueStr) || 0;
    const txs = investmentData.transactions.filter(t => t.type === type);

    const rate = (type === 'Discretionary') ? (parseFloat(investmentData.marginalRate) || 0) : 0;
    const r = _calculateInvestmentPerformance(txs, currentValue, new Date(), rate);

    if (type === 'Crypto') {
        const cryptoValEl = document.getElementById('total-crypto-value');
        if (cryptoValEl) cryptoValEl.textContent = r.totalCryptoValue.toFixed(8);
    }

    // invEl is written here (not via renderPerformancePanel) so it updates even
    // when gainEl is absent — matching the pre-refactor order.
    const invEl = document.getElementById(invId);
    if (invEl) invEl.textContent = fmtZAR(r.totalInvested);

    const typeKey = type.toLowerCase();
    // CGT exclusion bar tracks the gain vs the R40,000 threshold (Discretionary only).
    // Reset to 0 when nothing is invested, matching the performance panel's empty state.
    if (type === 'Discretionary') updateCgtExclusionDisplay(r.totalInvested === 0 ? 0 : r.absoluteReturn);
    const gainEl = document.getElementById(gainId);
    if (!gainEl) return;

    renderPerformancePanel(r, {
        gain:         gainEl,
        ann:          document.getElementById(annId),
        money:        document.getElementById(moneyGainId),
        savingsGain:  document.getElementById(`savings-gain-${typeKey}`),
        netVsSavings: document.getElementById(`net-savings-${typeKey}`),
        tax:          document.getElementById(`tax-${typeKey}`),
        netAfterTax:  document.getElementById(`net-savings-after-tax-${typeKey}`),
    }, { fmt: fmtZAR, mutedNet: typeKey === 'discretionary' });
};

marginalRateInput.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    investmentData.marginalRate = Number.isNaN(v) ? 0 : v;
    setConfig('marginal_rate', investmentData.marginalRate);
    updatePerformanceDisplay();
    debouncedSave('transactions_investments', generateInvestmentCSV);
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
            investmentData.marginalRate = (getConfigMap().marginal_rate ?? parsed.marginalRate ?? 41);
            renderFullInvestmentUI();
        }
    } catch (e) {
        console.log('Could not auto-load investments.csv');
    }
};


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
        investmentData.marginalRate = (getConfigMap().marginal_rate ?? parsed.marginalRate ?? 41);
        if (getConfigMap().marginal_rate === undefined && parsed.marginalRate !== undefined) {
            getConfigMap().marginal_rate = parsed.marginalRate;
            persistConfig();
        }
        renderFullInvestmentUI();
        debouncedSave('transactions_investments', generateInvestmentCSV);
    } catch (err) {
        console.error(err);
    }
});


export const getInvestmentData = () => investmentData;
export { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer };
