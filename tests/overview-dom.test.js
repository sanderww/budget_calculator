// @vitest-environment happy-dom
// Overview tab and the Budget "Compare where money goes" panel, driven
// through the real page markup and controllers. fetch is stubbed per file and
// test mode is on, so only test_ save keys are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/charts/chart_retirement.js', () => ({ renderRetirementScenarioCharts: () => {} }));
vi.mock('../src/charts/chart_budget_timeline.js', async (importOriginal) => ({
    ...(await importOriginal()),
    renderBudgetTimeline: () => ({ requiredMonthlySavings: 0, events: [] }),
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));
const ddmmyyyy = (isoDate) => isoDate.split('-').reverse().join('-');
const TODAY = daysAgo(0);

const FILES = {
    'config.public.json': JSON.stringify({ return_discretionary_pct: 10, return_tfsa_pct: 10, return_ra_pct: 10, return_crypto_pct: 0 }),
    'config.private.json': JSON.stringify({
        dob: '1990-01-15', retirement_age: 65, effective_tax_rate_pct: 18,
        current_balance: 1_150_000, interest_rate: 11.25, ra_annual_remuneration: 900_000,
        networth_home_value: 2_000_000, overview_target_monthly_income: 55_000, mix_target_crypto: 5,
        marginal_rate: 41,
    }),
    'transactions/budget.csv': 'type,description,amount,date\n'
        + `savings,,85000,${TODAY}\n`
        + 'debt,Card,12000,\n'
        + 'provision,Car fund,40000,2027-06-01\n'
        + `costfuturecost,Car service,4800,${daysAgo(18)}\n`,
    'transactions/investments.csv': 'Date,Description,amount,account type,crypto_value\n'
        + `${ddmmyyyy(daysAgo(800))},ETF,250000,Discretionary,\n`
        + `${ddmmyyyy(daysAgo(400))},ETF,195000,TFSA,\n`
        + `${ddmmyyyy(daysAgo(500))},BTC,120000,Crypto,0.07\n`
        + `current_value,Discretionary,310000,${TODAY}\n`
        + `current_value,TFSA,240000,${TODAY}\n`
        + 'current_value,Crypto,95000,\n',
    'transactions/ra.csv': `${daysAgo(30)},monthly,5000\ncurrent_value,RA,620000,${TODAY}\n`,
    'transactions/debt.csv': `Date,Description,Amount\n${daysAgo(60)},bonus,5000\n`,
};
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    const key = Object.keys(FILES).find(k => String(url).endsWith(k));
    return key ? { ok: true, text: async () => FILES[key] } : { ok: false, status: 404, text: async () => '' };
});

const $ = (id) => document.getElementById(id);
let persistence, budget, investments, ra, debt, retirement, overview;

