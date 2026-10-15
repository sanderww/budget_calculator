// Budget tab: inputs, summary card, monthly allocation, timeline chart.
import {
    calculateBudgetSummary as _calculateBudgetSummary,
    calculateMonthlyAllocation as _calcMonthlyAllocation,
    balanceAllocation,
    parseBudgetCSV as _parseBudgetCSV,
    generateBudgetCSV as _generateBudgetCSV,
    isPastDue,
    convertFutureCostToProvision,
    changeCommitmentType,
    parseQuickAdd,
    COMMITMENT_KINDS,
} from '../calculations.js';
import {
    renderBudgetTimeline as _renderBudgetTimeline, timelineHorizon, formatDayMonthYear,
} from '../charts/chart_budget_timeline.js';
import { fmtZAR as formatCurrency, parseAmount } from '../lib/format.js';
import {
    sortByDateThenIdAsc, generateId, bindAmountInput,
    createCommitmentRow, setCommitmentPastDue, COMMITMENT_KIND_LABELS,
} from '../lib/rows.js';
import { createLedger, strong } from '../lib/ledger.js';
import { showUndoToast } from '../lib/undo-toast.js';
import { dbPath, debouncedSave, getConfigMap, setConfig, unsetConfig } from './persistence.js';

let budgetData = {
    savings: 0,
    debts: [],
    provisions: [],
    futureCosts: []
};

const savingsInput = document.getElementById('savings');
const futureDateInput = document.getElementById('future-date');

// budgetData array holding each commitment kind.
const KIND_LIST = { debt: 'debts', provision: 'provisions', futureCost: 'futureCosts' };
const listOf = (kind) => budgetData[KIND_LIST[kind]];

const availableMoneyInput = document.getElementById('available-money');
let availableMoney = '';
const refreshAvailableMoney = bindAmountInput(availableMoneyInput, {
    get: () => availableMoney,
    set: (v) => {
        availableMoney = v === null ? '' : v;
        if (v === null) {
            if ('budget_alloc_available' in getConfigMap()) unsetConfig('budget_alloc_available');
        } else {
            setConfig('budget_alloc_available', v);
        }
        renderAllocation();
    },
});
const mortgagePercentageInput = document.getElementById('mortgage-percentage');
const eftPercentageInput = document.getElementById('eft-percentage');
const cryptoPercentageInput = document.getElementById('crypto-percentage');

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
// One table over budgetData.debts/provisions/futureCosts, built on the shared
// ledger (src/lib/ledger.js). Each row carries its kind as its group; the
// arrays (and so the CSV) keep their shape. The ledger is created further
// down, once its handlers are defined.

const FILTER_LABELS = { all: 'All', debt: 'Debts', provision: 'Provisions', futureCost: 'Future costs' };
const commitmentRows = () => COMMITMENT_KINDS.flatMap(kind => listOf(kind).map(item => ({ item, group: kind })));
let ledger;
const renderCommitments = () => ledger.render();

const saveBudget = () => debouncedSave('transactions_budget', generateBudgetCSV);

