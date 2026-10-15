// @vitest-environment happy-dom
// RA contributions ledger (UX-4.4), driven through the real page markup and
// controller. fetch is stubbed and test mode is on, so only test_ save keys
// are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRaCSV, generateRaTransactionsCSV, saTaxYear } from '../src/calculations.js';
import { todayISO } from '../src/lib/quick-add.js';

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

// Sample-shaped data (not the real file), in the exact layout the app writes.
// The tax-year edges: 28 Feb 2027 and 29 Feb 2028 close 2026/27 and 2027/28;
// 1 Mar 2028 opens 2028/29.
const CSV = '2026-03-01,monthly,5000\n'
    + '2027-02-28,monthly,5000\n'
    + '2028-02-29,top-up,20000.5\n'
    + '2028-03-01,monthly,6000\n'
    + 'current_value,RA,123456,\n';

let ra;
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    if (String(url).endsWith('transactions/ra.csv')) return { ok: true, text: async () => CSV };
    return { ok: false, text: async () => '' };
});

const $ = (id) => document.getElementById(id);
const rows = () => [...$('ra-list').querySelectorAll('.ledger-row')];
const dates = () => rows().map(r => r.querySelector('.date-input').value);
const rowAt = (date) => rows().find(r => r.querySelector('.date-input').value === date);
const chip = (f) => document.querySelector(`#ra-filters [data-filter="${f}"]`);
const chips = () => [...$('ra-filters').children].map(b => b.textContent);
const typeInto = (el, text, event = 'input') => {
    el.value = text;
    el.dispatchEvent(new Event(event, { bubbles: true }));
};
const quickAdd = (text) => typeInto($('ra-quick-add'), text);
const enter = () => $('ra-quick-add').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const raSaves = () => saves.filter(s => s.url.endsWith('transactions_ra'));
const lastRaSave = async () => {
    await vi.advanceTimersByTimeAsync(1000);
    return raSaves().at(-1);
};
const rand = (text) => Number(text.replace(/[^\d.-]/g, ''));

beforeAll(async () => {
    document.body.innerHTML = body;
    const persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    ra = await import('../src/app/ra.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    saves = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    await ra.loadRaCSVFromServer();
    chip('all').click();
});

afterEach(async () => {
    await vi.advanceTimersByTimeAsync(10000); // let pending saves and toasts finish
    expect(saves.every(s => s.url.startsWith('/api/save/test_'))).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('RA CSV', () => {
    it('round-trips byte for byte (parse → generate)', () => {
        const parsed = parseRaCSV(CSV);
        expect(generateRaTransactionsCSV(parsed.transactions, parsed.currentValue)).toBe(CSV);
    });

    it('round-trips through the tab: an edit that changes nothing saves the same CSV', async () => {
        typeInto(rowAt('2026-03-01').querySelector('.description-input'), 'monthly');
        expect((await lastRaSave()).body).toBe(CSV);
    });
});

describe('RA contributions ledger', () => {
    it('shows Date · Description · Amount, newest first', () => {
        expect([...$('ra-head').children].map(c => c.textContent)).toEqual(['Date', 'Description', 'Amount', '']);
        expect(dates()).toEqual(['2028-03-01', '2028-02-29', '2027-02-28', '2026-03-01']);
        expect($('ra-add-contribution')).toBeNull();
    });

    it('filters by SA tax year (1 March to end February), newest first, and totals the year', () => {
        expect(chips()).toEqual(['All (4)', '2028/29 (1)', '2027/28 (1)', '2026/27 (2)']);
        expect($('ra-footer').textContent).toBe('Total R 36,000.50');
        chip('2026/27').click();
        expect(dates()).toEqual(['2027-02-28', '2026-03-01']);
        expect($('ra-footer').textContent).toBe('2026/27 total R 10,000.00');
        expect(localStorage.getItem('ra.taxYearFilter')).toBe('2026/27');
        chip('2027/28').click();
        expect(dates()).toEqual(['2028-02-29']);
    });

    it('moves a row between tax years as its date crosses 1 March, keeping the filter until the next render', () => {
        chip('2028/29').click();
        typeInto(rowAt('2028-03-01').querySelector('.date-input'), '2028-02-28');
        expect(chip('2027/28').textContent).toBe('2027/28 (2)');
        expect(chip('2028/29').textContent).toBe('2028/29 (0)');
        expect(chip('2028/29').getAttribute('aria-pressed')).toBe('true');
        expect($('ra-footer').textContent).toBe('2028/29 total R 0.00');
        ra.renderRa();
        expect(chip('2028/29')).toBeNull();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
    });

    it('updates the summary and the refund live as amounts are edited', async () => {
        typeInto(rowAt('2026-03-01').querySelector('.amount-input'), '10k');
        expect($('ra-total-contributed').textContent).toBe('R 41,001');
        expect($('ra-footer').textContent).toBe('Total R 41,000.50');
        expect($('ra-invested').textContent).toBe('R 41,000.50');
        expect((await lastRaSave()).body).toContain('2026-03-01,monthly,10000\n');
    });

    it('quick-add adds a contribution dated today in the current tax year', async () => {
        const before = rand($('ra-current-year-total').textContent);
        quickAdd('monthly 5000');
        expect($('ra-quick-add-preview').textContent)
            .toBe(`Will add Monthly · R 5,000.00 on ${todayISO()} (tax year ${saTaxYear(todayISO())})`);
        enter();
        expect($('ra-quick-add').value).toBe('');
        expect(ra.getRaState().transactions.at(-1)).toMatchObject({ date: todayISO(), description: 'Monthly', amount: 5000 });
        expect(rand($('ra-current-year-total').textContent)).toBe(before + 5000);
        expect($('ra-count').textContent).toBe('5');
        expect(chip(saTaxYear(todayISO()))).not.toBeNull();
        expect((await lastRaSave()).body).toContain(`${todayISO()},Monthly,5000\n`);
    });

    it('switches to All when the quick-added row is hidden by the tax-year filter', () => {
        chip('2028/29').click();
        quickAdd('top-up 20k 2027-02-20');
        enter();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
        expect(dates()).toContain('2027-02-20');
    });

    it('Enter on an empty field adds a blank "monthly repayment" row dated today, saved as 0', async () => {
        quickAdd('');
        enter();
        expect(ra.getRaState().transactions.at(-1)).toMatchObject({ date: todayISO(), description: 'monthly repayment', amount: '' });
        expect(document.activeElement).toBe(rowAt(todayISO()).querySelector('.amount-input'));
        expect((await lastRaSave()).body).toContain(`${todayISO()},monthly repayment,0\n`);
    });

    it('says what is missing and keeps the text', () => {
        quickAdd('5k');
        expect($('ra-quick-add-preview').textContent).toBe('Add a description.');
        enter();
        expect($('ra-quick-add').value).toBe('5k');
        expect(ra.getRaState().transactions).toHaveLength(4);
    });

    it('deletes with undo and updates the summary', async () => {
        rowAt('2028-02-29').querySelector('.remove-btn').click();
        expect($('ra-count').textContent).toBe('3');
        expect($('ra-total-contributed').textContent).toBe('R 16,000');
        expect(chips()).toEqual(['All (3)', '2028/29 (1)', '2026/27 (2)']);
        document.querySelector('#undo-toast .undo-toast-btn').click();
        expect($('ra-count').textContent).toBe('4');
        expect((await lastRaSave()).body).toBe(CSV);
    });
});
