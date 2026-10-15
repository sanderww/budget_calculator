// @vitest-environment happy-dom
// Debt extra-repayments ledger (UX-4.3), driven through the real page markup
// and controller. fetch is stubbed and test mode is on, so only test_ save
// keys are ever used.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDebtCSV, generateDebtCSV } from '../src/calculations.js';
import { todayISO } from '../src/lib/quick-add.js';

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

// Sample-shaped data (not the real file), in the exact layout the app writes.
const CSV = 'Date,Description,Amount\n'
    + '2025-05-31,Extra Repayment,4000\n'
    + '2025-11-25,Bonus,9500\n'
    + '2026-02-25,monthly repayment,4500\n'
    + '2026-03-25,monthly repayment,4500.5\n';

let debt;
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    if (String(url).endsWith('transactions/debt.csv')) return { ok: true, text: async () => CSV };
    return { ok: false, text: async () => '' };
});

const $ = (id) => document.getElementById(id);
const rows = () => [...$('repayment-list').querySelectorAll('.ledger-row')];
const dates = () => rows().map(r => r.querySelector('.date-input').value);
const rowAt = (date) => rows().find(r => r.querySelector('.date-input').value === date);
const chip = (f) => document.querySelector(`#repayment-filters [data-filter="${f}"]`);
const chips = () => [...$('repayment-filters').children].map(b => b.textContent);
const typeInto = (el, text, event = 'input') => {
    el.value = text;
    el.dispatchEvent(new Event(event, { bubbles: true }));
};
const quickAdd = (text) => typeInto($('repayment-quick-add'), text);
const enter = () => $('repayment-quick-add')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const debtSaves = () => saves.filter(s => s.url.endsWith('transactions_debt'));
const lastDebtSave = async () => {
    await vi.advanceTimersByTimeAsync(1000);
    return debtSaves().at(-1);
};

