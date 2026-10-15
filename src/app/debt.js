// Debt tab: mortgage projection and extra repayments.
import {
    getUpcoming25th,
    monthlyInterestFactor as _monthlyInterestFactor,
    calculateDebtResults as _calculateDebtResults,
    xirr as _xirr,
    parseDebtCSV as _parseDebtCSV,
    generateDebtCSV as _generateDebtCSV,
} from '../calculations.js';
import { fmtZAR as formatCurrency, parseAmount } from '../lib/format.js';
import { generateId, bindAmountInput } from '../lib/rows.js';
import { createLedger, strong } from '../lib/ledger.js';
import { parseTransactionQuickAdd, todayISO } from '../lib/quick-add.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, persistConfig } from './persistence.js';

// --- DEBT CALCULATOR LOGIC ---
let debtData = {
    repayments: []
};

const loadDebtCsvBtn = document.getElementById('load-debt-csv');

// Inputs
const debtAmountInput = document.getElementById('debt-amount');
const debtCurrentBalanceInput = document.getElementById('debt-current-balance');
const debtRepaymentInput = document.getElementById('debt-repayment');
const debtServiceFeeInput = document.getElementById('debt-service-fee');
const debtInterestRateInput = document.getElementById('debt-interest-rate');
const debtNextPaymentInput = document.getElementById('debt-next-payment');
const debtLoanStartInput = document.getElementById('debt-loan-start');
const debtOriginalTermInput = document.getElementById('debt-original-term');

const DEBT_INPUT_BINDINGS = [
    ['principal',       debtAmountInput],
    ['current_balance', debtCurrentBalanceInput],
    ['repayment',       debtRepaymentInput],
    ['service_fee',     debtServiceFeeInput],
    ['interest_rate',   debtInterestRateInput],
    ['next_payment',    debtNextPaymentInput],
    ['loan_start',      debtLoanStartInput],
    ['original_term',   debtOriginalTermInput],
];

// Rand fields are formatted amount inputs. The last valid number of each is
// kept here (the text may read "400,000", or be invalid mid-edit); the config
// stores plain numbers.
const DEBT_AMOUNT_INPUTS = new Set([debtAmountInput, debtCurrentBalanceInput, debtRepaymentInput, debtServiceFeeInput]);
const debtAmountValues = new Map();
const debtAmountRefreshers = new Map();
const amountValue = (el) => debtAmountValues.get(el) ?? 0;
// Writes a loaded value into a binding input, formatting amount fields.
const setDebtInputValue = (el, v) => {
    if (DEBT_AMOUNT_INPUTS.has(el)) {
        debtAmountValues.set(el, parseAmount(v));
        debtAmountRefreshers.get(el)();
    } else {
        el.value = v;
    }
};
// What to store in the config for a binding input: a number for amounts.
const debtInputConfigValue = (el) => (DEBT_AMOUNT_INPUTS.has(el) ? (debtAmountValues.get(el) ?? '') : el.value);

// Seed data shown only when db/transactions/debt.csv does not exist yet.
const defaultDebtRepayments = () => [
    { id: generateId(), date: '2025-11-25', description: 'Extra Repayment', amount: 9500 },
    { id: generateId(), date: '2025-10-25', description: 'Extra Repayment', amount: 8600 },
    { id: generateId(), date: '2025-09-05', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-07-25', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-07-01', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-05-31', description: 'Extra Repayment', amount: 4000 },
];

// Results
const debtSavedAmountEl = document.getElementById('debt-saved-amount');
const debtTotalExtraEl = document.getElementById('debt-total-extra');
const debtNetReturnEl = document.getElementById('debt-net-return');
const debtYieldEl = document.getElementById('debt-yield');
const debtTimeReducedEl = document.getElementById('debt-time-reduced');
const debtNewEndDateEl = document.getElementById('debt-new-end-date');
const debtOriginalEndDateEl = document.getElementById('debt-original-end-date');

const calculateDebtProjection = () => {
    const currentPrincipal = amountValue(debtCurrentBalanceInput) || amountValue(debtAmountInput);
    const totalRepayment = amountValue(debtRepaymentInput);
    const serviceFee = amountValue(debtServiceFeeInput);
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
        const kpiDebtFreeGuard = document.getElementById('kpi-debt-free');
        if (kpiDebtFreeGuard) kpiDebtFreeGuard.textContent = 'Never';
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
    // Mirror the projected payoff date into the header KPI strip.
    const kpiDebtFree = document.getElementById('kpi-debt-free');
    if (kpiDebtFree) {
        kpiDebtFree.textContent = actual.endDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' });
    }
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

// ---- Extra repayments ledger (UX-4.3) ---------------------------------------
// Built on the shared ledger (src/lib/ledger.js) over debtData.repayments,
// newest-first. Rows are grouped by calendar year, the same way the History
// tab groups debt repayments (the YYYY part of the ISO date).
const yearOf = (iso) => {
    const year = iso ? String(iso).split('-')[0] : '';
    return year.length === 4 ? year : '';
};
const saveDebt = () => debouncedSave('transactions_debt', generateDebtCSV);

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
        strong(formatCurrency(parsed.amount)), ' on ', strong(parsed.date)] };
};

