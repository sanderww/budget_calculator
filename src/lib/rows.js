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

// Neutral trash button shared by every editable row.
const createRemoveButton = (compact = false) => {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.title = 'Delete';
    removeBtn.setAttribute('aria-label', 'Delete');
    removeBtn.innerHTML = trashIconSVG(compact ? 14 : 16);
    removeBtn.className = `btn btn-icon-danger remove-btn ${compact ? 'p-1.5' : 'p-2'}`;
    return removeBtn;
};

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

    div.appendChild(createRemoveButton(compact));
    return div;
}

// Budget commitments ledger. Kinds match COMMITMENT_KINDS in calc/budget.js.
export const COMMITMENT_KIND_LABELS = { debt: 'Debt', provision: 'Provision', futureCost: 'Future cost' };

// ---- Column-driven ledger rows (src/lib/ledger.js) -------------------------
// A column is { key, label, type, ... }:
//   type       'text' | 'date' | 'number' | 'amount' | 'select' | 'custom'
//   key        the item field the cell edits (also data-col / data-field)
//   label      header text; also the input's aria-label unless ariaLabel is set
//   ariaLabel, placeholder (text/number; defaults to label)
//   options    select only: strings or { value, label }
//   inputClass the input's own class (default `${kebab(key)}-input`)
//   className  extra class: on the input, or on the wrapper when there is one
//   wrap       true to put the input in a <div class=className> (amount always wraps)
//   when(item, ctx) → false renders the cell as an empty <div class=className>
//                  (a conditional column, e.g. BTC only on Crypto rows)
//   render(item, ctx) → Node, for type 'custom'
// Every cell root carries data-col=key; every input carries data-field=key and
// writes its value back to item[key] as it is edited (amounts as numbers via
// bindAmountInput, selects on change, the rest on input). A select also keeps
// data-value equal to its shown value (a styling hook). ctx is { group }.
const kebab = (key) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

export function createLedgerCell(item, col, ctx = {}) {
    let cell;
    if (col.when && !col.when(item, ctx)) {
        cell = document.createElement('div');
        if (col.className) cell.className = col.className;
        cell.dataset.on = 'false';
    } else if (col.type === 'custom') {
        cell = col.render(item, ctx);
    } else {
        let input;
        if (col.type === 'select') {
            input = document.createElement('select');
            for (const opt of col.options || []) {
                const { value, label } = typeof opt === 'string' ? { value: opt, label: opt } : opt;
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                if (String(item[col.key] ?? '') === String(value)) option.selected = true;
                input.appendChild(option);
            }
            // The shown value is mirrored into data-value, so CSS can colour
            // a select styled as a chip (e.g. the Investments account chip).
            input.dataset.value = input.value;
            input.addEventListener('change', () => {
                item[col.key] = input.value;
                input.dataset.value = input.value;
            });
        } else {
            input = document.createElement('input');
            if (col.type !== 'amount') {
                input.type = col.type === 'date' || col.type === 'number' ? col.type : 'text';
                input.value = item[col.key] ?? '';
                if (col.type !== 'date') input.placeholder = col.placeholder ?? col.label;
                input.addEventListener('input', () => { item[col.key] = input.value; });
            }
        }
        input.dataset.field = col.key;
        input.setAttribute('aria-label', col.ariaLabel ?? col.label);
        const own = `input-field ${col.inputClass ?? `${kebab(col.key)}-input`}`;
        if (col.type === 'amount') {
            input.placeholder = col.placeholder ?? '0.00';
            input.className = own;
            bindAmountInput(input, {
                get: () => item[col.key],
                set: (v) => { item[col.key] = v === null ? '' : v; },
            });
            cell = document.createElement('div');
            cell.className = col.className ? `relative ${col.className}` : 'relative';
            const prefix = document.createElement('span');
            prefix.className = 'currency-prefix';
            prefix.textContent = 'R';
            cell.append(prefix, input);
        } else if (col.wrap) {
            input.className = own;
            cell = document.createElement('div');
            if (col.className) cell.className = col.className;
            cell.appendChild(input);
        } else {
            input.className = col.className ? `${own} ${col.className}` : own;
            cell = input;
        }
        if (col.when) cell.dataset.on = 'true';
    }
    cell.dataset.col = col.key;
    return cell;
}

// One ledger row: a cell per column, then the delete button. The row carries
// data-id (the item id) plus any extra `dataset` entries.
export function createLedgerRow(item, columns, { rowClass = 'ledger-row', group, dataset = {}, removeClass } = {}) {
    const row = document.createElement('div');
    row.className = rowClass;
    row.dataset.id = item.id;
    Object.assign(row.dataset, dataset);
    for (const col of columns) row.appendChild(createLedgerCell(item, col, { group }));
    const removeBtn = createRemoveButton();
    if (removeClass) removeBtn.classList.add(removeClass);
    row.appendChild(removeBtn);
    return row;
}

const kindChip = (item, { group }) => {
    const kindSel = document.createElement('select');
    kindSel.className = 'kind-select kind-chip';
    kindSel.dataset.kind = group;
    kindSel.setAttribute('aria-label', 'Type');
    for (const [value, label] of Object.entries(COMMITMENT_KIND_LABELS)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        if (value === group) option.selected = true;
        kindSel.appendChild(option);
    }
    return kindSel;
};

// Commitments columns: Type chip · Description · Amount · Due. The kind chip
// is custom (it changes the row's kind, handled by the Budget controller, so
// it has no data-field). Debts have no due date: their Due cell stays empty.
export const COMMITMENT_COLUMNS = [
    { key: 'kind', type: 'custom', label: 'Type', render: kindChip },
    { key: 'description', type: 'text', label: 'Description', className: 'commitment-desc' },
    { key: 'amount', type: 'amount', label: 'Amount', className: 'commitment-amount' },
    { key: 'date', type: 'date', label: 'Due', ariaLabel: 'Due date', wrap: true, className: 'commitment-due',
        when: (item, { group }) => group !== 'debt' },
];

// One commitments row (COMMITMENT_COLUMNS + delete). The row carries data-id
// (the item id) and data-kind. Future costs also get a full-width
// "Past due" strip with a text "Move to provisions" button; it is hidden
// unless `pastDue`, and setCommitmentPastDue() toggles it without a
// re-render (so editing a date does not steal focus).
export function createCommitmentRow(item, kind, { pastDue = false } = {}) {
    const row = createLedgerRow(item, COMMITMENT_COLUMNS, {
        rowClass: 'commitment-row', group: kind, dataset: { kind }, removeClass: 'commitment-remove',
    });

    if (kind === 'futureCost') {
        const strip = document.createElement('div');
        strip.className = 'commitment-pastdue';
        const badge = document.createElement('span');
        badge.className = 'past-due-badge';
        badge.textContent = 'Past due';
        const hint = document.createElement('span');
        hint.className = 'commitment-pastdue-hint';
        hint.textContent = 'Saved the money? Move it to provisions. Spent it? Delete the row.';
        const convertBtn = document.createElement('button');
        convertBtn.type = 'button';
        convertBtn.className = 'btn btn-secondary convert-btn';
        convertBtn.textContent = 'Move to provisions';
        strip.append(badge, hint, convertBtn);
        row.appendChild(strip);
        setCommitmentPastDue(row, pastDue);
    }
    return row;
}

export function setCommitmentPastDue(row, pastDue) {
    const strip = row.querySelector('.commitment-pastdue');
    if (strip) strip.hidden = !pastDue;
}
