# Personal Finance Dashboard — Functional Requirements

## Overview

A single-page web application for personal financial management with six modules: Budget Calculator, Investment Tracker, Debt Calculator, RA, Retirement, and History. All data is persisted as CSV files via a lightweight HTTP server. Currency is South African Rand (R).

**Currency notation.** Every amount rendered anywhere in the UI uses comma thousands separators and a dot decimal separator — `R 3,000.50` is three thousand rand and fifty cents. `src/lib/format.js` is the single source of truth: it exports `fmtZAR` (two decimals), `fmtZARWhole` / `fmtZARSigned` (whole rand), `fmtZARAxis` (chart axes and tooltips) and `fmtNum` (grouped number without the `R` prefix), all pinned to `ZAR_LOCALE = 'en-US'`. Modules must not call `toLocaleString` directly, and the `en-ZA` locale (which renders `3 000,50`) must not be used for display. Static placeholders in `budget_calculator.html` follow the same notation.

Styling is a committed static Tailwind CSS v3 build (`src/styles/tailwind.css`, generated via `npm run build:css` / `make css`) plus custom styles in `src/styles/app.css`; no CSS CDN dependency at runtime.

**Implementation layout.** `src/budget_calculator.html` is markup-only and loads `src/app/main.js` as an ES-module bootstrap. Per-tab controllers live in `src/app/` (budget, investments, debt, ra, history, retirement, plus the persistence/config layer). Shared front-end helpers live in `src/lib/` (`format.js` currency formatters, `rows.js` row and column-cell builders, `ledger.js` shared ledger component, `quick-add.js` quick-add token parser, `perf-panel.js` performance renderer) and chart modules in `src/charts/`. All calculation and CSV-parsing logic is split into domain modules under `src/calc/` (budget, investments, debt, ra, retirement) and re-exported through the `src/calculations.js` barrel — that barrel is the only import path consumers use and deliberately stays at the `src/` root.

---

## 0. Application Shell

### 0.1 Header

- Title and subtitle on the left.
- Right-hand control group:
  - **Save-status chip** (`#save-status`, shown at every width): the only save indicator. It reflects the auto-save state across all modules — `Saving…` (muted) while one or more POSTs are in flight, `All changes saved` (emerald) after the last one succeeds. When a save errors it becomes an enabled button reading `⚠ Save failed — Retry` (red); clicking it calls `retryFailedSaves()`, which re-sends every save that failed since its last success. The failure stays visible until a save succeeds. There are no manual Save buttons and no Refresh button: every tab re-renders on edit or on show.
  - **Sample data toggle** (`#test-mode-btn`, see §8).
- **Sample-data banner** (`#sample-banner`): directly under the header, full-width amber, shown only while sample data is on (see §8).

### 0.2 KPI Strip

A row of four read-only cards between the header and the tab bar, giving at-a-glance oversight without opening a tab (2 columns on mobile, 4 on desktop). Values are mirrored from where the tabs already compute them — the strip performs no calculations of its own:

| KPI | Source |
|---|---|
| Net savings now (green ≥ 0, red < 0) | Budget summary (`calculateAndDisplaySummary`) |
| Net savings on [selected date] | Budget summary; label shows the §1.5 future-date picker value |
| Portfolio value | Sum of the three Investments current-value inputs |
| Debt-free by (month + year; `Never` when the loan never amortises) | Debt projection's new end date |

### 0.3 Tabs

Tab bar labels: **Budget**, **Investments**, **Debt**, **RA**, **Retirement**, **History**. Each tab button only switches tabs.

### 0.4 Database Toolbars

The Investments, Debt, and RA tabs each open with a right-aligned overflow menu button (`⋯`) instead of a database toolbar. Its popover holds **Import CSV…** (the file-picker import; ids `load-inv-csv`, `load-debt-csv`, `load-ra-csv`; an imported dataset is then auto-saved like any edit) and a muted footnote with the backing file path (e.g. `db/transactions/investments.csv`). The Budget tab has no import and therefore no menu and no path text. The Retirement tab's sidebar carries the same `⋯` menu with **Import CSV…** (`ret-load-csv`) and no path footnote. File paths appear nowhere else in the UI. There are no Save buttons: persistence is automatic (§7). The menu is built on the shared popover helper (`src/lib/popover.js`): the trigger has `aria-expanded`, Escape and outside click close it, and choosing an item closes it. The main content of these tabs spans the full page width.

### 0.5 Undo and amount fields

**Undo for deletes.** Deleting a row in any editable list (Budget commitments — debts, provisions and future costs; investment transactions; debt extra repayments; RA contributions) removes it and auto-saves immediately, then shows a toast at the bottom-centre of the viewport: `Deleted "School fees" (R 45,000.00)` with an **Undo** button. The toast (`src/lib/undo-toast.js`, `showUndoToast({ message, onUndo })`) is a single `role="status"` / `aria-live="polite"` element on `<body>`; the Undo button is keyboard-focusable but never takes focus automatically. It disappears after 8 seconds or when the next delete replaces it. **Undo** puts the same row object (same `id`) back at its original index, re-renders and saves as a normal edit. The shared `deleteWithUndo` in `src/lib/rows.js` does this for every list. The trash button is a neutral grey icon button (`aria-label` "Delete") that turns red on hover and focus.

**Formatted amount fields.** All rand amount inputs (list-row amounts, Current Savings, Available money, planned monthly savings, the three investment current values, the four mortgage rand fields, RA current value) are `type="text" inputmode="decimal"` and wired by `bindAmountInput(el, { get, set })` in `src/lib/rows.js`. When idle they show a grouped value (`400,000`, `45,000.50`); while focused they show the raw value. Accepted input: `45000`, `45,000`, `45000.5`, `R 45,000.50`, `45k`, `1.2m`, `-500`. Invalid text (for example `1,2` or `abc`) leaves the stored value unchanged and shows a red border with `aria-invalid="true"` until corrected; clearing the field clears the value. Stored state, config and CSV values remain plain numbers. The Retirement tab's money inputs (RA vested balance, RA monthly extra, house value, bond balance, savings-pot withdrawal, inheritance and Dutch pension EUR amounts, scenario monthly drawdown) are formatted the same way, bound in `src/app/retirement.js` via the `'amount'` binding type. Percent, age, BTC, interest-rate and EUR/ZAR-rate inputs stay `type="number"`.

---

## 1. Budget Calculator

### 1.1 Current Savings

- Single amount input representing total liquid savings (R), a formatted amount field (see §0.5).
- Changes trigger an immediate recalculation of the financial summary.

### 1.2 Commitments ledger

