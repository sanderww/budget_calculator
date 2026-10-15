# UX Redesign — Quick Wins, Commitments Ledger, Runway, Live Allocation

**Date:** 2026-10-15
**Status:** Draft design, pending approval
**Tabs:** App shell, Budget, Investments, Debt, RA, Retirement
**Tracked in:** `docs/to_do.md` → "UX redesign" (item IDs `UX-0.x` … `UX-4.x` below match the to-do entries)
**Workshop:** https://claude.ai/artifact/954pbkQHC4EyoEWK8WMk1b (review + interactive mockups of concepts A, B, C)

## Context

A UX review of the app found that the calculations are sound but the screens
are organised around storage (one tab per data file) rather than around the
questions the user asks: *can I afford this, and when?*, *is my list of
commitments right?*, *am I on track?* Concrete friction points:

1. **Two save models.** Edits already auto-save through `debouncedSave`
   (`src/app/persistence.js`), yet every tab also shows a Save button, four tabs
   show a Load button (actually a CSV *import* via a file picker), and the
   header has a manual Refresh button. Each extra control implies the auto-save
   chip might be wrong.
2. **Instant, irreversible delete.** The red trash button on every list row
   (`createRowElement` in `src/lib/rows.js`) removes the row and auto-saves
   within 800 ms. There is no undo.
3. **The Budget answer is split.** "Net savings on [date]" sits in the summary
   card, its date picker is inside that card, and the timeline that explains it
   is below the fold. Future costs are typed into a list that is not visually
   connected to the timeline.
4. **Raw numbers in inputs.** Amount inputs are `type="number"` and show
   `400000`, while every output uses `fmtZAR` (`R 400,000.00`).
5. **Allocation needs a click and can error.** "Calculate Allocation" must be
   pressed, and the result is refused when percentages exceed 100. The
   percentages are not persisted.
6. **Developer details on screen.** Toolbars print `db/transactions/*.csv`.
   Test mode changes which files are written, but is shown as a small pill and
   a tiny "SAMPLE DATA" label.
7. **Inaccessible help.** The CGT explanation lives in a `title` tooltip,
   unreachable by touch or keyboard.

The work is split into five phases, ordered by value per effort. Each phase is
independently shippable and leaves the CSV/JSON schemas unchanged unless a
section says otherwise.

## Non-goals

- No change to any calculation in `src/calc/` except the new pure helpers
  named below.
- No change to the CSV layouts in `db/transactions/` or to `server.py`.
- No automatic future-cost → provision conversion. The 2026-08-11 design
  ("Future Cost → Provision Conversion") stays authoritative: the move is
  always a user action, because a past-due cost may have been spent rather
  than saved.
- No currency-notation change. `src/lib/format.js` (`en-US` grouping,
  `R 3,000.50`) remains the single source of truth.

---

## Phase 0 — Quick wins

### UX-0.1 One save model

**Behaviour**
- Remove the per-tab **Save** buttons (`#save-csv`, `#save-inv-csv`,
  `#save-debt-csv`, `#save-ra-csv`, `#ret-save-csv`) and the header
  **Refresh** button (`#refresh-current`).
- The header save-status chip becomes the only save indicator. When it shows
  `⚠ Save failed`, it is a button labelled **"Save failed — Retry"** that
  re-sends every save that failed since the last success.
- The chip is shown at every width (it is currently `hidden sm:flex`).
- The per-tab **Load** buttons are renamed **"Import CSV…"** and moved into a
  small per-tab overflow menu (`⋯`) in the tab toolbar, together with the file
  path text (see UX-0.4). Behaviour of the import itself is unchanged.

**Implementation**
- `persistence.js`: keep a `Map<name, csvFn>` of saves that failed. On any
  successful save of `name`, delete it from the map. A new exported
  `retryFailedSaves()` calls `saveToServer` for each entry. The chip's click
  handler calls it.
- The `btnId` parameter of `saveToServer` / `debouncedSave` (used only to flash
  "Saved!" on the removed buttons) is removed, along with its call sites.
