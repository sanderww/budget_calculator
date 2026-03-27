# History Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "History" tab that shows a unified year-by-year table of extra debt repayments and investment contributions, broken down by account type.

**Architecture:** All changes are in `budget_calculator.html`. The tab reads directly from the in-memory `investmentData.transactions` and `debtData.repayments` arrays (already loaded on startup) and renders a table into a new `#history-content` div. No new data fetching, no new files.

**Tech Stack:** Vanilla JS, Tailwind CSS (already loaded via CDN)

---

## File Map

| File | Change |
|------|--------|
| `budget_calculator.html` | Add tab button in nav, add `#history-content` div, extend `switchTab()`, add `renderHistory()` function, call it after data loads |

---

### Task 1: Add History tab button and content div to HTML

**Files:**
- Modify: `budget_calculator.html` (nav section ~line 122–168, tab content area ~line 800)

- [ ] **Step 1: Add the tab button to the nav**

Find the closing `</nav>` tag (currently after the debt tab block, around line 167). Insert a new tab group before it:

```html
                <div class="inline-flex items-center gap-1">
                    <button id="tab-history"
                        class="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                        History
                    </button>
                </div>
```

- [ ] **Step 2: Add the history content div**

Find the `<!-- BUDGET TAB CONTENT -->` comment (around line 170). Just above it, insert the empty history content panel (initially hidden):

```html
        <!-- HISTORY TAB CONTENT -->
        <div id="history-content" class="hidden">
        </div>

```

- [ ] **Step 3: Verify HTML structure**

Open `budget_calculator.html` in a browser (via `make start` / `http://localhost:8000`). Confirm a "History" tab button appears in the nav. Clicking it should do nothing yet (no JS wired up). The existing three tabs should still work normally.

- [ ] **Step 4: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: add history tab button and content div"
```

---

### Task 2: Extend switchTab() to handle 'history'

**Files:**
- Modify: `budget_calculator.html` (script section, `switchTab` function ~line 806–835)

- [ ] **Step 1: Add tabHistory and contentHistory references**

Find the block of `const tab*` / `const content*` declarations at the top of the script (around line 806–811):

```js
const tabBudget = document.getElementById('tab-budget');
const tabInvestment = document.getElementById('tab-investment');
const tabDebt = document.getElementById('tab-debt');
const contentBudget = document.getElementById('budget-content');
const contentInvestment = document.getElementById('investment-content');
const contentDebt = document.getElementById('debt-content');
```

Add two lines immediately after:

```js
const tabHistory = document.getElementById('tab-history');
const contentHistory = document.getElementById('history-content');
```

- [ ] **Step 2: Update switchTab to include history in reset and activate logic**

Replace the existing `switchTab` function (lines ~813–835) with:

```js
const switchTab = (tab) => {
    // Reset all tabs
    [tabBudget, tabInvestment, tabDebt, tabHistory].forEach(t => {
        t.classList.remove('border-indigo-500', 'text-indigo-600');
        t.classList.add('border-transparent', 'text-slate-500');
    });
    [contentBudget, contentInvestment, contentDebt, contentHistory].forEach(c => c.classList.add('hidden'));

    // Activate selected tab
    if (tab === 'budget') {
        tabBudget.classList.add('border-indigo-500', 'text-indigo-600');
        tabBudget.classList.remove('border-transparent', 'text-slate-500');
        contentBudget.classList.remove('hidden');
    } else if (tab === 'investment') {
        tabInvestment.classList.add('border-indigo-500', 'text-indigo-600');
        tabInvestment.classList.remove('border-transparent', 'text-slate-500');
        contentInvestment.classList.remove('hidden');
    } else if (tab === 'debt') {
        tabDebt.classList.add('border-indigo-500', 'text-indigo-600');
        tabDebt.classList.remove('border-transparent', 'text-slate-500');
        contentDebt.classList.remove('hidden');
    } else if (tab === 'history') {
        tabHistory.classList.add('border-indigo-500', 'text-indigo-600');
        tabHistory.classList.remove('border-transparent', 'text-slate-500');
        contentHistory.classList.remove('hidden');
        renderHistory();
    }
};
```

- [ ] **Step 3: Wire up the click handler**

Find the block of `tab*.addEventListener('click', ...)` calls (around line 837–839). Add after the existing three:

```js
tabHistory.addEventListener('click', () => switchTab('history'));
```

- [ ] **Step 4: Verify tab switching**

Reload the browser. Clicking "History" should now:
- Activate the History tab (indigo underline)
- Hide the other three content panels
- Show `#history-content` (empty for now)
- Clicking back to Budget/Investment/Debt should work as before

- [ ] **Step 5: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: wire up history tab switching"
```

---

### Task 3: Implement renderHistory()

**Files:**
- Modify: `budget_calculator.html` (script section, just before the `// --- INITIALIZATION ---` comment at ~line 2146)

- [ ] **Step 1: Insert renderHistory() before the initialization block**

Find the comment `// --- INITIALIZATION ---` (around line 2146). Insert the following function immediately before it:

