// Overview tab: net worth, the portfolio mix lenses, next steps and the
// savings rate. Pure functions over state the other tabs already hold; the
// Overview controller (src/app/overview.js) only gathers inputs and renders.

import { fmtZARWhole } from '../lib/format.js';
import {
    CGT_ANNUAL_EXCLUSION, CGT_INCLUSION_RATE, TFSA_ANNUAL_CAP, TFSA_LIFETIME_CAP,
    taxYearEndIso, daysToTaxYearEnd,
} from './sa-tax.js';
import { saTaxYear } from './ra.js';
import { RETIREMENT_CONSTANTS } from './retirement.js';

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => Number(v) || 0;
const R = fmtZARWhole;
const pct1 = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "15 Mar 2027" from an ISO date or a UTC-midnight timestamp.
export function fmtShortDate(value) {
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value) + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Whole days between an ISO date and today (ISO); null when the date is unknown.
export function valueAgeDays(asOfIso, todayIso) {
    if (!ISO.test(asOfIso || '') || !ISO.test(todayIso || '')) return null;
    return Math.round((Date.parse(todayIso + 'T00:00:00Z') - Date.parse(asOfIso + 'T00:00:00Z')) / DAY_MS);
}

// ---- Net worth ---------------------------------------------------------------

// Every balance the app knows, as holdings (assets) and liabilities.
// input: { cash, cashDate, discretionary, tfsa, crypto, investmentDates,
//          ra, raDate, raIsEstimate, raVested, offshoreDiscretionaryPct,
//          offshoreTfsaPct, homeValue, bondBalance, bondDate, budgetDebts }
export function buildBalanceSheet(input = {}) {
    const dates = input.investmentDates || {};
    const holdings = [
        { key: 'cash', label: 'Cash savings', value: num(input.cash), asOf: input.cashDate, tab: 'budget' },
        { key: 'discretionary', label: 'Discretionary', value: num(input.discretionary), asOf: dates.Discretionary, tab: 'investment' },
        { key: 'tfsa', label: 'TFSA', value: num(input.tfsa), asOf: dates.TFSA, tab: 'investment' },
        { key: 'crypto', label: 'Crypto', value: num(input.crypto), asOf: dates.Crypto, tab: 'investment' },
        { key: 'ra', label: 'RA', value: num(input.ra), asOf: input.raDate, tab: 'ra', estimate: !!input.raIsEstimate },
    ];
    if (num(input.homeValue) > 0) {
        holdings.push({ key: 'home', label: 'Home', value: num(input.homeValue), tab: 'overview' });
    }
    const liabilities = [
        { key: 'bond', label: 'Bond', value: num(input.bondBalance), asOf: input.bondDate, tab: 'debt' },
        { key: 'debts', label: 'Budget debts', value: num(input.budgetDebts), tab: 'budget' },
    ].filter(l => l.value > 0);
    const assets = holdings.reduce((s, h) => s + h.value, 0);
    const owed = liabilities.reduce((s, l) => s + l.value, 0);
    return { holdings, liabilities, assets, owed, netWorth: assets - owed };
}

// Lenses: each one regroups the same rands. A holding may split across groups.
export const MIX_LENSES = {
    type: {
        label: 'Asset type',
        question: 'How much risk am I carrying?',
        groups: {
            cash: 'Cash',
            funds: 'Funds (Discretionary + TFSA)',
            ra: 'Retirement annuity',
            crypto: 'Crypto',
            home: 'Home equity',
        },
    },
    access: {
        label: 'Access',
        question: 'How quickly could I get to it?',
        groups: {
            days: 'Within days (cash, Discretionary, crypto)',
            tfsa: 'Within days, but TFSA allowance is lost',
            pot: 'RA savings pot (one withdrawal a tax year, taxed)',
            age55: 'RA from age 55',
            home: 'Tied up in your home',
        },
    },
    tax: {
        label: 'Tax treatment',
        question: 'How will it be taxed?',
        groups: {
            taxable: 'Taxable growth (cash, Discretionary, crypto)',
            taxfree: 'Tax-free (TFSA)',
            deferred: 'Tax-deferred (RA)',
            home: 'Home (primary-residence exclusion)',
        },
    },
    currency: {
        label: 'Currency',
        question: 'How much depends on the rand?',
        groups: {
            zar: 'Rand',
            offshore: 'Offshore funds',
            usd: 'Crypto (priced in dollars)',
            home: 'Home (rand)',
        },
    },
};