- Refresh: every tab already re-renders on input or on `onShow`
  (`TABS` in `main.js`). Remove `REFRESH_ACTIONS` and the button. If a tab is
  found that doesn't re-render after an edit, fix that tab rather than keeping
  the button.

**Tests:** `retryFailedSaves` re-sends only failed names; a success clears the
failure (vitest, `fetch` stubbed; test keys only).

### UX-0.2 Undo for deletes

**Behaviour**
- Deleting a row in any editable list (Budget debts/provisions/future costs,
  investment transactions, debt extra repayments, RA contributions) removes it
  immediately and shows a toast at the bottom of the viewport:
  *Deleted "School fees" (R 45,000.00) — Undo*. The toast stays for 8 seconds
  or until the next delete replaces it.
- **Undo** puts the row back at its original index with the same `id`, then
  triggers the normal debounced save.
- The trash button changes from a solid red `btn-danger` square to a neutral
  icon button that turns red on hover/focus.

**Implementation**
- New `src/lib/undo-toast.js`: `showUndoToast({ message, onUndo })`, with a
  single toast element appended to `<body>`, `role="status"` and
  `aria-live="polite"`. The Undo button is keyboard-focusable. It does not take
  focus automatically.
- Each controller's remove branch records `{ item, index, list }` and passes an
  `onUndo` closure that splices the item back in, re-renders and saves.
- The delete is saved straight away, not held back until the toast closes. The
  saved file always matches what's on screen, and Undo saves the restored row
  as a new edit.

**Tests:** happy-dom test that delete and then Undo restores the row at the same
index with the same id.

### UX-0.3 Formatted amount inputs

**Behaviour**
- Amount inputs show grouped values when not focused (`400,000` or
  `45,000.50`, using `fmtNum` with up to two decimals) and the raw value while
  focused.
- Accepted input: `45000`, `45,000`, `45000.5`, `R 45,000.50`, `45k`, `1.2m`.
  Invalid text leaves the stored value unchanged and adds an `aria-invalid`
  red border until it is corrected.
- Mobile keyboards show the decimal keypad.

**Implementation**
- `src/lib/format.js`: new pure `parseAmount(text) → number | null`.
- `createRowElement` and the static amount inputs in `budget_calculator.html`
  switch from `type="number"` to `type="text" inputmode="decimal"`. A shared
  `bindAmountInput(el, { get, set })` helper in `src/lib/rows.js` handles the
  focus/blur formatting and parsing.
- Stored state and CSV values stay plain numbers.

**Tests:** `parseAmount` table test in `tests/format.test.js` (including
`''` → `null`, `'abc'` → `null`, `'1,2'` → `null`, `'-500'` → `-500`).

### UX-0.4 Hide file paths

- Remove the `db/transactions/*.csv` path text from the tab toolbars. The
  overflow menu (UX-0.1) shows it as a muted footnote under "Import CSV…" so
  it can still be found.

### UX-0.5 Sample-data banner

- Rename the header pill from "Test Mode" to **"Sample data"**.
- When it is on, a full-width amber banner appears directly under the header:
  *You're viewing sample data. Changes are saved to the sample files, not your
  own.* It has a **Switch to my data** button that does the same as the pill.
- Remove the tiny `#test-mode-label`. The banner replaces it.

### UX-0.6 Accessible help popovers

- Replace `title` tooltips that hold explanations (the CGT info icon on
  Investments, plus any others found with `grep -n 'title="' src/budget_calculator.html`
  whose text is longer than one line) with a button that toggles a small
  panel. The button has `aria-expanded`, Escape closes the panel and clicking
  outside dismisses it. Use one shared helper in `src/lib/`.

### UX-0.7 Refresh the README screenshot

- Replace `assets/UI.png` (it still shows the three-tab layout) after
  Phase 1 lands. Capture it in sample-data mode.

---

## Phase 1 — Commitments ledger (Concept B)

Replaces the three Budget cards **Debts**, **Provisions** and **Future Costs**
with one table. The "Current Savings" card, the summary column and the
timeline stay where they are in this phase.

### UX-1.1 Unified table

**Behaviour**
- One card, **Commitments**, with columns: **Type** · **Description** ·
  **Amount** · **Due** · actions.
