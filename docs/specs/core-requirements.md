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

### Currency notation (hard requirement)

Every displayed amount — summary cards, tables, tooltips, chart axes and chart tooltips, static HTML placeholders — uses **comma thousands separators and a dot decimal separator**: `R 3,000.50` means three thousand rand and fifty cents.

- The `en-ZA` locale must **not** be used for display; it renders `3 000,50` (space groups, comma decimal) and is explicitly forbidden.
- All formatting goes through `src/lib/format.js`, which pins `ZAR_LOCALE = 'en-US'`. No module may call `toLocaleString` directly.
- Cent-precise amounts show exactly two decimals (`fmtZAR`); whole-rand amounts show none (`fmtZARWhole`, `fmtZARSigned`, `fmtZARAxis`); bare grouped numbers without the `R` prefix use `fmtNum`.

### Amount entry and undo (hard requirements)

- **Rand amount inputs** (list-row amounts, current savings, available money, planned monthly savings, investment current values, debt loan/balance/repayment/service fee, RA current value, and the Retirement tab's money inputs) are `type="text" inputmode="decimal"`. They show a grouped value when idle (`400,000`, `45,000.50`; `fmtAmountInput`) and the raw value while focused.
- `parseAmount(text)` in `src/lib/format.js` is the single parser. It accepts `45000`, `45,000`, `45000.5`, `R 45,000.50`, `45k`, `1.2m` and a leading minus; commas are valid only as thousands groups (`1,2` is rejected); empty or unparseable text gives `null`. Invalid text never changes the stored value and marks the field `aria-invalid` until corrected.
- Stored state, config and CSV values stay plain numbers. Code must never read an amount input's `.value` with `parseFloat` (a formatted `"400,000"` would read as 400). Percent, age and BTC inputs stay `type="number"`.
- **Every delete of a list row is undoable** for 8 seconds: the row is removed and saved immediately, and an Undo toast restores the same object (same `id`) at its original index and saves that as a new edit.

---

## 1. Budget Module

### 1.1 Domain Concepts

| Concept | Definition |
|---|---|
| **Savings** | Total liquid cash available right now. |
| **Debt** | A fixed obligation that reduces available savings immediately (e.g. a bill owed). Each debt has a description and an amount. |
| **Provision** | Money set aside for a known future obligation, treated as already spent for planning purposes. Each provision has a description, amount, and a target date. |
| **Future Cost** | An anticipated expense at a specific future date. Unlike provisions, future costs are not yet deducted — they are projected against a chosen future date. Each future cost has a description, amount, and date. |
| **Commitment** | The umbrella term for a debt, a provision or a future cost (its *kind*). The Budget tab shows all commitments in one ledger, sorted soonest-first with undated rows (all debts, fresh rows) at the top. Changing a commitment's kind moves it between the three lists and keeps its id, description and amount; a debt has no due date, so becoming a debt drops the date (`changeCommitmentType`). Storage is unchanged: `budgetData` keeps `debts`, `provisions` and `futureCosts`, and the budget CSV layout is the same. |

### 1.1a Future Cost → Provision

Once a future cost's date has passed, the money behind it was either **saved** (it is now genuinely set aside, and the cost becomes a provision) or **spent** (the savings balance already reflects it, and the row is simply deleted). Nothing in the data distinguishes the two, so the app never converts automatically — a past-due cost shows a **Past due** badge and a **Move to provisions** text button; the user either moves it across or deletes it.

Converting carries the description, amount and original date over unchanged. It reduces Current Net Amount by the row's amount and leaves Future Net unchanged, since a past-dated cost was already counted against every future target date.

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
- **ETF investment** (exchange-traded fund) — percentage of remainder.
- **Crypto investment** — percentage of remainder; always the balance (see below).

```
Remainder = Available Money − Monthly Savings Target

Mortgage Amount = Remainder × Mortgage%
ETF Amount      = Remainder × ETF%
Crypto Amount   = Remainder × Crypto%

Total Allocated = Monthly Savings Target + Mortgage Amount + ETF Amount + Crypto Amount
Leftover        = Available Money − Total Allocated
```

**Self-balancing percentages** (`balanceAllocation`, pure, in `src/calc/budget.js`): Mortgage % and ETF % are the editable inputs; **Crypto % = 100 − Mortgage % − ETF %** and is never typed. Each percentage is rounded to 0.1 and clamped to [0, 100]. If an edit would push Mortgage + ETF over 100, the *other* editable field is reduced so the total is exactly 100 (the field being edited wins). The three percentages therefore always sum to 100.

**Hard constraints:**
- The allocation recalculates live on every input; there is no Calculate action.
- If available money is below the monthly savings target, there is nothing to allocate: the amounts show as zero and a note states the shortfall.
- Available money and the Mortgage % / ETF % are persisted to private config (`budget_alloc_available`, `budget_alloc_mortgage_pct`, `budget_alloc_etf_pct`).

### 1.6 Timeline Overview Chart (runway)

A read-only visualisation at the **top** of the budget tab, full width above the Commitments ledger. It answers: "what monthly savings rate do I need so my running balance stays at or above the debts + provisions floor at every future cost up to my target date, how close does my planned line get to the floor, and when?"

**Target date and horizon (two separate dates):**
- The **target date** is the §1.3 `future-date` value ("Net savings on"). It drives the recommended rate below and the "Net savings on [date]" figures, exactly as before.
- The **horizon** is how far the chart runs:

```
horizon = max( addMonths(max(target date, latest dated future cost), 3),
               addMonths(today, 12) )
```

  Future costs dated before today are ignored for the horizon. Moving the target date inside `[today, latest cost]` does not move the horizon, and while the target-date slider is held the horizon is frozen; it is recomputed when the slider is released or the date is typed.
- If `future-date` is missing or in the past, the chart card shows a short placeholder.
- If no future cost is dated inside `[today, horizon]`, the chart is still drawn (a straight planned line) with an empty-state note under it.

**Required monthly savings (chart-derived, "Recommended"):**

```
floor = Total Debts + Total Provisions
in-window costs = future costs with today ≤ cost.date ≤ target date

For each in-window cost i (and for the target-date endpoint), let
  t_i      = months between today and this point
  cum_i    = sum of in-window cost amounts with date ≤ this point
  needed_i = max(0, (cum_i + floor + buffer − Current Savings) / t_i)

Required Monthly Savings = max over all such i of needed_i      (buffer = 0)
```

This rate is the smallest constant monthly contribution that keeps the running savings balance at or above the floor at every in-window cost date AND at the target date. Costs after the target date (but before the horizon) are drawn but do not count. It is computed by the chart and does **not** override §1.4's `Monthly Savings Target` — the two answer different questions. Pure helper: `requiredMonthlySavings({ startSavings, floor, costs, todayMs, endMs, buffer })`.

**Minimum buffer and "Save per month to stay above buffer":**
- `Minimum buffer (R)` is an amount input next to "Monthly savings (planned)", persisted as the private config key `budget_min_buffer` (default 0; leaving it blank removes the key).
- `Save per month to stay above buffer` = the same loop with `buffer = budget_min_buffer`, over **every dated cost up to the horizon**, with the **horizon** as the endpoint. It is the smallest monthly rate that keeps the trajectory at or above `floor + buffer` at every cost date and at the horizon.

**Lowest point ahead:**

```
lowest point = min over the planned trajectory points p in [today, horizon] of (p.y − floor)
```

reported with the date of that point (the earliest one on a tie). It is shown above the chart and turns amber when `lowest point < budget_min_buffer`. Pure helper: `lowestPoint(trajectory, floor)`.

**Planned vs recommended monthly savings:** there is a numeric input above the chart labelled "Monthly savings (planned)". The chart draws two trajectories: a solid **Planned** line using this input value (the *effective* monthly rate) and a dashed amber **Recommended** line always using the `Required Monthly Savings`. When the Planned line's lowest point dips below the floor (i.e. the chosen rate is too low), it turns from green to red, making the deficit visible against the always-present recommendation. The input is **persisted** to `db/config.private.json` under `budget_planned_monthly_savings` via the standard debounced auto-save; when blank it shows the recommended amount as a placeholder and the Planned line follows (overlaps) the Recommended line. The "Use recommended" button (and clearing the input) removes the saved override. The headline always reports the *required* rate.

**Series shown (single x-axis, single y-axis "Amount (R)"):**
- **Future-cost events** — one point per dated future cost in `[today, horizon]`, on the Planned line at its date (the balance just before the step-down), coloured like the Future-cost chip. Hover shows description, date and amount; clicking scrolls to that row in the Commitments ledger and highlights it for 1.5 s. Provisions are not drawn: they are already subtracted from today's figure.
- **Planned / Recommended trajectories** — piecewise-linear lines starting at `(today, Current Savings)`, sloping up by their monthly rate, stepping down by each cost amount on that cost's date, and extending to the horizon.
- **Debts + provisions floor** — slate dashed flat line at `Total Debts + Total Provisions`, drawn as a real line series. The per-row dates on debts and provisions are ignored. When a minimum buffer is set, a dashed amber "Floor + buffer" y-axis annotation is drawn at `floor + buffer`.
- **Target-date marker** — a vertical x-axis annotation at the target date.

**Headline:** above the chart, in plain words: `Save R X,XXX/month to keep above the R Y,YYY debts + provisions floor through R Z,ZZZ in future costs by DD MMM YYYY.` (without the "through … in future costs" part when no cost falls before the target date).

**Interaction:** pan/zoom enabled via the chart toolbar; the adjusted window is **not** persisted. The target date can be set by dragging the range slider under the chart (same range as the chart, today → horizon) or by typing in the date input; both write the same `future-date` value, so the summary card and the KPI strip's "Net savings on [date]" follow.

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

#### Annualized Return (XIRR)

Computed as the true cash-flow-weighted internal rate of return (XIRR) over the
account's actual contribution dates, so periodic and uneven contributions are
each weighted by how long they were invested:

```
Cash flows = [ −amount @ transaction.date for each contribution ]  +  [ +Current Value @ today ]

Annualized Return = xirr(cash flows) × 100   (Newton-Raphson, see §3.6)
```

A weighted-average holding period is still derived for display and for the
short-history guard:

```
Weighted Average Age (days) = sum(transaction.amount × transaction.age_in_days) / Total Invested
Years Held = Weighted Average Age / 365.25
```

- When `Years Held ≤ 0.1`, annualized return returns `N/A` (annualizing a few
  weeks of gain produces meaningless extremes).
- If XIRR fails to converge, fall back to the simple CAGR
  `((Current Value / Total Invested) ^ (1 / Years Held) − 1) × 100`.

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

**CGT exclusion progress bar (Discretionary only):** a progress bar shown directly beneath the Estimated tax (CGT) line indicates how close the unrealized gain is to triggering CGT, mirroring the TFSA lifetime-cap bar.
```
Percent Used = (max(0, Absolute Return) / Annual Exclusion) × 100   // bar width clamped to 100%
Remaining    = max(0, Annual Exclusion − Absolute Return)            // labelled "R <remaining> before CGT"
```
Colour: emerald below 80%, amber at ≥ 80%, red at ≥ 100% (gain has crossed the exclusion and CGT now applies). The bar reflects the gain vs the R 40,000 threshold only; it is independent of the marginal rate.

**Help popover:** an info icon button beside the "Estimated tax (CGT)" label explains, in an accessible toggle popover (button with `aria-expanded`, Escape/outside click closes), that the figure is the worst-case estimate (everything sold at once, single R 40,000 exclusion); that the exclusion resets each SA tax year and applies to the gain rather than the amount sold; and how **tax-gain harvesting** (keeping each year's realised gain under R 40,000, selling and rebuying to reset base cost) can reduce or avoid CGT. Includes a "general info, not tax advice" disclaimer.

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

Track contributions to a South African Retirement Annuity, hold the actual current fund value reported on the user's RA statement, estimate the expected refund for the current tax year (based on actuals to date), and surface the deductible refund per past tax year.

### 4.2 Domain Concepts

| Concept | Definition |
|---|---|
| **Contribution** | A single deposit into the RA. Has a date, description (default: "monthly repayment"), and ZAR amount. |
| **Current fund value** | The actual ZAR balance of the RA pot, taken from the user's latest RA statement. Stored as a `current_value,RA,<amount>,` row in `db/transactions/ra.csv` (mirroring the Investments tab pattern). Optional — when absent, downstream consumers fall back to the contributions-based estimate. |
| **Tax year (SA)** | Runs **1 March → 28/29 February**. A 2026/27 tax year covers 2026-03-01 → 2027-02-28. |
| **Tax refund rate** | The user's marginal income tax rate (%). Default 41. |
| **Nominal return rate** | Assumed annual return on the RA pot (%). Default 10. |
| **SARS deductibility cap** | Hard constant: contributions deductible per tax year are capped at **R 430,000**. |

### 4.3 Total Contributed and Expected Refund (Current Tax Year)

```
Total Contributed = sum of all contribution amounts
Current Year Total = sum of contributions whose date falls in the current SA tax year
Expected Refund (current tax year) = MIN(Current Year Total, R 430,000) × (Refund Rate / 100)
```

The expected-refund figure is based on actual contributions to date only (no future projection). When `Current Year Total > R 430,000`, a `capHit` warning is shown.

### 4.4 Cap-Hit Detection

Each contribution is bucketed into the SA tax year of its date. If any tax year's bucketed total exceeds **R 430,000**, the RA Summary surfaces a "cap hit in some year" amber pill beneath the Expected refund value. No per-year breakdown is rendered.

### 4.5 Performance Metrics

The RA Summary card mirrors the Investments tab's per-fund performance layout, taking the user-entered **Current fund value** and the contribution history and computing:

| Metric | Definition |
|---|---|
| **Invested** | `Σ contribution_amount` (sum of all contribution rows). |
| **Gain/Loss (R)** | `current_value − invested`. |
| **Gain/Loss %** | `(current_value − invested) / invested × 100`. |
| **Annualized %** | True cash-flow-weighted XIRR over the actual contribution dates (falls back to simple CAGR if XIRR fails to converge). Returns `N/A` when fewer than ~0.1 years of holding history exists. |
| **6% savings would be** | Hypothetical gain if each contribution had instead earned 6% p.a. with daily compounding from its date to today. |
| **Net vs savings** | `Gain/Loss − (6% savings)`. |

All formulas come from the shared `calculateInvestmentPerformance` helper (the same one used by the Investments tab); for RA it is invoked with `marginalRate=0` because RA withdrawals are taxed via the lump-sum / income-tax tables, not CGT, so the tax-adjusted "after tax" rows are not rendered.

### 4.6 Pot-Value Estimate (legacy, internal only)

The contributions × nominal-return estimate (`r_m = (1 + Nominal Return / 100)^(1/12) − 1; Pot = Σ amount × (1 + r_m)^months_between(date, today)`) is no longer surfaced in the RA tab UI. It is still computed inside the Retirement module as a fallback for `retRaPotToday()` when the user has not entered an actual current fund value; in that fallback path, future-dated contributions are treated as having grown 0 months.

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
| **Dutch pension** | Optional monthly income paid in EUR. Default €900/month from age 68; both the start age and the EUR/month amount are user-configurable. ZAR conversion uses the user-supplied EUR/ZAR rate. Assumed to escalate with CPI, so it holds its real value over time (flat in today's money). |
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

**Real-terms deflation** (when "Show in today's money" is on, which is the default):
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

### 5.5a Interactive retirement timeline (scenario)

A single interactive card (replacing the former 3-bar "Retirement at a glance" and auto-PMT timeline cards) produced by `buildRetirementScenarioTimeline` and returned as `snapshot.scenario`. It walks the projection **month-by-month from today** and samples one point per integer age over `[startAge, life_expectancy]`, where `startAge = min(55, retirement_age)` (RA becomes accessible at 55). Every value is net of tax and deflated to today's money when `show_real_terms` is on. The card draws a vertical line at the retirement age.

It exposes one user control, `ret_scenario_monthly_drawdown` (R/month, persisted in `db/config.private.json`), which **replaces** the previous automatic lump-sum PMT: from the retirement age the user's entered amount is drawn from liquid capital.

**Phases each month:**
- **Accumulation (`age < retirement_age`)** — liquid pools (discretionary/TFSA/crypto, each gated by its `opt_include_*` flag) grow at their own returns; the RA two-pot grows with optional extra contributions (`opt_ra_monthly_*`, split 33/67); max-TFSA top-ups (`opt_tfsa_enabled`) add the annual cap each 1 March until the lifetime cap; savings-pot withdrawals (`opt_savings_pot_withdrawal_*`) appear as RA savings-pot income. No annuity income and no manual drawdown yet.
- **At retirement age** — one-off lumps land in liquid capital: `+ house_sale + inheritance_zar − bond_payoff`. The manual monthly drawdown begins.
- **At RA-access age (`max(retirement_age, 55)`)** — the RA pot is annuitised (× 2/3 if commuting, full otherwise; a full pot below the R360,000 de minimis is fully commuted to liquid capital net of lump-sum tax, with no annuity). The commuted lump joins liquid capital. The living-annuity drawdown income begins: `gross = pot × withdrawal_rate/12`, net of tax, `pot = pot × (1 + monthly return) − gross`; a sub-R150,000 residual commutes into liquid capital and income stops.
- **Dutch pension** adds its net monthly amount from `opt_dutch_age` when enabled. It is assumed to escalate with CPI, so it holds its purchasing power: the nominal amount grows by `(1 + cpi/100)^years_from_today`, making it a flat line in real terms (and a rising one in nominal terms).

**Manual drawdown** is taken **proportionally** across the liquid pools (discretionary, TFSA, crypto, "RA lump + one-offs"), capped each month at the remaining liquid total so capital never goes negative; the first age the cap binds is reported as `drawdownExhaustedAge`. With nothing checked and no drawdown, it is simply current capital growing to retirement age and beyond.

**Output** (`snapshot.scenario`): `{ points: [{ age, income: { raAnnuity, raSavingsPot, dutch, manualDraw, total }, capital: { discretionary, tfsa, crypto, raLumpOneOff, raPot, total } }], startAge, retAge, dutchAge, lifeExp, realTerms, drawdownExhaustedAge }`.

Both charts re-render on the same triggers as Card 0 (R28).

### 5.5b Pinned scenarios

The user can pin up to **3** retirement parameter sets ("scenarios") and compare them with the current settings side by side.

- **Storage:** private config key `ret_scenarios` = array of `{ id, label, params }`. `params = retirementParamsDiff(current)`: only the retirement keys whose values differ from the defaults, excluding the display-only `show_real_terms`. Default label: `Retire at <retirement_age> · <withdrawal_rate_pct>% draw`.
- **Resolution:** `resolveScenarioParams(current, scenario.params) = { ...current, ...defaults, ...scenario.params }` with `show_real_terms` taken from the current params. Keys the scenario doesn't store therefore resolve to the defaults, not to the current values.
- **Headline numbers per card** come from `calculateRetirementSnapshot` with the resolved params: net monthly income at 55 (`monthly.projected55.net`), net monthly income at the Dutch-pension age (`monthly.projected68.net`), and capital at retirement (`lumpSum.atRetirement`). All follow the real-terms toggle (R26).
- **Apply** replaces the current params with the resolved set and is undoable (undo toast) back to the previous params; **Remove** is undoable too.

### 5.6 Out of scope (v1)

Aggregate lifetime lump-sum tax, inflation-indexed caps, multi-scenario projections beyond the pinned headline cards (§5.5b), sequence-of-returns risk, full DTA detail for Dutch pension, spouse/household joint projection, estate duty, marginal-rate brackets for savings-pot tax, multiple RAs at different providers. Months-to-age math is month-precision (ignores day-of-month) — known small boundary noise within ~30 days of a target age, acceptable for multi-decade projections.

---

## 6. History Module

### 6.1 Goal

Give the user a year-by-year view of capital deployed — how much went toward debt reduction, how much went into investments (broken down by investment type), and how much went into the RA — shown as a table plus a category breakdown and a timeline.

### 6.2 Data Sources

| Column | Source |
|---|---|
| **Year** | Derived from transaction/repayment dates |
| **Debt Repaid** | Sum of extra mortgage repayments for that year |
| **Investments Total** | Sum of all investment transaction amounts for that year (TFSA + Discretionary + Crypto) |
| **TFSA** | Sum of TFSA-type investment transactions for that year |
| **Discretionary** | Sum of Discretionary-type investment transactions for that year |
| **Crypto** | Sum of Crypto-type investment transactions for that year |
| **RA** | Sum of RA contributions for that year, kept separate from the Investments Total |

### 6.3 Rules

- Rows are sorted by year ascending.
- A totals row at the bottom sums all columns.
- Years with no activity are omitted.
- Empty values (no activity for that column/year) display as a dash.

### 6.4 Charts

Two ApexCharts visualisations accompany the table. Both use one shared category list — **Debt Repaid, Discretionary, TFSA, RA, Crypto** — so colours and labels are consistent across the table, the pie, and the timeline.

- **Total Allocated by Category** — a donut of all-years grand totals per category; zero-total categories are omitted and the centre shows the overall total.
- **Allocation Timeline** — a per-year stacked bar chart, stacked by the same five categories; categories with no positive year are omitted.

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
| R7 | Investment annualized return uses true cash-flow-weighted XIRR over actual contribution dates (falls back to weighted-average-period CAGR if XIRR fails to converge). |
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
| R18 | RA per-tax-year deductible is capped at R 430,000 (SARS hard cap). The lifetime refund figure ignores the cap and shows a warning when any year exceeds it. |
| R19 | RA Summary shows expected refund for the current tax year only, computed from actual contributions to date as `min(current_year_contributions, R 430,000) × refund_rate`. No future projection is performed. |
| R20 | RA settings (refund rate) are persisted as keys in `db/config.private.json` (a flat JSON object); RA contribution transactions are stored in `db/transactions/ra.csv`. The public param `nominal_return_pct` lives in `db/config.public.json`. |
| R21 | Retirement two-pot split: post-Sep-2024 RA balance is split 33% savings / 67% retirement; pre-Sep-2024 balance is "vested" and grows passively. |
| R22 | Retirement de minimis: RA pot < R 360,000 at retirement collapses to a full-commutation banner; monthly drawdown = 0. The same rule applies at age 55 — when the RA pot at 55 is below R 360,000 (and no 1/3 commutation is otherwise taken), the full pot net of lump-sum tax is added to the Age-55 lump sum, an amber note explains monthly RA drawdown is N/A, and `snapshot.lumpSum.ra55IsDeMinimis` is set. |
| R23 | Living-annuity threshold: annuitised pot < R 150,000 post-retirement triggers a commutation warning at age `ageAtThreshold`. |
| R24 | Retirement lump-sum tax follows the 2026/27 retirement table; first R 550,000 is tax-free. |
| R25 | TFSA cap is enforced when "Max TFSA contributions" is enabled: on top of the current TFSA value, top up to annual R 46,000 (current tax year + future March-start years) until the lifetime R 500,000 cap is reached. |
| R26 | Show in today's money toggle deflates all displayed retirement figures by `(1 + cpi/100)^years_from_today`. Defaults to on (`show_real_terms: 1`). |
| R27 | Retirement settings persist as keys in `db/config.public.json` (generic modelling assumptions such as `withdrawal_rate_pct`, `cpi_pct`) and `db/config.private.json` (personal data and personal assumptions such as `dob`, `retirement_age`, `effective_tax_rate_pct`, scenario toggles). There is no separate `db/retirement.csv`. |
| R28 | Retirement tab reads RA pot today live from RA tab state, preferring the user-entered actual fund value (the `current_value,RA,<amount>,` row in `db/transactions/ra.csv`); when no actual value is set, it falls back to `calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)`. TFSA / Discretionary / Crypto current values are read from the Investments tab; editing any of these current-value inputs re-renders the retirement snapshot live (no tab switch required). No shared state mutation. |
| R29 | TFSA card on the Investment Tracker shows lifetime-cap usage: lifetime-contributed amount, percent of R 500,000 used (clamped 0–100), remaining headroom, and a tri-coloured progress bar (emerald < 80%, amber 80–<100%, red ≥ 100%). |
| R30 | Dutch pension start age (`opt_dutch_age`, default 68) and monthly EUR amount (`opt_dutch_eur_monthly`, default 900) are user-configurable in the retirement sidebar, persisted in `db/config.private.json`, and applied throughout the snapshot — including the "Age D" snapshot column header and the "From age D" monthly-income phase title. |
| R31 | Each of Discretionary, TFSA, and Crypto can be excluded from the retirement projection via `opt_include_discretionary`, `opt_include_tfsa`, `opt_include_crypto` (each default 1). When a flag is 0 the fund's value at every snapshot age (`liquid.at55`, `liquid.at68`, `liquid.atRetirement`) is forced to 0 and disappears from the lump-sum totals; the fund's Investment-tab value is unaffected. These flags persist in `db/config.private.json` and are restored to the checkboxes on load. The "Max TFSA contributions" toggle (`opt_tfsa_enabled`) is dependent on TFSA inclusion: enabling it auto-enables `opt_include_tfsa`, and disabling `opt_include_tfsa` auto-disables `opt_tfsa_enabled`. |
| R32 | Snapshot card includes a "Monthly from lump sum" row computed as a PMT annuity that depletes the at-retirement lump sum to zero by age `life_expectancy` (default 95) at annual return `lump_sum_drawdown_return_pct` (default 6, monthly-compounded). Both params are user-configurable in the Core sidebar; `life_expectancy` and `lump_sum_drawdown_return_pct` are public params persisted in `db/config.public.json`. The Snapshot also shows a "Max estimated monthly income" row per age column = projected RA monthly net + lump-sum monthly. Real-terms toggle deflates each cell by years from today to its respective age. |
| R33 | The Budget Timeline chart draws two savings trajectories: a solid **Planned** line (the user's planned monthly rate) and a dashed **Recommended** line (always the `requiredMonthlySavings`). `buildBudgetTimelineSeries` returns both `savingsLine` (planned) and `recommendedLine`; they coincide when no planned override is set. The planned amount persists in `db/config.private.json` under `budget_planned_monthly_savings` (non-public; absent → follow the recommendation) and is restored to the input on load. |
| R34 | *(Superseded by R38.)* The Retirement tab previously rendered two stacked-bar "Retirement at a glance" charts (Age 55 / Age D / Retirement age) and an auto-PMT year-by-year timeline; both were replaced by the single interactive scenario timeline in R38. |
| R35 | A header KPI strip shows four read-only figures above the tab bar — Net savings now, Net savings on the selected date, Portfolio value (sum of the three Investments current values), and Debt-free by (projected payoff month, or `Never`). These are mirrors of values the tabs already compute; the strip introduces no calculations of its own and updates on the same triggers as its source tab. |
| R36 | A header save-status chip aggregates the state of all auto-save POSTs: `Saving…` while any save is in flight, `All changes saved` after the last in-flight save succeeds, `⚠ Save failed — Retry` on any error. A failure indication persists until a successful save, so a silent failed write cannot go unnoticed, and clicking the chip re-sends every save that failed since its last success (`retryFailedSaves`). Auto-save is the only save model: no per-tab Save buttons and no header Refresh button. |
| R37 | Allocation validation failures (R5/R6) are presented inline in the budget summary card, not as blocking browser alerts. |
| R38 | The Retirement tab renders one interactive scenario timeline (`snapshot.scenario`, from `buildRetirementScenarioTimeline`; §5.5a) below the Snapshot card, replacing the older chart cards. It walks the projection month-by-month from today and samples per integer age over `[min(55, retirement_age), life_expectancy]`, with a vertical line at the retirement age. Two stacked-area charts: monthly net income by source (RA annuity / RA savings-pot / Dutch pension / user capital drawdown) and available capital by pool (discretionary / TFSA / crypto / RA lump + one-offs / annuitised RA pot). A user-entered `ret_scenario_monthly_drawdown` (persisted, private) replaces the automatic PMT: from the retirement age it is drawn **proportionally** across the liquid pools, capped so capital never goes negative. RA annuitises at `max(retirement_age, 55)` (full commutation below the R360k de minimis; sub-R150k residual commutes to liquid capital mid-retirement). All ticked optional-scenario boxes (fund inclusion, max TFSA, extra RA, savings-pot, house, inheritance, bond, Dutch) fold into the projection. Respects the real-terms toggle (R26) and re-renders on the same triggers as Card 0 (R28). |
| R40 | The Budget tab lists debts, provisions and future costs in one **Commitments** ledger (Type chip · Description · Amount · Due · delete). Every row carries `data-id` (the item id). Debt rows have no editable due date. Filter chips (All / Debts / Provisions / Future costs, with counts, `aria-pressed`) narrow the table; the chosen filter is remembered per browser in `localStorage` only, not in config. The footer shows the total for the current filter, plus per-kind subtotals on All. A quick-add field parses one line with `parseQuickAdd` (kind keyword `debt`/`provision`, else future cost; `YYYY-MM-DD` or `<month> YYYY` date; first amount `parseAmount` accepts, a bare year only as a last resort; the rest is the description) and adds the row on Enter only when both a description and an amount were found. Enter on an empty quick-add field adds a blank Future cost row. There are no "+ Add" buttons. |
| R39 | Sample data mode is announced by a header pill ("Sample data") and a full-width amber banner under the header with a **Switch to my data** button. File paths are not shown in tab toolbars; they appear only as a muted footnote inside the per-tab `⋯` overflow menu, next to **Import CSV…** (Investments, Debt, RA, Retirement; Budget has no import and no menu). Explanatory help text (e.g. the CGT note) lives in toggle popovers built on one shared helper (`src/lib/popover.js`): a real `<button>` with `aria-expanded`, closing on Escape and outside click. |
| R41 | The Budget tab opens with the runway timeline (§1.6), full width above the Commitments ledger. The chart runs from today to a horizon = max(target date, latest dated future cost) + 3 months, at least 12 months, and is drawn even when no cost falls in range. `buildBudgetTimelineSeries` takes `horizonDate` separately from `futureDate`; with `horizonDate === futureDate` its output is unchanged (regression-tested). The target date is set by a range slider under the chart (an x-axis annotation marks it) or by the date input; both write `future-date`. Each dated future cost is a point on the planned line that links to its ledger row. "Lowest point ahead" = min(planned trajectory − floor) with its date, amber below the minimum buffer; "Save per month to stay above buffer" = the required-savings loop with floor + buffer over every cost up to the horizon and at the horizon. The buffer is the private config key `budget_min_buffer` (default 0; blank removes it). |
| R42 | The Retirement tab has a **Pin scenario** button above the results that saves the current params as a scenario (max 3) in the private config key `ret_scenarios` (array of `{ id, label, params }`, `params` = only the keys that differ from the defaults; not in `PUBLIC_PARAMS`). A Current card and one card per scenario show net monthly income at 55 and at the Dutch-pension age and capital at retirement, recalculated live from `calculateRetirementSnapshot` and following the real-terms toggle. Each scenario card has an editable label, **Apply** (loads the params into the sidebar, undoable via the undo toast) and **Remove** (undoable). |

---

## 8. Data Files

### Data files

Live data lives under `db/`:

- `db/transactions/{budget,ra,investments,debt}.csv` — date-stamped rows and `current_value` snapshots. All gitignored.
- `db/config.public.json` — generic modelling assumptions (return rates, CPI, withdrawal rate, etc.). Tracked in git.
- `db/config.private.json` — personal data (DOB, balances) and personal assumptions (tax rates, scenario toggles). Gitignored. Values are scalars except `ret_scenarios`, an array of pinned retirement scenarios (§5.5b). Private keys added in the 2026-10 UX redesign: `budget_min_buffer` (§1.6), `budget_alloc_available`, `budget_alloc_mortgage_pct`, `budget_alloc_etf_pct` (§1.5) and `ret_scenarios` (§5.5b); none of them is in `PUBLIC_PARAMS`.

Test mode mirrors the same layout under `db/test/`. Sample seed data lives under `db/examples/`.

The visibility allowlist that decides which params go to `config.public.json` vs `config.private.json` lives in `src/calculations.js` as `PUBLIC_PARAMS`.
