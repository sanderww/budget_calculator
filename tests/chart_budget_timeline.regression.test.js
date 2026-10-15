// Regression pin for UX-2.2: buildBudgetTimelineSeries output captured from the
// implementation before the horizon was split out (HEAD 8ab68de). With
// horizonDate === futureDate (or no horizonDate) every key it returned then
// must come back unchanged. New keys may be added alongside.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBudgetTimelineSeries } from '../src/charts/chart_budget_timeline.js';

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/budget-timeline-regression.json'), 'utf8'));
const TODAY = new Date('2026-06-06T00:00:00Z');

const cases = {
    twoCostsWithFloor: {
        savings: 50000, totalDebts: 333, totalProvisions: 12222,
        futureCosts: [
            { description: 'tight', amount: 200000, date: '2026-07-06' },
            { description: 'loose', amount: 50000, date: '2027-06-06' },
            { description: 'after', amount: 9999, date: '2027-09-06' },
            { description: 'past', amount: 77, date: '2026-01-01' },
            { description: 'undated', amount: 88, date: '' },
        ],
        futureDate: new Date('2027-08-01T00:00:00Z'), today: TODAY,
    },
    plannedBelow: {
        savings: 33333, totalDebts: 333, totalProvisions: 12222,
        futureCosts: [{ description: 'A', amount: 213213, date: '2026-09-06' }],
        futureDate: new Date('2026-12-06T00:00:00Z'), today: TODAY, plannedMonthlySavings: 5000,
    },
    costOnFutureDate: {
        savings: 50000, totalDebts: 0, totalProvisions: 0,
        futureCosts: [{ description: 'A', amount: 1000, date: '2026-09-06' }],
        futureDate: new Date('2026-09-06T00:00:00Z'), today: TODAY,
    },
};

describe('buildBudgetTimelineSeries regression (horizonDate === futureDate)', () => {
    for (const [name, input] of Object.entries(cases)) {
        it(`${name}: matches the pre-change output without a horizonDate`, () => {
            expect(buildBudgetTimelineSeries(input)).toMatchObject(fixture[name]);
        });
        it(`${name}: matches the pre-change output with horizonDate === futureDate`, () => {
            expect(buildBudgetTimelineSeries({ ...input, horizonDate: input.futureDate })).toMatchObject(fixture[name]);
        });
    }
});
