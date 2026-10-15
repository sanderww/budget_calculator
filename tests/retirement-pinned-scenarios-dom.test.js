// @vitest-environment happy-dom
// Pinned retirement scenarios (UX-3.2), driven through the real page markup
// and controller. fetch is stubbed and test mode is on, so only test_ save
// keys are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/charts/chart_retirement.js', () => ({
    renderRetirementScenarioCharts: () => {},
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

let retirement;
let persistence;
const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));

const $ = (id) => document.getElementById(id);
const cards = () => [...$('ret-scenario-cards').querySelectorAll('.ret-scenario-card')];
const scenarioCards = () => cards().filter(c => c.dataset.scenarioId);
const stat = (card, key) => card.querySelector(`[data-stat="${key}"]`).textContent;
const setInput = (id, value) => {
    const el = $(id);
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};
const toggle = (id) => {
    const el = $(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
};
const undoBtn = () => document.querySelector('#undo-toast:not([hidden]) .undo-toast-btn');

beforeAll(async () => {
    document.body.innerHTML = body;
    persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    retirement = await import('../src/app/retirement.js');
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    const map = persistence.getConfigMap();
    Object.keys(map).forEach(k => delete map[k]);
    retirement.loadRetirementFromConfig();
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Pinned retirement scenarios', () => {
    it('shows only the Current card until something is pinned', () => {
        expect(cards()).toHaveLength(1);
        expect(cards()[0].textContent).toContain('Current');
        expect($('ret-pin-scenario').disabled).toBe(false);
    });

    it('pins the current parameters under an editable default label, storing only the diff', () => {
        setInput('ret-retirement-age', 60);
        $('ret-pin-scenario').click();

        const stored = persistence.getConfigMap().ret_scenarios;
        expect(stored).toHaveLength(1);
        expect(stored[0].label).toBe('Retire at 60 · 4% draw');
        expect(stored[0].params).toEqual({ retirement_age: 60 });

        const label = scenarioCards()[0].querySelector('input[aria-label="Scenario name"]');
        expect(label.value).toBe('Retire at 60 · 4% draw');
        expect(document.activeElement).toBe(label);
        label.value = 'Early';
        label.dispatchEvent(new Event('change', { bubbles: true }));
        expect(persistence.getConfigMap().ret_scenarios[0].label).toBe('Early');
    });

    it('keeps ret_scenarios out of the public config and only saves to test_ keys', () => {
        $('ret-pin-scenario').click();
        vi.runOnlyPendingTimers();
        const posts = fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST');
        expect(posts.length).toBeGreaterThan(0);
        posts.forEach(([url]) => expect(url).toMatch(/^\/api\/save\/test_/));
        const pub = posts.filter(([url]) => url.endsWith('test_config_public')).pop();
        const priv = posts.filter(([url]) => url.endsWith('test_config_private')).pop();
        expect(JSON.parse(pub[1].body)).not.toHaveProperty('ret_scenarios');
        expect(JSON.parse(priv[1].body).ret_scenarios).toHaveLength(1);
    });

    it('recalculates card numbers live and follows the today\'s-money toggle', () => {
        toggle('ret-opt-ra-monthly'); // monthly RA contributions build a pot to draw on
        setInput('ret-wd-rate', 6);
        $('ret-pin-scenario').click();
        setInput('ret-wd-rate', 4);
        const [current, pinned] = cards();
        // The scenario's 6% draw gives a different RA income than the current 4%.
        expect(stat(current, 'net55')).not.toBe('R 0');
        expect(stat(pinned, 'net55')).not.toBe(stat(current, 'net55'));
        expect(stat(pinned, 'capital')).toMatch(/^-?R [\d,]+$/);

        const before = stat(scenarioCards()[0], 'net68');
        toggle('ret-real-terms');
        expect(stat(scenarioCards()[0], 'net68')).not.toBe(before);
        // The toggle isn't part of the scenario.
        expect(persistence.getConfigMap().ret_scenarios[0].params).not.toHaveProperty('show_real_terms');
    });

    it('allows at most 3 scenarios', () => {
        for (let i = 0; i < 4; i++) $('ret-pin-scenario').click();
        expect(scenarioCards()).toHaveLength(3);
        expect(persistence.getConfigMap().ret_scenarios).toHaveLength(3);
        expect($('ret-pin-scenario').disabled).toBe(true);
    });

    it('Apply loads the scenario into the sidebar and Undo restores the previous parameters', () => {
        setInput('ret-retirement-age', 58);
        $('ret-pin-scenario').click();
        setInput('ret-retirement-age', 67);
        setInput('ret-cpi', 6);

        scenarioCards()[0].querySelector('.ret-scenario-apply').click();
        expect($('ret-retirement-age').value).toBe('58');
        expect($('ret-cpi').value).toBe('5'); // default, because the scenario stores only diffs
        expect(persistence.getConfigMap().retirement_age).toBe(58);
        expect(document.querySelector('#undo-toast').textContent).toContain('Applied "Retire at 58 · 4% draw"');

        undoBtn().click();
        expect($('ret-retirement-age').value).toBe('67');
        expect($('ret-cpi').value).toBe('6');
        expect(persistence.getConfigMap().retirement_age).toBe(67);
        expect(persistence.getConfigMap().cpi_pct).toBe(6);
        // The scenario list survives Apply and Undo.
        expect(persistence.getConfigMap().ret_scenarios).toHaveLength(1);
    });

    it('Remove deletes the card, with Undo putting it back', () => {
        $('ret-pin-scenario').click();
        setInput('ret-retirement-age', 60);
        $('ret-pin-scenario').click();
        const [first] = persistence.getConfigMap().ret_scenarios;

        scenarioCards()[0].querySelector('.ret-scenario-remove').click();
        expect(scenarioCards()).toHaveLength(1);
        expect(persistence.getConfigMap().ret_scenarios.map(s => s.id)).not.toContain(first.id);

        undoBtn().click();
        expect(scenarioCards()).toHaveLength(2);
        expect(persistence.getConfigMap().ret_scenarios[0].id).toBe(first.id);
    });

    it('loads stored scenarios from config', () => {
        persistence.getConfigMap().ret_scenarios = [
            { id: 's1', label: 'Stored', params: { retirement_age: 55 } },
        ];
        retirement.loadRetirementFromConfig();
        expect(scenarioCards()).toHaveLength(1);
        expect(scenarioCards()[0].querySelector('input').value).toBe('Stored');
    });
});

describe('Retirement edits touch only retirement config keys', () => {
    const seedAndLoad = (entries) => {
        Object.assign(persistence.getConfigMap(), entries);
        retirement.loadRetirementFromConfig();
    };

    it('does not revert a non-retirement key set after the retirement tab loaded', () => {
        seedAndLoad({ budget_alloc_mortgage_pct: 50, marginal_rate: 41 });
        persistence.setConfig('budget_alloc_mortgage_pct', 70);
        persistence.setConfig('marginal_rate', 45);
        setInput('ret-retirement-age', 61);
        const map = persistence.getConfigMap();
        expect(map.budget_alloc_mortgage_pct).toBe(70);
        expect(map.marginal_rate).toBe(45);
        expect(map.retirement_age).toBe(61);
    });

    it('does not bring back a non-retirement key that was unset', () => {
        seedAndLoad({ budget_min_buffer: 5000 });
        persistence.unsetConfig('budget_min_buffer');
        setInput('ret-retirement-age', 62);
        expect('budget_min_buffer' in persistence.getConfigMap()).toBe(false);
    });

    it('applying a pinned scenario leaves non-retirement keys alone', () => {
        seedAndLoad({ budget_alloc_etf_pct: 50 });
        setInput('ret-retirement-age', 58);
        $('ret-pin-scenario').click();
        persistence.setConfig('budget_alloc_etf_pct', 30);
        scenarioCards()[0].querySelector('button[aria-label^="Apply scenario"]').click();
        expect(persistence.getConfigMap().budget_alloc_etf_pct).toBe(30);
        expect(persistence.getConfigMap().retirement_age).toBe(58);
    });
});
