// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createRowElement, sortByDateThenIdDesc, sortByDateThenIdAsc, emptyStateHTML, generateId } from '../src/lib/rows.js';

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

describe('createRowElement convert button', () => {
    const row = (over = {}) => createRowElement(
        { id: 'f1', description: 'rent tax', amount: 5000, date: '2026-08-08', ...over },
        { gridTemplateColumns: '1fr 1fr 1fr auto auto', fields: ['description', 'amount', 'date'],
          convertible: (item) => item.date === '2026-08-08' });

    it('renders a convert button before the remove button', () => {
        const el = row();
        const buttons = [...el.querySelectorAll('button')];
        expect(buttons).toHaveLength(2);
        expect(buttons[0].classList.contains('convert-btn')).toBe(true);
        expect(buttons[1].classList.contains('remove-btn')).toBe(true);
    });

    it('leaves the button usable when the predicate passes', () => {
        const btn = row().querySelector('.convert-btn');
        expect(btn.classList.contains('invisible')).toBe(false);
        expect(btn.disabled).toBe(false);
        expect(btn.title).toBe('Move to provisions');
    });

    it('keeps the cell but hides and disables the button when the predicate fails', () => {
        const el = row({ date: '2034-01-06' });
        const btn = el.querySelector('.convert-btn');
        // Still present, so the remove buttons stay aligned down the list.
        expect(btn).not.toBeNull();
        expect(btn.classList.contains('invisible')).toBe(true);
        expect(btn.disabled).toBe(true);
    });

    it('emits no convert cell at all when the option is omitted', () => {
        const el = createRowElement({ id: 'p1', description: 'x', amount: 1, date: '2026-01-01' },
            { gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });
        expect(el.querySelector('.convert-btn')).toBeNull();
        expect(el.querySelectorAll('button')).toHaveLength(1);
    });

    it('does not submit an enclosing form', () => {
        expect(row().querySelector('.convert-btn').type).toBe('button');
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
