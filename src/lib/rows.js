// Shared building blocks for the editable transaction-row lists.

export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Newest date first; ties broken by id descending (ids embed creation time).
export const sortByDateThenIdDesc = (a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    if (a.id > b.id) return -1;
    if (a.id < b.id) return 1;
    return 0;
};

export const emptyStateHTML = (message) =>
    `<p class="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">${message}</p>`;

const trashIconSVG = (size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// fields: ordered array of 'date' | 'description' | 'amount' | 'cryptoValue'
// | { select: [...options] }. A remove button is always appended.
export function createRowElement(item, { gridTemplateColumns, fields, compact = false }) {
    const div = document.createElement('div');
    div.className = 'grid gap-2 items-center';
    div.style.gridTemplateColumns = gridTemplateColumns;
    div.dataset.id = item.id;
    const sz = compact ? ' text-xs' : '';

    for (const field of fields) {
        if (field === 'date') {
            const el = document.createElement('input');
            el.type = 'date';
            el.value = item.date || '';
            el.className = 'input-field date-input' + sz;
            div.appendChild(el);
        } else if (field === 'description') {
            const el = document.createElement('input');
            el.type = 'text';
            el.value = item.description;
            el.placeholder = 'Description';
            el.className = 'input-field description-input' + sz;
            div.appendChild(el);
        } else if (field === 'amount') {
            const wrap = document.createElement('div');
            wrap.className = 'relative';
            const prefix = document.createElement('span');
            prefix.className = compact ? 'currency-prefix text-xs' : 'currency-prefix';
            prefix.textContent = 'R';
            const el = document.createElement('input');
            el.type = 'number';
            el.value = item.amount;
            el.placeholder = '0.00';
            el.className = 'input-field amount-input' + sz;
            wrap.append(prefix, el);
            div.appendChild(wrap);
        } else if (field === 'cryptoValue') {
            const wrap = document.createElement('div');
            wrap.className = `relative ${item.type === 'Crypto' ? '' : 'invisible'}`;
            const el = document.createElement('input');
            el.type = 'number';
            el.value = item.cryptoValue || '';
            el.placeholder = 'BTC';
            el.className = 'input-field crypto-value-input' + sz;
            wrap.appendChild(el);
            div.appendChild(wrap);
        } else if (field && field.select) {
            const el = document.createElement('select');
            el.className = 'input-field type-input' + sz;
            field.select.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (item.type === opt) option.selected = true;
                el.appendChild(option);
            });
            div.appendChild(el);
        }
    }

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = trashIconSVG(compact ? 14 : 16);
    removeBtn.className = `btn btn-danger remove-btn ${compact ? 'p-1.5' : 'p-2'}`;
    div.appendChild(removeBtn);
    return div;
}
