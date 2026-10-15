// Budget tab: inputs, summary card, monthly allocation, timeline chart.
import {
    calculateBudgetSummary as _calculateBudgetSummary,
    calculateMonthlyAllocation as _calcMonthlyAllocation,
    parseBudgetCSV as _parseBudgetCSV,
    generateBudgetCSV as _generateBudgetCSV,
    isPastDue,
    convertFutureCostToProvision,
    changeCommitmentType,
    parseQuickAdd,
    summariseCommitments,
    COMMITMENT_KINDS,
} from '../calculations.js';
import {
    renderBudgetTimeline as _renderBudgetTimeline, timelineHorizon, formatDayMonthYear,
} from '../charts/chart_budget_timeline.js';
import { fmtZAR as formatCurrency, parseAmount } from '../lib/format.js';
import {
    sortByDateThenIdAsc, emptyStateHTML, generateId, bindAmountInput, deleteWithUndo,
    createCommitmentRow, setCommitmentPastDue, COMMITMENT_KIND_LABELS,
} from '../lib/rows.js';
import { showUndoToast } from '../lib/undo-toast.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, unsetConfig } from './persistence.js';

let budgetData = {
    savings: 0,
    debts: [],
    provisions: [],
    futureCosts: []
};

const savingsInput = document.getElementById('savings');
const commitmentList = document.getElementById('commitment-list');
const commitmentFilters = document.getElementById('commitment-filters');
const commitmentFooter = document.getElementById('commitment-footer');
const quickAddInput = document.getElementById('commitment-quick-add');
const quickAddPreview = document.getElementById('commitment-quick-add-preview');
const futureDateInput = document.getElementById('future-date');

// budgetData array holding each commitment kind.
const KIND_LIST = { debt: 'debts', provision: 'provisions', futureCost: 'futureCosts' };
const listOf = (kind) => budgetData[KIND_LIST[kind]];

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
        saveBudget();
    },
});

const renderBudget = () => {
    refreshSavings();
    renderCommitments();
    calculateAndDisplaySummary();
};

// ---- Commitments ledger ----------------------------------------------------
// One table over budgetData.debts/provisions/futureCosts. Each row carries its
// kind; the arrays (and so the CSV) keep their shape.

const FILTER_KEY = 'budget.commitmentFilter';
const FILTERS = ['all', ...COMMITMENT_KINDS];
const FILTER_LABELS = { all: 'All', debt: 'Debts', provision: 'Provisions', futureCost: 'Future costs' };
const readFilter = () => {
    try {
        const v = localStorage.getItem(FILTER_KEY);
        return FILTERS.includes(v) ? v : 'all';
    } catch { return 'all'; }
};
let commitmentFilter = readFilter();
const setFilter = (value) => {
    commitmentFilter = value;
    try { localStorage.setItem(FILTER_KEY, value); } catch { /* per-viewer convenience only */ }
};

const renderFilters = (summary) => {
    commitmentFilters.replaceChildren(...FILTERS.map(f => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-chip';
        btn.dataset.filter = f;
        btn.setAttribute('aria-pressed', String(f === commitmentFilter));
        btn.textContent = `${FILTER_LABELS[f]} (${summary.count[f]})`;
        return btn;
    }));
};

// Footer: total for the current filter; on All, the per-kind subtotals too.
const renderCommitmentFooter = (summary = summariseCommitments(budgetData)) => {
    if (summary.count.all === 0) {
        commitmentFooter.replaceChildren();
        return;
    }
    const total = document.createElement('span');
    total.className = 'font-semibold text-slate-800';
    total.textContent = `Total ${formatCurrency(summary.total[commitmentFilter])}`;
    const parts = [total];
    if (commitmentFilter === 'all') {
        const sub = document.createElement('span');
        sub.textContent = COMMITMENT_KINDS
            .map(k => `${FILTER_LABELS[k]} ${formatCurrency(summary.total[k])}`).join(' · ');
        parts.unshift(sub);
    }
    commitmentFooter.replaceChildren(...parts);
};

