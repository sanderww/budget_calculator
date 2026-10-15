// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRowElement, sortByDateThenIdDesc, sortByDateThenIdAsc, emptyStateHTML, generateId, bindAmountInput, deleteWithUndo, deletedMessage, createCommitmentRow, setCommitmentPastDue, COMMITMENT_KIND_LABELS } from '../src/lib/rows.js';

describe('sortByDateThenIdDesc', () => {
    it('sorts newest date first', () => {
        const rows = [{ id: 'a', date: '2025-01-01' }, { id: 'b', date: '2025-06-01' }];
        expect(rows.sort(sortByDateThenIdDesc)[0].id).toBe('b');
    });
    it('breaks date ties by id descending', () => {
        const rows = [{ id: 'id_1', date: '2025-01-01' }, { id: 'id_2', date: '2025-01-01' }];
        expect(rows.sort(sortByDateThenIdDesc)[0].id).toBe('id_2');
    });
});

describe('sortByDateThenIdAsc', () => {
    it('sorts soonest date first', () => {
        const rows = [{ id: 'b', date: '2029-09-01' }, { id: 'a', date: '2026-08-08' }];
        expect(rows.sort(sortByDateThenIdAsc).map(r => r.id)).toEqual(['a', 'b']);
    });
    it('orders a realistic future-cost list soonest-first', () => {
        const rows = [
            { id: 'id_5', date: '2034-01-06' },
            { id: 'id_1', date: '2026-09-28' },
            { id: 'id_2', date: '2026-08-08' },
            { id: 'id_4', date: '2027-03-01' },
            { id: 'id_3', date: '2026-09-05' },
        ];
        expect(rows.sort(sortByDateThenIdAsc).map(r => r.date)).toEqual([
            '2026-08-08', '2026-09-05', '2026-09-28', '2027-03-01', '2034-01-06',
        ]);
    });
    it('breaks date ties by id ascending', () => {
        const rows = [{ id: 'id_2', date: '2025-01-01' }, { id: 'id_1', date: '2025-01-01' }];
        expect(rows.sort(sortByDateThenIdAsc)[0].id).toBe('id_1');
    });
    it('lifts undated rows to the top', () => {
        const rows = [{ id: 'b', date: '2030-01-01' }, { id: 'a', date: '2026-01-01' }, { id: 'new', date: '' }];
        expect(rows.sort(sortByDateThenIdAsc).map(r => r.id)).toEqual(['new', 'a', 'b']);
    });
    it('lifts unparseable dates to the top too', () => {
        const rows = [{ id: 'a', date: '2026-01-01' }, { id: 'junk', date: 'not-a-date' }];
        expect(rows.sort(sortByDateThenIdAsc).map(r => r.id)).toEqual(['junk', 'a']);
    });
});

describe('generateId', () => {
    it('produces unique id_-prefixed ids', () => {
        const a = generateId(), b = generateId();
        expect(a).toMatch(/^id_/);
        expect(a).not.toBe(b);
    });
});

describe('emptyStateHTML', () => {
    it('wraps the message in the dashed placeholder', () => {
        expect(emptyStateHTML('No items.')).toContain('No items.');
        expect(emptyStateHTML('No items.')).toContain('border-dashed');
    });
});

describe('createRowElement', () => {
    const item = { id: 'x1', date: '2025-05-01', description: 'desc', amount: '100', cryptoValue: '', type: 'TFSA' };

    it('builds a budget-style row (description, amount, date)', () => {
        const row = createRowElement(item, {
            gridTemplateColumns: '1fr 1fr 1fr auto',
            fields: ['description', 'amount', 'date'],
        });
        expect(row.dataset.id).toBe('x1');
        expect(row.style.gridTemplateColumns).toBe('1fr 1fr 1fr auto');
        expect(row.querySelector('.description-input').value).toBe('desc');
        expect(row.querySelector('.amount-input').value).toBe('100');
        expect(row.querySelector('.date-input').value).toBe('2025-05-01');
        expect(row.querySelector('.remove-btn')).toBeTruthy();
        // budget rows are not compact
        expect(row.querySelector('.description-input').className).not.toContain('text-xs');
        expect(row.querySelector('.remove-btn').className).toContain('p-2');
    });

    it('builds an investment-style compact row with crypto + type select', () => {
        const row = createRowElement(item, {
            gridTemplateColumns: '1fr 2fr 1fr 0.8fr 1fr auto',
            fields: ['date', 'description', 'amount', 'cryptoValue', { select: ['Discretionary', 'TFSA', 'Crypto'] }],
            compact: true,
        });
        expect(row.querySelector('.crypto-value-input').parentElement.className).toContain('invisible'); // type !== Crypto
        expect(row.querySelector('.type-input').value).toBe('TFSA');
        expect(row.querySelector('.description-input').className).toContain('text-xs');
        expect(row.querySelector('.remove-btn').className).toContain('p-1.5');
    });

    it('shows the crypto input when type is Crypto', () => {
        const row = createRowElement({ ...item, type: 'Crypto', cryptoValue: '0.5' }, {
            gridTemplateColumns: '1fr 2fr 1fr 0.8fr 1fr auto',
            fields: ['date', 'description', 'amount', 'cryptoValue', { select: ['Discretionary', 'TFSA', 'Crypto'] }],
            compact: true,
        });
        expect(row.querySelector('.crypto-value-input').parentElement.className).not.toContain('invisible');
        expect(row.querySelector('.crypto-value-input').value).toBe('0.5');
    });
});

