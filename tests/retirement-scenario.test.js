import { describe, it, expect } from 'vitest';
import {
    buildRetirementScenarioTimeline,
    calculateRetirementSnapshot,
    getDefaultRetirementParams,
    RETIREMENT_CONSTANTS,
} from '../src/calculations.js';

// dob 1985-08-08; "today" fixed so age is deterministic (~40.7 on 2026-05-01).
const TODAY = new Date(2026, 4, 1);

const baseParams = () => ({
    ...getDefaultRetirementParams(),
    dob: '1985-08-08',
    retirement_age: 65,
    life_expectancy: 95,
    show_real_terms: 0, // assert nominal math unless a test overrides
});

const baseInput = (overrides = {}) => ({
    params: baseParams(),
    discretionaryToday: 500_000,
    tfsaToday: 200_000,
    cryptoToday: 100_000,
    tfsaTransactions: [],
    raPotToday: 2_000_000,
    monthlyDrawdown: 0,
    ...overrides,
});

const at = (r, age) => r.points.find(p => p.age === age);

describe('buildRetirementScenarioTimeline — span & shape', () => {
    it('spans age 55 → life expectancy, one point per integer age', () => {
        const r = buildRetirementScenarioTimeline(baseInput(), TODAY);
        expect(r.startAge).toBe(55);
        expect(r.retAge).toBe(65);
        expect(r.lifeExp).toBe(95);
        expect(r.points[0].age).toBe(55);
        expect(r.points[r.points.length - 1].age).toBe(95);
        expect(r.points.length).toBe(95 - 55 + 1);
    });

    it('starts at the retirement age when it is below 55 (early retirement)', () => {
        const r = buildRetirementScenarioTimeline(
            baseInput({ params: { ...baseParams(), retirement_age: 50 } }), TODAY);
        expect(r.startAge).toBe(50);
        expect(r.points[0].age).toBe(50);
    });

    it('returns an empty result for an invalid date of birth', () => {
        const r = buildRetirementScenarioTimeline(
            baseInput({ params: { ...baseParams(), dob: 'not-a-date' } }), TODAY);
        expect(r.points).toEqual([]);
    });
});

describe('accumulation phase (55 → retirement age)', () => {
    it('no RA annuity or manual drawdown income before retirement; capital grows', () => {
        const r = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 20_000 }), TODAY);
        const a60 = at(r, 60);
        expect(a60.income.raAnnuity).toBe(0);
        expect(a60.income.manualDraw).toBe(0); // manual draw only from retirement age
        // Liquid capital at 60 exceeds the at-55 value (pure growth, no draws yet).
        expect(at(r, 64).capital.total).toBeGreaterThan(at(r, 55).capital.total);
    });

    it('savings-pot withdrawals show as RA income during accumulation when enabled', () => {
        const r = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), opt_savings_pot_withdrawal_enabled: 1, opt_savings_pot_withdrawal_annual: 24_000 },
        }), TODAY);
        const a60 = at(r, 60);
        expect(a60.income.raSavingsPot).toBeGreaterThan(0);
        // Net of the 18% default tax: (24000/12) * (1-0.18) = 1640.
        expect(a60.income.raSavingsPot).toBeCloseTo(1_640, 0);
    });
});

describe('retirement phase — RA annuity & Dutch pension', () => {
    it('RA annuity income begins at the retirement age', () => {
        const r = buildRetirementScenarioTimeline(baseInput(), TODAY);
        expect(at(r, 64).income.raAnnuity).toBe(0);
        expect(at(r, 65).income.raAnnuity).toBeGreaterThan(0);
    });

    it('Dutch pension steps in at opt_dutch_age when enabled, and is absent otherwise', () => {
        const on = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), opt_dutch_enabled: 1, opt_dutch_age: 68 },
        }), TODAY);
        expect(at(on, 67).income.dutch).toBe(0);
        expect(at(on, 68).income.dutch).toBeGreaterThan(0);
        expect(at(on, 68).income.total).toBeGreaterThan(at(on, 67).income.total);

        const off = buildRetirementScenarioTimeline(baseInput(), TODAY);
        expect(off.points.every(p => p.income.dutch === 0)).toBe(true);
    });

    it('Dutch pension escalates with CPI: rises nominally, flat in real terms', () => {
        const dutch = { opt_dutch_enabled: 1, opt_dutch_age: 68, opt_dutch_eur_monthly: 1000, opt_dutch_eur_zar: 20, cpi_pct: 6 };
        const nominal = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), ...dutch, show_real_terms: 0 },
        }), TODAY);
        // Nominal: each later year is strictly larger (compounding with CPI).
        expect(at(nominal, 90).income.dutch).toBeGreaterThan(at(nominal, 70).income.dutch);

        const real = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), ...dutch, show_real_terms: 1 },
        }), TODAY);
        // Real terms: holds its purchasing power, so it is flat across ages.
        expect(at(real, 90).income.dutch).toBeCloseTo(at(real, 70).income.dutch, 4);
    });
});

