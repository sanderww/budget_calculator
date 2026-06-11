// RA tab: contributions list, refund estimate, performance panel.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    taxYearLabel as _taxYearLabel,
    parseRaCSV as _parseRaCSV,
    generateRaTransactionsCSV as _generateRaTransactionsCSV,
} from '../calculations.js';
import { fmtZAR, fmtZARWhole } from '../format.js';
import { createRowElement } from './rows.js';
import { renderPerformancePanel } from './perf-panel.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

// main.js (currently app.js) points this at the retirement re-render — the
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
    onStateChanged();
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

export const getRaState = () => ({ transactions: raTransactions, currentValue: raCurrentValue, params: raParams });
export { renderRa, loadRaCSVFromServer };
