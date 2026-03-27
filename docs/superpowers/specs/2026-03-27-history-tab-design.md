# History Tab Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Add a fourth "History" tab to `budget_calculator.html` that shows a unified year-by-year breakdown of money allocated to debt (extra repayments) and investments (by account type), sourced from the existing `db/debt.csv` and `db/investments.csv` files.

## Data Sources

### Debt (`db/debt.csv`)
- Only dated transaction rows are used (rows where the first column is a date)
- `param` rows are ignored entirely
- Each row: `Date, Description, Amount` — Amount is the extra repayment value
- Group by year extracted from the Date field

### Investments (`db/investments.csv`)
- Only dated transaction rows are used
- `current_value` rows are ignored entirely
- Each row: `Date, Description, amount, account type, crypto_value`
- Account types present: `TFSA`, `Discretionary`, `Crypto`
- Group by year extracted from the Date field (format: `DD-MM-YYYY`)
- Use the `amount` column, not `crypto_value`

## Layout

A single full-width table with one row per year:

| Year | Debt Repaid | Investments Total | TFSA | Discretionary | Crypto |
|------|-------------|-------------------|------|---------------|--------|
| 2024 | — | R 17,376 | — | — | R 17,376 |
| 2025 | R 41,100 | R 62,100 | R 72,000 | R 26,100 | — |
| 2026 | R 26,000 | R 48,369 | R 46,000 | — | R 2,369 |
| **Total** | **R 67,100** | **R 127,845** | ... | ... | ... |

- Years are sorted ascending
- A totals row at the bottom sums all columns
- Cells with no activity show `—`
- Currency formatted as `R X,XXX` (consistent with rest of app)

## Tab Integration

- Added as a 4th tab button in the existing `<nav>` in the tab navigation section
- Tab ID: `tab-history`, content div ID: `history-content`
- Styled consistently with existing tabs (same border-bottom active/inactive pattern)
- No refresh button needed (data is read-only, computed on tab switch)
- `switchTab()` function extended to handle `'history'` case
- History table computed from the already-loaded in-memory CSV data (`investmentRows`, `debtRows`) — no additional fetch needed

## Implementation Constraints

- No external libraries — vanilla JS only (Tailwind already loaded)
- Data is parsed from the same in-memory state as the other tabs
- No save/auto-save logic needed (read-only tab)
- No new API endpoints needed