describe('bindAmountInput', () => {
    const setup = (initial) => {
        document.body.innerHTML = '<input id="a">';
        const el = document.getElementById('a');
        const state = { v: initial, calls: [] };
        const refresh = bindAmountInput(el, {
            get: () => state.v,
            set: (v) => { state.v = v === null ? '' : v; state.calls.push(v); },
        });
        return { el, state, refresh };
    };
    const type = (el, text) => { el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); };

    it('makes a text field with the decimal keypad and shows grouped value', () => {
        const { el } = setup(400000);
        expect(el.type).toBe('text');
        expect(el.getAttribute('inputmode')).toBe('decimal');
        expect(el.value).toBe('400,000');
    });
    it('shows the raw value on focus and groups again on blur', () => {
        const { el } = setup(45000.5);
        el.focus();
        expect(el.value).toBe('45000.5');
        el.blur();
        expect(el.value).toBe('45,000.5');
    });
    it('parses typed text into a number', () => {
        const { el, state } = setup('');
        type(el, '45k');
        expect(state.v).toBe(45000);
        type(el, 'R 1,200.50');
        expect(state.v).toBe(1200.5);
        expect(el.hasAttribute('aria-invalid')).toBe(false);
    });
    it('keeps the stored value and flags invalid text until corrected', () => {
        const { el, state } = setup(100);
        type(el, '1,2');
        expect(state.v).toBe(100);
        expect(el.getAttribute('aria-invalid')).toBe('true');
        el.dispatchEvent(new Event('blur'));
        expect(el.value).toBe('1,2');
        type(el, '12');
        expect(state.v).toBe(12);
        expect(el.hasAttribute('aria-invalid')).toBe(false);
    });
    it('treats a cleared field as null', () => {
        const { el, state } = setup(5);
        type(el, '');
        expect(state.calls).toEqual([null]);
        expect(state.v).toBe('');
    });
    it('refresh re-renders from the stored value', () => {
        const { el, state, refresh } = setup(1);
        state.v = 2500;
        refresh();
        expect(el.value).toBe('2,500');
    });
});

describe('createRowElement amount field', () => {
    it('shows a grouped amount and writes a number back to the item', () => {
        const item = { id: 'r1', description: 'x', amount: 45000 };
        const row = createRowElement(item, { gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] });
        const input = row.querySelector('.amount-input');
        expect(input.type).toBe('text');
        expect(input.value).toBe('45,000');
        input.value = '50k';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(item.amount).toBe(50000);
    });
    it('renders a neutral, labelled trash button', () => {
        const row = createRowElement({ id: 'r1', description: 'x', amount: 1 },
            { gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] });
        const btn = row.querySelector('.remove-btn');
        expect(btn.classList.contains('btn-danger')).toBe(false);
        expect(btn.classList.contains('btn-icon-danger')).toBe(true);
        expect(btn.getAttribute('aria-label')).toBe('Delete');
    });
});

describe('deletedMessage', () => {
    it('names the item and amount', () => {
        expect(deletedMessage({ description: 'School fees', amount: 45000 })).toBe('Deleted "School fees" (R 45,000.00)');
    });
    it('falls back when blank', () => {
        expect(deletedMessage({ description: '', amount: '' })).toBe('Deleted item');
    });
});

describe('delete then undo (DOM)', () => {
    let list, container;
    const render = () => {
        container.innerHTML = '';
        list.forEach(i => container.appendChild(createRowElement(i,
            { gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] })));
    };
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="c"></div>';
        container = document.getElementById('c');
        list = [
            { id: 'a', description: 'Rent', amount: 100 },
            { id: 'b', description: 'School fees', amount: 45000 },
            { id: 'c', description: 'Car', amount: 7 },
        ];
        render();
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-btn');
            if (!btn) return;
            deleteWithUndo({ getList: () => list, id: btn.closest('[data-id]').dataset.id, onChange: render });
        });
    });
    afterEach(() => { vi.useRealTimers(); });

    it('removes the row, shows the toast, and Undo restores the same item at the same index', () => {
        const original = list[1];
        container.querySelector('[data-id="b"] .remove-btn').click();
        expect(list.map(i => i.id)).toEqual(['a', 'c']);
        expect(container.querySelector('[data-id="b"]')).toBeNull();
        const toast = document.getElementById('undo-toast');
        expect(toast.hidden).toBe(false);
        expect(toast.textContent).toContain('Deleted "School fees" (R 45,000.00)');

        toast.querySelector('button').click();
        expect(list.map(i => i.id)).toEqual(['a', 'b', 'c']);
        expect(list[1]).toBe(original);
        expect([...container.children].map(r => r.dataset.id)).toEqual(['a', 'b', 'c']);
        expect(toast.hidden).toBe(true);
    });
    it('does not duplicate when the item is already back', () => {
        container.querySelector('[data-id="a"] .remove-btn').click();
        const undo = document.getElementById('undo-toast').querySelector('button');
        list.unshift({ id: 'a', description: 'Rent', amount: 100 });
        undo.click();
        expect(list.filter(i => i.id === 'a')).toHaveLength(1);
    });
});

