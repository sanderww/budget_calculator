// @vitest-environment happy-dom
// Budget commitments ledger (UX-1.1 to UX-1.4), driven through the real page
// markup and controller. fetch is stubbed and test mode is on, so the only
// save key ever used is test_transactions_budget.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/charts/chart_budget_timeline.js', () => ({
    renderBudgetTimeline: () => ({ requiredMonthlySavings: 0 }),
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

const CSV = 'type,description,amount,date\n'
    + 'savings,,15000,\n'
    + 'debt,Sample loan,3000,\n'
    + 'provision,Holiday fund,2000,2026-12-01\n'
    + 'costfuturecost,Laptop,1500,2099-09-01\n'
    + 'costfuturecost,Old tax,500,2020-01-01\n';

let budget;
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    return { ok: true, text: async () => CSV };
});

const list = () => document.getElementById('commitment-list');
const rows = () => [...list().querySelectorAll('.commitment-row')];
const rowFor = (desc) => rows().find(r => r.querySelector('.description-input').value === desc);
const quickAdd = () => document.getElementById('commitment-quick-add');
const preview = () => document.getElementById('commitment-quick-add-preview');
const filter = (f) => document.querySelector(`#commitment-filters [data-filter="${f}"]`);
const type = (text) => {
    quickAdd().value = text;
    quickAdd().dispatchEvent(new Event('input', { bubbles: true }));
};
const enter = () => quickAdd().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const lastSavedCSV = async () => {
    await vi.advanceTimersByTimeAsync(1000);
    return saves.at(-1);
};

