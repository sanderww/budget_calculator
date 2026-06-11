// Budget tab: inputs, summary card, monthly allocation, timeline chart.
import {
    calculateBudgetSummary as _calculateBudgetSummary,
    calculateMonthlyAllocation as _calcMonthlyAllocation,
    parseBudgetCSV as _parseBudgetCSV,
    generateBudgetCSV as _generateBudgetCSV,
} from '../calculations.js';
import { renderBudgetTimeline as _renderBudgetTimeline } from '../charts/chart_budget_timeline.js';
import { fmtZAR as formatCurrency } from '../lib/format.js';
import { createRowElement, emptyStateHTML, generateId } from '../lib/rows.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, unsetConfig } from './persistence.js';

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
        container.innerHTML = emptyStateHTML('No items added yet.');
    } else {
        items.forEach(item => container.appendChild(createItemFn(item)));
    }
};

const createDebtItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] });
const createProvisionItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });
const createFutureCostItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });

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
    } else if ('budget_planned_monthly_savings' in getConfigMap()) {
        unsetConfig('budget_planned_monthly_savings');
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

export { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer, applyPlannedSavingsFromConfig };
