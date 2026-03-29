# Test Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subtle top-right toggle that switches all three data sources to `db/test/` and redirects all saves there, leaving real data completely untouched.

**Architecture:** A single `testMode` boolean drives two helpers — `dbPath()` for fetch URLs and `saveKey()` for API endpoint names. Load functions and `saveToServer` read these helpers. The server gets three new FILE_MAP entries (`test_budget`, `test_investments`, `test_debt`) pointing to `db/test/`. Toggle re-fetches all three CSVs in parallel.

**Tech Stack:** Vanilla JS, Tailwind CSS, Python stdlib HTTP server

---

### Task 1: Add test FILE_MAP entries to server.py

**Files:**
- Modify: `server.py:5-9`

- [ ] **Step 1: Add three new entries to FILE_MAP**

Open `server.py` and replace the FILE_MAP block:

```python
FILE_MAP = {
    'budget':           'db/calulator_data.csv',
    'investments':      'db/investments.csv',
    'debt':             'db/debt.csv',
    'test_budget':      'db/test/calulator_data.csv',
    'test_investments': 'db/test/investments.csv',
    'test_debt':        'db/test/debt.csv',
}
```

- [ ] **Step 2: Restart the server and verify**

```bash
make restart
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/save/test_budget \
  -H "Content-Type: text/csv" --data-binary "type,description,amount,date"
```
Expected output: `200`

- [ ] **Step 3: Verify real key still works**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/save/budget \
  -H "Content-Type: text/csv" --data-binary "type,description,amount,date"
```
Expected output: `200`

- [ ] **Step 4: Commit**

```bash
git add server.py
git commit -m "feat: add test FILE_MAP entries for db/test/ redirects"
```

---

### Task 2: Add `testMode` flag and helpers to budget_calculator.html

**Files:**
- Modify: `budget_calculator.html` — just after the `// --- SERVER SAVE HELPERS ---` block (around line 897)

- [ ] **Step 1: Insert the flag and helpers**

Find this line in `budget_calculator.html`:

```js
            // --- SERVER SAVE HELPERS ---
```

Add the following block **above** it (before line 897):

```js
            // --- TEST MODE ---
            let testMode = false;
            const dbPath = (filename) => testMode ? `db/test/${filename}` : `db/${filename}`;
            const saveKey = (name) => testMode ? `test_${name}` : name;
```

- [ ] **Step 2: Modify saveToServer to use saveKey**

Find:

```js
                    const res = await fetch(`/api/save/${name}`, {
```

Replace with:

```js
                    const res = await fetch(`/api/save/${saveKey(name)}`, {
```

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: add testMode flag, dbPath/saveKey helpers, wire saveToServer"
```

---

### Task 3: Wire load functions to use dbPath()

**Files:**
- Modify: `budget_calculator.html` — three load functions

- [ ] **Step 1: Update loadBudgetCSVFromServer**

Find:

```js
                const response = await fetch('db/calulator_data.csv', { cache: 'no-store' });
```

Replace with:

```js
                const response = await fetch(dbPath('calulator_data.csv'), { cache: 'no-store' });
```

- [ ] **Step 2: Update loadInvestmentCSVFromServer**

Find:

```js
                    const response = await fetch('db/investments.csv', { cache: 'no-store' });
```

Replace with:

```js
                    const response = await fetch(dbPath('investments.csv'), { cache: 'no-store' });
```

- [ ] **Step 3: Update loadDebtCSVFromServer**

Find:

```js
                    const response = await fetch('db/debt.csv', { cache: 'no-store' });
```

Replace with:

```js
                    const response = await fetch(dbPath('debt.csv'), { cache: 'no-store' });
```

- [ ] **Step 4: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: wire load functions to use dbPath() helper"
```

---

### Task 4: Add toggle button to header HTML

**Files:**
- Modify: `budget_calculator.html:117-120` (the `<header>` block)

- [ ] **Step 1: Wrap header content in a flex row and add toggle button**

Find:

```html
        <!-- Header -->
        <header class="mb-6">
            <h1 class="text-3xl font-bold text-slate-800">Personal Finance Dashboard</h1>
            <p class="text-slate-500 mt-1">Manage your budget and track your investments.</p>
        </header>
```

Replace with:

```html
        <!-- Header -->
        <header class="mb-6 flex items-start justify-between">
            <div>
                <h1 class="text-3xl font-bold text-slate-800">Personal Finance Dashboard</h1>
                <p class="text-slate-500 mt-1">Manage your budget and track your investments.</p>
                <p id="test-mode-label" class="hidden text-xs text-amber-600 mt-1 font-medium tracking-wide">SAMPLE DATA</p>
            </div>
            <button id="test-mode-btn"
                class="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors border-slate-200 text-slate-400 hover:text-slate-500 hover:border-slate-300"
                title="Switch between real and sample data">
                <span id="test-mode-dot" class="w-1.5 h-1.5 rounded-full bg-slate-300 transition-colors"></span>
                Test Mode
            </button>
        </header>
```

- [ ] **Step 2: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: add test mode toggle button to header"
```

---

### Task 5: Add toggle logic and UI update function

**Files:**
- Modify: `budget_calculator.html` — just before the closing `})();` init block (around line 2271)

- [ ] **Step 1: Add updateTestModeUI and toggle event listener**

Find the init block near the bottom:

```js
            (async () => {
                try {
                    await loadBudgetCSVFromServer();
```

Insert the following block **immediately before** it:

```js
            const updateTestModeUI = () => {
                const btn = document.getElementById('test-mode-btn');
                const dot = document.getElementById('test-mode-dot');
                const label = document.getElementById('test-mode-label');
                if (testMode) {
                    btn.classList.remove('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
                    btn.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-700');
                    dot.classList.remove('bg-slate-300');
                    dot.classList.add('bg-amber-400');
                    label.classList.remove('hidden');
                } else {
                    btn.classList.add('border-slate-200', 'text-slate-400', 'hover:text-slate-500', 'hover:border-slate-300');
                    btn.classList.remove('border-amber-300', 'bg-amber-50', 'text-amber-700');
                    dot.classList.add('bg-slate-300');
                    dot.classList.remove('bg-amber-400');
                    label.classList.add('hidden');
                }
            };

            document.getElementById('test-mode-btn').addEventListener('click', async () => {
                testMode = !testMode;
                updateTestModeUI();
                await Promise.all([
                    loadBudgetCSVFromServer().catch(() => {}),
                    loadInvestmentCSVFromServer(),
                    loadDebtCSVFromServer(),
                ]);
            });

```

- [ ] **Step 2: Reload the app in browser and verify**

Open http://localhost:8000 and check:

1. Toggle button is visible top-right, subtle slate style
2. Click it → button turns amber, "SAMPLE DATA" label appears below subtitle
3. All three tabs show example data (smaller numbers, example names)
4. Click again → reverts to real data, amber styling removed
5. While in test mode, modify a value and wait 800ms → check `db/test/calulator_data.csv` was updated, `db/calulator_data.csv` unchanged

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: add test mode toggle logic, UI state, and parallel data reload"
```
