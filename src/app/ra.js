// RA tab: contributions list, refund estimate, performance panel.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    saTaxYear,
    parseRaCSV as _parseRaCSV,
    generateRaTransactionsCSV as _generateRaTransactionsCSV,
} from '../calculations.js';
import { fmtZAR, fmtZARWhole } from '../lib/format.js';
import { bindAmountInput } from '../lib/rows.js';
import { createLedger, strong } from '../lib/ledger.js';
import { parseTransactionQuickAdd, todayISO } from '../lib/quick-add.js';
import { renderPerformancePanel } from '../lib/perf-panel.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, persistConfig } from './persistence.js';
import { hideUndoToast } from '../lib/undo-toast.js';

// main.js points this at the retirement re-render — the
// retirement tab reads live RA state; importing that renderer here directly
// would create a module cycle.
let onStateChanged = () => {};
export const setOnStateChanged = (fn) => { onStateChanged = fn; };

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

// RA value is a formatted amount input; undefined = not entered.
const raCurrentValueInput = document.getElementById('ra-current-value');
const refreshRaCurrentValue = bindAmountInput(raCurrentValueInput, {
    get: () => raCurrentValue,
    set: (v) => {
        raCurrentValue = v === null ? undefined : v;
        raPersist();
        updateRaPerformanceDisplay();
        onStateChanged();
    },
});

const RA_DEDUCTIBLE_CAP = 430000;

// Summary card: totals, current-tax-year refund, cap warning, performance.
// Contributions are bucketed by saTaxYear (1 March to end February), the
// same grouping as the ledger's tax-year filters.
function renderRaSummary() {
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

    const currentYearLabel = saTaxYear(todayISO());
    const currentYearTotal = raTransactions
        .filter(t => saTaxYear(t.date) === currentYearLabel)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    document.getElementById('ra-current-year-total').textContent = raFmtZARShort(currentYearTotal);

    const expectedCurrentYearRefund = Math.min(currentYearTotal, RA_DEDUCTIBLE_CAP) * (raParams.tax_refund_rate_pct / 100);
    document.getElementById('ra-current-year-refund').textContent = raFmtZARShort(expectedCurrentYearRefund);
    updateRaPerformanceDisplay();

    const yearTotals = new Map();
    raTransactions.forEach(t => {
        const label = saTaxYear(t.date);
        if (!label) return;
        yearTotals.set(label, (yearTotals.get(label) || 0) + (Number(t.amount) || 0));
    });
    const anyCapHit = [...yearTotals.values()].some(v => v > RA_DEDUCTIBLE_CAP);
    document.getElementById('ra-cap-warning').classList.toggle('hidden', !anyCapHit);
}

// ---- Contributions ledger (UX-4.4) ------------------------------------------
// Built on the shared ledger (src/lib/ledger.js) over raTransactions,
// newest-first, grouped by SA tax year ('2026/27').
const MISSING_TEXT = {
    'description,amount': 'Add a description and an amount.',
    description: 'Add a description.',
    amount: 'Add an amount, e.g. 5k or 5000.',
};
const quickAddPreviewFor = (parsed) => {
    if (parsed.error === 'empty') {
        return { state: 'idle', content: 'Press Enter on an empty field to add a blank row dated today.' };
    }
    if (parsed.error) return { state: 'error', content: MISSING_TEXT[parsed.missing.join(',')] };
    return { state: 'ok', content: ['Will add ', strong(parsed.description), ' · ',
        strong(fmtZAR(parsed.amount)), ' on ', strong(parsed.date), ` (tax year ${saTaxYear(parsed.date)})`] };
};

const addContribution = (fields) => {
    const item = { id: raMakeId(), ...fields };
    raTransactions.push(item);
    ledger.ensureVisible({ item, group: saTaxYear(item.date) });
    raPersist();
    renderRa();
    return item;
};

