# Personal Finance Dashboard — Core Requirements

## Purpose

A personal finance tool for an individual to:

1. **Know where they stand today** — liquid savings minus current obligations (debts, reserved amounts).
2. **Plan ahead** — understand how future known expenses affect their net position and how much they need to save monthly to meet that future position.
3. **Allocate surplus money** — once a savings target is known, split any end-of-month surplus across investment categories in a controlled, percentage-based way.
4. **Track investment performance** — see how each investment account is performing in absolute, percentage, and annualized terms, benchmarked against a simple savings alternative.
5. **Manage a mortgage** — quantify the financial benefit of making extra repayments and see when the loan will be paid off.
6. **View financial history** — a year-by-year summary of debt repaid and investments made.

Currency is South African Rand (R) throughout.

---

## 1. Budget Module

### 1.1 Domain Concepts

| Concept | Definition |
|---|---|
| **Savings** | Total liquid cash available right now. |
| **Debt** | A fixed obligation that reduces available savings immediately (e.g. a bill owed). Each debt has a description and an amount. |
| **Provision** | Money set aside for a known future obligation, treated as already spent for planning purposes. Each provision has a description, amount, and a target date. |
| **Future Cost** | An anticipated expense at a specific future date. Unlike provisions, future costs are not yet deducted — they are projected against a chosen future date. Each future cost has a description, amount, and date. |

### 1.2 Current Net Amount

The user's financial position right now, after settling all current obligations.

```
Current Net = Savings − Total Debts − Total Provisions
```

A negative result means the user is currently in deficit.

### 1.3 Future Net Amount

The user selects a target future date (default: 1 year from today). The future net amount shows what their position will be if all future costs due on or before that date are also paid.

```
Relevant Future Costs = sum of Future Costs where cost.date ≤ target date

Future Net = Current Net − Relevant Future Costs
```

A negative future net means the user needs to save money between now and the target date.

### 1.4 Monthly Savings Target

How much the user must save per month to avoid a deficit at the target date.

```
Days remaining = target date − today
Months remaining = max(1, ceil(days remaining / 30))
```

The savings target logic:

- If `Future Net < 0`: the user needs to cover a shortfall.
  ```
  Monthly Savings Target = |Future Net| / Months remaining
  ```
- If `Future Net ≥ 0` but `Future Net < Current Net`: future costs are eroding the current surplus, so the user needs to rebuild.
  ```
  Monthly Savings Target = (Current Net − Future Net) / Months remaining
  ```
- If `Current Net < 0` and `Future Net ≥ 0`: the user needs to climb out of deficit and reach a positive future position.
  ```
  Monthly Savings Target = (|Current Net| + Future Net) / Months remaining
  ```
- Otherwise (future net is positive and ≥ current net): no savings required.
  ```
  Monthly Savings Target = 0
  ```

### 1.5 Monthly Money Allocation

Given a known end-of-month surplus, the user allocates it across:

- **Required Savings** — the monthly savings target from §1.4.
- **Mortgage repayment** — percentage of remainder.
- **EFT investment** — percentage of remainder.
- **Crypto investment** — percentage of remainder.

```
Remainder = Available Money − Monthly Savings Target

Mortgage Amount = Remainder × Mortgage%
EFT Amount      = Remainder × EFT%
Crypto Amount   = Remainder × Crypto%

Total Allocated = Monthly Savings Target + Mortgage Amount + EFT Amount + Crypto Amount
Leftover        = Available Money − Total Allocated
```

**Hard constraints:**
- The sum of all percentages must not exceed 100%.
- At least one percentage must be greater than 0%.
- Available money must exceed the monthly savings target (otherwise there is nothing to allocate).

---

## 2. Investment Tracker Module

### 2.1 Domain Concepts

Three fixed investment accounts:

| Account | Description |
|---|---|
| **Discretionary** | Standard brokerage / unit trust account. |
| **TFSA** | Tax-Free Savings Account (South African vehicle). |
| **Crypto** | Cryptocurrency holdings. Also tracks total BTC held. |

