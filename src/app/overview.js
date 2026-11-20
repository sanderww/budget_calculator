// Overview tab: net worth and what it is made of, ranked next steps,
// retirement income against a target, and the savings rate. Reads the other
// tabs' state; owns only three config keys (networth_home_value,
// overview_target_monthly_income, mix_target_*). All maths lives in
// src/calc/overview.js.
import {
    buildBalanceSheet, groupHoldings, withDrift, mixInsights, MIX_LENSES,
    buildNextSteps, tfsaUsage, savingsRate, retirementIncome, retirementLevers,
    valueAgeDays, NEXT_STEP_DEFAULTS, calculateRaTaxSummary, calculateInvestmentPerformance,
    calculatePotValueToday, isPastDue,
} from '../calculations.js';
import { fmtZARWhole as R, fmtZARSigned, parseAmount } from '../lib/format.js';
import { bindAmountInput } from '../lib/rows.js';
import { todayISO } from '../lib/quick-add.js';
import { getConfigMap, setConfig, unsetConfig } from './persistence.js';
import { getBudgetState } from './budget.js';
import { getInvestmentData } from './investments.js';
import { getRaState } from './ra.js';
import { getDebtData } from './debt.js';
import { retirementSnapshotWith, getRetirementParams } from './retirement.js';

// main.js points this at its tab switcher, so a next step can open its tab.
let openTab = () => {};
export const setOpenTab = (fn) => { openTab = fn; };

const $ = (id) => document.getElementById(id);
const num = (v) => Number(v) || 0;
const pct1 = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

// Group colours: the account colours used on the Investments and History tabs.
const GROUP_COLOR = {
    cash: '#64748b', funds: '#6366f1', ra: '#8b5cf6', crypto: '#f59e0b', home: '#0891b2',
    days: '#6366f1', tfsa: '#10b981', pot: '#f97316', age55: '#8b5cf6',
    taxable: '#6366f1', taxfree: '#10b981', deferred: '#8b5cf6',
    zar: '#64748b', offshore: '#ec4899', usd: '#f59e0b',
};
const TARGET_KEYS = ['cash', 'funds', 'ra', 'crypto'];

// Per-viewer view settings (lens, include home, include provisions) are
// browser conveniences.
const store = {
    get(key, fallback) {
        try { const v = localStorage.getItem(`overview.${key}`); return v === null ? fallback : v; } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(`overview.${key}`, String(value)); } catch { /* storage blocked */ }
    },
};
let lens = MIX_LENSES[store.get('lens', 'type')] ? store.get('lens', 'type') : 'type';

const configAmount = (key) => {
    const v = getConfigMap()[key];
    const n = (v === undefined || v === null || v === '') ? null : parseAmount(v);
    return n === null ? undefined : n;
};
const writeConfigAmount = (key, v) => {
    if (v === null) { if (key in getConfigMap()) unsetConfig(key); } else setConfig(key, v);
};

// ---- Inputs this tab owns ----------------------------------------------------
const homeInput = $('ov-home-value');
const refreshHome = homeInput ? bindAmountInput(homeInput, {
    get: () => configAmount('networth_home_value'),
    set: (v) => { writeConfigAmount('networth_home_value', v); renderOverview(); },
}) : () => {};
const targetInput = $('ov-target-income');
const refreshTarget = targetInput ? bindAmountInput(targetInput, {
    get: () => configAmount('overview_target_monthly_income'),
    set: (v) => { writeConfigAmount('overview_target_monthly_income', v); renderRetirementCard(); },
}) : () => {};

// ---- State gathered from the other tabs ---------------------------------------
function raValue() {
    const { transactions, currentValue, currentValueDate, params } = getRaState();
    if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        return { value: num(currentValue), asOf: currentValueDate, estimate: false };
    }
    if (!(transactions || []).length) return { value: 0, estimate: false };
    return {
        value: calculatePotValueToday(transactions, (params && params.nominal_return_pct) || 10, new Date()),
        estimate: true,
    };
}

