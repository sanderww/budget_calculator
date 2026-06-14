# Interactive Retirement Scenario Timeline — Design

**Date:** 2026-06-14
**Status:** approved (user sign-off in session) — replaces the 2026-06-12 timeline charts.

## Goal

Let the user play with retirement scenarios on one interactive view: see, per age
from 55 to life expectancy, what monthly income and what available capital they'd
have under whatever combination of options is ticked — and add a manual monthly
capital drawdown to watch capital deplete.

## Decisions (from the clarifying round)

1. **Span:** age **55** → life expectancy (start at `min(55, retirement_age)`).
   55 is the RA-access age; the accumulation run-up (55 → retirement) is shown and
   the retirement age is drawn as a vertical line where drawdown begins.
2. **"Both RA amounts":** RA **annuity income** + RA **savings-pot withdrawals**
   (the latter during accumulation, when that scenario is enabled).
3. **Manual drawdown depletion:** **proportional** across the liquid pools.
4. **Replacement:** this replaces **both** prior chart cards (the auto-PMT timeline
   and the 3-bar "Retirement at a glance").

## Model (pure calc: `buildRetirementScenarioTimeline`, in `src/calc/retirement.js`)

Walks month-by-month from today; samples one point per integer age over
`[startAge, lifeExp]`. Returns `snapshot.scenario`.

- **Pools (nominal), grown monthly at their own returns:** discretionary, TFSA,
  crypto (each gated by `opt_include_*`); the RA two-pot (vested / savings /
  retirement); `raLumpOneOff` (a liquid bucket for commuted RA + one-off events).
- **Accumulation (`age < retirement_age`):** pools grow; extra RA contributions
  (`opt_ra_monthly_*`, split 33/67); max-TFSA top-ups each 1 March until the
  lifetime cap; savings-pot withdrawals → RA savings-pot income. No annuity, no
  manual draw.
- **At retirement age:** one-offs land in liquid capital (`+house +inheritance
  −bond`); manual drawdown starts.
- **At `max(retirement_age, 55)`:** annuitise RA (×2/3 if commuting; full
  commutation below the R360k de minimis → liquid, net of lump-sum tax); annuity
  income `pot×wd/12` net, `pot = pot(1+r) − gross`; sub-R150k residual commutes to
  liquid capital and income stops.
- **Dutch pension:** flat net amount from `opt_dutch_age` when enabled.
- **Manual drawdown** (`ret_scenario_monthly_drawdown`, persisted private): from the
  retirement age, drawn proportionally across the liquid pools, capped at the
  remaining liquid total (never negative); `drawdownExhaustedAge` records the first
  capped age.
- **Real terms:** deflate every sampled value by CPI from today to that age when
  `show_real_terms` is on.

Output point: `{ age, income:{raAnnuity, raSavingsPot, dutch, manualDraw, total},
capital:{discretionary, tfsa, crypto, raLumpOneOff, raPot, total} }`.

## Rendering (`src/charts/chart_retirement.js`)

`renderRetirementScenarioCharts({containerIncome, containerCapital, badge, snapshot})`
— two stacked **area** ApexCharts (income by source, capital by pool), x-axis = age,
dashed vertical annotation at `retAge`, `nominal`/`today's money` badge, all-zero
layers dropped, non-finite coerced to 0, placeholder when < 2 points. The old
`buildRetirementChartsSeries` / `renderRetirementCharts` / `renderRetirementTimelineCharts`
were removed.

## UI (`src/budget_calculator.html`) + wiring (`src/app/retirement.js`)

One card `#retirement-card-scenario` below the Snapshot, with the
`#ret-scenario-drawdown` input and the two chart containers
(`#retirement-chart-income`, `#retirement-chart-capital`, badge
`#retirement-scenario-badge`). The input is bound through the standard
`retInputBindings` auto-save path. The two old cards were removed.

## Testing

`tests/retirement-scenario.test.js` — span/shape, accumulation (no early income;
savings-pot income), retirement (annuity start, Dutch step), manual drawdown
(reduces capital, proportional, capped + exhaustion age), scenario toggles
(house/inheritance/bond, fund exclusion, de minimis), real-terms deflation, and
snapshot integration. The old `tests/retirement-timeline.test.js` was removed.

## Out of scope

Per-pool tax modelling on the manual drawdown (treated as a flat capital
withdrawal), and exact reconciliation with the Snapshot card's at-retirement lump
sum (the scenario simulates its own continuous trajectory). Both are accepted
simplifications for a play-with-scenarios tool.
