// UX-2.1 to UX-2.4: horizon, lowest point, buffer-aware required savings and
// the horizon-extended series.
import { describe, it, expect } from 'vitest';
import {
    buildBudgetTimelineSeries, lowestPoint, requiredMonthlySavings, timelineHorizon,
} from '../src/charts/chart_budget_timeline.js';

const day = (iso) => new Date(iso + 'T00:00:00Z').getTime();
const TODAY = new Date('2026-06-06T00:00:00Z');
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.4375;
const months = (toMs) => (toMs - TODAY.getTime()) / MONTH_MS;

describe('lowestPoint', () => {
    it('returns the minimum of trajectory − floor with its date', () => {
        const line = [
            { x: 1, y: 100 }, { x: 2, y: 60 }, { x: 2, y: 20 }, { x: 3, y: 50 },
        ];
        expect(lowestPoint(line, 10)).toEqual({ x: 2, value: 10 });
    });

    it('can be negative when the line dips under the floor', () => {
        expect(lowestPoint([{ x: 1, y: 5 }, { x: 2, y: -3 }], 4)).toEqual({ x: 2, value: -7 });
    });

    it('keeps the earliest date on a tie', () => {
        expect(lowestPoint([{ x: 1, y: 7 }, { x: 2, y: 7 }], 0)).toEqual({ x: 1, value: 7 });
    });

    it('returns null for an empty trajectory', () => {
        expect(lowestPoint([], 0)).toBeNull();
        expect(lowestPoint(undefined, 0)).toBeNull();
    });

    it('treats a missing floor as 0', () => {
        expect(lowestPoint([{ x: 1, y: 9 }], undefined)).toEqual({ x: 1, value: 9 });
    });
});

describe('requiredMonthlySavings', () => {
    const costs = [
        { x: day('2026-07-06'), amount: 200000 },
        { x: day('2027-06-06'), amount: 50000 },
    ];
    const base = { startSavings: 100000, floor: 0, costs, todayMs: TODAY.getTime(), endMs: day('2027-06-06') };

    it('without a buffer it is the existing constraint loop', () => {
        const tight = (200000 - 100000) / months(day('2026-07-06'));
        expect(requiredMonthlySavings(base)).toBeCloseTo(tight, 6);
    });

    it('adds the buffer to the floor at every cost date and at the end', () => {
        const buffer = 20000;
        const tight = (200000 + buffer - 100000) / months(day('2026-07-06'));
        expect(requiredMonthlySavings({ ...base, buffer })).toBeCloseTo(tight, 6);
    });

    it('the end date binds when it is the tightest constraint', () => {
        // No costs: only floor + buffer at the end date matters.
        const r = requiredMonthlySavings({
            startSavings: 1000, floor: 5000, costs: [], todayMs: TODAY.getTime(),
            endMs: day('2027-06-06'), buffer: 2000,
        });
        expect(r).toBeCloseTo((5000 + 2000 - 1000) / months(day('2027-06-06')), 6);
    });

    it('is never negative', () => {
        expect(requiredMonthlySavings({ ...base, startSavings: 1e9, buffer: 5 })).toBe(0);
    });

    it('ignores a negative or non-numeric buffer', () => {
        expect(requiredMonthlySavings({ ...base, buffer: -500 })).toBeCloseTo(requiredMonthlySavings(base), 6);
        expect(requiredMonthlySavings({ ...base, buffer: 'x' })).toBeCloseTo(requiredMonthlySavings(base), 6);
    });
});

describe('timelineHorizon', () => {
    it('is at least 12 months from today', () => {
        const h = timelineHorizon({ futureDate: new Date('2026-08-01T00:00:00Z'), futureCosts: [], today: TODAY });
        expect(h).toBe(day('2027-06-06'));
    });

    it('is the target date + 3 months when that is later', () => {
        const h = timelineHorizon({ futureDate: new Date('2027-10-15T00:00:00Z'), futureCosts: [], today: TODAY });
        expect(h).toBe(day('2028-01-15'));
    });

    it('is the latest dated future cost + 3 months when that is later than the target', () => {
        const h = timelineHorizon({
            futureDate: new Date('2027-10-15T00:00:00Z'),
            futureCosts: [
                { amount: 1, date: '2028-02-01' },
                { amount: 1, date: '' },
                { amount: 1, date: '2027-01-01' },
            ],
            today: TODAY,
        });
        expect(h).toBe(day('2028-05-01'));
    });

    it('does not move while the target stays before the latest cost', () => {
        const futureCosts = [{ amount: 1, date: '2028-02-01' }];
        const a = timelineHorizon({ futureDate: new Date('2026-09-01T00:00:00Z'), futureCosts, today: TODAY });
        const b = timelineHorizon({ futureDate: new Date('2027-11-30T00:00:00Z'), futureCosts, today: TODAY });
        expect(a).toBe(b);
    });

    it('falls back to the 12-month minimum without a target date', () => {
        expect(timelineHorizon({ futureDate: null, futureCosts: [], today: TODAY })).toBe(day('2027-06-06'));
    });
});

