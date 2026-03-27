# Debt Daily Interest Compounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the debt tab's simplified monthly interest (`annualRate / 12`) with daily-accurate compounding that matches the bank's actual calculation method (`annualRate / 365`, compounded over actual days per month).

**Architecture:** A `monthlyInterestFactor(year, month)` helper is introduced inside `calculateDebtProjection()`. It computes `(1 + dailyRate)^daysInMonth - 1` for the exact month being simulated. The static `monthlyRate` constant is removed and replaced with calls to this helper at every point interest is applied — in both the back-calculation loop and the forward simulation loop.

**Tech Stack:** Vanilla JavaScript (inline in `budget_calculator.html`), no build tools, no test framework.

---

### Task 1: Replace `monthlyRate` with daily-rate helper

**Files:**
- Modify: `budget_calculator.html:1723–1763`

- [ ] **Step 1: Replace the `monthlyRate` constant and add the daily-rate helper**

Find this block (lines 1723–1724):
```js
                const monthlyRate = (interestRate / 100) / 12;
                const effectiveRepayment = totalRepayment - serviceFee;
```

Replace with:
```js
                const dailyRate = (interestRate / 100) / 365;
                const monthlyInterestFactor = (year, month) => {
                    const days = new Date(year, month + 1, 0).getDate();
                    return Math.pow(1 + dailyRate, days) - 1;
                };
                const effectiveRepayment = totalRepayment - serviceFee;
```

- [ ] **Step 2: Update the "never pays off" guard check (line 1726)**

Find:
```js
                if (effectiveRepayment <= (currentPrincipal * monthlyRate)) {
```

Replace with (use next payment date month for the guard check):
```js
                const nextPaymentDate = new Date(nextPaymentDateStr);
                const guardFactor = monthlyInterestFactor(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth());
                if (effectiveRepayment <= (currentPrincipal * guardFactor)) {
```

- [ ] **Step 3: Update the back-calculation loop (line 1763)**

Find:
```js
                    simulatedBalance = (simulatedBalance + effectiveRepayment + monthlyExtra) / (1 + monthlyRate);
```

Replace with:
```js
                    const factor = monthlyInterestFactor(iterDate.getFullYear(), iterDate.getMonth());
                    simulatedBalance = (simulatedBalance + effectiveRepayment + monthlyExtra) / (1 + factor);
```

- [ ] **Step 4: Update the forward simulation interest lines (lines 1778–1780)**

Find:
```js
                        const interest = balance * monthlyRate;
                        totalInterest += interest;
                        balance += interest;
```

Replace with:
```js
                        const interest = balance * monthlyInterestFactor(simDate.getFullYear(), simDate.getMonth());
                        totalInterest += interest;
                        balance += interest;
```

- [ ] **Step 5: Verify no remaining references to `monthlyRate`**

Search the file for `monthlyRate` — there should be zero matches.

- [ ] **Step 6: Commit**

```bash
git add budget_calculator.html
git commit -m "feat: replace monthly interest rate with daily compounding (annualRate/365)"
```

---

### Task 2: Remove the UI disclaimer text

**Files:**
- Modify: `budget_calculator.html:801`

- [ ] **Step 1: Delete the disclaimer paragraph**

Find and remove this entire line:
```html
                                <p class="text-xs text-slate-400 mt-1">Uses monthly compounding (9.26%÷12). Your bank calculates interest daily, so projections may differ slightly.</p>
```

Replace with nothing (delete the line entirely).

- [ ] **Step 2: Commit**

```bash
git add budget_calculator.html
git commit -m "chore: remove outdated monthly compounding disclaimer from debt tab"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start the server**

```bash
make start
```
Open `http://localhost:8000` in a browser and navigate to the Debt tab.

- [ ] **Step 2: Verify the calculation against a known example**

With these inputs:
- Current balance: 500,000
- Annual interest rate: 9.26%
- Monthly repayment: 5,000
- Service fee: 0
- Next payment date: any upcoming month-start

For March (31 days): expected monthly interest factor = `(1 + 0.0926/365)^31 - 1 ≈ 0.007877` (≈ 0.7877%)
For February (28 days): expected monthly interest factor = `(1 + 0.0926/365)^28 - 1 ≈ 0.007115` (≈ 0.7115%)

Open browser DevTools console and run:
```js
const dailyRate = 0.0926 / 365;
console.log('March factor:', Math.pow(1 + dailyRate, 31) - 1);   // ~0.007877
console.log('Feb factor:',   Math.pow(1 + dailyRate, 28) - 1);   // ~0.007115
console.log('Old monthly:',  0.0926 / 12);                        // ~0.007717 (for comparison)
```

Confirm the projection loads without errors and produces a sensible end date and savings figure.

- [ ] **Step 3: Confirm disclaimer is gone**

Inspect the debt tab UI — the old "Uses monthly compounding…" text should not appear anywhere.