const renderCommitments = () => {
    const summary = summariseCommitments(budgetData);
    renderFilters(summary);
    // Soonest-first, re-sorted on every render (load, add, delete, type
    // change). Undated rows (all debts, fresh rows) sit at the top. Sorting
    // view rows leaves the stored order alone; rows are addressed by id.
    const kinds = commitmentFilter === 'all' ? COMMITMENT_KINDS : [commitmentFilter];
    const rows = kinds.flatMap(kind => listOf(kind).map(item => ({ kind, item })))
        .sort((a, b) => sortByDateThenIdAsc(a.item, b.item));

    commitmentList.innerHTML = '';
    if (summary.count.all === 0) {
        commitmentList.innerHTML = emptyStateHTML('No commitments yet. Type one above, for example "school fees 45k 2027-01-15".');
    } else if (rows.length === 0) {
        commitmentList.innerHTML = emptyStateHTML(`No ${FILTER_LABELS[commitmentFilter].toLowerCase()} yet.`);
    } else {
        rows.forEach(({ kind, item }) => commitmentList.appendChild(
            createCommitmentRow(item, kind, { pastDue: kind === 'futureCost' && isPastDue(item.date) })));
    }
    renderCommitmentFooter(summary);
};

const saveBudget = () => debouncedSave('transactions_budget', generateBudgetCSV);

// Make sure a row of `kind` is visible after it is added or moved.
const revealKind = (kind) => {
    if (commitmentFilter !== 'all' && commitmentFilter !== kind) setFilter('all');
};

// ---- Runway timeline (UX-2.2 to UX-2.4) -------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const targetRange = document.getElementById('budget-target-range');
const targetRangeLabel = document.getElementById('budget-target-range-label');
const horizonLabel = document.getElementById('budget-horizon-label');
const timelineEmpty = document.getElementById('budget-timeline-empty');
let frozenHorizonMs = null; // set while the target slider is being dragged

// Today as a UTC midnight, so day offsets line up with ISO dates.
const todayUTC = () => {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
};
const isoFromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

// The slider covers the same range as the chart: 1 day after today up to the
// horizon. Its value is the target date's day offset from today.
const syncTargetRange = (horizonMs) => {
    if (!targetRange) return;
    const base = todayUTC();
    const max = Math.max(1, Math.round((horizonMs - base) / DAY_MS));
    targetRange.max = String(max);
    const targetMs = futureDateInput.value ? new Date(futureDateInput.value).getTime() : NaN;
    const days = Number.isFinite(targetMs) ? Math.round((targetMs - base) / DAY_MS) : max;
    targetRange.value = String(Math.min(max, Math.max(1, days)));
    const label = Number.isFinite(targetMs) ? formatDayMonthYear(targetMs) : '—';
    targetRange.setAttribute('aria-valuetext', label);
    if (targetRangeLabel) targetRangeLabel.textContent = label;
    if (horizonLabel) horizonLabel.textContent = formatDayMonthYear(horizonMs);
};

const renderRunwayReadouts = (result) => {
    const box = document.getElementById('budget-lowest-point');
    const value = document.getElementById('budget-lowest-value');
    const date = document.getElementById('budget-lowest-date');
    const perMonth = document.getElementById('budget-buffer-savings');
    const warn = document.getElementById('budget-lowest-warn');
    if (timelineEmpty) timelineEmpty.hidden = !(result && Array.isArray(result.events) && result.events.length === 0);
    if (!box || !value || !date || !perMonth) return;
    if (!result || !result.lowest) {
        value.textContent = '—';
        date.textContent = '—';
        perMonth.textContent = '—';
        box.dataset.warn = 'false';
        if (warn) warn.hidden = true;
        return;
    }
    value.textContent = formatCurrency(result.lowest.value);
    date.textContent = formatDayMonthYear(result.lowest.x);
    box.dataset.warn = String(Boolean(result.belowBuffer));
    if (warn) warn.hidden = !result.belowBuffer;
    perMonth.textContent = `${formatCurrency(result.bufferMonthlySavings)}/month`;
};