function gather() {
    const cfg = getConfigMap();
    const { data, runway } = getBudgetState();
    const inv = getInvestmentData();
    const ra = raValue();
    const provisionsTotal = (data.provisions || []).reduce((s, p) => s + num(p.amount), 0);
    const includeProvisions = store.get('includeProvisions', 'true') === 'true';
    const sheet = buildBalanceSheet({
        provisions: provisionsTotal, includeProvisions,
        discretionary: inv.currentValues.Discretionary,
        tfsa: inv.currentValues.TFSA,
        crypto: inv.currentValues.Crypto,
        investmentDates: inv.currentValueDates,
        ra: ra.value, raDate: ra.asOf, raIsEstimate: ra.estimate,
        homeValue: configAmount('networth_home_value'),
        bondBalance: cfg.current_balance, bondDate: cfg.current_balance_asof || undefined,
    });
    return { cfg, data, runway, inv, sheet, provisionsTotal, includeProvisions };
}

// ---- Net worth + mix ----------------------------------------------------------
function renderNetWorth(state) {
    const { sheet, cfg, provisionsTotal, includeProvisions } = state;
    const today = todayISO();
    const nw = $('ov-networth');
    nw.textContent = fmtZARSigned(sheet.netWorth);
    nw.classList.toggle('text-red-600', sheet.netWorth < 0);
    nw.classList.toggle('text-slate-900', sheet.netWorth >= 0);
    const hasHome = sheet.holdings.some(h => h.key === 'home');
    const owesBond = sheet.liabilities.some(l => l.key === 'bond');
    const provHolding = sheet.holdings.find(h => h.key === 'provisions');
    $('ov-networth-sum').textContent = [`Assets ${R(sheet.assets)}${provHolding ? ` (incl. provisions ${R(provHolding.value)})` : ''}`]
        .concat(sheet.liabilities.map(l => `${l.label.toLowerCase()} ${R(l.value)}`))
        .join(' − ')
        + (owesBond && !hasHome ? '. The bond is subtracted but the home is not counted yet: add its value.' : '');

    $('ov-include-provisions-wrap').classList.toggle('hidden', !(provisionsTotal > 0));
    $('ov-include-provisions').checked = includeProvisions;

    const includeBox = $('ov-include-home');
    $('ov-include-home-wrap').classList.toggle('hidden', !hasHome);
    includeBox.checked = store.get('includeHome', 'true') === 'true';
    const includeHome = hasHome && includeBox.checked;

    document.querySelectorAll('#ov-lens .ov-lens-btn').forEach(b =>
        b.setAttribute('aria-pressed', b.dataset.lens === lens ? 'true' : 'false'));
    const def = MIX_LENSES[lens];
    const grouped = groupHoldings(sheet, lens, {
        includeHome,
        raVested: cfg.ra_vested_balance,
        offshoreDiscretionaryPct: cfg.offshore_discretionary_pct,
        offshoreTfsaPct: cfg.offshore_tfsa_pct,
    });
    // Targets compare investable assets only, so they show on the asset-type
    // lens while the home is left out.
    const showTargets = lens === 'type' && !includeHome;
    const targets = Object.fromEntries(TARGET_KEYS.map(k => [k, getConfigMap()[`mix_target_${k}`]]));
    const rows = showTargets ? withDrift(grouped.rows, targets) : grouped.rows;

    $('ov-lens-question').textContent = grouped.total > 0
        ? `${def.question} ${R(grouped.total)} ${includeHome ? 'including home equity' : 'in investable assets'}.`
        : 'Enter balances on the Investments and RA tabs to see what you own.';

    const bar = $('ov-mix-bar');
    bar.replaceChildren(...rows.map(r => {
        const seg = document.createElement('span');
        seg.style.flexBasis = `${r.share.toFixed(3)}%`;
        seg.style.background = GROUP_COLOR[r.key] || '#94a3b8';
        seg.title = `${r.label}: ${pct1(r.share)}`;
        return seg;
    }));

    const table = $('ov-mix-table');
    table.replaceChildren();
    if (rows.length) {
        const head = table.createTHead().insertRow();
        ['Group', 'Amount', 'Share'].concat(showTargets ? ['Target %', 'Drift'] : []).forEach((t, i) => {
            const th = document.createElement('th');
            th.textContent = t;
            th.className = `py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`;
            head.appendChild(th);
        });
        const body = table.createTBody();
        rows.forEach(r => {
            const tr = body.insertRow();
            tr.className = 'border-t border-slate-100';
            tr.dataset.group = r.key;
            const name = tr.insertCell();
            name.className = 'py-2 px-2';
            const sw = document.createElement('span');
            sw.className = 'inline-block w-2.5 h-2.5 rounded-sm mr-2 align-[-1px]';
            sw.style.background = GROUP_COLOR[r.key] || '#94a3b8';
            name.append(sw, document.createTextNode(r.label));
            const amount = tr.insertCell();
            amount.className = 'py-2 px-2 text-right tabular-nums';
            amount.textContent = R(r.value);
            const share = tr.insertCell();
            share.className = 'py-2 px-2 text-right tabular-nums';
            share.textContent = pct1(r.share);
            if (showTargets) {
                const tCell = tr.insertCell();
                tCell.className = 'py-1 px-2 text-right';
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.max = '100';
                input.step = '1';
                input.className = 'input-field text-sm text-right w-20 py-1 ov-target-input';
                input.id = `ov-target-${r.key}`;
                input.setAttribute('aria-label', `Target % for ${r.label}`);
                input.value = r.target ?? '';
                input.addEventListener('change', () => {
                    const key = `mix_target_${r.key}`;
                    const n = parseFloat(input.value);
                    if (Number.isFinite(n)) setConfig(key, Math.min(100, Math.max(0, n)));
                    else if (key in getConfigMap()) unsetConfig(key);
                    renderNetWorth(gather());
                });
                tCell.appendChild(input);
                const dCell = tr.insertCell();
                dCell.className = 'py-2 px-2 text-right tabular-nums';
                if (r.drift === null) {
                    dCell.textContent = '—';
                    dCell.classList.add('text-slate-400');
                } else {
                    dCell.textContent = `${r.drift > 0 ? '+' : ''}${r.drift.toFixed(1)}`;
                    dCell.classList.add(Math.abs(r.drift) >= 2 ? 'text-amber-700' : 'text-slate-500');
                    if (Math.abs(r.drift) >= 2) dCell.classList.add('font-semibold');
                }
            }
        });
    }

    const dob = new Date(getRetirementParams().dob);
    const raAccessYear = Number.isNaN(dob.getTime()) ? null : dob.getFullYear() + 55;
    const lines = mixInsights({ lens, rows, total: grouped.total, includeHome, hasHome, raAccessYear });
    $('ov-mix-insights').replaceChildren(...lines.map(text => {
        const li = document.createElement('li');
        li.className = 'px-3 py-2 rounded-lg bg-slate-50';
        li.textContent = text;
        return li;
    }));

    // Balances used, with how old each one is.
    const sources = sheet.holdings.filter(h => h.key !== 'home' && h.value > 0)
        .concat(sheet.liabilities.filter(l => l.key === 'bond'));
    $('ov-sources').replaceChildren(...sources.map(h => {
        const li = document.createElement('li');
        const age = valueAgeDays(h.asOf, today);
        const stale = !h.undated && (age === null || age > NEXT_STEP_DEFAULTS.staleDays);
        li.className = `px-2 py-1 rounded-full border tabular-nums ${stale ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'}`;
        const when = h.undated ? 'from Budget' : h.estimate ? 'estimate' : age === null ? 'date unknown' : age === 0 ? 'today' : `${age}d ago`;
        li.textContent = `${h.label} ${R(h.value)} · ${when}`;
        return li;
    }));
}

