import { describe, it, expect } from 'vitest';
import { buildBudgetTimelineSeries } from '../src/chart_budget_timeline.js';

const day = (iso) => new Date(iso + 'T00:00:00Z').getTime();
const TODAY = new Date('2026-06-06T00:00:00Z');
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.4375;
const monthsBetween = (laterMs, earlierMs) => (laterMs - earlierMs) / MONTH_MS;

describe('buildBudgetTimelineSeries', () => {
    it('returns null when futureDate is missing', () => {
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: null,
            today: TODAY,
        });
        expect(result).toBeNull();
    });

    it('returns null when futureDate is on or before today', () => {
        const sameDay = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-06-06T00:00:00Z'),
            today: TODAY,
        });
        expect(sameDay).toBeNull();

        const past = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-01-01T00:00:00Z'),
            today: TODAY,
        });
        expect(past).toBeNull();
    });

    it('returns null when no future cost falls within the [today, futureDate] window', () => {
        const noCosts = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [],
            futureDate: new Date('2027-01-01T00:00:00Z'),
            today: TODAY,
        });
        expect(noCosts).toBeNull();

        const onlyPastOrUndated = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [
                { description: 'no date', amount: 1000, date: '' },
                { description: 'past', amount: 2000, date: '2026-01-01' },
            ],
            futureDate: new Date('2027-01-01T00:00:00Z'),
            today: TODAY,
        });
        expect(onlyPastOrUndated).toBeNull();

        const onlyAfterFutureDate = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'after', amount: 1000, date: '2027-06-06' }],
            futureDate: new Date('2027-01-01T00:00:00Z'),
            today: TODAY,
        });
        expect(onlyAfterFutureDate).toBeNull();
    });

    it('floor equals debts + provisions', () => {
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result.floor).toBe(12555);
    });

    it('savings trajectory starts at current savings', () => {
        const result = buildBudgetTimelineSeries({
            savings: 33333,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result.savingsLine[0]).toEqual({ x: TODAY.getTime(), y: 33333 });
    });

    it('savings trajectory step-downs reflect the cost amount for a single in-window cost', () => {
        const costDateIso = '2026-09-06';
        const costMs = day(costDateIso);
        const futureDate = new Date('2026-12-06T00:00:00Z');
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 8000, date: costDateIso }],
            futureDate,
            today: TODAY,
        });
        // With savings already covering the cost above zero floor, required savings rate is 0.
        expect(result.requiredMonthlySavings).toBe(0);
        // Three trajectory points before the futureDate-extension point: start, before-cost, after-cost.
        // Order: (today, 50000), (costMs, 50000), (costMs, 42000), then (futureDate, 42000) appended.
        expect(result.savingsLine[0]).toEqual({ x: TODAY.getTime(), y: 50000 });
        expect(result.savingsLine[1].x).toBe(costMs);
        expect(result.savingsLine[1].y).toBeCloseTo(50000, 6);
        expect(result.savingsLine[2].x).toBe(costMs);
        expect(result.savingsLine[2].y).toBeCloseTo(42000, 6);
        // Drop is exactly the cost amount.
        expect(result.savingsLine[1].y - result.savingsLine[2].y).toBeCloseTo(8000, 6);
    });

    it('requiredMonthlySavings keeps the trajectory exactly at the floor at the binding constraint', () => {
        const costDate = day('2026-09-06');
        // futureDate equals cost date so the cost is the binding constraint.
        const futureDate = new Date('2026-09-06T00:00:00Z');
        const result = buildBudgetTimelineSeries({
            savings: 33333,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 213213, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        const m = monthsBetween(costDate, TODAY.getTime());
        const expected = (213213 + 12555 - 33333) / m;
        expect(result.requiredMonthlySavings).toBeCloseTo(expected, 6);
        // The "after cost" point should sit exactly at the floor.
        const afterCost = result.savingsLine[2].y;
        expect(afterCost).toBeCloseTo(12555, 6);
    });

    it('requiredMonthlySavings is driven by the tightest constraint across all costs', () => {
        const result = buildBudgetTimelineSeries({
            savings: 100000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [
                { description: 'tight', amount: 200000, date: '2026-07-06' },
                { description: 'loose', amount: 50000, date: '2027-06-06' },
            ],
            futureDate: new Date('2027-06-06T00:00:00Z'),
            today: TODAY,
        });
        const tightMonths = monthsBetween(day('2026-07-06'), TODAY.getTime());
        const tightRate = (200000 - 100000) / tightMonths;
        const looseMonths = monthsBetween(day('2027-06-06'), TODAY.getTime());
        const looseRate = (250000 - 100000) / looseMonths;
        const expected = Math.max(tightRate, looseRate);
        expect(result.requiredMonthlySavings).toBeCloseTo(expected, 6);
        expect(result.requiredMonthlySavings).toBeCloseTo(tightRate, 6);
    });

    it('requiredMonthlySavings is zero when current savings already cover all costs above the floor', () => {
        const result = buildBudgetTimelineSeries({
            savings: 1000000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result.requiredMonthlySavings).toBe(0);
    });

    it('endDate equals futureDate.getTime()', () => {
        const futureDate = new Date('2027-03-15T00:00:00Z');
        const result = buildBudgetTimelineSeries({
            savings: 0,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        expect(result.endDate).toBe(futureDate.getTime());
    });

    it('emits bars in chronological order even when input is unsorted', () => {
        const result = buildBudgetTimelineSeries({
            savings: 0,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [
                { description: 'B', amount: 2500, date: '2026-10-06' },
                { description: 'A', amount: 1000, date: '2026-08-06' },
            ],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result.bars).toEqual([
            { x: day('2026-08-06'), y: 1000, description: 'A' },
            { x: day('2026-10-06'), y: 2500, description: 'B' },
        ]);
    });

    it('excludes bars dated after futureDate', () => {
        const result = buildBudgetTimelineSeries({
            savings: 0,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [
                { description: 'in', amount: 1000, date: '2026-09-06' },
                { description: 'out', amount: 9999, date: '2027-09-06' },
            ],
            futureDate: new Date('2027-01-01T00:00:00Z'),
            today: TODAY,
        });
        expect(result.bars).toHaveLength(1);
        expect(result.bars[0].description).toBe('in');
    });

    it('floorLine is exactly two points at the floor value with x=today and x=futureDate', () => {
        const futureDate = new Date('2026-12-06T00:00:00Z');
        const result = buildBudgetTimelineSeries({
            savings: 33333,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 213213, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        expect(result.floorLine).toEqual([
            { x: TODAY.getTime(), y: 12555 },
            { x: futureDate.getTime(), y: 12555 },
        ]);
    });

    it('savings trajectory includes a point at futureDate when futureDate is strictly later than the last cost', () => {
        const futureDate = new Date('2026-12-06T00:00:00Z');
        const costMs = day('2026-09-06');
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        // Expected sequence: today, before-cost, after-cost, futureDate.
        expect(result.savingsLine).toHaveLength(4);
        expect(result.savingsLine[0].x).toBe(TODAY.getTime());
        expect(result.savingsLine[1].x).toBe(costMs);
        expect(result.savingsLine[2].x).toBe(costMs);
        expect(result.savingsLine[3].x).toBe(futureDate.getTime());
        // requiredMonthlySavings is 0 here, so the futureDate point matches the post-cost balance.
        expect(result.savingsLine[3].y).toBeCloseTo(49000, 6);
    });

    it('savings trajectory does NOT append a futureDate point when last cost is exactly on futureDate', () => {
        const futureDate = new Date('2026-09-06T00:00:00Z');
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        // No trailing futureDate point: just today + before-cost + after-cost.
        expect(result.savingsLine).toHaveLength(3);
    });

    it('plannedMonthlySavings is used in the savings trajectory when explicitly provided', () => {
        // Setup: requiredMonthlySavings would put the post-cost balance exactly at the floor.
        // Supplying a higher planned rate should raise the post-cost balance above the floor.
        const costDate = day('2026-09-06');
        const futureDate = new Date('2026-09-06T00:00:00Z');
        const baseline = buildBudgetTimelineSeries({
            savings: 33333,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 213213, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
        });
        const higherRate = baseline.requiredMonthlySavings + 1000;
        const result = buildBudgetTimelineSeries({
            savings: 33333,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 213213, date: '2026-09-06' }],
            futureDate,
            today: TODAY,
            plannedMonthlySavings: higherRate,
        });
        expect(result.plannedMonthlySavings).toBe(higherRate);
        // The post-cost point should exceed the floor.
        const afterCost = result.savingsLine[2].y;
        const m = monthsBetween(costDate, TODAY.getTime());
        const expectedAfterCost = 33333 + higherRate * m - 213213;
        expect(afterCost).toBeCloseTo(expectedAfterCost, 6);
        expect(afterCost).toBeGreaterThan(result.floor);
        expect(result.belowFloor).toBe(false);
    });

    it('when plannedMonthlySavings is undefined or null, trajectory matches the requiredMonthlySavings case', () => {
        const inputs = {
            savings: 50000,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [
                { description: 'tight', amount: 200000, date: '2026-07-06' },
                { description: 'loose', amount: 50000, date: '2027-06-06' },
            ],
            futureDate: new Date('2027-06-06T00:00:00Z'),
            today: TODAY,
        };
        const omitted = buildBudgetTimelineSeries(inputs);
        const explicit = buildBudgetTimelineSeries({ ...inputs, plannedMonthlySavings: omitted.requiredMonthlySavings });
        const nullCase = buildBudgetTimelineSeries({ ...inputs, plannedMonthlySavings: null });

        expect(omitted.savingsLine).toHaveLength(explicit.savingsLine.length);
        omitted.savingsLine.forEach((p, i) => {
            expect(p.x).toBe(explicit.savingsLine[i].x);
            expect(p.y).toBeCloseTo(explicit.savingsLine[i].y, 6);
        });
        nullCase.savingsLine.forEach((p, i) => {
            expect(p.x).toBe(omitted.savingsLine[i].x);
            expect(p.y).toBeCloseTo(omitted.savingsLine[i].y, 6);
        });
        expect(omitted.plannedMonthlySavings).toBeCloseTo(omitted.requiredMonthlySavings, 6);
    });

    it('when plannedMonthlySavings = 0, trajectory has no growth and belowFloor reflects savings - costs vs floor', () => {
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 333,
            totalProvisions: 12222,
            futureCosts: [{ description: 'A', amount: 50000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
            plannedMonthlySavings: 0,
        });
        expect(result.plannedMonthlySavings).toBe(0);
        // No growth: pre-cost balance equals startSavings, post-cost equals startSavings - cost.
        expect(result.savingsLine[0].y).toBe(50000);
        expect(result.savingsLine[1].y).toBeCloseTo(50000, 6);
        expect(result.savingsLine[2].y).toBeCloseTo(0, 6);
        // futureDate-extension point still has no growth: same as post-cost.
        expect(result.savingsLine[3].y).toBeCloseTo(0, 6);
        // Floor is 12555; post-cost balance is 0 < floor, so belowFloor is true.
        expect(result.belowFloor).toBe(true);
        expect(result.minBalance).toBeCloseTo(0, 6);
    });

    it('returned object always exposes plannedMonthlySavings, minBalance, and belowFloor', () => {
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result).toHaveProperty('plannedMonthlySavings');
        expect(result).toHaveProperty('minBalance');
        expect(result).toHaveProperty('belowFloor');
        expect(typeof result.plannedMonthlySavings).toBe('number');
        expect(typeof result.minBalance).toBe('number');
        expect(typeof result.belowFloor).toBe('boolean');
        // minBalance equals the minimum of the savingsLine y values.
        const expectedMin = Math.min(...result.savingsLine.map(p => p.y));
        expect(result.minBalance).toBe(expectedMin);
    });

    it('returned object no longer has a cumulativeSavingsNeeded key', () => {
        const result = buildBudgetTimelineSeries({
            savings: 50000,
            totalDebts: 0,
            totalProvisions: 0,
            futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
            futureDate: new Date('2026-12-06T00:00:00Z'),
            today: TODAY,
        });
        expect(result).not.toHaveProperty('cumulativeSavingsNeeded');
    });
});
