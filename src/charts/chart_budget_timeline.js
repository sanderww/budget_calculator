import { fmtZARAxis as formatRand } from '../lib/format.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const AVG_DAYS_PER_MONTH = 30.4375;
const MONTH_MS = MS_PER_DAY * AVG_DAYS_PER_MONTH;

const INSTANCE_KEY = '__budgetTimelineChart';

function parseISODate(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const t = new Date(iso + 'T00:00:00Z').getTime();
    return Number.isFinite(t) ? t : null;
}

function monthsBetween(aMs, bMs) {
    return (bMs - aMs) / MONTH_MS;
}

// Dates on the chart are UTC midnights (ISO dates); format them in UTC so the
// label never slips a day. en-GB gives "06 Jun 2026".
export function formatDayMonthYear(ms) {
    return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function toMs(value) {
    if (value === null || value === undefined || value === '') return null;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
}

function addMonthsUTC(ms, n) {
    const d = new Date(ms);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.getTime();
}

// Chart horizon (UX-2.2): today → the later of (target date, latest dated
// future cost) + 3 months, and at least 12 months from today. It depends on
// the target only once the target passes the latest cost, so moving the
// target inside that range leaves the x-axis where it is.
export function timelineHorizon({ futureDate, futureCosts, today = new Date() }) {
    const todayMs = toMs(today);
    let latest = todayMs;
    const target = toMs(futureDate);
    if (target !== null && target > latest) latest = target;
    for (const fc of futureCosts || []) {
        const x = parseISODate(fc.date);
        if (x !== null && x > latest) latest = x;
    }
    return Math.max(addMonthsUTC(latest, 3), addMonthsUTC(todayMs, 12));
}

// Lowest point (UX-2.4): the minimum of (trajectory − floor), with its date.
// The earliest point wins a tie. null for an empty trajectory.
export function lowestPoint(trajectory, floor) {
    if (!Array.isArray(trajectory) || trajectory.length === 0) return null;
    const f = parseFloat(floor) || 0;
    let best = null;
    for (const p of trajectory) {
        const value = p.y - f;
        if (best === null || value < best.value) best = { x: p.x, value };
    }
    return best;
}

// Smallest monthly rate that keeps the trajectory at or above floor + buffer
// after every cost (costs sorted by date, each { x, amount }) and at endMs.
// With buffer 0 this is the original required-savings loop.
export function requiredMonthlySavings({ startSavings, floor, costs, todayMs, endMs, buffer = 0 }) {
    const b = Number.isFinite(buffer) && buffer > 0 ? buffer : 0;
    const target = floor + b;
    let required = 0;
    let cumulative = 0;
    for (const fc of costs) {
        cumulative += fc.amount;
        const t = monthsBetween(todayMs, fc.x);
        if (t <= 0) continue;
        const needed = Math.max(0, (cumulative + target - startSavings) / t);
        if (needed > required) required = needed;
    }
    const tEnd = monthsBetween(todayMs, endMs);
    if (tEnd > 0) {
        const neededEnd = Math.max(0, (cumulative + target - startSavings) / tEnd);
        if (neededEnd > required) required = neededEnd;
    }
    return required;
}

// futureDate (the target) drives the recommended rate: only costs up to it
// count, and its own date is the end constraint. horizonDate (default:
// futureDate) is how far the chart runs: every dated cost up to it is drawn
// and stepped down on the lines. With horizonDate === futureDate the output
// matches the pre-horizon version (tests/chart_budget_timeline.regression.test.js).
export function buildBudgetTimelineSeries({ savings, totalDebts, totalProvisions, futureCosts, futureDate, horizonDate, today = new Date(), plannedMonthlySavings, minBuffer }) {
    const todayMs = today instanceof Date ? today.getTime() : new Date(today).getTime();

    if (!futureDate) return null;
    const futureDateMs = futureDate instanceof Date ? futureDate.getTime() : new Date(futureDate).getTime();
    if (!Number.isFinite(futureDateMs) || futureDateMs <= todayMs) return null;
    const horizonMs = Math.max(toMs(horizonDate) ?? futureDateMs, futureDateMs);

    const drawn = (futureCosts || [])
        .map(fc => ({
            id: fc.id,
            description: fc.description || '',
            amount: parseFloat(fc.amount) || 0,
            x: parseISODate(fc.date),
        }))
        .filter(fc => fc.x !== null && fc.x >= todayMs && fc.x <= horizonMs)
        .sort((a, b) => a.x - b.x);
    const dated = drawn.filter(fc => fc.x <= futureDateMs);

    const startSavings = parseFloat(savings) || 0;
    const floor = (parseFloat(totalDebts) || 0) + (parseFloat(totalProvisions) || 0);
    const buffer = Number.isFinite(minBuffer) && minBuffer > 0 ? minBuffer : 0;

    const totalFutureCosts = dated.reduce((sum, fc) => sum + fc.amount, 0);

    // Recommended: max over cost-date constraints AND the futureDate endpoint.
    const requiredMonthly = requiredMonthlySavings({ startSavings, floor, costs: dated, todayMs, endMs: futureDateMs });
    // Buffer-aware: every drawn cost and the horizon, with floor + buffer.
    const bufferMonthlySavings = requiredMonthlySavings({ startSavings, floor, costs: drawn, todayMs, endMs: horizonMs, buffer });

    const effectiveMonthlySavings = (typeof plannedMonthlySavings === 'number'
        && Number.isFinite(plannedMonthlySavings)
        && plannedMonthlySavings >= 0)
        ? plannedMonthlySavings
        : requiredMonthly;

    const bars = drawn.map(fc => ({ x: fc.x, y: fc.amount, description: fc.description }));

    // Build a piecewise savings trajectory (step-downs at each cost date) for a
    // given monthly-savings rate. Both the planned and recommended lines share
    // the same step-down dates; only the slope differs.
    const buildTrajectory = (monthlyRate) => {
        const line = [{ x: todayMs, y: startSavings }];
        let runningCosts = 0;
        for (const fc of drawn) {
            const t = monthsBetween(todayMs, fc.x);
            const before = startSavings + monthlyRate * t - runningCosts;
            line.push({ x: fc.x, y: before });
            runningCosts += fc.amount;
            line.push({ x: fc.x, y: before - fc.amount });
        }
        const lastX = drawn.length ? drawn[drawn.length - 1].x : todayMs;
        if (horizonMs > lastX) {
            const tEnd = monthsBetween(todayMs, horizonMs);
            const endBalance = startSavings + monthlyRate * tEnd - runningCosts;
            line.push({ x: horizonMs, y: endBalance });
        }
        return line;
    };

    // savingsLine = the planned trajectory (driven by the user's input, or the
    // required rate when no plan is set). recommendedLine = always the required rate.
    const savingsLine = buildTrajectory(effectiveMonthlySavings);
    const recommendedLine = buildTrajectory(requiredMonthly);

    // Each cost as a point on the planned line, just before its step-down.
    // In savingsLine the "before" point of cost i sits at index 1 + 2i.
    const events = drawn.map((fc, i) => ({
        id: fc.id, x: fc.x, y: savingsLine[1 + 2 * i].y, amount: fc.amount, description: fc.description,
    }));

    const floorLine = [
        { x: todayMs, y: floor },
        { x: horizonMs, y: floor },
    ];

    const minBalance = Math.min(...savingsLine.map(p => p.y));
    const belowFloor = minBalance < floor;
    const lowest = lowestPoint(savingsLine, floor);

    return {
        startDate: todayMs,
        endDate: horizonMs,
        targetDate: futureDateMs,
        floor,
        startSavings,
        requiredMonthlySavings: requiredMonthly,
        plannedMonthlySavings: effectiveMonthlySavings,
        totalFutureCosts,
        bars,
        events,
        savingsLine,
        recommendedLine,
        floorLine,
        minBalance,
        belowFloor,
        lowest,
        minBuffer: buffer,
        bufferMonthlySavings,
        belowBuffer: lowest.value < buffer,
    };
}

// Future-cost chip colour (app.css .kind-chip[data-kind="futureCost"]).
const EVENT_COLOR = '#1d4ed8';
const TARGET_COLOR = '#4f46e5';
const BUFFER_COLOR = '#d97706';

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildChartOptions(data, { onEventClick } = {}) {
    const plannedColor = data.belowFloor ? '#ef4444' : '#16a34a';
    // Series order: Future cost (points on the planned line), Planned
    // (input-driven), Recommended (calculated), Floor. The events stay at
    // index 0 so the custom tooltip and click handler can find them.
    const colors = [EVENT_COLOR, plannedColor, '#f59e0b', '#64748b'];
    const yAnnotations = data.minBuffer > 0 ? [{
        y: data.floor + data.minBuffer,
        borderColor: BUFFER_COLOR,
        strokeDashArray: 4,
        label: {
            text: 'Floor + buffer',
            position: 'left',
            textAnchor: 'start',
            borderColor: BUFFER_COLOR,
            style: { color: '#fff', background: BUFFER_COLOR, fontSize: '11px' },
        },
    }] : [];
    return {
        chart: {
            type: 'line',
            height: 360,
            fontFamily: 'inherit',
            toolbar: {
                show: true,
                tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
            },
            zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
            animations: { enabled: true, speed: 300 },
            events: {
                markerClick: (_event, _ctx, { seriesIndex, dataPointIndex }) => {
                    if (seriesIndex !== 0 || !onEventClick) return;
                    const ev = data.events[dataPointIndex];
                    if (ev && ev.id) onEventClick(ev.id);
                },
            },
        },
        series: [
            { name: 'Future cost', type: 'scatter', data: data.events },
            { name: 'Planned trajectory', type: 'line', data: data.savingsLine },
            { name: 'Recommended trajectory', type: 'line', data: data.recommendedLine },
            { name: 'Debts + provisions floor', type: 'line', data: data.floorLine },
        ],
        stroke: {
            width: [0, 3, 2, 2],
            curve: ['straight', 'straight', 'straight', 'straight'],
            dashArray: [0, 0, 6, 6],
        },
        colors,
        markers: { size: [7, 0, 0, 0], strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
        annotations: {
            xaxis: [{
                x: data.targetDate,
                borderColor: TARGET_COLOR,
                strokeDashArray: 0,
                label: {
                    text: 'Target ' + formatDayMonthYear(data.targetDate),
                    orientation: 'horizontal',
                    borderColor: TARGET_COLOR,
                    style: { color: '#fff', background: TARGET_COLOR, fontSize: '11px' },
                },
            }],
            yaxis: yAnnotations,
        },
        xaxis: {
            type: 'datetime',
            min: data.startDate,
            max: data.endDate,
            labels: { datetimeUTC: false, style: { colors: '#64748b' } },
            axisBorder: { color: '#e2e8f0' },
            axisTicks: { color: '#e2e8f0' },
        },
        yaxis: {
            title: { text: 'Amount (R)', style: { color: '#64748b', fontWeight: 500 } },
            labels: { formatter: formatRand, style: { colors: '#64748b' } },
            forceNiceScale: true,
        },
        legend: { position: 'bottom', horizontalAlign: 'center', markers: { radius: 3 }, itemMargin: { horizontal: 12 } },
        tooltip: {
            shared: false,
            x: { format: 'dd MMM yyyy' },
            y: { formatter: formatRand },
            custom: function ({ seriesIndex, dataPointIndex, w }) {
                if (seriesIndex !== 0) return undefined;
                const point = w.config.series[0].data[dataPointIndex];
                if (!point) return undefined;
                return '<div class="px-3 py-2 text-xs">'
                    + '<div class="font-semibold text-slate-700">' + escapeHTML(point.description || 'Future cost') + '</div>'
                    + '<div class="text-slate-500">' + formatDayMonthYear(point.x) + '</div>'
                    + '<div class="text-blue-700 font-medium">' + formatRand(point.amount) + '</div>'
                    + '<div class="text-slate-400 mt-0.5">Click to open in Commitments</div>'
                    + '</div>';
            },
        },
        grid: { borderColor: '#e2e8f0', strokeDashArray: 3 },
    };
}

function clearChart(container) {
    const existing = container[INSTANCE_KEY];
    if (existing) {
        try { existing.destroy(); } catch (_) { /* ignore */ }
        container[INSTANCE_KEY] = null;
    }
}

function showPlaceholder(container, message) {
    clearChart(container);
    container.innerHTML = '<p class="text-sm text-slate-500 italic">' + message + '</p>';
}

function setHeadline(headline, data) {
    if (!headline) return;
    if (!data) {
        headline.textContent = '';
        return;
    }
    const dateStr = formatDayMonthYear(data.targetDate);
    const through = data.totalFutureCosts > 0
        ? ' debts + provisions floor through <span class="font-semibold text-indigo-700">'
            + formatRand(data.totalFutureCosts) + '</span> in future costs by '
        : ' debts + provisions floor by ';
    headline.innerHTML = 'Save <span class="font-semibold text-emerald-700">'
        + formatRand(data.requiredMonthlySavings)
        + '/month</span> to keep above the <span class="font-semibold text-slate-700">'
        + formatRand(data.floor)
        + '</span>' + through + '<span class="font-semibold text-slate-700">'
        + dateStr
        + '</span>.';
}

export function renderBudgetTimeline({ container, headline, savings, totalDebts, totalProvisions, futureCosts, futureDate, horizonDate, today = new Date(), plannedMonthlySavings, minBuffer, onEventClick }) {
    if (!container || typeof window === 'undefined') return;
    const ApexCharts = window.ApexCharts;
    if (!ApexCharts) {
        setHeadline(headline, null);
        showPlaceholder(container, 'Chart library is still loading — refresh the page.');
        return;
    }

    const data = buildBudgetTimelineSeries({ savings, totalDebts, totalProvisions, futureCosts, futureDate, horizonDate, today, plannedMonthlySavings, minBuffer });

    if (!data) {
        setHeadline(headline, null);
        showPlaceholder(container, 'Set a future date to see the timeline.');
        return null;
    }

    setHeadline(headline, data);

    const options = buildChartOptions(data, { onEventClick });
    const existing = container[INSTANCE_KEY];
    if (existing) {
        // Update in place (no animation) so dragging the target date doesn't
        // flicker; fall back to a fresh chart if the update fails.
        try {
            existing.updateOptions(options, false, false);
            return data;
        } catch (_) { /* rebuild below */ }
    }
    clearChart(container);
    container.innerHTML = '';
    const instance = new ApexCharts(container, options);
    instance.render();
    container[INSTANCE_KEY] = instance;
    return data;
}