// ---- Next steps ---------------------------------------------------------------
const SEVERITY_STYLE = {
    now: { bar: 'bg-red-500', tag: 'bg-red-50 text-red-700', label: 'Act now' },
    deadline: { bar: 'bg-amber-500', tag: 'bg-amber-50 text-amber-700' },
    tax: { bar: 'bg-indigo-500', tag: 'bg-indigo-50 text-indigo-700' },
    tidy: { bar: 'bg-slate-400', tag: 'bg-slate-100 text-slate-600' },
};
const TAB_NAME = { budget: 'Budget', investment: 'Investments', debt: 'Debt', ra: 'RA', retirement: 'Retirement' };

function renderSteps(state) {
    const { cfg, data, runway, inv, sheet } = state;
    const today = todayISO();
    const ra = getRaState();
    const raTax = calculateRaTaxSummary({
        transactions: ra.transactions,
        remuneration: num(cfg.ra_annual_remuneration),
        refundRatePct: num(cfg.tax_refund_rate_pct ?? ra.params?.tax_refund_rate_pct ?? 41),
    }, today);
    const discTx = (inv.transactions || []).filter(t => t.type === 'Discretionary');
    const disc = calculateInvestmentPerformance(discTx, num(inv.currentValues.Discretionary), new Date(), inv.marginalRate);
    const steps = buildNextSteps({
        todayIso: today,
        runway,
        raTax,
        tfsa: tfsaUsage((inv.transactions || []).filter(t => t.type === 'TFSA'), today),
        discretionaryGain: discTx.length ? disc.absoluteReturn : 0,
        marginalRatePct: inv.marginalRate,
        pastDue: (data.futureCosts || []).filter(c => isPastDue(c.date)),
        values: sheet.holdings.filter(h => h.key !== 'home' && !h.estimate)
            .concat(sheet.liabilities.filter(l => l.key === 'bond'))
            .map(h => ({ label: h.label, value: h.value, asOf: h.asOf, tab: h.tab, undated: !!h.undated })),
    });

    $('ov-steps-count').textContent = steps.length ? `${steps.length} item${steps.length === 1 ? '' : 's'}` : '';
    const list = $('ov-steps');
    list.replaceChildren();
    if (!steps.length) {
        const li = document.createElement('li');
        li.className = 'text-sm text-slate-500';
        li.textContent = 'Nothing needs your attention right now.';
        list.appendChild(li);
        return;
    }
    steps.forEach(step => {
        const style = SEVERITY_STYLE[step.severity];
        const li = document.createElement('li');
        li.className = 'ov-step flex rounded-xl border border-slate-200 overflow-hidden bg-white';
        li.dataset.step = step.id;
        const bar = document.createElement('span');
        bar.className = `w-1 shrink-0 ${style.bar}`;
        const inner = document.createElement('div');
        inner.className = 'flex-1 min-w-0 p-3 space-y-1.5';
        const top = document.createElement('div');
        top.className = 'flex items-start justify-between gap-2';
        const title = document.createElement('p');
        title.className = 'text-sm font-semibold text-slate-800';
        title.textContent = step.title;
        const tag = document.createElement('span');
        tag.className = `shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.tag}`;
        tag.textContent = step.tag || style.label || '';
        top.append(title, tag);
        const body = document.createElement('p');
        body.className = 'text-xs text-slate-600';
        body.textContent = step.body;
        inner.append(top, body);
        if (step.working && step.working.length) {
            const det = document.createElement('details');
            det.className = 'text-xs';
            const sum = document.createElement('summary');
            sum.className = 'cursor-pointer text-indigo-600 font-medium';
            sum.textContent = 'Show the working';
            const pre = document.createElement('div');
            pre.className = 'mt-1.5 p-2 rounded-lg bg-slate-50 font-mono text-[11px] leading-relaxed text-slate-600 overflow-x-auto';
            step.working.forEach(line => {
                const d = document.createElement('div');
                d.textContent = line;
                pre.appendChild(d);
            });
            det.append(sum, pre);
            inner.appendChild(det);
        }
        if (TAB_NAME[step.tab]) {
            const go = document.createElement('button');
            go.type = 'button';
            go.className = 'ov-step-go text-xs font-medium text-indigo-600 hover:text-indigo-800';
            go.textContent = `Open ${TAB_NAME[step.tab]} →`;
            go.addEventListener('click', () => openTab(step.tab));
            inner.appendChild(go);
        }
        li.append(bar, inner);
        list.appendChild(li);
    });
}

