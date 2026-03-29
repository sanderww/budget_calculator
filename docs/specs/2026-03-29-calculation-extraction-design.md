# Spec: Calculation Extraction & Unit Tests

**Date:** 2026-03-29
**Status:** Approved

## Overview

Extract all pure calculation logic from `budget_calculator.html` into a standalone `calculations.js` ES module, then cover every extracted function with Vitest unit tests. The HTML retains all DOM wiring and simply imports functions from the new module.

## File Structure

```
budget_calculator/
├── budget_calculator.html       (modified — <script type="module">, imports calculations.js)
├── calculations.js              (new — pure functions, ES module)
├── package.json                 (new — Vitest as only dev dependency)
└── tests/
    └── calculations.test.js     (new — all unit tests)
```

No bundler is needed. The browser supports ES modules natively; the existing `server.py` serves `calculations.js` as a static file.

## Functions to Extract

All functions take plain values (numbers, strings, arrays, Date objects) and return plain values. No DOM access.

### Budget

```js
calculateBudgetSummary(savings, debts, provisions, futureCosts, futureDate, today)
// → { totalDebts, totalProvisions, currentNetAmount, relevantFutureCosts,
//     futureNetAmount, monthsDiff, monthlySavingsTarget }
```
- `futureCosts` is an array of `{ amount, date }` objects
- `relevantFutureCosts` = sum of costs whose date ≤ `futureDate`
- `monthlySavingsTarget` = `|futureNetAmount| / monthsDiff` when `futureNetAmount < 0`, else 0
- `monthsDiff = Math.max(1, Math.ceil(daysDiff / 30))`

```js
calculateMonthlyAllocation(availableMoney, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage)
// → { remainingMoney, mortgageAmount, eftAmount, cryptoAmount, totalAllocated, leftover }
```
- `remainingMoney = availableMoney - monthlySavingsTarget`
- Each bucket = `remainingMoney * percentage / 100`
- `leftover = availableMoney - totalAllocated`

### Investments

```js
calculateInvestmentPerformance(transactions, currentValue, today)
// → { totalInvested, absoluteReturn, percentageReturn, savingsGain,
//     netVsSavings, averageAgeDays, yearsHeld, annualizedReturn }
```
- `transactions` = array of `{ amount, date, type, cryptoValue? }`
- Savings comparison uses 6% p.a. compound per-transaction: `amount * (1.06^(ageInDays/365.25) - 1)`
- `averageAgeDays = weightedAgeSum / totalInvested` (amount-weighted)
- `annualizedReturn = (currentValue/totalInvested)^(1/yearsHeld) - 1`; returns `null` if `yearsHeld ≤ 0.1` or `ratio ≤ 0`

### Debt

```js
monthlyInterestFactor(dailyRate, year, month)
// → number  (e.g. 0.0087 for ~1% monthly)
// Uses actual days in that calendar month
```

```js
simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, withExtras)
// → { totalInterest, totalFees, endDate, months }
// repayments = array of { date, amount }
// serviceFee is added to totalFees each month
```
- Runs month-by-month until balance ≤ 10 or 1200 months (safety cap)
- When `withExtras = true`, adds matching repayments by month string

```js
calculateDebtResults({ currentPrincipal, totalRepayment, serviceFee, interestRate, nextPaymentDateStr, repayments })
// → { moneySaved, diffMonths, totalExtra, baseline, actual }
//   baseline and actual are simulateDebt results
```
- Back-calculates `startPrincipal` from current balance before running forward simulations
- `moneySaved = (baseline.totalInterest + baseline.totalFees) - (actual.totalInterest + actual.totalFees)`

```js
xirr(cashFlows, guess = 0.1)
// cashFlows = array of { amount, date }
// → annualized rate (number)
// Uses Newton-Raphson, 20 iterations, precision 0.0001
```

### CSV Round-trips

```js
parseBudgetCSV(text)      → { savings, debts, provisions, futureCosts }
generateBudgetCSV(data)   → string

parseInvestmentCSV(text)  → { transactions, currentValues }
generateInvestmentCSV(data) → string

parseDebtCSV(text)        → { repayments, params }
generateDebtCSV(data)     → string
```

### Date Helper

```js
getUpcoming25th(today)    → 'YYYY-MM-DD' string
```

## Test Coverage (`tests/calculations.test.js`)

All date-sensitive tests pass an explicit `today` parameter for determinism.

### Budget
- `calculateBudgetSummary`: correct net amount math; future costs filtered by date; monthly savings target when negative; zero savings; empty arrays
- `calculateMonthlyAllocation`: percentage splits sum correctly; leftover is correct; zero savings target passes through full amount

### Investments
- `calculateInvestmentPerformance`: absolute/percentage return; 6% compound savings comparison; annualized return with known inputs; zero invested returns nulls/zeros; single transaction; ratio ≤ 0 returns `null` for annualized

### Debt
- `monthlyInterestFactor`: February non-leap (28 days), February leap (29 days), 31-day month
- `simulateDebt`: converges to zero balance; counts months; applies extras in correct month only
- `calculateDebtResults`: money saved equals baseline − actual cost; time reduction computed correctly
- `xirr`: converges on a hand-verified cash flow series

### CSV Round-trips
- `parseBudgetCSV(generateBudgetCSV(data))` produces identical data — same for investments and debt
- Parser handles missing/empty fields gracefully

## HTML Migration

- Change `<script>` to `<script type="module">`
- Add `import { ... } from './calculations.js';` at the top of the script block
- Replace inline calculation logic with calls to imported functions
- All DOM reads/writes remain in the HTML script; only pure math moves out

## Out of Scope

- No bundler, no TypeScript, no CI pipeline changes
- `formatCurrency` stays in the HTML (display-only utility, not worth unit testing)
- No E2E / browser tests