describe('buildBudgetTimelineSeries with a horizon', () => {
    const base = {
        savings: 50000, totalDebts: 333, totalProvisions: 12222,
        futureCosts: [
            { id: 'a', description: 'tight', amount: 20000, date: '2026-07-06' },
            { id: 'b', description: 'after target', amount: 9999, date: '2027-09-06' },
        ],
        futureDate: new Date('2027-06-06T00:00:00Z'),
        horizonDate: new Date('2027-12-06T00:00:00Z'),
        today: TODAY,
    };

    it('runs the chart to the horizon and keeps the target date separate', () => {
        const r = buildBudgetTimelineSeries(base);
        expect(r.endDate).toBe(day('2027-12-06'));
        expect(r.targetDate).toBe(day('2027-06-06'));
        expect(r.savingsLine.at(-1).x).toBe(day('2027-12-06'));
        expect(r.floorLine.at(-1).x).toBe(day('2027-12-06'));
    });

    it('draws costs up to the horizon but only counts costs up to the target for the recommendation', () => {
        const r = buildBudgetTimelineSeries(base);
        expect(r.bars.map(b => b.description)).toEqual(['tight', 'after target']);
        expect(r.totalFutureCosts).toBe(20000);
        const withoutLater = buildBudgetTimelineSeries({ ...base, futureCosts: [base.futureCosts[0]] });
        expect(r.requiredMonthlySavings).toBeCloseTo(withoutLater.requiredMonthlySavings, 6);
    });

    it('exposes each dated cost as an event on the planned line, with its id', () => {
        const r = buildBudgetTimelineSeries({ ...base, plannedMonthlySavings: 1000 });
        expect(r.events.map(e => e.id)).toEqual(['a', 'b']);
        expect(r.events[0]).toMatchObject({ x: day('2026-07-06'), amount: 20000, description: 'tight' });
        // Sits on the planned line just before the step-down.
        expect(r.events[0].y).toBeCloseTo(50000 + 1000 * months(day('2026-07-06')), 6);
    });

    it('reports the lowest point of the planned line over the horizon', () => {
        const r = buildBudgetTimelineSeries({ ...base, plannedMonthlySavings: 0 });
        expect(r.lowest).toEqual({ x: day('2027-09-06'), value: 50000 - 20000 - 9999 - 12555 });
    });

    it('computes the buffer-aware monthly savings over the horizon', () => {
        const r = buildBudgetTimelineSeries({ ...base, minBuffer: 30000 });
        const atLast = (20000 + 9999 + 12555 + 30000 - 50000) / months(day('2027-09-06'));
        const atFirst = (20000 + 12555 + 30000 - 50000) / months(day('2026-07-06'));
        expect(r.bufferMonthlySavings).toBeCloseTo(Math.max(atLast, atFirst), 6);
        expect(r.minBuffer).toBe(30000);
    });

    it('flags belowBuffer when the lowest point is under the buffer', () => {
        expect(buildBudgetTimelineSeries({ ...base, plannedMonthlySavings: 0, minBuffer: 10000 }).belowBuffer).toBe(true);
        expect(buildBudgetTimelineSeries({ ...base, plannedMonthlySavings: 0, minBuffer: 0 }).belowBuffer).toBe(false);
    });

    it('draws a straight planned line when no cost falls in range (UX-2.1)', () => {
        const r = buildBudgetTimelineSeries({ ...base, futureCosts: [], plannedMonthlySavings: 0 });
        expect(r).not.toBeNull();
        expect(r.bars).toEqual([]);
        expect(r.events).toEqual([]);
        expect(r.savingsLine).toEqual([
            { x: TODAY.getTime(), y: 50000 },
            { x: day('2027-12-06'), y: 50000 },
        ]);
        expect(r.totalFutureCosts).toBe(0);
    });
});
