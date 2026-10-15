# UX Redesign — Implementation Plan

**Spec (binding authority):** `docs/specs/2026-10-15-ux-redesign-design.md`
**To-do:** `docs/to_do.md` → "UX redesign" (tick items `UX-x.y` as their task lands)
**Branch:** `dev` (project rule: all work on `dev`; never commit to `main`)

Each task implements the spec sections it names. The spec is the
requirements: read every named section in full before starting. Exact
values (labels, config keys, function names and signatures, timings, copy)
come from the spec verbatim.

## Global Constraints

- Work on branch `dev`, in the repo root. Commit with conventional-commit
  subjects matching the history (`feat(budget): …`, `refactor(rows): …`,
  `docs(…): …`). End every commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Data safety:** never POST to `/api/save/budget`, `/api/save/investments`,
  `/api/save/debt` or any non-`test_` save key. Never read, list or touch
  `/Users/sanderwiersma/Documents/budget_backups/`. Never read the real
  `db/*.csv`, `db/transactions/*.csv` or `db/config.private.json`; they hold
  real financial data. Tests stub `fetch`.
- **Do not modify `src/server.py`.**
- Currency display uses only the formatters in `src/lib/format.js`
  (`en-US` grouping, `R 3,000.50`). Never call `toLocaleString` directly in
  modules, and never use the `en-ZA` locale.
- All calculation logic stays pure in `src/calc/*` (re-exported via
  `src/calculations.js`) or in pure helpers in `src/lib/`/`src/charts/`, and
  is unit-tested with vitest (`npm test`). DOM behaviour is tested with
  happy-dom where the spec asks for it.
- CSV layouts and existing config keys are unchanged unless the spec says
  otherwise.
- Styling: Tailwind v3 classes plus `src/styles/app.css`. If you add Tailwind
  classes that aren't already in the compiled CSS, run `npm run build:css`
  and commit the regenerated `src/styles/tailwind.css`.
- **Docs:** every task updates `docs/specs/core-requirements.md` and
  `docs/specs/functional-requirements.md` to match the new behaviour (project
  rule from `.claude/CLAUDE.md`). Remove statements that are no longer true,
  such as the header Refresh button in functional §0.1.
- `npm test` must pass, with clean output, before every commit.
- Accessibility: visible focus states, real `<button>` elements, and
  `aria-*` attributes as the spec names them.

---

## Task 1: App shell — one save model, hidden paths, sample-data banner, help popovers

Implements spec sections **UX-0.1 One save model**, **UX-0.4 Hide file
paths**, **UX-0.5 Sample-data banner** and **UX-0.6 Accessible help
popovers**.

Files likely touched: `src/app/persistence.js`, `src/app/main.js`,
`src/app/budget.js`, `src/app/investments.js`, `src/app/debt.js`,
`src/app/ra.js`, `src/app/retirement.js`, `src/budget_calculator.html`,
`src/styles/app.css`, new helpers in `src/lib/` (overflow menu, popover),
tests in `tests/`.

Notes:
- The per-tab overflow menu (`⋯`) holds "Import CSV…" (the existing
  file-picker import behaviour, unchanged) and the muted file-path footnote.
  Tabs without an import keep no menu. Today Budget has no Load button, so
  its menu shows only the footnote, or no menu at all if that reads better.
  Choose one and say which in the report.
- Each existing Load handler (Investments, Debt, RA, Retirement) keeps its
  behaviour and is only triggered from the new menu item.
- Remove `REFRESH_ACTIONS` and `#refresh-current`. Confirm that every tab
  re-renders after edits.
- The `btnId` parameter is removed from `saveToServer`/`debouncedSave` and
  from all call sites.
- Tests: `retryFailedSaves` (failed names re-sent, success clears the
  failure; `fetch` stubbed, test keys only). Also a happy-dom test for the
  popover helper (toggle, `aria-expanded`, Escape closes it).
- Tick UX-0.1, UX-0.4, UX-0.5 and UX-0.6 in `docs/to_do.md`. The file is
  git-ignored, so edit it on disk and don't commit it.

## Task 2: Undo for deletes and formatted amount inputs

Implements spec sections **UX-0.2 Undo for deletes** and **UX-0.3
Formatted amount inputs**.

Files likely touched: new `src/lib/undo-toast.js`, `src/lib/format.js`
(`parseAmount`), `src/lib/rows.js` (`bindAmountInput`, trash-button
restyle, amount input `type="text" inputmode="decimal"`), the remove
branches in `src/app/budget.js`, `investments.js`, `debt.js` and `ra.js`,
the static amount inputs in `src/budget_calculator.html` (current savings,
available money, planned savings, investment current values, debt amounts,
RA value and any others that hold rand amounts), `src/styles/app.css`, and
tests in `tests/format.test.js`, `tests/rows.test.js` and a new undo-toast
test.

Notes:
- Percent, age and BTC inputs stay `type="number"`. Only rand amounts
  change.
- Every place that reads an amount input's `.value` must go through the
  parsed value, not `parseFloat(el.value)` on a formatted string such as
  `"400,000"`. That would silently give 400. Grep for `parseFloat(` on
  amount inputs and fix each one. This is the main risk in this task.