// Enter: add the parsed row and clear the field. On an empty field, add a
// blank "monthly repayment" row dated today and focus its amount.
const submitQuickAdd = (parsed) => {
    if (parsed.error === 'empty') {
        const item = addContribution({ date: todayISO(), description: 'monthly repayment', amount: '' });
        ledger.rowElement(item.id)?.querySelector('.amount-input')?.focus();
        return false;
    }
    if (parsed.error) return false;
    addContribution({ date: parsed.date, description: parsed.description, amount: parsed.amount });
    return true;
};

const ledger = createLedger({
    elements: {
        list: document.getElementById('ra-list'),
        filters: document.getElementById('ra-filters'),
        footer: document.getElementById('ra-footer'),
        head: document.getElementById('ra-head'),
        quickAdd: document.getElementById('ra-quick-add'),
        preview: document.getElementById('ra-quick-add-preview'),
    },
    getRows: () => raTransactions.map(item => ({ item, group: saTaxYear(item.date) })),
    getList: () => raTransactions,
    columns: [
        { key: 'date', type: 'date', label: 'Date' },
        { key: 'description', type: 'text', label: 'Description' },
        { key: 'amount', type: 'amount', label: 'Amount' },
    ],
    rowClass: 'ledger-row tx-ledger',
    filters: {
        storageKey: 'ra.taxYearFilter',
        // All, then one chip per SA tax year present, newest first.
        options: (rows) => [{ value: 'all', label: 'All' },
            ...[...new Set(rows.map(r => r.group).filter(Boolean))].sort().reverse()
                .map(label => ({ value: label, label }))],
    },
    footer: ({ filter, stats }) => {
        const total = document.createElement('span');
        total.className = 'font-semibold text-slate-800';
        total.textContent = `${filter === 'all' ? 'Total' : `${filter} total`} ${fmtZAR(stats[filter].total)}`;
        return [total];
    },
    empty: {
        none: 'No contributions yet. Type one above, for example "monthly 5000".',
        filtered: (opt) => `No contributions in tax year ${opt.label}.`,
    },
    quickAdd: { parse: (text) => parseTransactionQuickAdd(text), preview: quickAddPreviewFor, onSubmit: submitQuickAdd },
    onChange: () => { renderRaSummary(); raPersist(); },
    onRemove: () => { renderRaSummary(); raPersist(); },
});

function renderRa() {
    document.getElementById('ra-refund-rate').value      = raParams.tax_refund_rate_pct;
    refreshRaCurrentValue();
    renderRaSummary();
    ledger.render();
}

document.getElementById('ra-refund-rate').addEventListener('input', (e) => {
    raParams.tax_refund_rate_pct = parseFloat(e.target.value) || 0;
    setConfig('tax_refund_rate_pct', raParams.tax_refund_rate_pct);
    renderRa();
});
// A cleared amount field leaves '' on the row; it is saved as 0 (the CSV
// parser drops rows whose amount is not a number).
const generateRaCSVFromState = () => _generateRaTransactionsCSV(
    raTransactions.map(t => ({ ...t, amount: Number(t.amount) || 0 })), raCurrentValue);

function raPersist() {
    debouncedSave('transactions_ra', generateRaCSVFromState);
}

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
            hideUndoToast(); // an Undo would put a row back into replaced data
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
            raPersist();
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
        // Cleared, then rethrown so a data-mode switch can revert (functional §8).
        raTransactions = [];
        raCurrentValue = undefined;
        throw err;
    }
    raParams = {
        tax_refund_rate_pct: getConfigMap().tax_refund_rate_pct ?? 41,
        nominal_return_pct:  getConfigMap().nominal_return_pct  ?? 10,
    };
    renderRa();
};
// Note: do NOT call loadRaCSVFromServer() here. It depends on
// the config being loaded first; the init IIFE invokes it.

export const getRaState = () => ({ transactions: raTransactions, currentValue: raCurrentValue, params: raParams });
export { renderRa, loadRaCSVFromServer };
