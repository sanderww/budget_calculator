# SARS CGT Estimate on Discretionary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable marginal-tax-rate input and an estimated CGT line + net-vs-savings-after-tax line on the Discretionary investment card.

**Architecture:** Extend the pure functions in `src/calculations.js` (calculation + CSV serialization) with TDD against vitest. Then wire a small numeric input and two new display rows into the existing Discretionary card in `src/budget_calculator.html`, persisted via a `param` row in `db/investments.csv` (same convention used for debt).

**Tech Stack:** Vanilla JS (ES modules), Tailwind via CDN, vitest for unit tests.

**Spec:** [`docs/superpowers/specs/2026-04-25-cgt-on-discretionary-design.md`](../specs/2026-04-25-cgt-on-discretionary-design.md)

---

## Task 1: Extend `calculateInvestmentPerformance` with marginal-rate-based CGT

**Files:**
- Modify: `src/calculations.js:65-113`
- Test: `tests/calculations.test.js`

- [ ] **Step 1: Find the existing `describe('calculateInvestmentPerformance', ...)` block**

Run: `grep -n "calculateInvestmentPerformance" tests/calculations.test.js`

You'll add new `it(...)` cases inside that block (or create the block if it doesn't yet exist). All other tests should remain untouched.

- [ ] **Step 2: Write the failing tests**

Add these cases inside the existing `describe('calculateInvestmentPerformance', ...)` block in `tests/calculations.test.js`:

```javascript
it('returns zero estimatedTax when marginalRate is omitted', () => {
    const txs = [{ amount: 10000, date: '2024-01-01', type: 'Discretionary' }];
    const r = calculateInvestmentPerformance(txs, 110000, new Date('2026-04-25'));
    expect(r.estimatedTax).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
});

it('returns zero estimatedTax when gain is below the R40k annual exclusion', () => {
    const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
    const r = calculateInvestmentPerformance(txs, 130000, new Date('2026-04-25'), 41);
    // gain = 30,000 < 40,000 exclusion
    expect(r.taxableGain).toBe(0);
    expect(r.estimatedTax).toBe(0);
    expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
});

it('calculates estimatedTax using 40% inclusion rate above the R40k exclusion', () => {
    const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
    const r = calculateInvestmentPerformance(txs, 200000, new Date('2026-04-25'), 41);
    // gain = 100,000; taxable = 60,000; included = 24,000; tax = 24,000 * 0.41 = 9,840
    expect(r.taxableGain).toBe(60000);
    expect(r.estimatedTax).toBeCloseTo(9840, 6);
    expect(r.netVsSavingsAfterTax).toBeCloseTo(r.netVsSavings - 9840, 6);
});

it('returns zero estimatedTax when there is a loss', () => {
    const txs = [{ amount: 100000, date: '2024-01-01', type: 'Discretionary' }];
    const r = calculateInvestmentPerformance(txs, 80000, new Date('2026-04-25'), 41);
    expect(r.taxableGain).toBe(0);
    expect(r.estimatedTax).toBe(0);
    expect(r.netVsSavingsAfterTax).toBe(r.netVsSavings);
});

it('returns zero estimatedTax when totalInvested is 0', () => {
    const r = calculateInvestmentPerformance([], 0, new Date('2026-04-25'), 41);
    expect(r.taxableGain).toBe(0);
    expect(r.estimatedTax).toBe(0);
    expect(r.netVsSavingsAfterTax).toBe(0);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm test -- calculations.test.js`

Expected: the five new tests fail (e.g. `expect(r.estimatedTax).toBe(0)` fails because `r.estimatedTax` is `undefined`).

- [ ] **Step 4: Implement the new behaviour in `calculateInvestmentPerformance`**

Replace the entire `calculateInvestmentPerformance` function (`src/calculations.js:65-113`) with:

