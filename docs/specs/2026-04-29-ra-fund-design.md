---
date: 2026-04-29
status: design
related: docs/prompts/RA_fund.md
---

# RA Savings Tab — Design

A new tab for tracking Retirement Annuity (RA) contributions in South Africa, mirroring the structure of the Investments tab.

Source spec: `docs/prompts/RA_fund.md`. This document records the design decisions and resolves open points from that spec.

## Resolved decisions

- **Settings storage:** `param` rows inside `db/ra.csv` (same pattern as `marginal_rate` in `db/investments.csv`). Keeps the tab self-contained.
- **Tab placement:** between **Debt** and **History**. Tab id `tab-ra`, tab key `ra`.
- **v1 scope:** core requirements 1–5 only. Skip v1.1 optionals (pot chart, link to Retirement Calculator, income-based cap input).

## CSV schema (`db/ra.csv`)

Two row types in a single file, distinguished by the first column:

```
date,description,amount
2026-03-15,monthly repayment,5000
2026-04-15,monthly repayment,5000
param,tax_refund_rate_pct,41,
param,nominal_return_pct,10,
param,future_years_to_project,10,
param,assumed_future_monthly,5000,
```

- Transaction rows: `date` is ISO `YYYY-MM-DD`, `amount` is positive ZAR.
- Param rows: literal `param` in the date column, then `key`, then `value`. Trailing comma to keep column count stable.
- `ra_annual_cap` is hardcoded to R350,000 (SARS rule, not a user-tunable preference). Not stored.
- `tax_year_start_month` is hardcoded to 3 (March). Not stored.
- `default_description` ("monthly repayment") is hardcoded. Not stored.
- `assumed_future_monthly` is **persisted only when the user overrides the auto-derived value**; otherwise the row is absent and the value is recomputed from the last 3 transactions on each render.

## UI structure (within `#section-ra`)

Three vertically-stacked cards, mirroring Investments tab styling:

1. **Add contribution** — form with date (defaults today), description (defaults "monthly repayment"), amount. Append-only.
2. **Summary** — total contributed, count, first/last dates, current-tax-year total, lifetime refund estimate, estimated pot value today. Editable inputs for `tax_refund_rate_pct` and `nominal_return_pct`.
3. **Tax-year refund table** — past + current + projected years. Columns: Tax year | Status | Contributions | Deductible | Refund. Cap-hit indicator per row. Total row at bottom. Above the table: editable `future_years_to_project` and `assumed_future_monthly` inputs.

Below the cards: existing "Load / Save" pair like other tabs (`db/ra.csv` label, Load RA, Save RA).

## Calculations

All calculations live in `budget_calculator.html` JavaScript, alongside existing tab logic. Pure functions (no DOM access) so they're trivially testable from the console.

### Tax-year bucketing

```js
function taxYearLabel(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1;
  const startYear = m >= 3 ? y : y - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endYY}`;
}
```

### Total contributed / lifetime refund

```
total_contributed       = SUM(amount)
total_refund_lifetime   = total_contributed × (tax_refund_rate_pct / 100)
```

Note: the simple lifetime refund ignores the per-year cap. The per-year refund table is the authoritative figure; lifetime refund is a quick headline. When any tax year exceeds the cap, show a warning pill near the lifetime refund.

### Estimated pot value today

```
r_m = (1 + nominal_return_pct/100)^(1/12) - 1
pot_today = Σ amount_i × (1 + r_m)^months_between(date_i, today)
```

### Per-tax-year refund (historical)

```
For each observed tax_year:
  year_total = SUM(amount in tax_year)
  deductible = MIN(year_total, 350_000)
  refund     = deductible × rate
  status     = "actual" if tax_year < current_tax_year else "partial"
```

### Per-tax-year refund (current year, mixed actual + projected)

```
actual = SUM(amount in current_tax_year)
months_remaining = months between today and 28 Feb (or 29 Feb in leap years) of current_tax_year_end
year_total = actual + assumed_future_monthly × months_remaining
deductible = MIN(year_total, 350_000)
refund     = deductible × rate
status     = "partial (N actual + M projected)"
```

### Per-tax-year refund (future)

```
For tax_year in [current+1 .. current+future_years_to_project]:
  year_total = assumed_future_monthly × 12
  deductible = MIN(year_total, 350_000)
  refund     = deductible × rate
  status     = "projected"
```

### `assumed_future_monthly` derivation

```
If user-overridden value present in params: use it.
Else if ≥ 3 transactions: average of the 3 most recent (by date).
Else if ≥ 1 transaction:  amount of the most recent transaction.
Else: 0.
```

The input field always shows the current value (derived or overridden). When the user types a value, it's persisted as a param row. A small "auto" button next to the input clears the override and reverts to the derived value.

## Persistence flow

- Reuses existing `debouncedSave('ra', generateRACSV, 'save-ra-csv')` pattern.
- `generateRACSV()` produces the full CSV body: transaction rows + param rows.
- Parser splits by first column: ISO date → transaction; `param` → setting; anything else (incl. blank) → ignored.
- Server-side: add `'ra': 'db/ra.csv'` to `FILE_MAP`. Treat as a real key so backups apply.

## Edge cases

- **Empty file / first run:** show empty state in summary and table; `assumed_future_monthly` defaults to 0; lifetime refund 0.
- **Future-dated transactions:** allowed (some users pre-record). Bucket into their tax year as actual.
- **Cap hit:** when `year_total > 350_000`, render a small warning pill in the row's Status column. Refund still computed as `350_000 × rate` (deductible is min'd before multiplying).
- **Refund/withdrawal rows (negative amounts):** spec allows but v1 doesn't add UI for them. The parser/sum will still tolerate them since `amount` is parsed as float.
- **Missing/invalid param rows:** fall back to defaults (41 / 10 / 10).

## Out of scope (v1)

- Pot growth chart
- Link to Retirement Calculator
- Income-based deductibility cap (`MIN(350k, 27.5% × taxable_income)`)
- Negative-amount UI for refunds/withdrawals

## Files touched

- `src/budget_calculator.html` — new tab markup + JS (parsing, calculations, rendering, save wiring).
- `src/server.py` — add `'ra': 'db/ra.csv'` to `FILE_MAP` and `REAL_KEYS`.
- `db/ra.csv` — new file; created on first save.
- `docs/specs/core-requirements.md` — add RA tab to goals/concepts/formulas.
- `docs/specs/functional-requirements.md` — add detailed RA tab behaviour.
