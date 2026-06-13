# Retirement Timeline Charts — Design

**Date:** 2026-06-12
**Status:** approved (user sign-off in session; "go ahead")

## Goal

Show what actually happens *over time* through retirement — not just the three
snapshot ages (55 / Dutch age / retirement age). Two continuous charts from
`retirement_age` to `life_expectancy`:

1. **Monthly income through retirement** — stacked by source: RA drawdown,
   lump-sum drawdown, Dutch pension. The Dutch pension visibly steps the total
   up at `opt_dutch_age` (e.g. 68).
2. **Available capital through retirement** — stacked: RA annuitised pot and
   lump-sum capital, both depleting (or growing) month by month.

Rendered in a new card **above** the existing "Retirement at a glance" charts.

## Simulation (pure calc)

New helper in `src/calc/retirement.js`, invoked from within
`calculateRetirementSnapshot` (where all nominal intermediates are in scope)
and returned as `snapshot.timeline`. Internally steps **monthly**, samples
**yearly** (one point per integer age).

State walked per month:

- **Lump-sum pot** — starts at the nominal at-retirement lump-sum total
  (`projectedFundsAtRet`, same figure as the "Instantly available at
  retirement" card, clamped to ≥ 0). Each month: grow at
  `lump_sum_drawdown_return_pct` (monthly compounded), pay out the fixed PMT
  (`lumpSumMonthlyNominal`). By construction it depletes to ~0 at
  `life_expectancy`. Lump-sum *income* = the PMT while the pot lasts.
- **RA pot** — drawdown starts at `max(retirement_age, 55)`:
  - `retirement_age ≥ 55`: pot starts at `raAtRetirement.total ×
    (2/3 if commuting else 1)`.
  - `retirement_age < 55`: the full pot (`raAtRetirement.total`) grows
    passively at `return_ra_pct` until 55 and produces no income; at 55 the
    pot becomes `raAt55.total × (2/3 if commuting else 1)` and drawdown
    begins. (The commuted 1/3 is **not** re-added to the lump-sum pot at 55 —
    the at-retirement lump-sum total already includes it, matching the
    existing snapshot convention.)
  - Each drawdown month: income gross = `pot × withdrawal_rate / 12`, net =
    gross × (1 − `effective_tax_rate`); pot = pot × (1 + monthly return) −
    gross. Income therefore *varies over time* (rises when return outpaces
    the withdrawal rate, falls otherwise) — same dynamics as
    `projectLivingAnnuityDepletion`.
  - **De minimis at drawdown start**: if the full RA pot is below R360,000 when
    drawdown begins, there is no annuity income (mirrors `raMonthlyIncome`'s
    `fullCommutation`). Its commutation is already inside `lumpSumAtRetirement`
    (the caller's `projectedFundsAtRet` includes `commutationRet.net`), so the
    timeline must **not** re-add it — doing so double-counts and breaks the PMT
    match, leaving the lump-sum pot growing instead of depleting.
  - **Living-annuity threshold mid-retirement**: when an actively-drawing pot
    drops below R150,000 it fully commutes — the residual net of `lumpSumTax`
    transfers into the lump-sum capital layer (capital bump, no income change)
    and RA income is 0 from then on. (That residual is not subsequently drawn by
    the fixed PMT — an accepted simplification; it persists as available capital.)
- **Dutch pension** — from `opt_dutch_age` (when enabled), adds the constant
  nominal net monthly amount to income.

Sampling: at each integer age `a` in `[retirement_age, life_expectancy]`,
record the income mix for the *first month* of that age and the capital
*before* that month's flows. `yearsFromToday = yearsToRet + (a −
retirement_age)`; when `show_real_terms` is on, every recorded value is
deflated by CPI over `yearsFromToday` (same convention as all other cards).

Output shape:

```js
timeline: [{
  age,
  income:  { ra, lumpSum, dutch, total },   // R/month, net of tax
  capital: { raPot, lumpSum, total },       // R
}, ...]
```

All income figures are net-of-tax, consistent with the Snapshot's "Max
estimated monthly income" (the lump-sum PMT is treated as net, as today).

## Rendering

`renderRetirementTimelineCharts({ containerIncome, containerCapital,
snapshot })` in `src/charts/chart_retirement.js`, reusing the module's
placeholder/instance-cleanup helpers. Two stacked **area** charts
(ApexCharts), age on the x-axis:

- Income layers: RA drawdown `#6366f1`, lump-sum drawdown `#10b981`, Dutch
  pension `#0ea5e9`.
- Capital layers: RA annuitised pot `#a855f7`, lump-sum capital `#10b981`.
- All-zero layers are dropped (same pattern as the existing charts).

New card `#retirement-card-timeline` in the HTML between the Snapshot card
and the existing charts card, with its own `nominal` / `today's money` badge
(`#retirement-timeline-badge`) behaving exactly like the existing one.
Re-renders on the same triggers (any retirement input, live investment/RA
edits, tab refresh).

## Testing

Vitest unit tests on `snapshot.timeline` via `calculateRetirementSnapshot`:

- First point at `retirement_age`, last at `life_expectancy`.
- Dutch pension layer is 0 before `opt_dutch_age` and > 0 from it (the step).
- Lump-sum capital ≈ 0 at `life_expectancy`; lump-sum income equals the PMT.
- De minimis at start: a full pot below R360k yields no RA annuity income and is
  NOT re-added to lump-sum capital (no double-count; the PMT still depletes the
  caller-provided pot).
- Threshold commutation mid-retirement: when an actively-drawing pot walks below
  R150k, RA income goes to 0 afterwards and the residual net of tax persists as
  lump-sum capital.
- `retirement_age < 55`: RA income 0 before 55, > 0 after.
- Real-terms toggle deflates values vs the nominal run.

## Out of scope

- No change to the snapshot's existing figures, the three-bar charts, or any
  persistence; the timeline derives entirely from already-computed state.
