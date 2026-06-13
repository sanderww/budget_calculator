import { describe, it, expect } from 'vitest';
import {
    simulateRetirementTimeline,
    calculateRetirementSnapshot,
    getDefaultRetirementParams,
    RETIREMENT_CONSTANTS,
} from '../src/calculations.js';

const baseSnapshotInput = {
    params: {
        ...getDefaultRetirementParams(),
        dob: '1985-08-08',
        retirement_age: 65,
        life_expectancy: 95,
        show_real_terms: 0,
    },
    discretionaryToday: 100_000,
    tfsaToday: 50_000,
    cryptoToday: 20_000,
    tfsaTransactions: [],
    raPotToday: 2_000_000,
    raAnnualContributionLast12: 0,
};
const TODAY = new Date(2026, 4, 1);

describe('simulateRetirementTimeline (direct)', () => {
    const directBase = {
        retirementAge: 65,
        lifeExpectancy: 95,
        dutchAge: 68,
        lumpSumAtRetirement: 1_000_000,
        lumpSumMonthly: 6_000,
        lumpSumReturnPct: 6,
        raPotAtRetirement: 3_000_000,
        raPotAt55: 0,
        commuteThird: false,
        raReturnPct: 10,
        withdrawalRatePct: 4,
        taxRatePct: 0,
        dutchMonthlyNet: 14_000,
        dutchEnabled: true,
        yearsToRetirement: 10,
    };

    it('spans retirement age to life expectancy, one point per age', () => {
        const tl = simulateRetirementTimeline(directBase);
        expect(tl.length).toBe(95 - 65 + 1);
        expect(tl[0].age).toBe(65);
        expect(tl[tl.length - 1].age).toBe(95);
    });

    it('Dutch pension steps in at the configured age', () => {
        const tl = simulateRetirementTimeline(directBase);
        const before = tl.find(p => p.age === 67);
        const from = tl.find(p => p.age === 68);
        expect(before.income.dutch).toBe(0);
        expect(from.income.dutch).toBeCloseTo(14_000, 5);
        expect(from.income.total).toBeGreaterThan(before.income.total);
    });

    it('Dutch pension stays zero when disabled', () => {
        const tl = simulateRetirementTimeline({ ...directBase, dutchEnabled: false });
        expect(tl.every(p => p.income.dutch === 0)).toBe(true);
    });

    it('lump-sum income equals the PMT while the pot lasts and the pot ~depletes at life expectancy', () => {
        // PMT computed exactly as the snapshot does for this PV/term/return.
        const months = (95 - 65) * 12;
        const r = Math.pow(1.06, 1 / 12) - 1;
        const pmt = 1_000_000 * r / (1 - Math.pow(1 + r, -months));
        const tl = simulateRetirementTimeline({ ...directBase, lumpSumMonthly: pmt });
        expect(tl[0].income.lumpSum).toBeCloseTo(pmt, 5);
        expect(tl[0].capital.lumpSum).toBeCloseTo(1_000_000, 5);
        // Capital at the final sampled age is at most one year of payments away from zero.
        expect(tl[tl.length - 1].capital.lumpSum).toBeLessThan(pmt * 12);
    });

    it('RA income varies with the pot (grows when return outpaces withdrawals)', () => {
        const tl = simulateRetirementTimeline(directBase); // 10% return vs 4% drawdown
        expect(tl[5].income.ra).toBeGreaterThan(tl[0].income.ra);
        expect(tl[5].capital.raPot).toBeGreaterThan(tl[0].capital.raPot);
    });

    it('commutes fully below the living-annuity threshold: RA income ends, residual joins lump-sum capital', () => {
        const tl = simulateRetirementTimeline({
            ...directBase,
            lumpSumAtRetirement: 0,
            lumpSumMonthly: 0,
            lumpSumReturnPct: 0, // isolate the commuted residual (no post-commutation growth)
            raPotAtRetirement: 600_000,
            raReturnPct: 0,
            withdrawalRatePct: 12,
            dutchEnabled: false,
        });
        const last = tl[tl.length - 1];
        expect(tl[0].income.ra).toBeGreaterThan(0);
        expect(last.income.ra).toBe(0);
        expect(last.capital.raPot).toBe(0);
        // Residual (< R150k, under the tax-free band) moved into lump-sum capital and,
        // with a 0% lump-sum return here, stays at the commutation value.
        expect(last.capital.lumpSum).toBeGreaterThan(0);
        expect(last.capital.lumpSum).toBeLessThan(RETIREMENT_CONSTANTS.LIVING_ANNUITY_THRESHOLD);
    });

    it('retirement before 55: no RA income until 55, then drawdown starts from the at-55 pot', () => {
        const tl = simulateRetirementTimeline({
            ...directBase,
            retirementAge: 50,
            raPotAtRetirement: 2_000_000,
            raPotAt55: 3_000_000,
        });
        expect(tl.find(p => p.age === 54).income.ra).toBe(0);
        const at55 = tl.find(p => p.age === 55);
        expect(at55.income.ra).toBeGreaterThan(0);
        // Annuitised at-55 pot (no commutation here) drives the first drawdown month.
        expect(at55.income.ra).toBeCloseTo(3_000_000 * 0.04 / 12, 5);
        // Locked pot still shows as capital before 55.
        expect(tl.find(p => p.age === 52).capital.raPot).toBeGreaterThan(0);
    });

    it('de minimis at drawdown start: no RA annuity income, and the pot is NOT re-added to lump-sum capital (the caller already includes commutation in lumpSumAtRetirement)', () => {
        const tl = simulateRetirementTimeline({
            ...directBase,
            lumpSumAtRetirement: 100_000, // caller-provided lump (already includes any RA commutation)
            lumpSumMonthly: 0,
            lumpSumReturnPct: 0,
            raPotAtRetirement: 300_000, // full pot < R360k de minimis
            dutchEnabled: false,
        });
        expect(tl.every(p => p.income.ra === 0)).toBe(true);
        expect(tl[0].capital.raPot).toBe(0);
        // Lump-sum capital stays at the caller's figure — the de-minimis pot is not double-counted.
        expect(tl[0].capital.lumpSum).toBeCloseTo(100_000, 5);
    });

    it('lump-sum pot depletes to ~0 when the PMT matches the starting pot (no de-minimis re-add inflating it)', () => {
        const months = (95 - 65) * 12;
        const r = Math.pow(1.06, 1 / 12) - 1;
        const pmt = 500_000 * r / (1 - Math.pow(1 + r, -months));
        const tl = simulateRetirementTimeline({
            ...directBase,
            lumpSumAtRetirement: 500_000,
            lumpSumMonthly: pmt,
            lumpSumReturnPct: 6,
            raPotAtRetirement: 200_000, // de minimis → must not be added to the lump pot
            dutchEnabled: false,
        });
        // Without the bug, the pot amortises to ~0 rather than growing.
        expect(tl[0].capital.lumpSum).toBeCloseTo(500_000, 5);
        expect(tl[tl.length - 1].capital.lumpSum).toBeLessThan(pmt * 12);
    });
});