// ---- Retirement income --------------------------------------------------------
function renderRetirementCard() {
    const box = $('ov-ret-body');
    if (!box) return;
    box.replaceChildren();
    const params = getRetirementParams();
    if (Number.isNaN(new Date(params.dob).getTime())) {
        box.innerHTML = '<p class="text-sm text-slate-500">Add your date of birth on the Retirement tab to see this.</p>';
        return;
    }
    // Always in today's money here, whatever the Retirement tab's toggle says.
    const income = (overrides = {}) => retirementIncome(retirementSnapshotWith({ show_real_terms: 1, ...overrides }));
    const base = income();
    const target = configAmount('overview_target_monthly_income');
    const age = num(params.retirement_age);

    const big = document.createElement('p');
    big.className = 'text-3xl font-bold text-slate-900 tabular-nums';
    big.id = 'ov-ret-pct';
    const sub = document.createElement('p');
    sub.className = 'text-xs text-slate-500 mt-1';
    sub.id = 'ov-ret-sub';
    if (target > 0) {
        const p = base / target * 100;
        big.textContent = `${Math.round(p)}%`;
        sub.textContent = `of your ${R(target)}/month target at ${age}. Projected ${R(base)}/month from RA drawdown and your lump sum.`;
        const meter = document.createElement('div');
        meter.className = 'mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden';
        const fill = document.createElement('div');
        fill.className = `h-full rounded-full ${p >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`;
        fill.style.width = `${Math.min(100, p).toFixed(1)}%`;
        meter.appendChild(fill);
        box.append(big, sub, meter);
    } else {
        big.textContent = `${R(base)}/month`;
        sub.textContent = `Projected from age ${age}, from RA drawdown and your lump sum. Set a target above to track it.`;
        box.append(big, sub);
    }
    if (params.opt_dutch_enabled) {
        const d = document.createElement('p');
        d.className = 'text-xs text-slate-500 mt-2';
        d.textContent = `Your Dutch pension from ${num(params.opt_dutch_age) || 68} comes on top.`;
        box.appendChild(d);
    }

    const gap = target > 0 ? target - base : 0;
    const levers = retirementLevers(params);
    if (!levers.length) return;
    const h = document.createElement('p');
    h.className = 'text-xs font-semibold text-slate-700 mt-4';
    h.textContent = gap > 0 ? `Levers on the ${R(gap)} gap, one at a time:` : 'What one change would add:';
    const ul = document.createElement('ul');
    ul.className = 'mt-1 text-xs divide-y divide-dashed divide-slate-200';
    ul.id = 'ov-levers';
    levers.forEach(l => {
        const li = document.createElement('li');
        li.className = 'flex justify-between gap-2 py-1.5';
        li.dataset.lever = l.id;
        const delta = income(l.overrides) - base;
        const a = document.createElement('span');
        a.className = 'text-slate-600';
        a.textContent = l.label;
        const b = document.createElement('span');
        b.className = 'font-semibold tabular-nums text-slate-800 whitespace-nowrap';
        b.textContent = `${delta >= 0 ? '+' : '−'}${R(Math.abs(delta))}`;
        li.append(a, b);
        ul.appendChild(li);
    });
    box.append(h, ul);
}