// Split of one holding across a lens's groups: [[group, amount], …].
function splitHolding(h, lens, ctx) {
    const v = h.value;
    if (h.key === 'home') return [['home', ctx.homeEquity]];
    switch (lens) {
    case 'type':
        return [[{ cash: 'cash', discretionary: 'funds', tfsa: 'funds', crypto: 'crypto', ra: 'ra' }[h.key], v]];
    case 'access': {
        if (h.key === 'tfsa') return [['tfsa', v]];
        if (h.key !== 'ra') return [['days', v]];
        const vested = Math.max(0, Math.min(ctx.raVested, v));
        const pot = (v - vested) * RETIREMENT_CONSTANTS.SAVINGS_POT_SPLIT;
        return [['pot', pot], ['age55', v - pot]];
    }
    case 'tax':
        return [[{ cash: 'taxable', discretionary: 'taxable', crypto: 'taxable', tfsa: 'taxfree', ra: 'deferred' }[h.key], v]];
    case 'currency': {
        if (h.key === 'crypto') return [['usd', v]];
        const off = h.key === 'discretionary' ? ctx.offDisc : h.key === 'tfsa' ? ctx.offTfsa : 0;
        const o = v * Math.min(100, Math.max(0, off)) / 100;
        return [['zar', v - o], ['offshore', o]];
    }
    default:
        return [];
    }
}

// Groups for one lens. Home equity (home value − bond) is included only when
// includeHome is set and a home value exists. Rows with no money are dropped.
export function groupHoldings(sheet, lens, { includeHome = true, raVested = 0,
    offshoreDiscretionaryPct = 0, offshoreTfsaPct = 0 } = {}) {
    const def = MIX_LENSES[lens];
    if (!def) return { rows: [], total: 0 };
    const bond = (sheet.liabilities.find(l => l.key === 'bond') || {}).value || 0;
    const home = sheet.holdings.find(h => h.key === 'home');
    const ctx = {
        raVested: num(raVested),
        offDisc: num(offshoreDiscretionaryPct),
        offTfsa: num(offshoreTfsaPct),
        homeEquity: home ? Math.max(0, home.value - bond) : 0,
    };
    const sums = {};
    sheet.holdings
        .filter(h => h.key !== 'home' || includeHome)
        .forEach(h => splitHolding(h, lens, ctx).forEach(([g, amount]) => {
            sums[g] = (sums[g] || 0) + amount;
        }));
    const total = Object.values(sums).reduce((s, v) => s + v, 0);
    const rows = Object.keys(def.groups)
        .filter(g => (sums[g] || 0) > 0.005)
        .map(g => ({ key: g, label: def.groups[g], value: sums[g], share: total > 0 ? sums[g] / total * 100 : 0 }));
    return { rows, total };
}

// Targets (asset-type lens, investable assets only): { cash, funds, ra, crypto } in %.
// Drift = share − target, in percentage points; null when no target is set.
export function withDrift(rows, targets = {}) {
    return rows.map(r => {
        const t = targets[r.key];
        const has = t !== undefined && t !== null && t !== '' && Number.isFinite(Number(t));
        return { ...r, target: has ? Number(t) : null, drift: has ? r.share - Number(t) : null };
    });
}

const DRIFT_NOTICE = 2; // percentage points before a drift is called out

