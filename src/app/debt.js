// Debt tab: mortgage projection and extra repayments.
import {
    getUpcoming25th,
    monthlyInterestFactor as _monthlyInterestFactor,
    calculateDebtResults as _calculateDebtResults,
    xirr as _xirr,
    parseDebtCSV as _parseDebtCSV,
    generateDebtCSV as _generateDebtCSV,
} from '../calculations.js';
import { fmtZAR as formatCurrency } from '../format.js';
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from './rows.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

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
        repaymentList.innerHTML = emptyStateHTML('No extra repayments added.');
    } else {
        // Sort by date descending (latest on top)
        const sorted = [...debtData.repayments].sort(sortByDateThenIdDesc);
        sorted.forEach(item => {
            repaymentList.appendChild(createRowElement(item, {
                gridTemplateColumns: '1fr 2fr 1fr auto',
                fields: ['date', 'description', 'amount'],
                compact: true,
            }));
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

DEBT_INPUT_BINDINGS.forEach(([key, input]) => {
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

            DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
                const v = getConfigMap()[k] ?? parsed.params[k];
                if (v !== undefined && v !== '') el.value = v;
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

        DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
            const v = parsed.params[k];
            if (v !== undefined && v !== '') el.value = v;
        });
        DEBT_INPUT_BINDINGS.forEach(([k, el]) => {
            if (el.value !== '') getConfigMap()[k] = el.value;
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

export const getDebtData = () => debtData;
export { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer };
