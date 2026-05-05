---
date: 2026-04-30
status: design
version: 3
supersedes: 2026-04-30-retirement-tab-design-v2.md
related:
  - docs/prompts/Retirement_savings.md
  - 2026-04-30-retirement-tab-review.md
---

# Retirement Calculator Tab — Design (v3)

A new tab for projecting retirement wealth and monthly income, reading live data from the Investments and RA tabs. Single-snapshot view (no year-by-year table in v1).

**v2 changes vs v1**: incorporated SA Budget 2026/27 rules, 1/3 RA commutation, tax model, CPI/real-terms toggle, two-pot split persistence, bond payoff, offshore allocation, TFSA tax-year correctness.

**v3 changes vs v2**: full two-pot system modelling (savings vs retirement vs vested components, optional pre-retirement savings-pot withdrawals); R150,000 living-annuity commutation threshold modelled as a post-retirement depletion check.

## Resolved decisions

- **Layout**: sidebar inputs (col-span-1) + main results (col-span-3), matching the RA tab.
- **Persistence**: `db/retirement.csv` using the existing `param` row pattern.
- **RA accessibility age**: hardcoded to 55 (SA law). Not user-configurable.
- **TFSA lifetime cap**: hardcoded to R500,000 (SARS rule). Not user-configurable.
- **TFSA annual cap**: R46,000 from 1 March 2026 (Budget 2026). Hardcoded.
- **RA deduction cap**: R430,000/year (Budget 2026). Used to soft-cap extra-monthly inputs.
- **RA commutation**: 1/3 lump sum / 2/3 annuitised — user toggle, default ON.
- **De minimis at retirement**: if RA pot at retirement < R360,000, full amount commutable. Auto-handled.
- **Living annuity commutation threshold**: if living annuity pot drops below R150,000 post-retirement (per insurer), it can be fully commuted to cash (taxed via lump-sum table). Modelled as a depletion check at age 68 and at expected pot lifetime.
- **Two-pot system** (Sep 2024 onwards): three components tracked separately:
    - **Vested**: balance accumulated before 1 Sep 2024 — old rules, no two-pot split.
    - **Savings component**: 1/3 of new contributions, accessible once per tax year pre-retirement, taxed at marginal rate, min withdrawal R2,000.
    - **Retirement component**: 2/3 of new contributions, locked till 55, must annuitise.
- **Optional savings-pot withdrawals**: user can model annual pre-retirement withdrawals from the savings component as an explicit scenario.
- **Year-by-year table**: out of scope for v1. Single snapshot only.
- **DOB**: stored as `param,dob` in `db/retirement.csv`. Editable via a date input. Default 1985-08-08.

## Tab placement

Between **RA** and **History**. Tab id `tab-retirement`, tab key `retirement`.

---

## CSV schema (`db/retirement.csv`)

Param rows only — same pattern as `db/ra.csv`:

```
param,dob,1985-08-08
param,retirement_age,65
param,withdrawal_rate_pct,4
param,cpi_pct,5
param,show_real_terms,0
param,effective_tax_rate_pct,18

param,return_discretionary_pct,10
param,return_tfsa_pct,10
param,return_crypto_pct,7
param,return_ra_pct,10

param,offshore_discretionary_pct,0
param,offshore_tfsa_pct,0
param,zar_depreciation_pct,2

param,ra_commute_third,1
param,ra_savings_component_pct,33
param,ra_vested_balance,0
param,opt_savings_pot_withdrawal_enabled,0
param,opt_savings_pot_withdrawal_annual,0

param,opt_dutch_enabled,0
param,opt_dutch_eur_zar,20
param,opt_tfsa_enabled,0
param,opt_ra_monthly_enabled,0
param,opt_ra_monthly_amount,10000
param,opt_house_enabled,0
param,opt_house_value,2000000
param,opt_inheritance_enabled,0
param,opt_inheritance_eur,0
param,opt_bond_enabled,0
param,opt_bond_balance,0
```

- All `opt_*_enabled` / boolean values are `0` (off) or `1` (on).
- Dutch pension amount (900 EUR/month) is hardcoded, not stored.
- Hardcoded constants: TFSA annual R46,000, TFSA lifetime R500,000, RA access age 55, RA deduction cap R430,000, retirement de minimis R360,000, living-annuity commutation threshold R150,000, lump-sum tax-free R550,000, two-pot split 33/67, min savings-pot withdrawal R2,000.
- Parser: first column = `param` → setting; anything else → ignored.

Server: add `'retirement': 'db/retirement.csv'` to `FILE_MAP` and `REAL_KEYS`.

---

## UI structure

### Sidebar

Three sections, separated by dividers:

**Core settings:**
- Date of birth (date input, default 1985-08-08) — computed current age shown beneath as a read-only label.
- Retirement age (number input, default 65) — computed years-to-retirement shown beneath.
- Withdrawal rate % (default 4%).
- Effective tax rate on retirement income % (default 18%).
- CPI assumption % (default 5%).
- Toggle: **Show in today's money** (applies CPI deflation to all displayed figures).

**Per-fund nominal return %:**
- Discretionary (default 10%)
- TFSA (default 10%)
- Crypto (default 7% — labelled "expected nominal return, no default consensus")
- RA (default 10%)

**Per-fund offshore allocation %** (collapsible, defaults all 0):
- Offshore % per fund + ZAR depreciation rate (default 2%/year against EUR/USD).

**RA structure:**
- Toggle: **Commute 1/3 as lump sum at retirement** (default ON). When ON, 1/3 → discretionary lump sum (taxed via retirement lump-sum table), 2/3 → drawdown.
- **Vested balance** (pre-Sep-2024 portion of current RA pot). Number input, default 0. The remainder of the current RA pot is treated as already split 33/67 savings/retirement.
- **Two-pot split** (read-only label): "New contributions split 33% savings / 67% retirement (Sep 2024 rule)."

**Optional scenarios** (each row: checkbox label + inline inputs):
1. **Dutch Pension** — checkbox + EUR/ZAR rate input (default 20). Fixed amount: 900 EUR/month, fixed age: 68.
2. **TFSA contributions** — checkbox. No extra inputs; amount fixed at R46,000/year; cap auto-read from Investments tab.
3. **Extra RA monthly** — checkbox + amount input (default R10,000). Soft-warning if monthly × 12 > R430,000 (deduction cap).
4. **House sale** — checkbox + ZAR value input (default R2,000,000).
5. **Inheritance** — checkbox + EUR amount input (default 0). Converted at the Dutch Pension EUR/ZAR rate.
6. **Bond payoff** — checkbox + outstanding balance at retirement (default 0). Subtracts from instantly-available lump sum.
7. **Annual savings-pot withdrawal** — checkbox + annual amount input (default R0, min R2,000 if enabled). Models pre-retirement use of the two-pot savings component each tax year. Reduces the savings-pot growth and increases discretionary funds (after marginal-rate tax). Capped at the savings-pot balance available each year.

Below optional scenarios: Load / Save buttons for `db/retirement.csv`.

### Main area — five cards

#### Card 0: Snapshot Summary (top of page)

Six headline figures arranged in two columns (age 55 | age 68), two rows (funds | monthly income), with a "Current" vs "Projected" distinction:

|  | Age 55 | Age 68 |
|---|---|---|
| **Funds available (lump sum)** | Current / Projected | Projected |
| **Monthly income (net)** | Current / Projected | Projected |

Each cell shows two stacked values — **Current** (no optional scenarios, no commutation) and **Projected** (with all enabled scenarios + commutation if toggled). If both values are equal, only one is shown.

Toggle at top of card: **Nominal / Today's money**. When in today's money, all values divided by `(1 + cpi/100)^years_from_today`.

Definitions:
- **Current funds at 55** — Discretionary + TFSA + Crypto grown from today to age 55, no extra contributions, no commutation.
- **Current monthly at 55** — RA pot grown to 55 (no extras) × withdrawal_rate / 12 × (1 - tax_rate).
- **Projected funds at 55** — lump sum funds + optional TFSA contributions (capped) + house sale + inheritance + 1/3 RA commutation (if toggled, after lump-sum tax) - bond balance.
- **Projected monthly at 55** — (2/3 × RA pot at 55 if commutation; else full pot) × withdrawal_rate / 12 × (1 - tax_rate).
- **Projected funds at 68** — funds at 55 grown forward to 68, plus any inheritance/house sale received post-55 (none in current spec, but data model supports it).
- **Projected monthly at 68** — RA drawdown at 68 + Dutch pension in ZAR (if enabled), both net of tax.

**Contribution cutoff at retirement age.** Extra RA monthly contributions and pre-retirement savings-pot withdrawals run only until `retirement_age`. After that, the pot grows passively (no extras, no withdrawals) for any remaining months to the snapshot age. This applies uniformly to all RA projections — `raAtRetirement`, `raAt55`, `raAt68` — implemented as a two-phase projection: phase 1 (with extras + withdrawals) for `min(monthsToTarget, monthsToRetirement)`, phase 2 (passive) for the remainder.

Implication: when `retirement_age < 55`, the `raAt55` projection includes contributions only up to retirement age, then passive growth from retirement age to 55. When `retirement_age > 55`, `raAt55` includes contributions for the full window to 55 (user is still working at 55), and `raAt68` continues contributions to retirement_age then grows passively to 68.

#### Card 1: Monthly Income (net of tax)

Shows monthly income by phase. Phases shown only if they apply:

| Phase | Condition | Monthly income |
|---|---|---|
| At retirement (age X, before 55) | retirement_age < 55 | R 0 from RA (not yet accessible) |
| From age 55 | retirement_age < 55 | RA drawdown (net) = (annuitisation portion × rate / 12) × (1 - tax) |
| At retirement (age X, 55–67) | 55 ≤ retirement_age < 68 | RA drawdown (net) |
| From age 68 | retirement_age < 68 | + Dutch pension in ZAR net (if enabled); greyed if disabled |
| At retirement (age X, ≥ 68) | retirement_age ≥ 68 | RA drawdown + Dutch pension combined from day one |

Each phase shows:
- Net monthly income (bold)
- Gross figure beneath in muted text
- Breakdown: RA drawdown line + Dutch pension line (if enabled)
- Note on years until next phase (e.g. "for 13 years until Dutch pension")
- If `de_minimis` triggered (RA pot < R360k at retirement): warning banner "Pot below de minimis — full commutation possible, drawdown N/A."

#### Card 2: Instantly Available at Retirement (lump sum)

All values are projected to **`retirement_age`** (not age 55). Card title shows the user's retirement age inline so it's clear what age the figures apply to.

Breakdown table:

| Source | Value at retirement_age |
|---|---|
| Discretionary | FV grown at return rate to retirement_age |
| TFSA | FV grown at return rate + optional contributions to retirement_age |
| Crypto | FV grown at return rate to retirement_age |
| 1/3 RA commutation (if enabled) | FV_RA at retirement_age × 1/3, less lump-sum tax (see below) |
| Savings-pot withdrawals (net) | sum of pre-retirement savings-pot withdrawals, after marginal-rate tax |
| House sale | flat value (if enabled) |
| Inheritance | EUR × EUR/ZAR rate, no growth (if enabled) |
| Less: outstanding bond | -bond_balance (if enabled) |
| **Total** | sum |

Small notes beneath relevant rows:
- TFSA: "R46,000/year for N more years (cap reached in YYYY)."
- RA commutation: "First R550,000 tax-free; sliding scale 18-36% above. Tax: R{amount}."

#### Card 3: RA Pot at Retirement

- Current RA pot today (read from RA tab), broken down into three components:
  - **Vested** (pre-Sep-2024): R{vested_balance}
  - **Savings component**: R{savings_balance} (= 33% of post-Sep-2024 contributions)
  - **Retirement component**: R{retirement_balance} (= 67% of post-Sep-2024 contributions)
- Projected RA pot at retirement age, with each component grown separately.
- Projected RA pot at age 55 (shown separately if retirement < 55).
- If savings-pot withdrawals enabled: line showing total withdrawn pre-retirement (gross) + tax paid + net added to discretionary.
- Of pot at retirement: 1/3 commuted (if toggled) + 2/3 annuitised, each shown.
- Monthly drawdown at each relevant age, gross and net.
- **Living annuity depletion check**: at age 68, if projected pot remaining < R150,000, flag with "Pot will fall below R150k commutation threshold by age N — full commutation possible at that point."
- If extra monthly contributions enabled: total contributions over period vs growth, side-by-side.

#### Card 4: Assumptions Summary (collapsible, default closed)

Read-only summary of all in-effect assumptions for transparency:
- Returns per fund, CPI, tax rate, FX rates.
- Two-pot split, commutation status.
- TFSA cap remaining.
- RA deduction cap headroom (R430,000/year minus current contributions).

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

// CPI deflation to today's money
function realValue(nominal, cpiPct, years) {
    return nominal / Math.pow(1 + cpiPct / 100, years);
}
```

### Years / months to a target age

```js
function monthsToAge(dob, targetAge) {
    const dobDate = new Date(dob);
    const target = new Date(dobDate);
    target.setFullYear(dobDate.getFullYear() + targetAge);
    const today = new Date();
    return Math.max(0, (target.getFullYear() - today.getFullYear()) * 12
        + (target.getMonth() - today.getMonth()));
}
```

### RA pot at a target age (three-component two-pot model)

```js
// Helper: future value of a balance growing monthly + optional monthly contribution
function _grow(pv, annualRatePct, months, monthlyContrib = 0) {
    const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    const grown = pv * Math.pow(1 + r, months);
    if (monthlyContrib === 0) return grown;
    const contrib = (r === 0)
        ? monthlyContrib * months
        : monthlyContrib * (Math.pow(1 + r, months) - 1) / r;
    return grown + contrib;
}