Debts, provisions and future costs ("commitments") share one card, **Commitments**, below Current Savings. It replaces the three separate Debts / Provisions / Future Costs cards; there are no "+ Add" buttons.

The table is built on the shared ledger component `createLedger` (`src/lib/ledger.js`, UX-4.1), which owns rendering, sorting, the filter chips with counts, the footer, the empty states, the quick-add field with its preview line, in-place edits and delete-with-undo. The Budget controller (`src/app/budget.js`) supplies the rows (each tagged with its kind as its group), the soonest-first sort, the kind filters and per-kind footer, `parseQuickAdd`, and the Budget-only actions (Type chip change, **Move to provisions**). The component's API is documented in the header comment of `src/lib/ledger.js`; it also supports column specs (including a conditional column such as BTC on Crypto rows), generated filter sets (per year or tax year), newest-first sort by default and a quick-add default date of today, for the Investments, Debt and RA lists.

- **Storage is unchanged.** `budgetData` keeps `{ savings, debts, provisions, futureCosts }` and the budget CSV layout (§8) is the same; parse → generate reproduces a budget CSV byte-for-byte. The ledger is a view built from the three arrays, each row tagged with its kind (`'debt'`, `'provision'`, `'futureCost'`).
- **Columns:** **Type** · **Description** · **Amount** · **Due** · delete. A column header is shown from 640 px; on phones each row stacks (type + delete, description, amount + due).
  - **Type** is a `<select>` (`aria-label` "Type") styled as a coloured chip: Debt (red), Provision (amber), Future cost (blue).
  - **Amount** is a formatted amount field (§0.5).
  - **Due** is a date input (`aria-label` "Due date"). Debt rows leave the cell empty and not editable, because the budget CSV stores no date for debts.
  - The trash button deletes with undo (§0.5).
- Every row carries `data-id="<item id>"` and `data-kind="<kind>"` (built by `createCommitmentRow` in `src/lib/rows.js` from `COMMITMENT_COLUMNS` via the column-driven `createLedgerRow`).
- **Ordering:** rows are sorted soonest-first with `sortByDateThenIdAsc` (`src/lib/rows.js`). Rows with a blank or unparseable date (all debts, any freshly added row) sort to the top; ties break by id ascending (ids embed creation time). The sort is applied to view rows on every render (load, add, delete, type change, move), so the stored order and the CSV are untouched, and because rows are addressed by `data-id`, re-ordering never disturbs an edit. Typing into a field never re-renders the table; a changed date takes its new position on the next render.
- **Changing the type** moves the row to the other array via `changeCommitmentType(data, id, newKind)` (`src/calc/budget.js`): pure, never mutating its input, appending the row to the target array with the same `id`, `description` and `amount`. Moving to Debt drops the `date`; moving a debt elsewhere gives it an empty date. Unknown id, unknown kind or the same kind returns the **input by reference**. The table re-renders, focus returns to the row's Type chip, and the change auto-saves. Changing a dated row to Debt also shows the undo toast *"Date removed — debts have no due date."* — **Undo** moves it back to its previous kind and restores the date (only while the row is still a debt).
- **Filters:** a chip group above the table — **All (n)** · **Debts (n)** · **Provisions (n)** · **Future costs (n)** — real buttons with `aria-pressed`. The chosen filter is remembered per browser in `localStorage` (`budget.commitmentFilter`, every access wrapped in try/catch) and is not written to config. Adding, moving or converting a row whose kind is hidden by the current filter switches the filter to All so the row stays in sight. Counts and totals are computed by the ledger per filter option (amount = `parseFloat(amount) || 0`, the same rule as `summariseCommitments(data)`).
- **Footer:** the total for the current filter (`Total R 7,000.00`); on All it also shows the per-kind subtotals (`Debts R … · Provisions R … · Future costs R …`). Totals update live while an amount is typed.
- **Empty state:** *No commitments yet. Type one above, for example "school fees 45k 2027-01-15".* When a filter has no rows: *No debts yet.* (or provisions / future costs).

### 1.3 Quick-add

- A single text field above the table: *Add a commitment — e.g. "car service 6.5k mar 2027" or "credit card 12000 debt"*, with a visually hidden label and a live preview line (`aria-live="polite"`) beneath it.
- While the user types, the preview shows what will be added: *Will add **Future cost** · **Car service** · **R 6,500.00** · due **2027-03-01*** (the "due" part is omitted when there is no date). When something is missing it says what: *Add a description.*, *Add an amount, e.g. 6.5k or 12000.*, or *Add a description and an amount.* With the field empty it reads *Press Enter on an empty field to add a blank row.*
- **Enter** adds the row only when both a description and an amount were found, clears the field, keeps focus in it and auto-saves. **Enter on an empty field** adds a blank Future cost row and moves focus to its description; the user changes the type in the row if needed. The field can be skipped by tabbing into the table.
- Parsing is the pure `parseQuickAdd(text)` in `src/calc/budget.js`, built on the general token parser `parseQuickAddTokens(text, { keywords, units, defaultDate })` in `src/lib/quick-add.js` with the keyword map `{ debt, provision }`. It returns `{ kind, description, amount, date }` (date `''` when none) or `{ error: 'empty' | 'missing', missing: ['description' | 'amount', …] }`. Rules, in order, on whitespace-separated tokens:
  1. **Type:** the word `debt` or `provision` anywhere (case-insensitive, whole word). Default: Future cost.
  2. **Date:** a valid `YYYY-MM-DD`, or `<month name or 3-letter abbreviation> YYYY` (→ the 1st of that month). A date typed on a debt is dropped (debts have no due date).
  3. **Amount:** the first token `parseAmount` accepts (a lone `R` joins the number after it, so `R 20,000` counts). A bare year (`19xx`/`20xx`) is only used when nothing else parses, so in "2027 budget review 5k" the amount is R 5,000 and "2027" stays in the description.
  4. **Description:** the remaining tokens, whitespace collapsed, first letter capitalised.

### 1.4 Past-due future costs (Move to provisions)

