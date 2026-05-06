# Personal Finance Dashboard — Core Requirements

## Purpose

A personal finance tool for an individual to:

1. **Know where they stand today** — liquid savings minus current obligations (debts, reserved amounts).
2. **Plan ahead** — understand how future known expenses affect their net position and how much they need to save monthly to meet that future position.
3. **Allocate surplus money** — once a savings target is known, split any end-of-month surplus across investment categories in a controlled, percentage-based way.
4. **Track investment performance** — see how each investment account is performing in absolute, percentage, and annualized terms, benchmarked against a simple savings alternative.
5. **Manage a mortgage** — quantify the financial benefit of making extra repayments and see when the loan will be paid off.
6. **View financial history** — a year-by-year summary of debt repaid and investments made.
7. **Plan retirement** — project funds available at age 55 and 68, monthly net income, RA commutation impact, and optional scenarios (Dutch pension, TFSA top-ups, etc.).

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

#### TFSA Lifetime Cap Usage (TFSA only)

Tracks how much of the SARS lifetime contribution allowance has been used. Withdrawals do not free up cap, but for parity with the existing `Total Invested` calculation, all signed transaction amounts are summed.

```
Lifetime Contributed = sum of all TFSA transaction amounts
% of Cap Used = min(100, max(0, Lifetime Contributed) / R 500,000 × 100)
Remaining = max(0, R 500,000 − max(0, Lifetime Contributed))
```

Displayed as a labelled progress bar on the TFSA card. Bar colour is emerald < 80%, amber 80–<100%, red ≥ 100%.

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

Track contributions to a South African Retirement Annuity, estimate the expected refund for the current tax year (based on actuals to date), and surface the deductible refund per past tax year.

### 4.2 Domain Concepts

| Concept | Definition |
|---|---|
| **Contribution** | A single deposit into the RA. Has a date, description (default: "monthly repayment"), and ZAR amount. |
| **Tax year (SA)** | Runs **1 March → 28/29 February**. A 2026/27 tax year covers 2026-03-01 → 2027-02-28. |
| **Tax refund rate** | The user's marginal income tax rate (%). Default 41. |
| **Nominal return rate** | Assumed annual return on the RA pot (%). Default 10. |
| **SARS deductibility cap** | Hard constant: contributions deductible per tax year are capped at **R 350,000**. |

### 4.3 Total Contributed and Expected Refund (Current Tax Year)

```
Total Contributed = sum of all contribution amounts
Current Year Total = sum of contributions whose date falls in the current SA tax year
Expected Refund (current tax year) = MIN(Current Year Total, R 350,000) × (Refund Rate / 100)
```

The expected-refund figure is based on actual contributions to date only (no future projection). When `Current Year Total > R 350,000`, a `capHit` warning is shown.

### 4.4 Cap-Hit Detection

Each contribution is bucketed into the SA tax year of its date. If any tax year's bucketed total exceeds **R 350,000**, the RA Summary surfaces a "cap hit in some year" amber pill beneath the Expected refund value. No per-year breakdown is rendered.

### 4.5 Estimated Pot Value Today

Sums each contribution forward to today using monthly compounding:

```
r_m = (1 + Nominal Return / 100) ^ (1/12) − 1
Pot Today = Σ amount × (1 + r_m) ^ months_between(contribution_date, today)
```

Future-dated contributions are treated as having grown 0 months.

---

## 5. Retirement Module

### 5.1 Goal

Project retirement wealth and monthly income from existing Investments + RA tab data, so the user sees a single-snapshot view of where they will be at age 55 and age 68 under both a "current" baseline (no optional scenarios) and a "projected" outlook (with all enabled scenarios + 1/3 RA commutation if toggled).

### 5.2 Domain Concepts

