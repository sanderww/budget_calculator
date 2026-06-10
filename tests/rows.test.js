// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from '../src/app/rows.js';

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