beforeAll(async () => {
    document.body.innerHTML = body;
    const persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    budget = await import('../src/app/budget.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    saves = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    await budget.loadBudgetCSVFromServer();
    filter('all').click();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Commitments ledger', () => {
    it('shows every commitment in one table, undated debts first then soonest-first', () => {
        expect(rows().map(r => [r.dataset.kind, r.querySelector('.description-input').value])).toEqual([
            ['debt', 'Sample loan'],
            ['futureCost', 'Old tax'],
            ['provision', 'Holiday fund'],
            ['futureCost', 'Laptop'],
        ]);
        for (const r of rows()) expect(r.dataset.id).toMatch(/^id_/);
        expect(rowFor('Sample loan').querySelector('.date-input')).toBeNull();
    });

    it('has no + Add buttons any more', () => {
        expect(document.getElementById('add-debt')).toBeNull();
        expect(document.getElementById('add-provision')).toBeNull();
        expect(document.getElementById('add-future-cost')).toBeNull();
    });

    it('shows filter counts and the footer totals', () => {
        expect([...document.querySelectorAll('#commitment-filters .filter-chip')].map(b => b.textContent))
            .toEqual(['All (4)', 'Debts (1)', 'Provisions (1)', 'Future costs (2)']);
        expect(filter('all').getAttribute('aria-pressed')).toBe('true');
        const footer = document.getElementById('commitment-footer').textContent;
        expect(footer).toContain('Total R 7,000.00');
        expect(footer).toContain('Debts R 3,000.00 · Provisions R 2,000.00 · Future costs R 2,000.00');
    });

    it('filters by kind, remembers the choice, and shows only that total', () => {
        filter('futureCost').click();
        expect(rows().map(r => r.dataset.kind)).toEqual(['futureCost', 'futureCost']);
        expect(filter('futureCost').getAttribute('aria-pressed')).toBe('true');
        expect(filter('all').getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem('budget.commitmentFilter')).toBe('futureCost');
        expect(document.getElementById('commitment-footer').textContent).toBe('Total R 2,000.00');
    });

    it('updates the footer total live while an amount is typed', () => {
        const amt = rowFor('Laptop').querySelector('.amount-input');
        amt.value = '2500';
        amt.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.getElementById('commitment-footer').textContent).toContain('Total R 8,000.00');
    });

    it('previews and adds a quick-add line, then clears the field', async () => {
        type('car service 6.5k mar 2027');
        expect(preview().textContent).toBe('Will add Future cost · Car service · R 6,500.00 · due 2027-03-01');
        enter();
        expect(rowFor('Car service').dataset.kind).toBe('futureCost');
        expect(quickAdd().value).toBe('');
        const save = await lastSavedCSV();
        expect(save.url).toBe('/api/save/test_transactions_budget');
        expect(save.body).toContain('costfuturecost,Car service,6500,2027-03-01\n');
    });

    it('adds a debt from the keyword and saves it without a date', async () => {
        type('credit card 12000 debt');
        enter();
        expect(rowFor('Credit card').dataset.kind).toBe('debt');
        expect((await lastSavedCSV()).body).toContain('debt,Credit card,12000,\n');
    });

    it('says what is missing and adds nothing', () => {
        type('car service');
        expect(preview().textContent).toBe('Add an amount, e.g. 6.5k or 12000.');
        enter();
        expect(rows()).toHaveLength(4);
        expect(quickAdd().value).toBe('car service');
    });

    it('adds a blank Future cost row on Enter in an empty field and focuses it', () => {
        filter('debt').click();
        type('');
        enter();
        expect(filter('all').getAttribute('aria-pressed')).toBe('true');
        expect(rows()).toHaveLength(5);
        // Undated rows sit at the top (ties by id, so after the older debt).
        const blank = rowFor('');
        expect(rows().slice(0, 2)).toContain(blank);
        expect(blank.dataset.kind).toBe('futureCost');
        expect(document.activeElement).toBe(blank.querySelector('.description-input'));
    });

    it('changes the type in the row, keeping the id', async () => {
        const row = rowFor('Laptop');
        const id = row.dataset.id;
        const sel = row.querySelector('.kind-select');
        sel.value = 'provision';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const moved = list().querySelector(`[data-id="${id}"]`);
        expect(moved.dataset.kind).toBe('provision');
        expect(moved.querySelector('.kind-select').dataset.kind).toBe('provision');
        expect((await lastSavedCSV()).body).toContain('provision,Laptop,1500,2099-09-01\n');
    });

    it('moving a dated row to Debt removes the date with an Undo that restores it', async () => {
        const row = rowFor('Holiday fund');
        const id = row.dataset.id;
        const sel = row.querySelector('.kind-select');
        sel.value = 'debt';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(list().querySelector(`[data-id="${id}"]`).dataset.kind).toBe('debt');
        const toast = document.getElementById('undo-toast');
        expect(toast.textContent).toContain('Date removed — debts have no due date.');
        expect((await lastSavedCSV()).body).toContain('debt,Holiday fund,2000,\n');

        toast.querySelector('.undo-toast-btn').click();
        const back = list().querySelector(`[data-id="${id}"]`);
        expect(back.dataset.kind).toBe('provision');
        expect(back.querySelector('.date-input').value).toBe('2026-12-01');
        expect((await lastSavedCSV()).body).toContain('provision,Holiday fund,2000,2026-12-01\n');
    });

    it('flags past-due future costs and moves one to provisions on request', async () => {
        const old = rowFor('Old tax');
        expect(old.querySelector('.commitment-pastdue').hidden).toBe(false);
        expect(rowFor('Laptop').querySelector('.commitment-pastdue').hidden).toBe(true);
        const id = old.dataset.id;
        old.querySelector('.convert-btn').click();
        expect(list().querySelector(`[data-id="${id}"]`).dataset.kind).toBe('provision');
        expect((await lastSavedCSV()).body).toContain('provision,Old tax,500,2020-01-01\n');
    });

    it('shows the past-due strip as soon as a date is edited into the past', () => {
        const row = rowFor('Laptop');
        const date = row.querySelector('.date-input');
        date.value = '2021-05-05';
        date.dispatchEvent(new Event('input', { bubbles: true }));
        expect(row.querySelector('.commitment-pastdue').hidden).toBe(false);
    });

    it('deletes with undo, restoring the row with the same id', () => {
        const row = rowFor('Sample loan');
        const id = row.dataset.id;
        row.querySelector('.remove-btn').click();
        expect(list().querySelector(`[data-id="${id}"]`)).toBeNull();
        document.querySelector('#undo-toast .undo-toast-btn').click();
        expect(list().querySelector(`[data-id="${id}"]`).dataset.kind).toBe('debt');
    });

    it('shows the empty state when there are no commitments', async () => {
        // Each delete re-renders, so look the first row up afresh every time.
        while (rows().length) rows()[0].querySelector('.remove-btn').click();
        expect(list().textContent).toContain('No commitments yet. Type one above, for example "school fees 45k 2027-01-15".');
        expect(document.getElementById('commitment-footer').textContent).toBe('');
    });
});