Each account has a **current market value** (entered manually) and a ledger of **transactions** (contributions made over time, each with a date, amount, and description).

### 2.2 Performance Metrics (per account)

#### Total Invested
```
Total Invested = sum of all transaction amounts for the account
```

#### Absolute Return
```
Absolute Return = Current Value − Total Invested
```

#### Percentage Return
```
Percentage Return = (Absolute Return / Total Invested) × 100
```

#### Annualized Return (CAGR)

Uses a weighted-average holding period across all transactions, weighted by amount invested:

```
Weighted Average Age (days) = sum(transaction.amount × transaction.age_in_days) / Total Invested

Years Held = Weighted Average Age / 365.25

Annualized Return = ((Current Value / Total Invested) ^ (1 / Years Held) − 1) × 100
```

Show "N/A" if:
- Years Held ≤ 0.1 (too short to be meaningful)
- Total Invested = 0
- Current Value / Total Invested ≤ 0 (cannot take logarithm)

#### 6% Savings Benchmark

Hypothetical gain if each transaction had instead been placed in a 6% p.a. savings account, compounded daily from the transaction date to today:

```
Savings Gain = sum over all transactions:
    transaction.amount × (1.06 ^ (transaction.age_in_days / 365.25) − 1)
```

#### Net vs Savings
```
Net vs Savings = Absolute Return − Savings Gain
```

A positive value means the investment outperformed a 6% savings account.

#### Estimated CGT (Discretionary only)

Estimates the South African Capital Gains Tax the user would owe if the Discretionary holdings were sold today. Treats the unrealized gain as if it were realized today. Not shown for TFSA (tax-free) or Crypto (separate treatment).

Inputs:
- `Marginal Rate` — user's marginal income tax rate as a percentage (default 41), persisted with the rest of the investments data.

Constants:
- `Annual Exclusion = R 40,000` (SARS annual CGT exclusion for individuals).
- `Inclusion Rate = 0.40` (SARS CGT inclusion rate for individuals).

```
Taxable Gain = max(0, Absolute Return − Annual Exclusion)
Estimated Tax = Taxable Gain × Inclusion Rate × (Marginal Rate / 100)
Net vs Savings (after tax) = Net vs Savings − Estimated Tax
```

`Estimated Tax = 0` when any of the following hold:
- `Absolute Return ≤ 0` (loss or break-even)
- `Marginal Rate ≤ 0` (or missing)
- `Absolute Return ≤ Annual Exclusion` (gain fully covered by the exclusion)

### 2.3 Crypto: Total BTC
For the Crypto account only, track the total Bitcoin quantity:
```
Total BTC = sum of btc_value across all Crypto transactions
```

### 2.4 Transaction Rules

- Each transaction belongs to exactly one account.
- Transactions are displayed sorted by date descending (most recent first).
- BTC quantity is only relevant for Crypto transactions; it is not applicable to other account types.

---

## 3. Debt (Mortgage) Module

### 3.1 Domain Concepts

| Field | Definition |
|---|---|
| **Total Loan Amount** | Original principal borrowed. |
| **Current Outstanding Balance** | Principal owed right now. |
| **Total Monthly Repayment** | Full payment made each month. |
| **Monthly Service Fee** | Fixed bank fee included in the repayment (not reducing principal). |
| **Interest Rate** | Annual interest rate (%). |
| **Loan Start Date** | When the loan originated. |
| **Original Term** | Agreed loan duration in months. |
| **Extra Repayments** | Additional voluntary payments made toward the principal, each with a date, description, and amount. |

### 3.2 Interest Calculation

The interest rate is converted to a daily rate:
```
Daily Rate = (Annual Rate / 100) / 365
```

Interest compounds daily, but is applied monthly. The monthly interest factor for a given calendar month is:
```
Monthly Factor = (1 + Daily Rate) ^ (days in that month) − 1
```

The effective repayment (the portion that reduces the loan balance) is:
```
Effective Repayment = Total Monthly Repayment − Service Fee
```

### 3.3 Loan Simulation