// ---- Savings rate --------------------------------------------------------------
function renderSavingsRate(state) {
    const box = $('ov-rate-body');
    const ra = getRaState();
    const rem = num(state.cfg.ra_annual_remuneration);
    const r = savingsRate({
        investmentTransactions: state.inv.transactions || [],
        raTransactions: ra.transactions || [],
        extraRepayments: (getDebtData().repayments || []),
        remuneration: rem,
    }, todayISO());
    box.replaceChildren();
    const big = document.createElement('p');
    big.className = 'text-3xl font-bold text-slate-900 tabular-nums';
    big.id = 'ov-rate';
    const sub = document.createElement('p');
    sub.className = 'text-xs text-slate-500 mt-1';
    const parts = `investments ${R(r.parts.investments)}, RA ${R(r.parts.ra)}, extra bond ${R(r.parts.bond)}`;
    if (r.rate === null) {
        big.textContent = R(r.saved);
        sub.textContent = `Put away in the last 12 months (${parts}). Enter your annual remuneration on the RA tab to see it as a share of pay.`;
    } else {
        big.textContent = pct1(r.rate);
        sub.textContent = `of gross pay put away in the last 12 months: ${R(r.saved)} (${parts}).`;
    }
    box.append(big, sub);
}

// ---- Render ------------------------------------------------------------------
function renderOverview() {
    if (!$('overview-content')) return;
    refreshHome();
    refreshTarget();
    const state = gather();
    renderNetWorth(state);
    renderSteps(state);
    try {
        renderRetirementCard();
    } catch (err) {
        console.error('Overview retirement card failed:', err);
    }
    renderSavingsRate(state);
}

document.querySelectorAll('#ov-lens .ov-lens-btn').forEach(b => b.addEventListener('click', () => {
    lens = b.dataset.lens;
    store.set('lens', lens);
    renderNetWorth(gather());
}));
$('ov-include-provisions')?.addEventListener('change', (e) => {
    store.set('includeProvisions', e.target.checked);
    const state = gather();
    renderNetWorth(state);
    renderSteps(state);
});
$('ov-include-home')?.addEventListener('change', (e) => {
    store.set('includeHome', e.target.checked);
    renderNetWorth(gather());
});

export { renderOverview };
