// Interactive retirement scenario charts: monthly income and available capital
// per age (55 → life expectancy), each broken down by component, with a vertical
// line at the retirement age. Rendered from snapshot.scenario (see
// buildRetirementScenarioTimeline in src/calc/retirement.js).

import { fmtZARAxis as formatRand } from '../lib/format.js';

const INSTANCE_KEY_INCOME = '__retirementScenarioIncomeChart';
const INSTANCE_KEY_CAPITAL = '__retirementScenarioCapitalChart';

const INCOME_LAYERS = [
    { key: 'raAnnuity', name: 'RA annuity (net)', color: '#6366f1' },
    { key: 'raSavingsPot', name: 'RA savings-pot (net)', color: '#a855f7' },
    { key: 'dutch', name: 'Dutch pension (net)', color: '#0ea5e9' },
    { key: 'manualDraw', name: 'Capital drawdown', color: '#f59e0b' },
];

const CAPITAL_LAYERS = [
    { key: 'discretionary', name: 'Discretionary', color: '#10b981' },
    { key: 'tfsa', name: 'TFSA', color: '#22c55e' },
    { key: 'crypto', name: 'Crypto', color: '#f59e0b' },
    { key: 'raLumpOneOff', name: 'RA lump + one-offs', color: '#a855f7' },
    { key: 'raPot', name: 'RA pot (annuitised)', color: '#6366f1' },
];

// Absurd inputs can make upstream figures non-finite; never feed those to the
// chart — coerce to 0 so a bad config degrades gracefully instead of throwing.
const safeRound = (v) => (Number.isFinite(v) ? Math.round(v) : 0);

function clearInstance(container, key) {
    if (!container) return;
    const existing = container[key];
    if (existing) {
        try { existing.destroy(); } catch (_) { /* ignore */ }
        container[key] = null;
    }
}

function showPlaceholder(container, message) {
    if (!container) return;
    container.innerHTML = '<p class="text-sm text-slate-500 italic">' + message + '</p>';
}

function buildScenarioOptions({ title, ages, seriesDefs, yAxisLabel, retAge }) {
    const annotations = (Number.isFinite(retAge) && ages.length)
        ? {
            xaxis: [{
                x: retAge,
                strokeDashArray: 4,
                borderColor: '#475569',
                label: {
                    text: 'Retirement (age ' + retAge + ')',
                    orientation: 'horizontal',
                    position: 'top',
                    style: { color: '#fff', background: '#475569', fontSize: '11px' },
                },
            }],
        }
        : {};
    return {
        chart: {
            type: 'area',
            stacked: true,
            height: 360,
            fontFamily: 'inherit',
            toolbar: { show: false },
            animations: { enabled: true, speed: 300 },
        },
        title: { text: title, align: 'left', style: { fontSize: '14px', fontWeight: 600, color: '#334155' } },
        series: seriesDefs.map(s => ({ name: s.name, data: s.data })),
        colors: seriesDefs.map(s => s.color),
        dataLabels: { enabled: false },
        stroke: { curve: 'straight', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.15 } },
        annotations,
        xaxis: {
            categories: ages,
            title: { text: 'Age', style: { color: '#64748b', fontWeight: 500 } },
            tickAmount: Math.min(15, Math.max(1, ages.length - 1)),
            labels: { style: { colors: '#64748b' } },
            axisBorder: { color: '#e2e8f0' },
            axisTicks: { color: '#e2e8f0' },
        },
        yaxis: {
            title: { text: yAxisLabel, style: { color: '#64748b', fontWeight: 500 } },
            labels: { formatter: formatRand, style: { colors: '#64748b' } },
            min: 0,
            forceNiceScale: true,
        },
        legend: { position: 'bottom', horizontalAlign: 'center', markers: { radius: 3 }, itemMargin: { horizontal: 8 } },
        tooltip: {
            shared: true,
            intersect: false,
            x: { formatter: (v) => 'Age ' + v },
            y: { formatter: formatRand },
        },
        grid: { borderColor: '#e2e8f0', strokeDashArray: 3 },
    };
}

function renderArea(container, instanceKey, ApexCharts, opts, emptyMessage) {
    if (!container) return;
    clearInstance(container, instanceKey);
    container.innerHTML = '';
    if (opts.series.length === 0) {
        showPlaceholder(container, emptyMessage);
        return;
    }
    const inst = new ApexCharts(container, opts);
    inst.render();
    container[instanceKey] = inst;
}

export function renderRetirementScenarioCharts({ containerIncome, containerCapital, snapshot, badge }) {
    if (typeof window === 'undefined') return null;
    const ApexCharts = window.ApexCharts;
    if (!ApexCharts) {
        showPlaceholder(containerIncome, 'Chart library is still loading — refresh the page.');
        showPlaceholder(containerCapital, '');
        return null;
    }

    const scenario = snapshot && snapshot.scenario;
    const points = scenario && scenario.points;
    if (!points || points.length < 2) {
        clearInstance(containerIncome, INSTANCE_KEY_INCOME);
        clearInstance(containerCapital, INSTANCE_KEY_CAPITAL);
        showPlaceholder(containerIncome, 'Not enough retirement data to chart a timeline.');
        showPlaceholder(containerCapital, '');
        return null;
    }

    const realTerms = !!scenario.realTerms;
    if (badge) {
        badge.textContent = realTerms ? "today's money" : 'nominal';
        badge.classList.toggle('bg-slate-100', !realTerms);
        badge.classList.toggle('text-slate-700', !realTerms);
        badge.classList.toggle('bg-amber-100', realTerms);
        badge.classList.toggle('text-amber-800', realTerms);
    }

    const ages = points.map(pt => pt.age);
    const firstAge = ages[0];
    const lastAge = ages[ages.length - 1];

    const incomeSeries = INCOME_LAYERS
        .map(layer => ({ name: layer.name, color: layer.color, data: points.map(pt => safeRound(pt.income[layer.key])) }))
        .filter(s => s.data.some(v => v > 0));

    const capitalSeries = CAPITAL_LAYERS
        .map(layer => ({ name: layer.name, color: layer.color, data: points.map(pt => safeRound(pt.capital[layer.key])) }))
        .filter(s => s.data.some(v => v > 0));

    renderArea(containerIncome, INSTANCE_KEY_INCOME, ApexCharts, buildScenarioOptions({
        title: 'Monthly income through retirement (age ' + firstAge + '–' + lastAge + ')',
        ages,
        seriesDefs: incomeSeries,
        yAxisLabel: 'R / month',
        retAge: scenario.retAge,
    }), 'No projected retirement income to chart.');

    renderArea(containerCapital, INSTANCE_KEY_CAPITAL, ApexCharts, buildScenarioOptions({
        title: 'Available capital through retirement',
        ages,
        seriesDefs: capitalSeries,
        yAxisLabel: 'R (total)',
        retAge: scenario.retAge,
    }), 'No projected retirement capital to chart.');

    return { ages, incomeSeries, capitalSeries, realTerms, drawdownExhaustedAge: scenario.drawdownExhaustedAge };
}
