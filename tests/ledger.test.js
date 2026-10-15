// @vitest-environment happy-dom
// Shared ledger component (UX-4.1) with a minimal, non-Budget config: a
// transaction list with a conditional BTC column, filters generated per
// calendar year, newest-first sort and a quick-add that defaults to today.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLedger } from '../src/lib/ledger.js';
import { parseQuickAddTokens, todayISO } from '../src/lib/quick-add.js';

const STORAGE_KEY = 'test.ledgerFilter';
let data;
let ledger;
let onChange;
let onRemove;

const $ = (id) => document.getElementById(id);
const rows = () => [...$('list').querySelectorAll('.ledger-row')];
const descs = () => rows().map(r => r.querySelector('.description-input').value);
const rowFor = (desc) => rows().find(r => r.querySelector('.description-input').value === desc);
const chip = (v) => $('filters').querySelector(`[data-filter="${v}"]`);
const typeInto = (el, text, event = 'input') => {
    el.value = text;
    el.dispatchEvent(new Event(event, { bubbles: true }));
};
const enter = () => $('qa').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

const make = () => createLedger({
    elements: { list: $('list'), filters: $('filters'), footer: $('footer'), head: $('head'), quickAdd: $('qa'), preview: $('pv') },
    getRows: () => data.map(item => ({ item, group: (item.date || '').slice(0, 4) })),
    getList: () => data,
    rowClass: 'ledger-row',
    columns: [
        { key: 'date', type: 'date', label: 'Date' },
        { key: 'description', type: 'text', label: 'Description' },
        { key: 'amount', type: 'amount', label: 'Amount' },
        { key: 'type', type: 'select', label: 'Account', options: ['Discretionary', 'TFSA', 'Crypto'] },
        { key: 'cryptoValue', type: 'number', label: 'BTC', when: (item) => item.type === 'Crypto' },
    ],
    filters: {
        storageKey: STORAGE_KEY,
        options: (all) => [{ value: 'all', label: 'All' },
            ...[...new Set(all.map(r => r.group))].sort().reverse().map(y => ({ value: y, label: y }))],
    },
    empty: { none: 'No transactions yet.', filtered: (opt) => `Nothing in ${opt.label}.` },
    quickAdd: {
        parse: (text) => parseQuickAddTokens(text, { defaultDate: todayISO }),
        preview: (t) => (t.empty ? { state: 'idle', content: 'Type a transaction.' }
            : t.amount === null ? { state: 'error', content: 'Add an amount.' }
                : { state: 'ok', content: [`Will add ${t.description} on `, t.date] }),
        onSubmit: (t) => {
            if (t.empty || t.amount === null) return false;
            data.push({ id: `id_9_${data.length}`, date: t.date, description: t.description, amount: t.amount, type: 'Discretionary', cryptoValue: '' });
            ledger.render();
            return true;
        },
    },
    onChange: (...a) => onChange(...a),
    onRemove: () => onRemove(),
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try { localStorage.clear(); } catch { /* ignore */ }
    document.body.innerHTML = '<input id="qa"><p id="pv"></p><div id="filters"></div><div id="head"></div>'
        + '<div id="list"></div><div id="footer"></div>';
    data = [
        { id: 'id_1', date: '2025-03-01', description: 'First', amount: 1000, type: 'TFSA', cryptoValue: '' },
        { id: 'id_2', date: '2026-02-10', description: 'Coins', amount: 500, type: 'Crypto', cryptoValue: 0.01 },
        { id: 'id_3', date: '2026-05-01', description: 'Top-up', amount: 2000, type: 'Discretionary', cryptoValue: '' },
    ];
    onChange = vi.fn();
    onRemove = vi.fn();
    ledger = make();
    ledger.render();
});

afterEach(() => vi.useRealTimers());

