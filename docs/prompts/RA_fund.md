# RA Savings Tab — Spec

Add a new tab to the budget calculator for tracking Retirement Annuity (RA) contributions in South Africa.

## CSV schema

File: `db/ra.csv` (mirroring `db/investments.csv`).

Columns: `date,description,amount`

- `date` — ISO `YYYY-MM-DD`. Used for tax-year bucketing.
- `description` — free text. UI default when adding: **"monthly repayment"**.
- `amount` — ZAR, positive number. Contributions only (negative amounts not expected; if a refund/withdrawal is ever needed, treat as a separate row with negative amount).

Same write rules as the other tabs (CSV append, no in-place edits other than via the app's normal flow).

## Inputs (configurable, persisted in `db/calulator_data.csv` or equivalent settings store)

| Setting | Default | Source / rationale |
|---|---|---|
| `tax_refund_rate_pct` | **41%** | Sander's marginal rate, per `Retirement_Calculator.html` (`marginalTax=41`). |
| `nominal_return_pct` | **10%** | Real 5% + inflation 5%, per `Retirement_Calculator.html` (`realReturn=5`, `inflation=5`). |
| `ra_annual_cap` | **R350,000** | SARS hard cap per tax year (`raCap=350000`). |
| `default_description` | `"monthly repayment"` | Per requirement 1. |
| `tax_year_start_month` | `3` (March) | SA tax year runs 1 Mar – 28/29 Feb. |
| `future_years_to_project` | **10** | Configurable; long enough to feel useful, short enough to render quickly. |
| `assumed_future_monthly` | derived (see below) | Auto-fill from last 3 months' average; user can override. |

## Requirement-by-requirement

### 1. Add transactions (date, description, amount) — CSV-backed

UI: same pattern as `investments` tab. Form fields default to today's date and `"monthly repayment"` for description.

**No calculation** beyond appending the row.

---

### 2. Show total contributed

```
total_contributed = SUM(amount) over all rows
```

Display: single ZAR figure, formatted like other totals (e.g. `R 240,000`).

Also show:
- `count_of_contributions` — number of rows
- `first_contribution_date` and `last_contribution_date`
- Optional sub-line: `total_contributed_current_tax_year` (see calc in §5)

---

### 3. Customisable tax refund rate (% of total contribution)

Input: `tax_refund_rate_pct` (number input, % suffix, default 41).

```
total_refund_to_date = total_contributed × (tax_refund_rate_pct / 100)
```

Display alongside total contributed:
```
Total contributed: R XXX
Tax refund rate:   41%   [editable]
Total refund (lifetime): R YYY
```

**Note (not in v1, but flag in UI):** SARS deductibility is capped at the lower of (a) 27.5% of taxable income and (b) `ra_annual_cap` (R350k). The simple `rate × contribution` formula assumes contributions are fully within the cap. Show a warning pill when **annual** contribution exceeds R350,000 in any tax year:
```
if year_total > ra_annual_cap:
    warn("Contributions in {year} exceed SARS cap of R350k — refund capped at R350k × rate")
```

---

### 4. Customisable nominal return rate

Input: `nominal_return_pct` (number input, % suffix, default 10).

This is **assumed** (not calculated from market data). Display it on the tab as a labelled, editable input.

Used by the projection in §5 and (optionally) by a "current pot value" estimator:

```
# Current pot value (sum each contribution forward to today at nominal return)
r_m = (1 + nominal_return_pct/100) ^ (1/12) − 1

current_pot_value = Σ over rows: amount × (1 + r_m) ^ months_between(row.date, today)
```

Display: `Estimated pot value today: R ZZZ` with a small footnote "Assuming X% nominal return, monthly compounding".

---

### 5. Expected refund value per tax year (multiple, including future)

This is the headline calculation. Bucket contributions into SA tax years and project forward.

#### Tax-year bucketing

```
def tax_year_label(date):
    # SA tax year runs 1 March of year N → 28/29 Feb of year N+1
    if date.month >= 3:
        return f"{date.year}/{(date.year+1) % 100:02d}"   # e.g. "2026/27"
    else:
        return f"{date.year-1}/{date.year % 100:02d}"     # e.g. "2025/26"
```

#### Historical refund (per past + current tax year)

```
for each tax_year in observed_tax_years:
    year_total = SUM(amount where row.date in tax_year)
    deductible = MIN(year_total, ra_annual_cap)
    refund     = deductible × (tax_refund_rate_pct / 100)
```

#### Future projection

Default `assumed_future_monthly` to the average of the last **3** contribution rows (or last 1 if fewer); user may override with a number input.

```
projected_annual = assumed_future_monthly × 12

for tax_year in next N years (N = future_years_to_project):
    year_total = projected_annual
    deductible = MIN(year_total, ra_annual_cap)
    refund     = deductible × (tax_refund_rate_pct / 100)
```

Edge case: the **current** tax year is partly historical, partly projected. Combine:
```
current_year_total_actual    = SUM(amount where row.date in current_tax_year)
months_remaining_in_year     = months between today and end_of_current_tax_year
current_year_total_projected = current_year_total_actual + assumed_future_monthly × months_remaining_in_year
```

#### Display

A table:

| Tax year | Status | Contributions | Deductible | Refund @ 41% |
|---|---|---|---|---|
| 2025/26 | actual | R 60,000 | R 60,000 | R 24,600 |
| 2026/27 | partial (5 actual + 7 projected) | R 240,000 | R 240,000 | R 98,400 |
| 2027/28 | projected | R 240,000 | R 240,000 | R 98,400 |
| 2028/29 | projected | R 240,000 | R 240,000 | R 98,400 |
| … | | | | |
| **Total over horizon** | | R X | | **R Y** |

Add a "deductibility cap hit" indicator when `year_total > ra_annual_cap`.

---

## Optional v1.1 additions (not required, but cheap to add)

- **Pot growth chart** — line chart of cumulative pot value year by year using `nominal_return_pct`. Same shape as the trajectory chart in `Retirement_Calculator.html`.
- **Link to Retirement Calculator** — small button "Open retirement plan" linking to `Retirement_Calculator.html` so the two stay loosely coupled.
- **Income-based cap input** — optional `taxable_income_pa` field; when present, replace `ra_annual_cap` with `MIN(R350,000, 27.5% × taxable_income_pa)` for the deductibility check.

## Defaults summary (paste into the calculator settings init)

```js
const RA_DEFAULTS = {
  tax_refund_rate_pct: 41,        // marginal rate
  nominal_return_pct: 10,         // 5% real + 5% inflation
  ra_annual_cap: 350000,          // SARS
  default_description: "monthly repayment",
  tax_year_start_month: 3,        // March
  future_years_to_project: 10,
  // assumed_future_monthly: derived from last 3 rows; null on first run
};
```