// One or two plain sentences per lens. Only facts the other tabs don't show.
export function mixInsights({ lens, rows, total, includeHome = false, hasHome = false, raAccessYear = null }) {
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    const share = (k) => (byKey[k] ? byKey[k].share : 0);
    const amount = (k) => (byKey[k] ? byKey[k].value : 0);
    const of = includeHome ? 'of what you own' : 'of your investable assets';
    const out = [];
    if (!total) return out;
    if (lens === 'type') {
        if (includeHome && byKey.home) out.push(`Your home equity is ${pct1(share('home'))} ${of}.`);
        const largest = rows.filter(r => r.key !== 'home').sort((a, b) => b.value - a.value)[0];
        if (largest) out.push(`${largest.label} is the largest investable part at ${R(largest.value)}.`);
        rows.filter(r => r.drift !== null && r.drift !== undefined && Math.abs(r.drift) >= DRIFT_NOTICE).forEach(r => {
            const gap = Math.abs(r.drift) / 100 * total;
            out.push(r.drift > 0
                ? `${r.label} is ${pct1(r.share)}, ${Math.abs(r.drift).toFixed(1)} points over your ${r.target}% target. Sending new money elsewhere slows the drift; moving about ${R(gap)} out would close it.`
                : `${r.label} is ${Math.abs(r.drift).toFixed(1)} points under your ${r.target}% target. About ${R(gap)} of new money there would close it.`);
        });
        if (!hasHome) out.push('Add your home value above to see it next to your investments.');
    } else if (lens === 'access') {
        const quick = amount('days') + amount('tfsa');
        out.push(`${R(quick)} (${pct1(share('days') + share('tfsa'))}) is reachable within days; ${R(amount('days'))} of it without losing a tax benefit.`);
        if (amount('age55') > 0) {
            out.push(`${R(amount('age55'))} (${pct1(share('age55'))}) unlocks at 55${raAccessYear ? ` (${raAccessYear})` : ''}.`);
        }
    } else if (lens === 'tax') {
        if (amount('taxfree') > 0) out.push(`${R(amount('taxfree'))} (${pct1(share('taxfree'))}) grows tax-free in the TFSA.`);
        if (amount('taxable') > 0) out.push(`${R(amount('taxable'))} (${pct1(share('taxable'))}) is taxed on growth: interest as income, gains through CGT.`);
        if (amount('deferred') > 0) out.push(`${R(amount('deferred'))} (${pct1(share('deferred'))}) in the RA is taxed as income when you draw it.`);
    } else if (lens === 'currency') {
        const foreign = amount('offshore') + amount('usd');
        out.push(`${R(foreign)} (${pct1(share('offshore') + share('usd'))}) ${of} is offshore or priced in dollars.`);
        out.push('The RA counts as rand: its offshore share is not tracked. Offshore % for Discretionary and TFSA comes from the Retirement tab.');
    }
    return out;
}

// ---- Next steps --------------------------------------------------------------

export const NEXT_STEP_DEFAULTS = { staleDays: 45, deadlineWindowDays: 120 };
const SEVERITY_ORDER = { now: 0, deadline: 1, tax: 2, tidy: 3 };