| Concept | Definition |
|---|---|
| **DOB** | User's date of birth, used to compute current age and months to each target age. |
| **Retirement age** | Configurable target age (default 65). |
| **Two-pot system** | RA balance is split into three components: vested (pre-Sep-2024), savings (33% of post-Sep-2024 contributions), retirement (67% of post-Sep-2024 contributions). |
| **Commutation** | At retirement, up to 1/3 of the RA pot may be taken as a lump sum (taxed via the SARS retirement lump-sum table); 2/3 must be annuitised. User toggle, default ON. |
| **De minimis** | RA pot below R 360,000 at retirement may be fully commuted; no annuity required. |
| **Living-annuity commutation threshold** | A living annuity that depletes below R 150,000 may be fully commuted to cash. |
| **Withdrawal rate** | Annual percentage drawn from the annuitised pot (default 4%). |
| **CPI** | Annual price-inflation rate; used for "today's money" deflation when toggled (default 5%). |
| **Effective retirement-income tax rate** | Single-rate proxy for marginal tax in retirement (default 18%). |
| **Dutch pension** | Optional monthly income paid in EUR. Default €900/month from age 68; both the start age and the EUR/month amount are user-configurable. ZAR conversion uses the user-supplied EUR/ZAR rate. |
| **Savings-pot withdrawal** | Optional pre-retirement annual withdrawal from the savings component, taxed at the effective rate, flowing into discretionary funds. Min R 2,000 per SARS. |

### 5.3 Hardcoded constants (SARS / SA Budget 2026/27)

| Constant | Value |
|---|---|
| RA accessibility age | 55 |
| Dutch pension start age | 68 (default; configurable via `opt_dutch_age`) |
| Dutch pension monthly EUR | 900 (default; configurable via `opt_dutch_eur_monthly`) |
| TFSA annual cap | R 46,000 |
| TFSA lifetime cap | R 500,000 |
| RA deduction cap | R 430,000/year |
| Retirement de minimis | R 360,000 |
| Living-annuity commutation threshold | R 150,000 |
| Lump-sum tax-free first slice | R 550,000 |
| Two-pot split (post-Sep-2024) | 33% savings / 67% retirement |
| Savings-pot minimum withdrawal | R 2,000 |

### 5.4 Future-Value formulas

**Monthly compounding**:
```
r_m = (1 + annualRate/100)^(1/12) − 1
FV  = pv × (1 + r_m)^months [+ contrib × ((1+r_m)^months − 1) / r_m]
```

**Real-terms deflation** (when "Show in today's money" is on):
```
realValue = nominal / (1 + cpi/100)^years
```

**Two-pot future value**: vested grows passively; retirement grows with 67% of new contributions; savings grows with 33% of new contributions, less optional annual withdrawals applied at year boundaries (capped at available balance). After the components are summed, an offshore portion may be appreciated against ZAR using the depreciation rate.

**TFSA future value**: passive growth of the current value, plus optional annual contributions at R 46,000 starting from the current tax year (top-up first, then full years), bounded by the R 500,000 lifetime cap and the months remaining to retirement.

**Lump-sum tax (2026/27 retirement table)**:
```
≤ R 550,000:        0
R 550k – R 770k:    18% × (a − 550k)
R 770k – R 1.155m:  R 39,600 + 27% × (a − 770k)
> R 1.155m:         R 143,550 + 36% × (a − 1.155m)
```

**RA monthly income**:
```
if pot < R 360,000:     full commutation, drawdown = 0
else if commute 1/3:    annuitised = pot × 2/3
else:                   annuitised = pot
gross monthly = annuitised × (withdrawalRate / 100) / 12
net monthly   = gross × (1 − taxRate / 100)
```

**Living-annuity depletion check**: walk the annuitised pot forward month-by-month from retirement age; at any month where the pot drops below R 150,000, return the age-at-threshold (used for the depletion warning).