- A future-cost row whose date is **strictly before today** (`isPastDue` in `src/calc/budget.js`, which normalises both dates to local midnight, so a cost due *today* is still pending) shows a full-width strip under the row: a **Past due** badge, the hint *"Saved the money? Move it to provisions. Spent it? Delete the row."* and a text button **Move to provisions**. On other future-cost rows the strip is hidden; editing a date shows or hides it immediately without re-rendering. Provisions and debts never get the strip.
  - Clicking **Move to provisions** moves the row out of Future Costs and appends it to Provisions with its `id`, description, amount and **original date** intact — the date is preserved so the provision stays identifiable as the cost that was due on that day. The table re-renders and auto-saves.
  - The state transition is `convertFutureCostToProvision(data, id, today)` in `src/calc/budget.js`: pure, never mutating its input, returning a new data object on success and the **input object by reference** when the move is refused (unknown id, blank or unparseable date, or a date not strictly before today). The click handler detects a no-op with `!==` and skips the re-render and save.
  - The conversion is **deliberately manual, never automatic.** Once a future cost's date passes, the money was either saved (it becomes a provision) or spent (the row is simply deleted). The app cannot infer which from the date, so it never converts on its own; the badge is the cue that a row needs that decision.
  - **Effect on the summary:** converting reduces **Net savings now** by the amount and leaves **Net savings on [date]** unchanged. This falls out of the existing formulas rather than any new arithmetic — a past-dated cost already satisfies `date <= target` for every future target, so it was already inside `relevantFutureCosts`; after conversion it sits in `totalProvisions` instead, and `futureNetAmount` derives from `currentNetAmount`.

### 1.5 Financial Summary

Right-column sidebar card, beside the Commitments ledger (below the timeline card). Calculated in real time whenever any input changes. Displays only three values plus the future-date picker. The Monthly Money Allocation controls (§1.6) live as a compact subsection inside this same card, below the three values.

- **Current Savings** — the savings input value (R), formatted.
- **Net savings now** = Current Savings − Total Debts − Total Provisions
  - Underlying value is identical to the previous "Current Net Amount"; only the visible label changes.
  - Displayed green when >= 0, red when < 0.
- **Net savings on [selected date]** = Net savings now − sum of Future Costs whose date <= selected date
  - Underlying value is identical to the previous "Future Net Amount"; only the visible label changes.
  - Displayed indigo when >= 0, red when < 0.
- **Future-date picker** — selects the planning (target) date. Defaults to 1 year from today on first load. The §1.7 target-date slider writes the same value.

The "Breakdown" subsection (Total Savings / Total Debts / Total Provisions / Total Future Costs rows) and the visible "Monthly Savings Needed" row are no longer rendered in the sidebar. The monthly savings target value is still computed by `calculateBudgetSummary` and consumed by §1.6 Monthly Money Allocation; it is just not displayed in the sidebar.

### 1.6 Monthly Money Allocation

Compact subsection inside the right-column Financial Summary card (no longer a standalone card in the main column). Splits available end-of-month money across investment categories:

- **Inputs**:
  - Available Money at End of Month (R, formatted amount input)
  - Mortgage Repayment (%, default 50, editable)
  - ETF (%, default 50, editable; label "ETF" = exchange-traded fund; the element id stays `eft-percentage`)
  - Crypto (%, read-only, always 100 − Mortgage − ETF; `#crypto-percentage`)
- **Live update**: there is no Calculate button and no `#allocation-error`. Every input recalculates the results immediately.
- **Self-balancing**: percentages are rounded to 0.1 and clamped to 0–100. If an edit would push Mortgage + ETF over 100, the other editable field is reduced to fit and a one-line hint (`#allocation-hint`, e.g. "ETF reduced to 20% so the total stays at 100%.") says so; the hint clears on the next edit that needs no reduction.
- **Persistence**: Available money and the two percentages are saved to private config as `budget_alloc_available`, `budget_alloc_mortgage_pct` and `budget_alloc_etf_pct`, and restored at startup (and when Sample data is toggled) by `applyBudgetConfig()`. Blank available money removes its key. Missing percentage keys fall back to 50 / 50.
- **Outputs**: one horizontal stacked bar (`#allocation-bar`: Required savings, Mortgage, ETF, Crypto; widths proportional to available money) with the four amounts under it:
  - Required Savings (= monthly savings target from summary)
  - Mortgage Repayment amount = (Available - Savings Target) * Mortgage%
  - ETF amount = (Available - Savings Target) * ETF%
  - Crypto amount = (Available - Savings Target) * Crypto%
  - **Leftover** row appears only when it is not zero.
- **Shortfall**: if available money is below the savings target, the remainder amounts show as zero and `#allocation-note` states how much the available money is short.

### 1.7 Timeline Overview Chart (runway)

Full-width card at the **top** of the budget tab (`#budget-timeline-card`), above the Current Savings / Commitments column and the Financial Summary column. Rendered with ApexCharts loaded from CDN. Refreshes whenever the budget summary recalculates (savings input, commitment edits, target-date change from the date input or the slider, planned-savings or buffer edits, data load).

**Time window** (see core-requirements §1.6 for the formulas):
- X-axis runs from `today` to the **horizon**: the later of (target date, latest dated future cost) + 3 months, and at least 12 months from today. The target date is the §1.5 future-date picker.
- While the target-date slider is held, the horizon is frozen so the chart doesn't rescale under the pointer; it is recomputed on release (`change`) and whenever the date is typed.
- If the future date is missing or in the past, the card shows a short placeholder instead of a chart.
- If no future cost is dated inside `[today, horizon]`, the chart is still drawn (the planned line is straight) and a note under it (`#budget-timeline-empty`) says so.

**Read-outs above the chart:**
- **Lowest point ahead** (`#budget-lowest-point`) — the lowest value of (planned trajectory − floor) between today and the horizon, with its date ("R 12,000.00 on 01 Mar 2027"). The box turns amber (`data-warn="true"`) and shows "Below your minimum buffer" when the value is below the minimum buffer.
- **Save per month to stay above buffer** (`#budget-buffer-savings`) — the smallest monthly rate that keeps the trajectory at or above floor + minimum buffer at every cost date up to the horizon and at the horizon.

**Inputs above the chart:**
- **Monthly savings (planned)** (`#budget-timeline-planned-savings`) — drives the Planned line. Persisted to `db/config.private.json` under `budget_planned_monthly_savings` with the standard debounced auto-save. When blank, the input shows the rounded recommended amount as a placeholder and the Planned line follows the recommendation. Clearing the input, or pressing **"Use recommended"**, removes the saved override.
- **Minimum buffer (R)** (`#budget-min-buffer`) — formatted amount input (`bindAmountInput`). Persisted as the private config key `budget_min_buffer` (default 0); leaving it blank removes the key. Prefilled from config on load, together with the planned amount (`applyBudgetConfig`).