// Ranked actions from the other tabs' state. Each step:
// { id, severity: 'now'|'deadline'|'tax'|'tidy', tab, title, body, working: [lines], daysLeft?, impact? }
// input: { todayIso, runway, pastDue: [{description, date}], raTax, tfsa: { thisYear, lifetime },
//          discretionaryGain, marginalRatePct, values: [{ label, value, asOf, tab }] }
export function buildNextSteps(input = {}, opts = {}) {
    const { staleDays, deadlineWindowDays } = { ...NEXT_STEP_DEFAULTS, ...opts };
    const today = input.todayIso;
    const steps = [];
    const daysLeft = ISO.test(today || '') ? daysToTaxYearEnd(today) : Infinity;
    const yearEnd = ISO.test(today || '') ? fmtShortDate(taxYearEndIso(today)).replace(/ \d{4}$/, '') : '28 Feb';
    const inWindow = daysLeft <= deadlineWindowDays;
    const dueTag = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;

    // 1. Runway dips below the buffer (Budget §1.6).
    const rw = input.runway;
    if (rw && rw.belowBuffer && rw.lowest) {
        const raise = Math.max(0, num(rw.bufferMonthlySavings) - num(rw.plannedMonthly));
        steps.push({
            id: 'runway-buffer', severity: 'now', tab: 'budget',
            title: `Savings dip below your buffer on ${fmtShortDate(rw.lowest.x)}`,
            body: `Lowest point ahead is ${R(rw.lowest.value)} above your debts + provisions floor; your buffer is ${R(rw.buffer)}.`
                + (raise > 0 ? ` Saving ${R(raise)} more per month keeps you above it.` : ''),
            working: [
                `lowest(planned − floor) = ${R(rw.lowest.value)} on ${fmtShortDate(rw.lowest.x)}`,
                `save per month to stay above buffer = ${R(rw.bufferMonthlySavings)}`,
                `planned = ${R(rw.plannedMonthly)} → raise by ${R(raise)}`,
            ],
            impact: raise,
        });
    }

    // 2. RA refund headroom before the tax year ends.
    const ra = input.raTax;
    if (inWindow && ra && num(ra.headroom) >= 1000 && num(ra.headroomRefund) > 0) {
        const rate = ra.headroomRefund / ra.headroom;
        const amount = Math.min(10_000, ra.headroom);
        steps.push({
            id: 'ra-headroom', severity: 'deadline', tab: 'ra', daysLeft, tag: dueTag,
            title: `RA: ${R(amount)} more before ${yearEnd} returns about ${R(amount * rate)}`,
            body: `Projected ${ra.taxYear} contributions are ${R(ra.projected)} of your ${R(ra.limit)} limit, leaving ${R(ra.headroom)} that still earns a refund this tax year.`,
            working: [
                `limit = ${R(ra.limit)}; projected to ${yearEnd} = ${R(ra.projected)}`,
                `headroom = ${R(ra.headroom)}; refund on all of it = ${R(ra.headroomRefund)}`,
                `refund on ${R(amount)} ≈ ${R(amount)} × ${pct1(rate * 100)} = ${R(amount * rate)}`,
            ],
            impact: amount * rate,
        });
    }

    // 3. Unused TFSA allowance (does not carry over).
    const tf = input.tfsa;
    if (inWindow && tf) {
        const room = Math.max(0, Math.min(TFSA_ANNUAL_CAP - num(tf.thisYear), TFSA_LIFETIME_CAP - num(tf.lifetime)));
        if (room >= 1000) {
            steps.push({
                id: 'tfsa-room', severity: 'deadline', tab: 'investment', daysLeft, tag: dueTag,
                title: `TFSA: ${R(room)} of this year's ${R(TFSA_ANNUAL_CAP)} allowance is unused`,
                body: `Unused allowance does not carry over to the next tax year. Lifetime so far: ${R(tf.lifetime)} of ${R(TFSA_LIFETIME_CAP)}.`,
                working: [
                    `this tax year = ${R(tf.thisYear)}; lifetime = ${R(tf.lifetime)}`,
                    `room = min(${R(TFSA_ANNUAL_CAP)} − ${R(tf.thisYear)}, ${R(TFSA_LIFETIME_CAP)} − ${R(tf.lifetime)}) = ${R(room)}`,
                ],
                // The room is not a rand saving, so it ranks after a priced refund.
                impact: 0,
            });
        }
    }

    // 4. CGT harvesting on the Discretionary gain.
    const gain = num(input.discretionaryGain);
    const m = num(input.marginalRatePct) / 100;
    if (inWindow && gain >= 1000 && m > 0) {
        const realise = Math.min(gain, CGT_ANNUAL_EXCLUSION);
        const saved = realise * CGT_INCLUSION_RATE * m;
        steps.push({
            id: 'cgt-harvest', severity: 'tax', tab: 'investment', daysLeft, tag: 'Tax idea',
            title: 'Use this year\'s CGT exclusion on your Discretionary gain',
            body: `Your Discretionary gain is ${R(gain)}. Selling and buying back up to ${R(realise)} of gain before ${yearEnd} is tax-free and raises your base cost, which saves about ${R(saved)} of tax later. Assumes no other capital gains this tax year; trading costs apply.`,
            working: [
                `gain realised = min(${R(gain)}, exclusion ${R(CGT_ANNUAL_EXCLUSION)}) = ${R(realise)}`,
                `tax avoided later = ${R(realise)} × ${CGT_INCLUSION_RATE * 100}% inclusion × ${pct1(m * 100)} marginal = ${R(saved)}`,
            ],
            impact: saved,
        });
    }

    // 5. Past-due future costs (Budget §1.1a).
    const pastDue = input.pastDue || [];
    if (pastDue.length) {
        const names = pastDue.slice(0, 3).map(c => `${c.description || 'Untitled'} (${fmtShortDate(c.date)})`).join(', ');
        steps.push({
            id: 'past-due', severity: 'tidy', tab: 'budget', tag: 'Tidy up',
            title: `${pastDue.length} future cost${pastDue.length === 1 ? ' is' : 's are'} past due`,
            body: `${names}${pastDue.length > 3 ? ', …' : ''}. Move each to provisions if you saved the money, or delete it if you spent it.`,
            working: [],
        });
    }

    // 6. Balances that are old or undated.
    const stale = (input.values || [])
        .filter(v => num(v.value) > 0)
        .map(v => ({ ...v, age: valueAgeDays(v.asOf, today) }))
        .filter(v => v.age === null || v.age > staleDays);
    if (stale.length) {
        const list = stale.map(v => `${v.label} (${v.age === null ? 'date unknown' : `${v.age} days old`})`).join(', ');
        steps.push({
            id: 'stale-values', severity: 'tidy', tab: stale[0].tab, tag: 'Tidy up',
            title: `Update ${stale.length === 1 ? stale[0].label : `${stale.length} balances`}`,
            body: `${list}. Net worth and the mix use these figures, so refresh them from your latest statements.`,
            working: [],
        });
    }

    return steps.sort((a, b) =>
        (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        || ((a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
        || (num(b.impact) - num(a.impact)));
}

// TFSA contributions in today's tax year and in total.
export function tfsaUsage(tfsaTransactions = [], todayIso) {
    const year = saTaxYear(todayIso);
    let thisYear = 0;
    let lifetime = 0;
    tfsaTransactions.forEach(t => {
        const a = num(t.amount);
        lifetime += a;
        if (year && saTaxYear(t.date) === year) thisYear += a;
    });
    return { thisYear, lifetime };
}

// ---- Savings rate ------------------------------------------------------------

// Money put away over the last 12 months (investments, RA, extra bond
// repayments) as a share of gross remuneration. rate is null without a
// remuneration figure.
export function savingsRate({ investmentTransactions = [], raTransactions = [], extraRepayments = [], remuneration = 0 }, todayIso) {
    const end = Date.parse(todayIso + 'T00:00:00Z');
    const start = end - 365 * DAY_MS;
    const within = (t) => {
        if (!ISO.test(t.date || '')) return false;
        const ms = Date.parse(t.date + 'T00:00:00Z');
        return ms > start && ms <= end;
    };
    const sum = (list) => list.filter(within).reduce((s, t) => s + num(t.amount), 0);
    const parts = {
        investments: sum(investmentTransactions),
        ra: sum(raTransactions),
        bond: sum(extraRepayments),
    };
    const saved = parts.investments + parts.ra + parts.bond;
    const rem = num(remuneration);
    return { saved, parts, rate: rem > 0 ? saved / rem * 100 : null };
}

// ---- Retirement income -------------------------------------------------------

// Net monthly income from the age you retire: RA drawdown plus the lump-sum
// drawdown, as the snapshot reports them (today's money when show_real_terms).
export function retirementIncome(snap) {
    if (!snap || !snap.monthly) return 0;
    return num(snap.monthly.atRetirement && snap.monthly.atRetirement.net) + num(snap.monthly.lumpSumDrawdown);
}

// One-change variations of the retirement params, for the "levers" list.
export function retirementLevers(params = {}) {
    const levers = [];
    const age = num(params.retirement_age);
    const life = num(params.life_expectancy) || 95;
    if (age > 0 && age + 2 < life) {
        levers.push({ id: 'later', label: `Retire at ${age + 2} instead of ${age}`, overrides: { retirement_age: age + 2 } });
    }
    const extra = params.opt_ra_monthly_enabled ? num(params.opt_ra_monthly_amount) : 0;
    levers.push({
        id: 'ra-extra', label: 'Put R 3,000 more a month into the RA',
        overrides: { opt_ra_monthly_enabled: 1, opt_ra_monthly_amount: extra + 3000 },
    });
    if (!params.opt_tfsa_enabled) {
        levers.push({ id: 'tfsa-max', label: 'Use the full TFSA allowance every year', overrides: { opt_tfsa_enabled: 1 } });
    }
    return levers;
}
