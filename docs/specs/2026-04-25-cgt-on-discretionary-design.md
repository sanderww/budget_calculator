# Estimated SARS Capital Gains Tax on Discretionary Investments

## Goal

Show, on the Discretionary card of the Investments tab, an estimate of the SARS Capital Gains Tax (CGT) the user would owe if they sold today, and the resulting net-vs-savings figure after that tax. Treats the unrealized gain as if it were realized today.

## Scope

- Only the **Discretionary** card. TFSA (tax-free) and Crypto (separate treatment) are out of scope.
- Only **CGT**. Dividends Withholding Tax is excluded (typically already withheld at source by the broker).
- The marginal income tax rate is **user-configurable** (a single percentage input), persisted with the rest of the investments data.

## Calculation

Inputs:
- `currentValue` — current market value of Discretionary holdings.
- `totalInvested` — sum of Discretionary buy/sell amounts (existing field).
- `marginalRate` — user's marginal income tax rate as a percentage (e.g. `41`).

Constants:
- `ANNUAL_EXCLUSION = 40000` — SARS annual CGT exclusion for individuals.
- `INCLUSION_RATE = 0.40` — SARS CGT inclusion rate for individuals.

Formula:

```
gain = currentValue - totalInvested
taxableGain = max(0, gain - ANNUAL_EXCLUSION)
includedAmount = taxableGain * INCLUSION_RATE
estimatedTax = includedAmount * (marginalRate / 100)
netVsSavingsAfterTax = netVsSavings - estimatedTax
```

Edge cases:
- `gain <= 0` (loss or break-even) → `estimatedTax = 0`.
- `marginalRate = 0` (or missing) → `estimatedTax = 0`.
- `gain > 0` but `gain <= 40000` → `estimatedTax = 0` (fully covered by annual exclusion).

`netVsSavings` is the existing field — `absoluteReturn - savingsGain` — unchanged.

## UI changes

In `src/budget_calculator.html`, on the **Discretionary** card only:

1. **Marginal tax rate input**
   - Placed below the existing "Current Value" input.
   - Label: `Marginal tax rate (%)`.
   - `<input type="number" id="marginal-rate-discretionary">`, step `1`, min `0`, max `100`.
   - Default value when missing: `41`.

2. **Two new rows** appended inside the existing bottom block (the one already containing "6% savings would be" and "Net vs savings"):
   - `Estimated tax (CGT)` — id `tax-discretionary`. Rendered as a negative amount in red (e.g. `-R 1,234.56`). Always shown, even when zero.
   - `Net vs savings (after tax)` — id `net-savings-after-tax-discretionary`. Green when ≥ 0, red when < 0, mirroring the existing "Net vs savings" styling.

TFSA and Crypto cards are unchanged.

## Persistence

Extend `db/investments.csv` to include a `param` row, following the same convention used by `db/debt.csv`:

```
param,marginal_rate,41,
```

- `parseInvestmentCSV` reads the row and exposes `marginalRate` on the returned object. Default to `41` when the row is absent (covers existing CSVs and new users).
- `generateInvestmentCSV` writes the row whenever it serializes data, so saving round-trips the value.
- The example file `db/examples/investments.csv` is updated to include the row.

## Code changes

### `src/calculations.js`

- `calculateInvestmentPerformance(transactions, currentValue, today, marginalRate = 0)`
  - New optional `marginalRate` parameter (percent, e.g. `41`).
  - Returns these additional fields in every return path:
    - `taxableGain` — `max(0, absoluteReturn - 40000)`, or `0` when `marginalRate <= 0` or `absoluteReturn <= 0`.
    - `estimatedTax` — as defined above; `0` when `marginalRate <= 0` or `absoluteReturn <= 0`.
    - `netVsSavingsAfterTax` — `netVsSavings - estimatedTax`.
  - When `totalInvested === 0` (current early return), the new fields are all `0`.
- `parseInvestmentCSV` — recognise `param` rows; populate `marginalRate` (number, default `41`).
- `generateInvestmentCSV` — emit `param,marginal_rate,<value>,` row.

### `src/budget_calculator.html`

- Add the marginal-rate input element to the Discretionary card.
- Add the two new display rows.
- The investment recalculation function (around line 1232) calls `calculateInvestmentPerformance` for Discretionary with the current `marginalRate`; passes `0` for TFSA and Crypto so their results are unaffected.
- Wire the input's `change` / `input` event to update `investmentData.marginalRate` and trigger the same save + recalc flow used by other inputs on the page.
- On load, populate the input from `investmentData.marginalRate` (falling back to `41`).

### `tests/calculations.test.js`

Add cases for `calculateInvestmentPerformance` with `marginalRate`:

- Gain of R30,000 with rate 41 → `estimatedTax === 0` (under annual exclusion).
- Gain of R100,000 with rate 41 → `estimatedTax === (100000 - 40000) * 0.40 * 0.41 === 9840`.
- Loss (currentValue < totalInvested) with rate 41 → `estimatedTax === 0`.
- Gain of R100,000 with rate 0 (or omitted) → `estimatedTax === 0`.
- `netVsSavingsAfterTax === netVsSavings - estimatedTax` in all cases.

Add cases for `parseInvestmentCSV` / `generateInvestmentCSV`:

- CSV with a `param,marginal_rate,41,` row parses to `marginalRate === 41`.
- CSV without the row parses to `marginalRate === 41` (default).
- `generateInvestmentCSV` round-trips the value.

## Out of scope

- Bracket auto-detection from a salary input.
- Dividends Withholding Tax.
- Trader-vs-investor classification (gain treated as capital, not revenue).
- Tax estimates on TFSA or Crypto cards.
- Multi-year carry-forward of capital losses.