**Visual elements.** Single datetime x-axis, single y-axis "Amount (R)":
- **Future-cost events** — one point per dated future cost in `[today, horizon]`, sitting on the Planned line at its date (just before the step-down), coloured like the Future-cost chip (blue). Hovering shows the description, date and amount. Clicking a point scrolls to that cost's Commitments row (matched by `data-id`) and highlights it (`row-highlight`) for 1.5 s; if the ledger filter hides the row, the filter switches to All first. Provisions are not drawn.
- Solid **Planned trajectory** line starting at `(today, Current Savings)`, sloping up by the *planned* monthly rate, stepping down at each cost, and extending to the horizon. Green normally; red if its lowest point dips below the floor.
- Dashed amber **Recommended trajectory** line built the same way but always using the chart-derived `Required Monthly Savings` (costs up to the target date only). Always drawn; when no planned override is set it coincides with the Planned line.
- Slate dashed line for `Total Debts + Total Provisions` ("floor"), drawn as a regular line series.
- **Floor + buffer** — dashed amber horizontal annotation at floor + buffer, drawn only when a buffer is set.
- **Target-date marker** — a vertical indigo x-axis annotation labelled "Target DD MMM YYYY".

Legend at bottom centre. Headline above the chart in plain language: `Save R X,XXX/month to keep above the R Y,YYY debts + provisions floor through R Z,ZZZ in future costs by DD MMM YYYY.` When no cost falls before the target date the "through … in future costs" part is left out.

**Target-date slider:** a native `<input type="range">` (`#budget-target-range`, label "Target date", `aria-valuetext` = the formatted date) under the chart, over the same range (1 day after today → horizon, one step per day). Dragging it writes the ISO date into `#future-date`, so the Financial Summary card and the KPI strip's "Net savings on [date]" update live. Typing in `#future-date` moves the slider and the marker. The date input stays as the keyboard fallback; the slider also responds to arrow keys.

**Interaction**:
- Pan and zoom via the chart toolbar (zoom in/out, pan, reset). Selection and image download are disabled.
- The user-adjusted zoom window is not persisted (resets on reload).

**Data source**: pure series-builder `buildBudgetTimelineSeries` in `src/charts/chart_budget_timeline.js`. It does not consume `calculateBudgetSummary` outputs — it derives `requiredMonthlySavings` independently from `savings`, `totalDebts`, `totalProvisions`, `futureCosts` and `futureDate`. It takes `horizonDate` (how far the chart runs; defaults to `futureDate`) and `minBuffer`, and returns, alongside the earlier fields, `targetDate`, `events`, `lowest`, `minBuffer`, `bufferMonthlySavings` and `belowBuffer`. With `horizonDate === futureDate` the earlier fields are identical to the pre-horizon output (`tests/chart_budget_timeline.regression.test.js`). Pure helpers in the same module: `timelineHorizon`, `lowestPoint`, `requiredMonthlySavings`.

---

## 2. Investment Tracker

### 2.1 Portfolio Accounts

Three fixed account types:

- **Discretionary**
- **TFSA** (Tax-Free Savings Account)
- **Crypto**

Each account displays:

- **Current Value** — editable numeric input (R)
- **Total Invested** — sum of all transaction amounts for this account
- **Gain/Loss (R)** — absolute return = Current Value - Total Invested
- **Gain/Loss (%)** — percentage return = (absolute return / total invested) * 100
- **Annualized Return** — true cash-flow-weighted internal rate of return (XIRR) over the account's actual contribution dates, so each contribution is weighted by how long it was invested:
  - Cash flows = one `-amount` outflow per contribution (on its transaction date) plus a single `+current_value` inflow today.
  - Annualized = `xirr(cash flows) * 100` (Newton-Raphson, see §3.4).
  - A contribution-weighted average holding period is still derived for display: weighted average age (days) = sum(amount * age_in_days) / total_invested; years held = average age / 365.25.
  - Shows "N/A" if years held <= 0.1 or data is insufficient.
  - Falls back to the simple CAGR `((current_value / total_invested) ^ (1 / years_held) - 1) * 100` if XIRR fails to converge.
- **6% Savings Comparison** — hypothetical gain if each transaction amount had been in a 6% p.a. savings account from its transaction date to today, compounded daily: `amount * (1.06 ^ (age_days / 365.25) - 1)`.
- **Net vs Savings** — absolute return minus the 6% savings gain.

For the **Discretionary** account specifically (only):

- **Marginal tax rate (%)** — editable numeric input below Current Value. Default `41`. Range `0..100`, step `1`. Persisted in `db/config.private.json` as the key `marginal_rate`.
- **Estimated tax (CGT)** — `taxable = max(0, gain − R 40,000)`, then `tax = taxable × 0.40 × (marginal_rate / 100)`. Rendered as a negative red amount when > 0, otherwise `R 0.00`. Always shown. An info icon button beside the label (`aria-expanded`, keyboard and touch accessible; Escape or an outside click closes it) toggles a help popover explaining that the figure is the worst-case (sell-everything-at-once) estimate, that the R 40,000 exclusion resets each tax year and applies to the gain (not the amount sold), and how **tax-gain harvesting** (staggering disposals under R 40,000/year, selling and rebuying to reset base cost) can reduce or avoid CGT — closing with a "not tax advice" disclaimer.
- **CGT exclusion progress bar** — directly below the Estimated tax (CGT) line, a bar fills with `min(100, gain / R 40,000 × 100)%`. Below the bar: `<pct>% of CGT exclusion` on the left and `R <remaining> before CGT` on the right, where `remaining = max(0, R 40,000 − gain)`. Bar is emerald below 80%, amber from 80% up to 100%, red at or above 100% (gain has crossed the exclusion). Driven by the gain vs the R 40,000 threshold only — independent of the marginal rate. Resets to 0% when `totalInvested === 0`.
- **Net vs savings (after tax)** — `Net vs Savings − Estimated Tax`. Green when ≥ 0, red when < 0.

These rows (and the CGT exclusion bar) are **not** shown on the TFSA or Crypto cards.

For the **TFSA** account specifically:

- **Lifetime contributed / R 500,000** — sum of TFSA transaction amounts vs the SARS lifetime cap of R 500,000.
- **Progress bar** — visual fill indicating `% of cap used`. Bar is emerald below 80%, amber from 80% up to 100%, red at or above 100%.
- **% of lifetime cap** — clamped to 100% even when contributions exceed the cap.
- **Remaining (R)** — `max(0, R 500,000 − lifetime_contributed)`, formatted with thousands separators.

For the Crypto account specifically:

- **Total BTC** — sum of all `cryptoValue` fields across Crypto transactions.

### 2.2 Transactions

- Dynamic list of investment transactions, each with:
  - **Date** (date input)
  - **Description** (text)
  - **Amount** (R, numeric)
  - **BTC value** (numeric, only visible when account type = Crypto)
  - **Account Type** (dropdown: Discretionary, TFSA, Crypto)
- Users can add and remove transactions.
- Displayed sorted by date descending (most recent first), then by creation order descending.
- Changing a transaction's type to/from Crypto toggles the BTC value field visibility and clears the value when switching away.

---

## 3. Debt Calculator (Mortgage)

