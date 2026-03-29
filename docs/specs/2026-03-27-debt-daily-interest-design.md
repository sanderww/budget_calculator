# Debt Tab: Daily Interest Compounding

**Date:** 2026-03-27
**Status:** Approved

## Problem

The debt projection currently uses `annualRate / 12` as a monthly interest rate. Banks calculate interest daily (`annualRate / 365` per day), so the current method under- or over-charges interest depending on month length, producing projections that differ from reality.

## Goal

Replace monthly-divided interest with daily-accurate compounding so projections match the bank's actual calculation method.

## Approach: Monthly simulation with daily-accurate interest factor

Keep the existing monthly simulation loop structure. Replace the static `monthlyRate` with a helper that computes the exact interest factor for each month based on its actual number of days.

### Interest helper

```js
const dailyRate = (interestRate / 100) / 365;

function monthlyInterestFactor(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Math.pow(1 + dailyRate, daysInMonth) - 1;
}
```

- Uses fixed 365 days/year (as per bank's method)
- Accounts for actual days per month (28–31), including February

### Forward simulation

Every occurrence of `balance * monthlyRate` becomes:

```js
balance * monthlyInterestFactor(simDate.getFullYear(), simDate.getMonth())
```

`simDate` already advances month-by-month, so the correct year/month is always available.

### Back-calculation (unwinding past extras)

The divisor in the reverse loop changes from `(1 + monthlyRate)` to:

```js
const factor = monthlyInterestFactor(iterDate.getFullYear(), iterDate.getMonth());
simulatedBalance = (simulatedBalance + effectiveRepayment + monthlyExtra) / (1 + factor);
```

### UI note

Remove the disclaimer text entirely (was: "Uses monthly compounding (9.26%÷12). Your bank calculates interest daily, so projections may differ slightly.").

## Out of scope

- Leap year handling (365 fixed per bank's method)
- Switching to a full daily simulation loop
- Any changes to investment or budget tabs
