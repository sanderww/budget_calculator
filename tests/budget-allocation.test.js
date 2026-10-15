// @vitest-environment happy-dom
// Live, self-balancing allocation (UX-3.1), driven through the real page
// markup and controller. fetch is stubbed and test mode is on, so only test_
// save keys are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/charts/chart_budget_timeline.js', async (importOriginal) => ({
    ...(await importOriginal()),
    renderBudgetTimeline: () => ({ requiredMonthlySavings: 0, events: [] }),
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

// No savings target: no debts, provisions or future costs.
const CSV = 'type,description,amount,date\nsavings,,15000,\n';

let budget;
let persistence;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') return { ok: true };
    return { ok: true, text: async () => CSV };
});

const $ = (id) => document.getElementById(id);
const typeInto = (el, text) => {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeAll(async () => {
    document.body.innerHTML = body;
    persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    budget = await import('../src/app/budget.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    for (const k of ['budget_alloc_available', 'budget_alloc_mortgage_pct', 'budget_alloc_etf_pct']) {
        persistence.unsetConfig(k);
    }
    budget.applyBudgetConfig();
    await budget.loadBudgetCSVFromServer();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Live allocation', () => {
    it('removes the Calculate button and error element, and labels ETF', () => {
        expect($('calculate-allocation')).toBeNull();
        expect($('allocation-error')).toBeNull();
        expect($('eft-percentage').labels[0].textContent).toBe('ETF %');
        expect($('allocation-eft').previousElementSibling.textContent).toContain('ETF');
        expect(document.body.textContent).not.toContain('EFT');
    });

    it('updates the amounts on every input, with no button press', () => {
        typeInto($('available-money'), '10000');
        expect($('allocation-mortgage').textContent).toBe('R 5,000.00');
        expect($('allocation-eft').textContent).toBe('R 5,000.00');
        typeInto($('mortgage-percentage'), '20');
        expect($('allocation-mortgage').textContent).toBe('R 2,000.00');
    });

    it('makes Crypto read-only and equal to 100 - Mortgage - ETF', () => {
        expect($('crypto-percentage').readOnly).toBe(true);
        typeInto($('available-money'), '10000');
        typeInto($('mortgage-percentage'), '30');
        typeInto($('eft-percentage'), '20');
        expect($('crypto-percentage').value).toBe('50');
        expect($('allocation-crypto').textContent).toBe('R 5,000.00');
    });

    it('reduces the other field and shows a hint when the total would exceed 100', () => {
        typeInto($('mortgage-percentage'), '80');
        expect($('eft-percentage').value).toBe('20');
        expect($('crypto-percentage').value).toBe('0');
        expect($('allocation-hint').classList.contains('hidden')).toBe(false);
        expect($('allocation-hint').textContent).toBe('ETF reduced to 20% so the total stays at 100%.');
        typeInto($('mortgage-percentage'), '60');
        expect($('allocation-hint').classList.contains('hidden')).toBe(true);
    });

    it('shows Leftover only when it is not zero', () => {
        typeInto($('available-money'), '10000');
        expect($('allocation-leftover-row').classList.contains('hidden')).toBe(true);
        typeInto($('mortgage-percentage'), '10');
        typeInto($('eft-percentage'), '10');
        // Crypto takes the remainder, so there is still no leftover.
        expect($('allocation-leftover-row').classList.contains('hidden')).toBe(true);
    });

    it('draws the stacked bar proportionally', () => {
        typeInto($('available-money'), '10000');
        typeInto($('mortgage-percentage'), '25');
        typeInto($('eft-percentage'), '25');
        expect($('allocation-bar-mortgage').style.width).toBe('25%');
        expect($('allocation-bar-eft').style.width).toBe('25%');
        expect($('allocation-bar-crypto').style.width).toBe('50%');
    });

    it('saves the three allocation keys to config', () => {
        typeInto($('available-money'), '12000');
        typeInto($('mortgage-percentage'), '40');
        typeInto($('eft-percentage'), '35');
        const cfg = persistence.getConfigMap();
        expect(cfg.budget_alloc_available).toBe(12000);
        expect(cfg.budget_alloc_mortgage_pct).toBe(40);
        expect(cfg.budget_alloc_etf_pct).toBe(35);
        typeInto($('available-money'), '');
        expect('budget_alloc_available' in persistence.getConfigMap()).toBe(false);
    });

    it('restores the saved values from config at startup', () => {
        persistence.setConfig('budget_alloc_available', 8000);
        persistence.setConfig('budget_alloc_mortgage_pct', 10);
        persistence.setConfig('budget_alloc_etf_pct', 30);
        budget.applyBudgetConfig();
        expect($('available-money').value).toBe('8,000');
        expect($('mortgage-percentage').value).toBe('10');
        expect($('eft-percentage').value).toBe('30');
        expect($('crypto-percentage').value).toBe('60');
        expect($('allocation-crypto').textContent).toBe('R 4,800.00');
    });
});
