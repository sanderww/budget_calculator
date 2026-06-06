# Budget Timeline — Planned vs Recommended Savings

**Date:** 2026-06-06
**Status:** Approved design, pending implementation
**Tab:** Budget → Timeline Overview chart

## Context

The Budget tab's Timeline Overview chart projects a savings trajectory toward
a future date, accounting for dated future costs and the debts+provisions
floor. It computes a **required monthly savings** figure (e.g. "Save R 16 271
/month") and shows it only in the headline text. A single "Monthly savings
(test)" input drives the one trajectory line; the input defaults to the
calculated required amount and is **not persisted** — every reload reverts it.

The user wants to compare their **intended** monthly savings against the
**calculated recommendation** continuously: always see the recommended amount
on the graph, drive a second line from their own input, and **save** that
intended amount so it persists across sessions. This lets them model the impact
of their intentions while the recommendation stays visible as a benchmark.

## Goal

1. Always show the calculated (recommended) trajectory on the chart.
2. Show a second trajectory driven by the user's planned amount.
3. Persist the planned amount to `config.private.json` (same auto-save
   behaviour as the rest of the app) so it reloads next time.
4. When no planned amount is saved, the planned line defaults to (overlaps)
   the recommended line, and the input shows the recommended amount as a
   placeholder.

## Behaviour

### Chart — two trajectory lines
- **Recommended** line — trajectory computed from `requiredMonthlySavings`
  (the existing calculation). Dashed, neutral colour (slate/amber). Always
  drawn.
- **Planned** line — trajectory computed from the user's planned amount.
  Solid; coloured green normally, red if the trajectory dips below the
  debts+provisions floor (existing `belowFloor` logic applies to the *planned*
  line).
- When no planned override is set, the planned amount equals the recommended
  amount, so the two lines overlap.
- The future-cost columns and the floor line are unchanged.

### Input + persistence
- Relabel the input from **"Monthly savings (test)"** to **"Monthly savings
  (planned)"**.
- The input auto-saves with the app's existing debounced config mechanism
  (`setConfig` → `persistConfig` → `debouncedSave('config_private', …)`) under
  a new key **`budget_planned_monthly_savings`**.
- **On load:** if `configMap.budget_planned_monthly_savings` is present, prefill
  the input with it; the Planned line uses it. If absent, leave the input empty,
  set its placeholder to the rounded recommended amount, and let the Planned
  line default to the recommended.
- **Clearing the input** removes the override: delete the config key, persist,
  and revert to the recommended default.
- The existing **"Use required"** button is relabelled **"Use recommended"**
  and performs the clear (empties the input and removes the saved override).

### Headline
- Unchanged. Continues to show the recommended "Save R X/month to keep above
  the R Y floor through R Z in future costs by <date>." text.

## Config key

| Key | File | Type | Meaning |
|-----|------|------|---------|
| `budget_planned_monthly_savings` | `db/config.private.json` | number (R/month) | User's intended monthly savings. Absent → use the calculated recommended amount. Non-public (not in `PUBLIC_PARAMS`), so it routes to the private config automatically. |

## Implementation outline

### `src/chart_budget_timeline.js`
- `buildBudgetTimelineSeries(...)` already computes `requiredMonthlySavings`
  and an `effectiveMonthlySavings` (planned-or-required). Add a second
  piecewise step-down line built from `requiredMonthlySavings` and return it
  as `recommendedLine`, alongside the existing `savingsLine` (the planned
  line). The step-down dates are identical; only the slope differs.
- `buildChartOptions(...)` — add a 4th series **"Recommended"** (line). Extend
  the `series`, `stroke.width`, `stroke.curve`, `stroke.dashArray`, `colors`,
  and `markers.size` arrays. Recommended line: dashed, neutral colour; Planned
  line keeps the `belowFloor` red/green colour. Bars stay at series index 0 so
  the custom tooltip is unaffected.

### `src/budget_calculator.html`
- Relabel input and button text; update the "Not saved" helper copy.
- In `calculateAndDisplaySummary`: read the override from `configMap`; pass it
  as `plannedMonthlySavings`; set the input's **placeholder** to the rounded
  recommended amount instead of auto-filling its value.
- Input `input` listener: when non-empty valid number → `setConfig
  ('budget_planned_monthly_savings', value)`; when emptied → delete the key and
  `persistConfig()`, then re-render.
- On init/load (where other config-driven inputs are populated): prefill the
  input from `configMap.budget_planned_monthly_savings` if present.
- "Use recommended" button: clear input value, remove the saved override,
  re-render.

### `tests/chart_budget_timeline.test.js`
- `recommendedLine` is present and built from `requiredMonthlySavings`.
- With no `plannedMonthlySavings`, `recommendedLine` and `savingsLine`
  coincide.
- With a `plannedMonthlySavings` below the required, the planned line ends
  lower than the recommended line (and `belowFloor` reflects the planned line).

### Docs
- `docs/specs/core-requirements.md` — new requirement row for the
  planned-vs-recommended lines and the `budget_planned_monthly_savings` key.
- `docs/specs/functional-requirements.md` — update the Timeline Overview
  description (two lines, planned input, persistence, placeholder, button).

## Out of scope
- No change to the required-savings calculation itself.
- No public-config exposure of the planned amount.
- No multi-scenario comparison beyond the single planned-vs-recommended pair.