- **Type** is a select styled as a coloured chip: Debt (red), Provision
  (amber), Future cost (blue).
- **Due** is a date input. For Debt rows the cell is empty and not editable,
  because the budget CSV stores no date for debts (`generateBudgetCSV`).
- Rows are sorted soonest-first using `sortByDateThenIdAsc`. Rows without a
  date (all debts, and any freshly added row) go at the top, as they do
  today.
- The footer shows the total for the current filter. When the filter is All, it
  also shows the per-type subtotals.
- Empty state: *No commitments yet. Type one above, for example "school fees 45k 2027-01-15".*

**Implementation**
- `budgetData` keeps its shape (`debts`, `provisions`, `futureCosts`). The
  table is a view built from the three arrays, and each row carries its kind.
  Nothing changes in `parseBudgetCSV` / `generateBudgetCSV`.
- New pure function in `src/calc/budget.js`:
  `changeCommitmentType(data, id, newKind) → data`. It moves the row between
  arrays and keeps its `id`, `description` and `amount`. Moving to Debt drops
  `date`. If the id isn't found, it returns the input by reference (the same
  convention as `convertFutureCostToProvision`). Changing a row to Debt when it
  has a date shows the UX-0.2 toast: *Date removed — debts have no due date.
  Undo*.
- Row rendering can either extend `createRowElement` with a `kindSelect` field
  type or use a new `createCommitmentRow` in `rows.js`. Choose whichever keeps
  `rows.js` simpler. The other tabs must not change.

### UX-1.2 Filters

- Chip group above the table: **All (n)** · **Debts (n)** · **Provisions (n)**
  · **Future costs (n)**, using `aria-pressed`. The chosen filter is remembered
  in `localStorage` (wrapped in try/catch) and is not saved to config.

### UX-1.3 Quick-add

**Behaviour**
- A single text field above the table: *Add a commitment — e.g. "car service
  6.5k mar 2027" or "credit card 12000 debt"*.
- While the user types, a preview line shows what will be added: *Will add
  **Future cost** · **Car service** · **R 6,500.00** · due **2027-03-01***.
  Pressing Enter adds the row, but only when both a description and an amount
  were found. Otherwise the preview says which one is missing.
- Parsing rules, in order:
  1. Type keyword: `debt` or `provision` anywhere (case-insensitive). The
     default type is Future cost.
  2. Date: `YYYY-MM-DD`, or `<month name or 3-letter abbr> YYYY` (becomes the
     1st of that month).
  3. Amount: the first token that `parseAmount` accepts.
  4. Description: what remains, with whitespace collapsed and the first letter
     capitalised.
- The existing **+ Add** buttons are removed. Adding a blank row is still
  possible with Enter on an empty field followed by a type choice, or the
  quick-add can be skipped by tabbing into the table.

**Implementation:** pure `parseQuickAdd(text) → { kind, description, amount,
date } | { error }` in `src/calc/budget.js`, re-exported via
`src/calculations.js`. **Tests:** table-driven cases in
`tests/calculations.test.js`, including tricky inputs such as "2027 budget
review 5k" (the year in the description must not become the amount).

### UX-1.4 Past-due future costs

- Future-cost rows where `isPastDue(date)` is true get a **Past due** badge
  and a text button **Move to provisions** (it replaces the icon-only arrow).
  The button calls the existing `convertFutureCostToProvision`. The move stays
  manual (see Non-goals).

### Docs (Phase 1)

- Update `core-requirements.md` (domain concept: "commitment" as the umbrella
  term for debt/provision/future cost) and `functional-requirements.md`
  (Budget §: replace the three-list description with the ledger).

---

## Phase 2 — Runway timeline (Concept A)

### UX-2.1 Timeline first

- Move the **Timeline Overview** card to the top of the Budget tab, full
  width, above the Commitments ledger. The summary column stays to the right
  of the ledger.
- Show the chart even when there are no future costs inside the chosen range.
  Today `buildBudgetTimelineSeries` returns `null` in that case. Draw a flat
  planned line instead and add an empty-state note.

### UX-2.2 Target date on the chart

