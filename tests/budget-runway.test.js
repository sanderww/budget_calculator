// @vitest-environment happy-dom
// Budget runway timeline (UX-2.1 to UX-2.4), driven through the real page
// markup and controller. The chart renderer is a spy; the pure helpers
// (timelineHorizon, formatDayMonthYear) are the real ones. fetch is stubbed
// and test mode is on, so only test_ save keys are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const renderSpy = vi.fn();
vi.mock('../src/charts/chart_budget_timeline.js', async (importOriginal) => ({
    ...(await importOriginal()),
    renderBudgetTimeline: (args) => renderSpy(args),
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

const CSV = 'type,description,amount,date\n'
    + 'savings,,15000,\n'
    + 'debt,Sample loan,3000,\n'
    + 'costfuturecost,Laptop,1500,2099-09-01\n';

let budget;
let persistence;
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    return { ok: true, text: async () => CSV };
});

const $ = (id) => document.getElementById(id);
const DAY = 24 * 60 * 60 * 1000;
const todayUTC = () => {
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const lastRender = () => renderSpy.mock.calls.at(-1)[0];
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
    saves = [];
    renderSpy.mockReset();
    renderSpy.mockReturnValue({ requiredMonthlySavings: 0, events: [] });
    try { localStorage.clear(); } catch { /* ignore */ }
    $('future-date').value = iso(todayUTC() + 100 * DAY);
    await budget.loadBudgetCSVFromServer();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Runway timeline', () => {
    it('puts the timeline card first on the Budget tab, above the ledger', () => {
        const content = $('budget-content');
        const cards = [...content.querySelectorAll('.card')];
        expect(cards[0].id).toBe('budget-timeline-card');
        expect(cards.findIndex(c => c.id === 'commitments-card')).toBeGreaterThan(0);
    });

    it('passes a fixed horizon (≥ 12 months) separate from the target date', () => {
        const { futureDate, horizonDate } = lastRender();
        expect(iso(futureDate.getTime())).toBe($('future-date').value);
        // Latest cost (2099-09-01) + 3 months.
        expect(iso(horizonDate)).toBe('2099-12-01');
    });

    it('keeps the slider in sync with the date input', () => {
        const range = $('budget-target-range');
        $('future-date').value = iso(todayUTC() + 200 * DAY);
        $('future-date').dispatchEvent(new Event('input', { bubbles: true }));
        expect(range.value).toBe('200');
        expect(Number(range.max)).toBe(Math.round((Date.UTC(2099, 11, 1) - todayUTC()) / DAY));
        expect(range.getAttribute('aria-valuetext')).toBe($('budget-target-range-label').textContent);
    });

    it('dragging the slider sets #future-date, the KPI date and the summary', () => {
        const range = $('budget-target-range');
        range.value = '42';
        range.dispatchEvent(new Event('input', { bubbles: true }));
        const expected = iso(todayUTC() + 42 * DAY);
        expect($('future-date').value).toBe(expected);
        expect($('kpi-net-date').textContent).toBe(expected);
        expect(iso(lastRender().futureDate.getTime())).toBe(expected);
    });

    it('freezes the horizon while dragging and recomputes it on release', () => {
        const before = lastRender().horizonDate; // 2099-12-01: last cost + 3 months
        const range = $('budget-target-range');
        range.value = range.max; // target = 2099-12-01, past the last cost
        range.dispatchEvent(new Event('input', { bubbles: true }));
        expect($('future-date').value).toBe('2099-12-01');
        expect(lastRender().horizonDate).toBe(before);
        range.dispatchEvent(new Event('change', { bubbles: true }));
        expect(iso(lastRender().horizonDate)).toBe('2100-03-01');
    });

    it('saves Minimum buffer as budget_min_buffer and removes the key when blank', () => {
        const input = $('budget-min-buffer');
        expect(input.type).toBe('text');
        expect(input.getAttribute('inputmode')).toBe('decimal');
        typeInto(input, '5k');
        expect(persistence.getConfigMap().budget_min_buffer).toBe(5000);
        expect(lastRender().minBuffer).toBe(5000);
        typeInto(input, '');
        expect('budget_min_buffer' in persistence.getConfigMap()).toBe(false);
        expect(lastRender().minBuffer).toBe(0);
    });

    it('prefills Minimum buffer from config', () => {
        persistence.getConfigMap().budget_min_buffer = 12000;
        budget.applyBudgetConfig();
        expect($('budget-min-buffer').value).toBe('12,000');
        delete persistence.getConfigMap().budget_min_buffer;
        budget.applyBudgetConfig();
        expect($('budget-min-buffer').value).toBe('');
    });

    it('shows the lowest point and the buffer rate, amber below the buffer', () => {
        renderSpy.mockReturnValue({
            requiredMonthlySavings: 0, events: [{ id: 'x' }],
            lowest: { x: Date.UTC(2027, 2, 1), value: 4000 }, belowBuffer: true, bufferMonthlySavings: 1234.5,
        });
        budget.calculateAndDisplaySummary();
        expect($('budget-lowest-value').textContent).toBe('R 4,000.00');
        expect($('budget-lowest-date').textContent).toBe('01 Mar 2027');
        expect($('budget-buffer-savings').textContent).toBe('R 1,234.50/month');
        expect($('budget-lowest-point').dataset.warn).toBe('true');
        expect($('budget-lowest-warn').hidden).toBe(false);
        expect($('budget-timeline-empty').hidden).toBe(true);
    });

    it('shows the empty-state note when no costs are on the chart', () => {
        renderSpy.mockReturnValue({
            requiredMonthlySavings: 0, events: [],
            lowest: { x: todayUTC(), value: 12000 }, belowBuffer: false, bufferMonthlySavings: 0,
        });
        budget.calculateAndDisplaySummary();
        expect($('budget-timeline-empty').hidden).toBe(false);
        expect($('budget-lowest-point').dataset.warn).toBe('false');
        expect($('budget-lowest-warn').hidden).toBe(true);
    });

    it('a marker click scrolls to the ledger row, switching the filter to All, and highlights it for 1.5 s', () => {
        const filterBtn = (f) => document.querySelector(`#commitment-filters [data-filter="${f}"]`);
        const laptop = () => [...document.querySelectorAll('#commitment-list .commitment-row')]
            .find(r => r.querySelector('.description-input').value === 'Laptop');
        filterBtn('all').click();
        const id = laptop().dataset.id;
        filterBtn('debt').click();
        expect(laptop()).toBeUndefined();

        budget.revealCommitmentRow('missing-id'); // unknown id: nothing changes
        expect(filterBtn('debt').getAttribute('aria-pressed')).toBe('true');
        lastRender().onEventClick(id);
        expect(filterBtn('all').getAttribute('aria-pressed')).toBe('true');
        const row = laptop();
        expect(row.classList.contains('row-highlight')).toBe(true);
        vi.advanceTimersByTime(1499);
        expect(row.classList.contains('row-highlight')).toBe(true);
        vi.advanceTimersByTime(1);
        expect(row.classList.contains('row-highlight')).toBe(false);
    });

    it('never posts to a real save endpoint', async () => {
        typeInto($('budget-min-buffer'), '1000');
        await vi.advanceTimersByTimeAsync(2000);
        for (const s of saves) expect(String(s.url)).toMatch(/test_/);
    });
});