describe('calculateRetirementSnapshot timeline integration', () => {
    it('exposes a timeline from retirement age to life expectancy', () => {
        const r = calculateRetirementSnapshot(baseSnapshotInput, TODAY);
        expect(Array.isArray(r.timeline)).toBe(true);
        expect(r.timeline[0].age).toBe(65);
        expect(r.timeline[r.timeline.length - 1].age).toBe(95);
    });

    it('first lump-sum income point matches the snapshot PMT figure (nominal)', () => {
        const r = calculateRetirementSnapshot(baseSnapshotInput, TODAY);
        expect(r.timeline[0].income.lumpSum).toBeCloseTo(r.monthly.lumpSumDrawdown, 5);
        expect(r.timeline[0].capital.lumpSum).toBeCloseTo(r.lumpSum.atRetirement, 5);
    });

    it('real-terms toggle deflates timeline values', () => {
        const nominal = calculateRetirementSnapshot(baseSnapshotInput, TODAY);
        const real = calculateRetirementSnapshot({
            ...baseSnapshotInput,
            params: { ...baseSnapshotInput.params, show_real_terms: 1 },
        }, TODAY);
        expect(real.timeline[0].income.total).toBeLessThan(nominal.timeline[0].income.total);
        // Deflation compounds: the gap widens with age.
        const ratioFirst = real.timeline[0].capital.total / nominal.timeline[0].capital.total;
        const ratioLast = real.timeline[20].capital.total / nominal.timeline[20].capital.total;
        expect(ratioLast).toBeLessThan(ratioFirst);
    });

    it('Dutch step appears in the integrated timeline when enabled', () => {
        const r = calculateRetirementSnapshot({
            ...baseSnapshotInput,
            params: { ...baseSnapshotInput.params, opt_dutch_enabled: 1 },
        }, TODAY);
        const at67 = r.timeline.find(p => p.age === 67);
        const at68 = r.timeline.find(p => p.age === 68);
        expect(at67.income.dutch).toBe(0);
        expect(at68.income.dutch).toBeGreaterThan(0);
    });
});
