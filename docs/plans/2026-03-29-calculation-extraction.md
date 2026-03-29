# Calculation Extraction & Unit Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all pure calculation logic from `budget_calculator.html` into `calculations.js`, then cover every extracted function with Vitest unit tests.

**Architecture:** A new `calculations.js` ES module exports pure functions (no DOM). The HTML changes its `<script>` to `<script type="module">` and imports those functions, keeping all DOM wiring in place. Vitest tests import from `calculations.js` directly.

**Tech Stack:** Vanilla JavaScript (ES modules), Vitest (test runner), Node.js ≥18

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `calculations.js` | Create | All pure calculation functions, exported |
| `tests/calculations.test.js` | Create | All unit tests |
| `package.json` | Create | `"type": "module"`, Vitest devDependency |
| `budget_calculator.html` | Modify line 839 | Change `<script>` → `<script type="module">` |
| `budget_calculator.html` | Modify JS section | Import from `calculations.js`, replace inline math |

---

## Task 1: Setup — package.json and Vitest

**Files:**
- Create: `package.json`
- Create: `tests/calculations.test.js` (smoke test)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "budget-calculator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install Vitest**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 3: Create `tests/calculations.test.js` with a smoke test**

```js
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
    it('runs', () => {
        expect(1 + 1).toBe(2);
    });
});
```

- [ ] **Step 4: Run tests — should pass**

```bash
npm test
```

Expected output contains: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/calculations.test.js
git commit -m "chore: add Vitest and test scaffold"
```

---

## Task 2: Create `calculations.js` skeleton

**Files:**
- Create: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Write failing import test**

Replace `tests/calculations.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import {
    getUpcoming25th,
    calculateBudgetSummary,
    calculateMonthlyAllocation,
    calculateInvestmentPerformance,
    monthlyInterestFactor,
    simulateDebt,
    calculateDebtResults,
    xirr,
    parseBudgetCSV,
    generateBudgetCSV,
    parseInvestmentCSV,
    generateInvestmentCSV,
    parseDebtCSV,
    generateDebtCSV,
} from '../calculations.js';

