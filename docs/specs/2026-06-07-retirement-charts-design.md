---
name: Retirement tab — visual enhancements
date: 2026-06-07
status: draft
---

# Retirement Tab — Visual Enhancements

Two charts that visualise data the Snapshot card (Card 0) already expresses numerically. Goal: a single glance at *how much monthly income comes from where*, and *how much capital is sitting in each vehicle*, at the three canonical ages.

## 1. Canonical ages and bar collapse

Three target ages drive both charts:

| Bar | Age | Notes |
|---|---|---|
| **Age 55** | RA accessibility age (hard-coded SARS) | Always shown. |
| **Age D** | `opt_dutch_age` (default 68; Dutch-pension start) | Always shown; label updates from the sidebar. |
| **Retirement** | `retirement_age` (user-defined, default 65) | Always shown. |

When two of the three ages coincide (e.g. `retirement_age = 55`, or `retirement_age = opt_dutch_age`), the corresponding bars **collapse into a single bar** labelled `Age 55 (retirement)` etc. A 3-bar chart never renders 4 bars; it may render 2 (or 1 in the degenerate case `retirement_age = 55 = opt_dutch_age`).

Both charts respect the **Show in today's money** toggle (R26) and re-render when any input changes (R16, R28).

## 2. Chart 1 — Monthly income by age (stacked bar)

