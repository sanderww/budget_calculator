// Shared ledger component (UX-4.1): one editable table with filter chips,
// footer totals, quick-add with a preview line, empty states and
// delete-with-undo. Budget Commitments uses it; Investments, Debt and RA
// transaction lists are meant to (UX-4.2 to UX-4.4).
//
// const ledger = createLedger({
//   elements: { list, filters?, footer?, head?, quickAdd?, preview? },
//       Existing DOM nodes. `head` (optional) gets one <span> per column plus
//       an empty one for the actions column.
//   getRows: () => [{ item, group }],
//       Every row, unfiltered, read live on each render. `item` has an `id`;
//       `group` is what a filter matches on by default (kind, account, year…).
//   getList?: (row) => array,
//       The live array holding row.item. Enables the delete button
//       (deleteWithUndo: removes, shows the undo toast, Undo restores the
//       same object at the same index).
//   columns?: [column…],
//       Column specs (see createLedgerCell in rows.js): type text | date |
//       number | amount | select | custom, with `when(item, { group })` for a
//       conditional column (rendered empty when false and swapped in place
//       after an edit of the same row, e.g. BTC on Crypto rows only).
//   rowClass?: 'ledger-row',
//   renderRow?: (row) => HTMLElement,
//       Overrides the column builder (Budget: createCommitmentRow). The element
//       must carry data-id; inputs that should report edits carry data-field.
//   sort?: (a, b) => number,
//       Compares two items. Default newest-first (sortByDateThenIdDesc).
//   filters?: {
//       storageKey,              localStorage key (per browser, never config)
//       options: [opt…] | (rows) => [opt…],   static or generated per render
//           opt = { value, label, match?: (row) => bool }. The first option
//           is the catch-all (no match = every row); other options match
//           row.group === value unless `match` is given.
//       chipText?: (opt, { count, total }) => string   default "Label (n)"
//       A generated option whose last row is edited away stays selected (and
//       its chip stays, with a count of 0) until the next full render, since
//       edits refresh only the chips and footer, never the list.
//   },
//   footer?: ({ filter, option, stats, visible }) => Node[],
//       Default: "Total R x" for the visible rows. stats maps each option
//       value to { count, total } (total = sum of parseFloat(amount) || 0).
//       The footer is cleared when there are no rows at all.
//   empty?: { none: string, filtered?: (opt) => string },
//   quickAdd?: {
//       parse: (text) => parsed,
//       preview: (parsed) => { state: 'idle' | 'error' | 'ok', content: string | (string|Node)[] },
//       onSubmit: (parsed) => boolean,   on Enter; true clears the field
//   },
//   actions?: [{ selector, on?: 'click', run: (row, event, el) => void }],
//       Extra delegated row handlers (e.g. Budget's kind chip and
//       "Move to provisions").
//   onChange?: ({ item, group, field, target, el }) => void,
//       After an in-place edit of a data-field input (the item is already
//       updated, the footer and chips are refreshed).
//   onRemove?: () => void,
//       After a delete and after its Undo (the ledger has re-rendered).
// });
// Returns { render, renderFooter, getFilter, setFilter, ensureVisible, reveal, rowElement }.
import { fmtZAR } from './format.js';
import { sortByDateThenIdDesc, emptyStateHTML, deleteWithUndo, createLedgerRow, createLedgerCell } from './rows.js';

const HIGHLIGHT_MS = 1500;

// <strong>text</strong>, for preview lines.
export const strong = (text) => {
    const el = document.createElement('strong');
    el.textContent = text;
    return el;
};

const amountOf = (item) => parseFloat(item.amount) || 0;