// Make sure a row of `kind` is visible after it is added or moved.
const revealKind = (kind) => ledger.ensureVisible({ group: kind });

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
function revealCommitmentRow(id) {
    ledger.reveal(id);
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
    renderAllocation();

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

const ALLOC_LABELS = { mortgage: 'Mortgage', eft: 'ETF' };
const fmtPct = (n) => String(n);

// Live allocation (UX-3.1). Reads the amount and the two editable
// percentages, derives Crypto, and redraws the stacked bar and amounts.
const renderAllocation = () => {
    const available = Number.isFinite(parseFloat(availableMoney)) ? parseFloat(availableMoney) : 0;
    const savingsTarget = currentMonthlySavingsTarget || 0;
    const short = available < savingsTarget;
    const r = _calcMonthlyAllocation(
        short ? savingsTarget : available, savingsTarget,
        parseFloat(mortgagePercentageInput.value) || 0,
        parseFloat(eftPercentageInput.value) || 0,
        parseFloat(cryptoPercentageInput.value) || 0,
    );
    const base = short ? savingsTarget : available;
    const pct = (amount) => `${base > 0 ? Math.max(0, (amount / base) * 100) : 0}%`;
    const set = (id, text) => { document.getElementById(id).textContent = text; };
    set('allocation-savings', formatCurrency(savingsTarget));
    set('allocation-mortgage', formatCurrency(r.mortgageAmount));
    set('allocation-eft', formatCurrency(r.eftAmount));
    set('allocation-crypto', formatCurrency(r.cryptoAmount));
    document.getElementById('allocation-bar-savings').style.width = pct(savingsTarget);
    document.getElementById('allocation-bar-mortgage').style.width = pct(r.mortgageAmount);
    document.getElementById('allocation-bar-eft').style.width = pct(r.eftAmount);
    document.getElementById('allocation-bar-crypto').style.width = pct(r.cryptoAmount);
    const leftoverRow = document.getElementById('allocation-leftover-row');
    const hasLeftover = Math.abs(r.leftover) >= 0.005;
    leftoverRow.classList.toggle('hidden', !hasLeftover);
    if (hasLeftover) set('allocation-leftover', formatCurrency(r.leftover));
    const note = document.getElementById('allocation-note');
    note.classList.toggle('hidden', !short);
    note.textContent = short
        ? `Available money is ${formatCurrency(savingsTarget - available)} short of the required savings.`
        : '';
};

const allocationHint = document.getElementById('allocation-hint');
const persistAllocation = () => {
    setConfig('budget_alloc_mortgage_pct', parseFloat(mortgagePercentageInput.value) || 0);
    setConfig('budget_alloc_etf_pct', parseFloat(eftPercentageInput.value) || 0);
};
// Applies balanceAllocation to the inputs. The edited field is only rewritten
// when it was clamped, so typing "3." is never disturbed.
const syncAllocationInputs = (changedField) => {
    const typed = {
        mortgage: parseFloat(mortgagePercentageInput.value) || 0,
        eft: parseFloat(eftPercentageInput.value) || 0,
    };
    const r = balanceAllocation(typed, changedField);
    const other = changedField === 'eft' ? 'mortgage' : 'eft';
    const inputs = { mortgage: mortgagePercentageInput, eft: eftPercentageInput };
    const reduced = r[other] !== typed[other];
    if (reduced) inputs[other].value = fmtPct(r[other]);
    if (r[changedField] !== typed[changedField]) inputs[changedField].value = fmtPct(r[changedField]);
    cryptoPercentageInput.value = fmtPct(r.crypto);
    allocationHint.classList.toggle('hidden', !reduced);
    allocationHint.textContent = reduced
        ? `${ALLOC_LABELS[other]} reduced to ${fmtPct(r[other])}% so the total stays at 100%.`
        : '';
    return r;
};
mortgagePercentageInput.addEventListener('input', () => {
    syncAllocationInputs('mortgage');
    persistAllocation();
    renderAllocation();
});
eftPercentageInput.addEventListener('input', () => {
    syncAllocationInputs('eft');
    persistAllocation();
    renderAllocation();
});

// Type change: move the row to the other array, keeping id/description/amount.
// A debt has no due date, so moving a dated row to Debt drops the date and
// offers Undo (which moves it back and restores the date).
const changeKind = ({ item, group: fromKind }, e, sel) => {
    const id = item.id;
    const newKind = sel.value;
    const prevDate = item.date || '';
    const updated = changeCommitmentType(budgetData, id, newKind);
    if (updated === budgetData) return;
    budgetData = updated;
    revealKind(newKind);
    renderBudget();
    ledger.rowElement(id)?.querySelector('.kind-select')?.focus();
    saveBudget();
    if (newKind === 'debt' && prevDate) {
        showUndoToast({
            message: 'Date removed — debts have no due date.',
            onUndo: () => {
                // Only undo while the row is still a debt (not deleted or moved again).
                if (!budgetData.debts.some(i => i.id === id)) return;
                budgetData = changeCommitmentType(budgetData, id, fromKind);
                const moved = listOf(fromKind).find(i => i.id === id);
                if (moved) moved.date = prevDate;
                revealKind(fromKind);
                renderBudget();
                saveBudget();
            },
        });
    }
};

// Manual by design: a past-due cost was either saved (move it) or spent
// (delete it); only the user knows which.
const moveToProvisions = ({ item }) => {
    const updated = convertFutureCostToProvision(budgetData, item.id);
    if (updated !== budgetData) {
        budgetData = updated;
        revealKind('provision');
        renderBudget();
        saveBudget();
    }
};

// ---- Quick-add ---------------------------------------------------------------
const MISSING_TEXT = {
    'description,amount': 'Add a description and an amount.',
    description: 'Add a description.',
    amount: 'Add an amount, e.g. 6.5k or 12000.',
};

const quickAddPreviewFor = (parsed) => {
    if (parsed.error === 'empty') {
        return { state: 'idle', content: 'Press Enter on an empty field to add a blank row.' };
    }
    if (parsed.error) return { state: 'error', content: MISSING_TEXT[parsed.missing.join(',')] };
    const parts = ['Will add ', strong(COMMITMENT_KIND_LABELS[parsed.kind]), ' · ',
        strong(parsed.description), ' · ', strong(formatCurrency(parsed.amount))];
    if (parsed.date) parts.push(' · due ', strong(parsed.date));
    return { state: 'ok', content: parts };
};

const addCommitment = (kind, fields) => {
    const item = { id: generateId(), ...fields };
    listOf(kind).push(item);
    revealKind(kind);
    renderBudget();
    saveBudget();
    return item;
};

// Enter: add the parsed row and clear the field. On an empty field, add a
// blank Future cost row (the user picks the type in the row) and focus it.
const submitQuickAdd = (parsed) => {
    if (parsed.error === 'empty') {
        const item = addCommitment('futureCost', { description: '', amount: '', date: '' });
        ledger.rowElement(item.id)?.querySelector('.description-input')?.focus();
        return false;
    }
    if (parsed.error) return false;
    const { kind, description, amount, date } = parsed;
    addCommitment(kind, kind === 'debt' ? { description, amount } : { description, amount, date });
    return true;
};

ledger = createLedger({
    elements: {
        list: document.getElementById('commitment-list'),
        filters: document.getElementById('commitment-filters'),
        footer: document.getElementById('commitment-footer'),
        quickAdd: document.getElementById('commitment-quick-add'),
        preview: document.getElementById('commitment-quick-add-preview'),
    },
    getRows: commitmentRows,
    getList: (row) => listOf(row.group),
    // Soonest-first; undated rows (all debts, fresh rows) sit at the top.
    sort: sortByDateThenIdAsc,
    renderRow: ({ item, group }) => createCommitmentRow(item, group, {
        pastDue: group === 'futureCost' && isPastDue(item.date),
    }),
    filters: {
        storageKey: 'budget.commitmentFilter',
        options: ['all', ...COMMITMENT_KINDS].map(value => ({ value, label: FILTER_LABELS[value] })),
    },
    // Total for the current filter; on All, the per-kind subtotals too.
    footer: ({ filter, stats }) => {
        const total = document.createElement('span');
        total.className = 'font-semibold text-slate-800';
        total.textContent = `Total ${formatCurrency(stats[filter].total)}`;
        if (filter !== 'all') return [total];
        const sub = document.createElement('span');
        sub.textContent = COMMITMENT_KINDS
            .map(k => `${FILTER_LABELS[k]} ${formatCurrency(stats[k].total)}`).join(' · ');
        return [sub, total];
    },
    empty: { none: 'No commitments yet. Type one above, for example "school fees 45k 2027-01-15".' },
    quickAdd: { parse: parseQuickAdd, preview: quickAddPreviewFor, onSubmit: submitQuickAdd },
    actions: [
        { selector: '.kind-select', on: 'change', run: changeKind },
        { selector: '.convert-btn', run: moveToProvisions },
    ],
    // Row edits: the item is already updated; totals update live.
    onChange: ({ item, group, field, el }) => {
        if (field === 'date' && group === 'futureCost') setCommitmentPastDue(el, isPastDue(item.date));
        calculateAndDisplaySummary();
        saveBudget();
    },
    // The ledger has re-rendered itself; refresh the rest as renderBudget would.
    onRemove: () => { refreshSavings(); calculateAndDisplaySummary(); saveBudget(); },
});

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

// Prefill the planned-savings, minimum-buffer and allocation inputs from
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
    // Live allocation inputs (UX-3.1). Missing keys keep the 50 / 50 defaults.
    const avail = readConfigAmount('budget_alloc_available');
    availableMoney = avail === undefined ? '' : avail;
    refreshAvailableMoney();
    const savedPct = (key, fallback) => {
        const n = parseFloat(getConfigMap()[key]);
        return Number.isFinite(n) ? n : fallback;
    };
    mortgagePercentageInput.value = String(savedPct('budget_alloc_mortgage_pct', 50));
    eftPercentageInput.value = String(savedPct('budget_alloc_etf_pct', 50));
    syncAllocationInputs('mortgage');
    allocationHint.classList.add('hidden');
    renderAllocation();
};

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
