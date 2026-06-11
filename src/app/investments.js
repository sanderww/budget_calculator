// Investment tab: portfolio performance panels and the transaction list.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    parseInvestmentCSV as _parseInvestmentCSV,
    generateInvestmentCSV as _generateInvestmentCSV,
    tfsaLifetimeContributions as _tfsaLifetimeContributions,
} from '../calculations.js';
import { fmtZAR as formatCurrency, fmtZAR } from '../format.js';
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from './rows.js';
import { renderPerformancePanel } from './perf-panel.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

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
        transactionList.innerHTML = emptyStateHTML('No transactions added yet.');
    } else {
        // Sort by date descending (latest on top), then by ID (creation time) descending
        const sorted = [...investmentData.transactions].sort(sortByDateThenIdDesc);
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

const createTransactionItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 2fr 1fr 0.8fr 1fr auto',
    fields: ['date', 'description', 'amount', 'cryptoValue', { select: ['Discretionary', 'TFSA', 'Crypto'] }],
    compact: true,
});

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
        onStateChanged();
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
            investmentData.marginalRate = (getConfigMap().marginal_rate ?? parsed.marginalRate ?? 41);
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
        investmentData.marginalRate = (getConfigMap().marginal_rate ?? parsed.marginalRate ?? 41);
        if (getConfigMap().marginal_rate === undefined && parsed.marginalRate !== undefined) {
            getConfigMap().marginal_rate = parsed.marginalRate;
            persistConfig();
        }
        renderFullInvestmentUI();
    } catch (err) {
        console.error(err);
    }
});

saveInvCsvBtn.addEventListener('click', saveInvestmentCSV);

export const getInvestmentData = () => investmentData;
export { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer };
