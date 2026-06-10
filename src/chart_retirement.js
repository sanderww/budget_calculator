const INSTANCE_KEY_INCOME = '__retirementIncomeChart';
const INSTANCE_KEY_CAPITAL = '__retirementCapitalChart';

import { fmtZARAxis as formatRand } from './format.js';

// PMT amortising L over (lifeExp - age) years at returnPct annual (monthly compounded).
// Matches §5.4 "Lump-sum monthly drawdown" in core-requirements.md.
function lumpSumPmt(L, age, lifeExp, returnPct) {
    const N = Math.max(0, Math.round((Math.max(age, lifeExp) - age) * 12));
    if (!Number.isFinite(L) || L <= 0 || N === 0) return 0;
    const r = Math.pow(1 + (Number(returnPct) || 0) / 100, 1 / 12) - 1;
    if (Math.abs(r) < 1e-9) return L / N;
    return L * r / (1 - Math.pow(1 + r, -N));
}

function deflater(snapshot) {
    const p = snapshot.params || {};
    if (!p.show_real_terms) return (n, _years) => n;
    const cpi = (Number(p.cpi_pct) || 0) / 100;
    return (n, years) => n / Math.pow(1 + cpi, Math.max(0, Number(years) || 0));
}

// Build the three (or fewer) bars with all layer values.
//
// Returned bars are in ascending-age order. When two canonical ages coincide
// (e.g. retirement_age = 55) they collapse into a single bar with a combined label.
export function buildRetirementChartsSeries({ snapshot }) {
    if (!snapshot) return null;
    const p = snapshot.params || {};
    const ageRet = Number(p.retirement_age) || 0;
    const ageD = Number(p.opt_dutch_age) || 68;
    const lifeExp = Math.max(ageRet, Number(p.life_expectancy) || 95);
    const returnPct = Number(p.lump_sum_drawdown_return_pct) || 0;
    const deflate = deflater(snapshot);

    // Per-age inputs we need.
    const liquid = snapshot.liquid || {};
    const ra = snapshot.ra || {};
    const monthly = snapshot.monthly || {};
    const dutchNetMonthly = Number(monthly.dutchMonthlyNet) || 0;       // already deflated (yearsTo68)
    const dutchEnabled = !!p.opt_dutch_enabled;

    // RA lump-sum components per age. The existing snapshot treats commutation at 55
    // (de minimis full-pot or 1/3 if toggle on) as taken at 55 and carried forward.
    // Match that convention so Chart 2 + lumpSum totals reconcile with Card 0 §5.5.
    const commutation55Net = snapshot.lumpSum && snapshot.lumpSum.ra55IsDeMinimis
        ? Math.max(0, (ra.at55 && ra.at55.total ? ra.at55.total : 0) - ((snapshot.lumpSum.ra55Commutation && snapshot.lumpSum.ra55Commutation.tax) || 0))
        : ((ra.commutationAt55 && ra.commutationAt55.net) || 0);
    const commutationRetNet = (ra.commutationAtRetirement && ra.commutationAtRetirement.net) || 0;

    // Convenience: liquid (nominal) per canonical age, gated flags already applied upstream.
    const liquidAt = (key) => ({
        discretionary: (liquid[key] && liquid[key].discretionary) || 0,
        tfsa: (liquid[key] && liquid[key].tfsa) || 0,
        crypto: (liquid[key] && liquid[key].crypto) || 0,
    });
    const liquid55 = liquidAt('at55');
    const liquid68 = liquidAt('at68');
    const liquidRet = liquidAt('atRetirement');

    const houseSale = Number((snapshot.lumpSum && snapshot.lumpSum.houseSale) || 0);
    const inheritanceZar = Number((snapshot.lumpSum && snapshot.lumpSum.inheritanceZar) || 0);
    const bondPayoff = Number((snapshot.lumpSum && snapshot.lumpSum.bondPayoff) || 0);
    const savingsWdNet55 = (ra.at55 && ra.at55.savingsPotWithdrawnNet) || 0;
    const savingsWdNetRet = (ra.atRetirement && ra.atRetirement.savingsPotWithdrawnNet) || 0;

    // RA-drawdown layer net per canonical age. Read from snapshot.monthly (already deflated).
    // Dutch is removed from the projected68 figure to keep it on its own layer.
    const raDrawdownAge = {
        55: ((monthly.projected55 && monthly.projected55.net) || 0),
        D: Math.max(0, ((monthly.projected68 && monthly.projected68.net) || 0) - dutchNetMonthly),
        ret: ageRet < 55 ? 0 : ((monthly.atRetirement && monthly.atRetirement.net) || 0),
    };

    // Dutch net per age (nominal-vs-deflated handling: monthly.dutchMonthlyNet is already
    // deflated to age D; we use that for both the D bar and the retirement bar when
    // retirement >= D — same deflation point is acceptable since both reflect "Dutch
    // pension active at this point in life").
    const dutchAtAge = (age) => {
        if (!dutchEnabled) return 0;
        if (age < ageD) return 0;
        return dutchNetMonthly;
    };

    // Bar candidates in canonical order.
    const candidates = [
        { age: 55, yearsTo: snapshot.yearsTo55, labels: ['Age 55'], slot: 'age55' },
        { age: ageD, yearsTo: snapshot.yearsTo68, labels: ['Age ' + ageD], slot: 'ageD' },
        { age: ageRet, yearsTo: snapshot.yearsToRet, labels: ['Retirement (age ' + ageRet + ')'], slot: 'ageRet' },
    ];

    // Collapse by integer age. Earlier candidates win the merged label order.
    const merged = [];
    candidates.forEach(c => {
        const existing = merged.find(m => m.age === c.age);
        if (existing) {
            existing.labels.push(...c.labels);
            existing.slots.add(c.slot);
        } else {
            merged.push({ age: c.age, yearsTo: c.yearsTo, labels: c.labels.slice(), slots: new Set([c.slot]) });
        }
    });
    merged.sort((a, b) => a.age - b.age);

    // Per-bar layer values.
    const computeBar = (bar) => {
        const { age, yearsTo, slots } = bar;

        // Pick the liquid bucket for this age (collapsed bars use the most-relevant one;
        // a single age yields the same liquid bucket regardless of which slots match).
        let liq = liquidRet;
        if (slots.has('age55') && !slots.has('ageRet')) liq = liquid55;
        else if (slots.has('ageD') && !slots.has('ageRet')) liq = liquid68;
        // (when slots includes 'ageRet', liquid is liquidRet)

        // RA-drawdown net layer (snapshot-deflated). Pick the best-matching slot value.
        let raDrawdownNet = 0;
        if (slots.has('ageRet')) raDrawdownNet = raDrawdownAge.ret;
        else if (slots.has('ageD')) raDrawdownNet = raDrawdownAge.D;
        else if (slots.has('age55')) raDrawdownNet = raDrawdownAge[55];

        // Dutch layer.
        const dutchNet = dutchAtAge(age);

        // RA commutation lump per bar.
        // - Age 55 only → at-55 commutation (de minimis or 1/3 if toggle).
        // - Retirement or Age D ≥ retirement → at-retirement commutation (or carried).
        // - Age D < retirement → 0 (commutation hasn't happened yet by D).
        let raCommutedLumpNominal = 0;
        if (slots.has('ageRet')) {
            raCommutedLumpNominal = commutationRetNet || (snapshot.lumpSum && snapshot.lumpSum.ra55IsDeMinimis ? commutation55Net : 0);
        } else if (slots.has('ageD')) {
            raCommutedLumpNominal = (age >= ageRet) ? commutationRetNet : commutation55Net;
        } else if (slots.has('age55')) {
            raCommutedLumpNominal = commutation55Net;
        }

        // One-off lump per bar (matches existing snapshot logic: included at all ages).
        let oneOffNominal = 0;
        if (slots.has('ageRet')) oneOffNominal = houseSale + inheritanceZar + savingsWdNetRet - bondPayoff;
        else if (slots.has('ageD')) oneOffNominal = houseSale + inheritanceZar + savingsWdNet55 - bondPayoff;
        else if (slots.has('age55')) oneOffNominal = houseSale + inheritanceZar + savingsWdNet55 - bondPayoff;
        const oneOffPositive = Math.max(0, oneOffNominal);
        const oneOffShortfall = oneOffNominal < 0;

        // Capital sub-layers (nominal). Deflate for display.
        const capitalNominal = {
            discretionary: liq.discretionary,
            tfsa: liq.tfsa,
            crypto: liq.crypto,
            raCommuted: raCommutedLumpNominal,
            oneOff: oneOffPositive,
        };
        const capital = {
            discretionary: deflate(capitalNominal.discretionary, yearsTo),
            tfsa: deflate(capitalNominal.tfsa, yearsTo),
            crypto: deflate(capitalNominal.crypto, yearsTo),
            raCommuted: deflate(capitalNominal.raCommuted, yearsTo),
            oneOff: deflate(capitalNominal.oneOff, yearsTo),
        };

        // PMT layers: amortise each capital component from this age to life_expectancy.
        const pmtOf = (Lnom) => deflate(lumpSumPmt(Lnom, age, lifeExp, returnPct), yearsTo);
        const pmt = {
            discretionary: pmtOf(capitalNominal.discretionary),
            tfsa: pmtOf(capitalNominal.tfsa),
            crypto: pmtOf(capitalNominal.crypto),
            raCommuted: pmtOf(capitalNominal.raCommuted),
            oneOff: pmtOf(capitalNominal.oneOff),
        };

        const totalIncome = raDrawdownNet + dutchNet
            + pmt.discretionary + pmt.tfsa + pmt.crypto + pmt.raCommuted + pmt.oneOff;
        const totalCapital = capital.discretionary + capital.tfsa + capital.crypto
            + capital.raCommuted + capital.oneOff;

        return {
            age, label: bar.labels.join(' · '),
            income: { raDrawdownNet, dutchNet, ...pmt, total: totalIncome },
            capital: { ...capital, total: totalCapital },
            oneOffShortfall,
        };
    };

    const bars = merged.map(computeBar);

    return {
        bars,
        lifeExp,
        returnPct,
        realTerms: !!p.show_real_terms,
        ageD,
        dutchEnabled,
    };
}

const INCOME_LAYERS = [
    { key: 'raDrawdownNet', name: 'RA drawdown (net)', color: '#6366f1' },
    { key: 'dutchNet', name: 'Dutch pension (net)', color: '#0ea5e9' },
    { key: 'discretionary', name: 'Discretionary · PMT', color: '#10b981' },
    { key: 'tfsa', name: 'TFSA · PMT', color: '#22c55e' },
    { key: 'crypto', name: 'Crypto · PMT', color: '#f59e0b' },
    { key: 'raCommuted', name: 'RA commuted · PMT', color: '#a855f7' },
    { key: 'oneOff', name: 'One-off events · PMT', color: '#64748b' },
];

const CAPITAL_LAYERS = [
    { key: 'discretionary', name: 'Discretionary', color: '#10b981' },
    { key: 'tfsa', name: 'TFSA', color: '#22c55e' },
    { key: 'crypto', name: 'Crypto', color: '#f59e0b' },
    { key: 'raCommuted', name: 'RA (commuted)', color: '#a855f7' },
    { key: 'oneOff', name: 'One-off events (net)', color: '#64748b' },
];

function buildStackedOptions({ title, categories, seriesDefs, yAxisLabel }) {
    return {
        chart: {
            type: 'bar',
            stacked: true,
            height: 360,
            fontFamily: 'inherit',
            toolbar: { show: false },
            animations: { enabled: true, speed: 300 },
        },
        title: { text: title, align: 'left', style: { fontSize: '14px', fontWeight: 600, color: '#334155' } },
        series: seriesDefs.map(s => ({ name: s.name, data: s.data })),
        colors: seriesDefs.map(s => s.color),
        plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
        dataLabels: { enabled: false },
        xaxis: {
            categories,
            labels: { style: { colors: '#64748b' } },
            axisBorder: { color: '#e2e8f0' },
            axisTicks: { color: '#e2e8f0' },
        },
        yaxis: {
            title: { text: yAxisLabel, style: { color: '#64748b', fontWeight: 500 } },
            labels: { formatter: formatRand, style: { colors: '#64748b' } },
            forceNiceScale: true,
        },
        legend: { position: 'bottom', horizontalAlign: 'center', markers: { radius: 3 }, itemMargin: { horizontal: 8 } },
        tooltip: { shared: true, intersect: false, y: { formatter: formatRand } },
        grid: { borderColor: '#e2e8f0', strokeDashArray: 3 },
    };
}

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

