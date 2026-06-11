# Refactor Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all identified duplication and structural debt: split the 3,200-line `budget_calculator.html` into focused ES modules, consolidate the seven currency formatters / three row builders / two performance renderers / triple-declared debt bindings, make `switchTab` data-driven, split `calculations.js` into domain modules behind a barrel, replace the Tailwind CDN with a static build, and convert the RA list to event delegation — all with **zero behaviour change**.

**Architecture:** Work in four phases, each leaving the app fully working and committed. Phase 1 extracts the inline script verbatim to `src/app.js` and removes duplication in place (shared `format.js`, `rows.js`, `perf-panel.js`). Phase 2 splits `app.js` into per-tab controllers under `src/app/` wired by `main.js` using callback injection (no import cycles). Phase 3 splits `calculations.js` into `src/calc/*` modules re-exported from `calculations.js` so the test suite and all imports stay untouched. Phase 4 replaces the Tailwind CDN script with a committed static CSS build.

**Tech Stack:** Vanilla ES modules (no bundler — served directly by `src/server.py`), Vitest (+ `happy-dom` for DOM unit tests), Tailwind CSS v3 standalone build, ApexCharts (unchanged).

**Hard rules for the executor:**
- All work on the `dev` branch. Never commit to `main`.
- NEVER touch `/Users/sanderwiersma/Documents/budget_backups/` and never change the backup logic in `src/server.py`.
- NEVER POST to `/api/save/budget`, `/api/save/investments`, `/api/save/debt` during verification. Verification is `npm test`, `node --check`, and GET requests only.
- This is a refactor: **behaviour must not change**. The one accepted pixel-level exception is noted in Task 8 (RA zero-state font weight).
- The line numbers below refer to `src/budget_calculator.html` as of commit `cb3cfef` + the uncommitted styling pass (Task 0 commits it). After Task 1, the same code lives in `src/app.js`; find functions by name, not line number.

**Standard verification gate** (run after every task; referred to as "GATE" below):

```bash
npm test                                  # expect: all tests pass, 0 failures
node --check src/app.js 2>/dev/null || true   # only while src/app.js exists
for f in src/app/*.js src/calc/*.js src/format.js; do [ -f "$f" ] && node --check "$f"; done
curl -s http://localhost:8000/src/budget_calculator.html -o /dev/null -w "%{http_code}\n"   # expect: 200
```

(Server runs via `make start`. If curl returns 000 the sandbox is blocking localhost — run the curl unsandboxed.)

**Manual checkpoint** (end of each phase; needs the user/browser): load the page, click all six tabs, type into one input per tab, confirm the console is clean and numbers match the pre-refactor page.

---

## Phase 1 — Extract script + kill duplication in place

### Task 0: Commit the pending styling work

**Files:**
- Modify: nothing — commit only.

- [ ] **Step 1: Confirm only the styling pass is pending**

Run: `git status --porcelain -- src/`
Expected: ` M src/budget_calculator.html` and nothing else under `src/`.

- [ ] **Step 2: Run the GATE** (all tests pass, page 200)

- [ ] **Step 3: Commit**

```bash
git add src/budget_calculator.html
git commit -m "style(ui): design-system refresh — cards, inputs, buttons, header, tabs, svg sprite"
```

### Task 1: Move the inline script verbatim to `src/app.js`

**Files:**
- Create: `src/app.js`
- Modify: `src/budget_calculator.html` (lines ~1150–3192: the `<script type="module">…</script>` block)

- [ ] **Step 1: Extract the script body**

Copy everything **between** `<script type="module">` and `</script>` (the imports, the `document.addEventListener('DOMContentLoaded', …)` wrapper, everything) into a new file `src/app.js`, completely unchanged. Do not reformat, do not de-indent.

- [ ] **Step 2: Point the HTML at the new file**

Replace the whole block in `src/budget_calculator.html`:

```html
    <script type="module" src="app.js"></script>
```

(`app.js` sits next to the HTML, so its `./calculations.js`, `./chart_budget_timeline.js`, `./chart_retirement.js` imports keep resolving.)

- [ ] **Step 3: Syntax-check the new file**

Run: `node --check src/app.js`
Expected: no output, exit 0.

- [ ] **Step 4: Run the GATE**

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/budget_calculator.html
git commit -m "refactor(app): extract inline script verbatim to src/app.js"
```

### Task 2: Shared currency formatters in `src/format.js`

Replaces: `formatCurrency`, `raFmtZAR` (identical pair) → `fmtZAR`; `raFmtZARShort`, `retFmtZAR` (identical pair) → `fmtZARWhole`; `retFmtZARSign` → `fmtZARSigned`; `formatRand` in **both** chart files → `fmtZARAxis`. The history tab's local `fmt` (NBSP + em-dash for zero) is a table-specific display rule and stays where it is.

**Files:**
- Create: `src/format.js`
- Create: `tests/format.test.js`
- Modify: `src/app.js`, `src/chart_budget_timeline.js`, `src/chart_retirement.js`

- [ ] **Step 1: Write the failing tests**

`tests/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { fmtZAR, fmtZARWhole, fmtZARSigned, fmtZARAxis } from '../src/format.js';

// Expectations are built from toLocaleString so the tests are robust to the
// ICU grouping character; what they lock down is the wrapper logic
// (prefix, rounding, sign handling, fallback-to-zero).
const grouped = (n, dp = 0) =>
    n.toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });

describe('fmtZAR (two decimals)', () => {
    it('formats a number', () => expect(fmtZAR(1234.5)).toBe(`R ${grouped(1234.5, 2)}`));
    it('accepts numeric strings', () => expect(fmtZAR('99.9')).toBe(`R ${grouped(99.9, 2)}`));
    it('falls back to zero for garbage', () => expect(fmtZAR('abc')).toBe(`R ${grouped(0, 2)}`));
    it('falls back to zero for empty', () => expect(fmtZAR('')).toBe(`R ${grouped(0, 2)}`));
});

describe('fmtZARWhole (rounded rand)', () => {
    it('rounds to whole rand', () => expect(fmtZARWhole(1234.6)).toBe(`R ${grouped(1235)}`));
    it('keeps the native minus inside the number', () =>
        expect(fmtZARWhole(-1234.6)).toBe(`R ${grouped(-1235)}`));
    it('falls back to zero', () => expect(fmtZARWhole(undefined)).toBe(`R ${grouped(0)}`));
});

describe('fmtZARSigned (leading minus)', () => {
    it('positive has no sign', () => expect(fmtZARSigned(1234.6)).toBe(`R ${grouped(1235)}`));
    it('negative puts the minus before the R', () =>
        expect(fmtZARSigned(-1234.6)).toBe(`-R ${grouped(1235)}`));
});