describe('smoke', () => {
    it('imports all functions', () => {
        expect(typeof getUpcoming25th).toBe('function');
        expect(typeof calculateBudgetSummary).toBe('function');
        expect(typeof calculateMonthlyAllocation).toBe('function');
        expect(typeof calculateInvestmentPerformance).toBe('function');
        expect(typeof monthlyInterestFactor).toBe('function');
        expect(typeof simulateDebt).toBe('function');
        expect(typeof calculateDebtResults).toBe('function');
        expect(typeof xirr).toBe('function');
        expect(typeof parseBudgetCSV).toBe('function');
        expect(typeof generateBudgetCSV).toBe('function');
        expect(typeof parseInvestmentCSV).toBe('function');
        expect(typeof generateInvestmentCSV).toBe('function');
        expect(typeof parseDebtCSV).toBe('function');
        expect(typeof generateDebtCSV).toBe('function');
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: error like `Cannot find module '../calculations.js'`

- [ ] **Step 3: Create `calculations.js` with stub exports**

```js
// Internal helper used by CSV parsers
const _generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function getUpcoming25th(today = new Date()) { return ''; }
export function calculateBudgetSummary() { return {}; }
export function calculateMonthlyAllocation() { return {}; }
export function calculateInvestmentPerformance() { return {}; }
export function monthlyInterestFactor() { return 0; }
export function simulateDebt() { return {}; }
export function calculateDebtResults() { return {}; }
export function xirr() { return 0; }
export function parseBudgetCSV() { return {}; }
export function generateBudgetCSV() { return ''; }
export function parseInvestmentCSV() { return {}; }
export function generateInvestmentCSV() { return ''; }
export function parseDebtCSV() { return {}; }
export function generateDebtCSV() { return ''; }
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "chore: add calculations.js skeleton with stub exports"
```

---

## Task 3: `getUpcoming25th`

**Files:**
- Modify: `calculations.js` (implement `getUpcoming25th`)
- Modify: `tests/calculations.test.js` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js` (after the smoke describe block):

```js
describe('getUpcoming25th', () => {
    it('returns the 25th of the current month when today is before the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 10))).toBe('2026-03-25');
    });

    it('returns the 25th of the next month when today is after the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 26))).toBe('2026-04-25');
    });

    it('returns the 25th of the same month when today is exactly the 25th', () => {
        expect(getUpcoming25th(new Date(2026, 2, 25))).toBe('2026-03-25');
    });

    it('handles year rollover correctly', () => {
        expect(getUpcoming25th(new Date(2026, 11, 26))).toBe('2027-01-25');
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 4 failing tests under `getUpcoming25th`

- [ ] **Step 3: Implement `getUpcoming25th` in `calculations.js`**

Replace the stub:

```js
export function getUpcoming25th(today = new Date()) {
    let year = today.getFullYear();
    let month = today.getMonth();
    if (today.getDate() > 25) {
        month++;
    }
    const targetDate = new Date(year, month, 25);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-25`;
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test getUpcoming25th"
```

---

## Task 4: `calculateBudgetSummary`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('calculateBudgetSummary', () => {
    it('calculates current net amount correctly', () => {
        const result = calculateBudgetSummary(
            10000,
            [{ amount: 2000 }, { amount: 1500 }],
            [{ amount: 500 }],
            [],
            null,
            new Date(2026, 0, 1)
        );
        expect(result.totalDebts).toBe(3500);
        expect(result.totalProvisions).toBe(500);
        expect(result.currentNetAmount).toBe(6000);
        expect(result.futureNetAmount).toBe(6000);
        expect(result.monthlySavingsTarget).toBe(0);
    });

    it('filters future costs by date', () => {
        const futureDate = new Date(2026, 5, 15); // June 15
        const futureCosts = [
            { amount: 300, date: '2026-04-01' }, // before
            { amount: 200, date: '2026-07-01' }, // after
        ];
        const result = calculateBudgetSummary(5000, [], [], futureCosts, futureDate, new Date(2026, 0, 1));
        expect(result.relevantFutureCosts).toBe(300);
        expect(result.futureNetAmount).toBe(4700);
    });

    it('sets monthlySavingsTarget when futureNetAmount is negative', () => {
        // savings=1000, debts=2000 → currentNet=-1000, futureCost=500 → futureNet=-1500
        const today = new Date(2026, 0, 1);    // Jan 1
        const futureDate = new Date(2026, 6, 1); // Jul 1 — 181 days → monthsDiff=7
        const result = calculateBudgetSummary(
            1000,
            [{ amount: 2000 }],
            [],
            [{ amount: 500, date: '2026-03-01' }],
            futureDate,
            today
        );
        expect(result.futureNetAmount).toBeLessThan(0);
        expect(result.monthlySavingsTarget).toBeCloseTo(1500 / 7, 1);
    });

    it('sets monthlySavingsTarget when both net amounts positive but future is less', () => {
        // currentNet=5000, futureCost=500 → futureNet=4500; target=(5000-4500)/7
        const today = new Date(2026, 0, 1);
        const futureDate = new Date(2026, 6, 1);
        const result = calculateBudgetSummary(
            5000, [], [],
            [{ amount: 500, date: '2026-03-01' }],
            futureDate,
            today
        );
        expect(result.currentNetAmount).toBe(5000);
        expect(result.futureNetAmount).toBe(4500);
        expect(result.monthlySavingsTarget).toBeCloseTo(500 / 7, 1);
    });

    it('returns zero monthlySavingsTarget with no future date', () => {
        const result = calculateBudgetSummary(5000, [], [], [], null, new Date(2026, 0, 1));
        expect(result.monthlySavingsTarget).toBe(0);
    });

    it('handles empty arrays and zero savings', () => {
        const result = calculateBudgetSummary(0, [], [], [], null, new Date(2026, 0, 1));
        expect(result.totalDebts).toBe(0);
        expect(result.totalProvisions).toBe(0);
        expect(result.currentNetAmount).toBe(0);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 6 failing tests under `calculateBudgetSummary`

- [ ] **Step 3: Implement `calculateBudgetSummary` in `calculations.js`**

Replace the stub:

```js
export function calculateBudgetSummary(savings, debts, provisions, futureCosts, futureDate, today = new Date()) {
    const totalDebts = debts.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const totalProvisions = provisions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const currentNetAmount = savings - totalDebts - totalProvisions;

    const relevantFutureCosts = futureDate
        ? futureCosts.reduce((sum, item) => {
            const itemDate = item.date ? new Date(item.date) : null;
            if (itemDate && itemDate <= futureDate) {
                return sum + (parseFloat(item.amount) || 0);
            }
            return sum;
        }, 0)
        : 0;

    const futureNetAmount = currentNetAmount - relevantFutureCosts;

    let monthlySavingsTarget = 0;
    let monthsDiff = 0;

    if (futureDate) {
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        const fd = new Date(futureDate);
        fd.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((fd - t) / (1000 * 60 * 60 * 24));
        monthsDiff = Math.max(1, Math.ceil(daysDiff / 30));

        if (daysDiff > 0) {
            if (futureNetAmount < 0) {
                monthlySavingsTarget = Math.abs(futureNetAmount) / monthsDiff;
            } else if (futureNetAmount < currentNetAmount) {
                monthlySavingsTarget = (currentNetAmount - futureNetAmount) / monthsDiff;
            } else if (currentNetAmount < 0 && futureNetAmount >= 0) {
                monthlySavingsTarget = (Math.abs(currentNetAmount) + futureNetAmount) / monthsDiff;
            }
        }
    }

    return { totalDebts, totalProvisions, currentNetAmount, relevantFutureCosts, futureNetAmount, monthsDiff, monthlySavingsTarget };
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test calculateBudgetSummary"
```

---

## Task 5: `calculateMonthlyAllocation`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('calculateMonthlyAllocation', () => {
    it('splits available money into buckets correctly', () => {
        // availableMoney=10000, savingsTarget=2000, remaining=8000
        // mortgage=30% of 8000=2400, eft=20% of 8000=1600, crypto=10% of 8000=800
        // totalAllocated=2000+2400+1600+800=6800, leftover=10000-6800=3200
        const result = calculateMonthlyAllocation(10000, 2000, 30, 20, 10);
        expect(result.remainingMoney).toBe(8000);
        expect(result.mortgageAmount).toBe(2400);
        expect(result.eftAmount).toBe(1600);
        expect(result.cryptoAmount).toBe(800);
        expect(result.totalAllocated).toBe(6800);
        expect(result.leftover).toBe(3200);
    });

    it('passes the full amount through when savings target is zero', () => {
        const result = calculateMonthlyAllocation(5000, 0, 50, 0, 0);
        expect(result.remainingMoney).toBe(5000);
        expect(result.mortgageAmount).toBe(2500);
        expect(result.eftAmount).toBe(0);
        expect(result.cryptoAmount).toBe(0);
    });

    it('returns zero leftover when percentages sum to 100', () => {
        const result = calculateMonthlyAllocation(10000, 0, 40, 40, 20);
        expect(result.leftover).toBeCloseTo(0, 5);
    });

    it('correctly handles fractional percentages', () => {
        const result = calculateMonthlyAllocation(1000, 0, 33.33, 33.33, 33.34);
        expect(result.totalAllocated).toBeCloseTo(1000, 2);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 4 failing tests under `calculateMonthlyAllocation`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function calculateMonthlyAllocation(availableMoney, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage) {
    const remainingMoney = availableMoney - monthlySavingsTarget;
    const mortgageAmount = (remainingMoney * mortgagePercentage) / 100;
    const eftAmount = (remainingMoney * eftPercentage) / 100;
    const cryptoAmount = (remainingMoney * cryptoPercentage) / 100;
    const totalAllocated = monthlySavingsTarget + mortgageAmount + eftAmount + cryptoAmount;
    const leftover = availableMoney - totalAllocated;
    return { remainingMoney, mortgageAmount, eftAmount, cryptoAmount, totalAllocated, leftover };
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test calculateMonthlyAllocation"
```

---

## Task 6: `calculateInvestmentPerformance`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('calculateInvestmentPerformance', () => {
    it('returns zero/null result when no transactions', () => {
        const result = calculateInvestmentPerformance([], 0, new Date(2026, 0, 1));
        expect(result.totalInvested).toBe(0);
        expect(result.absoluteReturn).toBe(0);
        expect(result.percentageReturn).toBe(0);
        expect(result.annualizedReturn).toBeNull();
    });

    it('calculates absolute return and percentage return', () => {
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 12000, new Date(2026, 0, 1));
        expect(result.totalInvested).toBe(10000);
        expect(result.absoluteReturn).toBe(2000);
        expect(result.percentageReturn).toBeCloseTo(20, 5);
    });

    it('calculates savings comparison at 6% compound per transaction', () => {
        const txDate = new Date(2024, 0, 1);
        const today = new Date(2026, 0, 1);
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 12000, today);
        const ageInDays = (today - txDate) / (1000 * 60 * 60 * 24);
        const expectedGain = 10000 * (Math.pow(1.06, ageInDays / 365.25) - 1);
        expect(result.savingsGain).toBeCloseTo(expectedGain, 2);
        expect(result.netVsSavings).toBeCloseTo(result.absoluteReturn - expectedGain, 2);
    });

    it('returns null for annualizedReturn when ratio is zero', () => {
        const txs = [{ amount: 10000, date: '2023-01-01', type: 'Discretionary' }];
        const result = calculateInvestmentPerformance(txs, 0, new Date(2026, 0, 1));
        expect(result.annualizedReturn).toBeNull();
    });

    it('returns null for annualizedReturn when yearsHeld <= 0.1', () => {
        const txs = [{ amount: 10000, date: '2026-01-01', type: 'Discretionary' }];
        // today is only 5 days after the transaction date
        const result = calculateInvestmentPerformance(txs, 10500, new Date(2026, 0, 6));
        expect(result.annualizedReturn).toBeNull();
    });

    it('computes annualizedReturn correctly for a known input', () => {
        // R10000 invested on Jan 1 2024, worth R12000 on Jan 1 2026 (approx 2 years)
        const txs = [{ amount: 10000, date: '2024-01-01', type: 'TFSA' }];
        const today = new Date(2026, 0, 1);
        const result = calculateInvestmentPerformance(txs, 12000, today);
        const ageInDays = (today - new Date(2024, 0, 1)) / (1000 * 60 * 60 * 24);
        const yearsHeld = ageInDays / 365.25;
        const expectedAnn = (Math.pow(1.2, 1 / yearsHeld) - 1) * 100;
        expect(result.annualizedReturn).toBeCloseTo(expectedAnn, 1);
    });

    it('sums totalCryptoValue from cryptoValue fields', () => {
        const txs = [
            { amount: 5000, date: '2024-01-01', type: 'Crypto', cryptoValue: '0.5' },
            { amount: 3000, date: '2024-06-01', type: 'Crypto', cryptoValue: '0.25' },
        ];
        const result = calculateInvestmentPerformance(txs, 9000, new Date(2026, 0, 1));
        expect(result.totalCryptoValue).toBeCloseTo(0.75, 5);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 7 failing tests under `calculateInvestmentPerformance`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function calculateInvestmentPerformance(transactions, currentValue, today = new Date()) {
    const totalInvested = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalCryptoValue = transactions.reduce((sum, t) => sum + (parseFloat(t.cryptoValue) || 0), 0);

    if (totalInvested === 0) {
        return { totalInvested: 0, totalCryptoValue: 0, absoluteReturn: 0, percentageReturn: 0, savingsGain: 0, netVsSavings: 0, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const absoluteReturn = currentValue - totalInvested;
    const percentageReturn = (absoluteReturn / totalInvested) * 100;

    let savingsGain = 0;
    let weightedAgeSum = 0;
    let validTxCount = 0;

    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        if (amount > 0 && t.date) {
            const txDate = new Date(t.date);
            const ageInDays = (today - txDate) / (1000 * 60 * 60 * 24);
            if (ageInDays > 0) {
                savingsGain += amount * (Math.pow(1.06, ageInDays / 365.25) - 1);
                weightedAgeSum += amount * ageInDays;
                validTxCount++;
            }
        }
    });

    const netVsSavings = absoluteReturn - savingsGain;

    if (validTxCount === 0 || weightedAgeSum === 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const averageAgeDays = weightedAgeSum / totalInvested;
    const yearsHeld = averageAgeDays / 365.25;

    if (yearsHeld <= 0.1) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const ratio = currentValue / totalInvested;
    if (ratio <= 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const annualizedReturn = (Math.pow(ratio, 1 / yearsHeld) - 1) * 100;
    return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, averageAgeDays, yearsHeld, annualizedReturn };
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test calculateInvestmentPerformance"
```

---

## Task 7: `monthlyInterestFactor`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('monthlyInterestFactor', () => {
    const annualRate = 0.12;
    const dailyRate = annualRate / 365;

    it('uses 28 days for February in a non-leap year (2025)', () => {
        const factor = monthlyInterestFactor(dailyRate, 2025, 1); // month 1 = February
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 28) - 1, 10);
    });

    it('uses 29 days for February in a leap year (2024)', () => {
        const factor = monthlyInterestFactor(dailyRate, 2024, 1); // 2024 is a leap year
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 29) - 1, 10);
    });

    it('uses 31 days for January', () => {
        const factor = monthlyInterestFactor(dailyRate, 2026, 0); // month 0 = January
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 31) - 1, 10);
    });

    it('uses 30 days for April', () => {
        const factor = monthlyInterestFactor(dailyRate, 2026, 3); // month 3 = April
        expect(factor).toBeCloseTo(Math.pow(1 + dailyRate, 30) - 1, 10);
    });

    it('returns 0 when dailyRate is 0', () => {
        expect(monthlyInterestFactor(0, 2026, 0)).toBe(0);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 5 failing tests under `monthlyInterestFactor`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function monthlyInterestFactor(dailyRate, year, month) {
    const days = new Date(year, month + 1, 0).getDate();
    return Math.pow(1 + dailyRate, days) - 1;
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test monthlyInterestFactor"
```

---

## Task 8: `simulateDebt`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('simulateDebt', () => {
    it('pays off a zero-interest loan in exactly the right number of months', () => {
        // R100,000 at 0% interest, R10,000/month effective repayment → 10 months
        const result = simulateDebt(
            100000,
            new Date(2026, 0, 1),
            10000, // effectiveRepayment
            0,     // serviceFee
            0,     // dailyRate (no interest)
            [],
            false
        );
        expect(result.months).toBe(10);
        expect(result.totalInterest).toBeCloseTo(0, 5);
        expect(result.totalFees).toBe(0);
    });

    it('accumulates service fees at rate of one fee per month', () => {
        const result = simulateDebt(100000, new Date(2026, 0, 1), 10000, 100, 0, [], false);
        expect(result.totalFees).toBe(result.months * 100);
    });

    it('applies extra repayments only in the matching month, reducing total months', () => {
        // Extra R5000 in March 2026 (month string '2026-03') — should finish sooner
        const repayments = [{ date: '2026-03-15', amount: 5000 }];
        const withExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, true);
        const withoutExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, false);
        expect(withExtras.months).toBeLessThan(withoutExtras.months);
    });

    it('does not apply extras when withExtras is false', () => {
        const repayments = [{ date: '2026-03-15', amount: 50000 }]; // large extra
        const withExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, repayments, false);
        const noExtras = simulateDebt(100000, new Date(2026, 0, 1), 10000, 0, 0, [], false);
        expect(withExtras.months).toBe(noExtras.months);
    });

    it('stops when balance drops below 10', () => {
        // Balance will hit ~0 before 1200 months
        const result = simulateDebt(50, new Date(2026, 0, 1), 100, 0, 0, [], false);
        expect(result.months).toBe(1);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 5 failing tests under `simulateDebt`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, withExtras) {
    let balance = startPrincipal;
    let totalInterest = 0;
    let totalFees = 0;
    let months = 0;
    let simDate = new Date(startDate);

    while (balance > 10 && months < 1200) {
        totalFees += serviceFee;

        const interest = balance * monthlyInterestFactor(dailyRate, simDate.getFullYear(), simDate.getMonth());
        totalInterest += interest;
        balance += interest;

        let payment = effectiveRepayment;

        if (withExtras) {
            const currentMonthStr = simDate.toISOString().slice(0, 7);
            repayments.forEach(rep => {
                if (rep.date && rep.date.startsWith(currentMonthStr)) {
                    payment += (parseFloat(rep.amount) || 0);
                }
            });
        }

        if (balance < payment) payment = balance;
        balance -= payment;
        months++;
        simDate.setMonth(simDate.getMonth() + 1);
    }

    return { totalInterest, totalFees, endDate: simDate, months };
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test simulateDebt"
```

---

## Task 9: `calculateDebtResults`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('calculateDebtResults', () => {
    it('returns zero moneySaved and diffMonths with no extra repayments and no interest', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 10000,
            serviceFee: 0,
            interestRate: 0,
            nextPaymentDateStr: '2026-02-01',
            repayments: [],
        });
        expect(result.moneySaved).toBeCloseTo(0, 2);
        expect(result.diffMonths).toBe(0);
        expect(result.totalExtra).toBe(0);
    });

    it('reports positive moneySaved when extra repayments reduce interest paid', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 5000,
            serviceFee: 0,
            interestRate: 12,
            nextPaymentDateStr: '2026-02-01',
            repayments: [{ date: '2026-02-15', amount: 10000 }],
        });
        expect(result.moneySaved).toBeGreaterThan(0);
        expect(result.diffMonths).toBeGreaterThan(0);
        expect(result.totalExtra).toBe(10000);
    });

    it('returns baseline and actual simulation objects', () => {
        const result = calculateDebtResults({
            currentPrincipal: 50000,
            totalRepayment: 4000,
            serviceFee: 0,
            interestRate: 10,
            nextPaymentDateStr: '2026-02-01',
            repayments: [],
        });
        expect(result.baseline).toBeDefined();
        expect(result.actual).toBeDefined();
        expect(typeof result.baseline.months).toBe('number');
        expect(typeof result.baseline.endDate).toBe('object');
    });

    it('moneySaved equals difference in total costs between baseline and actual', () => {
        const result = calculateDebtResults({
            currentPrincipal: 100000,
            totalRepayment: 5000,
            serviceFee: 100,
            interestRate: 12,
            nextPaymentDateStr: '2026-02-01',
            repayments: [{ date: '2026-03-15', amount: 20000 }],
        });
        const baselineCost = result.baseline.totalInterest + result.baseline.totalFees;
        const actualCost = result.actual.totalInterest + result.actual.totalFees;
        expect(result.moneySaved).toBeCloseTo(baselineCost - actualCost, 5);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 4 failing tests under `calculateDebtResults`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function calculateDebtResults({ currentPrincipal, totalRepayment, serviceFee, interestRate, nextPaymentDateStr, repayments }) {
    const dailyRate = (interestRate / 100) / 365;
    const effectiveRepayment = totalRepayment - serviceFee;

    // Find earliest repayment date to use as simulation start
    let startDate = new Date(nextPaymentDateStr);
    startDate.setDate(1);

    if (repayments.length > 0) {
        const dates = repayments.map(r => new Date(r.date));
        const earliest = new Date(Math.min.apply(null, dates));
        earliest.setDate(1);
        if (earliest < startDate) startDate = earliest;
    }

    // Back-calculate: undo months from nextPaymentDate back to startDate
    // to find the "clean" starting balance before any extras were applied
    let simulatedBalance = currentPrincipal;
    let iterDate = new Date(nextPaymentDateStr);
    iterDate.setDate(1);

    while (iterDate > startDate) {
        iterDate.setMonth(iterDate.getMonth() - 1);
        const monthStr = iterDate.toISOString().slice(0, 7);
        let monthlyExtra = 0;
        repayments.forEach(rep => {
            if (rep.date && rep.date.startsWith(monthStr)) {
                monthlyExtra += (parseFloat(rep.amount) || 0);
            }
        });
        const factor = monthlyInterestFactor(dailyRate, iterDate.getFullYear(), iterDate.getMonth());
        simulatedBalance = (simulatedBalance + effectiveRepayment + monthlyExtra) / (1 + factor);
    }

    const startPrincipal = simulatedBalance;
    const baseline = simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, false);
    const actual = simulateDebt(startPrincipal, startDate, effectiveRepayment, serviceFee, dailyRate, repayments, true);

    const moneySaved = (baseline.totalInterest + baseline.totalFees) - (actual.totalInterest + actual.totalFees);
    const diffMonths = baseline.months - actual.months;
    const totalExtra = repayments.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    return { moneySaved, diffMonths, totalExtra, baseline, actual };
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test calculateDebtResults"
```

---

## Task 10: `xirr`

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('xirr', () => {
    it('converges to ~10% for a simple 1-year investment', () => {
        // Invest R10,000 on Jan 1 2025, receive R11,000 on Jan 1 2026 → 10% return
        const cashFlows = [
            { amount: -10000, date: new Date(2025, 0, 1) },
            { amount: 11000,  date: new Date(2026, 0, 1) },
        ];
        const rate = xirr(cashFlows);
        expect(rate).toBeCloseTo(0.10, 2);
    });

    it('converges to ~20% for a 2-year 20% total return', () => {
        // Invest R10,000 on Jan 1 2024, receive R12,000 on Jan 1 2026 → ~9.54% annualized
        const cashFlows = [
            { amount: -10000, date: new Date(2024, 0, 1) },
            { amount: 12000,  date: new Date(2026, 0, 1) },
        ];
        const rate = xirr(cashFlows);
        // Expected: (1.2)^(1/2) - 1 ≈ 0.0954
        expect(rate).toBeCloseTo(0.0954, 2);
    });

    it('accepts a custom initial guess', () => {
        const cashFlows = [
            { amount: -10000, date: new Date(2025, 0, 1) },
            { amount: 11000,  date: new Date(2026, 0, 1) },
        ];
        const rate = xirr(cashFlows, 0.5);
        expect(rate).toBeCloseTo(0.10, 2);
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: 3 failing tests under `xirr`

- [ ] **Step 3: Implement in `calculations.js`**

Replace the stub:

```js
export function xirr(cashFlows, guess = 0.1) {
    const xnpv = (rate) => cashFlows.reduce((sum, item) => {
        const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
        return sum + item.amount / Math.pow(1 + rate, days / 365);
    }, 0);

    let rate = guess;
    for (let i = 0; i < 20; i++) {
        const fValue = xnpv(rate);
        if (Math.abs(fValue) < 1) break;

        const derivative = cashFlows.reduce((sum, item) => {
            const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
            return sum - (days / 365) * item.amount / Math.pow(1 + rate, (days / 365) + 1);
        }, 0);

        const newRate = rate - fValue / derivative;
        if (Math.abs(newRate - rate) < 0.0001) { rate = newRate; break; }
        rate = newRate;
    }
    return rate;
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test xirr"
```

---

## Task 11: CSV parsers and generators

**Files:**
- Modify: `calculations.js`
- Modify: `tests/calculations.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/calculations.test.js`:

```js
describe('CSV round-trips', () => {
    describe('budget', () => {
        it('round-trips budget data without data loss', () => {
            const data = {
                savings: 15000,
                debts: [{ id: 'x1', description: 'Car loan', amount: 3000, date: '' }],
                provisions: [{ id: 'x2', description: 'Holiday', amount: 2000, date: '2026-12-01' }],
                futureCosts: [{ id: 'x3', description: 'Laptop', amount: 1500, date: '2026-06-01' }],
            };
            const csv = generateBudgetCSV(data);
            const parsed = parseBudgetCSV(csv);
            expect(parsed.savings).toBe(15000);
            expect(parsed.debts).toHaveLength(1);
            expect(parsed.debts[0].description).toBe('Car loan');
            expect(parsed.debts[0].amount).toBe(3000);
            expect(parsed.provisions[0].date).toBe('2026-12-01');
            expect(parsed.futureCosts[0].amount).toBe(1500);
        });

        it('handles items with no date', () => {
            const csv = 'type,description,amount,date\ndebt,Test debt,500,\n';
            const parsed = parseBudgetCSV(csv);
            expect(parsed.debts).toHaveLength(1);
            expect(parsed.debts[0].amount).toBe(500);
        });

        it('skips unknown row types silently', () => {
            const csv = 'type,description,amount,date\nunknown,foo,100,\nsavings,,5000,\n';
            const parsed = parseBudgetCSV(csv);
            expect(parsed.savings).toBe(5000);
            expect(parsed.debts).toHaveLength(0);
        });
    });

    describe('investments', () => {
        it('round-trips investment transactions and current values', () => {
            const data = {
                transactions: [{
                    id: 'x1', date: '2024-06-15', description: 'Buy ETF',
                    amount: 5000, type: 'TFSA', cryptoValue: ''
                }],
                currentValues: { Discretionary: 1000, TFSA: 6500, Crypto: 0 },
            };
            const csv = generateInvestmentCSV(data);
            const parsed = parseInvestmentCSV(csv);
            expect(parsed.transactions).toHaveLength(1);
            expect(parsed.transactions[0].description).toBe('Buy ETF');
            expect(parsed.transactions[0].amount).toBe(5000);
            expect(parsed.transactions[0].type).toBe('TFSA');
            expect(parsed.transactions[0].date).toBe('2024-06-15');
            expect(parsed.currentValues.TFSA).toBe(6500);
            expect(parsed.currentValues.Discretionary).toBe(1000);
        });

        it('converts DD-MM-YYYY dates to YYYY-MM-DD on parse', () => {
            const csv = 'Date,Description,amount,account type,crypto_value\n15-06-2024,Buy,5000,TFSA,\n';
            const parsed = parseInvestmentCSV(csv);
            expect(parsed.transactions[0].date).toBe('2024-06-15');
        });
    });

    describe('debt', () => {
        it('round-trips debt repayments and params', () => {
            const repayments = [{ id: 'x1', date: '2026-02-15', description: 'Bonus', amount: 5000 }];
            const params = {
                principal: '500000', current_balance: '450000', repayment: '4500',
                service_fee: '69', interest_rate: '11.25', next_payment: '2026-02-25',
                loan_start: '2020-01-01', original_term: '240',
            };
            const csv = generateDebtCSV(repayments, params);
            const parsed = parseDebtCSV(csv);
            expect(parsed.params.principal).toBe('500000');
            expect(parsed.params.interest_rate).toBe('11.25');
            expect(parsed.params.original_term).toBe('240');
            expect(parsed.repayments).toHaveLength(1);
            expect(parsed.repayments[0].amount).toBe(5000);
            expect(parsed.repayments[0].description).toBe('Bonus');
        });

        it('handles empty repayments list', () => {
            const csv = generateDebtCSV([], { principal: '100000', current_balance: '', repayment: '', service_fee: '', interest_rate: '', next_payment: '', loan_start: '', original_term: '' });
            const parsed = parseDebtCSV(csv);
            expect(parsed.repayments).toHaveLength(0);
            expect(parsed.params.principal).toBe('100000');
        });
    });
});
```

- [ ] **Step 2: Run — should FAIL**

```bash
npm test
```

Expected: multiple failing tests under `CSV round-trips`

- [ ] **Step 3: Implement all CSV functions in `calculations.js`**

Replace all CSV stubs:

```js
export function parseBudgetCSV(text) {
    const newData = { savings: 0, debts: [], provisions: [], futureCosts: [] };
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const contentRows = rows.slice(1);

    contentRows.forEach(row => {
        const [type, description, amount, date] = row.split(',').map(s => s.trim());
        const item = { id: _generateId(), description, amount: parseFloat(amount) || 0, date };

        switch (type) {
            case 'savings':
                newData.savings = parseFloat(amount) || 0;
                break;
            case 'debt':
                newData.debts.push(item);
                break;
            case 'provision':
                newData.provisions.push(item);
                break;
            case 'costfuturecost':
                newData.futureCosts.push(item);
                break;
        }
    });
    return newData;
}

export function generateBudgetCSV(data) {
    let csv = 'type,description,amount,date\n';
    csv += `savings,,${data.savings || 0},\n`;
    data.debts.forEach(d => { csv += `debt,${d.description || ''},${d.amount || 0},\n`; });
    data.provisions.forEach(p => { csv += `provision,${p.description || ''},${p.amount || 0},${p.date || ''}\n`; });
    data.futureCosts.forEach(c => { csv += `costfuturecost,${c.description || ''},${c.amount || 0},${c.date || ''}\n`; });
    return csv;
}

export function parseInvestmentCSV(text) {
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const contentRows = rows.slice(1);
    const transactions = [];
    const currentValues = { Discretionary: 0, TFSA: 0, Crypto: 0 };

    contentRows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'current_value') {
            const type = cols[1];
            const amount = parseFloat(cols[2]) || 0;
            if (Object.prototype.hasOwnProperty.call(currentValues, type)) {
                currentValues[type] = amount;
            }
        } else {
            let dateStr = cols[0];
            if (dateStr && dateStr.includes('-') && dateStr.split('-')[0].length === 2) {
                const [dd, mm, yyyy] = dateStr.split('-');
                dateStr = `${yyyy}-${mm}-${dd}`;
            }
            transactions.push({
                id: _generateId(),
                date: dateStr,
                description: cols[1],
                amount: parseFloat(cols[2]) || 0,
                type: cols[3],
                cryptoValue: cols[4] || '',
            });
        }
    });
    return { transactions, currentValues };
}

export function generateInvestmentCSV(data) {
    let csv = 'Date,Description,amount,account type,crypto_value\n';
    data.transactions.forEach(t => {
        let dateStr = t.date;
        if (dateStr && dateStr.includes('-')) {
            const [yyyy, mm, dd] = dateStr.split('-');
            dateStr = `${dd}-${mm}-${yyyy}`;
        }
        csv += `${dateStr},${t.description},${t.amount},${t.type},${t.cryptoValue || ''}\n`;
    });
    Object.keys(data.currentValues).forEach(type => {
        csv += `current_value,${type},${data.currentValues[type]},\n`;
    });
    return csv;
}

export function parseDebtCSV(text) {
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const repayments = [];
    const params = {};

    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'param') {
            params[cols[1]] = cols[2];
        } else if (cols[0] !== 'Date' && cols[0] !== 'type') {
            if (cols.length >= 3 && !isNaN(parseFloat(cols[2]))) {
                repayments.push({
                    id: _generateId(),
                    date: cols[0],
                    description: cols[1],
                    amount: parseFloat(cols[2]),
                });
            }
        }
    });
    return { repayments, params };
}

export function generateDebtCSV(repayments, params) {
    let csv = 'Date,Description,Amount\n';
    csv += `param,principal,${params.principal || ''}\n`;
    csv += `param,current_balance,${params.current_balance || ''}\n`;
    csv += `param,repayment,${params.repayment || ''}\n`;
    csv += `param,service_fee,${params.service_fee || ''}\n`;
    csv += `param,interest_rate,${params.interest_rate || ''}\n`;
    csv += `param,next_payment,${params.next_payment || ''}\n`;
    csv += `param,loan_start,${params.loan_start || ''}\n`;
    csv += `param,original_term,${params.original_term || ''}\n`;
    repayments.forEach(r => { csv += `${r.date},${r.description},${r.amount}\n`; });
    return csv;
}
```

- [ ] **Step 4: Run — should PASS**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add calculations.js tests/calculations.test.js
git commit -m "feat: extract and test all CSV parsers and generators"
```

---

## Task 12: Wire HTML to use imports

**Files:**
- Modify: `budget_calculator.html`

This task replaces inline calculation logic in the HTML with calls to the imported pure functions. No logic changes — only structural refactoring.

- [ ] **Step 1: Change `<script>` to `<script type="module">` (line 839)**

Find:
```html
    <script>
```

Replace with:
```html
    <script type="module">
```

- [ ] **Step 2: Add import statement at the top of the `DOMContentLoaded` callback**

Find the opening of the callback (immediately after the `<script type="module">` tag):

```js
        document.addEventListener('DOMContentLoaded', () => {
            // --- TAB NAVIGATION ---
```

Replace with:

```js
        import {
            getUpcoming25th as _getUpcoming25th,
            calculateBudgetSummary as _calculateBudgetSummary,
            calculateMonthlyAllocation as _calcMonthlyAllocation,
            calculateInvestmentPerformance as _calculateInvestmentPerformance,
            monthlyInterestFactor as _monthlyInterestFactor,
            calculateDebtResults as _calculateDebtResults,
            xirr as _xirr,
            parseBudgetCSV as _parseBudgetCSV,
            generateBudgetCSV as _generateBudgetCSV,
            parseInvestmentCSV as _parseInvestmentCSV,
            generateInvestmentCSV as _generateInvestmentCSV,
            parseDebtCSV as _parseDebtCSV,
            generateDebtCSV as _generateDebtCSV,
        } from './calculations.js';

        document.addEventListener('DOMContentLoaded', () => {
            // --- TAB NAVIGATION ---
```

- [ ] **Step 3: Replace `getUpcoming25th`**

Find and remove the entire inline function (lines ~977–989):

```js
            const getUpcoming25th = () => {
                const today = new Date();
                let year = today.getFullYear();
                let month = today.getMonth();
                if (today.getDate() > 25) {
                    month++;
                }
                const targetDate = new Date(year, month, 25);
                const yyyy = targetDate.getFullYear();
                const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                const dd = '25';
                return `${yyyy}-${mm}-${dd}`;
            };
```

Replace the single call site (in `loadDebtCSVFromServer`, ~line 2137):

```js
                        debtNextPaymentInput.value = getUpcoming25th();
```

with:

```js
                        debtNextPaymentInput.value = _getUpcoming25th(new Date());
```

- [ ] **Step 4: Replace `calculateAndDisplaySummary`**

Find the entire `calculateAndDisplaySummary` function body and replace it:

```js
            const calculateAndDisplaySummary = () => {
                const savings = parseFloat(budgetData.savings) || 0;
                const futureDate = futureDateInput.value ? new Date(futureDateInput.value) : null;

                const r = _calculateBudgetSummary(
                    savings,
                    budgetData.debts,
                    budgetData.provisions,
                    budgetData.futureCosts,
                    futureDate,
                    new Date()
                );

                document.getElementById('current-net-amount').textContent = formatCurrency(r.currentNetAmount);
                document.getElementById('current-net-amount').style.color = r.currentNetAmount >= 0 ? '#16a34a' : '#ef4444';

                document.getElementById('future-net-amount').textContent = formatCurrency(r.futureNetAmount);
                document.getElementById('future-net-amount').style.color = r.futureNetAmount >= 0 ? '#4f46e5' : '#ef4444';

                document.getElementById('summary-savings').textContent = formatCurrency(savings);
                document.getElementById('summary-debts').textContent = `- ${formatCurrency(r.totalDebts)}`;
                document.getElementById('summary-provisions').textContent = `- ${formatCurrency(r.totalProvisions)}`;
                document.getElementById('summary-future-costs').textContent = formatCurrency(
                    budgetData.futureCosts.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
                );

                const monthlySavingsTargetEl = document.getElementById('monthly-savings-target');
                monthlySavingsTargetEl.textContent = formatCurrency(r.monthlySavingsTarget);
                monthlySavingsTargetEl.dataset.value = r.monthlySavingsTarget;
                monthlySavingsTargetEl.style.color = r.monthlySavingsTarget > 0 ? '#7c3aed' : '#64748b';
            };
```

- [ ] **Step 5: Replace `calculateMonthlyAllocation`**

Find the entire `calculateMonthlyAllocation` function body and replace it (keep the same function name so the event listener binding still works):

```js
            const calculateMonthlyAllocation = () => {
                const availableMoney = parseFloat(availableMoneyInput.value) || 0;
                const mortgagePercentage = parseFloat(mortgagePercentageInput.value) || 0;
                const eftPercentage = parseFloat(eftPercentageInput.value) || 0;
                const cryptoPercentage = parseFloat(cryptoPercentageInput.value) || 0;
                const monthlySavingsTarget = parseFloat(document.getElementById('monthly-savings-target').dataset.value) || 0;

                const totalPercentage = mortgagePercentage + eftPercentage + cryptoPercentage;

                if (totalPercentage > 100) {
                    alert('Total percentage cannot exceed 100%. Please adjust your percentages.');
                    return;
                }
                if (totalPercentage === 0) {
                    alert('Please enter at least one percentage allocation.');
                    return;
                }

                const r = _calcMonthlyAllocation(availableMoney, monthlySavingsTarget, mortgagePercentage, eftPercentage, cryptoPercentage);

                if (r.remainingMoney < 0) {
                    alert('Available money is less than required monthly savings. You need to increase your available money or reduce your financial commitments.');
                    return;
                }

                document.getElementById('allocation-savings').textContent = formatCurrency(monthlySavingsTarget);
                document.getElementById('allocation-mortgage').textContent = formatCurrency(r.mortgageAmount);
                document.getElementById('allocation-eft').textContent = formatCurrency(r.eftAmount);
                document.getElementById('allocation-crypto').textContent = formatCurrency(r.cryptoAmount);
                document.getElementById('allocation-total').textContent = formatCurrency(r.totalAllocated);

                allocationResults.classList.remove('hidden');
            };
```

- [ ] **Step 6: Replace inline `parseBudgetCSV` and `generateBudgetCSV`**

Find the entire `parseBudgetCSV` function (lines ~1218–1243) and replace with:

```js
            const parseBudgetCSV = (text) => _parseBudgetCSV(text);
```

Find the entire `generateBudgetCSV` function (lines ~1245–1255) and replace with:

```js
            const generateBudgetCSV = () => _generateBudgetCSV(budgetData);
```

- [ ] **Step 7: Replace `calculatePerformance`**

Find the entire `calculatePerformance` function (lines ~1402–1528) and replace with:

```js
            const calculatePerformance = (type, currentValueStr, invId, gainId, annId, moneyGainId) => {
                const currentValue = parseFloat(currentValueStr) || 0;
                const txs = investmentData.transactions.filter(t => t.type === type);

                const r = _calculateInvestmentPerformance(txs, currentValue, new Date());

                const invEl = document.getElementById(invId);
                if (invEl) invEl.textContent = formatCurrency(r.totalInvested);

                if (type === 'Crypto') {
                    const cryptoValEl = document.getElementById('total-crypto-value');
                    if (cryptoValEl) cryptoValEl.textContent = r.totalCryptoValue.toFixed(8);
                }

                const gainEl = document.getElementById(gainId);
                const annEl = document.getElementById(annId);
                const moneyGainEl = document.getElementById(moneyGainId);

                if (!gainEl) return;

                if (r.totalInvested === 0) {
                    gainEl.textContent = '0.00%';
                    gainEl.className = 'font-bold text-slate-800';
                    if (annEl) { annEl.textContent = '0.00%'; annEl.className = 'font-bold text-slate-800'; }
                    if (moneyGainEl) { moneyGainEl.textContent = 'R 0.00'; moneyGainEl.className = 'font-bold text-slate-800'; }
                    const typeKey0 = type.toLowerCase();
                    const sg0 = document.getElementById(`savings-gain-${typeKey0}`);
                    const ns0 = document.getElementById(`net-savings-${typeKey0}`);
                    if (sg0) sg0.textContent = 'R 0.00';
                    if (ns0) { ns0.textContent = 'R 0.00'; ns0.className = 'font-medium'; }
                    return;
                }

                gainEl.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
                gainEl.className = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

                if (moneyGainEl) {
                    moneyGainEl.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${formatCurrency(r.absoluteReturn)}`;
                    moneyGainEl.className = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                }

                const typeKey = type.toLowerCase();
                const savingsGainEl = document.getElementById(`savings-gain-${typeKey}`);
                const netSavingsEl = document.getElementById(`net-savings-${typeKey}`);
                if (savingsGainEl) savingsGainEl.textContent = `+${formatCurrency(r.savingsGain)}`;
                if (netSavingsEl) {
                    netSavingsEl.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${formatCurrency(r.netVsSavings)}`;
                    netSavingsEl.className = `font-medium ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;
                }

                if (r.annualizedReturn === null) {
                    if (annEl) { annEl.textContent = 'N/A'; annEl.className = 'font-bold text-slate-400'; }
                } else {
                    if (annEl) {
                        annEl.textContent = `${r.annualizedReturn >= 0 ? '+' : ''}${r.annualizedReturn.toFixed(2)}%`;
                        annEl.className = `font-bold ${r.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                    }
                }
            };
```

- [ ] **Step 8: Replace inline `parseInvestmentCSV` and `generateInvestmentCSV`**

Find `const parseInvestmentCSV = (text) => { ... }` (lines ~1601–1638) and replace with:

```js
            const parseInvestmentCSV = (text) => _parseInvestmentCSV(text);
```

Find `const generateInvestmentCSV = () => { ... }` (lines ~1640–1659) and replace with:

```js
            const generateInvestmentCSV = () => _generateInvestmentCSV(investmentData);
```

- [ ] **Step 9: Replace `calculateDebtProjection`**

Find the entire `calculateDebtProjection` function (lines ~1729–1950) and replace it:

```js
            const calculateDebtProjection = () => {
                const currentPrincipal = parseFloat(debtCurrentBalanceInput.value) || parseFloat(debtAmountInput.value) || 0;
                const totalRepayment = parseFloat(debtRepaymentInput.value) || 0;
                const serviceFee = parseFloat(debtServiceFeeInput.value) || 0;
                const interestRate = parseFloat(debtInterestRateInput.value) || 0;
                const nextPaymentDateStr = debtNextPaymentInput.value;

                if (currentPrincipal <= 0 || totalRepayment <= 0 || !nextPaymentDateStr) return;

                const dailyRate = (interestRate / 100) / 365;
                const effectiveRepayment = totalRepayment - serviceFee;

                // Guard: repayment must exceed one month's interest
                const npd = new Date(nextPaymentDateStr);
                const guardFactor = _monthlyInterestFactor(dailyRate, npd.getFullYear(), npd.getMonth());
                if (effectiveRepayment <= (currentPrincipal * guardFactor)) {
                    debtSavedAmountEl.textContent = 'N/A';
                    debtTimeReducedEl.textContent = 'Never';
                    debtNewEndDateEl.textContent = 'Never';
                    debtOriginalEndDateEl.textContent = 'Original: Never';
                    return;
                }

                const { moneySaved, diffMonths, totalExtra, baseline, actual } = _calculateDebtResults({
                    currentPrincipal, totalRepayment, serviceFee, interestRate,
                    nextPaymentDateStr, repayments: debtData.repayments,
                });

                debtTotalExtraEl.textContent = formatCurrency(totalExtra);

                debtSavedAmountEl.textContent = formatCurrency(moneySaved);
                debtSavedAmountEl.className = moneySaved >= 0 ? 'text-lg font-bold text-green-600' : 'text-lg font-bold text-red-600';

                debtNetReturnEl.textContent = formatCurrency(moneySaved);
                debtNetReturnEl.className = moneySaved >= 0 ? 'text-lg font-bold text-indigo-600' : 'text-lg font-bold text-orange-600';

                if (diffMonths > 0) {
                    const diffY = Math.floor(diffMonths / 12);
                    const diffM = diffMonths % 12;
                    debtTimeReducedEl.textContent = `${diffY}y ${diffM}m`;
                } else {
                    debtTimeReducedEl.textContent = '0 Months';
                }

                // XIRR: build cash flows and compute yield
                const cashFlows = [];
                debtData.repayments.forEach(rep => {
                    if (rep.amount > 0 && rep.date) {
                        cashFlows.push({ amount: -parseFloat(rep.amount), date: new Date(rep.date) });
                    }
                });

                if (cashFlows.length > 0 && diffMonths > 0) {
                    let flowDate = new Date(actual.endDate);
                    flowDate.setMonth(flowDate.getMonth() + 1);
                    const endDate = new Date(baseline.endDate);
                    while (flowDate <= endDate) {
                        cashFlows.push({ amount: totalRepayment, date: new Date(flowDate) });
                        flowDate.setMonth(flowDate.getMonth() + 1);
                    }
                    try {
                        cashFlows.sort((a, b) => a.date - b.date);
                        if (cashFlows.length > 0) {
                            const rate = _xirr(cashFlows);
                            debtYieldEl.textContent = `${(rate * 100).toFixed(2)}%`;
                        } else {
                            debtYieldEl.textContent = '0.00%';
                        }
                    } catch (e) {
                        debtYieldEl.textContent = 'N/A';
                    }
                } else {
                    debtYieldEl.textContent = '0.00%';
                }

                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                debtNewEndDateEl.textContent = actual.endDate.toLocaleDateString('en-ZA', options);

                const loanStartStr = debtLoanStartInput.value;
                const originalTerm = parseInt(debtOriginalTermInput.value) || 0;
                if (loanStartStr && originalTerm > 0) {
                    const origEnd = new Date(loanStartStr);
                    origEnd.setMonth(origEnd.getMonth() + originalTerm);
                    debtOriginalEndDateEl.textContent = `Original: ${origEnd.toLocaleDateString('en-ZA', options)}`;
                } else {
                    debtOriginalEndDateEl.textContent = `Original: ${baseline.endDate.toLocaleDateString('en-ZA', options)}`;
                }
            };
```

- [ ] **Step 10: Replace inline `parseDebtCSV` and `generateDebtCSV`**

Find `const parseDebtCSV = (text) => { ... }` (lines ~2065–2096) and replace with:

```js
            const parseDebtCSV = (text) => _parseDebtCSV(text);
```

Find `const generateDebtCSV = () => { ... }` (lines ~2098–2117) and replace with:

```js
            const generateDebtCSV = () => {
                const params = {
                    principal: debtAmountInput.value,
                    current_balance: debtCurrentBalanceInput.value,
                    repayment: debtRepaymentInput.value,
                    service_fee: debtServiceFeeInput.value,
                    interest_rate: debtInterestRateInput.value,
                    next_payment: debtNextPaymentInput.value,
                    loan_start: debtLoanStartInput.value,
                    original_term: debtOriginalTermInput.value,
                };
                return _generateDebtCSV(debtData.repayments, params);
            };
```

- [ ] **Step 11: Open the app in a browser and manually verify the three tabs work**

Start the server:
```bash
make start
```

Open `http://localhost:8000` and verify:
- Budget tab loads and recalculates summary when values change
- Investments tab loads and shows performance metrics
- Debt tab loads and shows projection results

No console errors should appear.

- [ ] **Step 12: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests still pass

- [ ] **Step 13: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: wire HTML to import and use calculations.js pure functions"
```