export function renderRetirementCharts({ containerIncome, containerCapital, snapshot, badge }) {
    if (typeof window === 'undefined') return null;
    const ApexCharts = window.ApexCharts;
    if (!ApexCharts) {
        showPlaceholder(containerIncome, 'Chart library is still loading — refresh the page.');
        showPlaceholder(containerCapital, '');
        return null;
    }

    const data = buildRetirementChartsSeries({ snapshot });
    if (!data || data.bars.length === 0) {
        showPlaceholder(containerIncome, 'Not enough retirement data to chart.');
        showPlaceholder(containerCapital, '');
        return null;
    }

    if (badge) {
        badge.textContent = data.realTerms ? "today's money" : 'nominal';
        badge.classList.toggle('bg-slate-100', !data.realTerms);
        badge.classList.toggle('text-slate-700', !data.realTerms);
        badge.classList.toggle('bg-amber-100', data.realTerms);
        badge.classList.toggle('text-amber-800', data.realTerms);
    }

    const categories = data.bars.map(b => b.label);

    // Chart 1 — monthly income (net) per age.
    const incomeSeries = INCOME_LAYERS
        .map(layer => ({
            name: layer.name,
            color: layer.color,
            data: data.bars.map(b => Math.round(b.income[layer.key] || 0)),
        }))
        .filter(s => s.data.some(v => v > 0));

    if (containerIncome) {
        clearInstance(containerIncome, INSTANCE_KEY_INCOME);
        containerIncome.innerHTML = '';
        const opts = buildStackedOptions({
            title: 'Monthly income (net) — PMT to age ' + data.lifeExp + ' @ ' + data.returnPct + '%',
            categories,
            seriesDefs: incomeSeries,
            yAxisLabel: 'R / month',
        });
        const inst = new ApexCharts(containerIncome, opts);
        inst.render();
        containerIncome[INSTANCE_KEY_INCOME] = inst;
    }

    // Chart 2 — capital available per age.
    const capitalSeries = CAPITAL_LAYERS
        .map(layer => ({
            name: layer.name,
            color: layer.color,
            data: data.bars.map(b => Math.round(b.capital[layer.key] || 0)),
        }))
        .filter(s => s.data.some(v => v > 0));

    if (containerCapital) {
        clearInstance(containerCapital, INSTANCE_KEY_CAPITAL);
        containerCapital.innerHTML = '';
        const opts = buildStackedOptions({
            title: 'Capital available by age',
            categories,
            seriesDefs: capitalSeries,
            yAxisLabel: 'R (total)',
        });
        const inst = new ApexCharts(containerCapital, opts);
        inst.render();
        containerCapital[INSTANCE_KEY_CAPITAL] = inst;
    }

    return data;
}