beforeAll(async () => {
    document.body.innerHTML = body;
    const persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    debt = await import('../src/app/debt.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    saves = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    await debt.loadDebtCSVFromServer();
    // Loan figures so the projection runs (config keys go to test_ saves).
    typeInto($('debt-current-balance'), '1000000');
    typeInto($('debt-repayment'), '12000');
    typeInto($('debt-service-fee'), '69');
    chip('all').click();
});

afterEach(async () => {
    await vi.advanceTimersByTimeAsync(10000); // let pending saves and toasts finish
    expect(saves.every(s => s.url.startsWith('/api/save/test_'))).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Debt CSV', () => {
    it('round-trips byte for byte (parse → generate)', () => {
        expect(generateDebtCSV(parseDebtCSV(CSV).repayments)).toBe(CSV);
    });

    it('round-trips through the tab: an edit that changes nothing saves the same CSV', async () => {
        typeInto(rowAt('2025-11-25').querySelector('.description-input'), 'Bonus');
        expect((await lastDebtSave()).body).toBe(CSV);
    });
});

describe('Debt extra-repayments ledger', () => {
    it('shows Date · Description · Amount, newest first', () => {
        expect([...$('repayment-head').children].map(c => c.textContent)).toEqual(['Date', 'Description', 'Amount', '']);
        expect(dates()).toEqual(['2026-03-25', '2026-02-25', '2025-11-25', '2025-05-31']);
        expect(rowAt('2026-03-25').querySelector('.amount-input').value).toBe('4,500.5');
        expect($('add-repayment')).toBeNull();
    });

    it('has one filter chip per calendar year (as History groups them) and totals the year', () => {
        expect(chips()).toEqual(['All (4)', '2026 (2)', '2025 (2)']);
        expect($('repayment-footer').textContent).toBe('Total R 22,500.50');
        expect($('debt-total-extra').textContent).toBe('R 22,500.50');
        chip('2025').click();
        expect(dates()).toEqual(['2025-11-25', '2025-05-31']);
        expect($('repayment-footer').textContent).toBe('2025 total R 13,500.00');
        expect(localStorage.getItem('debt.repaymentFilter')).toBe('2025');
    });

    it('updates the projection, the chips and the footer as amounts are edited', async () => {
        const before = $('debt-saved-amount').textContent;
        typeInto(rowAt('2025-05-31').querySelector('.amount-input'), '20k');
        expect($('debt-total-extra').textContent).toBe('R 38,500.50');
        expect($('debt-saved-amount').textContent).not.toBe(before);
        expect($('repayment-footer').textContent).toBe('Total R 38,500.50');
        expect((await lastDebtSave()).body).toContain('2025-05-31,Extra Repayment,20000\n');
    });

    it('keeps the year selected when an edit moves its last row to another year', () => {
        typeInto(rowAt('2026-03-25').querySelector('.date-input'), '2027-01-10');
        chip('2027').click();
        typeInto(rowAt('2027-01-10').querySelector('.date-input'), '2026-03-25');
        expect(chip('2027').getAttribute('aria-pressed')).toBe('true');
        expect(chip('all').getAttribute('aria-pressed')).toBe('false');
        expect(dates()).toEqual(['2026-03-25']);
        debt.renderRepayments();
        expect(chip('2027')).toBeNull();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
    });

    it('quick-add "5k bonus repayment" adds a repayment dated today', async () => {
        quickAdd('5k bonus repayment');
        expect($('repayment-quick-add-preview').dataset.state).toBe('ok');
        expect($('repayment-quick-add-preview').textContent).toBe(`Will add Bonus repayment · R 5,000.00 on ${todayISO()}`);
        enter();
        expect($('repayment-quick-add').value).toBe('');
        expect(debt.getDebtData().repayments.at(-1)).toMatchObject({ date: todayISO(), description: 'Bonus repayment', amount: 5000 });
        expect(dates()[0]).toBe(todayISO());
        expect($('debt-total-extra').textContent).toBe('R 27,500.50');
        expect((await lastDebtSave()).body).toContain(`${todayISO()},Bonus repayment,5000\n`);
    });

    it('switches to All when the quick-added row is hidden by the year filter', () => {
        chip('2025').click();
        quickAdd('extra 1000 2026-04-25');
        enter();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
        expect(dates()).toContain('2026-04-25');
    });

    it('says what is missing and keeps the text', () => {
        quickAdd('bonus');
        expect($('repayment-quick-add-preview').textContent).toBe('Add an amount, e.g. 5k or 5000.');
        enter();
        expect($('repayment-quick-add').value).toBe('bonus');
        expect(debt.getDebtData().repayments).toHaveLength(4);
    });

    it('Enter on an empty field adds a blank row dated today', () => {
        quickAdd('');
        enter();
        expect(debt.getDebtData().repayments.at(-1)).toMatchObject({ date: todayISO(), description: '', amount: '' });
        expect(document.activeElement).toBe(rowAt(todayISO()).querySelector('.description-input'));
    });

    it('deletes with undo and recalculates the projection', async () => {
        rowAt('2025-11-25').querySelector('.remove-btn').click();
        expect(dates()).toEqual(['2026-03-25', '2026-02-25', '2025-05-31']);
        expect($('debt-total-extra').textContent).toBe('R 13,000.50');
        expect(chips()).toEqual(['All (3)', '2026 (2)', '2025 (1)']);
        document.querySelector('#undo-toast .undo-toast-btn').click();
        expect($('debt-total-extra').textContent).toBe('R 22,500.50');
        expect((await lastDebtSave()).body).toBe(CSV);
    });
});

describe('Debt projection without enough inputs', () => {
    it('clears the debt-free KPI and the results instead of keeping stale values', () => {
        expect($('kpi-debt-free').textContent).not.toBe('—');
        expect($('debt-saved-amount').textContent).toMatch(/^R /);
        typeInto($('debt-repayment'), '');
        expect($('kpi-debt-free').textContent).toBe('—');
        ['debt-saved-amount', 'debt-total-extra', 'debt-net-return', 'debt-yield',
         'debt-time-reduced', 'debt-new-end-date', 'debt-original-end-date']
            .forEach(id => expect($(id).textContent, id).toBe('—'));
    });
});
