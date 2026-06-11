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

function formatDayMonthYear(ms) {
    return new Date(ms).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildBudgetTimelineSeries({ savings, totalDebts, totalProvisions, futureCosts, futureDate, today = new Date(), plannedMonthlySavings }) {
    const todayMs = today instanceof Date ? today.getTime() : new Date(today).getTime();

    if (!futureDate) return null;
    const futureDateMs = futureDate instanceof Date ? futureDate.getTime() : new Date(futureDate).getTime();
    if (!Number.isFinite(futureDateMs) || futureDateMs <= todayMs) return null;

    const dated = (futureCosts || [])
        .map(fc => ({
            description: fc.description || '',
            amount: parseFloat(fc.amount) || 0,
            x: parseISODate(fc.date),
        }))
        .filter(fc => fc.x !== null && fc.x >= todayMs && fc.x <= futureDateMs)
        .sort((a, b) => a.x - b.x);

    if (dated.length === 0) return null;

    const startSavings = parseFloat(savings) || 0;
    const floor = (parseFloat(totalDebts) || 0) + (parseFloat(totalProvisions) || 0);

    const totalFutureCosts = dated.reduce((sum, fc) => sum + fc.amount, 0);
    const monthsToFutureDate = monthsBetween(todayMs, futureDateMs);

    // requiredMonthlySavings: max over cost-date constraints AND futureDate endpoint constraint.
    let requiredMonthlySavings = 0;
    let cumulative = 0;
    for (const fc of dated) {
        cumulative += fc.amount;
        const t = monthsBetween(todayMs, fc.x);
        if (t <= 0) continue;
        const needed = Math.max(0, (cumulative + floor - startSavings) / t);
        if (needed > requiredMonthlySavings) requiredMonthlySavings = needed;
    }
    if (monthsToFutureDate > 0) {
        const neededEnd = Math.max(0, (totalFutureCosts + floor - startSavings) / monthsToFutureDate);
        if (neededEnd > requiredMonthlySavings) requiredMonthlySavings = neededEnd;
    }

    const effectiveMonthlySavings = (typeof plannedMonthlySavings === 'number'
        && Number.isFinite(plannedMonthlySavings)
        && plannedMonthlySavings >= 0)
        ? plannedMonthlySavings
        : requiredMonthlySavings;

    const bars = dated.map(fc => ({ x: fc.x, y: fc.amount, description: fc.description }));

    // Build a piecewise savings trajectory (step-downs at each cost date) for a
    // given monthly-savings rate. Both the planned and recommended lines share
    // the same step-down dates; only the slope differs.
    const buildTrajectory = (monthlyRate) => {
        const line = [{ x: todayMs, y: startSavings }];
        let runningCosts = 0;
        for (const fc of dated) {
            const t = monthsBetween(todayMs, fc.x);
            const before = startSavings + monthlyRate * t - runningCosts;
            line.push({ x: fc.x, y: before });
            runningCosts += fc.amount;
            line.push({ x: fc.x, y: before - fc.amount });
        }
        const lastCostX = dated[dated.length - 1].x;
        if (futureDateMs > lastCostX) {
            const tEnd = monthsBetween(todayMs, futureDateMs);
            const endBalance = startSavings + monthlyRate * tEnd - runningCosts;
            line.push({ x: futureDateMs, y: endBalance });
        }
        return line;
    };

    // savingsLine = the planned trajectory (driven by the user's input, or the
    // required rate when no plan is set). recommendedLine = always the required rate.
    const savingsLine = buildTrajectory(effectiveMonthlySavings);
    const recommendedLine = buildTrajectory(requiredMonthlySavings);

    const floorLine = [
        { x: todayMs, y: floor },
        { x: futureDateMs, y: floor },
    ];

    const minBalance = Math.min(...savingsLine.map(p => p.y));
    const belowFloor = minBalance < floor;

    return {
        startDate: todayMs,
        endDate: futureDateMs,
        floor,
        startSavings,
        requiredMonthlySavings,
        plannedMonthlySavings: effectiveMonthlySavings,
        totalFutureCosts,
        bars,
        savingsLine,
        recommendedLine,
        floorLine,
        minBalance,
        belowFloor,
    };
}

function buildChartOptions(data) {
    const plannedColor = data.belowFloor ? '#ef4444' : '#16a34a';
    // Series order: Future cost (bars), Planned (input-driven), Recommended
    // (calculated), Floor. Bars stay at index 0 so the custom tooltip is unaffected.
    const colors = ['#6366f1', plannedColor, '#f59e0b', '#64748b'];
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
        },
        series: [
            { name: 'Future cost', type: 'column', data: data.bars },
            { name: 'Planned trajectory', type: 'line', data: data.savingsLine },
            { name: 'Recommended trajectory', type: 'line', data: data.recommendedLine },
            { name: 'Debts + provisions floor', type: 'line', data: data.floorLine },
        ],
        stroke: {
            width: [0, 3, 2, 2],
            curve: ['smooth', 'straight', 'straight', 'straight'],
            dashArray: [0, 0, 6, 6],
        },
        colors,
        plotOptions: { bar: { columnWidth: '22%', borderRadius: 2 } },
        markers: { size: [0, 0, 0, 0], hover: { size: 5 } },
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
                const dateStr = formatDayMonthYear(point.x);
                return '<div class="px-3 py-2 text-xs">'
                    + '<div class="font-semibold text-slate-700">' + (point.description || 'Future cost') + '</div>'
                    + '<div class="text-slate-500">' + dateStr + '</div>'
                    + '<div class="text-indigo-600 font-medium">' + formatRand(point.y) + '</div>'
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

function setHeadline(headline, data, futureDateMs) {
    if (!headline) return;
    if (!data) {
        headline.textContent = '';
        return;
    }
    const dateStr = formatDayMonthYear(futureDateMs);
    headline.innerHTML = 'Save <span class="font-semibold text-emerald-700">'
        + formatRand(data.requiredMonthlySavings)
        + '/month</span> to keep above the <span class="font-semibold text-slate-700">'
        + formatRand(data.floor)
        + '</span> debts + provisions floor through <span class="font-semibold text-indigo-700">'
        + formatRand(data.totalFutureCosts)
        + '</span> in future costs by <span class="font-semibold text-slate-700">'
        + dateStr
        + '</span>.';
}

export function renderBudgetTimeline({ container, headline, savings, totalDebts, totalProvisions, futureCosts, futureDate, today = new Date(), plannedMonthlySavings }) {
    if (!container || typeof window === 'undefined') return;
    const ApexCharts = window.ApexCharts;
    if (!ApexCharts) {
        setHeadline(headline, null);
        showPlaceholder(container, 'Chart library is still loading — refresh the page.');
        return;
    }

    const todayMs = today instanceof Date ? today.getTime() : new Date(today).getTime();
    const futureDateMs = futureDate instanceof Date ? futureDate.getTime()
        : (futureDate ? new Date(futureDate).getTime() : null);

    if (!futureDateMs || !Number.isFinite(futureDateMs) || futureDateMs <= todayMs) {
        setHeadline(headline, null);
        showPlaceholder(container, 'Set a future date to see the timeline.');
        return null;
    }

    const data = buildBudgetTimelineSeries({ savings, totalDebts, totalProvisions, futureCosts, futureDate, today, plannedMonthlySavings });

    if (!data) {
        setHeadline(headline, null);
        showPlaceholder(container, 'Add a future cost dated on or before the selected future date to see the timeline.');
        return null;
    }

    setHeadline(headline, data, futureDateMs);

    const options = buildChartOptions(data);
    clearChart(container);
    container.innerHTML = '';
    const instance = new ApexCharts(container, options);
    instance.render();
    container[INSTANCE_KEY] = instance;
    return data;
}
