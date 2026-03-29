# Tab Refresh Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small circular-arrow refresh icon button next to each tab label in the navigation bar, which re-runs all calculations for that tab when clicked.

**Architecture:** All changes are in `budget_calculator.html` — the single-file app. The HTML tab buttons get inner refresh `<button>` elements with SVG icons. CSS adds a hover rotation animation. JS adds three click handlers after the existing tab switch handlers.

**Tech Stack:** Vanilla HTML/CSS/JS, Tailwind CSS (via CDN)

---

### Task 1: Add CSS for refresh icon

**Files:**
- Modify: `budget_calculator.html:11-98` (the `<style>` block)

- [ ] **Step 1: Add `.refresh-icon` CSS rule inside the existing `<style>` block**

Find the closing `</style>` tag (line 98) and insert the following two rules immediately before it:

```css
        .refresh-icon {
            transition: transform 0.3s;
            color: #94a3b8;
            /* slate-400 */
        }

        .refresh-icon:hover {
            color: #475569;
            /* slate-600 */
            transform: rotate(180deg);
        }
```

The result: the `</style>` tag is still the last thing in the style block, just with these two new rules before it.

- [ ] **Step 2: Verify visually (manual)**

Open `http://localhost:8000` in a browser (run `make start` if the server isn't running). The tab bar should look unchanged at this point — no icon buttons exist yet.

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "style: add refresh-icon CSS for tab refresh buttons"
```

---

### Task 2: Add refresh icon buttons to tab HTML

**Files:**
- Modify: `budget_calculator.html:113-124` (the three tab `<button>` elements)

- [ ] **Step 1: Replace the three tab buttons with versions that include an inner refresh button**

Replace the entire tab nav block (lines 113–124):

```html
                <button id="tab-budget"
                    class="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                    Budget Calculator
                </button>
                <button id="tab-investment"
                    class="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                    Investment Tracker
                </button>
                <button id="tab-debt"
                    class="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                    Debt Calculator
                </button>
```

With:

```html
                <button id="tab-budget"
                    class="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5">
                    <span>Budget Calculator</span>
                    <button id="refresh-budget" class="refresh-icon p-0.5 rounded hover:bg-slate-100" title="Refresh budget calculations">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 2v6h-6"/>
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                            <path d="M3 22v-6h6"/>
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                        </svg>
                    </button>
                </button>
                <button id="tab-investment"
                    class="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5">
                    <span>Investment Tracker</span>
                    <button id="refresh-investment" class="refresh-icon p-0.5 rounded hover:bg-slate-100" title="Refresh investment calculations">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 2v6h-6"/>
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                            <path d="M3 22v-6h6"/>
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                        </svg>
                    </button>
                </button>
                <button id="tab-debt"
                    class="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5">
                    <span>Debt Calculator</span>
                    <button id="refresh-debt" class="refresh-icon p-0.5 rounded hover:bg-slate-100" title="Refresh debt calculations">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 2v6h-6"/>
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                            <path d="M3 22v-6h6"/>
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                        </svg>
                    </button>
                </button>
```

- [ ] **Step 2: Verify visually (manual)**

Reload `http://localhost:8000`. You should see three small circular-arrow icons next to each tab label. Hovering an icon should darken it and rotate it 180°. Clicking an icon at this point won't trigger recalculation yet (JS not wired up), but the parent tab click should still work.

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: add refresh icon buttons to tab navigation"
```

---

### Task 3: Wire up JS click handlers for the refresh buttons

**Files:**
- Modify: `budget_calculator.html:795-797` (tab click handler section)

- [ ] **Step 1: Add refresh button click handlers after the existing tab click handlers**

Find this block (lines 795–797):

```js
            tabBudget.addEventListener('click', () => switchTab('budget'));
            tabInvestment.addEventListener('click', () => switchTab('investment'));
            tabDebt.addEventListener('click', () => switchTab('debt'));
```

Add the following immediately after it:

```js
            document.getElementById('refresh-budget').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('budget');
                calculateAndDisplaySummary();
                renderBudget();
            });

            document.getElementById('refresh-investment').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('investment');
                renderFullInvestmentUI();
                updatePerformanceDisplay();
            });

            document.getElementById('refresh-debt').addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab('debt');
                calculateDebtProjection();
                renderRepayments();
            });
```

- [ ] **Step 2: Verify manually**

Reload `http://localhost:8000`.

Check each scenario:
1. On the Budget tab, click `↻` next to "Budget Calculator" — summary and list should re-render with no page reload.
2. While on Budget tab, click `↻` next to "Investment Tracker" — should switch to Investment tab and recalculate.
3. While on Budget tab, click `↻` next to "Debt Calculator" — should switch to Debt tab and recalculate.
4. Verify that clicking the tab label text itself (not the icon) still switches tabs normally without double-firing.

- [ ] **Step 3: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: wire up refresh button click handlers for all three tabs"
```