describe('fmtZARAxis (chart axes, space-grouped)', () => {
    it('normalises group separators to plain spaces', () =>
        expect(fmtZARAxis(1234567)).toBe('R ' + grouped(1234567).replace(/,/g, ' ')));
    it('falls back to zero', () => expect(fmtZARAxis(null)).toBe('R ' + grouped(0)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/format.test.js`
Expected: FAIL — `Cannot find module '../src/format.js'`

- [ ] **Step 3: Implement `src/format.js`**

Each function is byte-identical to the implementation it replaces:

```js
// Shared ZAR currency formatters. One module, four canonical shapes.

// Two-decimal rand: used everywhere a cent-precise amount is displayed.
export const fmtZAR = (value) => {
    const num = parseFloat(value) || 0;
    return `R ${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Whole rand, rounded. Negative numbers keep the locale's own minus ("R -1 235").
export const fmtZARWhole = (n) => 'R ' + Math.round(Number(n) || 0).toLocaleString('en-ZA');

// Whole rand with the minus hoisted in front of the R ("-R 1 235").
export const fmtZARSigned = (n) => {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    return sign + 'R ' + Math.abs(v).toLocaleString('en-ZA');
};

// Chart axis/tooltip labels: group separators normalised to plain spaces.
export const fmtZARAxis = (value) => {
    const n = Math.round(parseFloat(value) || 0);
    return 'R ' + n.toLocaleString('en-ZA').replace(/,/g, ' ');
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/format.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Replace the duplicates in `src/app.js`**

Add to the import block at the top of `src/app.js`:

```js
import { fmtZAR, fmtZARWhole, fmtZARSigned } from './format.js';
```

Then, inside the file:
1. Delete the declarations of `formatCurrency`, `raFmtZAR`, `raFmtZARShort`, `retFmtZAR`, `retFmtZARSign` and replace them with aliases **at the same spots** so every call site keeps working unchanged:

```js
const formatCurrency = fmtZAR;          // where formatCurrency was declared
const raFmtZAR = fmtZAR;                // where raFmtZAR was declared
const raFmtZARShort = fmtZARWhole;      // where raFmtZARShort was declared
const retFmtZAR = fmtZARWhole;          // where retFmtZAR was declared
const retFmtZARSign = fmtZARSigned;     // where retFmtZARSign was declared
```

(Aliasing instead of find-replacing ~150 call sites keeps this diff tiny and reviewable; the aliases collapse naturally in Phase 2 when each tab module imports what it needs.)

- [ ] **Step 6: Replace `formatRand` in both chart files**

In `src/chart_budget_timeline.js` and `src/chart_retirement.js`: delete the local `formatRand` function and add at the top of each file:

```js
import { fmtZARAxis as formatRand } from './format.js';
```

- [ ] **Step 7: Run the GATE** (note: chart tests exercise `chart_budget_timeline.js`, so a broken import fails loudly here)

- [ ] **Step 8: Commit**

```bash
git add src/format.js tests/format.test.js src/app.js src/chart_budget_timeline.js src/chart_retirement.js
git commit -m "refactor(format): consolidate seven currency formatters into src/format.js"
```

### Task 3: Single `DEBT_INPUT_BINDINGS` constant

The same 8-entry `[configKey, inputElement]` array is declared three times in `src/app.js` (as `_debtInputBindings` and twice as `_debtKeys` — inside `loadDebtCSVFromServer` and inside the `loadDebtCsvBtn` click handler).

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Hoist one constant**

In the `// --- DEBT CALCULATOR LOGIC ---` section, directly after the eight `debt*Input` element lookups, declare:

```js
const DEBT_INPUT_BINDINGS = [
    ['principal',       debtAmountInput],
    ['current_balance', debtCurrentBalanceInput],
    ['repayment',       debtRepaymentInput],
    ['service_fee',     debtServiceFeeInput],
    ['interest_rate',   debtInterestRateInput],
    ['next_payment',    debtNextPaymentInput],
    ['loan_start',      debtLoanStartInput],
    ['original_term',   debtOriginalTermInput],
];
```

- [ ] **Step 2: Delete the three local copies**

- Delete the `const _debtInputBindings = […]` declaration and change its `forEach` to `DEBT_INPUT_BINDINGS.forEach(…)`.
- In `loadDebtCSVFromServer`: delete `const _debtKeys = […]` and change `_debtKeys.forEach(…)` to `DEBT_INPUT_BINDINGS.forEach(…)`.
- In the `loadDebtCsvBtn` click handler: same — delete the local `_debtKeys`, use `DEBT_INPUT_BINDINGS` in **both** of its `forEach` loops.

- [ ] **Step 3: Verify no stragglers**

Run: `grep -n "_debtKeys\|_debtInputBindings" src/app.js`
Expected: no matches.

- [ ] **Step 4: Run the GATE**

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "refactor(debt): single DEBT_INPUT_BINDINGS constant instead of three copies"
```

### Task 4: Data-driven `switchTab`

**Files:**
- Modify: `src/app.js` (the `--- TAB NAVIGATION ---` section)

- [ ] **Step 1: Replace the six-branch if/else with a map**

Keep the twelve `getElementById` lookups, then replace the `switchTab` function **and** the six `tabX.addEventListener('click', …)` lines with:

```js
// onShow thunks are evaluated at click time, so they may reference render
// functions defined later in this file.
const TABS = {
    budget:     { tab: tabBudget,     content: contentBudget },
    investment: { tab: tabInvestment, content: contentInvestment },
    debt:       { tab: tabDebt,       content: contentDebt },
    ra:         { tab: tabRa,         content: contentRa,         onShow: () => renderRa() },
    retirement: { tab: tabRetirement, content: contentRetirement, onShow: () => renderRetirement() },
    history:    { tab: tabHistory,    content: contentHistory,    onShow: () => renderHistory() },
};

const switchTab = (name) => {
    Object.values(TABS).forEach(({ tab, content }) => {
        tab.classList.remove('border-indigo-500', 'text-indigo-600');
        tab.classList.add('border-transparent', 'text-slate-500');
        content.classList.add('hidden');
    });
    const target = TABS[name];
    target.tab.classList.add('border-indigo-500', 'text-indigo-600');
    target.tab.classList.remove('border-transparent', 'text-slate-500');
    target.content.classList.remove('hidden');
    if (target.onShow) target.onShow();
};

Object.entries(TABS).forEach(([name, { tab }]) =>
    tab.addEventListener('click', () => switchTab(name)));
```

The five `refresh-*` button handlers below it stay exactly as they are (they call `switchTab('…')` plus their render functions).

- [ ] **Step 2: Run the GATE**

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "refactor(tabs): data-driven switchTab via TABS map"
```

### Task 5: Shared row builder, sort comparator, and empty state — `src/app/rows.js`

Replaces: `createGenericItem` (budget), `createTransactionItem` (investments), the inline row builder in `renderRepayments` (debt), the two identical date-desc sort comparators, the duplicated empty-state markup, and `generateId` (declared in the budget section but used by all tabs).

**Files:**
- Create: `src/app/rows.js`
- Create: `tests/rows.test.js`
- Modify: `src/app.js`, `package.json` (add `happy-dom`)

- [ ] **Step 1: Add the DOM test environment**

Run: `npm install --save-dev happy-dom`
Expected: exits 0; `happy-dom` appears in `package.json` devDependencies.

- [ ] **Step 2: Write the failing tests**

`tests/rows.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rows.test.js`
Expected: FAIL — `Cannot find module '../src/app/rows.js'`

- [ ] **Step 4: Implement `src/app/rows.js`**

Every class string below is copied verbatim from the three builders it replaces — the `description-input` / `amount-input` / `date-input` / `crypto-value-input` / `type-input` / `remove-btn` class names are load-bearing (event delegation matches on them).

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/rows.test.js`
Expected: PASS.

- [ ] **Step 6: Use it in `src/app.js`**

Add to the import block:

```js
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from './app/rows.js';
```

Then:
1. Delete the local `const generateId = …` declaration (budget section).
2. Delete `createGenericItem` and replace the three thin wrappers:

```js
const createDebtItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr auto', fields: ['description', 'amount'] });
const createProvisionItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });
const createFutureCostItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 1fr 1fr auto', fields: ['description', 'amount', 'date'] });
```

3. Replace the whole body of `createTransactionItem` with:

```js
const createTransactionItem = (item) => createRowElement(item, {
    gridTemplateColumns: '1fr 2fr 1fr 0.8fr 1fr auto',
    fields: ['date', 'description', 'amount', 'cryptoValue', { select: ['Discretionary', 'TFSA', 'Crypto'] }],
    compact: true,
});
```

4. In `renderTransactions`: replace the inline comparator with `…].sort(sortByDateThenIdDesc)` and the empty-state innerHTML with `transactionList.innerHTML = emptyStateHTML('No transactions added yet.');`
5. In `renderRepayments`: replace the inline comparator with `sortByDateThenIdDesc`, the empty-state with `emptyStateHTML('No extra repayments added.')`, and the whole per-item DOM-building block with:

```js
sorted.forEach(item => {
    repaymentList.appendChild(createRowElement(item, {
        gridTemplateColumns: '1fr 2fr 1fr auto',
        fields: ['date', 'description', 'amount'],
        compact: true,
    }));
});
```

6. In `renderList` (budget): replace the empty-state innerHTML with `emptyStateHTML('No items added yet.')`.

- [ ] **Step 7: Run the GATE**

- [ ] **Step 8: Commit**

```bash
git add src/app/rows.js tests/rows.test.js src/app.js package.json package-lock.json
git commit -m "refactor(rows): one row builder, sort comparator, and empty state for all lists"
```

### Task 6: Shared performance renderer — `src/app/perf-panel.js`

Replaces the duplicated gain/annualized/net-vs-savings display logic in `updateRaPerformanceDisplay` (RA) and `calculatePerformance` (investments). **One deliberate harmonization:** in the RA zero-state, "Net vs savings" was `font-medium text-slate-800` while investments used `font-bold text-slate-800`; the shared renderer uses `font-bold` for both (visible only when a panel has zero transactions).

**Files:**
- Create: `src/app/perf-panel.js`
- Create: `tests/perf-panel.test.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the failing tests**

`tests/perf-panel.test.js`:

```js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderPerformancePanel } from '../src/app/perf-panel.js';
import { fmtZAR } from '../src/format.js';

const makeEls = () => {
    const el = () => document.createElement('div');
    return { invested: el(), gain: el(), ann: el(), money: el(),
             savingsGain: el(), netVsSavings: el(), tax: el(), netAfterTax: el() };
};

describe('renderPerformancePanel', () => {
    let els;
    beforeEach(() => { els = makeEls(); });

    it('renders the zero state when nothing is invested', () => {
        renderPerformancePanel({ totalInvested: 0 }, els, { fmt: fmtZAR });
        expect(els.gain.textContent).toBe('0.00%');
        expect(els.gain.className).toBe('font-bold text-slate-800');
        expect(els.netVsSavings.className).toBe('font-bold text-slate-800');
        expect(els.tax.textContent).toBe('R 0.00');
    });

    it('mutes net-vs-savings when mutedNet is set (discretionary)', () => {
        renderPerformancePanel({ totalInvested: 0 }, els, { fmt: fmtZAR, mutedNet: true });
        expect(els.netVsSavings.className).toBe('font-medium text-slate-400');
    });

    it('renders positive returns in green with a leading plus', () => {
        renderPerformancePanel({
            totalInvested: 100, percentageReturn: 10, absoluteReturn: 10,
            annualizedReturn: 12.5, savingsGain: 6, netVsSavings: 4,
            estimatedTax: 0, netVsSavingsAfterTax: 4,
        }, els, { fmt: fmtZAR });
        expect(els.gain.textContent).toBe('+10.00%');
        expect(els.gain.className).toBe('font-bold text-green-600');
        expect(els.ann.textContent).toBe('+12.50%');
        expect(els.netVsSavings.className).toBe('font-bold text-green-600');
        expect(els.savingsGain.textContent.startsWith('+')).toBe(true);
    });

    it('renders negative returns in red and N/A annualized in slate', () => {
        renderPerformancePanel({
            totalInvested: 100, percentageReturn: -5, absoluteReturn: -5,
            annualizedReturn: null, savingsGain: 6, netVsSavings: -11,
            estimatedTax: 2, netVsSavingsAfterTax: -13,
        }, els, { fmt: fmtZAR });
        expect(els.gain.className).toBe('font-bold text-red-600');
        expect(els.ann.textContent).toBe('N/A');
        expect(els.ann.className).toBe('font-bold text-slate-400');
        expect(els.netVsSavings.className).toBe('font-bold text-red-500');
        expect(els.tax.textContent).toBe(`-${fmtZAR(2)}`);
    });

    it('tolerates absent optional elements', () => {
        expect(() => renderPerformancePanel({ totalInvested: 0 },
            { gain: document.createElement('div') }, { fmt: fmtZAR })).not.toThrow();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/perf-panel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/perf-panel.js`**

```js
// Shared renderer for the gain/loss performance panels (Investments + RA tabs).
// All class strings are the exact strings the two previous implementations set.
//
// r:   result object from calculateInvestmentPerformance
// els: { invested?, gain, ann?, money?, savingsGain?, netVsSavings?, tax?, netAfterTax? }
// opts.mutedNet: discretionary panel mutes "net vs savings" (pre-tax line is
//                informational there; the after-tax line is the bold one).
// opts.fmt:      currency formatter (fmtZAR).
export function renderPerformancePanel(r, els, { mutedNet = false, fmt }) {
    if (els.invested) els.invested.textContent = fmt(r.totalInvested);

    if (r.totalInvested === 0) {
        els.gain.textContent = '0.00%';
        els.gain.className = 'font-bold text-slate-800';
        if (els.ann) { els.ann.textContent = '0.00%'; els.ann.className = 'font-bold text-slate-800'; }
        if (els.money) { els.money.textContent = 'R 0.00'; els.money.className = 'font-bold text-slate-800'; }
        if (els.savingsGain) els.savingsGain.textContent = 'R 0.00';
        if (els.netVsSavings) {
            els.netVsSavings.textContent = 'R 0.00';
            els.netVsSavings.className = mutedNet ? 'font-medium text-slate-400' : 'font-bold text-slate-800';
        }
        if (els.tax) { els.tax.textContent = 'R 0.00'; els.tax.className = 'font-medium text-red-500'; }
        if (els.netAfterTax) { els.netAfterTax.textContent = 'R 0.00'; els.netAfterTax.className = 'font-bold text-slate-800'; }
        return;
    }

    els.gain.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
    els.gain.className = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

    if (els.money) {
        els.money.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${fmt(r.absoluteReturn)}`;
        els.money.className = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
    }

    if (els.savingsGain) els.savingsGain.textContent = `+${fmt(r.savingsGain)}`;

    if (els.netVsSavings) {
        els.netVsSavings.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${fmt(r.netVsSavings)}`;
        els.netVsSavings.className = mutedNet
            ? 'font-medium text-slate-400'
            : `font-bold ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;
    }

    if (els.tax) {
        els.tax.textContent = r.estimatedTax > 0 ? `-${fmt(r.estimatedTax)}` : 'R 0.00';
        els.tax.className = 'font-medium text-red-500';
    }
    if (els.netAfterTax) {
        els.netAfterTax.textContent = `${r.netVsSavingsAfterTax >= 0 ? '+' : ''}${fmt(r.netVsSavingsAfterTax)}`;
        els.netAfterTax.className = `font-bold ${r.netVsSavingsAfterTax >= 0 ? 'text-green-600' : 'text-red-500'}`;
    }

    if (r.annualizedReturn === null) {
        if (els.ann) { els.ann.textContent = 'N/A'; els.ann.className = 'font-bold text-slate-400'; }
    } else if (els.ann) {
        els.ann.textContent = `${r.annualizedReturn >= 0 ? '+' : ''}${r.annualizedReturn.toFixed(2)}%`;
        els.ann.className = `font-bold ${r.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/perf-panel.test.js`
Expected: PASS.

- [ ] **Step 5: Use it in `src/app.js`**

Add the import:

```js
import { renderPerformancePanel } from './app/perf-panel.js';
```

Rewrite `updateRaPerformanceDisplay` to:

```js
function updateRaPerformanceDisplay() {
    const cv = (raCurrentValue !== undefined && raCurrentValue !== null && raCurrentValue !== '')
        ? Number(raCurrentValue) || 0
        : 0;
    const r = _calculateInvestmentPerformance(raTransactions, cv, new Date(), 0);
    renderPerformancePanel(r, {
        invested:     document.getElementById('ra-invested'),
        gain:         document.getElementById('ra-gain'),
        ann:          document.getElementById('ra-ann'),
        money:        document.getElementById('ra-gain-money'),
        savingsGain:  document.getElementById('ra-savings-gain'),
        netVsSavings: document.getElementById('ra-net-savings'),
    }, { fmt: fmtZAR });
}
```

Rewrite `calculatePerformance` to:

```js
const calculatePerformance = (type, currentValueStr, invId, gainId, annId, moneyGainId) => {
    const currentValue = parseFloat(currentValueStr) || 0;
    const txs = investmentData.transactions.filter(t => t.type === type);

    const rate = (type === 'Discretionary') ? (parseFloat(investmentData.marginalRate) || 0) : 0;
    const r = _calculateInvestmentPerformance(txs, currentValue, new Date(), rate);

    if (type === 'Crypto') {
        const cryptoValEl = document.getElementById('total-crypto-value');
        if (cryptoValEl) cryptoValEl.textContent = r.totalCryptoValue.toFixed(8);
    }

    const typeKey = type.toLowerCase();
    const gainEl = document.getElementById(gainId);
    if (!gainEl) return;

    renderPerformancePanel(r, {
        invested:     document.getElementById(invId),
        gain:         gainEl,
        ann:          document.getElementById(annId),
        money:        document.getElementById(moneyGainId),
        savingsGain:  document.getElementById(`savings-gain-${typeKey}`),
        netVsSavings: document.getElementById(`net-savings-${typeKey}`),
        tax:          document.getElementById(`tax-${typeKey}`),
        netAfterTax:  document.getElementById(`net-savings-after-tax-${typeKey}`),
    }, { fmt: fmtZAR, mutedNet: typeKey === 'discretionary' });
};
```

(Note: `invested` is rendered before the early `if (!gainEl) return` used to run in the old code; the reorder keeps it rendered in all real panels — every panel that exists in the DOM has both elements.)

- [ ] **Step 6: Run the GATE**

- [ ] **Step 7: Commit**

```bash
git add src/app/perf-panel.js tests/perf-panel.test.js src/app.js
git commit -m "refactor(perf): shared renderPerformancePanel for investments and RA"
```

### Task 7: RA list — event delegation instead of per-row listeners

Makes the RA list use the same delegation pattern as budget/investments/debt: two container-level listeners wired **once**, rows built by `createRowElement`. Semantics preserved: edits react on `change` (not `input`), date/amount changes re-render, description changes only persist.

**Files:**
- Modify: `src/app.js` (the `renderRa` list block and just below it)

- [ ] **Step 1: Replace the row rendering inside `renderRa`**

Replace the `list.innerHTML = sortedDesc.map(t => …).join('')` template **and** the entire `list.querySelectorAll('[data-id]').forEach(…)` listener-wiring block with:

```js
const list = document.getElementById('ra-list');
const sortedDesc = [...raTransactions].sort((a, b) => b.date.localeCompare(a.date));
list.innerHTML = '';
sortedDesc.forEach(t => {
    list.appendChild(createRowElement(t, {
        gridTemplateColumns: '1fr 2fr 1fr auto',
        fields: ['date', 'description', 'amount'],
        compact: true,
    }));
});
```

Note the RA-specific sort (`date.localeCompare` only, no id tie-break) is kept as-is, and the rows pick up the standard `bg-slate-50`-free grid look of the other lists plus the shared field classes (`date-input` / `description-input` / `amount-input` / `remove-btn`) instead of `ra-row-*`.

- [ ] **Step 2: Wire delegated listeners once (outside `renderRa`)**

Directly after the `renderRa` function definition, add:

```js
const raList = document.getElementById('ra-list');
raList.addEventListener('change', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const tx = raTransactions.find(t => t.id === row.dataset.id);
    if (!tx) return;
    if (e.target.classList.contains('date-input')) {
        tx.date = e.target.value; raPersist(); renderRa();
    } else if (e.target.classList.contains('description-input')) {
        tx.description = e.target.value; raPersist();
    } else if (e.target.classList.contains('amount-input')) {
        tx.amount = parseFloat(e.target.value) || 0; raPersist(); renderRa();
    }
});
raList.addEventListener('click', (e) => {
    if (!e.target.closest('.remove-btn')) return;
    const row = e.target.closest('[data-id]');
    if (!row) return;
    raTransactions = raTransactions.filter(t => t.id !== row.dataset.id);
    raPersist();
    renderRa();
});
```

- [ ] **Step 3: Verify no orphaned selectors**

Run: `grep -n "ra-row-" src/app.js src/budget_calculator.html`
Expected: no matches.

- [ ] **Step 4: Run the GATE**

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "refactor(ra): delegated list events + shared row builder, drop per-render listeners"
```

### Task 8: Dead-comment and fallback-data cleanup

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Clean `loadDebtCSVFromServer`**

In the `else` branch (CSV not found), delete the five leftover prompt-engineering comment lines (`// Initialize with default extra repayments from prompt if file not found?` through `// I will add them to the initial state if no CSV is found.`) and hoist the literal array: directly after `DEBT_INPUT_BINDINGS` declare

```js
// Seed data shown only when db/transactions/debt.csv does not exist yet.
const defaultDebtRepayments = () => [
    { id: generateId(), date: '2025-11-25', description: 'Extra Repayment', amount: 9500 },
    { id: generateId(), date: '2025-10-25', description: 'Extra Repayment', amount: 8600 },
    { id: generateId(), date: '2025-09-05', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-07-25', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-07-01', description: 'Extra Repayment', amount: 4000 },
    { id: generateId(), date: '2025-05-31', description: 'Extra Repayment', amount: 4000 },
];
```

and in the `else` branch use `debtData.repayments = defaultDebtRepayments();`.

- [ ] **Step 2: Remove the dead line in the init IIFE**

Delete `// initializeEmptyState(); // Already empty by default` (the function never existed).

- [ ] **Step 3: Run the GATE**

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "chore(app): remove prompt-leftover comments, hoist debt seed data"
```

> **Manual checkpoint — end of Phase 1.** Browser-check all six tabs against the pre-refactor page before continuing.

---

## Phase 2 — Split `app.js` into per-tab modules

Target layout (each task moves one cohesive block **verbatim** unless stated; module top-level code is safe because `type="module"` scripts execute after the DOM is parsed, so the `DOMContentLoaded` wrapper is dropped at the end):

```
src/app/
  persistence.js   Task 9    test mode, dbPath, save helpers, config layer
  budget.js        Task 10   budget tab + timeline chart wiring
  investments.js   Task 11   investment tab
  debt.js          Task 12   debt tab
  ra.js            Task 13   RA tab
  history.js       Task 14   history tab
  retirement.js    Task 15   retirement tab
  main.js          Task 16   tabs, test-mode button, init sequence (replaces app.js)
```

Cross-tab dependencies are one-directional by design:
- `retirement.js` imports `getInvestmentData()` from investments and `getRaState()` from ra.
- `history.js` imports `getInvestmentData()` and `getDebtData()`.
- investments/ra must *trigger* a retirement re-render without importing it (would be a cycle): each exports a `setOnStateChanged(fn)` setter; `main.js` wires it to `renderRetirement`.

### Task 9: `src/app/persistence.js`

**Files:**
- Create: `src/app/persistence.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the bodies of `debouncedSave`, `saveToServer`, `loadConfigFromServer`, `persistConfig`, `setConfig` **verbatim** out of `app.js` into this shell (only the wrapping shown here is new — `testMode`/`configMap` become module-internal state behind accessors because module bindings can't be reassigned by importers):

```js
// Test-mode switching, server save helpers, and the shared config layer.
import { parseConfigJSON, generateConfigJSON } from '../calculations.js';

let testMode = false;
export const isTestMode = () => testMode;
export const setTestMode = (v) => { testMode = !!v; };

export const dbPath = (filename) => testMode ? `db/test/${filename}` : `db/${filename}`;
const saveKey = (name) => testMode ? `test_${name}` : name;

const _saveTimers = {};
export const debouncedSave = (name, csvFn, btnId, delayMs = 800) => { /* moved body */ };
export const saveToServer = async (name, csvFn, btnId) => { /* moved body */ };

// Single source of truth for every param-style value (config.public.json +
// config.private.json). Callers must always go through getConfigMap() —
// loadConfigFromServer replaces the object.
let configMap = {};
export const getConfigMap = () => configMap;
export const loadConfigFromServer = async () => { /* moved body */ };
export const persistConfig = () => { /* moved body */ };
export const setConfig = (key, value) => { /* moved body */ };
```

Inside the moved bodies make exactly these mechanical substitutions: `_parseConfigJSON` → `parseConfigJSON`, `_generateConfigJSON` → `generateConfigJSON` (the underscore aliases came from app.js's import names).

- [ ] **Step 2: Import it from `src/app.js`**

```js
import { isTestMode, setTestMode, dbPath, debouncedSave, saveToServer,
         getConfigMap, loadConfigFromServer, persistConfig, setConfig } from './app/persistence.js';
```

Delete the moved declarations from `app.js`. Then fix the remaining references inside `app.js`:
- every read of `configMap` becomes `getConfigMap()` (e.g. `getConfigMap().tax_refund_rate_pct`, `'budget_planned_monthly_savings' in getConfigMap()`, `delete getConfigMap().budget_planned_monthly_savings`, `getConfigMap()[k] = …`),
- `testMode = !testMode` in the test-mode button handler becomes `setTestMode(!isTestMode())`, and other `testMode` reads become `isTestMode()`.

Run: `grep -n "configMap\b" src/app.js | grep -v getConfigMap` — expected: no matches.

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/persistence.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/persistence.js src/app.js
git commit -m "refactor(app): extract persistence + config layer to app/persistence.js"
```

### Task 10: `src/app/budget.js`

**Files:**
- Create: `src/app/budget.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the entire `// --- BUDGET CALCULATOR LOGIC ---` section verbatim: `budgetData`, the 12 element lookups (`savingsInput` … `allocationResults`), `getUpcoming25th`, `renderBudget`, `renderList`, `createDebtItem`/`createProvisionItem`/`createFutureCostItem`, `currentMonthlySavingsTarget`, `calculateAndDisplaySummary`, `calculateMonthlyAllocation`, `handleListChange`, all budget event listeners, the planned-savings block (`plannedSavingsInput`, `plannedSavingsReset`, `persistPlannedSavings`, `applyPlannedSavingsFromConfig`), `parseBudgetCSV`, `generateBudgetCSV`, `loadBudgetCSVFromServer`, `saveBudgetCSV`, and the `saveCsvBtn` listener.

Module header and exports:

```js
// Budget tab: inputs, summary card, monthly allocation, timeline chart.
import {
    getUpcoming25th as _getUpcoming25th,
    calculateBudgetSummary as _calculateBudgetSummary,
    calculateMonthlyAllocation as _calcMonthlyAllocation,
    parseBudgetCSV as _parseBudgetCSV,
    generateBudgetCSV as _generateBudgetCSV,
} from '../calculations.js';
import { renderBudgetTimeline as _renderBudgetTimeline } from '../chart_budget_timeline.js';
import { fmtZAR as formatCurrency } from '../format.js';
import { createRowElement, emptyStateHTML, generateId } from './rows.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

/* …moved code, unchanged… */

export { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer, applyPlannedSavingsFromConfig };
```

- [ ] **Step 2: Update `src/app.js`**

```js
import { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer,
         applyPlannedSavingsFromConfig } from './app/budget.js';
```

Delete the moved section. The `refresh-budget` handler and init IIFE keep working via the imports. (The `formatCurrency` alias in app.js stays for now — investments/debt still use it until Tasks 11–12.)

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/budget.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/budget.js src/app.js
git commit -m "refactor(app): extract budget tab to app/budget.js"
```

### Task 11: `src/app/investments.js`

**Files:**
- Create: `src/app/investments.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the entire `// --- INVESTMENT TRACKER LOGIC ---` section verbatim (`investmentData`, element lookups, `updatePerformanceDisplay`, `updateTfsaCapDisplay`, `renderTransactions`, `renderFullInvestmentUI`, `createTransactionItem`, `calculatePerformance`, all listeners, `parseInvestmentCSV`/`generateInvestmentCSV`, `loadInvestmentCSVFromServer`, `saveInvestmentCSV`, both CSV button handlers).

Module header / exports / retirement notifier:

```js
// Investment tab: portfolio performance panels and the transaction list.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    parseInvestmentCSV as _parseInvestmentCSV,
    generateInvestmentCSV as _generateInvestmentCSV,
    tfsaLifetimeContributions as _tfsaLifetimeContributions,
} from '../calculations.js';
import { fmtZAR as formatCurrency, fmtZAR } from '../format.js';
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from './rows.js';
import { renderPerformancePanel } from './perf-panel.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

// main.js points this at renderRetirement (retirement reads live investment
// values; importing it here directly would create a module cycle).
let onStateChanged = () => {};
export const setOnStateChanged = (fn) => { onStateChanged = fn; };

/* …moved code, unchanged… */

export const getInvestmentData = () => investmentData;
export { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer };
```

(Full export list: `setOnStateChanged`, `getInvestmentData`, `renderFullInvestmentUI`, `updatePerformanceDisplay`, `loadInvestmentCSVFromServer`. The mutable `investmentData` object itself is never exported — consumers go through `getInvestmentData()`.)

In the moved code, replace the two `if (typeof renderRetirement === 'function') renderRetirement();` call sites in the current-value input handler with `onStateChanged();`.

- [ ] **Step 2: Update `src/app.js`**

```js
import { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer,
         getInvestmentData, setOnStateChanged as setInvestmentsChanged } from './app/investments.js';
```

Delete the moved section. References elsewhere in `app.js` (history + retirement, until they move) change from `investmentData` to `getInvestmentData()`. After the `renderRetirement` definition (still in app.js for now), add `setInvestmentsChanged(() => renderRetirement());`.

Run: `grep -n "investmentData" src/app.js | grep -v getInvestmentData` — expected: no matches.

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/investments.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/investments.js src/app.js
git commit -m "refactor(app): extract investment tab to app/investments.js"
```

### Task 12: `src/app/debt.js`

**Files:**
- Create: `src/app/debt.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the entire `// --- DEBT CALCULATOR LOGIC ---` section verbatim (`debtData`, element lookups, `DEBT_INPUT_BINDINGS`, `defaultDebtRepayments`, `calculateDebtProjection`, `renderRepayments`, listeners, CSV functions, `loadDebtCSVFromServer`, `saveDebtCSV`, button handlers). `getUpcoming25th` is budget-module-local, so import the raw calculation instead:

```js
// Debt tab: mortgage projection and extra repayments.
import {
    getUpcoming25th as _getUpcoming25th,
    monthlyInterestFactor as _monthlyInterestFactor,
    calculateDebtResults as _calculateDebtResults,
    xirr as _xirr,
    parseDebtCSV as _parseDebtCSV,
    generateDebtCSV as _generateDebtCSV,
} from '../calculations.js';
import { fmtZAR as formatCurrency } from '../format.js';
import { createRowElement, sortByDateThenIdDesc, emptyStateHTML, generateId } from './rows.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

const getUpcoming25th = () => _getUpcoming25th(new Date());

/* …moved code, unchanged… */

export const getDebtData = () => debtData;
export { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer };
```

- [ ] **Step 2: Update `src/app.js`**

```js
import { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer, getDebtData } from './app/debt.js';
```

Delete the moved section; in `renderHistory` (still in app.js) change `debtData.repayments` to `getDebtData().repayments`.

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/debt.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/debt.js src/app.js
git commit -m "refactor(app): extract debt tab to app/debt.js"
```

### Task 13: `src/app/ra.js`

**Files:**
- Create: `src/app/ra.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the entire `// --- RA STATE ---` section verbatim (`raTransactions`, `raCurrentValue`, `raParams`, `raMakeId`, `updateRaPerformanceDisplay`, `renderRa`, the delegated list listeners from Task 7, `raTodayIso`, the add/refund-rate/current-value handlers, `generateRaCSVFromState`, `raPersist`, save/load button handlers, the initial `renderRa()` call, `loadRaCSVFromServer`).

```js
// RA tab: contributions list, refund estimate, performance panel.
import {
    calculateInvestmentPerformance as _calculateInvestmentPerformance,
    taxYearLabel as _taxYearLabel,
    parseRaCSV as _parseRaCSV,
    generateRaTransactionsCSV as _generateRaTransactionsCSV,
} from '../calculations.js';
import { fmtZAR as raFmtZAR, fmtZARWhole as raFmtZARShort, fmtZAR } from '../format.js';
import { createRowElement } from './rows.js';
import { renderPerformancePanel } from './perf-panel.js';
import { dbPath, debouncedSave, saveToServer, getConfigMap, setConfig, persistConfig } from './persistence.js';

// main.js points this at renderRetirement (same cycle-avoidance as investments).
let onStateChanged = () => {};
export const setOnStateChanged = (fn) => { onStateChanged = fn; };

/* …moved code, unchanged… */

export const getRaState = () => ({ transactions: raTransactions, currentValue: raCurrentValue, params: raParams });
export { renderRa, loadRaCSVFromServer };
```

In the moved `ra-current-value` input handler, replace `if (typeof renderRetirement === 'function') renderRetirement();` with `onStateChanged();`.

- [ ] **Step 2: Update `src/app.js`**

```js
import { renderRa, loadRaCSVFromServer, getRaState,
         setOnStateChanged as setRaChanged } from './app/ra.js';
```

Delete the moved section. In the retirement section still in `app.js`, replace direct reads:
- `raCurrentValue` → `getRaState().currentValue` (in `retRaPotToday` / `retRaPotTodayIsActual`),
- `raTransactions` → `getRaState().transactions` (in `retRaPotToday` / `retRaAnnualLast12`),
- `raParams && raParams.nominal_return_pct` → `getRaState().params.nominal_return_pct`.

After the `renderRetirement` definition add `setRaChanged(() => renderRetirement());`.

Run: `grep -n "raTransactions\|raCurrentValue\|raParams" src/app.js` — expected: only matches inside `getRaState()` call expressions.

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/ra.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/ra.js src/app.js
git commit -m "refactor(app): extract RA tab to app/ra.js"
```

### Task 14: `src/app/history.js`

**Files:**
- Create: `src/app/history.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move `renderHistory` verbatim into:

```js
// History tab: per-year totals of debt repayments and investment contributions.
import { getInvestmentData } from './investments.js';
import { getDebtData } from './debt.js';

/* …moved renderHistory, with debtData.repayments → getDebtData().repayments
   and investmentData.transactions → getInvestmentData().transactions … */

export { renderHistory };
```

- [ ] **Step 2: Update `src/app.js`**

```js
import { renderHistory } from './app/history.js';
```

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/history.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/history.js src/app.js
git commit -m "refactor(app): extract history tab to app/history.js"
```

### Task 15: `src/app/retirement.js`

**Files:**
- Create: `src/app/retirement.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the module**

Move the entire `// --- RETIREMENT STATE ---` section verbatim (`retirementParams`, `retRaPotToday`, `retRaPotTodayIsActual`, `retRaAnnualLast12`, `retInputBindings`, `retApplyParamsToInputs`, `retReadInput`, `retPersist`, `retWireInputs`, `renderRetirement`, the trailing `retApplyParamsToInputs(); retWireInputs();` calls, and `loadRetirementFromConfig`).

```js
// Retirement tab: snapshot, projections, charts. Reads live state from the
// investments and RA modules; re-rendered by them via setOnStateChanged.
import {
    calculatePotValueToday as _calculatePotValueToday,
    RETIREMENT_CONSTANTS as _RET_CONSTS,
    getDefaultRetirementParams as _getDefaultRetirementParams,
    parseRetirementCSV as _parseRetirementCSV,
    calculateRetirementSnapshot as _calculateRetirementSnapshot,
    generateConfigJSON as _generateConfigJSON,
} from '../calculations.js';
import { renderRetirementCharts as _renderRetirementCharts } from '../chart_retirement.js';
import { fmtZARWhole as retFmtZAR, fmtZARSigned as retFmtZARSign } from '../format.js';
import { getConfigMap, persistConfig, saveToServer } from './persistence.js';
import { getInvestmentData } from './investments.js';
import { getRaState } from './ra.js';

/* …moved code, with investmentData → getInvestmentData() and the getRaState()
   substitutions already made in Tasks 11/13 carried along unchanged… */

export { renderRetirement, loadRetirementFromConfig };
```

- [ ] **Step 2: Update `src/app.js`**

```js
import { renderRetirement, loadRetirementFromConfig } from './app/retirement.js';
```

The two notifier lines move with their context: `setInvestmentsChanged(() => renderRetirement());` and `setRaChanged(() => renderRetirement());` now live in `app.js` right after the imports.

- [ ] **Step 3: Run the GATE** (plus `node --check src/app/retirement.js`)

- [ ] **Step 4: Commit**

```bash
git add src/app/retirement.js src/app.js
git commit -m "refactor(app): extract retirement tab to app/retirement.js"
```

### Task 16: `src/app/main.js` — bootstrap; delete `app.js`

**Files:**
- Create: `src/app/main.js`
- Delete: `src/app.js`
- Modify: `src/budget_calculator.html`

- [ ] **Step 1: Write `src/app/main.js`**

What remains in `app.js` is now only: imports, tab navigation, refresh buttons, notifier wiring, `updateTestModeUI`, the test-mode button handler, and the init IIFE — all inside the `DOMContentLoaded` wrapper. Create `src/app/main.js` with that content, **dropping the wrapper** (module scripts are deferred; the DOM is fully parsed before they run):

```js
// App bootstrap: tab navigation, test mode, and the load sequence.
import { renderBudget, calculateAndDisplaySummary, loadBudgetCSVFromServer,
         applyPlannedSavingsFromConfig } from './budget.js';
import { renderFullInvestmentUI, updatePerformanceDisplay, loadInvestmentCSVFromServer,
         setOnStateChanged as setInvestmentsChanged } from './investments.js';
import { calculateDebtProjection, renderRepayments, loadDebtCSVFromServer } from './debt.js';
import { renderRa, loadRaCSVFromServer, setOnStateChanged as setRaChanged } from './ra.js';
import { renderHistory } from './history.js';
import { renderRetirement, loadRetirementFromConfig } from './retirement.js';
import { isTestMode, setTestMode, loadConfigFromServer } from './persistence.js';

setInvestmentsChanged(() => renderRetirement());
setRaChanged(() => renderRetirement());

/* --- TAB NAVIGATION --- (moved verbatim from app.js: the twelve lookups,
   TABS map, switchTab, click wiring, five refresh-button handlers) */

/* --- TEST MODE --- (moved verbatim: updateTestModeUI + button handler,
   using isTestMode()/setTestMode()) */

/* --- INITIALIZATION --- (moved verbatim: the async IIFE) */
```

- [ ] **Step 2: Update the HTML and delete `app.js`**

In `src/budget_calculator.html`: `<script type="module" src="app/main.js"></script>`. Then `git rm src/app.js`.

- [ ] **Step 3: Check for leftovers**

Run: `for f in src/app/*.js; do node --check "$f"; done && grep -rn "app.js" src/budget_calculator.html`
Expected: syntax clean; only the `app/main.js` reference.

- [ ] **Step 4: Run the GATE**

- [ ] **Step 5: Commit**

```bash
git add src/app/main.js src/budget_calculator.html
git rm src/app.js
git commit -m "refactor(app): main.js bootstrap; inline monolith fully modularised"
```

> **Manual checkpoint — end of Phase 2.** Browser-check all six tabs, test-mode toggle, one debounced auto-save (watch the Network tab — test mode only!), and the two cross-tab live updates (investment current value → retirement; RA current value → retirement).

---

## Phase 3 — Split `calculations.js`

### Task 17: Domain modules under `src/calc/` with a barrel

`calculations.js` becomes a pure re-export barrel, so the 154-test suite, `tests/chart_budget_timeline.test.js`, and every `../calculations.js` import in `src/app/` keep working untouched. The 177 existing tests are the safety net for this move.

**Files:**
- Create: `src/calc/util.js`, `src/calc/config.js`, `src/calc/budget.js`, `src/calc/investment.js`, `src/calc/debt.js`, `src/calc/ra.js`, `src/calc/retirement.js`
- Modify: `src/calculations.js` (reduced to the barrel)

Function → file map (every top-level binding in today's `calculations.js`, by name):

| File | Bindings (moved verbatim) |
|---|---|
| `calc/util.js` | `_generateId` (exported as `generateRecordId`, see note), `xirr` |
| `calc/config.js` | `PUBLIC_PARAMS`, `parseConfigJSON`, `generateConfigJSON` |
| `calc/budget.js` | `getUpcoming25th`, `calculateBudgetSummary`, `calculateMonthlyAllocation`, `parseBudgetCSV`, `generateBudgetCSV` |
| `calc/investment.js` | `calculateInvestmentPerformance`, `parseInvestmentCSV`, `generateInvestmentCSV` |
| `calc/debt.js` | `monthlyInterestFactor`, `simulateDebt`, `calculateDebtResults`, `parseDebtCSV`, `generateDebtCSV` |
| `calc/ra.js` | `taxYearLabel`, `parseRaCSV`, `generateRaTransactionsCSV`, `deriveAssumedFutureMonthly`, `RA_ANNUAL_CAP`, `_isLeapYear`, `_taxYearEndDate`, `_monthsBetween`, `calculateRaProjection`, `calculatePotValueToday` |
| `calc/retirement.js` | `RETIREMENT_CONSTANTS`, `fvGrow`, `realValue`, `monthsToAge`, `lumpSumTax`, `_grow`, `raFutureValueTwoPot`, `tfsaLifetimeContributions`, `tfsaFutureValue`, `raCommutationLumpSum`, `raMonthlyIncome`, `projectLivingAnnuityDepletion`, `RETIREMENT_DEFAULT_PARAMS`, `getDefaultRetirementParams`, `parseRetirementCSV`, `calculateRetirementSnapshot` |

- [ ] **Step 1: Create the seven files**

Move each group verbatim. Then add cross-module imports where a moved function references a binding that landed in another file — find them mechanically:

```bash
for f in src/calc/*.js; do node --check "$f"; done
npx vitest run   # any missing import fails loudly here
```

Known cross-imports to add:
- `calc/budget.js`, `calc/investment.js`, `calc/debt.js`, `calc/ra.js`: `import { generateRecordId as _generateId } from './util.js';` (the CSV parsers mint row ids). In `calc/util.js` export it as `export const generateRecordId = () => …` keeping the body identical.
- `calc/retirement.js`: `import { taxYearLabel, deriveAssumedFutureMonthly } from './ra.js';` — add **only if** `npx vitest run` or `node --check` flags them as undefined in the moved code; same rule for any other helper the snapshot code references.

- [ ] **Step 2: Reduce `src/calculations.js` to the barrel**

```js
// Barrel: the public calculation API. Implementation lives in src/calc/*.
export * from './calc/util.js';
export * from './calc/config.js';
export * from './calc/budget.js';
export * from './calc/investment.js';
export * from './calc/debt.js';
export * from './calc/ra.js';
export * from './calc/retirement.js';
```

(`export *` skips each module's private `_`-prefixed helpers only if they aren't exported — so do **not** export `_isLeapYear`, `_taxYearEndDate`, `_monthsBetween`, `_grow`, `RA_ANNUAL_CAP`, `RETIREMENT_DEFAULT_PARAMS` from their new homes; keep them module-private exactly as they are today, unless a cross-module import in Step 1 forces an export.)

- [ ] **Step 3: Run the GATE** — all 177+ tests green proves export parity.

Also run: `grep -c "export" src/calculations.js` → expected `7`.

- [ ] **Step 4: Commit**

```bash
git add src/calc/ src/calculations.js
git commit -m "refactor(calc): split calculations.js into domain modules behind a barrel"
```

---

## Phase 4 — Tailwind static build + docs

### Task 18: Replace the Tailwind CDN with a committed static build

**Files:**
- Create: `tailwind.config.cjs`, `src/styles/tailwind.in.css`, `src/styles/app.css`
- Create (build artifact, committed): `src/styles/tailwind.css`
- Modify: `src/budget_calculator.html`, `package.json`, `Makefile`, `readme.md`

- [ ] **Step 1: Install Tailwind v3**

Run: `npm install --save-dev tailwindcss@3`
Expected: exits 0. (v3 matches the Play CDN's engine and preflight, so visual parity is by construction; all classes in this codebase are literal strings in `.html`/`.js`, so content scanning finds them.)

- [ ] **Step 2: Create `tailwind.config.cjs`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{html,js}'],
    theme: { extend: {} },
    plugins: [],
};
```

- [ ] **Step 3: Create the input CSS and move the custom styles**

`src/styles/tailwind.in.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/styles/app.css`: move the **entire contents** of the `<style>` block from `budget_calculator.html` here, unchanged.

- [ ] **Step 4: Add the build script and run it**

In `package.json` scripts: `"build:css": "tailwindcss -c tailwind.config.cjs -i src/styles/tailwind.in.css -o src/styles/tailwind.css --minify"`.

In the `Makefile` add (and mention in `.PHONY`):

```make
css:
	npm run build:css
```

Run: `npm run build:css`
Expected: `src/styles/tailwind.css` created; warning-free.

- [ ] **Step 5: Swap the HTML over**

In `src/budget_calculator.html` `<head>`: delete `<script src="https://cdn.tailwindcss.com"></script>` and the `<style>…</style>` block; add **after** the fonts link:

```html
    <link rel="stylesheet" href="styles/tailwind.css">
    <link rel="stylesheet" href="styles/app.css">
```

- [ ] **Step 6: Sanity-check coverage**

```bash
grep -c "cdn.tailwindcss" src/budget_calculator.html        # expected: 0
grep -o "tabular-nums\|border-dashed\|rounded-2xl" src/styles/tailwind.css | sort -u   # expected: all three present
```

- [ ] **Step 7: Run the GATE**, then **manual checkpoint**: side-by-side the page against the previous commit (checkout `HEAD~1` in a second worktree if needed) — layout and colors must be identical, and first paint no longer flashes unstyled.

- [ ] **Step 8: Document the build step**

In `readme.md`, add under setup: "Styling is a static Tailwind build. After changing any Tailwind class in `src/**`, run `npm run build:css` (or `make css`) and commit the regenerated `src/styles/tailwind.css`."

- [ ] **Step 9: Commit**

```bash
git add tailwind.config.cjs src/styles/ src/budget_calculator.html package.json package-lock.json Makefile readme.md
git commit -m "build(css): replace Tailwind CDN with committed static v3 build"
```

### Task 19: Final verification + spec-doc touch-up

**Files:**
- Modify: `docs/specs/functional-requirements.md` (one paragraph)

- [ ] **Step 1: Full sweep**

```bash
npm test                                          # all suites green
for f in src/app/*.js src/calc/*.js src/format.js src/calculations.js; do node --check "$f"; done
curl -s http://localhost:8000/src/budget_calculator.html -o /dev/null -w "%{http_code}\n"   # 200
grep -rn "TODO\|FIXME\|from prompt" src/app/ src/calc/ | grep -v node_modules               # expected: empty
```

- [ ] **Step 2: Note the architecture in the functional spec**

Behaviour is unchanged, so requirements stay as-is; add a short "Implementation layout" note to `docs/specs/functional-requirements.md` describing the module map (`src/app/*` per-tab controllers, `src/calc/*` domain calculations behind the `calculations.js` barrel, static Tailwind build via `npm run build:css`), so the docs match the codebase layout going forward.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/functional-requirements.md
git commit -m "docs(specs): document module layout after refactor consolidation"
```

- [ ] **Step 4: Stop.** Do **not** merge to `main` — per project workflow the user must explicitly approve the merge after their own browser check.

---

## Self-review notes

- **Coverage:** every finding from the review maps to a task — formatters (T2), debt bindings (T3), switchTab (T4), row builders + comparators + empty states (T5), perf renderers (T6), RA delegation (T7), leftover comments/seed data (T8), monolith split (T1, T9–T16), calculations split (T17), Tailwind CDN (T18).
- **Ordering rationale:** dedup (T2–T8) lands before the module split so the moved code is already small and shared modules (`format.js`, `rows.js`, `perf-panel.js`) have no transitional duplicates; persistence (T9) must precede all tab extractions; investments/debt/ra (T11–T13) precede history (T14) and retirement (T15), which read their state; main.js (T16) goes last.
- **Known intentional deltas (all invisible or zero-data edge cases):** RA zero-state net-vs-savings weight (T6), RA rows lose their `bg-slate-50 p-2 rounded` row background and adopt the standard list look (T7) — flag to the user at the Phase 1 checkpoint; date inputs use `item.date || ''` everywhere (was unguarded in two builders).
- **Risk valve:** every task ends green and committed; any task can be reverted independently with `git revert`.
