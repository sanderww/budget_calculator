// Budget tab: inputs, summary card, monthly allocation, timeline chart.
import {
    calculateBudgetSummary as _calculateBudgetSummary,
    calculateMonthlyAllocation as _calcMonthlyAllocation,
    parseBudgetCSV as _parseBudgetCSV,
    generateBudgetCSV as _generateBudgetCSV,
    isPastDue,
    convertFutureCostToProvision,
} from '../calculations.js';
import { renderBudgetTimeline as _renderBudgetTimeline } from '../charts/chart_budget_timeline.js';
import { fmtZAR as formatCurrency, parseAmount } from '../lib/format.js';
import { createRowElement, sortByDateThenIdAsc, emptyStateHTML, generateId, bindAmountInput, deleteWithUndo } from '../lib/rows.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, unsetConfig } from './persistence.js';

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


const availableMoneyInput = document.getElementById('available-money');
let availableMoney = '';
bindAmountInput(availableMoneyInput, { get: () => availableMoney, set: (v) => { availableMoney = v === null ? '' : v; } });
const mortgagePercentageInput = document.getElementById('mortgage-percentage');
const eftPercentageInput = document.getElementById('eft-percentage');
const cryptoPercentageInput = document.getElementById('crypto-percentage');
const calculateAllocationBtn = document.getElementById('calculate-allocation');
const allocationResults = document.getElementById('allocation-results');

// Current savings is a formatted amount field; the stored value stays a number.
const refreshSavings = bindAmountInput(savingsInput, {
    get: () => budgetData.savings,
    set: (v) => {
        budgetData.savings = v === null ? '' : v;
        calculateAndDisplaySummary();
        debouncedSave('transactions_budget', generateBudgetCSV);
    },
});

const renderBudget = () => {
    refreshSavings();
    renderList(debtList, budgetData.debts, createDebtItem);
    renderList(provisionList, budgetData.provisions, createProvisionItem);
    // Future costs always display soonest-first, re-sorted on every render
    // (load, refresh, add, delete). Sorting a copy leaves the stored order
    // alone; rows are addressed by id, so this never disturbs an edit.
    renderList(futureCostList, [...budgetData.futureCosts].sort(sortByDateThenIdAsc), createFutureCostItem);
    calculateAndDisplaySummary();
};

const renderList = (container, items, createItemFn) => {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = emptyStateHTML('No items added yet.');
    } else {
        items.forEach(item => container.appendChild(createItemFn(item)));
    }
};

const createDebtItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] });
const createProvisionItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });
// The extra `auto` column holds the "move to provisions" button, shown only
// once a cost's date has passed.
const createFutureCostItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto auto', fields: ['description', 'amount', 'date'],
    convertible: (row) => isPastDue(row.date) });

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

    // Mirror into the header KPI strip.
    const kpiNetNow = document.getElementById('kpi-net-now');
    if (kpiNetNow) {
        kpiNetNow.textContent = formatCurrency(r.currentNetAmount);
        kpiNetNow.style.color = r.currentNetAmount >= 0 ? '#16a34a' : '#ef4444';
    }
    const kpiNetFuture = document.getElementById('kpi-net-future');
    if (kpiNetFuture) {
        kpiNetFuture.textContent = formatCurrency(r.futureNetAmount);
        kpiNetFuture.style.color = r.futureNetAmount >= 0 ? '#0f172a' : '#ef4444';
    }
    const kpiNetDate = document.getElementById('kpi-net-date');
    if (kpiNetDate) kpiNetDate.textContent = futureDateInput.value || '—';

    currentMonthlySavingsTarget = r.monthlySavingsTarget;

    try {
        const plannedInput = document.getElementById('budget-timeline-planned-savings');
        const planned = Number.isFinite(plannedSavings) && plannedSavings >= 0 ? plannedSavings : undefined;
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

const allocationError = document.getElementById('allocation-error');
const showAllocationError = (msg) => {
    allocationError.textContent = msg;
    allocationError.classList.remove('hidden');
    allocationResults.classList.add('hidden');
};

const calculateMonthlyAllocation = () => {
    const availableMoneyValue = parseAmount(availableMoneyInput.value) ?? 0;
    const mortgagePercentage = parseFloat(mortgagePercentageInput.value) || 0;
    const eftPercentage = parseFloat(eftPercentageInput.value) || 0;
    const cryptoPercentage = parseFloat(cryptoPercentageInput.value) || 0;
    const monthlySavingsTarget = currentMonthlySavingsTarget || 0;

    const totalPercentage = mortgagePercentage + eftPercentage + cryptoPercentage;

    if (totalPercentage > 100) {
        showAllocationError('Total percentage cannot exceed 100%. Please adjust your percentages.');
        return;
    }
    if (totalPercentage === 0) {
        showAllocationError('Please enter at least one percentage allocation.');
        return;
    }

    const r = _calcMonthlyAllocation(availableMoneyValue, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage);

    if (r.remainingMoney < 0) {
        showAllocationError('Available money is less than required monthly savings. Increase your available money or reduce your financial commitments.');
        return;
    }

    allocationError.classList.add('hidden');
    document.getElementById('allocation-savings').textContent = formatCurrency(monthlySavingsTarget);
    document.getElementById('allocation-mortgage').textContent = formatCurrency(r.mortgageAmount);
    document.getElementById('allocation-eft').textContent = formatCurrency(r.eftAmount);
    document.getElementById('allocation-crypto').textContent = formatCurrency(r.cryptoAmount);
    document.getElementById('allocation-total').textContent = formatCurrency(r.totalAllocated);

    allocationResults.classList.remove('hidden');
};

// getList returns the live array (budgetData can be replaced by a convert or
// reload, so Undo must not hold on to the array it was deleted from).
const handleListChange = (e, getList) => {
    const target = e.target;
    const itemDiv = target.closest('[data-id]');
    if (!itemDiv) return;

    const id = itemDiv.dataset.id;
    const item = getList().find(i => i.id === id);
    if (!item) return;

    if (target.closest('.remove-btn')) {
        deleteWithUndo({
            getList, id,
            onChange: () => { renderBudget(); debouncedSave('transactions_budget', generateBudgetCSV); },
        });
    } else if (target.classList.contains('description-input')) {
        item.description = target.value;
    } else if (target.classList.contains('amount-input')) {
        // Already stored by the row's amount binding (a number, not the
        // formatted text).
    } else if (target.classList.contains('date-input')) {
        item.date = target.value;
    }
    calculateAndDisplaySummary();
};

addDebtBtn.addEventListener('click', () => {
    budgetData.debts.push({ id: generateId(), description: '', amount: '' });
    renderBudget();
    debouncedSave('transactions_budget', generateBudgetCSV);
});

addProvisionBtn.addEventListener('click', () => {
    budgetData.provisions.push({ id: generateId(), description: '', amount: '', date: '' });
    renderBudget();
    debouncedSave('transactions_budget', generateBudgetCSV);
});

addFutureCostBtn.addEventListener('click', () => {
    budgetData.futureCosts.push({ id: generateId(), description: '', amount: '', date: '' });
    renderBudget();
    debouncedSave('transactions_budget', generateBudgetCSV);
});

futureDateInput.addEventListener('input', calculateAndDisplaySummary);

const plannedSavingsInput = document.getElementById('budget-timeline-planned-savings');
const plannedSavingsReset = document.getElementById('budget-timeline-reset-planned');
// Persist the planned monthly-savings override to config.private.json
// (auto-save, same mechanism as the rest of the page). Blank/invalid
// removes the override so the chart follows the recommended amount.
let plannedSavings; // undefined = blank = follow the recommendation
const refreshPlannedSavings = plannedSavingsInput
    ? bindAmountInput(plannedSavingsInput, {
        get: () => plannedSavings,
        set: (v) => {
            plannedSavings = v === null ? undefined : v;
            persistPlannedSavings();
            calculateAndDisplaySummary();
        },
    })
    : () => {};
function persistPlannedSavings() {
    if (!plannedSavingsInput) return;
    const val = plannedSavings === undefined ? NaN : plannedSavings;
    if (Number.isFinite(val) && val >= 0) {
        setConfig('budget_planned_monthly_savings', val);
    } else if ('budget_planned_monthly_savings' in getConfigMap()) {
        unsetConfig('budget_planned_monthly_savings');
    }
}
if (plannedSavingsReset) {
    plannedSavingsReset.addEventListener('click', () => {
        plannedSavings = undefined;
        refreshPlannedSavings();
        if ('budget_planned_monthly_savings' in getConfigMap()) {
            unsetConfig('budget_planned_monthly_savings');
        }
        calculateAndDisplaySummary();
    });
}
// Prefill the planned-savings input from the saved override (config.private.json).
// Must run after loadConfigFromServer and before the first chart render.
const applyPlannedSavingsFromConfig = () => {
    if (!plannedSavingsInput) return;
    const saved = getConfigMap().budget_planned_monthly_savings;
    const v = (saved !== undefined && saved !== null && saved !== '') ? parseAmount(saved) : null;
    plannedSavings = v === null ? undefined : v;
    refreshPlannedSavings();
};

debtList.addEventListener('input', (e) => { handleListChange(e, () => budgetData.debts); debouncedSave('transactions_budget', generateBudgetCSV); });
provisionList.addEventListener('input', (e) => { handleListChange(e, () => budgetData.provisions); debouncedSave('transactions_budget', generateBudgetCSV); });
futureCostList.addEventListener('input', (e) => { handleListChange(e, () => budgetData.futureCosts); debouncedSave('transactions_budget', generateBudgetCSV); });

debtList.addEventListener('click', (e) => { handleListChange(e, () => budgetData.debts); debouncedSave('transactions_budget', generateBudgetCSV); });
provisionList.addEventListener('click', (e) => { handleListChange(e, () => budgetData.provisions); debouncedSave('transactions_budget', generateBudgetCSV); });
// Convert is intercepted before the shared handler: it is the only action
// that moves a row between two lists, so it owns the whole click.
futureCostList.addEventListener('click', (e) => {
    const convertBtn = e.target.closest('.convert-btn');
    if (convertBtn) {
        const id = convertBtn.closest('[data-id]')?.dataset.id;
        const updated = convertFutureCostToProvision(budgetData, id);
        if (updated !== budgetData) {
            budgetData = updated;
            renderBudget();
            debouncedSave('transactions_budget', generateBudgetCSV);
        }
        return;
    }
    handleListChange(e, () => budgetData.futureCosts);
    debouncedSave('transactions_budget', generateBudgetCSV);
});

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



export { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer, applyPlannedSavingsFromConfig };