beforeAll(async () => {
    document.body.innerHTML = body;
    persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    budget = await import('../src/app/budget.js');
    investments = await import('../src/app/investments.js');
    ra = await import('../src/app/ra.js');
    debt = await import('../src/app/debt.js');
    retirement = await import('../src/app/retirement.js');
    overview = await import('../src/app/overview.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    saves = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    await persistence.loadConfigFromServer();
    budget.applyBudgetConfig();
    await Promise.all([
        budget.loadBudgetCSVFromServer(),
        investments.loadInvestmentCSVFromServer(),
        debt.loadDebtCSVFromServer(),
        ra.loadRaCSVFromServer(),
    ]);
    retirement.loadRetirementFromConfig();
    overview.renderOverview();
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const groups = () => [...$('ov-mix-table').querySelectorAll('tbody tr')].map(tr => tr.dataset.group);
const lensBtn = (lens) => document.querySelector(`.ov-lens-btn[data-lens="${lens}"]`);

describe('App shell', () => {
    it('opens on the Overview tab and has no KPI strip', () => {
        expect($('overview-content').classList.contains('hidden')).toBe(false);
        expect($('budget-content').classList.contains('hidden')).toBe(true);
        expect($('kpi-net-now')).toBeNull();
        expect($('kpi-portfolio')).toBeNull();
    });
});

describe('Net worth and mix', () => {
    it('adds provisions and every other balance, subtracts the bond, and leaves Budget savings and debts out', () => {
        expect($('ov-include-provisions-wrap').classList.contains('hidden')).toBe(false);
        expect($('ov-include-provisions').checked).toBe(true);
        expect($('ov-networth').textContent).toBe('R 2,155,000');
        expect($('ov-networth-sum').textContent).toBe('Assets R 3,305,000 (incl. provisions R 40,000) − bond R 1,150,000');
    });

    it('drops the provisions when the box is unticked and remembers it', () => {
        const box = $('ov-include-provisions');
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        expect($('ov-networth').textContent).toBe('R 2,115,000');
        expect($('ov-networth-sum').textContent).toBe('Assets R 3,265,000 − bond R 1,150,000');
        expect(groups()).toEqual(['funds', 'ra', 'crypto', 'home']);
        expect(localStorage.getItem('overview.includeProvisions')).toBe('false');
        expect(saves).toEqual([]);
    });

    it('groups by asset type with home equity, and switches lens', () => {
        expect(groups()).toEqual(['cash', 'funds', 'ra', 'crypto', 'home']);
        lensBtn('access').click();
        expect(lensBtn('access').getAttribute('aria-pressed')).toBe('true');
        expect(groups()).toEqual(['days', 'tfsa', 'pot', 'age55', 'home']);
        expect($('ov-mix-insights').textContent).toContain('unlocks at 55 (2045)');
        lensBtn('type').click();
    });

    it('shows targets and drift once the home is left out', () => {
        expect($('ov-target-crypto')).toBeNull();
        const box = $('ov-include-home');
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        expect(groups()).toEqual(['cash', 'funds', 'ra', 'crypto']);
        expect($('ov-target-crypto').value).toBe('5');
        const driftCell = $('ov-mix-table').querySelector('tr[data-group="crypto"] td:last-child');
        expect(driftCell.textContent).toBe('+2.3');
        expect($('ov-mix-insights').textContent).toContain('over your 5% target');
    });

    it('flags balances that are old or undated, but not the provisions', () => {
        const chips = [...$('ov-sources').children].map(li => li.textContent);
        expect(chips).toContain('Crypto R 95,000 · date unknown');
        expect(chips).toContain('Provisions R 40,000 · from Budget');
        expect(chips.some(c => c.startsWith('Cash savings'))).toBe(false);
        expect($('ov-steps').querySelector('[data-step="stale-values"]').textContent).not.toContain('Provisions');
    });

    it('saves the home value to the sample config only', () => {
        const input = $('ov-home-value');
        input.value = '2.2m';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect($('ov-networth').textContent).toBe('R 2,355,000');
        vi.runOnlyPendingTimers();
        expect(saves.length).toBeGreaterThan(0);
        saves.forEach(s => expect(s.url).toMatch(/\/api\/save\/test_/));
        expect(JSON.parse(saves.find(s => s.url.endsWith('test_config_private')).body).networth_home_value).toBe(2_200_000);
    });
});

describe('Next steps', () => {
    it('lists the past-due cost and the undated crypto value, each with a link to its tab', () => {
        const ids = [...$('ov-steps').children].map(li => li.dataset.step);
        expect(ids).toContain('past-due');
        expect(ids).toContain('stale-values');
        expect(ids.indexOf('past-due')).toBeLessThan(ids.length);
        const stale = $('ov-steps').querySelector('[data-step="stale-values"]');
        expect(stale.textContent).toContain('Crypto (date unknown)');
        expect(stale.querySelector('.ov-step-go').textContent).toBe('Open Investments →');
    });
});

describe('Retirement and savings rate', () => {
    it('measures projected income against the target and prices the levers', () => {
        expect($('ov-ret-pct').textContent).toMatch(/^\d+%$/);
        const levers = [...$('ov-levers').children].map(li => li.dataset.lever);
        expect(levers).toEqual(['later', 'ra-extra', 'tfsa-max']);
        [...$('ov-levers').children].forEach(li => expect(li.lastChild.textContent).toMatch(/^\+R [\d,]+$/));
    });

    it('divides 12 months of saving by remuneration', () => {
        // 5,000 RA + 5,000 extra bond; the investment rows are older than a year.
        expect($('ov-rate').textContent).toBe('1.1%');
    });
});

describe('Compare where money goes (Budget)', () => {
    it('ranks five destinations from the other tabs\' assumptions', () => {
        budget.renderCompare();
        const keys = [...$('compare-list').children].map(li => li.dataset.key);
        expect(keys.sort()).toEqual(['bond', 'crypto', 'discretionary', 'ra', 'tfsa']);
        expect($('compare-headline').textContent).toMatch(/^After 10 years, R 10,000 is worth most in /);
        expect($('compare-assumptions').textContent).toContain('bond 11.25% (Debt)');
        expect($('compare-assumptions').textContent).toContain('marginal rate 41% (Investments)');
    });

    it('follows the horizon slider and a typed amount', () => {
        const years = $('compare-years');
        years.value = '20';
        years.dispatchEvent(new Event('input', { bubbles: true }));
        expect($('compare-years-label').textContent).toBe('20 years');
        const amount = $('compare-amount');
        amount.value = '50k';
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        expect($('compare-headline').textContent).toMatch(/^After 20 years, R 50,000 is worth most in /);
        expect($('compare-list').querySelector('[data-key="tfsa"]').textContent).toContain('fits this tax year');
    });
});