describe('createLedger', () => {
    it('renders the header and the rows newest-first with the configured columns', () => {
        expect([...$('head').children].map(c => c.textContent)).toEqual(['Date', 'Description', 'Amount', 'Account', 'BTC', '']);
        expect(descs()).toEqual(['Top-up', 'Coins', 'First']);
        const row = rowFor('Top-up');
        expect(row.dataset.id).toBe('id_3');
        expect(row.querySelector('.date-input').value).toBe('2026-05-01');
        expect(row.querySelector('.amount-input').value).toBe('2,000');
        expect(row.querySelector('select').value).toBe('Discretionary');
        expect(row.querySelector('button.remove-btn').getAttribute('aria-label')).toBe('Delete');
    });

    it('shows the conditional column only where it applies', () => {
        expect(rowFor('Coins').querySelector('[data-field="cryptoValue"]').value).toBe('0.01');
        expect(rowFor('Top-up').querySelector('[data-field="cryptoValue"]')).toBeNull();
        expect(rowFor('Top-up').querySelector('[data-col="cryptoValue"]')).not.toBeNull();
    });

    it('generates filter chips with counts and shows the total in the footer', () => {
        expect([...$('filters').children].map(b => b.textContent)).toEqual(['All (3)', '2026 (2)', '2025 (1)']);
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
        expect($('footer').textContent).toBe('Total R 3,500.00');
    });

    it('filters, remembers the choice per browser, and totals the filter', () => {
        chip('2026').click();
        expect(descs()).toEqual(['Top-up', 'Coins']);
        expect(chip('2026').getAttribute('aria-pressed')).toBe('true');
        expect(document.activeElement).toBe(chip('2026'));
        expect(localStorage.getItem(STORAGE_KEY)).toBe('2026');
        expect($('footer').textContent).toBe('Total R 2,500.00');
        expect(make().getFilter()).toBe('2026');
    });

    it('falls back to the first option for a remembered filter that no longer exists', () => {
        localStorage.setItem(STORAGE_KEY, '1999');
        const l = make();
        l.render();
        expect(l.getFilter()).toBe('all');
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
    });

    it('writes edits to the item, updates the footer live and reports the change', () => {
        typeInto(rowFor('First').querySelector('.description-input'), 'Renamed');
        expect(data[0].description).toBe('Renamed');
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ item: data[0], field: 'description', group: '2025' }));
        typeInto(rowFor('Coins').querySelector('.amount-input'), '1.5k');
        expect(data[1].amount).toBe(1500);
        expect($('footer').textContent).toBe('Total R 4,500.00');
    });

    it('shows and hides the conditional cell in place when the row changes', () => {
        const row = rowFor('Top-up');
        typeInto(row.querySelector('select'), 'Crypto', 'change');
        expect(data[2].type).toBe('Crypto');
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ field: 'type' }));
        expect(row.querySelector('[data-field="cryptoValue"]')).not.toBeNull();
        typeInto(row.querySelector('[data-field="cryptoValue"]'), '0.2');
        expect(data[2].cryptoValue).toBe('0.2');
        typeInto(row.querySelector('select'), 'TFSA', 'change');
        expect(row.querySelector('[data-field="cryptoValue"]')).toBeNull();
    });

    it('previews a quick-add line and adds it dated today on Enter', () => {
        typeInto($('qa'), 'bonus 5k');
        expect($('pv').dataset.state).toBe('ok');
        expect($('pv').textContent).toBe(`Will add Bonus on ${todayISO()}`);
        enter();
        expect($('qa').value).toBe('');
        expect($('pv').textContent).toBe('Type a transaction.');
        expect(data.at(-1)).toMatchObject({ description: 'Bonus', amount: 5000, date: todayISO() });
        expect(descs()[0]).toBe('Bonus');
    });

    it('keeps the field when the submit is refused', () => {
        typeInto($('qa'), 'bonus');
        expect($('pv').dataset.state).toBe('error');
        enter();
        expect($('qa').value).toBe('bonus');
        expect(data).toHaveLength(3);
    });

    it('deletes with undo, restoring the same item', () => {
        const item = data[1];
        rowFor('Coins').querySelector('.remove-btn').click();
        expect(descs()).toEqual(['Top-up', 'First']);
        expect(onRemove).toHaveBeenCalledTimes(1);
        expect(document.getElementById('undo-toast').textContent).toContain('Deleted "Coins" (R 500.00)');
        document.querySelector('#undo-toast .undo-toast-btn').click();
        expect(data[1]).toBe(item);
        expect(descs()).toEqual(['Top-up', 'Coins', 'First']);
        expect(onRemove).toHaveBeenCalledTimes(2);
    });

    it('reveals a hidden row by switching to All and highlighting it for 1.5 s', () => {
        chip('2025').click();
        expect(ledger.reveal('nope')).toBe(false);
        expect(ledger.getFilter()).toBe('2025');
        expect(ledger.reveal('id_3')).toBe(true);
        expect(ledger.getFilter()).toBe('all');
        const row = $('list').querySelector('[data-id="id_3"]');
        expect(row.classList.contains('row-highlight')).toBe(true);
        vi.advanceTimersByTime(1500);
        expect(row.classList.contains('row-highlight')).toBe(false);
    });

    it('ensureVisible switches to All only when the filter hides the row', () => {
        chip('2026').click();
        ledger.ensureVisible({ item: data[2], group: '2026' });
        expect(ledger.getFilter()).toBe('2026');
        ledger.ensureVisible({ item: data[0], group: '2025' });
        expect(ledger.getFilter()).toBe('all');
    });

    it('mirrors a select cell\'s value into data-value so CSS can colour it', () => {
        const sel = rowFor('Top-up').querySelector('select[data-field="type"]');
        expect(sel.dataset.value).toBe('Discretionary');
        expect(rowFor('First').querySelector('select').dataset.value).toBe('TFSA');
        typeInto(sel, 'Crypto', 'change');
        expect(sel.dataset.value).toBe('Crypto');
        expect(data[2].type).toBe('Crypto');
    });

    it('keeps a generated filter whose last row was edited away until the next full render', () => {
        chip('2025').click();
        expect(descs()).toEqual(['First']);
        // The only 2025 row moves to 2026: the 2025 option is gone from the data.
        typeInto(rowFor('First').querySelector('.date-input'), '2026-07-01');
        expect(data[0].date).toBe('2026-07-01');
        // The list was not re-rendered, so the chips must still say 2025.
        expect(ledger.getFilter()).toBe('2025');
        expect(chip('2025').getAttribute('aria-pressed')).toBe('true');
        expect(chip('all').getAttribute('aria-pressed')).toBe('false');
        expect(chip('all').textContent).toBe('All (3)');
        expect(chip('2025').textContent).toBe('2025 (0)');
        expect(descs()).toEqual(['First']);
        expect($('footer').textContent).toBe('Total R 0.00');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('2025');
        // The next full render falls back to All.
        ledger.render();
        expect(ledger.getFilter()).toBe('all');
        expect(chip('2025')).toBeNull();
        expect(chip('all').getAttribute('aria-pressed')).toBe('true');
        expect(descs()).toEqual(['First', 'Top-up', 'Coins']);
    });

    it('shows the empty states', () => {
        chip('2025').click();
        data.splice(0, 1);
        ledger.render();
        // The 2025 chip is gone, so the view falls back to All.
        expect(ledger.getFilter()).toBe('all');
        data.length = 0;
        ledger.render();
        expect($('list').textContent).toContain('No transactions yet.');
        expect($('footer').textContent).toBe('');
    });
});