describe('createCommitmentRow', () => {
    const item = (over = {}) => ({ id: 'c1', description: 'School fees', amount: 45000, date: '2027-01-15', ...over });

    it('labels the three kinds', () => {
        expect(COMMITMENT_KIND_LABELS).toEqual({ debt: 'Debt', provision: 'Provision', futureCost: 'Future cost' });
    });

    it('carries the item id and kind on the row', () => {
        const row = createCommitmentRow(item(), 'futureCost');
        expect(row.dataset.id).toBe('c1');
        expect(row.dataset.kind).toBe('futureCost');
        expect(row.classList.contains('commitment-row')).toBe(true);
    });

    it('renders the type as a labelled chip select with the current kind chosen', () => {
        const sel = createCommitmentRow(item(), 'provision').querySelector('select.kind-select');
        expect(sel.getAttribute('aria-label')).toBe('Type');
        expect([...sel.options].map(o => [o.value, o.textContent])).toEqual([
            ['debt', 'Debt'], ['provision', 'Provision'], ['futureCost', 'Future cost'],
        ]);
        expect(sel.value).toBe('provision');
        expect(sel.dataset.kind).toBe('provision');
        expect(sel.classList.contains('kind-chip')).toBe(true);
    });

    it('lays out description, amount, due and delete in order', () => {
        const row = createCommitmentRow(item(), 'provision');
        const desc = row.querySelector('.description-input');
        expect(desc.value).toBe('School fees');
        expect(desc.getAttribute('aria-label')).toBe('Description');
        const amt = row.querySelector('.amount-input');
        expect(amt.value).toBe('45,000');
        expect(amt.getAttribute('aria-label')).toBe('Amount');
        const date = row.querySelector('.date-input');
        expect(date.type).toBe('date');
        expect(date.value).toBe('2027-01-15');
        expect(date.getAttribute('aria-label')).toBe('Due date');
        const del = row.querySelector('button.remove-btn');
        expect(del.getAttribute('aria-label')).toBe('Delete');
    });

    it('writes a typed amount back to the item as a number', () => {
        const it_ = item();
        const amt = createCommitmentRow(it_, 'futureCost').querySelector('.amount-input');
        amt.value = '6.5k';
        amt.dispatchEvent(new Event('input', { bubbles: true }));
        expect(it_.amount).toBe(6500);
    });

    it('leaves the due cell empty and uneditable for a debt', () => {
        const row = createCommitmentRow(item({ date: '' }), 'debt');
        expect(row.querySelector('.date-input')).toBeNull();
        const due = row.querySelector('.commitment-due');
        expect(due).not.toBeNull();
        expect(due.querySelector('input')).toBeNull();
    });

    it('shows the past-due strip with a text Move button on a past-due future cost', () => {
        const row = createCommitmentRow(item({ date: '2026-01-01' }), 'futureCost', { pastDue: true });
        const strip = row.querySelector('.commitment-pastdue');
        expect(strip.hidden).toBe(false);
        expect(strip.querySelector('.past-due-badge').textContent).toBe('Past due');
        const btn = strip.querySelector('button.convert-btn');
        expect(btn.textContent).toBe('Move to provisions');
        expect(btn.type).toBe('button');
    });

    it('keeps the strip hidden on a future cost that is not past due', () => {
        const row = createCommitmentRow(item(), 'futureCost', { pastDue: false });
        expect(row.querySelector('.commitment-pastdue').hidden).toBe(true);
    });

    it('never offers the move on provisions or debts', () => {
        expect(createCommitmentRow(item({ date: '2020-01-01' }), 'provision', { pastDue: true })
            .querySelector('.convert-btn')).toBeNull();
        expect(createCommitmentRow(item(), 'debt').querySelector('.convert-btn')).toBeNull();
    });

    it('setCommitmentPastDue toggles the strip in place', () => {
        const row = createCommitmentRow(item(), 'futureCost');
        setCommitmentPastDue(row, true);
        expect(row.querySelector('.commitment-pastdue').hidden).toBe(false);
        setCommitmentPastDue(row, false);
        expect(row.querySelector('.commitment-pastdue').hidden).toBe(true);
    });
});