// Scroll to a ledger row and highlight it for 1.5 s (chart marker click).
// If the current filter hides the row, switch to All first.
const HIGHLIGHT_MS = 1500;
const findRow = (id) => commitmentList.querySelector(`[data-id="${CSS.escape(id)}"]`);
function revealCommitmentRow(id) {
    if (!COMMITMENT_KINDS.some(k => listOf(k).some(i => i.id === id))) return;
    let row = findRow(id);
    if (!row && commitmentFilter !== 'all') {
        setFilter('all');
        renderCommitments();
        row = findRow(id);
    }
    if (!row) return;
    const reduce = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    row.classList.add('row-highlight');
    setTimeout(() => row.classList.remove('row-highlight'), HIGHLIGHT_MS);
}

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
        const now = new Date();
        // While the slider is held the horizon stays put, so the chart
        // doesn't rescale under the pointer (UX-2.2).
        const horizonMs = frozenHorizonMs ?? timelineHorizon({ futureDate, futureCosts: budgetData.futureCosts, today: now });
        const result = _renderBudgetTimeline({
            container: document.getElementById('budget-timeline-chart'),
            headline: document.getElementById('budget-timeline-headline'),
            savings,
            totalDebts: r.totalDebts,
            totalProvisions: r.totalProvisions,
            futureCosts: budgetData.futureCosts,
            futureDate,
            horizonDate: horizonMs,
            today: now,
            plannedMonthlySavings: planned,
            minBuffer: Number.isFinite(minBuffer) && minBuffer > 0 ? minBuffer : 0,
            onEventClick: revealCommitmentRow,
        });
        // Show the recommended amount as the placeholder so the default is
        // visible when the input is blank (blank = follow the recommendation).
        if (plannedInput && result && Number.isFinite(result.requiredMonthlySavings)) {
            plannedInput.placeholder = String(Math.round(result.requiredMonthlySavings));
        }
        syncTargetRange(horizonMs);
        renderRunwayReadouts(result);
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

// Row edits. The amount is already stored (as a number) by the row's amount
// binding; description and date are copied here. Totals update live.
commitmentList.addEventListener('input', (e) => {
    const target = e.target;
    const row = target.closest('[data-id]');
    if (!row || target.classList.contains('kind-select')) return;
    const item = listOf(row.dataset.kind).find(i => i.id === row.dataset.id);
    if (!item) return;
    if (target.classList.contains('description-input')) {
        item.description = target.value;
    } else if (target.classList.contains('date-input')) {
        item.date = target.value;
        if (row.dataset.kind === 'futureCost') setCommitmentPastDue(row, isPastDue(item.date));
    }
    renderCommitmentFooter();
    calculateAndDisplaySummary();
    saveBudget();
});

// Type change: move the row to the other array, keeping id/description/amount.
// A debt has no due date, so moving a dated row to Debt drops the date and
// offers Undo (which moves it back and restores the date).
commitmentList.addEventListener('change', (e) => {
    const sel = e.target.closest('.kind-select');
    if (!sel) return;
    const row = sel.closest('[data-id]');
    const id = row.dataset.id;
    const fromKind = row.dataset.kind;
    const newKind = sel.value;
    const prevDate = listOf(fromKind).find(i => i.id === id)?.date || '';
    const updated = changeCommitmentType(budgetData, id, newKind);
    if (updated === budgetData) return;
    budgetData = updated;
    revealKind(newKind);
    renderBudget();
    commitmentList.querySelector(`[data-id="${CSS.escape(id)}"] .kind-select`)?.focus();
    saveBudget();
    if (newKind === 'debt' && prevDate) {
        showUndoToast({
            message: 'Date removed — debts have no due date.',
            onUndo: () => {
                // Only undo while the row is still a debt (not deleted or moved again).
                if (!budgetData.debts.some(i => i.id === id)) return;
                budgetData = changeCommitmentType(budgetData, id, fromKind);
                const item = listOf(fromKind).find(i => i.id === id);
                if (item) item.date = prevDate;
                revealKind(fromKind);
                renderBudget();
                saveBudget();
            },
        });
    }
});

commitmentList.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const kind = row.dataset.kind;
    if (e.target.closest('.convert-btn')) {
        // Manual by design: a past-due cost was either saved (move it) or
        // spent (delete it); only the user knows which.
        const updated = convertFutureCostToProvision(budgetData, id);
        if (updated !== budgetData) {
            budgetData = updated;
            revealKind('provision');
            renderBudget();
            saveBudget();
        }
    } else if (e.target.closest('.remove-btn')) {
        // getList reads the live array: budgetData can be replaced (convert,
        // type change, reload) before Undo is clicked.
        deleteWithUndo({
            getList: () => listOf(kind), id,
            onChange: () => { renderBudget(); saveBudget(); },
        });
    }
});

commitmentFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    setFilter(btn.dataset.filter);
    renderCommitments();
    commitmentFilters.querySelector(`[data-filter="${btn.dataset.filter}"]`)?.focus();
});