export function createLedger(config) {
    const {
        elements, getRows, getList, columns = [], rowClass = 'ledger-row', renderRow,
        sort = sortByDateThenIdDesc, filters, footer, empty = {}, quickAdd, actions = [],
        onChange, onRemove,
    } = config;
    const { list, filters: filtersEl, footer: footerEl, head, quickAdd: qaInput, preview } = elements;

    // ---- filter state ----------------------------------------------------
    let filter = null;
    if (filters?.storageKey) {
        try { filter = localStorage.getItem(filters.storageKey); } catch { /* ignore */ }
    }
    const optionsFor = (rows) => {
        if (!filters) return [{ value: 'all', label: 'All' }];
        return typeof filters.options === 'function' ? filters.options(rows) : filters.options;
    };
    const matches = (opt, row, first) => (opt === first ? true
        : opt.match ? opt.match(row) : row.group === opt.value);
    // The option the last full render showed. Between full renders (edits
    // only refresh the chips and footer), a generated option whose last row
    // was edited away is kept, so the chips never claim a filter the list
    // does not show; the next full render falls back to the first option.
    let shown = null;
    // The remembered value is kept until rows exist that prove it stale, so a
    // generated filter (a year) survives a render before the data has loaded.
    const resolve = (rows, { keep = false } = {}) => {
        const opts = optionsFor(rows);
        let opt = opts.find(o => o.value === filter);
        if (!opt && keep && shown && shown.value === filter) {
            return { opts: [...opts, shown], opt: shown };
        }
        if (!opt) {
            opt = opts[0];
            if (rows.length || filter === null) filter = opt.value;
        }
        return { opts, opt };
    };
    const setFilter = (value) => {
        filter = value;
        if (filters?.storageKey) {
            try { localStorage.setItem(filters.storageKey, value); } catch { /* per-viewer convenience only */ }
        }
    };
    const getFilter = () => resolve(getRows(), { keep: true }).opt.value;

    const statsFor = (rows, opts) => {
        const stats = {};
        for (const o of opts) {
            const hit = rows.filter(r => matches(o, r, opts[0]));
            stats[o.value] = { count: hit.length, total: hit.reduce((s, r) => s + amountOf(r.item), 0) };
        }
        return stats;
    };

    // ---- rendering ---------------------------------------------------------
    const renderHead = () => {
        if (!head || !columns.length) return;
        head.replaceChildren(...[...columns.map(c => c.label), ''].map(text => {
            const span = document.createElement('span');
            span.textContent = text;
            return span;
        }));
    };

    const renderFilters = (opts, opt, stats) => {
        if (!filtersEl) return;
        const text = filters?.chipText || ((o, s) => `${o.label} (${s.count})`);
        filtersEl.replaceChildren(...opts.map(o => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'filter-chip';
            btn.dataset.filter = o.value;
            btn.setAttribute('aria-pressed', String(o === opt));
            btn.textContent = text(o, stats[o.value]);
            return btn;
        }));
    };

    const renderFooterFrom = (rows, opts, opt, stats) => {
        if (!footerEl) return;
        if (rows.length === 0) {
            footerEl.replaceChildren();
            return;
        }
        const visible = rows.filter(r => matches(opt, r, opts[0]));
        if (footer) {
            footerEl.replaceChildren(...footer({ filter: opt.value, option: opt, stats, visible }));
            return;
        }
        const total = document.createElement('span');
        total.className = 'font-semibold text-slate-800';
        total.textContent = `Total ${fmtZAR(stats[opt.value].total)}`;
        footerEl.replaceChildren(total);
    };

    // Chips and footer only (used while typing: never rebuilds the rows).
    const renderFooter = () => {
        const rows = getRows();
        const { opts, opt } = resolve(rows, { keep: true });
        const stats = statsFor(rows, opts);
        renderFilters(opts, opt, stats);
        renderFooterFrom(rows, opts, opt, stats);
    };

    const buildRow = (row) => renderRow ? renderRow(row)
        : createLedgerRow(row.item, columns, { rowClass, group: row.group });

    // Sorted on every render; sorting view rows leaves the stored order alone.
    const render = () => {
        const rows = getRows();
        const { opts, opt } = resolve(rows);
        shown = opt;
        const stats = statsFor(rows, opts);
        renderHead();
        renderFilters(opts, opt, stats);
        const visible = rows.filter(r => matches(opt, r, opts[0]))
            .sort((a, b) => sort(a.item, b.item));
        list.innerHTML = '';
        if (rows.length === 0) {
            list.innerHTML = emptyStateHTML(empty.none ?? 'Nothing yet.');
        } else if (visible.length === 0) {
            list.innerHTML = emptyStateHTML(empty.filtered ? empty.filtered(opt) : `No ${opt.label.toLowerCase()} yet.`);
        } else {
            visible.forEach(r => list.appendChild(buildRow(r)));
        }
        renderFooterFrom(rows, opts, opt, stats);
    };

    const rowElement = (id) => list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const rowFor = (el) => {
        const rowEl = el.closest('[data-id]');
        if (!rowEl || !list.contains(rowEl)) return null;
        const row = getRows().find(r => r.item.id === rowEl.dataset.id);
        return row ? { row, rowEl } : null;
    };

    // Switch to the catch-all filter when the current one hides `row`.
    const ensureVisible = (row) => {
        const rows = getRows();
        const { opts, opt } = resolve(rows, { keep: true });
        if (!matches(opt, row, opts[0])) setFilter(opts[0].value);
    };

    // Scroll to a row and highlight it for 1.5 s, switching to the catch-all
    // filter first when the current one hides it. False for an unknown id.
    const reveal = (id) => {
        const row = getRows().find(r => r.item.id === id);
        if (!row) return false;
        let el = rowElement(id);
        if (!el) {
            ensureVisible(row);
            render();
            el = rowElement(id);
        }
        if (!el) return false;
        const reduce = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), HIGHLIGHT_MS);
        return true;
    };

    // ---- events ------------------------------------------------------------
    // Swap conditional cells whose `when` flipped after an edit.
    const refreshConditional = (rowEl, row) => {
        for (const col of columns) {
            if (!col.when) continue;
            const cell = rowEl.querySelector(`:scope > [data-col="${CSS.escape(col.key)}"]`);
            if (!cell || cell.dataset.on === String(Boolean(col.when(row.item, { group: row.group })))) continue;
            cell.replaceWith(createLedgerCell(row.item, col, { group: row.group }));
        }
    };

    const onEdit = (e) => {
        const target = e.target;
        const field = target.dataset?.field;
        if (!field) return;
        // Selects report on change; everything else on input.
        if ((target.tagName === 'SELECT') !== (e.type === 'change')) return;
        const hit = rowFor(target);
        if (!hit) return;
        refreshConditional(hit.rowEl, hit.row);
        renderFooter();
        onChange?.({ item: hit.row.item, group: hit.row.group, field, target, el: hit.rowEl });
    };
    list.addEventListener('input', onEdit);
    list.addEventListener('change', onEdit);

    const runActions = (e) => {
        for (const a of actions) {
            if ((a.on || 'click') !== e.type) continue;
            const el = e.target.closest(a.selector);
            if (!el || !list.contains(el)) continue;
            const hit = rowFor(el);
            if (hit) a.run(hit.row, e, el);
            return true;
        }
        return false;
    };
    list.addEventListener('change', runActions);
    list.addEventListener('click', (e) => {
        if (runActions(e)) return;
        if (!getList || !e.target.closest('.remove-btn')) return;
        const hit = rowFor(e.target);
        if (!hit) return;
        const { row } = hit;
        // getList reads the live array: data can be replaced before Undo.
        deleteWithUndo({
            getList: () => getList(row), id: row.item.id,
            onChange: () => { render(); onRemove?.(); },
        });
    });

    filtersEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-chip');
        if (!btn) return;
        setFilter(btn.dataset.filter);
        render();
        filtersEl.querySelector(`[data-filter="${CSS.escape(btn.dataset.filter)}"]`)?.focus();
    });

    // ---- quick-add -----------------------------------------------------------
    const renderPreview = () => {
        const parsed = quickAdd.parse(qaInput.value);
        if (preview) {
            const { state, content } = quickAdd.preview(parsed);
            preview.dataset.state = state;
            if (Array.isArray(content)) preview.replaceChildren(...content);
            else preview.textContent = content;
        }
        return parsed;
    };
    if (quickAdd && qaInput) {
        qaInput.addEventListener('input', renderPreview);
        qaInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            if (quickAdd.onSubmit(renderPreview())) {
                qaInput.value = '';
                renderPreview();
            }
        });
        renderPreview();
    }

    return { render, renderFooter, getFilter, setFilter, ensureVisible, reveal, rowElement };
}
