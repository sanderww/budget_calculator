---
date: 2026-04-30
status: design
related: docs/prompts/Retirement_savings.md
---

# Retirement Calculator Tab — Design

A new tab for projecting retirement wealth and monthly income, reading live data from the Investments and RA tabs. Single-snapshot view (no year-by-year table in v1).

## Resolved decisions

- **Layout:** sidebar inputs (col-span-1) + main results (col-span-3), matching the RA tab.
- **Persistence:** `db/retirement.csv` using the existing `param` row pattern.
- **RA accessibility age:** hardcoded to 55 (SA law). Not user-configurable.
- **TFSA lifetime cap:** hardcoded to R500,000 (SARS rule). Not user-configurable.
- **Year-by-year table:** out of scope for v1. Single snapshot only.
- **DOB:** hardcoded to 1985-08-08. Not stored in CSV (personal constant).

## Tab placement

Between **RA** and **History**. Tab id `tab-retirement`, tab key `retirement`.

---

## CSV schema (`db/retirement.csv`)

Param rows only — same pattern as `db/ra.csv`:

```
param,retirement_age,65
param,withdrawal_rate_pct,4
param,return_discretionary_pct,10
param,return_tfsa_pct,10
param,return_crypto_pct,0
param,return_ra_pct,10
param,opt_dutch_enabled,0
param,opt_dutch_eur_zar,20
param,opt_tfsa_enabled,0
param,opt_ra_monthly_enabled,0
param,opt_ra_monthly_amount,10000
param,opt_house_enabled,0
param,opt_house_value,2000000
param,opt_inheritance_enabled,0
param,opt_inheritance_eur,0
```

- All `opt_*_enabled` values are `0` (disabled) or `1` (enabled).
- Dutch pension amount (900 EUR/month) is hardcoded, not stored.
- Parser: first column = `param` → setting; anything else → ignored.

Server: add `'retirement': 'db/retirement.csv'` to `FILE_MAP` and `REAL_KEYS`.

---

## UI structure

### Sidebar

Two sections, separated by a divider:

**Core settings:**
- Retirement age (number input, e.g. 65) — computed years-to-retirement shown beneath as a read-only label
- Withdrawal rate % (default 4%)
- Per-fund nominal return %:
  - Discretionary (default 10%)
  - TFSA (default 10%)
  - Crypto (default 0%)
  - RA (default 10%)

**Optional scenarios** (each row: checkbox label + inline inputs):
1. **Dutch Pension** — checkbox + EUR/ZAR rate input (default 20). Fixed amount: 900 EUR/month, fixed age: 68.
2. **TFSA contributions** — checkbox. No extra inputs; amount fixed at R46,000/year; cap auto-read from Investments tab.
3. **Extra RA monthly** — checkbox + amount input (default R10,000).
4. **House sale** — checkbox + ZAR value input (default R2,000,000).
5. **Inheritance** — checkbox + EUR amount input (default 0). Converted at the Dutch Pension EUR/ZAR rate.

Below optional scenarios: Load / Save buttons for `db/retirement.csv`.

### Main area — three cards

#### Card 1: Monthly Income

Shows monthly income by phase. Phases shown only if they apply:

| Phase | Condition | Monthly income |
|---|---|---|
| At retirement (age X, before 55) | retirement_age < 55 | R 0 from RA (not yet accessible) |
| From age 55 | retirement_age < 55 | RA drawdown = FV_RA_at_55 × rate / 12 |
| At retirement (age X, 55–67) | 55 ≤ retirement_age < 68 | RA drawdown = FV_RA_at_retirement × rate / 12 |
| From age 68 | retirement_age < 68 | + Dutch pension in ZAR (if enabled); greyed if Dutch disabled |
| At retirement (age X, ≥ 68) | retirement_age ≥ 68 | RA drawdown + Dutch pension combined from day one |

Each phase shows:
- Monthly income figure (bold)
- Breakdown: RA drawdown line + Dutch pension line (if enabled)
- Note on how many years until next phase (e.g. "for 13 years until Dutch pension")

#### Card 2: Instantly Available at Retirement (lump sum)

Breakdown table:

| Fund | Value at retirement |
|---|---|
| Discretionary | FV grown at return rate |
| TFSA | FV grown at return rate + optional contributions |
| Crypto | FV grown at return rate (default 0%) |
| House sale | flat value (if enabled) |
| Inheritance | EUR × EUR/ZAR rate, no growth (if enabled) |
| **Total** | sum |

Small note beneath TFSA row if optional contributions are enabled: e.g. "R46,000/year for 8 more years (cap in 2034)."

#### Card 3: RA Pot at Retirement