// ---- Quick-add ---------------------------------------------------------------
const MISSING_TEXT = {
    'description,amount': 'Add a description and an amount.',
    description: 'Add a description.',
    amount: 'Add an amount, e.g. 6.5k or 12000.',
};

const strong = (text) => {
    const el = document.createElement('strong');
    el.textContent = text;
    return el;
};

const renderQuickAddPreview = () => {
    const parsed = parseQuickAdd(quickAddInput.value);
    if (parsed.error === 'empty') {
        quickAddPreview.dataset.state = 'idle';
        quickAddPreview.textContent = 'Press Enter on an empty field to add a blank row.';
        return parsed;
    }
    if (parsed.error) {
        quickAddPreview.dataset.state = 'error';
        quickAddPreview.textContent = MISSING_TEXT[parsed.missing.join(',')];
        return parsed;
    }
    quickAddPreview.dataset.state = 'ok';
    const parts = ['Will add ', strong(COMMITMENT_KIND_LABELS[parsed.kind]), ' · ',
        strong(parsed.description), ' · ', strong(formatCurrency(parsed.amount))];
    if (parsed.date) parts.push(' · due ', strong(parsed.date));
    quickAddPreview.replaceChildren(...parts);
    return parsed;
};

const addCommitment = (kind, fields) => {
    const item = { id: generateId(), ...fields };
    listOf(kind).push(item);
    revealKind(kind);
    renderBudget();
    saveBudget();
    return item;
};

quickAddInput.addEventListener('input', renderQuickAddPreview);
quickAddInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const parsed = renderQuickAddPreview();
    if (parsed.error === 'empty') {
        // Blank row: a Future cost; the user picks the type in the row.
        const item = addCommitment('futureCost', { description: '', amount: '', date: '' });
        commitmentList.querySelector(`[data-id="${CSS.escape(item.id)}"] .description-input`)?.focus();
        return;
    }
    if (parsed.error) return;
    const { kind, description, amount, date } = parsed;
    addCommitment(kind, kind === 'debt' ? { description, amount } : { description, amount, date });
    quickAddInput.value = '';
    renderQuickAddPreview();
});
renderQuickAddPreview();

futureDateInput.addEventListener('input', calculateAndDisplaySummary);

// Dragging the slider writes the same #future-date value the date input
// holds, so the summary card and KPI strip follow. The horizon is frozen
// until the slider is released.
if (targetRange) {
    targetRange.addEventListener('input', () => {
        if (frozenHorizonMs === null) {
            const futureDate = futureDateInput.value ? new Date(futureDateInput.value) : null;
            frozenHorizonMs = timelineHorizon({ futureDate, futureCosts: budgetData.futureCosts, today: new Date() });
        }
        futureDateInput.value = isoFromMs(todayUTC() + Number(targetRange.value) * DAY_MS);
        calculateAndDisplaySummary();
    });
    targetRange.addEventListener('change', () => {
        frozenHorizonMs = null;
        calculateAndDisplaySummary();
    });
}

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
// Minimum buffer (UX-2.4): private config key budget_min_buffer, default 0.
// Blank removes the key.
const minBufferInput = document.getElementById('budget-min-buffer');
let minBuffer; // undefined = blank = 0
const refreshMinBuffer = minBufferInput
    ? bindAmountInput(minBufferInput, {
        get: () => minBuffer,
        set: (v) => {
            minBuffer = v === null ? undefined : v;
            if (minBuffer !== undefined) {
                setConfig('budget_min_buffer', minBuffer);
            } else if ('budget_min_buffer' in getConfigMap()) {
                unsetConfig('budget_min_buffer');
            }
            calculateAndDisplaySummary();
        },
    })
    : () => {};

const readConfigAmount = (key) => {
    const saved = getConfigMap()[key];
    const v = (saved !== undefined && saved !== null && saved !== '') ? parseAmount(saved) : null;
    return v === null ? undefined : v;
};

// Prefill the planned-savings and minimum-buffer inputs from
// config.private.json. Must run after loadConfigFromServer and before the
// first chart render.
const applyBudgetConfig = () => {
    if (plannedSavingsInput) {
        plannedSavings = readConfigAmount('budget_planned_monthly_savings');
        refreshPlannedSavings();
    }
    if (minBufferInput) {
        minBuffer = readConfigAmount('budget_min_buffer');
        refreshMinBuffer();
    }
};

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



export { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer, applyBudgetConfig, revealCommitmentRow };