describe('manual capital drawdown', () => {
    it('with no drawdown and nothing else drawing, liquid capital keeps growing past retirement', () => {
        const r = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 0 }), TODAY);
        // Sum the drawable (liquid) layers — RA annuitised pot declines on its own.
        const liquid = (p) => p.capital.discretionary + p.capital.tfsa + p.capital.crypto + p.capital.raLumpOneOff;
        expect(liquid(at(r, 90))).toBeGreaterThan(liquid(at(r, 65)));
    });

    it('a monthly drawdown reduces liquid capital over time vs no drawdown', () => {
        const none = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 0 }), TODAY);
        const draw = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 40_000 }), TODAY);
        const liquid = (p) => p.capital.discretionary + p.capital.tfsa + p.capital.crypto + p.capital.raLumpOneOff;
        expect(liquid(at(draw, 80))).toBeLessThan(liquid(at(none, 80)));
        expect(at(draw, 70).income.manualDraw).toBeGreaterThan(0);
    });

    it('drawdown is capped so capital never goes negative, and flags the exhaustion age', () => {
        const r = buildRetirementScenarioTimeline(baseInput({
            discretionaryToday: 100_000, tfsaToday: 0, cryptoToday: 0, raPotToday: 0,
            monthlyDrawdown: 50_000, // far exceeds the small pot → exhausts quickly
        }), TODAY);
        expect(r.points.every(p => p.capital.total >= -1e-6)).toBe(true);
        expect(r.drawdownExhaustedAge).not.toBeNull();
        // After exhaustion the manual-draw income drops to 0.
        const after = r.points.filter(p => p.age > r.drawdownExhaustedAge);
        expect(after.length).toBeGreaterThan(0);
        expect(after[after.length - 1].income.manualDraw).toBe(0);
    });

    it('draws proportionally — the draw touches every liquid pool (each lower than the no-draw run)', () => {
        const none = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 0 }), TODAY);
        const draw = buildRetirementScenarioTimeline(baseInput({ monthlyDrawdown: 30_000 }), TODAY);
        // At age 90 every drawable pool is below its no-draw counterpart — the draw
        // is spread across all of them, not taken from one.
        expect(at(draw, 90).capital.discretionary).toBeLessThan(at(none, 90).capital.discretionary);
        expect(at(draw, 90).capital.tfsa).toBeLessThan(at(none, 90).capital.tfsa);
        expect(at(draw, 90).capital.crypto).toBeLessThan(at(none, 90).capital.crypto);
    });
});

describe('scenario toggles fold into the projection', () => {
    it('house sale + inheritance lift retirement capital; bond payoff lowers it', () => {
        const base = buildRetirementScenarioTimeline(baseInput(), TODAY);
        const withLumps = buildRetirementScenarioTimeline(baseInput({
            params: {
                ...baseParams(),
                opt_house_enabled: 1, opt_house_value: 2_000_000,
                opt_inheritance_enabled: 1, opt_inheritance_eur: 50_000, opt_dutch_eur_zar: 20,
            },
        }), TODAY);
        expect(at(withLumps, 65).capital.raLumpOneOff).toBeGreaterThan(at(base, 65).capital.raLumpOneOff);

        const withBond = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), opt_bond_enabled: 1, opt_bond_balance: 1_000_000 },
        }), TODAY);
        expect(at(withBond, 65).capital.total).toBeLessThan(at(base, 65).capital.total);
    });

    it('excluding a fund (opt_include_crypto = 0) removes it from capital', () => {
        const r = buildRetirementScenarioTimeline(baseInput({
            params: { ...baseParams(), opt_include_crypto: 0 },
        }), TODAY);
        expect(r.points.every(p => p.capital.crypto === 0)).toBe(true);
    });

    it('de minimis RA pot is fully commuted into liquid capital with no annuity income', () => {
        const r = buildRetirementScenarioTimeline(baseInput({
            raPotToday: 150_000, // 0% RA return keeps it under the R360k de minimis at access age
            params: { ...baseParams(), opt_dutch_enabled: 0, return_ra_pct: 0 },
        }), TODAY);
        // No RA annuity income anywhere (pot fully commuted at access age).
        expect(r.points.every(p => p.income.raAnnuity === 0)).toBe(true);
        // The commuted pot appears in liquid capital from the retirement age.
        expect(at(r, 65).capital.raLumpOneOff).toBeGreaterThan(0);
        expect(at(r, 65).capital.raPot).toBe(0);
    });
});

describe('real-terms toggle', () => {
    it('deflates every value relative to the nominal run, more so with age', () => {
        const nominal = buildRetirementScenarioTimeline(baseInput(), TODAY);
        const real = buildRetirementScenarioTimeline(
            baseInput({ params: { ...baseParams(), show_real_terms: 1 } }), TODAY);
        expect(at(real, 65).capital.total).toBeLessThan(at(nominal, 65).capital.total);
        const ratio65 = at(real, 65).capital.total / at(nominal, 65).capital.total;
        const ratio95 = at(real, 95).capital.total / at(nominal, 95).capital.total;
        expect(ratio95).toBeLessThan(ratio65);
    });
});

describe('calculateRetirementSnapshot integration', () => {
    it('exposes scenario in the snapshot, keyed on params.ret_scenario_monthly_drawdown', () => {
        const snap = calculateRetirementSnapshot({
            params: { ...baseParams(), ret_scenario_monthly_drawdown: 25_000 },
            discretionaryToday: 500_000, tfsaToday: 200_000, cryptoToday: 100_000,
            tfsaTransactions: [], raPotToday: 2_000_000, raAnnualContributionLast12: 0,
        }, TODAY);
        expect(snap.scenario).toBeTruthy();
        expect(snap.scenario.points[0].age).toBe(55);
        expect(snap.scenario.retAge).toBe(65);
        // The manual drawdown from params is applied (income > 0 in retirement).
        const p70 = snap.scenario.points.find(p => p.age === 70);
        expect(p70.income.manualDraw).toBeGreaterThan(0);
    });

    it('defaults to no scenario drawdown when the param is absent', () => {
        const snap = calculateRetirementSnapshot({
            params: baseParams(),
            discretionaryToday: 500_000, tfsaToday: 0, cryptoToday: 0,
            tfsaTransactions: [], raPotToday: 2_000_000, raAnnualContributionLast12: 0,
        }, TODAY);
        expect(snap.scenario.points.every(p => p.income.manualDraw === 0)).toBe(true);
    });
});
