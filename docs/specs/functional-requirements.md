# Personal Finance Dashboard — Functional Requirements

## Overview

A single-page web application for personal financial management with six modules: Budget Calculator, Investment Tracker, Debt Calculator, RA, Retirement, and History. All data is persisted as CSV files via a lightweight HTTP server. Currency is South African Rand (R).

---

## 1. Budget Calculator

### 1.1 Current Savings

- Single numeric input representing total liquid savings (R).
- Changes trigger an immediate recalculation of the financial summary.

### 1.2 Debts

- Dynamic list of debt line items, each with:
  - **Description** (text)
  - **Amount** (R, numeric)
- Users can add and remove items.

### 1.3 Provisions

- Dynamic list of provision line items, each with:
  - **Description** (text)
  - **Amount** (R, numeric)
  - **Date** (date)
- Users can add and remove items.

### 1.4 Future Costs

- Dynamic list of anticipated future costs, each with:
  - **Description** (text)
  - **Amount** (R, numeric)
  - **Date** (date)
- Users can add and remove items.

### 1.5 Financial Summary

Calculated in real time whenever any input changes:

- **Current Net Amount** = Savings - Total Debts - Total Provisions
  - Displayed green when >= 0, red when < 0.
- **Future Net Amount** = Current Net Amount - sum of Future Costs whose date <= selected future date
  - A date picker selects the target date (defaults to 1 year from today).
  - Displayed indigo when >= 0, red when < 0.
- **Breakdown** showing:
  - Total Savings
  - Total Debts
  - Total Provisions
  - Total Future Costs (all, regardless of date)
- **Monthly Savings Target**: the monthly amount needed to reach the Future Net Amount by the selected date.
  - Calculation: divides the shortfall by the number of months remaining (days / 30, minimum 1 month).
  - Shows R 0.00 if the future net amount is already positive and >= current net amount.

### 1.6 Monthly Money Allocation

Splits available end-of-month money across investment categories:

- **Inputs**:
  - Available Money at End of Month (R)
  - Mortgage Repayment (%, default 50)
  - EFT (%, default 50)
  - Crypto (%, default 0)
- **Validation**:
  - Total percentage must not exceed 100%.
  - At least one percentage must be > 0.
  - Available money must exceed the monthly savings target.
- **Outputs** (shown on "Calculate Allocation" click):
  - Required Savings (= monthly savings target from summary)
  - Mortgage Repayment amount = (Available - Savings Target) * Mortgage%
  - EFT amount = (Available - Savings Target) * EFT%
  - Crypto amount = (Available - Savings Target) * Crypto%
  - Total Allocated = Savings + Mortgage + EFT + Crypto

---

## 2. Investment Tracker

### 2.1 Portfolio Accounts

Three fixed account types:

- **Discretionary**
- **TFSA** (Tax-Free Savings Account)
- **Crypto**

Each account displays:

- **Current Value** — editable numeric input (R)
- **Total Invested** — sum of all transaction amounts for this account
- **Gain/Loss (R)** — absolute return = Current Value - Total Invested
- **Gain/Loss (%)** — percentage return = (absolute return / total invested) * 100
- **Annualized Return** — compound annualized growth rate based on a weighted-average holding period per transaction:
  - Weighted average age (days) = sum(amount * age_in_days) / total_invested
  - Years held = average age / 365.25
  - Annualized = ((current_value / total_invested) ^ (1 / years_held) - 1) * 100
  - Shows "N/A" if years held <= 0.1 or data is insufficient.
- **6% Savings Comparison** — hypothetical gain if each transaction amount had been in a 6% p.a. savings account from its transaction date to today, compounded daily: `amount * (1.06 ^ (age_days / 365.25) - 1)`.
- **Net vs Savings** — absolute return minus the 6% savings gain.

For the **Discretionary** account specifically (only):

- **Marginal tax rate (%)** — editable numeric input below Current Value. Default `41`. Range `0..100`, step `1`. Persisted in `investments.csv` via the `param,marginal_rate,...` row.
- **Estimated tax (CGT)** — `taxable = max(0, gain − R 40,000)`, then `tax = taxable × 0.40 × (marginal_rate / 100)`. Rendered as a negative red amount when > 0, otherwise `R 0.00`. Always shown.
- **Net vs savings (after tax)** — `Net vs Savings − Estimated Tax`. Green when ≥ 0, red when < 0.

These three rows are **not** shown on the TFSA or Crypto cards.

For the Crypto account specifically:

- **Total BTC** — sum of all `cryptoValue` fields across Crypto transactions.

### 2.2 Transactions

- Dynamic list of investment transactions, each with:
  - **Date** (date input)
  - **Description** (text)
  - **Amount** (R, numeric)
  - **BTC value** (numeric, only visible when account type = Crypto)
  - **Account Type** (dropdown: Discretionary, TFSA, Crypto)
- Users can add and remove transactions.
- Displayed sorted by date descending (most recent first), then by creation order descending.
- Changing a transaction's type to/from Crypto toggles the BTC value field visibility and clears the value when switching away.

---

## 3. Debt Calculator (Mortgage)

### 3.1 Mortgage Details

Fixed set of loan parameters:

| Field | Description |
|---|---|
| Total Loan Amount | Original principal (R) |
| Current Outstanding Balance | Current principal (R) |
| Total Monthly Repayment | Monthly payment amount (R) |
| Monthly Service Fee | Fee deducted from repayment (R) |
| Interest Rate | Annual rate (%), converted to daily rate internally: `(rate / 100) / 365` |
| Next Payment Date | Auto-set to the upcoming 25th of the month (read-only) |
| Loan Start Date | Date the loan originated |
| Original Term | Loan term in months |

**Upcoming 25th logic**: if today's date > 25, next payment is the 25th of next month; otherwise the 25th of the current month.

### 3.2 Extra Repayments

- Dynamic list of extra (additional) repayments made toward the mortgage, each with:
  - **Date** (date)
  - **Description** (text)
  - **Amount** (R, numeric)
- Users can add and remove entries.
- Displayed sorted by date descending.

### 3.3 Projection Results

Simulates the loan to payoff under two scenarios:

1. **Baseline** — regular monthly repayments only (no extras).
2. **Actual** — regular repayments + all extra repayments applied in their respective months.

Both simulations use **daily compounding interest** aggregated per month:

- Monthly interest factor = `(1 + daily_rate) ^ days_in_month - 1`
- Each month: balance += balance * monthly_factor, then subtract repayment.
- Simulation runs until balance <= R 10 or 1200 months (100 years).

**Back-calculation**: when extra repayments predate the next payment date, the system back-calculates the starting balance at the earliest repayment date by reversing interest and repayment operations month-by-month.

**Displayed outputs**:

| Metric | Calculation |
|---|---|
| Interest Saved | (Baseline total interest + fees) - (Actual total interest + fees) |
| Total Extra Paid | Sum of all extra repayment amounts |
| Net Return (Cash) | Same as Interest Saved |
| Annualized Yield | XIRR of cash flows: extra repayments as outflows, then saved monthly repayments (after actual payoff until baseline payoff) as inflows |
| Time Reduced | Baseline months - Actual months, displayed as "Xy Zm" |
| New End Date | Actual simulation end date |
| Original End Date | Loan Start Date + Original Term months (or baseline end date if not specified) |

**Guard**: if the effective repayment (total repayment - service fee) does not exceed one month's interest on the current balance, results show "Never" for end dates.

### 3.4 XIRR Calculation

Newton-Raphson method to find the internal rate of return:

- Cash flows: extra repayments as negative amounts (outflows), saved future monthly repayments as positive amounts (inflows).
- Iterates up to 20 times, convergence threshold of 0.0001 on rate, or XNPV < 1.
- Returns the annualized rate.

---

## 4. RA Tab

### 4.1 Layout

A purple-accented sidebar (db/ra.csv with Load/Save buttons) and a main area with three cards:

1. **RA Summary** — three columns:
   - Total contributed (R), count of contributions, first→last contribution date, current-tax-year total.
   - Editable **Tax refund rate (%)** input (default 41) and the lifetime refund (uncapped).
   - Editable **Nominal return (%)** input (default 10) and the estimated pot value today.
   - When any tax-year row hits the SARS cap, a "cap hit in some year" amber pill appears under the lifetime refund.
2. **Per tax-year refund** — table with columns: Tax year | Status | Contributions | Deductible | Refund. A totals row at the bottom. Above the table:
   - Editable **Future years** input (default 10).
   - Editable **Assumed monthly (R)** input + **auto** button. Auto resets to the average of the last 3 contributions; typing a value persists an explicit override.
   - Each row showing `contributions > R 350,000` displays an amber `cap` pill in the Status column.
3. **Contributions** — list of contribution rows (date, description, amount, delete button). Sorted by date descending. A `+ Add` button appends a new row defaulting to today's date and `"monthly repayment"` description.

### 4.2 Tax-year status strings

- `actual` — entirely past tax years.
- `partial (N actual + M projected)` — the current tax year, where N is the count of actual contributions and M is the months remaining until 28/29 February.
- `projected` — future tax years (entirely model-driven).

### 4.3 Persistence

- Auto-saves on any change (debounced 800ms) via POST to `/api/save/ra` (or `/api/save/test_ra` in test mode).
- Auto-loads `db/ra.csv` (or `db/test/ra.csv`) on page open.
- All RA settings are stored as `param,<key>,<value>,` rows alongside transactions in the same CSV.
- The `assumed_future_monthly` param row is only written when the user has overridden the auto-derived value; the **auto** button removes the override.

### 4.4 Defaults (first run, no saved file)

- `tax_refund_rate_pct = 41`
- `nominal_return_pct = 10`
- `future_years_to_project = 2`
- `assumed_future_monthly = 20000` (user can override; **auto** button re-derives from last 3 contributions).

---

## 5. Retirement

### 5.1 Tab Placement

Between the **RA** and **History** tabs. The tab header is "Retirement"; a refresh icon mirrors the other tabs.

### 5.2 Sidebar (left col, sticky)

Three sections separated by dividers:

**Core**
- Date of birth (date input). The current age is shown beneath as a read-only label.
- Retirement age (number input). Years to retirement shown beneath.
- Withdrawal rate %, Effective retirement income tax rate %, CPI assumption %, all numeric.
- Toggle: "Show in today's money" — applies CPI deflation to all displayed figures.

**Per-fund nominal return %**
- Discretionary, TFSA, Crypto (note: "expected nominal return, no default consensus"), RA.

**Offshore allocation** (collapsible `<details>`)
- Discretionary offshore %, TFSA offshore %, ZAR depreciation %/yr.

**RA structure**
- Toggle: "Commute 1/3 as lump sum at retirement" (default ON).
- Vested balance R (pre-Sep-2024 portion of current RA pot).
- Read-only label: "New contributions split 33% savings / 67% retirement (Sep 2024 rule)."

**Optional scenarios**

Each scenario has a checkbox + inline inputs (only enabled when checkbox is checked):

1. Dutch pension: EUR/ZAR rate input. Fixed €900/mo at age 68.
2. TFSA contributions: no extra inputs; annual R 46,000 enforced; lifetime cap auto-checked from Investments transactions.
3. Extra RA monthly: amount R/mo; soft warning when × 12 > R 430,000 deduction cap.
4. House sale: ZAR value input.
5. Inheritance: EUR amount, converted at the Dutch EUR/ZAR rate.
6. Bond payoff: outstanding balance at retirement (subtracts from lump sum).
7. Annual savings-pot withdrawal: amount R/yr (warning when 0 < amount < R 2,000).

**Persistence**
- Load Retirement / Save Retirement buttons hit `/api/save/retirement` (or `/api/save/test_retirement` in test mode), and on every input change a debounced save (800 ms) fires.
- On page load the tab attempts `fetch(dbPath('retirement.csv'))` and falls back to defaults silently.

### 5.3 Cards

**Card 0 — Snapshot**

Two-column × two-row grid (Age 55 / Age 68 × Funds / Monthly). Each cell shows "Projected" boldly; "Current" appears below in muted text only when the two values differ. A small `nominal` / `today's money` badge in the card header reflects the deflation toggle.

**Card 1 — Monthly income (net of tax)**

Phases vary by retirement age:
- Retirement age < 55 → "At retirement (before 55) — R0 from RA" + "From age 55 — RA drawdown begins".
- 55 ≤ age < 68 → "At retirement (age X)" + "From age 68 — + Dutch pension" (or "(Dutch pension disabled)" greyed).
- Age ≥ 68 → "At retirement (age X, ≥ 68) — RA drawdown + Dutch pension combined".

A de minimis banner replaces the drawdown row when the pot is below R 360,000.

**Card 2 — Instantly available at retirement**

Table with one row per source: Discretionary, TFSA (with cap note), Crypto, 1/3 RA commutation gross + tax + net (when toggled), savings-pot withdrawals net (when applicable), House sale, Inheritance (with EUR×rate note), Less: outstanding bond. Total row in indigo (red if negative; explanatory note appears in that case).

**Card 3 — RA Pot at Retirement**

Two side-by-side panels: "Today (live from RA tab)" and "At retirement age X", each with a vested / savings / retirement breakdown. Below: pre-retirement savings-pot withdrawal totals (when applicable), 1/3 commutation gross/tax/net, monthly drawdown gross/net, and the living-annuity depletion warning when applicable.

**Card 4 — Assumptions** (collapsible `<details>`, default closed)

Read-only key/value table summarising all in-effect assumptions: returns per fund, CPI, tax rate, FX rates, two-pot split, commutation, TFSA cap remaining, RA deduction-cap headroom (R 430,000 − last-12-months contributions), and the hardcoded constants.

### 5.4 Edge cases

- Invalid / missing DOB → silently fall back to default 1985-08-08; current age shown as "—".
- Retirement age below current age → all FV collapse to current values + a warning banner.
- Vested balance > current RA pot → warning banner; calculation uses `min(vested, raPotToday)`.
- Retirement age < 55 → two RA phases (inaccessible at retirement, drawdown begins at 55).
- Retirement age ≥ 68 → Dutch pension folded into the at-retirement phase (no separate "from 68" row).
- TFSA cap already hit → no contributions added even if enabled; cap-remaining shown as R 0.
- TFSA current-year cap already hit → optional contributions skip the current tax year and resume from the next 1 March.
- RA pot < R 360,000 at retirement → de minimis banner replaces drawdown.
- Savings-pot withdrawal > available balance in a given year → silently capped at the balance.
- Savings-pot withdrawal below R 2,000 → inline validation hint (does not block input).
- Extra RA monthly × 12 > R 430,000 → soft "above SARS deduction cap" hint.
- Bond balance > total lump sum → total displays in red with an explanatory note.
- Missing `db/retirement.csv` → all settings fall back to defaults silently.

### 5.5 Data reads from other tabs

- `investmentData.currentValues.{Discretionary,TFSA,Crypto}` → seed lump-sum and TFSA growth.
- `investmentData.transactions.filter(t => t.type === 'TFSA')` → lifetime contributions and current-tax-year contributions for the cap math.
- `calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)` → RA pot today.
- `raTransactions` → contributions in the last 12 months for the deduction-cap headroom display.

All reads happen at render time; the Retirement tab never mutates other tabs' state.

---

## 6. History Tab

Aggregates all financial activity by year in a summary table:

| Column | Source |
|---|---|
| Year | Extracted from transaction/repayment dates |
| Debt Repaid | Sum of extra debt repayments for that year |
| Investments Total | Sum of all investment transaction amounts for that year |
| TFSA | Investment transactions of type TFSA for that year |
| Discretionary | Investment transactions of type Discretionary for that year |
| Crypto | Investment transactions of type Crypto for that year |

- A totals row sums all columns.
- Years are sorted ascending.
- Empty values display as an em-dash.

---

## 7. Data Persistence

### 7.1 CSV File Format

Four separate CSV files store application state:

**Budget** (`calulator_data.csv`):
```
type,description,amount,date
savings,,<amount>,
debt,<description>,<amount>,
provision,<description>,<amount>,<date>
costfuturecost,<description>,<amount>,<date>
```

**Investments** (`investments.csv`):
```
Date,Description,amount,account type,crypto_value
<DD-MM-YYYY>,<description>,<amount>,<type>,<btc_value>
current_value,<account_type>,<amount>,
param,marginal_rate,<percent>,
```
- Transaction dates stored in `DD-MM-YYYY` format in CSV, converted to `YYYY-MM-DD` internally.
- `current_value` rows store per-account current values (Discretionary, TFSA, Crypto).
- `param,marginal_rate,<percent>,` stores the user's marginal income tax rate used for the Discretionary CGT estimate. Default `41` when the row is absent.

**Debt** (`debt.csv`):
```
Date,Description,Amount
param,principal,<value>
param,current_balance,<value>
param,repayment,<value>
param,service_fee,<value>
param,interest_rate,<value>
param,next_payment,<value>
param,loan_start,<value>
param,original_term,<value>
<date>,<description>,<amount>
```

**RA** (`ra.csv`):
```
<YYYY-MM-DD>,<description>,<amount>
param,tax_refund_rate_pct,<percent>,
param,nominal_return_pct,<percent>,
param,future_years_to_project,<int>,
param,assumed_future_monthly,<amount>,
```
- No header row.
- Transactions and `param` rows share the file. The first column distinguishes them: an ISO date is a transaction; the literal `param` is a setting.
- The `assumed_future_monthly` row is omitted unless the user has overridden the auto-derived value.
- Defaults applied when a param row is missing: refund rate 41, return rate 10, future years 10.

### 7.2 Auto-Save

- All data changes trigger a debounced save (800ms delay) via POST to the server.
- Manual save buttons are also available for each module.
- On page load, all three CSV files are fetched automatically.

### 7.3 Server API

| Endpoint | Method | Behavior |
|---|---|---|
| `/api/save/<name>` | POST | Writes request body to the mapped CSV file. Valid names: `budget`, `investments`, `debt`, `ra` (and their `test_` prefixed variants). |
| `/<path>` | GET | Serves static files; falls back to `src/` directory if not found at project root. |

- Real data files are backed up (timestamped copy) before every write.
- Returns 400 for unknown names, 403 for writes to real data when `X-Test-Mode: true` header is set.

---

## 8. Test Mode

- Toggle button in the header switches between real data and sample data.
- When enabled:
  - "SAMPLE DATA" label is displayed.
  - All CSV reads/writes use `db/test/` directory instead of `db/`.
  - Save keys are prefixed with `test_` (e.g., `test_budget`).
  - Server blocks writes to real data keys when `X-Test-Mode: true` header is present.
- Toggling reloads all three datasets from the appropriate directory.
- If the test-mode load fails, the mode reverts automatically.

---

## 9. Calculation Functions Reference

All pure calculation logic is extracted into a separate ES module (`calculations.js`) with the following exported functions:

| Function | Purpose |
|---|---|
| `getUpcoming25th(today?)` | Returns the next 25th as `YYYY-MM-25` |
| `calculateBudgetSummary(savings, debts, provisions, futureCosts, futureDate, today?)` | Computes net amounts, monthly savings target |
| `calculateMonthlyAllocation(available, savingsTarget, mortgage%, eft%, crypto%)` | Splits money across categories |
| `calculateInvestmentPerformance(transactions, currentValue, today?)` | Returns absolute/percentage/annualized returns, savings comparison |
| `monthlyInterestFactor(dailyRate, year, month)` | Daily rate compounded over days in a specific month |
| `simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, withExtras)` | Runs month-by-month loan simulation |
| `calculateDebtResults({currentPrincipal, totalRepayment, serviceFee, interestRate, nextPaymentDateStr, repayments})` | Orchestrates baseline vs actual simulation, computes savings |
| `xirr(cashFlows, guess?)` | Newton-Raphson XIRR calculation |
| `parseBudgetCSV(text)` / `generateBudgetCSV(data)` | Budget CSV serialization |
| `parseInvestmentCSV(text)` / `generateInvestmentCSV(data)` | Investment CSV serialization |
| `parseDebtCSV(text)` / `generateDebtCSV(repayments, params)` | Debt CSV serialization |
| `taxYearLabel(date)` | Returns the SA tax-year bucket label `YYYY/YY` (e.g. `2026/27`) |
| `parseRaCSV(text)` / `generateRaCSV(data)` | RA CSV serialization (transactions + param rows) |
| `deriveAssumedFutureMonthly(transactions)` | Average of the last 3 contributions for projection default |
| `calculateRaProjection({transactions, taxRefundRatePct, assumedFutureMonthly, futureYearsToProject}, today?)` | Per-tax-year refund table with actual/partial/projected statuses and cap handling |
| `calculatePotValueToday(transactions, nominalReturnPct, today?)` | Monthly-compounded estimate of pot value as of today |