### 3.1 Mortgage Details

Fixed set of loan parameters:

| Field | Description |
|---|---|
| Total Loan Amount | Original principal (R) |
| Current Outstanding Balance | Current principal (R) |
| Total Monthly Repayment | Monthly payment amount (R) |
| Monthly Service Fee | Fee deducted from repayment (R) |
| Interest Rate | Annual rate (%), converted to daily rate internally: `(rate / 100) / 365` |
| Next Payment Date | Auto-set to the upcoming 25th of the month (read-only) |
| Loan Start Date | Date the loan originated |
| Original Term | Loan term in months |

**Upcoming 25th logic**: if today's date > 25, next payment is the 25th of next month; otherwise the 25th of the current month.

### 3.2 Extra Repayments

- Dynamic list of extra (additional) repayments made toward the mortgage, each with:
  - **Date** (date)
  - **Description** (text)
  - **Amount** (R, numeric)
- Users can add and remove entries.
- Displayed sorted by date descending.

### 3.3 Projection Results

Simulates the loan to payoff under two scenarios:

1. **Baseline** — regular monthly repayments only (no extras).
2. **Actual** — regular repayments + all extra repayments applied in their respective months.

Both simulations use **daily compounding interest** aggregated per month:

- Monthly interest factor = `(1 + daily_rate) ^ days_in_month - 1`
- Each month: balance += balance * monthly_factor, then subtract repayment.
- Simulation runs until balance <= R 10 or 1200 months (100 years).

**Back-calculation**: when extra repayments predate the next payment date, the system back-calculates the starting balance at the earliest repayment date by reversing interest and repayment operations month-by-month.

**Displayed outputs**:

| Metric | Calculation |
|---|---|
| Interest Saved | (Baseline total interest + fees) - (Actual total interest + fees) |
| Total Extra Paid | Sum of all extra repayment amounts |
| Net Return (Cash) | Same as Interest Saved |
| Annualized Yield | XIRR of cash flows: extra repayments as outflows, then saved monthly repayments (after actual payoff until baseline payoff) as inflows |
| Time Reduced | Baseline months - Actual months, displayed as "Xy Zm" |
| New End Date | Actual simulation end date |
| Original End Date | Loan Start Date + Original Term months (or baseline end date if not specified) |

**Guard**: if the effective repayment (total repayment - service fee) does not exceed one month's interest on the current balance, results show "Never" for end dates.

### 3.4 XIRR Calculation

Newton-Raphson method to find the internal rate of return:

- Cash flows: extra repayments as negative amounts (outflows), saved future monthly repayments as positive amounts (inflows).
- Iterates up to 20 times, convergence threshold of 0.0001 on rate, or XNPV < 1.
- Returns the annualized rate.

---

## 4. RA Tab

### 4.1 Layout

The tab-level `⋯` menu (§0.4 — Import CSV…) above a full-width main area with two cards:

1. **RA Summary** — three columns:
   - Total contributed (R), count of contributions, first→last contribution date, current-tax-year total.
   - Editable **Tax refund rate (%)** input (default 41) and the **expected refund for the current tax year** computed as `min(current_year_contributions, R 430,000) × refund_rate`. Caption: "based on actual contributions to date; deductible capped at R 430,000". When any tax year's bucketed contributions exceed R 430,000, a "cap hit in some year" amber pill appears beneath the value.
   - **Performance** column (mirrors the Investments tab's per-fund layout): editable **Current fund value (R)** input (the actual statement balance — also the authoritative figure downstream consumers like the Retirement tab use as the projection starting point), then **Invested**, **Gain/Loss (R)**, **Gain/Loss %**, **Annualized %**, **6% savings would be**, and **Net vs savings** — all derived from `calculateInvestmentPerformance(raTransactions, raCurrentValue, today, marginalRate=0)` (CGT is not modelled for RA; pass `marginalRate=0` so no tax-adjusted rows are shown). When `totalInvested === 0`, all metrics render as muted zeros.
2. **Contributions** — list of contribution rows (date, description, amount, delete button). Sorted by date descending. A `+ Add` button appends a new row defaulting to today's date and `"monthly repayment"` description.

### 4.2 Persistence

- Auto-saves on any change (debounced 800ms) via POST to `/api/save/transactions_ra` and `/api/save/config_private` (or their `test_` prefixed variants in test mode).
- Auto-loads `db/transactions/ra.csv` (or `db/test/transactions/ra.csv`) for contribution rows on page open; loads `db/config.private.json` (or `db/test/config.private.json`) for RA settings (`tax_refund_rate_pct`) and `db/config.public.json` (or `db/test/config.public.json`) for shared params (`nominal_return_pct`).
- RA contribution transactions are stored in `db/transactions/ra.csv`. The actual current fund value is also stored in that file as a single `current_value,RA,<amount>,` row (mirroring the Investments tab pattern); when the input is blank, the row is omitted on save. RA settings (`tax_refund_rate_pct`, `nominal_return_pct`) are stored as keys in the appropriate config file (a flat JSON object), not inline with the transaction rows.

### 4.3 Defaults (first run, no saved file)

- `tax_refund_rate_pct = 41`
- `nominal_return_pct = 10` — no longer surfaced in the RA tab UI but kept in `db/config.public.json` so the Retirement tab's `retRaPotToday()` fallback (used only when no actual RA current fund value has been entered) can still compound contributions forward at a sensible rate.

---

## 5. Retirement

### 5.1 Tab Placement

Between the **RA** and **History** tabs. The tab header is "Retirement"; it re-renders when shown and on every input or upstream edit.

### 5.2 Sidebar (left col)

The settings sidebar is a non-sticky card (it is taller than the viewport, so it scrolls with the page). Each section below is a collapsible `<details>` element with its title as the `<summary>`; **Core is open by default, all other sections start collapsed**. Sections are separated by dividers:

**Core**
- Date of birth (date input). The current age is shown beneath as a read-only label.
- Retirement age (number input). Years to retirement shown beneath.
- **Life expectancy** (number input, default 95). Drives the lump-sum drawdown horizon. Helper label shows the resulting drawdown years.
- **Lump-sum drawdown return %** (number input, default 6). Annual return assumed on the residual lump sum during PMT-style drawdown.
- Withdrawal rate %, Effective retirement income tax rate %, CPI assumption %, all numeric.
- Toggle: "Show in today's money" — applies CPI deflation to all displayed figures. On by default (`show_real_terms` defaults to 1).

**Per-fund nominal return %**
- Discretionary, TFSA, Crypto (note: "expected nominal return, no default consensus"), RA.

**Offshore allocation**
- Discretionary offshore %, TFSA offshore %, ZAR depreciation %/yr.

**Funds available at retirement**
- Three checkboxes (default all ON): **Discretionary**, **TFSA**, **Crypto**. Unchecking a fund forces its value at every snapshot age (55, Dutch age, retirement age) to 0 in the projection. The fund's value on the Investment Tracker tab is unaffected; this is purely a "what if this account isn't there at retirement" scenario toggle.
- Helper caption: "Uncheck a fund if you expect it not to be available at retirement (e.g. spent or repurposed). The current value still appears on the Investments tab; only the retirement projection treats it as zero."

**RA structure**
- Toggle: "Commute 1/3 as lump sum at retirement" (default ON).
- Vested balance R (pre-Sep-2024 portion of current RA pot).
- Read-only label: "New contributions split 33% savings / 67% retirement (Sep 2024 rule)."

**Optional scenarios**

Each scenario has a checkbox + inline inputs (only enabled when checkbox is checked):

1. Dutch pension: **Start age** (default 68), **EUR / month** (default 900), and **EUR/ZAR rate** (default 20). All three editable when the checkbox is enabled. The monthly figure flowing into the snapshot is `opt_dutch_eur_monthly × opt_dutch_eur_zar`.
2. Max TFSA contributions: no extra inputs. On top of the current TFSA value, assumes the holder tops up to the annual R 46,000 limit every tax year (from 1 March) until the R 500,000 lifetime cap is reached; lifetime cap auto-checked from Investments transactions. (Checkbox labelled "Max TFSA contributions".)
3. Extra RA monthly: amount R/mo; soft warning when × 12 > R 430,000 deduction cap.
4. House sale: ZAR value input.
5. Inheritance: EUR amount, converted at the Dutch EUR/ZAR rate.
6. Bond payoff: outstanding balance at retirement (subtracts from lump sum).
7. Annual savings-pot withdrawal: amount R/yr (warning when 0 < amount < R 2,000).

**Persistence**
- There are no Load/Save buttons. On every input change a debounced save (800 ms) hits `/api/save/config_public` and `/api/save/config_private` (or their `test_` prefixed variants in test mode). **Import CSV…** (in the sidebar `⋯` menu) applies the imported parameters and then saves them the same way.
- On page load the tab loads `db/config.public.json` and `db/config.private.json` (merged into a single param map) and falls back to defaults silently when a file is missing.

### 5.3 Cards

**Scenarios card (pinned scenarios)**

The first card above the retirement results, id `retirement-card-scenarios`. Its header holds a **Pin scenario** button (`ret-pin-scenario`), which saves the current parameter set as a scenario under the default label `Retire at <retirement_age> · <withdrawal_rate_pct>% draw` (for the defaults: "Retire at 65 · 4% draw") and focuses the new card's label field so it can be renamed straight away.

- A **Current** card (current sidebar parameters) is always shown, followed by up to **3** pinned scenario cards. With 3 pinned, the Pin button is disabled and the hint reads "3 scenarios pinned. Remove one to pin another."
- Each card shows three headline numbers, recalculated live on every render from the same pure projection the main view uses (`calculateRetirementSnapshot`): **Net monthly at 55** (`monthly.projected55.net`), **Net monthly at D** (`monthly.projected68.net`, `D = opt_dutch_age`) and **Capital at retirement (age)** (`lumpSum.atRetirement`, the Total of "Instantly available at retirement"). The numbers are real or nominal according to the "Show in today's money" toggle; the toggle is never part of a scenario.
- A scenario card's label is an editable text field (`aria-label="Scenario name"`); the new label is saved on change, and an empty label falls back to the default label.
- **Apply** loads the scenario's parameters into the sidebar (every sidebar input updates, the params are saved and the tab re-renders) and shows the undo toast (§0.5) `Applied "<label>"`; Undo restores the parameters that were in effect before Apply.
- **Remove** deletes the scenario and shows the undo toast `Removed "<label>"`; Undo puts it back in its original position.
- Persistence: the private config key `ret_scenarios` (in `db/config.private.json`; never public) holds an array of `{ id, label, params }`. `params` holds only the retirement keys whose values differ from the defaults (`retirementParamsDiff`), so stored scenarios stay small and follow later default changes. A scenario resolves to `{ ...current params, ...defaults, ...scenario.params }` with the current `show_real_terms` (`resolveScenarioParams`); both Apply and the card numbers use this.

**Card 0 — Snapshot**

Three-column × four-row grid (label | Age 55 | Age `opt_dutch_age`):

1. **Funds available (lump sum)** — projected lump sum at each age. "Current" appears in muted text below when the two values differ.
2. **Monthly income (net)** — RA drawdown net + Dutch pension net (where applicable) at each age.
3. **Monthly from lump sum** — PMT annuity that depletes the at-retirement lump sum to zero by age `life_expectancy` at `lump_sum_drawdown_return_pct` (annual, monthly-compounded). Single value cell spans both age columns; subtitle: `PMT to age <life_expectancy> @ <rate>%`. Caption beneath the value: `over <N> months (<years> yrs)`.
4. **Max estimated monthly income** — `monthly income (net)` + `monthly from lump sum`, per age column. Rendered with an emerald accent; label includes the helper "RA + lump-sum drawdown; assumes all funds depleted by age <life_expectancy>".

A small `nominal` / `today's money` badge in the card header reflects the deflation toggle.

**Card 0-scenario — Retirement timeline (interactive)**

Positioned directly below Card 0. A single card with two side-by-side stacked **area** ApexCharts (stacked vertically on narrow viewports), x-axis = age, running from age **55** (RA access age; or the retirement age when it is below 55) to `life_expectancy`, one point per integer age. The card header carries its own `nominal` / `today's money` badge mirroring Card 0. This card replaces the earlier "Retirement timeline" (auto-PMT) and "Retirement at a glance" (3-bar) cards.

It exposes one control — **Monthly capital drawdown (from retirement)**, id `ret-scenario-drawdown`, persisted to `db/config.private.json` as `ret_scenario_monthly_drawdown` — and is driven by `snapshot.scenario` (see core-requirements §5.5b), which walks the projection month-by-month from today and samples per integer age, reflecting every ticked optional-scenario box. The help text notes the figure is a **nominal (future-rand)** amount, so with "Show in today's money" on the chart displays it deflated (appearing smaller and shrinking with age).

- **Chart 1: Monthly income through retirement** — stacked net income by source: RA annuity, RA savings-pot withdrawals (during accumulation when enabled), Dutch pension (from `opt_dutch_age` when enabled, assumed to escalate with CPI so it is flat in real terms), and the user's capital drawdown (from the retirement age).
- **Chart 2: Available capital through retirement** — stacked by pool: Discretionary, TFSA, Crypto, "RA lump + one-offs", and the annuitised RA pot.

A dashed vertical annotation marks the retirement age (where the manual drawdown begins). All-zero layers are dropped from the legend; non-finite values coerce to 0; fewer than two points shows a placeholder. Both charts re-render on every retirement-input change and every Investments/RA-tab edit that changes a current value, on the same triggers as Card 0.

**Card 1 — Monthly income (net of tax)**

Phases vary by retirement age (let `D = opt_dutch_age`):
- Retirement age < 55 → "At retirement (before 55) — R0 from RA" + "From age 55 — RA drawdown begins".
- 55 ≤ age < D → "At retirement (age X)" + "From age D — + Dutch pension" (or "(Dutch pension disabled)" greyed).
- Age ≥ D → "At retirement (age X, ≥ D) — RA drawdown + Dutch pension combined".

A de minimis banner replaces the drawdown row when the pot is below R 360,000.

**Card 2 — Instantly available at retirement**

Table with one row per source: Discretionary, TFSA (with cap note), Crypto, 1/3 RA commutation gross + tax + net (when toggled), savings-pot withdrawals net (when applicable), House sale, Inheritance (with EUR×rate note), Less: outstanding bond. Total row in indigo (red if negative; explanatory note appears in that case).

**Card 3 — RA Pot at Retirement**

Two side-by-side panels: a "today" panel and "At retirement age X", each with a vested / savings / retirement breakdown. The today-panel header dynamically reads "Today (actual fund value from RA tab)" when the user has entered a current fund value on the RA tab, or "Today (estimated from contributions × return)" otherwise. When estimated, a muted hint suggests entering the actual value on the RA tab to anchor the projection on the real situation. Below the panels: pre-retirement savings-pot withdrawal totals (when applicable), 1/3 commutation gross/tax/net, monthly drawdown gross/net, and the living-annuity depletion warning when applicable.

**Card 4 — Assumptions** (collapsible `<details>`, default closed)

Read-only key/value table summarising all in-effect assumptions: returns per fund, CPI, tax rate, FX rates, two-pot split, commutation, TFSA cap remaining, RA deduction-cap headroom (R 430,000 − last-12-months contributions), and the hardcoded constants. When the Dutch pension is enabled, a row notes it is assumed to rise with CPI (flat in real terms).

### 5.4 Edge cases

- Invalid / missing DOB → silently fall back to default 1985-08-08; current age shown as "—".
- Retirement age below current age → all FV collapse to current values + a warning banner.
- Vested balance > current RA pot → warning banner; calculation uses `min(vested, raPotToday)`.
- Retirement age < 55 → two RA phases (inaccessible at retirement, drawdown begins at 55).
- Retirement age ≥ `opt_dutch_age` → Dutch pension folded into the at-retirement phase (no separate "from D" row).
- TFSA cap already hit → no contributions added even if enabled; cap-remaining shown as R 0.
- TFSA current-year cap already hit → optional contributions skip the current tax year and resume from the next 1 March.
- RA pot < R 360,000 at retirement → de minimis banner replaces drawdown.
- Savings-pot withdrawal > available balance in a given year → silently capped at the balance.
- Savings-pot withdrawal below R 2,000 → inline validation hint (does not block input).
- Extra RA monthly × 12 > R 430,000 → soft "above SARS deduction cap" hint.
- Bond balance > total lump sum → total displays in red with an explanatory note.
- Missing `db/config.public.json` or `db/config.private.json` → all retirement settings fall back to defaults silently.

### 5.5 Data reads from other tabs

- `investmentData.currentValues.{Discretionary,TFSA,Crypto}` → seed lump-sum and TFSA growth.
- `investmentData.transactions.filter(t => t.type === 'TFSA')` → lifetime contributions and current-tax-year contributions for the cap math.
- RA pot today: prefer the user-entered actual fund value (`raCurrentValue`, parsed from the `current_value,RA,<amount>,` row in `db/transactions/ra.csv`); fall back to `calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)` only when no actual value has been entered. The chosen value seeds every RA projection (at retirement, age 55, age 68) so the projection is anchored on the real situation when available.
- `raTransactions` → contributions in the last 12 months for the deduction-cap headroom display.

All reads happen at render time; the Retirement tab never mutates other tabs' state.

---

## 6. History Tab

Aggregates all financial activity by year in a summary table, plus two charts.

**Table** — one row per calendar year:

| Column | Source |
|---|---|
| Year | Extracted from transaction/repayment dates |
| Debt Repaid | Sum of extra debt repayments for that year |
| Investments Total | Sum of all investment transaction amounts for that year (TFSA + Discretionary + Crypto) |
| TFSA | Investment transactions of type TFSA for that year |
| Discretionary | Investment transactions of type Discretionary for that year |
| Crypto | Investment transactions of type Crypto for that year |
| RA | Sum of RA contributions for that year — kept separate from the Investments Total |

- A totals row sums all columns.
- Years are sorted ascending.
- Empty values display as an em-dash.

**Charts** — both rendered with ApexCharts (the app's existing chart library) and driven by a single shared category list so colours and labels stay in sync between the two and the table:

- **Total Allocated by Category** — a donut showing the grand total across all years per category: Debt Repaid, Discretionary, TFSA, RA, Crypto. Categories with a zero total are omitted; the centre shows the combined total.
- **Allocation Timeline** — a stacked bar chart, one bar per year, stacked by the same five categories. Categories with no positive value in any year are omitted from the series.

When there is no activity at all, both charts show an explanatory placeholder instead.

---

## 7. Data Persistence

### 7.1 CSV File Format

Application state is spread across six CSV files under `db/`:

**Budget transactions** (`db/transactions/budget.csv`):
```
type,description,amount,date
savings,,<amount>,
debt,<description>,<amount>,
provision,<description>,<amount>,<date>
costfuturecost,<description>,<amount>,<date>
```

**Investment transactions** (`db/transactions/investments.csv`):
```
Date,Description,amount,account type,crypto_value
<DD-MM-YYYY>,<description>,<amount>,<type>,<btc_value>
current_value,<account_type>,<amount>,
```
- Transaction dates stored in `DD-MM-YYYY` format in CSV, converted to `YYYY-MM-DD` internally.
- `current_value` rows store per-account current values (Discretionary, TFSA, Crypto).
- `marginal_rate` is no longer emitted here; it is stored in `db/config.private.json`.

**Debt transactions** (`db/transactions/debt.csv`):
```
Date,Description,Amount
<date>,<description>,<amount>
```
- Header row only; one data row per extra repayment. All debt loan parameters (`principal`, `current_balance`, `repayment`, `service_fee`, `interest_rate`, `next_payment`, `loan_start`, `original_term`) are stored in `db/config.private.json`.

**RA transactions** (`db/transactions/ra.csv`):
```
<YYYY-MM-DD>,<description>,<amount>
```
- No header row. Each row is a contribution. RA settings (`tax_refund_rate_pct`) are stored in `db/config.private.json`; the shared param `nominal_return_pct` lives in `db/config.public.json`.
- Legacy `future_years_to_project` and `assumed_future_monthly` param rows in older saves are silently ignored on load and dropped on the next save.
- Defaults applied when a param row is missing: refund rate 41, return rate 10.

**Public config** (`db/config.public.json`) — flat JSON object:
```
{
  "<key>": <value>,
  ...
}
```
- Contains 13 generic modelling assumptions (return rates, CPI, withdrawal rate, life expectancy, etc.) that are safe to track in git. The full list is defined by `PUBLIC_PARAMS` in `src/calculations.js`.

**Private config** (`db/config.private.json`) — flat JSON object:
```
{
  "<key>": <value>,
  ...
}
```
- Contains personal data (DOB, balances), personal assumptions (marginal rate, tax rates), loan parameters, and all scenario toggles. Gitignored.
- Values are usually scalars; `ret_scenarios` is a JSON array of pinned retirement scenarios `{ id, label, params }` (§5.3), written as-is by `generateConfigJSON`.

### 7.2 Auto-Save

- All data changes trigger a debounced save (800ms delay) via POST to the server.
- There are no manual save buttons; a failed save is retried from the header chip (§0.1).
- The header save-status chip (§0.1) reflects the aggregate state of all in-flight saves: `Saving…` → `All changes saved` on success, `⚠ Save failed — Retry` on error (sticky until a successful save; the chip re-sends every failed save). Save failures are additionally logged to the console.
- On page load, all CSV files are fetched automatically: transaction files per-domain plus both config files (public and private), which are merged client-side into a single param map.

### 7.3 Server API

| Endpoint | Method | Behavior |
|---|---|---|
| `/api/save/<name>` | POST | Writes request body to the mapped CSV file. Valid names: `transactions_budget`, `transactions_ra`, `transactions_investments`, `transactions_debt`, `config_public`, `config_private` (and their `test_` prefixed variants). |
| `/<path>` | GET | Serves static files; falls back to `src/` directory if not found at project root. |

- Real data files are backed up (timestamped copy) before every write.
- Returns 400 for unknown names, 403 for writes to real data when `X-Test-Mode: true` header is set.

---

## 8. Sample data (test mode)

- Toggle pill in the header, labelled **Sample data**, switches between real data and sample data.
- When enabled:
  - A full-width amber banner under the header reads "You're viewing sample data. Changes are saved to the sample files, not your own." with a **Switch to my data** button that does the same as the pill.
  - All reads/writes use `db/test/` directory instead of `db/`, mirroring the same layout (`db/test/transactions/`, `db/test/config.public.json`, `db/test/config.private.json`).
  - Save keys are prefixed with `test_` (e.g., `test_transactions_budget`, `test_config_private`).
  - Server blocks writes to real data keys when `X-Test-Mode: true` header is present.
- Toggling reloads all datasets from the appropriate directory — transaction files for every domain plus both config files — so every tab reflects the test data without a page refresh.
- If the test-mode load fails, the mode reverts automatically.

---

## 9. Calculation Functions Reference

All pure calculation logic is extracted into a separate ES module (`calculations.js`) with the following exported functions:

| Function | Purpose |
|---|---|
| `getUpcoming25th(today?)` | Returns the next 25th as `YYYY-MM-25` |
| `calculateBudgetSummary(savings, debts, provisions, futureCosts, futureDate, today?)` | Computes net amounts, monthly savings target |
| `calculateMonthlyAllocation(available, savingsTarget, mortgage%, eft%, crypto%)` | Splits money across categories |
| `calculateInvestmentPerformance(transactions, currentValue, today?)` | Returns absolute/percentage/annualized returns, savings comparison |
| `monthlyInterestFactor(dailyRate, year, month)` | Daily rate compounded over days in a specific month |
| `simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, withExtras)` | Runs month-by-month loan simulation |
| `calculateDebtResults({currentPrincipal, totalRepayment, serviceFee, interestRate, nextPaymentDateStr, repayments})` | Orchestrates baseline vs actual simulation, computes savings |
| `xirr(cashFlows, guess?)` | Newton-Raphson XIRR calculation |
| `parseBudgetCSV(text)` / `generateBudgetCSV(data)` | Budget CSV serialization |
| `changeCommitmentType(data, id, newKind)` | Moves a budget commitment between `debts` / `provisions` / `futureCosts` (kinds `'debt'`, `'provision'`, `'futureCost'`), keeping id, description and amount; drops the date when moving to debt. Returns the input by reference on a no-op |
| `summariseCommitments(data)` | Per-kind and overall counts and amount totals for the commitments ledger filters and footer |
| `parseQuickAdd(text)` | Parses a Budget quick-add line into `{ kind, description, amount, date }` or `{ error, missing }` (§1.3); built on `parseQuickAddTokens` in `src/lib/quick-add.js` |
| `parseInvestmentCSV(text)` / `generateInvestmentCSV(data)` | Investment CSV serialization |
| `parseDebtCSV(text)` / `generateDebtCSV(repayments, params)` | Debt CSV serialization |
| `taxYearLabel(date)` | Returns the SA tax-year bucket label `YYYY/YY` (e.g. `2026/27`) |
| `parseRaCSV(text)` / `generateRaCSV(data)` | RA CSV serialization (transactions + param rows) |
| `calculateRaProjection({transactions, taxRefundRatePct, assumedFutureMonthly, futureYearsToProject}, today?)` | Per-tax-year refund buckets. The RA tab calls it with `assumedFutureMonthly: 0, futureYearsToProject: 0` and renders only the rows whose status is `actual`. Internal projection mechanics are retained for unit tests but no longer surfaced in the UI. |
| `calculatePotValueToday(transactions, nominalReturnPct, today?)` | Monthly-compounded estimate of pot value as of today |
| `retirementParamsDiff(params)` | The retirement params (keys of the defaults, minus `show_real_terms`) whose values differ from the defaults; stored as a pinned scenario's `params` |
| `resolveScenarioParams(currentParams, scenarioParams)` | `{ ...currentParams, ...defaults, ...scenarioParams }`, keeping the current `show_real_terms`; the full param set for Apply and scenario cards |
| `defaultScenarioLabel(params)` | Default pinned-scenario label `Retire at <retirement_age> · <withdrawal_rate_pct>% draw` |