**Lump-sum monthly drawdown (PMT annuity)**: the at-retirement lump sum is amortised into a level monthly payment that depletes the pot exactly to zero by `life_expectancy`, assuming the residual continues to earn `lump_sum_drawdown_return_pct` (annual, compounded monthly).
```
N        = max(0, round((life_expectancy − retirement_age) × 12))
r_annual = lump_sum_drawdown_return_pct / 100
r        = (1 + r_annual)^(1/12) − 1
PV       = projected funds at retirement (post-tax-implied lump sum)

if N == 0 or PV ≤ 0:           PMT = 0
else if |r| < 1e-9:             PMT = PV / N             (zero-return fallback)
else:                           PMT = PV × r / (1 − (1 + r)^−N)
```
`life_expectancy` is bounded below by `retirement_age` (a life expectancy below retirement age collapses to PMT = 0).

### 5.5 Snapshot definitions

| Cell | Definition |
|---|---|
| **Current funds at 55** | Discretionary + TFSA (passive) + Crypto grown to age 55. Each component is gated by its `opt_include_*` flag — when unchecked, the fund contributes 0. |
| **Projected funds at 55** | Current funds + 1/3 RA commutation (if on) + savings-pot withdrawals (net) + house sale + inheritance − bond payoff. |
| **Projected funds at 68** | Same components projected forward to age 68 (Dutch-pension age). |
| **Current monthly at 55** | Full RA pot (no extras) × withdrawal rate / 12 × (1 − tax). |
| **Projected monthly at 55** | Annuitised RA pot (with optional contributions) × withdrawal rate / 12 × (1 − tax). |
| **Projected monthly at 68** | Projected drawdown at 68 + Dutch pension (ZAR, net), or Dutch pension only if pot has crossed the R 150k threshold and Dutch is enabled. |
| **Monthly from lump sum** | PMT annuity over `life_expectancy − retirement_age` years at `lump_sum_drawdown_return_pct` on the at-retirement lump sum (see §5.4). Same value displayed against both age columns. |
| **Max estimated monthly income (Age 55)** | `Projected monthly at 55` (RA drawdown net) + `Monthly from lump sum`. |
| **Max estimated monthly income (Age D)** | `Projected monthly at 68` (RA drawdown net + Dutch pension net) + `Monthly from lump sum`. |

### 5.6 Out of scope (v1)

Year-by-year growth chart, aggregate lifetime lump-sum tax, inflation-indexed caps, multi-scenario side-by-side, sequence-of-returns risk, full DTA detail for Dutch pension, spouse/household joint projection, estate duty, marginal-rate brackets for savings-pot tax, multiple RAs at different providers. Months-to-age math is month-precision (ignores day-of-month) — known small boundary noise within ~30 days of a target age, acceptable for multi-decade projections.

---

## 6. History Module

### 6.1 Goal

Give the user a year-by-year view of capital deployed — how much went toward debt reduction and how much went into investments, broken down by investment type.

### 6.2 Data Sources

| Column | Source |
|---|---|
| **Year** | Derived from transaction/repayment dates |
| **Debt Repaid** | Sum of extra mortgage repayments for that year |
| **Investments Total** | Sum of all investment transaction amounts for that year |
| **TFSA** | Sum of TFSA-type investment transactions for that year |
| **Discretionary** | Sum of Discretionary-type investment transactions for that year |
| **Crypto** | Sum of Crypto-type investment transactions for that year |

### 6.3 Rules

- Rows are sorted by year ascending.
- A totals row at the bottom sums all columns.
- Years with no activity are omitted.
- Empty values (no activity for that column/year) display as a dash.

---