Each month follows this sequence:
1. Apply monthly interest: `balance += balance × monthly factor`
2. Apply repayment (+ any extra repayments in that calendar month): `balance -= payment`
3. Stop when `balance ≤ 10` or after 1200 months (safety limit).

**Guard condition**: if the effective repayment does not exceed one month's interest on the current balance, the loan will never be paid off and results display "Never."

### 3.4 Two Scenarios

| Scenario | Description |
|---|---|
| **Baseline** | Regular repayments only, no extra payments. |
| **Actual** | Regular repayments plus all extra repayments applied in their respective months. |

Both simulations start from the same historical starting point — when the earliest extra repayment was made (or the next payment date if no extras predate it).

**Back-calculation**: if extra repayments predate the current outstanding balance date, the simulation back-calculates a starting balance by reversing the interest and repayment operations month by month:
```
For each month going backwards:
    balance = (current_balance + effective_repayment + monthly_extra) / (1 + monthly_factor)
```

### 3.5 Projection Outputs

| Output | Calculation |
|---|---|
| **Interest Saved** | (Baseline total interest + fees) − (Actual total interest + fees) |
| **Total Extra Paid** | Sum of all extra repayment amounts |
| **Net Return (Cash)** | Same as Interest Saved |
| **Time Reduced** | Baseline months − Actual months |
| **New End Date** | Date when loan is fully paid off with extra repayments |
| **Original End Date** | Loan Start Date + Original Term months (or baseline end date) |
| **Annualized Yield (XIRR)** | See §3.6 |

### 3.6 XIRR — Annualized Yield on Extra Repayments

The annualized return on extra repayments is computed as the internal rate of return (XIRR) of a cash flow series:

**Cash flows:**
- Extra repayments → **outflows** (negative), dated at their actual payment dates.
- After the actual loan pays off, the monthly repayments that would have been paid in the baseline (but are no longer needed) → **inflows** (positive), one per month until the baseline would have ended.

**Method**: Newton-Raphson iteration.

```
XNPV(rate) = sum over all cash flows:
    cash_flow.amount / (1 + rate) ^ (days_from_first_date / 365)

Iterate:
    rate_new = rate − XNPV(rate) / XNPV'(rate)

Stop when |rate_new − rate| < 0.0001 or |XNPV| < 1, up to 20 iterations.
```

Result is the annualized yield (as a decimal, e.g. 0.12 = 12%).

---

## 4. RA (Retirement Annuity) Module

### 4.1 Goal

Track contributions to a South African Retirement Annuity, estimate the lifetime tax refund, and project the deductible refund per tax year (past + current + future).

### 4.2 Domain Concepts

| Concept | Definition |
|---|---|
| **Contribution** | A single deposit into the RA. Has a date, description (default: "monthly repayment"), and ZAR amount. |
| **Tax year (SA)** | Runs **1 March → 28/29 February**. A 2026/27 tax year covers 2026-03-01 → 2027-02-28. |
| **Tax refund rate** | The user's marginal income tax rate (%). Default 41. |
| **Nominal return rate** | Assumed annual return on the RA pot (%). Default 10. |
| **SARS deductibility cap** | Hard constant: contributions deductible per tax year are capped at **R 350,000**. |
| **Assumed future monthly** | Used for future-year projections. Defaults to the average of the last 3 contributions; user can override. |

### 4.3 Total Contributed and Lifetime Refund

```
Total Contributed = sum of all contribution amounts
Lifetime Refund (uncapped) = Total Contributed × (Refund Rate / 100)
```

The lifetime figure ignores per-year capping; the per-tax-year table is authoritative when any year exceeds the cap.

### 4.4 Per-Tax-Year Refund

Each contribution is bucketed into the SA tax year of its date. For each observed past tax year:

```
Year Total = sum of contributions in that tax year
Deductible = MIN(Year Total, R 350,000)
Refund     = Deductible × (Refund Rate / 100)
```

The **current** tax year mixes actual contributions with projected future months until year-end:

```
Months Remaining = whole calendar months between today's month and the year-end month
Current Year Total = actual contributions so far + Assumed Future Monthly × Months Remaining
```

Each **projected** future tax year (for `Future Years to Project` years after the current year):

```
Year Total = Assumed Future Monthly × 12
```

Deductible is capped at R 350,000 in every case. A row is flagged `capHit` when its raw Year Total exceeds the cap.

### 4.5 Estimated Pot Value Today

Sums each contribution forward to today using monthly compounding:

```
r_m = (1 + Nominal Return / 100) ^ (1/12) − 1
Pot Today = Σ amount × (1 + r_m) ^ months_between(contribution_date, today)
```

Future-dated contributions are treated as having grown 0 months.

---

## 5. History Module

### 5.1 Goal

Give the user a year-by-year view of capital deployed — how much went toward debt reduction and how much went into investments, broken down by investment type.

### 5.2 Data Sources

| Column | Source |
|---|---|
| **Year** | Derived from transaction/repayment dates |
| **Debt Repaid** | Sum of extra mortgage repayments for that year |
| **Investments Total** | Sum of all investment transaction amounts for that year |
| **TFSA** | Sum of TFSA-type investment transactions for that year |
| **Discretionary** | Sum of Discretionary-type investment transactions for that year |
| **Crypto** | Sum of Crypto-type investment transactions for that year |

### 5.3 Rules

- Rows are sorted by year ascending.
- A totals row at the bottom sums all columns.
- Years with no activity are omitted.
- Empty values (no activity for that column/year) display as a dash.

---

## 6. Hard Requirements Summary

| # | Requirement |
|---|---|
| R1 | All monetary values are in South African Rand (R). |
| R2 | Current Net, Future Net, and Monthly Savings Target recalculate whenever any input changes. |
| R3 | Future Net only includes future costs whose date is on or before the selected target date. |
| R4 | Monthly savings target uses `ceil(days / 30)` months, minimum 1 month. |
| R5 | Monthly allocation percentages must sum to ≤ 100%; at least one must be > 0%. |
| R6 | Available money for allocation must exceed the monthly savings target. |
| R7 | Investment annualized return uses weighted-average holding period (weighted by amount). |
| R8 | Investment benchmark is 6% p.a. compounded daily from each transaction date to today. |
| R9 | Annualized return displays "N/A" when years held ≤ 0.1 or data is insufficient. |
| R9a | Discretionary card shows estimated SARS CGT and net-after-tax using `taxable = max(0, gain − R 40k)`, `tax = taxable × 0.40 × marginal_rate%`. Marginal rate is user-configurable (default 41) and persisted. Tax is zero on loss, when marginal rate is 0, or when the gain is fully under the R 40k annual exclusion. TFSA and Crypto cards are unaffected. |
| R10 | Mortgage interest compounds daily; monthly factor = `(1 + daily_rate)^days_in_month − 1`. |
| R11 | Service fee does not reduce principal — it is subtracted from repayment before the effective amount is applied. |
| R12 | Loan simulation stops at balance ≤ R 10 (not zero, to account for rounding). |
| R13 | If effective repayment ≤ one month's interest, the loan will never be paid off ("Never"). |
| R14 | XIRR uses Newton-Raphson with ≤ 20 iterations, convergence at |Δrate| < 0.0001 or |XNPV| < 1. |
| R15 | History is grouped by calendar year, sorted ascending, with a totals row. |
| R16 | All calculations update in real time on any data change (no manual "calculate" step required, except for monthly allocation which is triggered explicitly). |
| R17 | RA tax year runs 1 March → 28/29 February; bucketing label is `YYYY/YY` (e.g. `2026/27`). |
| R18 | RA per-tax-year deductible is capped at R 350,000 (SARS hard cap). The lifetime refund figure ignores the cap and shows a warning when any year exceeds it. |
| R19 | RA current-year row mixes actual contributions to date with `Assumed Future Monthly × months_remaining`; status reads `partial (N actual + M projected)`. |
| R20 | RA settings (refund rate, return rate, future years, optional assumed monthly override) are persisted as `param,<key>,<value>,` rows inside `db/ra.csv`. |