- The target date (`#future-date`) can be set by dragging a vertical marker on
  the chart (ApexCharts x-axis annotation plus a range input under the chart,
  over the same time range) or by typing in the date input, which stays as a
  keyboard fallback. Both update the same value.
- **Chart horizon:** today → the later of (target date, latest dated future
  cost) + 3 months, and at least 12 months. Moving the target date no longer
  changes the horizon, so the chart doesn't jump while dragging.
- **Implementation:** split the horizon out of `buildBudgetTimelineSeries`. It
  gets a `horizonDate` parameter, while `futureDate` keeps its current meaning
  for the recommended-savings maths. The current output must stay identical
  when `horizonDate === futureDate` (regression tests in
  `tests/chart_budget_timeline.test.js`).

### UX-2.3 Events on the line

- Each dated future cost is drawn as a point on the planned line at its date,
  coloured like the Future-cost chip. Hovering shows the description and
  amount. Clicking scrolls to its ledger row and highlights it for 1.5 s.
- Provisions are not drawn. They are already subtracted from today's figure,
  so drawing them at their dates would suggest they haven't been paid yet.

### UX-2.4 Lowest point and buffer

- New read-out above the chart: **Lowest point ahead** = the minimum of
  (planned trajectory − floor) between today and the horizon, together with its
  date. It turns amber when it falls below the minimum buffer.
- New setting **Minimum buffer (R)** next to "Monthly savings (planned)",
  stored as config key `budget_min_buffer` (private, default 0). Leaving it
  blank removes the key.
- New read-out: **Save per month to stay above buffer**. This is the smallest
  monthly rate that keeps the trajectory at or above floor + buffer at every
  cost date and at the horizon. It is the same constraint loop as
  `requiredMonthlySavings`, with the buffer added to the floor.
- **Implementation:** pure `lowestPoint(trajectory, floor)` and an optional
  `buffer` argument for the required-savings loop, both in
  `src/charts/chart_budget_timeline.js` (or moved to `src/calc/budget.js` if
  that reads better), with unit tests.
- The KPI strip's "Net savings on [date]" keeps reading the same value.

### Docs (Phase 2)

- `core-requirements.md`: add the formulas for lowest point and buffer.
  `functional-requirements.md`: Budget timeline section.

---

## Phase 3 — Live allocation and scenarios (Concept C)

The Retirement tab already has a collapsible assumptions sidebar
(`#retirement-sidebar`, `<details>` groups) and re-renders on every input
(`retWireInputs`), so most of Concept C already exists there. This phase only
adds the parts that are missing.

### UX-3.1 Live, self-balancing allocation

**Behaviour**
- Remove **Calculate Allocation** and `#allocation-error`. The results update
  on every input.
- Rename the user-facing "EFT" labels to **ETF** (exchange-traded fund):
  `budget_calculator.html` (the `EFT %` label and the `EFT` result row) and the
  allocation sections of both requirement docs. Internal identifiers
  (`eft-percentage`, `eftAmount`, `eftPercentage`) keep their names to limit
  churn.
- Mortgage % and ETF % are editable. **Crypto % becomes read-only and always
  equals 100 − Mortgage − ETF.** If an edit would push Mortgage + ETF over 100,
  the other editable field is reduced to fit, and a one-line hint says so.
- The results become one horizontal stacked bar (Required savings, Mortgage,
  ETF, Crypto) with amounts under it. Leftover is shown only when it isn't zero.
- Available money and the two percentages are saved to config as
  `budget_alloc_available`, `budget_alloc_mortgage_pct` and
  `budget_alloc_etf_pct` (private keys).

**Implementation:** pure `balanceAllocation({ mortgage, eft }, changedField) →
{ mortgage, eft, crypto }` in `src/calc/budget.js`. `calculateMonthlyAllocation`
is unchanged. **Tests:** clamping, rounding to 0.1, and that the result always
sums to 100.

### UX-3.2 Retirement scenarios