const addRepayment = (fields) => {
    const item = { id: generateId(), ...fields };
    debtData.repayments.push(item);
    ledger.ensureVisible({ item, group: yearOf(item.date) });
    renderRepayments();
    saveDebt();
    return item;
};

// Enter: add the parsed row and clear the field. On an empty field, add a
// blank row dated today and focus its description.
const submitQuickAdd = (parsed) => {
    if (parsed.error === 'empty') {
        const item = addRepayment({ date: todayISO(), description: '', amount: '' });
        ledger.rowElement(item.id)?.querySelector('.description-input')?.focus();
        return false;
    }
    if (parsed.error) return false;
    addRepayment({ date: parsed.date, description: parsed.description, amount: parsed.amount });
    return true;
};

const ledger = createLedger({
    elements: {
        list: document.getElementById('repayment-list'),
        filters: document.getElementById('repayment-filters'),
        footer: document.getElementById('repayment-footer'),
        head: document.getElementById('repayment-head'),
        quickAdd: document.getElementById('repayment-quick-add'),
        preview: document.getElementById('repayment-quick-add-preview'),
    },
    getRows: () => debtData.repayments.map(item => ({ item, group: yearOf(item.date) })),
    getList: () => debtData.repayments,
    columns: [
        { key: 'date', type: 'date', label: 'Date' },
        { key: 'description', type: 'text', label: 'Description' },
        { key: 'amount', type: 'amount', label: 'Amount' },
    ],
    rowClass: 'ledger-row tx-ledger',
    filters: {
        storageKey: 'debt.repaymentFilter',
        // All, then one chip per calendar year present, newest first.
        options: (rows) => [{ value: 'all', label: 'All' },
            ...[...new Set(rows.map(r => r.group).filter(Boolean))].sort().reverse()
                .map(year => ({ value: year, label: year }))],
    },
    footer: ({ filter, stats }) => {
        const total = document.createElement('span');
        total.className = 'font-semibold text-slate-800';
        total.textContent = `${filter === 'all' ? 'Total' : `${filter} total`} ${formatCurrency(stats[filter].total)}`;
        return [total];
    },
    empty: {
        none: 'No extra repayments yet. Type one above, for example "5k bonus repayment".',
        filtered: (opt) => `No extra repayments in ${opt.label}.`,
    },
    quickAdd: { parse: (text) => parseTransactionQuickAdd(text), preview: quickAddPreviewFor, onSubmit: submitQuickAdd },
    onChange: () => { calculateDebtProjection(); saveDebt(); },
    onRemove: () => { calculateDebtProjection(); saveDebt(); },
});

const renderRepayments = () => {
    ledger.render();
    calculateDebtProjection();
};

DEBT_INPUT_BINDINGS.forEach(([key, input]) => {
    if (DEBT_AMOUNT_INPUTS.has(input)) {
        debtAmountValues.set(input, parseAmount(input.value)); // HTML default
        debtAmountRefreshers.set(input, bindAmountInput(input, {
            get: () => debtAmountValues.get(input),
            set: (v) => {
                debtAmountValues.set(input, v);
                setConfig(key, v === null ? '' : v);
                calculateDebtProjection();
            },
        }));
    } else {
        input.addEventListener('input', () => {
            setConfig(key, input.value);
            calculateDebtProjection();
        });
    }
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

            DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
                const v = getConfigMap()[k] ?? parsed.params[k];
                if (v !== undefined && v !== '') setDebtInputValue(el, v);
            });

            // Default to upcoming 25th only if no persisted value.
            if (!debtNextPaymentInput.value) debtNextPaymentInput.value = getUpcoming25th();

            renderRepayments();
        } else {
            debtData.repayments = defaultDebtRepayments();
            debtNextPaymentInput.value = getUpcoming25th();
            renderRepayments();
        }
    } catch (e) {
        console.log('Could not auto-load debt.csv');
    }
};


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

        DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
            const v = parsed.params[k];
            if (v !== undefined && v !== '') setDebtInputValue(el, v);
        });
        DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
            if (debtInputConfigValue(el) !== '') getConfigMap()[k] = debtInputConfigValue(el);
        });
        persistConfig();

        // Default to upcoming 25th only if no persisted value.
        if (!debtNextPaymentInput.value) debtNextPaymentInput.value = getUpcoming25th();

        renderRepayments();
        debouncedSave('transactions_debt', generateDebtCSV);
    } catch (err) {
        console.error(err);
    }
});


export const getDebtData = () => debtData;
export { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer };
