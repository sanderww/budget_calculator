// @vitest-environment happy-dom
// Investments transactions ledger (UX-4.2), driven through the real page
// markup and controller. fetch is stubbed and test mode is on, so the only
// save key ever used is test_transactions_investments.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HISTORY_CATEGORIES } from '../src/charts/chart_history.js';
import { parseInvestmentCSV, generateInvestmentCSV } from '../src/calculations.js';
import { todayISO } from '../src/lib/quick-add.js';

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

// Sample-shaped data (not the real file), in the exact layout the app writes.
const CSV = 'Date,Description,amount,account type,crypto_value\n'
    + '01-01-2025,Example ETF,5000,TFSA,\n'
    + '15-01-2025,Example Stock,2000,Discretionary,\n'
    + '10-02-2026,Luno,1500,Crypto,0.0123\n'
    + 'current_value,Discretionary,2500,\n'
    + 'current_value,TFSA,6000,\n'
    + 'current_value,Crypto,1800,\n';

let inv;
let saves;
const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    if (String(url).endsWith('transactions/investments.csv')) return { ok: true, text: async () => CSV };
    return { ok: false, text: async () => '' };
});

const $ = (id) => document.getElementById(id);
const rows = () => [...$('transaction-list').querySelectorAll('.ledger-row')];
const descs = () => rows().map(r => r.querySelector('.description-input').value);
const rowFor = (desc) => rows().find(r => r.querySelector('.description-input').value === desc);
const chip = (f) => document.querySelector(`#transaction-filters [data-filter="${f}"]`);
const typeInto = (el, text, event = 'input') => {
    el.value = text;
    el.dispatchEvent(new Event(event, { bubbles: true }));
};
const quickAdd = (text) => typeInto($('transaction-quick-add'), text);
const enter = () => $('transaction-quick-add')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const lastSave = async () => {
    await vi.advanceTimersByTimeAsync(1000);
    return saves.at(-1);
};

beforeAll(async () => {
    document.body.innerHTML = body;
    const persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    inv = await import('../src/app/investments.js');
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    saves = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    await inv.loadInvestmentCSVFromServer();
    chip('all').click();
});

afterEach(async () => {
    await vi.advanceTimersByTimeAsync(10000); // let pending saves and toasts finish
    expect(saves.every(s => s.url === '/api/save/test_transactions_investments')).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Investments CSV', () => {
    it('round-trips byte for byte (parse → generate)', () => {
        expect(generateInvestmentCSV(parseInvestmentCSV(CSV))).toBe(CSV);
    });

    it('round-trips through the tab: an edit that changes nothing saves the same CSV', async () => {
        typeInto(rowFor('Luno').querySelector('.description-input'), 'Luno');
        expect((await lastSave()).body).toBe(CSV);
    });
});

