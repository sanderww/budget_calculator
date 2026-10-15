// Shared building blocks for the editable transaction-row lists.
import { fmtZAR, fmtAmountInput, parseAmount } from './format.js';
import { showUndoToast } from './undo-toast.js';

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

// Soonest date first; ties broken by id ascending (ids embed creation time).
// Rows with a missing or unparseable date sort to the top, keeping a freshly
// added blank row in sight so its date can be filled in.
export const sortByDateThenIdAsc = (a, b) => {
    const timeA = Date.parse(a.date);
    const timeB = Date.parse(b.date);
    const badA = Number.isNaN(timeA);
    const badB = Number.isNaN(timeB);
    if (badA !== badB) return badA ? -1 : 1;
    if (!badA) {
        if (timeA < timeB) return -1;
        if (timeA > timeB) return 1;
    }
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
};

export const emptyStateHTML = (message) =>
    `<p class="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">${message}</p>`;

const rawAmount = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : String(Number(v)));

// Turns a rand text input into a formatted amount field: grouped value
// ("400,000") while idle, the raw value while focused. Typing is parsed with
// parseAmount; valid text calls set(number | null) (null = field cleared),
// invalid text leaves the stored value alone and sets aria-invalid until
// corrected. get() returns the stored value (number, numeric string or empty).
// Returns refresh(), which re-renders the display from get() (call it after
// changing the stored value from code).
export function bindAmountInput(el, { get, set }) {
    el.type = 'text';
    el.setAttribute('inputmode', 'decimal');
    el.setAttribute('autocomplete', 'off');
    const invalid = () => el.getAttribute('aria-invalid') === 'true';
    const show = () => {
        el.value = el === document.activeElement ? rawAmount(get()) : fmtAmountInput(get());
    };
    el.addEventListener('focus', () => { if (!invalid()) el.value = rawAmount(get()); });
    el.addEventListener('input', () => {
        if (el.value.trim() === '') {
            el.removeAttribute('aria-invalid');
            set(null);
            return;
        }
        const v = parseAmount(el.value);
        if (v === null) {
            el.setAttribute('aria-invalid', 'true');
            return;
        }
        el.removeAttribute('aria-invalid');
        set(v);
    });
    el.addEventListener('blur', () => { if (!invalid()) el.value = fmtAmountInput(get()); });
    const refresh = () => {
        el.removeAttribute('aria-invalid');
        show();
    };
    refresh();
    return refresh;
}

// "Deleted "School fees" (R 45,000.00)" for the undo toast.
export const deletedMessage = (item) => {
    const desc = (item.description || '').trim();
    const amt = parseAmount(String(item.amount ?? ''));
    let msg = desc ? `Deleted "${desc}"` : 'Deleted item';
    if (amt !== null) msg += ` (${fmtZAR(amt)})`;
    return msg;
};

// Removes the row with `id` from the list returned by getList() and shows an
// undo toast. onChange() re-renders and saves; it runs after the delete and
// again after Undo, which puts the same object back at its original index.
// getList is a function because controllers may replace the array (reload,
// convert) before Undo is clicked.
export function deleteWithUndo({ getList, id, onChange }) {
    const index = getList().findIndex(i => i.id === id);
    if (index < 0) return false;
    const [item] = getList().splice(index, 1);
    onChange();
    showUndoToast({
        message: deletedMessage(item),
        onUndo: () => {
            const list = getList();
            if (list.some(i => i.id === item.id)) return;
            list.splice(Math.min(index, list.length), 0, item);
            onChange();
        },
    });
    return true;
}

const trashIconSVG = (size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

const convertIconSVG = (size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;

// fields: ordered array of 'date' | 'description' | 'amount' | 'cryptoValue'
// | { select: [...options] }. A remove button is always appended.
//
// convertible: optional predicate (item) => boolean. When supplied, a
// convert button is added before the remove button. Rows where the predicate
// is false keep the cell but render the button `invisible`, so the remove
// buttons stay aligned down the list (same technique as cryptoValue above).
// Omitting the option emits no cell at all, leaving other lists untouched.
export function createRowElement(item, { gridTemplateColumns, fields, compact = false, convertible = null }) {
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
            el.placeholder = '0.00';
            el.className = 'input-field amount-input' + sz;
            bindAmountInput(el, {
                get: () => item.amount,
                set: (v) => { item.amount = v === null ? '' : v; },
            });
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

    if (convertible) {
        const convertBtn = document.createElement('button');
        convertBtn.type = 'button';
        convertBtn.innerHTML = convertIconSVG(compact ? 14 : 16);
        convertBtn.title = 'Move to provisions';
        convertBtn.setAttribute('aria-label', 'Move to provisions');
        const usable = convertible(item);
        convertBtn.className = `btn btn-secondary convert-btn ${compact ? 'p-1.5' : 'p-2'}`
            + (usable ? '' : ' invisible');
        if (!usable) convertBtn.disabled = true;
        div.appendChild(convertBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.title = 'Delete';
    removeBtn.setAttribute('aria-label', 'Delete');
    removeBtn.innerHTML = trashIconSVG(compact ? 14 : 16);
    removeBtn.className = `btn btn-icon-danger remove-btn ${compact ? 'p-1.5' : 'p-2'}`;
    div.appendChild(removeBtn);
    return div;
}