// Returns three components grown to target.
// Vested: pre-Sep-2024 portion, no two-pot split, grows passively.
// Savings: 1/3 of new contributions; can be withdrawn annually pre-retirement.
// Retirement: 2/3 of new contributions, locked till 55.
function raFutureValueTwoPot({
    vestedToday, savingsToday, retirementToday,
    annualRatePct, extraMonthly, months,
    savingsPotAnnualWithdrawal = 0, taxRatePct = 18,
    offshorePct = 0, zarDeprePct = 0
}) {
    const savingsContribMonthly = extraMonthly * 0.33;
    const retirementContribMonthly = extraMonthly * 0.67;

    // Vested: passive growth only
    let vestedFV = _grow(vestedToday, annualRatePct, months);

    // Retirement component: passive growth + 67% of new contributions
    let retirementFV = _grow(retirementToday, annualRatePct, months,
                             retirementContribMonthly);

    // Savings component: grows + 33% of new contributions, less annual withdrawals.
    // Withdrawals applied once per tax year, capped at available balance.
    let savingsFV = savingsToday;
    let totalWithdrawnGross = 0;
    const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    const yearsFull = Math.floor(months / 12);
    const monthsRemainder = months % 12;
    for (let y = 0; y < yearsFull; y++) {
        savingsFV = _grow(savingsFV, annualRatePct, 12, savingsContribMonthly);
        if (savingsPotAnnualWithdrawal > 0) {
            const wd = Math.min(savingsPotAnnualWithdrawal, savingsFV);
            savingsFV -= wd;
            totalWithdrawnGross += wd;
        }
    }
    if (monthsRemainder > 0) {
        savingsFV = _grow(savingsFV, annualRatePct, monthsRemainder,
                          savingsContribMonthly);
    }

    // Apply ZAR depreciation to offshore portion of total
    let total = vestedFV + savingsFV + retirementFV;
    if (offshorePct > 0 && zarDeprePct > 0) {
        const offshoreShare = total * (offshorePct / 100);
        const localShare = total - offshoreShare;
        const offshoreGrown = offshoreShare *
            Math.pow(1 + zarDeprePct / 100, months / 12);
        total = localShare + offshoreGrown;
        // Distribute scaling proportionally to components for breakdown display
        const scale = total / (vestedFV + savingsFV + retirementFV);
        vestedFV *= scale; savingsFV *= scale; retirementFV *= scale;
    }

    const totalWithdrawnNet = totalWithdrawnGross * (1 - taxRatePct / 100);
    return {
        vested: vestedFV,
        savings: savingsFV,
        retirement: retirementFV,
        total,
        savingsPotWithdrawnGross: totalWithdrawnGross,
        savingsPotWithdrawnNet: totalWithdrawnNet,
        savingsPotTaxPaid: totalWithdrawnGross - totalWithdrawnNet,
    };
}
```

Note: the savings-pot withdrawal flows into the **discretionary** lump-sum bucket (after tax) at retirement. The full pre-Sep-2024 RA balance must be supplied via `param,ra_vested_balance`; if not set, defaults to 0 and the entire current pot is treated as post-Sep-2024 contributions split 33/67.

### TFSA future value (tax-year aware)

```js
// Track current tax year separately. SA tax year: 1 March - end Feb.
function tfsaFutureValue(currentValue, annualRatePct, monthsToRetirement,
                          optEnabled, tfsaTransactions) {
    let fv = fvGrow(currentValue, annualRatePct, monthsToRetirement);
    if (!optEnabled) return fv;

    const today = new Date();
    const taxYearStart = today.getMonth() >= 2  // March = month 2
        ? new Date(today.getFullYear(), 2, 1)
        : new Date(today.getFullYear() - 1, 2, 1);

    // Contributions in current tax year so far
    const thisYearContrib = tfsaTransactions
        .filter(t => new Date(t.date) >= taxYearStart)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const thisYearRemaining = Math.max(0, 46_000 - thisYearContrib);

    const lifetimeContributed = tfsaTransactions
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const lifetimeRemaining = Math.max(0, 500_000 - lifetimeContributed);

    // Plug in current-year top-up first
    let remainingCap = lifetimeRemaining;
    const monthsToTaxYearEnd = (taxYearStart.getMonth() + 12 - today.getMonth())
        % 12 || 12;
    if (thisYearRemaining > 0 && remainingCap > 0) {
        const topUp = Math.min(thisYearRemaining, remainingCap);
        fv += fvGrow(topUp, annualRatePct, monthsToRetirement);
        remainingCap -= topUp;
    }

    // Then full R46k years until cap or retirement
    const yearsOfFullContrib = Math.min(
        Math.floor(remainingCap / 46_000),
        Math.floor((monthsToRetirement - monthsToTaxYearEnd) / 12)
    );
    for (let y = 0; y < yearsOfFullContrib; y++) {
        const monthsRemaining = monthsToRetirement - monthsToTaxYearEnd - y * 12;
        fv += fvGrow(46_000, annualRatePct, monthsRemaining);
    }
    return fv;
}
```

### Retirement lump-sum tax (2026/27 table)

```js
function lumpSumTax(amount) {
    if (amount <= 550_000) return 0;
    if (amount <= 770_000) return (amount - 550_000) * 0.18;
    if (amount <= 1_155_000) return 39_600 + (amount - 770_000) * 0.27;
    return 143_550 + (amount - 1_155_000) * 0.36;
}
```

Note: SARS aggregates all lifetime lump sums for rate determination. v1 ignores this — assumes first lump sum in member's lifetime. Document the assumption.

### RA drawdown with commutation + tax

```js
// Note: taxRatePct is the user-supplied flat `effective_tax_rate_pct` (default 18%).
// v1 simplification — does NOT apply SARS marginal brackets, rebates, or age-based
// thresholds to drawdown income. See "Out of scope (v1)" for full caveat. TODO v2:
// derive marginal rate from total annual taxable income (drawdown + Dutch pension +
// any savings-pot withdrawals) using the live SARS personal-income-tax table.
function raMonthlyIncome(raPot, withdrawalRatePct, taxRatePct,
                         commuteThird, deMinimis = 360_000) {
    if (raPot < deMinimis) {
        // Full commutation possible — no drawdown
        return { gross: 0, net: 0, fullCommutation: true };
    }
    const annuitisedPot = commuteThird ? raPot * 2 / 3 : raPot;
    const gross = annuitisedPot * (withdrawalRatePct / 100) / 12;
    const net = gross * (1 - taxRatePct / 100);
    return { gross, net, fullCommutation: false };
}