Y-axis: ZAR / month, **net of tax**. Each bar is the **Max estimated monthly income** for that age (the same number rendered in Card 0's "Max estimated monthly income" row), decomposed into additive layers.

### 2.1 Layers (bottom → top)

Each layer is gated by its scenario flag; gated-out layers contribute 0 and disappear from the legend.

| Layer | Formula | Notes |
|---|---|---|
| **RA drawdown (net)** | `annuitised × withdrawal_rate_pct / 100 / 12 × (1 − effective_tax_rate_pct/100)` | `annuitised` follows R22/R23 and the 1/3 commutation toggle (see §2.2). |
| **Dutch pension (net, ZAR)** | `opt_dutch_eur_monthly × opt_dutch_eur_zar × (1 − effective_tax_rate_pct/100)` | Bar at **Age D** and at **Retirement** if `retirement_age ≥ opt_dutch_age`. Zero on the Age-55 bar (unless `opt_dutch_age = 55`, which would be an unusual config). |
| **Lump-sum drawdown (PMT, net)** | `PMT(L, N, r)` where `L` is the lump-sum pool *available at that age* (see §2.3), `N = max(0, round((life_expectancy − age) × 12))`, `r = (1 + lump_sum_drawdown_return_pct/100)^(1/12) − 1`. Net by `× (1 − effective_tax_rate_pct/100)`. | One stacked sub-layer per vehicle (Discretionary, TFSA, Crypto, RA-commuted, one-off). All four use the same PMT machinery — the only thing that differs is `L`. |

PMT formula and edge cases follow §5.4 verbatim (`PMT = 0` when `N == 0` or `L ≤ 0`; zero-return fallback when `|r| < 1e-9`). Using PMT (not simple division) keeps Chart 1 numerically consistent with Card 0's "Monthly from lump sum" row.

### 2.2 RA-drawdown layer per bar

| Bar | RA-drawdown value |
|---|---|
| Age 55 | If `raPot55 < R 360,000` → 0 (de minimis; the full RA pot net of lump-sum tax flows into the *lump-sum drawdown / RA-commuted* sub-layer instead). Otherwise, RA early-access drawdown using `annuitised55 = raPot55` (the 1/3 commutation toggle applies only at retirement; at age 55 the full pot is annuitised). |
| Age D | If retirement age ≤ D, this is the post-retirement drawdown; if retirement age > D, age D is pre-retirement and the layer = 0. |
| Retirement | Follows R22/§5.4: if pot < R 360k → 0 (de minimis lump sum); else if commute toggle on → `annuitised = pot × 2/3`; else `annuitised = pot`. |

Living-annuity depletion (R23) is annotated as a tooltip note on the relevant bar when `ageAtThreshold ≤ ` that bar's age — it does **not** zero out the layer (matches existing UX: warning, not silent suppression).

### 2.3 Lump-sum pool composition per bar

The lump-sum drawdown layer is itself **sub-stacked** by vehicle. The pool feeding each vehicle's PMT depends on the bar:

| Sub-layer | Age 55 | Age D | Retirement |
|---|---|---|---|
| **Discretionary** | `liquid.at55.discretionary` × `opt_include_discretionary` | `liquid.at68.discretionary` × flag | `liquid.atRetirement.discretionary` × flag |
| **TFSA** | `liquid.at55.tfsa` × `opt_include_tfsa` (uses Max-TFSA growth path when `opt_tfsa_enabled`, else passive) | same projection at D | same at retirement |
| **Crypto** | `liquid.at55.crypto` × `opt_include_crypto` | same at D | same at retirement |
| **RA-commuted** | If `raPot55 < R 360k`: full pot net of lump-sum tax. Else 0 (no commutation pre-retirement). | If D ≥ retirement_age: the at-retirement commuted/de-minimis slice projected forward to D at `lump_sum_drawdown_return_pct`. If D < retirement_age: 0 (RA is still accumulating, commutation hasn't happened yet). | If de minimis → full pot net of tax. Else if commute toggle on → `1/3 pot` net of lump-sum tax. Else 0. |
| **One-off events** | 0 (one-offs only land at retirement) | If D ≥ retirement_age: the retirement-age one-off lump sum projected forward to D at `lump_sum_drawdown_return_pct`. If D < retirement_age: 0. | `house_sale + inheritance_zar + savings_pot_withdrawals_net − bond_payoff` (single netted figure; if negative, sub-layer is 0 and a tooltip flags the shortfall). |

Notes:
- **TFSA actual vs max** is a *single layer*, not two. Which growth path is used is determined by `opt_tfsa_enabled` (the existing "Max TFSA contributions" toggle). The sidebar already owns that switch — no new control needed.
- **Bond payoff is netted into the one-off lump sum**, never rendered as a negative bar segment (stacked bars don't represent negatives well).
- **Age-55 semantics**: "if you accessed every included fund and the RA at 55, what monthly income would those pools support amortised to `life_expectancy`?" This matches the existing Snapshot's projection of liquid funds to age 55. The user is *not* assumed to have retired at 55 unless `retirement_age = 55`.

### 2.4 Headline

Above the chart: `Max monthly income (net) at age 55 / D / R: R x,xxx / R y,yyy / R z,zzz` — pulled directly from Card 0's Max-income row to make the numerical link explicit.

## 3. Chart 2 — Capital available by age (stacked bar)

Y-axis: ZAR (total funds). Same three bars (with the same collapse rules). Each bar is decomposed by vehicle:

| Sub-layer | Source |
|---|---|
| **Discretionary** | `liquid.<age>.discretionary` × `opt_include_discretionary` |
| **TFSA** | `liquid.<age>.tfsa` × `opt_include_tfsa` (Max-TFSA path when enabled) |
| **Crypto** | `liquid.<age>.crypto` × `opt_include_crypto` |
| **RA (lump sum portion only)** | Age 55: `raPot55` if de minimis (net of lump-sum tax), else 0. Age D / Retirement: 1/3 commutation net (if toggle on) or full pot net (if de minimis), else 0. The annuitised slice is **not** in this chart (it's not "capital available" — it's an income stream). |
| **One-off events (net)** | 0 at Age 55. At Age D / Retirement: `house_sale + inheritance_zar + savings_pot_net − bond_payoff`, projected forward when the age is after retirement age. If the net is negative, the bar shows a smaller total and a red annotation; no negative segment is rendered. |

This is a graphical version of Card 0's "Funds available (lump sum)" row, extended across all three ages and broken down by source. Card 2 ("Instantly available at retirement") remains the tabular detail for the retirement-age column.

## 4. Real-terms, layout, persistence

- **Real-terms toggle**: when on, every bar value is deflated by `(1 + cpi/100)^(years_from_today_to_age)` (R26). The badge in the chart card header mirrors Card 0's `nominal` / `today's money` badge.
- **Layout**: a new card placed between Card 0 (Snapshot) and Card 1 (Monthly income breakdown). Two charts side-by-side on wide viewports, stacked on narrow viewports. Card header: "Retirement at a glance" with the real-terms badge.
- **Library**: ApexCharts (already loaded for the budget timeline).
- **Legend**: bottom-centre, grouped per chart. Tooltip shows the exact ZAR figure for each segment + the formula tag (e.g. `TFSA · PMT to age 95 @ 6%`).
- **Persistence**: none — both charts are pure renders of existing state. No new keys in `config.public.json` or `config.private.json`.
- **Updates**: re-render on the same triggers as Card 0 (any retirement-tab input, any Investments / RA tab edit that changes a current value — see R28).

## 5. Out of scope

- Multi-scenario side-by-side comparison (e.g. "with and without max TFSA"). Use the existing checkbox toggles to compare.
- Year-by-year drawdown curve (already deferred in §5.6).
- Pre-retirement income (salary, side income) — these charts are post-access only.
- Sequence-of-returns risk shading.

## 6. Open questions

None blocking implementation. Decisions locked in above:
1. PMT formula (not simple division) for all lump-sum-derived monthly income — consistent with R32.
2. Net of tax everywhere — consistent with Card 0.
3. Single TFSA layer driven by existing `opt_tfsa_enabled` toggle — no double-counting.
4. Bond payoff netted into a single "one-off" lump-sum value, never a negative segment.
5. Bar collapse when ages coincide.
6. De minimis at 55 and at retirement folds the RA pot into the lump-sum drawdown layer, not the RA-drawdown layer.

## 7. Spec sections to update on completion

- `docs/specs/core-requirements.md` §5.5 — add chart definitions and reference R32.
- `docs/specs/functional-requirements.md` §5.3 — insert "Card 0a — Retirement at a glance" between Card 0 and Card 1.
- New requirement R34: charts are pure renders of Snapshot state, respect the real-terms toggle, and re-render on the same triggers as Card 0.