```js
// --- HISTORY TAB ---
const renderHistory = () => {
    const container = document.getElementById('history-content');

    // Group debt extra repayments by year
    const debtByYear = {};
    debtData.repayments.forEach(r => {
        const year = r.date ? r.date.split('-')[0] : null;
        if (!year || year.length !== 4) return;
        debtByYear[year] = (debtByYear[year] || 0) + (parseFloat(r.amount) || 0);
    });

    // Group investment transactions by year and account type
    const invByYear = {};
    investmentData.transactions.forEach(t => {
        const year = t.date ? t.date.split('-')[0] : null;
        if (!year || year.length !== 4) return;
        if (!invByYear[year]) invByYear[year] = { TFSA: 0, Discretionary: 0, Crypto: 0 };
        if (invByYear[year].hasOwnProperty(t.type)) {
            invByYear[year][t.type] += (parseFloat(t.amount) || 0);
        }
    });

    // Collect and sort all years
    const years = [...new Set([...Object.keys(debtByYear), ...Object.keys(invByYear)])].sort();

    // Currency formatter
    const fmt = (val) => val > 0
        ? 'R\u00a0' + val.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '\u2014';

    // Build rows and accumulate totals
    let totalDebt = 0, totalTFSA = 0, totalDisc = 0, totalCrypto = 0;

    const rowsHtml = years.map(year => {
        const debt = debtByYear[year] || 0;
        const inv = invByYear[year] || {};
        const tfsa = inv.TFSA || 0;
        const disc = inv.Discretionary || 0;
        const crypto = inv.Crypto || 0;
        const invTotal = tfsa + disc + crypto;
        totalDebt += debt;
        totalTFSA += tfsa;
        totalDisc += disc;
        totalCrypto += crypto;
        return `<tr class="border-t border-slate-200 hover:bg-slate-50">
            <td class="py-2.5 px-4 font-medium text-slate-700">${year}</td>
            <td class="py-2.5 px-4 text-slate-600">${fmt(debt)}</td>
            <td class="py-2.5 px-4 font-medium text-slate-700">${fmt(invTotal)}</td>
            <td class="py-2.5 px-4 text-slate-600">${fmt(tfsa)}</td>
            <td class="py-2.5 px-4 text-slate-600">${fmt(disc)}</td>
            <td class="py-2.5 px-4 text-slate-600">${fmt(crypto)}</td>
        </tr>`;
    }).join('');

    const totalInvTotal = totalTFSA + totalDisc + totalCrypto;

    container.innerHTML = `
        <div class="card">
            <h2 class="text-base font-semibold text-slate-800 mb-4">Money Allocated Over Time</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-left text-xs text-slate-500 uppercase tracking-wide">
                            <th class="py-2 px-4 font-medium">Year</th>
                            <th class="py-2 px-4 font-medium">Debt Repaid</th>
                            <th class="py-2 px-4 font-medium">Investments Total</th>
                            <th class="py-2 px-4 font-medium">TFSA</th>
                            <th class="py-2 px-4 font-medium">Discretionary</th>
                            <th class="py-2 px-4 font-medium">Crypto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        <tr class="border-t-2 border-slate-300 font-semibold text-slate-800 bg-slate-50">
                            <td class="py-2.5 px-4">Total</td>
                            <td class="py-2.5 px-4">${fmt(totalDebt)}</td>
                            <td class="py-2.5 px-4">${fmt(totalInvTotal)}</td>
                            <td class="py-2.5 px-4">${fmt(totalTFSA)}</td>
                            <td class="py-2.5 px-4">${fmt(totalDisc)}</td>
                            <td class="py-2.5 px-4">${fmt(totalCrypto)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
};
```

- [ ] **Step 2: Verify the table renders correctly**

Reload the browser, click "History". You should see a table with:
- One row per year (2024, 2025, 2026 based on current data)
- Debt Repaid column: `—` for 2024, `R 41,100` for 2025, `R 26,000` for 2026
- TFSA, Discretionary, Crypto columns populated from investment transactions
- A bold Totals row at the bottom

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: implement history tab renderHistory() function"
```

---

### Task 4: Re-render history after data loads on startup

**Files:**
- Modify: `budget_calculator.html` (initialization block ~line 2146–2158)

- [ ] **Step 1: Understand the issue**

`renderHistory()` is called when the tab is clicked, but if the user navigates directly to History before clicking away, the data will already be loaded. More importantly, if someone opens the app and clicks History before the async load completes, the table will show empty. We handle this by calling `renderHistory()` (if history is visible) after the CSVs load — but since the default tab is Budget, the simpler fix is: call `renderHistory()` after `loadDebtCSVFromServer()` resolves so the data is ready when the user first clicks History.

The current initialization block (lines ~2147–2158):

```js
(async () => {
    try {
        await loadBudgetCSVFromServer();
    } catch (err) {
        console.warn('Automatic Budget CSV load failed.', err);
        renderBudget();
    }

    await loadInvestmentCSVFromServer();
    await loadDebtCSVFromServer();
})();
```

No change needed here — `renderHistory()` is called inside `switchTab('history')` which already runs after data is loaded (the user must click the tab). This is sufficient. Skip to commit.

- [ ] **Step 2: Confirm no race condition**

Verify by refreshing the browser, waiting for the page to load (both investment and debt CSVs load sequentially at startup), then clicking History. The table should populate correctly. If data were missing it would show `—` for all cells.

- [ ] **Step 3: Final commit**

```bash
git add budget_calculator.html
git commit -m "feat: history tab complete - year-by-year debt and investment breakdown"
```