function raCommutationLumpSum(raPot, commuteThird) {
    if (!commuteThird) return { gross: 0, tax: 0, net: 0 };
    const gross = raPot / 3;
    const tax = lumpSumTax(gross);
    return { gross, tax, net: gross - tax };
}
```

### Living annuity depletion check (R150,000 commutation threshold)

Post-retirement, a living annuity that depletes below R150,000 (per insurer) can be fully commuted to cash and taxed via the lump-sum table. The model walks the annuitised pot forward year-by-year applying the user's drawdown rate against the assumed return; if it crosses R150k, the spec flags the year. Used to populate the warning on Card 3 and to cap the Dutch-pension-era projection at age 68.

```js
// Walk the annuitised pot from retirement_age forward.
// Returns the age at which the pot first drops below R150k, or null.
function projectLivingAnnuityDepletion(annuitisedPot, annualReturnPct,
                                       withdrawalRatePct, retirementAge,
                                       horizonAge = 95,
                                       threshold = 150_000) {
    let pot = annuitisedPot;
    const r = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
    const monthlyDrawdownRate = (withdrawalRatePct / 100) / 12;
    for (let age = retirementAge; age < horizonAge; age++) {
        for (let m = 0; m < 12; m++) {
            const drawdown = pot * monthlyDrawdownRate;
            pot = pot * (1 + r) - drawdown;
            if (pot < threshold) {
                return {
                    ageAtThreshold: age + (m + 1) / 12,
                    potAtThreshold: pot,
                    canCommute: true,
                    commutationTax: lumpSumTax(Math.max(0, pot)),
                };
            }
        }
    }
    return null;  // pot lasts past horizon
}
```

Display rules:
- If `ageAtThreshold` ≤ 68 and Dutch pension enabled: show "RA pot expected to deplete below R150k by age N — drawdown income ends, full commutation triggers; from then on income = Dutch pension only."
- If `ageAtThreshold` > 68 or Dutch pension disabled: informational note only on Card 3.
- If `null`: no warning shown (pot sustains drawdown past horizon).

### Dutch pension (from age 68)

```js
const dutch_monthly_ZAR = 900 * eur_zar_rate;
const dutch_monthly_net = dutch_monthly_ZAR * (1 - taxRatePct / 100);
```

Note: DTA between SA and Netherlands has nuance — assume SA-resident taxation for v1, document as a known simplification.

---

## Data reads from other tabs

All reads are one-way (retirement tab never writes to other tabs' state):

| Data needed | Source |
|---|---|
| Discretionary current value | `investmentData.currentValues.Discretionary` |
| TFSA current value | `investmentData.currentValues.TFSA` |
| Crypto current value | `investmentData.currentValues.Crypto` |
| TFSA transactions (with dates, for cap + tax year) | `investmentData.transactions.filter(t => t.type === 'TFSA')` |
| RA pot today | `_calculatePotValueToday(raTransactions, raParams.nominal_return_pct, today)` |
| RA vested balance | `retirementParams.ra_vested_balance` (user-supplied) — defaults to 0 if not set |
| RA savings/retirement split today | `(raPotToday - vestedBalance)` then 33/67 split |
| Current annual RA contribution (for deduction cap headroom) | derived from `raTransactions` last 12 months |

These are read at render time. The Retirement tab re-renders whenever its inputs change (same `debouncedSave` + render pattern).

---

## Persistence flow

- `generateRetirementCSV()` — produces param rows from current settings.
- `parseRetirementCSV(text)` — reads param rows into a settings object; falls back to defaults for any missing key.
- `debouncedSave('retirement', generateRetirementCSV, 'save-retirement-csv')` — fires 800ms after any input change.
- On page load: auto-fetches `/db/retirement.csv` via the existing server fetch pattern.

---

## Edge cases

- **Invalid/missing DOB**: fall back to default `1985-08-08` silently; show validation hint near DOB input if parsed date is invalid.
- **Retirement age < current age**: months = 0, all FV = current values. Show warning "You are already past retirement age."
- **Retirement age < 55**: show two RA phases (at retirement = inaccessible, at 55 = drawdown begins).
- **Retirement age ≥ 68**: Dutch pension phase note omitted (already included from day one).
- **TFSA cap already hit**: remaining = 0, no contributions added even if optional enabled. Show "TFSA cap already reached."
- **TFSA current-year cap hit**: optional contributions skip current tax year, resume next March 1.
- **RA pot < R360,000 at retirement (de minimis)**: show "Full commutation possible — drawdown not required" banner; lump sum = full pot, monthly = 0.
- **Living annuity depletes below R150,000 post-retirement**: flag year of crossing on Card 3; treat drawdown as ending at that age in monthly-income breakdown.
- **Vested balance > current RA pot**: validation error — vested cannot exceed total. Show inline warning, treat as `min(vested, raPotToday)`.
- **Vested balance not set**: assume 0 (entire pot post-Sep-2024). Show muted hint near input: "Enter your pre-Sep-2024 RA balance for accurate two-pot modelling."
- **Savings-pot withdrawal > savings-pot balance in a given year**: cap at available balance silently (no error). Total withdrawn over period reflects actual capacity.
- **Savings-pot withdrawal < R2,000**: validation error — below SARS minimum. Show inline warning.
- **Extra RA monthly × 12 > R430,000**: soft warning "Above SARS deduction cap. Excess carries forward — no immediate tax benefit."
- **RA return rate = 0**: use linear growth (no division by r).
- **Bond balance > total lump sum**: show negative net lump sum in red with warning.
- **Missing `db/retirement.csv`**: all settings fall back to defaults silently.

---

## Out of scope (v1)

- Year-by-year growth table / chart.
- Aggregate lifetime lump-sum tax (SARS aggregates across multiple withdrawals).
- Inflation-adjusted contribution caps (TFSA / RA caps may rise; not modelled).
- Multiple retirement age scenarios side-by-side.
- Sequence-of-returns risk / Monte Carlo simulation.
- DTA detail for Dutch pension cross-border tax treatment.
- Spouse / household joint projection.
- Estate duty modelling.
- Marginal-rate / SARS-bracket taxation of post-retirement income. v1 applies a single flat `effective_tax_rate_pct` (default 18%) to **all** taxable retirement income streams: RA living-annuity drawdown, Dutch pension (in ZAR), and pre-retirement savings-pot withdrawals. The proper SARS sliding scale on annual taxable income (with rebates, age-based thresholds, and medical credits) is not modelled. Lump-sum tax at retirement is the only stream that uses the actual SARS table (`lumpSumTax`, retirement lump-sum 2026/27).
- Multiple RAs at different providers (de minimis and R150k thresholds apply per-insurer; v1 treats RA as a single pot).

---

## Files touched

- `src/budget_calculator.html` — new tab markup + JS (parse, calculate, render, save wiring).
- `server.py` — add `'retirement': 'db/retirement.csv'` to `FILE_MAP` and `REAL_KEYS`.
- `db/retirement.csv` — created on first save.
- `docs/specs/core-requirements.md` — add Retirement tab goals/concepts/formulas.
- `docs/specs/functional-requirements.md` — add detailed Retirement tab behaviour.