```javascript
export function calculateInvestmentPerformance(transactions, currentValue, today = new Date(), marginalRate = 0) {
    const totalInvested = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalCryptoValue = transactions.reduce((sum, t) => sum + (parseFloat(t.cryptoValue) || 0), 0);

    if (totalInvested === 0) {
        return { totalInvested: 0, totalCryptoValue: 0, absoluteReturn: 0, percentageReturn: 0, savingsGain: 0, netVsSavings: 0, taxableGain: 0, estimatedTax: 0, netVsSavingsAfterTax: 0, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
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

    const ANNUAL_EXCLUSION = 40000;
    const INCLUSION_RATE = 0.40;
    const rate = parseFloat(marginalRate) || 0;
    const taxableGain = (absoluteReturn > 0 && rate > 0) ? Math.max(0, absoluteReturn - ANNUAL_EXCLUSION) : 0;
    const estimatedTax = taxableGain * INCLUSION_RATE * (rate / 100);
    const netVsSavingsAfterTax = netVsSavings - estimatedTax;

    if (validTxCount === 0 || weightedAgeSum === 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays: null, yearsHeld: null, annualizedReturn: null };
    }

    const averageAgeDays = weightedAgeSum / totalInvested;
    const yearsHeld = averageAgeDays / 365.25;

    if (yearsHeld <= 0.1) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const ratio = currentValue / totalInvested;
    if (ratio <= 0) {
        return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn: null };
    }

    const annualizedReturn = (Math.pow(ratio, 1 / yearsHeld) - 1) * 100;
    return { totalInvested, totalCryptoValue, absoluteReturn, percentageReturn, savingsGain, netVsSavings, taxableGain, estimatedTax, netVsSavingsAfterTax, averageAgeDays, yearsHeld, annualizedReturn };
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: all tests pass — both the new ones and every pre-existing test.

- [ ] **Step 6: Commit**

```bash
git add src/calculations.js tests/calculations.test.js
git commit -m "Add CGT estimate to calculateInvestmentPerformance"
```

---

## Task 2: Parse `marginal_rate` param row from investments CSV

**Files:**
- Modify: `src/calculations.js:251-282` (function `parseInvestmentCSV`)
- Test: `tests/calculations.test.js`

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe('parseInvestmentCSV', ...)` block in `tests/calculations.test.js` (find it via `grep -n "parseInvestmentCSV" tests/calculations.test.js`; create the block if it doesn't exist yet, importing `parseInvestmentCSV` is already done at the top of the file):

```javascript
it('defaults marginalRate to 41 when no param row is present', () => {
    const csv = [
        'Date,Description,amount,account type,crypto_value',
        '15-01-2025,Stock,2000,Discretionary,',
        'current_value,Discretionary,2050,',
    ].join('\n');
    const r = parseInvestmentCSV(csv);
    expect(r.marginalRate).toBe(41);
});

it('parses the marginal_rate param row when present', () => {
    const csv = [
        'Date,Description,amount,account type,crypto_value',
        '15-01-2025,Stock,2000,Discretionary,',
        'current_value,Discretionary,2050,',
        'param,marginal_rate,36,',
    ].join('\n');
    const r = parseInvestmentCSV(csv);
    expect(r.marginalRate).toBe(36);
});

it('does not treat a param row as a transaction', () => {
    const csv = [
        'Date,Description,amount,account type,crypto_value',
        '15-01-2025,Stock,2000,Discretionary,',
        'param,marginal_rate,36,',
    ].join('\n');
    const r = parseInvestmentCSV(csv);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].description).toBe('Stock');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- calculations.test.js`

Expected: all three new tests fail (`r.marginalRate` is `undefined`; the third may also pass for the wrong reason — verify it fails because of the assertion on count or description).

- [ ] **Step 3: Update `parseInvestmentCSV` to recognise `param` rows**

Replace the body of `parseInvestmentCSV` in `src/calculations.js` with:

```javascript
export function parseInvestmentCSV(text) {
    const rows = text.split('\n').filter(row => row.trim() !== '');
    const contentRows = rows.slice(1);
    const transactions = [];
    const currentValues = { Discretionary: 0, TFSA: 0, Crypto: 0 };
    let marginalRate = 41;

    contentRows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] === 'current_value') {
            const type = cols[1];
            const amount = parseFloat(cols[2]) || 0;
            if (Object.prototype.hasOwnProperty.call(currentValues, type)) {
                currentValues[type] = amount;
            }
        } else if (cols[0] === 'param') {
            if (cols[1] === 'marginal_rate') {
                const v = parseFloat(cols[2]);
                if (!Number.isNaN(v)) marginalRate = v;
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
    return { transactions, currentValues, marginalRate };
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/calculations.js tests/calculations.test.js
git commit -m "Parse marginal_rate param row in investment CSV"
```

---

## Task 3: Write `marginal_rate` param row in generated investment CSV

**Files:**
- Modify: `src/calculations.js:284-298` (function `generateInvestmentCSV`)
- Test: `tests/calculations.test.js`

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe('generateInvestmentCSV', ...)` block (or create it):

```javascript
it('emits a marginal_rate param row using data.marginalRate', () => {
    const data = {
        transactions: [],
        currentValues: { Discretionary: 0, TFSA: 0, Crypto: 0 },
        marginalRate: 36,
    };
    const csv = generateInvestmentCSV(data);
    expect(csv).toMatch(/^param,marginal_rate,36,$/m);
});

it('defaults to 41 when marginalRate is missing on data', () => {
    const data = {
        transactions: [],
        currentValues: { Discretionary: 0, TFSA: 0, Crypto: 0 },
    };
    const csv = generateInvestmentCSV(data);
    expect(csv).toMatch(/^param,marginal_rate,41,$/m);
});

it('round-trips marginalRate through generate -> parse', () => {
    const data = {
        transactions: [{ id: 'x', date: '2025-01-15', description: 'Stock', amount: 2000, type: 'Discretionary', cryptoValue: '' }],
        currentValues: { Discretionary: 2050, TFSA: 0, Crypto: 0 },
        marginalRate: 31,
    };
    const csv = generateInvestmentCSV(data);
    const parsed = parseInvestmentCSV(csv);
    expect(parsed.marginalRate).toBe(31);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- calculations.test.js`

Expected: all three new tests fail because `generateInvestmentCSV` does not emit a `param,marginal_rate,...` row.

- [ ] **Step 3: Update `generateInvestmentCSV` to emit the param row**

Replace `generateInvestmentCSV` in `src/calculations.js` with:

```javascript
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
    const rate = (data.marginalRate === undefined || data.marginalRate === null || Number.isNaN(parseFloat(data.marginalRate)))
        ? 41
        : parseFloat(data.marginalRate);
    csv += `param,marginal_rate,${rate},\n`;
    return csv;
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/calculations.js tests/calculations.test.js
git commit -m "Emit marginal_rate param row in generated investment CSV"
```

---

## Task 4: Add the marginal-rate input + tax display rows to the Discretionary card

**Files:**
- Modify: `src/budget_calculator.html:498-534` (Discretionary card markup)

- [ ] **Step 1: Locate the Discretionary card block**

Run: `grep -n "Discretionary" src/budget_calculator.html | head -5`

The card runs from line ~498 (`<!-- Discretionary -->`) to line ~534 (closing `</div>` of the card).

- [ ] **Step 2: Replace the Discretionary card markup**

In `src/budget_calculator.html`, replace the entire Discretionary card block (the one starting with `<!-- Discretionary -->` through the matching closing `</div>` before `<!-- TFSA -->`) with:

```html
                                <!-- Discretionary -->
                                <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <h3 class="font-semibold text-slate-700 mb-2">Discretionary</h3>
                                    <div class="mb-2">
                                        <label class="text-xs text-slate-500">Current Value</label>
                                        <div class="relative">
                                            <span class="currency-prefix text-xs">R</span>
                                            <input type="number" id="val-discretionary"
                                                class="input-field amount-input text-sm font-bold" placeholder="0.00">
                                        </div>
                                    </div>
                                    <div class="mb-2">
                                        <label class="text-xs text-slate-500">Marginal tax rate (%)</label>
                                        <input type="number" id="marginal-rate-discretionary"
                                            class="input-field text-sm font-bold" placeholder="41" min="0" max="100" step="1">
                                    </div>
                                    <div class="text-xs text-slate-500">Invested: <span id="inv-discretionary"
                                            class="font-medium text-slate-700">R 0.00</span></div>
                                    <div class="text-xs text-slate-500">Gain/Loss (R): <span
                                            id="gain-money-discretionary" class="font-medium text-slate-700">R
                                            0.00</span></div>
                                    <div class="flex justify-between items-end mt-2">
                                        <div>
                                            <div class="text-xs text-slate-500">Gain/Loss</div>
                                            <div id="gain-discretionary" class="font-bold text-slate-800">0.00%</div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-xs text-slate-500">Annualized</div>
                                            <div id="ann-discretionary" class="font-bold text-slate-800">0.00%</div>
                                        </div>
                                    </div>
                                    <div class="mt-2 pt-2 border-t border-slate-200 space-y-0.5">
                                        <div class="flex justify-between text-xs text-slate-400">
                                            <span>6% savings would be</span>
                                            <span id="savings-gain-discretionary">R 0.00</span>
                                        </div>
                                        <div class="flex justify-between text-xs text-slate-500">
                                            <span>Net vs savings</span>
                                            <span id="net-savings-discretionary" class="font-medium">R 0.00</span>
                                        </div>
                                        <div class="flex justify-between text-xs text-slate-500">
                                            <span>Estimated tax (CGT)</span>
                                            <span id="tax-discretionary" class="font-medium text-red-500">R 0.00</span>
                                        </div>
                                        <div class="flex justify-between text-xs text-slate-500">
                                            <span>Net vs savings (after tax)</span>
                                            <span id="net-savings-after-tax-discretionary" class="font-medium">R 0.00</span>
                                        </div>
                                    </div>
                                </div>
```

- [ ] **Step 3: Open the page and confirm the input + new rows render**

Run: `python3 -m http.server 8000` (if a server is not already running) and open `http://localhost:8000/src/budget_calculator.html` in a browser. Navigate to the Investments tab.

Expected: The Discretionary card shows a new "Marginal tax rate (%)" input below "Current Value", and two new rows ("Estimated tax (CGT)" and "Net vs savings (after tax)") appear at the bottom of the card. Values will all show `R 0.00` until Task 5 wires them up — that's fine for now. TFSA and Crypto cards look identical to before.

- [ ] **Step 4: Commit**

```bash
git add src/budget_calculator.html
git commit -m "Add marginal-rate input and CGT rows to Discretionary card"
```

---

## Task 5: Wire the marginal-rate input and tax display into the JS state

**Files:**
- Modify: `src/budget_calculator.html:1212-1219` (initial state)
- Modify: `src/budget_calculator.html:1227-1264` (DOM lookups + render)
- Modify: `src/budget_calculator.html:1334-1392` (`calculatePerformance`)
- Modify: `src/budget_calculator.html:1453-1462` (input event wiring)
- Modify: `src/budget_calculator.html:1474-1497` (CSV load handlers)

- [ ] **Step 1: Add `marginalRate` to the initial `investmentData` state**

Replace the `investmentData` initialiser block (around line 1212-1219) with:

```javascript
            let investmentData = {
                transactions: [],
                currentValues: {
                    Discretionary: 0,
                    TFSA: 0,
                    Crypto: 0
                },
                marginalRate: 41
            };
```

- [ ] **Step 2: Look up the new input element and include it in the render**

Find the block (around line 1226-1229):

```javascript
            // Inputs for current values
            const valDiscretionary = document.getElementById('val-discretionary');
            const valTfsa = document.getElementById('val-tfsa');
            const valCrypto = document.getElementById('val-crypto');
```

Replace it with:

```javascript
            // Inputs for current values
            const valDiscretionary = document.getElementById('val-discretionary');
            const valTfsa = document.getElementById('val-tfsa');
            const valCrypto = document.getElementById('val-crypto');
            const marginalRateInput = document.getElementById('marginal-rate-discretionary');
```

- [ ] **Step 3: Populate the input from state in `renderFullInvestmentUI`**

Find `renderFullInvestmentUI` (around line 1257) and replace it with:

```javascript
            const renderFullInvestmentUI = () => {
                // Update Inputs from State
                valDiscretionary.value = investmentData.currentValues.Discretionary || '';
                valTfsa.value = investmentData.currentValues.TFSA || '';
                valCrypto.value = investmentData.currentValues.Crypto || '';
                marginalRateInput.value = (investmentData.marginalRate ?? 41);

                renderTransactions();
                updatePerformanceDisplay();
            };
```

- [ ] **Step 4: Pass `marginalRate` only for Discretionary and render the new rows**

Replace `updatePerformanceDisplay` (around line 1231) with:

```javascript
            const updatePerformanceDisplay = () => {
                calculatePerformance('Discretionary', investmentData.currentValues.Discretionary, 'inv-discretionary', 'gain-discretionary', 'ann-discretionary', 'gain-money-discretionary');
                calculatePerformance('TFSA', investmentData.currentValues.TFSA, 'inv-tfsa', 'gain-tfsa', 'ann-tfsa', 'gain-money-tfsa');
                calculatePerformance('Crypto', investmentData.currentValues.Crypto, 'inv-crypto', 'gain-crypto', 'ann-crypto', 'gain-money-crypto');
            };
```

(unchanged — it stays the same; the Discretionary-only behaviour lives inside `calculatePerformance`).

Now replace the entire `calculatePerformance` function (around line 1334-1392) with:

```javascript
            const calculatePerformance = (type, currentValueStr, invId, gainId, annId, moneyGainId) => {
                const currentValue = parseFloat(currentValueStr) || 0;
                const txs = investmentData.transactions.filter(t => t.type === type);

                const rate = (type === 'Discretionary') ? (parseFloat(investmentData.marginalRate) || 0) : 0;
                const r = _calculateInvestmentPerformance(txs, currentValue, new Date(), rate);

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

                const typeKey = type.toLowerCase();
                const taxEl = document.getElementById(`tax-${typeKey}`);
                const netAfterTaxEl = document.getElementById(`net-savings-after-tax-${typeKey}`);

                if (r.totalInvested === 0) {
                    gainEl.textContent = '0.00%';
                    gainEl.className = 'font-bold text-slate-800';
                    if (annEl) { annEl.textContent = '0.00%'; annEl.className = 'font-bold text-slate-800'; }
                    if (moneyGainEl) { moneyGainEl.textContent = 'R 0.00'; moneyGainEl.className = 'font-bold text-slate-800'; }
                    const sg0 = document.getElementById(`savings-gain-${typeKey}`);
                    const ns0 = document.getElementById(`net-savings-${typeKey}`);
                    if (sg0) sg0.textContent = 'R 0.00';
                    if (ns0) { ns0.textContent = 'R 0.00'; ns0.className = 'font-medium'; }
                    if (taxEl) { taxEl.textContent = 'R 0.00'; taxEl.className = 'font-medium text-red-500'; }
                    if (netAfterTaxEl) { netAfterTaxEl.textContent = 'R 0.00'; netAfterTaxEl.className = 'font-medium'; }
                    return;
                }

                gainEl.textContent = `${r.percentageReturn >= 0 ? '+' : ''}${r.percentageReturn.toFixed(2)}%`;
                gainEl.className = `font-bold ${r.percentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;

                if (moneyGainEl) {
                    moneyGainEl.textContent = `${r.absoluteReturn >= 0 ? '+' : ''}${formatCurrency(r.absoluteReturn)}`;
                    moneyGainEl.className = `font-bold ${r.absoluteReturn >= 0 ? 'text-green-600' : 'text-red-600'}`;
                }

                const savingsGainEl = document.getElementById(`savings-gain-${typeKey}`);
                const netSavingsEl = document.getElementById(`net-savings-${typeKey}`);
                if (savingsGainEl) savingsGainEl.textContent = `+${formatCurrency(r.savingsGain)}`;
                if (netSavingsEl) {
                    netSavingsEl.textContent = `${r.netVsSavings >= 0 ? '+' : ''}${formatCurrency(r.netVsSavings)}`;
                    netSavingsEl.className = `font-medium ${r.netVsSavings >= 0 ? 'text-green-600' : 'text-red-500'}`;
                }

                if (taxEl) {
                    taxEl.textContent = r.estimatedTax > 0 ? `-${formatCurrency(r.estimatedTax)}` : 'R 0.00';
                    taxEl.className = 'font-medium text-red-500';
                }
                if (netAfterTaxEl) {
                    netAfterTaxEl.textContent = `${r.netVsSavingsAfterTax >= 0 ? '+' : ''}${formatCurrency(r.netVsSavingsAfterTax)}`;
                    netAfterTaxEl.className = `font-medium ${r.netVsSavingsAfterTax >= 0 ? 'text-green-600' : 'text-red-500'}`;
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

- [ ] **Step 5: Wire the input change handler**

Find the existing listener block (around line 1453):

```javascript
            [valDiscretionary, valTfsa, valCrypto].forEach(input => {
                input.addEventListener('input', (e) => {
                    const id = e.target.id;
                    if (id === 'val-discretionary') investmentData.currentValues.Discretionary = e.target.value;
                    if (id === 'val-tfsa') investmentData.currentValues.TFSA = e.target.value;
                    if (id === 'val-crypto') investmentData.currentValues.Crypto = e.target.value;
                    updatePerformanceDisplay();
                    debouncedSave('investments', generateInvestmentCSV, 'save-inv-csv');
                });
            });
```

Add immediately after it:

```javascript
            marginalRateInput.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                investmentData.marginalRate = Number.isNaN(v) ? 0 : v;
                updatePerformanceDisplay();
                debouncedSave('investments', generateInvestmentCSV, 'save-inv-csv');
            });
```

- [ ] **Step 6: Carry `marginalRate` through the CSV load paths**

Find both load paths (around lines 1474-1477 and 1495-1497) — they currently do:

```javascript
                        investmentData.transactions = parsed.transactions;
                        investmentData.currentValues = parsed.currentValues;
```

Replace each occurrence with:

```javascript
                        investmentData.transactions = parsed.transactions;
                        investmentData.currentValues = parsed.currentValues;
                        investmentData.marginalRate = (parsed.marginalRate ?? 41);
```

(There are exactly two such blocks — one inside `loadInvestmentCSVFromServer`, one inside the `loadInvCsvBtn` click handler.)

- [ ] **Step 7: Manual verification in the browser**

Run: `python3 -m http.server 8000` (skip if already running) and open `http://localhost:8000/src/budget_calculator.html`. On the Investments tab, on the Discretionary card:

1. Enter a Current Value (e.g. `200000`) and confirm at least one Discretionary transaction exists with a total amount of `100000`. Set marginal rate to `41`.
   - Expected: `Estimated tax (CGT)` shows `-R 9,840.00`. `Net vs savings (after tax)` equals the displayed `Net vs savings` minus 9,840.
2. Lower the marginal rate to `0`.
   - Expected: tax row shows `R 0.00`; "Net vs savings (after tax)" equals "Net vs savings".
3. Set Current Value below total invested (e.g. invested 100000, current value 80000), rate 41.
   - Expected: tax row shows `R 0.00`; net-after-tax equals net-vs-savings (both negative).
4. Reload the page.
   - Expected: marginal rate input retains the value you set (it was saved to `db/investments.csv`).
5. Verify TFSA and Crypto cards show no behavioural change (no tax row appears on those cards because the markup wasn't added there).

- [ ] **Step 8: Commit**

```bash
git add src/budget_calculator.html
git commit -m "Wire marginal-rate input and CGT display rows on Discretionary card"
```

---

## Task 6: Add `marginal_rate` to the example investments CSV

**Files:**
- Modify: `db/examples/investments.csv`

- [ ] **Step 1: Read the current example file**

Run: `cat db/examples/investments.csv`

- [ ] **Step 2: Append the param row**

Edit `db/examples/investments.csv` so it ends with the additional line:

```
param,marginal_rate,41,
```

After editing, the full file should be:

```
Date,Description,amount,account type,crypto_value
01-01-2025,Example ETF,5000,TFSA,
15-01-2025,Example Stock,2000,Discretionary,
20-01-2025,Example Crypto,1000,Crypto,0.025
current_value,Discretionary,2050.00,
current_value,TFSA,5100.00,
current_value,Crypto,950,
param,marginal_rate,41,
```

- [ ] **Step 3: Verify the example loads cleanly**

Run: `cp db/examples/investments.csv /tmp/inv-test.csv && diff db/examples/investments.csv /tmp/inv-test.csv`

Expected: no diff. (Sanity check on the file contents.)

- [ ] **Step 4: Commit**

```bash
git add db/examples/investments.csv
git commit -m "Add marginal_rate param row to example investments CSV"
```

---

## Final verification

- [ ] Run the full test suite once more: `npm test`
  - Expected: every test passes; no `it.skip` or `it.todo` markers introduced.
- [ ] Open `src/budget_calculator.html` in the browser and walk through the manual verification list from Task 5, Step 7.
- [ ] `git log --oneline` shows the six commits from this plan, in order.
