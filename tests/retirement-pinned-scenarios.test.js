import { describe, it, expect } from 'vitest';
import {
    getDefaultRetirementParams,
    retirementParamsDiff,
    resolveScenarioParams,
    defaultScenarioLabel,
    PUBLIC_PARAMS,
    parseConfigJSON,
    generateConfigJSON,
} from '../src/calculations.js';

describe('retirementParamsDiff', () => {
    it('is empty for the defaults', () => {
        expect(retirementParamsDiff(getDefaultRetirementParams())).toEqual({});
    });

    it('keeps only retirement keys whose value differs from the default', () => {
        const params = {
            ...getDefaultRetirementParams(),
            retirement_age: 60,
            withdrawal_rate_pct: 5,
            opt_house_enabled: 1,
            budget_alloc_available: 12_000, // other tab's config key: never stored
        };
        expect(retirementParamsDiff(params)).toEqual({
            retirement_age: 60,
            withdrawal_rate_pct: 5,
            opt_house_enabled: 1,
        });
    });

    it('leaves out the display-only "today\'s money" toggle', () => {
        const params = { ...getDefaultRetirementParams(), show_real_terms: 0 };
        expect(retirementParamsDiff(params)).toEqual({});
    });

    it('never stores the scenarios list inside a scenario', () => {
        const params = { ...getDefaultRetirementParams(), ret_scenarios: [{ id: 'a' }] };
        expect(retirementParamsDiff(params)).toEqual({});
    });
});

describe('resolveScenarioParams', () => {
    it('applies the stored diff over the defaults, not over the current values', () => {
        const current = { ...getDefaultRetirementParams(), retirement_age: 60, cpi_pct: 7 };
        const resolved = resolveScenarioParams(current, { withdrawal_rate_pct: 5 });
        expect(resolved.retirement_age).toBe(65);
        expect(resolved.cpi_pct).toBe(5);
        expect(resolved.withdrawal_rate_pct).toBe(5);
    });

    it('keeps the current "today\'s money" toggle and non-retirement keys', () => {
        const current = { ...getDefaultRetirementParams(), show_real_terms: 0, budget_alloc_available: 9 };
        const resolved = resolveScenarioParams(current, { show_real_terms: 1, retirement_age: 58 });
        expect(resolved.show_real_terms).toBe(0);
        expect(resolved.budget_alloc_available).toBe(9);
        expect(resolved.retirement_age).toBe(58);
    });

    it('tolerates a missing params object', () => {
        const resolved = resolveScenarioParams(getDefaultRetirementParams(), undefined);
        expect(resolved).toEqual(getDefaultRetirementParams());
    });

    it('round-trips with retirementParamsDiff', () => {
        const params = { ...getDefaultRetirementParams(), retirement_age: 62, opt_bond_balance: 400_000 };
        const resolved = resolveScenarioParams(getDefaultRetirementParams(), retirementParamsDiff(params));
        expect(resolved).toEqual(params);
    });
});

describe('defaultScenarioLabel', () => {
    it('reads "Retire at 65 · 4% draw" for the defaults', () => {
        expect(defaultScenarioLabel(getDefaultRetirementParams())).toBe('Retire at 65 · 4% draw');
    });

    it('uses the current retirement age and withdrawal rate', () => {
        expect(defaultScenarioLabel({ retirement_age: 60, withdrawal_rate_pct: 3.5 }))
            .toBe('Retire at 60 · 3.5% draw');
    });
});

describe('ret_scenarios config key', () => {
    const scenarios = [
        { id: 'scn_1', label: 'Retire at 60 · 4% draw', params: { retirement_age: 60 } },
        { id: 'scn_2', label: 'Lean', params: { withdrawal_rate_pct: 3, opt_house_enabled: 1 } },
    ];

    it('is private (not in PUBLIC_PARAMS)', () => {
        expect(PUBLIC_PARAMS.has('ret_scenarios')).toBe(false);
    });

    it('round-trips through generateConfigJSON / parseConfigJSON as an array', () => {
        const map = { cpi_pct: 5, dob: '1985-08-08', ret_scenarios: scenarios };
        const priv = parseConfigJSON(generateConfigJSON(map, { public: false }));
        expect(priv.ret_scenarios).toEqual(scenarios);
        const pub = parseConfigJSON(generateConfigJSON(map, { public: true }));
        expect(pub).not.toHaveProperty('ret_scenarios');
    });
});