- Current RA pot today (read from RA tab)
- Projected RA pot at retirement age
- Projected RA pot at age 55 (shown separately if retirement < 55)
- Monthly drawdown at each relevant age
- If extra monthly contributions enabled: shows contribution total alongside

---

## Calculations

### Shared helper

```js
// Monthly compounding future value
function fvGrow(pv, annualRatePct, months) {
    if (annualRatePct === 0) return pv;
    const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    return pv * Math.pow(1 + r, months);
}
```

### Years / months to a target age

```js
const DOB = new Date('1985-08-08');

function monthsToAge(targetAge) {
    const target = new Date(DOB);
    target.setFullYear(DOB.getFullYear() + targetAge);
    const today = new Date();
    return Math.max(0, (target.getFullYear() - today.getFullYear()) * 12
        + (target.getMonth() - today.getMonth()));
}
```

### RA pot at a target age

```js
function raFutureValue(raPotToday, annualRatePct, extraMonthly, months) {
    const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    const grown = raPotToday * Math.pow(1 + r, months);
    if (extraMonthly === 0 || r === 0) return grown + extraMonthly * months;
    const contrib = extraMonthly * (Math.pow(1 + r, months) - 1) / r;
    return grown + contrib;
}
```

### TFSA future value with optional contributions

```js
// tfsaTransactions: already filtered to TFSA type by caller
function tfsaFutureValue(currentValue, annualRatePct, monthsToRetirement,
                          optEnabled, tfsaTransactions) {
    const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    let fv = fvGrow(currentValue, annualRatePct, monthsToRetirement);
    if (!optEnabled) return fv;

    const alreadyContributed = tfsaTransactions
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const remaining = Math.max(0, 500_000 - alreadyContributed);
    const yearsOfContrib = Math.min(
        Math.floor(remaining / 46_000),
        Math.floor(monthsToRetirement / 12)
    );

    // Each annual R46,000 contribution grown from contribution year to retirement
    for (let y = 0; y < yearsOfContrib; y++) {
        const monthsRemaining = monthsToRetirement - y * 12;
        fv += fvGrow(46_000, annualRatePct, monthsRemaining);
    }
    return fv;
}
```

### Monthly income from RA

```js
monthly_drawdown = FV_RA × (withdrawal_rate_pct / 100) / 12
```

### Dutch pension (from age 68)

```js
dutch_monthly_ZAR = 900 × eur_zar_rate   // if enabled
total_monthly_post68 = monthly_drawdown + dutch_monthly_ZAR
```

---

## Data reads from other tabs

All reads are one-way (retirement tab never writes to other tabs' state):

| Data needed | Source |
|---|---|
| Discretionary current value | `investmentData.currentValues.Discretionary` |
| TFSA current value | `investmentData.currentValues.TFSA` |
| Crypto current value | `investmentData.currentValues.Crypto` |
| TFSA transactions (for lifetime cap) | `investmentData.transactions.filter(t => t.type === 'TFSA')` |
| RA pot today | `_calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)` |

These are read at render time. The Retirement tab re-renders whenever its inputs change (same `debouncedSave` + render pattern).

---

## Persistence flow

- `generateRetirementCSV()` — produces param rows from current settings.
- `parseRetirementCSV(text)` — reads param rows into a settings object; falls back to defaults for any missing key.
- `debouncedSave('retirement', generateRetirementCSV, 'save-retirement-csv')` — fires 800ms after any input change.
- On page load: auto-fetches `/db/retirement.csv` via the existing server fetch pattern.

---

## Edge cases

- **Retirement age < current age:** months = 0, all FV = current values. Show a warning "You are already past retirement age."
- **Retirement age < 55:** show two RA phases (at retirement = inaccessible, at 55 = drawdown begins).
- **Retirement age ≥ 68:** Dutch pension phase note omitted (already included in retirement income from day one).
- **TFSA cap already hit:** remaining = 0, no contributions added even if optional enabled. Show "TFSA cap already reached."
- **RA return rate = 0:** use linear growth (no division by r).
- **Missing `db/retirement.csv`:** all settings fall back to defaults silently.

---

## Out of scope (v1)

- Year-by-year growth table / chart
- Income tax on RA drawdown
- RA lump-sum vs annuity split (SA allows 1/3 lump sum at retirement — v2)
- Inflation-adjusted figures
- Multiple retirement age scenarios side-by-side

---

## Files touched

- `src/budget_calculator.html` — new tab markup + JS (parse, calculate, render, save wiring)
- `server.py` — add `'retirement': 'db/retirement.csv'` to `FILE_MAP` and `REAL_KEYS`
- `db/retirement.csv` — created on first save
- `docs/specs/core-requirements.md` — add Retirement tab goals/concepts/formulas
- `docs/specs/functional-requirements.md` — add detailed Retirement tab behaviour