## 7. Hard Requirements Summary

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
| R19 | RA Summary shows expected refund for the current tax year only, computed from actual contributions to date as `min(current_year_contributions, R 350,000) × refund_rate`. No future projection is performed. |
| R20 | RA settings (refund rate) are persisted as `param,<key>,<value>,` rows in `db/config.private.csv`; RA contribution transactions are stored in `db/transactions/ra.csv`. The public param `nominal_return_pct` lives in `db/config.public.csv`. |
| R21 | Retirement two-pot split: post-Sep-2024 RA balance is split 33% savings / 67% retirement; pre-Sep-2024 balance is "vested" and grows passively. |
| R22 | Retirement de minimis: RA pot < R 360,000 at retirement collapses to a full-commutation banner; monthly drawdown = 0. |
| R23 | Living-annuity threshold: annuitised pot < R 150,000 post-retirement triggers a commutation warning at age `ageAtThreshold`. |
| R24 | Retirement lump-sum tax follows the 2026/27 retirement table; first R 550,000 is tax-free. |
| R25 | TFSA cap is enforced when "TFSA contributions" is enabled: annual R 46,000 (current tax year + future March-start years) and lifetime R 500,000. |
| R26 | Show in today's money toggle deflates all displayed retirement figures by `(1 + cpi/100)^years_from_today`. |
| R27 | Retirement settings persist as `param,<key>,<value>,` rows split across `db/config.public.csv` (generic modelling assumptions such as `withdrawal_rate_pct`, `cpi_pct`) and `db/config.private.csv` (personal data and personal assumptions such as `dob`, `retirement_age`, `effective_tax_rate_pct`, scenario toggles). There is no separate `db/retirement.csv`. |
| R28 | Retirement tab reads RA pot today live from RA tab state via `calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)` — where `raTransactions` come from `db/transactions/ra.csv` — and reads TFSA / Discretionary / Crypto current values from the Investments tab — no shared state mutation. |
| R29 | TFSA card on the Investment Tracker shows lifetime-cap usage: lifetime-contributed amount, percent of R 500,000 used (clamped 0–100), remaining headroom, and a tri-coloured progress bar (emerald < 80%, amber 80–<100%, red ≥ 100%). |
| R30 | Dutch pension start age (`opt_dutch_age`, default 68) and monthly EUR amount (`opt_dutch_eur_monthly`, default 900) are user-configurable in the retirement sidebar, persisted in `db/config.private.csv`, and applied throughout the snapshot — including the "Age D" snapshot column header and the "From age D" monthly-income phase title. |
| R31 | Each of Discretionary, TFSA, and Crypto can be excluded from the retirement projection via `opt_include_discretionary`, `opt_include_tfsa`, `opt_include_crypto` (each default 1). When a flag is 0 the fund's value at every snapshot age (`liquid.at55`, `liquid.at68`, `liquid.atRetirement`) is forced to 0 and disappears from the lump-sum totals; the fund's Investment-tab value is unaffected. |
| R32 | Snapshot card includes a "Monthly from lump sum" row computed as a PMT annuity that depletes the at-retirement lump sum to zero by age `life_expectancy` (default 95) at annual return `lump_sum_drawdown_return_pct` (default 6, monthly-compounded). Both params are user-configurable in the Core sidebar; `life_expectancy` and `lump_sum_drawdown_return_pct` are public params persisted in `db/config.public.csv`. The Snapshot also shows a "Max estimated monthly income" row per age column = projected RA monthly net + lump-sum monthly. Real-terms toggle deflates each cell by years from today to its respective age. |

---

## 8. Data Files

### Data files

Live data lives under `db/`:

- `db/transactions/{budget,ra,investments,debt}.csv` — date-stamped rows and `current_value` snapshots. All gitignored.
- `db/config.public.csv` — generic modelling assumptions (return rates, CPI, withdrawal rate, etc.). Tracked in git.
- `db/config.private.csv` — personal data (DOB, balances) and personal assumptions (tax rates, scenario toggles). Gitignored.

Test mode mirrors the same layout under `db/test/`. Sample seed data lives under `db/examples/`.

The visibility allowlist that decides which params go to `config.public.csv` vs `config.private.csv` lives in `src/calculations.js` as `PUBLIC_PARAMS`.