- Tick UX-0.2 and UX-0.3 in `docs/to_do.md`.

## Task 3: Commitments ledger on the Budget tab

Implements spec sections **UX-1.1 Unified table**, **UX-1.2 Filters**,
**UX-1.3 Quick-add** and **UX-1.4 Past-due future costs**, plus "Docs
(Phase 1)".

Builds on Task 2: use `parseAmount`, `bindAmountInput` and
`showUndoToast`.

Files likely touched: `src/calc/budget.js` (`changeCommitmentType`,
`parseQuickAdd`), `src/calculations.js` (re-exports), `src/lib/rows.js`
(commitment row), `src/app/budget.js`, `src/budget_calculator.html`, tests
in `tests/calculations.test.js` and `tests/rows.test.js`.

Notes:
- `budgetData` keeps the shape `{ savings, debts, provisions, futureCosts }`.
  The CSV must round-trip byte-for-byte as before. Add a test that parses,
  then generates, and compares.
- `convertFutureCostToProvision` and `isPastDue` are reused unchanged.
- Tick UX-1.1 to UX-1.4 in `docs/to_do.md`.

## Task 4: Runway timeline

Implements spec sections **UX-2.1 Timeline first**, **UX-2.2 Target date on
the chart**, **UX-2.3 Events on the line** and **UX-2.4 Lowest point and
buffer**, plus "Docs (Phase 2)".

Files likely touched: `src/charts/chart_budget_timeline.js`,
`src/app/budget.js`, `src/budget_calculator.html`,
`tests/chart_budget_timeline.test.js`.

Notes:
- Regression: with `horizonDate === futureDate`, `buildBudgetTimelineSeries`
  output is identical to today's. Pin it with a test written **before** the
  change.
- Clicking a marker scrolls to the Task 3 ledger row (rows carry
  `data-id`) and highlights it for 1.5 s.
- `budget_min_buffer` is a private config key and goes through
  `setConfig`/`unsetConfig`.
- Tick UX-2.1 to UX-2.4 in `docs/to_do.md`.

## Task 5: Live, self-balancing allocation

Implements spec section **UX-3.1 Live, self-balancing allocation**,
including the EFT → ETF label rename.

Files likely touched: `src/calc/budget.js` (`balanceAllocation`),
`src/calculations.js`, `src/app/budget.js`, `src/budget_calculator.html`,
`tests/calculations.test.js`, and both requirement docs (rename EFT → ETF in
the allocation sections).

Notes:
- `calculateMonthlyAllocation` is unchanged.
- The config keys are `budget_alloc_available`, `budget_alloc_mortgage_pct`
  and `budget_alloc_etf_pct` (private). Load them at startup after
  `loadConfigFromServer`, the same way `applyPlannedSavingsFromConfig` does.
- Tick UX-3.1 in `docs/to_do.md`.

## Task 6: Retirement scenarios

Implements spec section **UX-3.2 Retirement scenarios**, plus "Docs (Phase
3)" for the Retirement part.

Files likely touched: `src/app/retirement.js`, `src/calc/retirement.js`
(only if a pure helper is needed, for example the default-diff of params),
`src/budget_calculator.html`, `tests/retirement-scenario.test.js` or a new
test file.

Notes:
- Store `ret_scenarios` as a private config key holding an array of
  `{ id, label, params }`, where `params` contains only the keys that differ
  from the defaults. Add a test that `generateConfigJSON` /
  `parseConfigJSON` round-trip the array.
- Apply uses the UX-0.2 undo toast (Task 2) to restore the previous
  parameters.
- Tick UX-3.2 in `docs/to_do.md`.

## Task 7: Shared ledger component

Implements spec section **UX-4.1 Shared ledger component**.

Files likely touched: new `src/lib/ledger.js`, new
`parseQuickAddTokens` in `src/lib/`, `src/calc/budget.js` (`parseQuickAdd`
is rebuilt on the token parser), `src/app/budget.js`, and tests.

Notes:
- This is a pure refactor for the Budget tab. Its behaviour and existing
  tests must not change, and every Task 3 test must still pass unchanged.
- The component must support what Task 8 needs: a configurable column set
  (including a conditional column, BTC on Crypto rows only), generated filter
  sets (per year, per SA tax year), newest-first sort, and quick-add with a
  default date of today.
- Don't tick anything yet. UX-4.1 is ticked together with Task 8.

## Task 8: Ledger on Investments, Debt and RA

Implements spec sections **UX-4.2 Investment transactions**, **UX-4.3 Debt
extra repayments** and **UX-4.4 RA contributions**, plus "Docs (Phase 4)".

Files likely touched: `src/app/investments.js`, `src/app/debt.js`,
`src/app/ra.js`, `src/calc/ra.js` (`saTaxYear`), `src/budget_calculator.html`,
and tests.

Notes:
- CSV formats and newest-first order are unchanged. Add round-trip tests per
  tab.
- The account chip colours match the History donut (`src/charts/chart_history.js`).
- Tick UX-4.1 to UX-4.4 in `docs/to_do.md`.