describe('Investments transactions ledger', () => {
    it('shows Date · Description · Amount · Account · BTC, newest first', () => {
        expect([...$('transaction-head').children].map(c => c.textContent))
            .toEqual(['Date', 'Description', 'Amount', 'Account', 'BTC', '']);
        expect(descs()).toEqual(['Luno', 'Example Stock', 'Example ETF']);
        const luno = rowFor('Luno');
        expect(luno.querySelector('.date-input').value).toBe('2026-02-10');
        expect(luno.querySelector('.amount-input').value).toBe('1,500');
        expect(luno.querySelector('.remove-btn').getAttribute('aria-label')).toBe('Delete');
    });

    it('has no + Add button any more', () => {
        expect($('add-transaction')).toBeNull();
    });

    it('shows the account as a coloured chip and BTC only on Crypto rows', () => {
        const chipOf = (desc) => rowFor(desc).querySelector('select.account-chip');
        expect(chipOf('Luno').dataset.value).toBe('Crypto');
        expect(chipOf('Example ETF').dataset.value).toBe('TFSA');
        expect(chipOf('Example Stock').dataset.value).toBe('Discretionary');
        expect(chipOf('Luno').getAttribute('aria-label')).toBe('Account');
        expect(rowFor('Luno').querySelector('.crypto-value-input').value).toBe('0.0123');
        expect(rowFor('Luno').querySelector('.crypto-value-input').getAttribute('aria-label')).toBe('BTC quantity');
        expect(rowFor('Example ETF').querySelector('.crypto-value-input')).toBeNull();
    });

    it('colours each account chip like the History donut', () => {
        for (const account of ['Discretionary', 'TFSA', 'Crypto']) {
            const rule = new RegExp(`\\.account-chip\\[data-value="${account}"\\]\\s*\\{[^}]*--account-color:\\s*(#[0-9a-f]{6})`, 'i');
            const colour = rule.exec(css)?.[1];
            expect(colour, account).toBe(HISTORY_CATEGORIES.find(c => c.name === account).color);
        }
    });

    it('filters by account with a count and total contributed per chip', () => {
        expect([...$('transaction-filters').children].map(b => b.textContent)).toEqual([
            'All (3) · R 8,500', 'Discretionary (1) · R 2,000', 'TFSA (1) · R 5,000', 'Crypto (1) · R 1,500',
        ]);
        expect($('transaction-footer').textContent).toBe('Total contributed R 8,500.00');
        chip('TFSA').click();
        expect(descs()).toEqual(['Example ETF']);
        expect(chip('TFSA').getAttribute('aria-pressed')).toBe('true');
        expect($('transaction-footer').textContent).toBe('TFSA contributed R 5,000.00');
        expect(localStorage.getItem('investments.accountFilter')).toBe('TFSA');
    });

    it('changing the account recolours the chip, clears the BTC field and updates the panels', async () => {
        expect($('inv-crypto').textContent).toBe('R 1,500.00');
        const row = rowFor('Luno');
        const sel = row.querySelector('select.account-chip');
        typeInto(sel, 'TFSA', 'change');
        expect(sel.dataset.value).toBe('TFSA');
        expect(row.querySelector('.crypto-value-input')).toBeNull();
        const item = inv.getInvestmentData().transactions.find(t => t.description === 'Luno');
        expect(item).toMatchObject({ type: 'TFSA', cryptoValue: '' });
        expect($('inv-crypto').textContent).toBe('R 0.00');
        expect($('inv-tfsa').textContent).toBe('R 6,500.00');
        expect($('total-crypto-value').textContent).toBe('0.00000000');
        expect(chip('TFSA').textContent).toBe('TFSA (2) · R 6,500');
        expect((await lastSave()).body).toContain('10-02-2026,Luno,1500,TFSA,\n');
        // Back to Crypto: the BTC field returns empty.
        typeInto(sel, 'Crypto', 'change');
        expect(row.querySelector('.crypto-value-input').value).toBe('');
    });

    it('edits amounts and BTC in place and keeps the totals live', async () => {
        typeInto(rowFor('Example Stock').querySelector('.amount-input'), '3k');
        expect($('inv-discretionary').textContent).toBe('R 3,000.00');
        expect($('transaction-footer').textContent).toBe('Total contributed R 9,500.00');
        typeInto(rowFor('Luno').querySelector('.crypto-value-input'), '0.02');
        expect($('total-crypto-value').textContent).toBe('0.02000000');
        expect((await lastSave()).body).toContain('10-02-2026,Luno,1500,Crypto,0.02\n');
    });

    it('quick-add reads "0.012 btc" as the BTC quantity and adds a Crypto row dated today', async () => {
        quickAdd('luno top-up 0.012 btc 6k');
        expect($('transaction-quick-add-preview').dataset.state).toBe('ok');
        expect($('transaction-quick-add-preview').textContent)
            .toBe(`Will add Crypto · Luno top-up · R 6,000.00 · 0.012 BTC on ${todayISO()}`);
        enter();
        expect($('transaction-quick-add').value).toBe('');
        expect(inv.getInvestmentData().transactions.at(-1))
            .toMatchObject({ date: todayISO(), description: 'Luno top-up', amount: 6000, type: 'Crypto', cryptoValue: '0.012' });
        expect(descs()[0]).toBe('Luno top-up');
        expect(rowFor('Luno top-up').querySelector('.crypto-value-input').value).toBe('0.012');
        expect($('inv-crypto').textContent).toBe('R 7,500.00');
        const [d, m, y] = [todayISO().slice(8), todayISO().slice(5, 7), todayISO().slice(0, 4)];
        expect((await lastSave()).body).toContain(`${d}-${m}-${y},Luno top-up,6000,Crypto,0.012\n`);
    });

    it('quick-add keywords pick the account, defaulting to Discretionary', () => {
        quickAdd('tfsa etf 3000 2026-03-02');
        enter();
        quickAdd('shares 1k');
        enter();
        const txs = inv.getInvestmentData().transactions;
        expect(txs.at(-2)).toMatchObject({ type: 'TFSA', description: 'Etf', amount: 3000, date: '2026-03-02', cryptoValue: '' });
        expect(txs.at(-1)).toMatchObject({ type: 'Discretionary', description: 'Shares', amount: 1000, date: todayISO() });
    });

    it('switches to All when a quick-added row is hidden by the filter', () => {
        chip('Crypto').click();
        quickAdd('tfsa etf 3000');
        enter();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
        expect(descs()).toContain('Etf');
    });

    it('says what is missing and keeps the text', () => {
        quickAdd('tfsa etf');
        expect($('transaction-quick-add-preview').dataset.state).toBe('error');
        expect($('transaction-quick-add-preview').textContent).toBe('Add an amount, e.g. 3k or 3000.');
        enter();
        expect($('transaction-quick-add').value).toBe('tfsa etf');
        expect(inv.getInvestmentData().transactions).toHaveLength(3);
    });

    it('Enter on an empty field adds a blank Discretionary row dated today', () => {
        quickAdd('');
        enter();
        const item = inv.getInvestmentData().transactions.at(-1);
        expect(item).toMatchObject({ date: todayISO(), description: '', amount: '', type: 'Discretionary' });
        expect(document.activeElement).toBe(rowFor('').querySelector('.description-input'));
    });

    it('deletes with undo and updates the performance panels', async () => {
        rowFor('Example ETF').querySelector('.remove-btn').click();
        expect(descs()).toEqual(['Luno', 'Example Stock']);
        expect($('inv-tfsa').textContent).toBe('R 0.00');
        expect((await lastSave()).body).not.toContain('Example ETF');
        document.querySelector('#undo-toast .undo-toast-btn').click();
        expect(descs()).toEqual(['Luno', 'Example Stock', 'Example ETF']);
        expect($('inv-tfsa').textContent).toBe('R 5,000.00');
        expect((await lastSave()).body).toBe(CSV);
    });
});