**Behaviour**
- A **Pin scenario** button above the retirement results saves the current
  parameter set under a label the user can edit (default: "Retire at 65 ·
  4% draw").
- Up to 3 pinned scenarios appear as cards next to a **Current** card. Each
  card shows the headline numbers recalculated live: net monthly income at 55
  and at 68 (real or nominal, following the existing "Show in today's money"
  toggle) and the capital at retirement.
- Each card has **Apply**, which loads its parameters into the sidebar (undo
  through the UX-0.2 toast), and **Remove**.

**Implementation**
- Config key `ret_scenarios` (private) holds an array of
  `{ id, label, params }`. `params` stores only the keys whose values differ
  from the defaults, so stored scenarios stay small and pick up new defaults.
  Check that `generateConfigJSON` writes arrays correctly. It uses
  `JSON.stringify`, so it should. `PUBLIC_PARAMS` doesn't change.
- Card numbers come from the same pure projection the main view uses, called
  with `{ ...currentParams, ...scenario.params }`.

### Docs (Phase 3)

- `functional-requirements.md`: Budget allocation section and Retirement
  section. `core-requirements.md`: list the new config keys.

---

---

## Phase 4 — Ledger pattern on the other tabs

Investments, Debt and RA each have a transaction list built with
`createRowElement`. Once Phase 1 has proven the ledger, these lists get the
same table, filters, quick-add and undo. Their CSV layouts and their sort
order (newest first, `sortByDateThenIdDesc`) stay the same.

### UX-4.1 Shared ledger component

- Pull the Phase 1 table into `src/lib/ledger.js`:
  `createLedger({ container, columns, filters, quickAdd, getRows, onChange, onRemove, sort })`.
  It renders the header, the filter chips with counts, the footer totals, the
  quick-add field with its preview line, the empty state and the undo toast
  (UX-0.2).
- The Budget Commitments table (Phase 1) is moved onto it first, with no change
  in behaviour. This is the regression check for the extraction.
- Quick-add parsing is split into a general token parser
  (`parseQuickAddTokens(text, { keywords }) → { keyword, description, amount, date }`
  in `src/lib/`). Each tab supplies its own keyword map.
- For transaction tabs, quick-add uses **today** as the date when none is
  given, because these lists record things that have already happened.

### UX-4.2 Investment transactions

- Columns: **Date** · **Description** · **Amount** · **Account** (chip:
  Discretionary, TFSA, Crypto) · **BTC** (only shown for Crypto rows, as the
  cryptoValue field works today) · actions.
- Filters: **All** · **Discretionary** · **TFSA** · **Crypto**, each with a
  count and a total contributed.
- Quick-add keywords: `tfsa`, `crypto` / `btc`, `disc` / `discretionary`
  (default Discretionary). A number followed by `btc` (for example
  `0.012 btc`) fills the BTC field and isn't read as the rand amount.
- The account chip colours must be the same as on the History tab's donut.

### UX-4.3 Debt extra repayments

- Columns: **Date** · **Description** · **Amount** · actions.
- Filters by calendar year (one chip per year present, plus All), with the
  total for the year in the footer. This matches how History groups debt
  repayments.
- Quick-add: `5k bonus repayment` adds a repayment dated today.

### UX-4.4 RA contributions

- Columns: **Date** · **Description** · **Amount** · actions.
- Filters by **SA tax year** (1 March – end February), labelled "2026/27"
  and so on, because the RA tax-refund figure applies per tax year. The footer
  shows the total for the selected tax year.
- Pure helper `saTaxYear(isoDate) → '2026/27'` in `src/calc/ra.js`, with
  tests for 28/29 February and 1 March.

### Docs (Phase 4)

- `functional-requirements.md`: the Investments, Debt and RA transaction-list
  sections. `core-requirements.md`: SA tax-year grouping for RA.

---

## Decisions

1. **EFT → ETF** (2026-10-15): the allocation means an exchange-traded fund.
   The labels are renamed in UX-3.1.
2. **Ledger on other tabs** (2026-10-15): yes. This is Phase 4 of this spec.

## Verification (every phase)

- `npm test` passes, with new tests for each new pure function.
- Manual check in **sample-data mode only** (`make start`, then toggle Sample
  data). Never POST to the real save endpoints during verification.
- Update both spec documents (`core-requirements.md`,
  `functional-requirements.md`) before calling a phase done.
