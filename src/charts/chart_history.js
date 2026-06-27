// History tab charts: a category-total donut and a per-year stacked-bar timeline.
// Both are driven by the same HISTORY_CATEGORIES list so colours and labels stay
// in sync with the History table. Built on ApexCharts (loaded globally), matching
// chart_retirement.js / chart_budget_timeline.js.

import { fmtZARAxis as formatRand } from '../lib/format.js';

// Single source of truth for category order, labels, and colours. The History
// table column order, the pie slices, and the timeline series all follow this.
export const HISTORY_CATEGORIES = [
    { key: 'debt',          name: 'Debt Repaid',   color: '#ef4444' },
    { key: 'discretionary', name: 'Discretionary', color: '#6366f1' },
    { key: 'tfsa',          name: 'TFSA',          color: '#10b981' },
    { key: 'ra',            name: 'RA',            color: '#a855f7' },
    { key: 'crypto',        name: 'Crypto',        color: '#f59e0b' },
];

// Charts live inside History's innerHTML, which is rebuilt on every tab switch.
// Keep the instances module-scoped and destroy them before each re-render so we
// don't leak ApexCharts instances (each registers a window resize listener).
let pieInstance = null;
let barInstance = null;

function destroy(instance) {
    if (instance) {
        try { instance.destroy(); } catch (_) { /* ignore */ }
    }
}

function showPlaceholder(container, message) {
    if (container) container.innerHTML = '<p class="text-sm text-slate-500 italic">' + message + '</p>';
}

function buildPieOptions(slices) {
    return {
        chart: { type: 'donut', height: 340, fontFamily: 'inherit' },
        series: slices.map(s => s.total),
        labels: slices.map(s => s.name),
        colors: slices.map(s => s.color),
        stroke: { width: 1, colors: ['#fff'] },
        dataLabels: { enabled: true, formatter: (pct) => Math.round(pct) + '%' },
        legend: { position: 'bottom', horizontalAlign: 'center', markers: { radius: 3 }, itemMargin: { horizontal: 8 } },
        plotOptions: {
            pie: {
                donut: {
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total',
                            color: '#64748b',
                            formatter: (w) => formatRand(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
                        },
                    },
                },
            },
        },
        tooltip: { y: { formatter: formatRand } },
    };
}

function buildBarOptions(years, series) {
    return {
        chart: { type: 'bar', stacked: true, height: 360, fontFamily: 'inherit', toolbar: { show: false }, animations: { enabled: true, speed: 300 } },
        series: series.map(s => ({ name: s.name, data: s.data })),
        colors: series.map(s => s.color),
        plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
        dataLabels: { enabled: false },
        fill: { opacity: 1 },
        xaxis: {
            categories: years,
            labels: { style: { colors: '#64748b' } },
            axisBorder: { color: '#e2e8f0' },
            axisTicks: { color: '#e2e8f0' },
        },
        yaxis: {
            title: { text: 'Amount (R)', style: { color: '#64748b', fontWeight: 500 } },
            labels: { formatter: formatRand, style: { colors: '#64748b' } },
            min: 0,
            forceNiceScale: true,
        },
        legend: { position: 'bottom', horizontalAlign: 'center', markers: { radius: 3 }, itemMargin: { horizontal: 8 } },
        tooltip: { shared: true, intersect: false, y: { formatter: formatRand } },
        grid: { borderColor: '#e2e8f0', strokeDashArray: 3 },
    };
}

// Render both History charts from per-year buckets and category totals.
//   years   — sorted array of calendar-year strings (the x-axis of the timeline)
//   perYear — { [year]: { debt, discretionary, tfsa, ra, crypto } }
//   totals  — { debt, discretionary, tfsa, ra, crypto } grand totals (pie slices)
export function renderHistoryCharts({ pieContainer, barContainer, years, perYear, totals }) {
    if (typeof window === 'undefined') return;
    const ApexCharts = window.ApexCharts;

    destroy(pieInstance); pieInstance = null;
    destroy(barInstance); barInstance = null;

    if (!ApexCharts) {
        showPlaceholder(pieContainer, 'Chart library is still loading — refresh the page.');
        showPlaceholder(barContainer, '');
        return;
    }

    const hasData = years.length > 0 && HISTORY_CATEGORIES.some(c => (totals[c.key] || 0) > 0);
    if (!hasData) {
        showPlaceholder(pieContainer, 'No allocations yet — add debt repayments, investments, or RA contributions.');
        showPlaceholder(barContainer, '');
        return;
    }

    // Pie: one slice per category with a positive total.
    const slices = HISTORY_CATEGORIES
        .map(c => ({ name: c.name, color: c.color, total: Math.round(totals[c.key] || 0) }))
        .filter(s => s.total > 0);

    pieContainer.innerHTML = '';
    pieInstance = new ApexCharts(pieContainer, buildPieOptions(slices));
    pieInstance.render();

    // Timeline: one stacked series per category that has any positive year.
    const series = HISTORY_CATEGORIES
        .map(c => ({ name: c.name, color: c.color, data: years.map(y => Math.round((perYear[y] && perYear[y][c.key]) || 0)) }))
        .filter(s => s.data.some(v => v > 0));

    barContainer.innerHTML = '';
    barInstance = new ApexCharts(barContainer, buildBarOptions(years, series));
    barInstance.render();
}
