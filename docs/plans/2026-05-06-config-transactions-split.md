# Config / Transactions Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `db/*.csv` files so transactions live under `db/transactions/`, configuration lives in `db/config.public.csv` (tracked in git) and `db/config.private.csv` (gitignored), and a migration script translates existing real CSVs into the new layout.

**Architecture:** Visibility classification (public/private) lives client-side as a static `PUBLIC_PARAMS` Set in `calculations.js`. The server is dumb storage — it just maps save keys to file paths. The HTML loads both config files at startup into one merged map and saves both files on every config change. Transaction CSVs lose their inline `param,*` rows. A standalone Python migration script translates old → new layout non-destructively. End-to-end verification happens first in test mode (seeded from `db/examples/`) before the user runs the migration script on real data.

**Tech Stack:** Vanilla JS (ES modules) + vitest, Python 3 + unittest, Python `http.server` for the dev server.

**Spec:** `docs/specs/2026-05-06-config-transactions-split-design.md`

---

## File Structure

### Files created

- `scripts/migrate_csv_layout.py` — one-shot migration script
- `scripts/test_migrate_csv_layout.py` — unittest tests for the migration script
- `db/examples/config.public.csv`
- `db/examples/config.private.csv`
- `db/examples/transactions/budget.csv`
- `db/examples/transactions/ra.csv`
- `db/examples/transactions/investments.csv`
- `db/examples/transactions/debt.csv`

### Files modified

- `src/calculations.js` — add `PUBLIC_PARAMS`, `parseConfigCSV`, `generateConfigCSV`, `generateRaTransactionsCSV`; modify `generateInvestmentCSV`, `generateDebtCSV`; remove `generateRaCSV`, `generateRetirementCSV` (parsers stay tolerant of the old shape so the migration script can still read it)
- `src/server.py` — extend `FILE_MAP` and `REAL_KEYS` for the new save keys
- `src/budget_calculator.html` — add config load/save layer; repoint transaction loaders; refactor RA & Retirement init into named loader functions; extend the test-mode toggle to reload config + RA + Retirement
- `tests/calculations.test.js` — new tests for config helpers; updates to existing investment/debt/RA tests that asserted on stripped `param,*` rows
- `.gitignore` — un-ignore `db/config.public.csv`; ignore `db/transactions/*.csv` (excluding examples)
- `docs/specs/core-requirements.md` — reflect the new file layout and visibility split
- `docs/specs/functional-requirements.md` — same

### Files removed (in implementation, not via migration script)

- `db/examples/investments.csv` — replaced by the new examples layout

---

## Task 1: Add `PUBLIC_PARAMS`, `parseConfigCSV`, `generateConfigCSV` to `calculations.js`

**Files:**
- Modify: `src/calculations.js` (append after the existing exports near the top, before the per-tab CSV functions)
- Test: `tests/calculations.test.js` (append a new `describe` block)

- [ ] **Step 1: Write the failing tests**

Append to `tests/calculations.test.js` after the final `describe` block (anywhere, but keep it grouped with the other parser tests). Also extend the import block at the top to include the three new symbols.

Add to the import block at the top of the test file (it already imports many names from `'../src/calculations.js'`):

```js
    PUBLIC_PARAMS,
    parseConfigCSV,
    generateConfigCSV,
```

Append at the end of the file:

```js
describe('PUBLIC_PARAMS', () => {
    it('contains exactly the 13 public params from the design', () => {
        const expected = new Set([
            'life_expectancy',
            'lump_sum_drawdown_return_pct',
            'withdrawal_rate_pct',
            'cpi_pct',
            'return_discretionary_pct',
            'return_tfsa_pct',
            'return_crypto_pct',
            'return_ra_pct',
            'offshore_discretionary_pct',
            'offshore_tfsa_pct',
            'zar_depreciation_pct',
            'ra_savings_component_pct',
            'nominal_return_pct',
        ]);
        expect(PUBLIC_PARAMS instanceof Set).toBe(true);
        expect(PUBLIC_PARAMS.size).toBe(expected.size);
        for (const k of expected) expect(PUBLIC_PARAMS.has(k)).toBe(true);
    });
});

describe('parseConfigCSV', () => {
    it('parses param rows into a flat map with numeric coercion', () => {
        const csv = [
            'param,return_ra_pct,10,',
            'param,cpi_pct,5,',
        ].join('\n');
        const map = parseConfigCSV(csv);
        expect(map).toEqual({ return_ra_pct: 10, cpi_pct: 5 });
    });

    it('preserves dob as a string (does not coerce to number)', () => {
        const csv = 'param,dob,1985-08-08,';
        expect(parseConfigCSV(csv)).toEqual({ dob: '1985-08-08' });
    });

    it('ignores non-param rows and blank lines', () => {
        const csv = [
            'header,row,here',
            '',
            'param,cpi_pct,5,',
            'random,thing,1',
        ].join('\n');
        expect(parseConfigCSV(csv)).toEqual({ cpi_pct: 5 });
    });

    it('returns an empty map for empty input', () => {
        expect(parseConfigCSV('')).toEqual({});
        expect(parseConfigCSV(null)).toEqual({});
    });
});

describe('generateConfigCSV', () => {
    it('emits only public params when public:true', () => {
        const map = { cpi_pct: 5, dob: '1985-08-08', return_ra_pct: 10 };
        const csv = generateConfigCSV(map, { public: true });
        expect(csv).toMatch(/^param,cpi_pct,5,$/m);
        expect(csv).toMatch(/^param,return_ra_pct,10,$/m);
        expect(csv).not.toMatch(/dob/);
    });

    it('emits only private params when public:false', () => {
        const map = { cpi_pct: 5, dob: '1985-08-08', return_ra_pct: 10 };
        const csv = generateConfigCSV(map, { public: false });
        expect(csv).toMatch(/^param,dob,1985-08-08,$/m);
        expect(csv).not.toMatch(/cpi_pct/);
        expect(csv).not.toMatch(/return_ra_pct/);
    });

    it('round-trips through parseConfigCSV', () => {
        const map = { cpi_pct: 5, return_ra_pct: 10 };
        const csv = generateConfigCSV(map, { public: true });
        expect(parseConfigCSV(csv)).toEqual(map);
    });

    it('emits keys in a stable sorted order', () => {
        const csv = generateConfigCSV(
            { return_ra_pct: 10, cpi_pct: 5 },
            { public: true },
        );
        const order = csv.trim().split('\n').map(l => l.split(',')[1]);
        expect(order).toEqual(['cpi_pct', 'return_ra_pct']);
    });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- --reporter=verbose tests/calculations.test.js`
Expected: the four new `describe` blocks fail because `PUBLIC_PARAMS`, `parseConfigCSV`, and `generateConfigCSV` are not exported.

- [ ] **Step 3: Implement `PUBLIC_PARAMS` and the two helpers in `src/calculations.js`**

Insert at the top of `src/calculations.js`, just after the `_generateId` declaration on line 2:

```js
export const PUBLIC_PARAMS = new Set([
    'life_expectancy',
    'lump_sum_drawdown_return_pct',
    'withdrawal_rate_pct',
    'cpi_pct',
    'return_discretionary_pct',
    'return_tfsa_pct',
    'return_crypto_pct',
    'return_ra_pct',
    'offshore_discretionary_pct',
    'offshore_tfsa_pct',
    'zar_depreciation_pct',
    'ra_savings_component_pct',
    'nominal_return_pct',
]);

export function parseConfigCSV(text) {
    const map = {};
    const rows = (text || '').split('\n').map(r => r.trim()).filter(r => r !== '');
    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] !== 'param') return;
        const key = cols[1];
        const raw = cols[2];
        if (!key || raw === undefined) return;
        if (key === 'dob') {
            map[key] = raw;
            return;
        }
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) map[key] = v;
    });
    return map;
}

export function generateConfigCSV(map, opts) {
    const wantPublic = !!(opts && opts.public);
    const keys = Object.keys(map || {})
        .filter(k => PUBLIC_PARAMS.has(k) === wantPublic)
        .sort();
    let csv = '';
    keys.forEach(k => {
        csv += `param,${k},${map[k]},\n`;
    });
    return csv;
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npm test -- --reporter=verbose tests/calculations.test.js`
Expected: all `PUBLIC_PARAMS`, `parseConfigCSV`, `generateConfigCSV` tests pass.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: 0 failures. The pre-existing 138 tests should all still pass.

- [ ] **Step 6: Commit**

```bash
git add src/calculations.js tests/calculations.test.js
git commit -m "$(cat <<'EOF'
feat(config): add PUBLIC_PARAMS allowlist + parse/generate helpers

Introduces the visibility-aware config layer that will replace
inline param,* rows in transaction CSVs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Strip param emission from existing generators; add `generateRaTransactionsCSV`; remove `generateRaCSV` and `generateRetirementCSV`

This task changes generator behaviour but leaves parsers tolerant of the old shape (so the migration script can still read legacy files).

**Files:**
- Modify: `src/calculations.js` (lines around `generateInvestmentCSV` ~297, `generateDebtCSV` ~340, `generateRaCSV` ~390, `generateRetirementCSV` ~846)
- Modify: `tests/calculations.test.js` (existing investment/debt round-trip tests + smoke test imports)

- [ ] **Step 1: Update existing investment/debt tests to expect the new generator shapes**

The tests that assert `param,marginal_rate,...` is emitted by `generateInvestmentCSV`, and the debt round-trip that asserts params survive through generate→parse, must be replaced.

In `tests/calculations.test.js`, replace the four investment param-related tests (the block around lines 482–537 that begins `it('defaults marginalRate to 41 when no param row is present', ...)` through the `'round-trips marginalRate through generate -> parse'` test) with these:

```js
        it('parseInvestmentCSV still reads a marginal_rate param row when present (legacy CSVs)', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'current_value,Discretionary,2050,',
                'param,marginal_rate,36,',
            ].join('\n');
            const r = parseInvestmentCSV(csv);
            expect(r.marginalRate).toBe(36);
        });

        it('parseInvestmentCSV defaults marginalRate to 41 when no param row is present', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'current_value,Discretionary,2050,',
            ].join('\n');
            expect(parseInvestmentCSV(csv).marginalRate).toBe(41);
        });

        it('parseInvestmentCSV does not treat a param row as a transaction', () => {
            const csv = [
                'Date,Description,amount,account type,crypto_value',
                '15-01-2025,Stock,2000,Discretionary,',
                'param,marginal_rate,36,',
            ].join('\n');
            const r = parseInvestmentCSV(csv);
            expect(r.transactions).toHaveLength(1);
            expect(r.transactions[0].description).toBe('Stock');
        });

        it('generateInvestmentCSV emits no param rows', () => {
            const data = {
                transactions: [{ id: 'x', date: '2025-01-15', description: 'Stock', amount: 2000, type: 'Discretionary', cryptoValue: '' }],
                currentValues: { Discretionary: 2050, TFSA: 0, Crypto: 0 },
                marginalRate: 31,
            };
            const csv = generateInvestmentCSV(data);
            expect(csv).not.toMatch(/^param,/m);
        });
```

In the same file, replace the debt round-trip test (around lines 547–569) with this:

```js
    describe('debt', () => {
        it('round-trips debt repayments only (no param rows)', () => {
            const repayments = [{ id: 'x1', date: '2026-02-15', description: 'Bonus', amount: 5000 }];
            const csv = generateDebtCSV(repayments);
            const parsed = parseDebtCSV(csv);
            expect(parsed.repayments).toHaveLength(1);
            expect(parsed.repayments[0].amount).toBe(5000);
            expect(parsed.repayments[0].description).toBe('Bonus');
            expect(csv).not.toMatch(/^param,/m);
        });

        it('parseDebtCSV still reads param rows for legacy CSVs', () => {
            const csv = [
                'Date,Description,Amount',
                'param,principal,500000',
                'param,interest_rate,11.25',
                '2026-02-15,Bonus,5000',
            ].join('\n');
            const parsed = parseDebtCSV(csv);
            expect(parsed.params.principal).toBe('500000');
            expect(parsed.params.interest_rate).toBe('11.25');
            expect(parsed.repayments).toHaveLength(1);
        });

        it('handles empty repayments list', () => {
            const csv = generateDebtCSV([]);
            const parsed = parseDebtCSV(csv);
            expect(parsed.repayments).toHaveLength(0);
        });
    });
```

Also locate the existing RA generator test in `describe('parseRaCSV', ...)` further down (look for any test that calls `generateRaCSV`) and update it to use the new function name `generateRaTransactionsCSV`. Run `grep -n "generateRaCSV\b" tests/calculations.test.js` first to find the spots; replace each call with the new name + signature `generateRaTransactionsCSV(transactions)`.

In the smoke `describe`, replace:
```js
        expect(typeof parseRetirementCSV).toBe('function');
        expect(typeof generateRetirementCSV).toBe('function');
```
with:
```js
        expect(typeof parseRetirementCSV).toBe('function');
        expect(typeof generateRaTransactionsCSV).toBe('function');
```
(removing the `generateRetirementCSV` line since the function is being deleted; adding the new name.)

Add `generateRaTransactionsCSV` to the import block at the top of the test file. Remove `generateRetirementCSV` and `generateRaCSV` from the import block if they are imported there.

- [ ] **Step 2: Run the updated tests to verify they fail**

Run: `npm test`
Expected: failures in the new investment / debt / smoke tests because (a) `generateInvestmentCSV` still emits `param,marginal_rate`, (b) `generateDebtCSV` still emits 8 param rows, (c) `generateRaTransactionsCSV` does not exist, (d) `generateRetirementCSV` is still exported.

- [ ] **Step 3: Update the generators in `src/calculations.js`**

Replace the body of `generateInvestmentCSV` (currently around lines 297–315) with:

```js
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
```

Replace `generateDebtCSV` (currently around lines 340–352) with the new single-argument version:

```js
export function generateDebtCSV(repayments) {
    let csv = 'Date,Description,Amount\n';
    (repayments || []).forEach(r => { csv += `${r.date},${r.description},${r.amount}\n`; });
    return csv;
}
```

Replace `generateRaCSV` (around lines 390–404) with the renamed function:

```js
export function generateRaTransactionsCSV(transactions) {
    let csv = '';
    (transactions || []).forEach(t => {
        csv += `${t.date},${t.description},${t.amount}\n`;
    });
    return csv;
}
```

Delete `generateRetirementCSV` (around lines 846–852) entirely. Leave `parseRetirementCSV` and `RETIREMENT_DEFAULT_PARAMS` and `getDefaultRetirementParams` in place — they are still used.

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: all tests pass. If any pre-existing test still references `generateRetirementCSV` or the old `generateDebtCSV(repayments, params)` two-argument call, fix them now (remove the second argument).

- [ ] **Step 5: Commit**

```bash
git add src/calculations.js tests/calculations.test.js
git commit -m "$(cat <<'EOF'
refactor(csv): strip param rows from transaction generators

generateInvestmentCSV and generateDebtCSV no longer emit param rows.
generateRaCSV is replaced by generateRaTransactionsCSV (transactions
only). generateRetirementCSV is removed; retirement params now flow
through the shared config layer. Parsers remain tolerant of legacy
shapes so the migration script can still read pre-split files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migration script with unittest tests

**Files:**
- Create: `scripts/migrate_csv_layout.py`
- Create: `scripts/test_migrate_csv_layout.py`

The script reads up to five legacy files and writes six target files. It refuses to run if any target already exists. It is run manually by the user as Step 4 of the migration runbook.

- [ ] **Step 1: Write the failing unittest harness**

Create `scripts/test_migrate_csv_layout.py`:

```python
"""Unit tests for scripts/migrate_csv_layout.py.

Run from repo root: python3 -m unittest scripts.test_migrate_csv_layout
"""
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
import migrate_csv_layout as m  # noqa: E402


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='budgetmig_'))
        self.db = self.tmp / 'db'
        self.db.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write(self, rel, body):
        path = self.db / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
        return path

    def _read(self, rel):
        return (self.db / rel).read_text()

    def test_full_migration_partitions_params_correctly(self):
        self._write('retirement.csv',
            'param,dob,1985-08-08,\n'
            'param,retirement_age,65,\n'
            'param,life_expectancy,95,\n'
            'param,return_ra_pct,10,\n'
            'param,cpi_pct,5,\n'
        )
        self._write('ra.csv',
            '2026-05-05,monthly repayment,50000\n'
            'param,tax_refund_rate_pct,41,\n'
            'param,nominal_return_pct,10,\n'
            'param,future_years_to_project,2,\n'
            'param,assumed_future_monthly,20000,\n'
        )
        self._write('investments.csv',
            'Date,Description,amount,account type,crypto_value\n'
            '01-04-2026,buy,31891,Discretionary,\n'
            'current_value,Discretionary,280000,\n'
            'param,marginal_rate,41,\n'
        )
        self._write('calulator_data.csv',
            'type,description,amount,date\n'
            'savings,,15000,\n'
            'debt,Car,3000,\n'
        )
        self._write('debt.csv',
            'Date,Description,Amount\n'
            'param,principal,500000\n'
            'param,interest_rate,11.25\n'
            '2026-02-15,Bonus,5000\n'
        )

        m.migrate(self.db)

        public = self._read('config.public.csv')
        self.assertIn('param,life_expectancy,95,', public)
        self.assertIn('param,return_ra_pct,10,', public)
        self.assertIn('param,cpi_pct,5,', public)
        self.assertIn('param,nominal_return_pct,10,', public)
        self.assertNotIn('dob', public)
        self.assertNotIn('marginal_rate', public)
        self.assertNotIn('principal', public)

        private = self._read('config.private.csv')
        self.assertIn('param,dob,1985-08-08,', private)
        self.assertIn('param,retirement_age,65,', private)
        self.assertIn('param,marginal_rate,41,', private)
        self.assertIn('param,tax_refund_rate_pct,41,', private)
        self.assertIn('param,principal,500000,', private)
        self.assertIn('param,interest_rate,11.25,', private)

        # Legacy params dropped
        self.assertNotIn('future_years_to_project', private)
        self.assertNotIn('future_years_to_project', public)
        self.assertNotIn('assumed_future_monthly', private)

        # Transactions
        self.assertIn('2026-05-05,monthly repayment,50000',
                      self._read('transactions/ra.csv'))
        self.assertIn('01-04-2026,buy,31891,Discretionary,',
                      self._read('transactions/investments.csv'))
        self.assertIn('current_value,Discretionary,280000,',
                      self._read('transactions/investments.csv'))
        self.assertIn('savings,,15000,',
                      self._read('transactions/budget.csv'))
        self.assertIn('debt,Car,3000,',
                      self._read('transactions/budget.csv'))
        self.assertIn('2026-02-15,Bonus,5000',
                      self._read('transactions/debt.csv'))

        # Param rows must NOT leak into transaction files
        self.assertNotIn('param,', self._read('transactions/ra.csv'))
        self.assertNotIn('param,', self._read('transactions/investments.csv'))
        self.assertNotIn('param,', self._read('transactions/debt.csv'))
        self.assertNotIn('param,', self._read('transactions/budget.csv'))

        # Old files left in place (non-destructive)
        self.assertTrue((self.db / 'retirement.csv').exists())
        self.assertTrue((self.db / 'investments.csv').exists())

    def test_refuses_to_clobber_existing_targets(self):
        self._write('retirement.csv', 'param,dob,1985-08-08,\n')
        self._write('config.public.csv', '')  # existing target

        with self.assertRaises(SystemExit):
            m.migrate(self.db)

    def test_handles_missing_source_files(self):
        # Only retirement.csv exists; the others should be treated as empty.
        self._write('retirement.csv', 'param,return_ra_pct,9,\n')

        m.migrate(self.db)

        self.assertIn('param,return_ra_pct,9,', self._read('config.public.csv'))
        self.assertEqual(self._read('transactions/ra.csv'), '')
        self.assertEqual(self._read('transactions/budget.csv'), '')
        self.assertEqual(self._read('transactions/investments.csv'), '')
        self.assertEqual(self._read('transactions/debt.csv'), '')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail (because the script does not exist)**

Run: `python3 -m unittest scripts.test_migrate_csv_layout`
Expected: ImportError or ModuleNotFoundError for `migrate_csv_layout`.

- [ ] **Step 3: Implement the migration script**

Create `scripts/migrate_csv_layout.py`:

```python
"""Migrate legacy db/*.csv layout to db/transactions/ + db/config.{public,private}.csv.

Usage (from repo root):
    python3 scripts/migrate_csv_layout.py [db_dir]

`db_dir` defaults to ./db. The script is non-destructive: it reads the legacy
files and writes the new files alongside them. It refuses to run if any of the
six target files already exist.

Public params (sourced from any input file that contains them) go to
config.public.csv. Everything else goes to config.private.csv. Legacy
params `future_years_to_project` and `assumed_future_monthly` are dropped.
"""
import sys
from pathlib import Path

PUBLIC_PARAMS = {
    'life_expectancy',
    'lump_sum_drawdown_return_pct',
    'withdrawal_rate_pct',
    'cpi_pct',
    'return_discretionary_pct',
    'return_tfsa_pct',
    'return_crypto_pct',
    'return_ra_pct',
    'offshore_discretionary_pct',
    'offshore_tfsa_pct',
    'zar_depreciation_pct',
    'ra_savings_component_pct',
    'nominal_return_pct',
}

DROPPED_LEGACY_PARAMS = {'future_years_to_project', 'assumed_future_monthly'}

TARGET_FILES = (
    'config.public.csv',
    'config.private.csv',
    'transactions/budget.csv',
    'transactions/ra.csv',
    'transactions/investments.csv',
    'transactions/debt.csv',
)


def _read(path: Path) -> str:
    return path.read_text() if path.exists() else ''


def _split_rows(text: str):
    return [r for r in (line.strip() for line in text.split('\n')) if r]


def _is_param_row(row: str) -> bool:
    return row.split(',', 1)[0] == 'param'


def _parse_param_row(row: str):
    cols = [c.strip() for c in row.split(',')]
    if len(cols) < 3 or cols[0] != 'param':
        return None, None
    return cols[1], cols[2]


def _is_header(row: str) -> bool:
    first = row.split(',', 1)[0].lower()
    return first in ('date', 'type')


def _params_from(text: str) -> dict:
    out = {}
    for row in _split_rows(text):
        if not _is_param_row(row):
            continue
        key, val = _parse_param_row(row)
        if key and key not in DROPPED_LEGACY_PARAMS:
            out[key] = val
    return out


def _transactions_from(text: str) -> list:
    """Return non-param, non-header rows verbatim."""
    return [row for row in _split_rows(text)
            if not _is_param_row(row) and not _is_header(row)]


def migrate(db_dir: Path) -> None:
    db_dir = Path(db_dir)
    existing = [t for t in TARGET_FILES if (db_dir / t).exists()]
    if existing:
        sys.stderr.write(
            'ERROR: refusing to migrate — these target files already exist:\n'
        )
        for t in existing:
            sys.stderr.write(f'  {db_dir / t}\n')
        sys.exit(2)

    retirement = _read(db_dir / 'retirement.csv')
    ra = _read(db_dir / 'ra.csv')
    investments = _read(db_dir / 'investments.csv')
    budget_legacy = _read(db_dir / 'calulator_data.csv')
    debt = _read(db_dir / 'debt.csv')

    # Combined param map across all sources.
    params = {}
    for src in (retirement, ra, investments, budget_legacy, debt):
        params.update(_params_from(src))

    public = {k: v for k, v in params.items() if k in PUBLIC_PARAMS}
    private = {k: v for k, v in params.items() if k not in PUBLIC_PARAMS}

    def _emit_config(d):
        return ''.join(f'param,{k},{d[k]},\n' for k in sorted(d.keys()))

    (db_dir / 'transactions').mkdir(parents=True, exist_ok=True)
    (db_dir / 'config.public.csv').write_text(_emit_config(public))
    (db_dir / 'config.private.csv').write_text(_emit_config(private))

    def _write_tx(rel, rows):
        body = '\n'.join(rows)
        if body:
            body += '\n'
        (db_dir / rel).write_text(body)

    _write_tx('transactions/ra.csv', _transactions_from(ra))
    _write_tx('transactions/investments.csv', _transactions_from(investments))
    _write_tx('transactions/debt.csv', _transactions_from(debt))
    _write_tx('transactions/budget.csv', _transactions_from(budget_legacy))

    print(f'Migrated to {db_dir}/:')
    print(f'  config.public.csv:  {len(public)} params')
    print(f'  config.private.csv: {len(private)} params')
    for rel in ('transactions/budget.csv', 'transactions/ra.csv',
                'transactions/investments.csv', 'transactions/debt.csv'):
        rows = _split_rows(_read(db_dir / rel))
        print(f'  {rel}: {len(rows)} rows')
    dropped_seen = sorted(
        k for src in (retirement, ra, investments, budget_legacy, debt)
        for row in _split_rows(src) if _is_param_row(row)
        for k, _ in [_parse_param_row(row)]
        if k in DROPPED_LEGACY_PARAMS
    )
    if dropped_seen:
        print(f'  dropped legacy params: {", ".join(set(dropped_seen))}')


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('db')
    migrate(target)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest scripts.test_migrate_csv_layout -v`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate_csv_layout.py scripts/test_migrate_csv_layout.py
git commit -m "$(cat <<'EOF'
feat(scripts): add migrate_csv_layout.py for db/ refactor

One-shot non-destructive migration from the legacy single-file-per-domain
shape to db/transactions/ + db/config.{public,private}.csv. Refuses to run
if any target already exists. Tested with python3 -m unittest.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server `FILE_MAP` and `REAL_KEYS`

**Files:**
- Modify: `src/server.py`

- [ ] **Step 1: Replace `FILE_MAP` and `REAL_KEYS`**

Open `src/server.py`. Replace lines 6–18 (the `FILE_MAP = {...}` block and the `REAL_KEYS = {...}` line) with:

```python
FILE_MAP = {
    'transactions_budget':           'db/transactions/budget.csv',
    'transactions_ra':               'db/transactions/ra.csv',
    'transactions_investments':      'db/transactions/investments.csv',
    'transactions_debt':             'db/transactions/debt.csv',
    'config_public':                 'db/config.public.csv',
    'config_private':                'db/config.private.csv',
    'test_transactions_budget':      'db/test/transactions/budget.csv',
    'test_transactions_ra':          'db/test/transactions/ra.csv',
    'test_transactions_investments': 'db/test/transactions/investments.csv',
    'test_transactions_debt':        'db/test/transactions/debt.csv',
    'test_config_public':            'db/test/config.public.csv',
    'test_config_private':           'db/test/config.private.csv',
}
REAL_KEYS = {
    'transactions_budget',
    'transactions_ra',
    'transactions_investments',
    'transactions_debt',
    'config_public',
    'config_private',
}
```

Leave `BACKUP_DIR`, `backup_file`, and the rest of the handler logic unchanged. The backup naming `<save_key>_<ts>.csv` will now produce filenames like `config_public_20260506_173000.csv` and `transactions_budget_20260506_173000.csv` automatically.

- [ ] **Step 2: Smoke-test the server starts**

```bash
make stop || true
python3 -c "import ast; ast.parse(open('src/server.py').read()); print('ok')"
```
Expected: `ok`. (Don't actually start the server yet — Task 5 needs to land before the HTML can talk to the new endpoints.)

- [ ] **Step 3: Commit**

```bash
git add src/server.py
git commit -m "$(cat <<'EOF'
feat(server): extend FILE_MAP for transactions + config split

Adds save keys for transactions_{budget,ra,investments,debt} and
config_{public,private} (plus matching test_* mirrors). Backup logic
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: HTML — config load/save layer + repoint transaction loaders

This task is split into four sub-tasks (5a–5d) because the HTML changes are big enough to commit incrementally. Each sub-task is independently runnable.

### Task 5a: Repoint transaction loaders to new paths and save keys

**Files:**
- Modify: `src/budget_calculator.html`

- [ ] **Step 1: Update `loadBudgetCSVFromServer` to use the new path**

Find the line (around line 1707):
```js
                const response = await fetch(dbPath('calulator_data.csv'), { cache: 'no-store' });
```
Replace with:
```js
                const response = await fetch(dbPath('transactions/budget.csv'), { cache: 'no-store' });
```

- [ ] **Step 2: Update `loadInvestmentCSVFromServer` to use the new path**

Find (around line 2033):
```js
                    const response = await fetch(dbPath('investments.csv'), { cache: 'no-store' });
```
Replace with:
```js
                    const response = await fetch(dbPath('transactions/investments.csv'), { cache: 'no-store' });
```

- [ ] **Step 3: Update `loadDebtCSVFromServer` to use the new path**

Find (around line 2318):
```js
                    const response = await fetch(dbPath('debt.csv'), { cache: 'no-store' });
```
Replace with:
```js
                    const response = await fetch(dbPath('transactions/debt.csv'), { cache: 'no-store' });
```

- [ ] **Step 4: Update the auto-load RA IIFE to use the new path**

Find (around line 1460):
```js
                    const response = await fetch(dbPath('ra.csv'), { cache: 'no-store' });
```
Replace with:
```js
                    const response = await fetch(dbPath('transactions/ra.csv'), { cache: 'no-store' });
```

- [ ] **Step 5: Update all `debouncedSave` / `saveToServer` save keys for transactions**

Run `grep -n "debouncedSave('budget'\|saveToServer('budget'\|debouncedSave('debt'\|saveToServer('debt'\|debouncedSave('ra'\|saveToServer('ra'\|debouncedSave('investments'\|saveToServer('investments'" src/budget_calculator.html` and replace each occurrence:
- `'budget'` → `'transactions_budget'`
- `'debt'` → `'transactions_debt'`
- `'ra'` → `'transactions_ra'`
- `'investments'` → `'transactions_investments'` (search for `saveToServer('investments'` and `debouncedSave('investments'`)

Note: this changes the name passed to `debouncedSave` and `saveToServer`, which becomes the URL path segment (`/api/save/transactions_budget`). Do not change `saveKey()` logic — it still prefixes `test_` correctly because the test save keys are `test_transactions_budget` etc.

- [ ] **Step 6: Update the RA generator call site to use `generateRaTransactionsCSV`**

Find (around lines 1175 and 1422):
```js
            generateRaCSV as _generateRaCSV,
```
Replace with:
```js
            generateRaTransactionsCSV as _generateRaTransactionsCSV,
```

Then find (around line 1422):
```js
            const generateRaCSVFromState = () => _generateRaCSV({
                transactions: raTransactions,
                params: raParams,
            });
```
Replace with:
```js
            const generateRaCSVFromState = () => _generateRaTransactionsCSV(raTransactions);
```

The `raParams` will be saved via the config layer in Task 5b, so dropping it here is correct.

- [ ] **Step 7: Update `generateInvestmentCSV` callers to drop the `marginalRate` field**

The investments tab in-memory state has `investmentData.marginalRate`. The generator no longer emits it, but the value is still wired into the config layer in Task 5b. Search for any call site that constructs investment data for save and confirm `marginalRate` will go through config instead.

Find the investment save call (search `saveToServer('investments'` — already renamed in Step 5); the generator function itself does not need to change here. No code change in this step beyond Step 5.

- [ ] **Step 8: Update the debt save callers**

Find (around line 2302):
```js
            const generateDebtCSV = () => {
                ...
                return _generateDebtCSV(debtData.repayments, params);
            };
```
Replace with:
```js
            const generateDebtCSV = () => _generateDebtCSV(debtData.repayments);
```
(Remove the params local construction inside this function. Debt params will flow through the config layer in Task 5b.)

- [ ] **Step 9: Smoke check**

Don't start the server yet (config layer is still missing). Just confirm the HTML still parses:
```bash
node -e "console.log(require('fs').readFileSync('src/budget_calculator.html','utf8').length, 'chars')"
```
Expected: a number around the file's existing size.

- [ ] **Step 10: Commit**

```bash
git add src/budget_calculator.html
git commit -m "$(cat <<'EOF'
refactor(html): repoint transaction loaders to db/transactions/

Updates load paths and save keys for budget/ra/investments/debt to the
new transactions_* save keys. Also switches the RA generator over to
generateRaTransactionsCSV and drops the params arg from generateDebtCSV.
The config layer that owns marginal_rate / debt params / RA params is
introduced in the next sub-task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5b: Add the shared config load/save layer

**Files:**
- Modify: `src/budget_calculator.html`

The retirement tab currently owns its own `parseRetirementCSV` / `generateRetirementCSV` flow. We replace that with a single config layer that loads both files into one `configMap`, drives every consumer (Retirement sidebar, RA params, Investments `marginalRate`, Debt params), and saves both files on every change.

- [ ] **Step 1: Add the import for `parseConfigCSV` and `generateConfigCSV`**

Find the import block (around lines 1165–1185). Add these lines next to the other named imports from `'../src/calculations.js'`:

```js
            parseConfigCSV as _parseConfigCSV,
            generateConfigCSV as _generateConfigCSV,
            PUBLIC_PARAMS as _PUBLIC_PARAMS,
```

Remove `generateRetirementCSV` from the import block if it is still listed (it was deleted in Task 2).

- [ ] **Step 2: Add the config layer block immediately after the SERVER SAVE HELPERS section**

Find the `// --- SERVER SAVE HELPERS ---` block (around lines 1284–1313). Immediately after the closing of `saveToServer` (just before `// --- RA STATE ---`), insert:

```js
            // --- SHARED CONFIG LAYER ---
            // Single source of truth for every param-style value. Loaded from
            // db/config.public.csv + db/config.private.csv at startup and
            // rewritten on any change.
            let configMap = {};

            const loadConfigFromServer = async () => {
                try {
                    const [pubRes, privRes] = await Promise.all([
                        fetch(dbPath('config.public.csv'), { cache: 'no-store' }),
                        fetch(dbPath('config.private.csv'), { cache: 'no-store' }),
                    ]);
                    const pubText  = pubRes.ok  ? await pubRes.text()  : '';
                    const privText = privRes.ok ? await privRes.text() : '';
                    configMap = { ..._parseConfigCSV(pubText), ..._parseConfigCSV(privText) };
                } catch (err) {
                    console.error('Failed to load config:', err);
                    configMap = {};
                }
            };

            const persistConfig = () => {
                debouncedSave('config_public',
                    () => _generateConfigCSV(configMap, { public: true }),
                    null);
                debouncedSave('config_private',
                    () => _generateConfigCSV(configMap, { public: false }),
                    null);
            };

            const setConfig = (key, value) => {
                configMap[key] = value;
                persistConfig();
            };
```

- [ ] **Step 3: Replace the retirement param save in `retPersist`**

Find `function retPersist()` (around line 2617):
```js
            function retPersist() {
                debouncedSave('retirement', () => _generateRetirementCSV(retirementParams), 'ret-save-csv');
            }
```
Replace with:
```js
            function retPersist() {
                Object.keys(retirementParams).forEach(k => { configMap[k] = retirementParams[k]; });
                persistConfig();
            }
```

Find the manual save click handler just below (`document.getElementById('ret-save-csv').addEventListener(...)`):
```js
                document.getElementById('ret-save-csv').addEventListener('click', () => {
                    saveToServer('retirement', () => _generateRetirementCSV(retirementParams), 'ret-save-csv');
                });
```
Replace with:
```js
                document.getElementById('ret-save-csv').addEventListener('click', () => {
                    Object.keys(retirementParams).forEach(k => { configMap[k] = retirementParams[k]; });
                    saveToServer('config_public',
                        () => _generateConfigCSV(configMap, { public: true }),
                        'ret-save-csv');
                    saveToServer('config_private',
                        () => _generateConfigCSV(configMap, { public: false }),
                        null);
                });
```

- [ ] **Step 4: Make the retirement loader read from `configMap`**

Find the retirement auto-load IIFE (around lines 2954–2965):
```js
            (async () => {
                try {
                    const response = await fetch(dbPath('retirement.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        retirementParams = _parseRetirementCSV(text);
                        retApplyParamsToInputs();
                        renderRetirement();
                    }
                } catch (_e) {
                    console.log('Could not auto-load retirement.csv');
                }
            })();
```
Replace with:
```js
            (async () => {
                // configMap was already loaded by the init block; merge it onto defaults.
                retirementParams = { ..._getDefaultRetirementParams(), ...configMap };
                retApplyParamsToInputs();
                renderRetirement();
            })();
```

- [ ] **Step 5: Make the RA loader read RA params from `configMap`**

Find the RA auto-load IIFE (around lines 1457–1471). Replace the `raParams = ...` line:
```js
                        raParams = { tax_refund_rate_pct: 41, nominal_return_pct: 10, ...parsed.params };
```
with:
```js
                        // RA params now live in configMap; only RA transactions are loaded here.
                        raParams = {
                            tax_refund_rate_pct: configMap.tax_refund_rate_pct ?? 41,
                            nominal_return_pct:  configMap.nominal_return_pct  ?? 10,
                        };
```
The transaction list (`raTransactions = parsed.transactions;`) stays as is.

- [ ] **Step 6: Update RA param input handlers to write through `setConfig`**

Find the two RA param input handlers (around lines 1413 and 1418):
```js
                raParams.tax_refund_rate_pct = parseFloat(e.target.value) || 0;
```
Replace with:
```js
                raParams.tax_refund_rate_pct = parseFloat(e.target.value) || 0;
                setConfig('tax_refund_rate_pct', raParams.tax_refund_rate_pct);
```
And similarly:
```js
                raParams.nominal_return_pct = parseFloat(e.target.value) || 0;
```
Replace with:
```js
                raParams.nominal_return_pct = parseFloat(e.target.value) || 0;
                setConfig('nominal_return_pct', raParams.nominal_return_pct);
```

Then locate the `debouncedSave('transactions_ra', generateRaCSVFromState, 'save-ra-csv');` line that fires on RA param changes and remove the param-driven calls (only transaction edits should still trigger that save). If both the RA param handler and transaction handlers currently share the same call, leave the transaction save calls intact and ensure param-only changes go through `setConfig` only.

Search `grep -n "debouncedSave('transactions_ra'" src/budget_calculator.html` and inspect each occurrence: keep the ones inside transaction add/edit/delete handlers, remove the ones inside the two param input handlers from the snippet above.

- [ ] **Step 7: Update Investments `marginalRate` to flow through configMap**

Find where `investmentData.marginalRate` is read after the load (around line 1487):
```js
            let investmentData = {
                ...
                marginalRate: 41
            };
```
Leave the default object as-is.

Find the investments load post-processing (after `parseInvestmentCSV` is called, around line 2040–2055): replace the line that sets `investmentData.marginalRate = parsed.marginalRate;` with:
```js
            investmentData.marginalRate = configMap.marginal_rate ?? 41;
```
(Drop the `parsed.marginalRate` source — it now comes from configMap, not from the transactions CSV.)

Find the marginal-rate input handler (search `investmentData.marginalRate =` for the input event handler) and after the assignment add:
```js
            setConfig('marginal_rate', investmentData.marginalRate);
```

- [ ] **Step 8: Update Debt params to flow through configMap**

Find `const generateDebtCSV = () => _generateDebtCSV(debtData.repayments);` (set in Task 5a Step 8). Just above this declaration there will be remnants of the old `params` local construction — confirm those are gone.

Find the debt load handler (around line 2316–2356) where `parseDebtCSV` is called and `debtData.params = parsed.params;`. Replace that line with:
```js
            const _debtParamKeys = ['principal','current_balance','repayment','service_fee',
                                    'interest_rate','next_payment','loan_start','original_term'];
            debtData.params = {};
            _debtParamKeys.forEach(k => { debtData.params[k] = configMap[k] ?? ''; });
```

Find each debt-input handler that updates `debtData.params[k]` and append `setConfig(k, debtData.params[k]);` after the in-memory write. Use grep `grep -n "debtData.params\[" src/budget_calculator.html` to locate every write site.

- [ ] **Step 9: Wire `loadConfigFromServer` into the app init block**

Find the init IIFE near the end of the file (around line 2519):
```js
            // --- INITIALIZATION ---
            (async () => {
                try {
                    await loadBudgetCSVFromServer();
                } catch (err) {
                    ...
                }

                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
            })();
```
Replace with:
```js
            // --- INITIALIZATION ---
            (async () => {
                await loadConfigFromServer();          // must run before tabs that read configMap
                try {
                    await loadBudgetCSVFromServer();
                } catch (err) {
                    console.warn('Automatic Budget CSV load failed.', err);
                    renderBudget();
                }

                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
                // Note: loadRaCSVFromServer and loadRetirementFromConfig
                // are introduced in Task 5c. Wire them in here at that
                // time (await loadRaCSVFromServer(); loadRetirementFromConfig();).
            })();
```

- [ ] **Step 10: Smoke-test by starting the server**

```bash
make restart
sleep 1
curl -s http://localhost:8000/ | head -5
```
Expected: HTML content (the page loads).

Open the page manually in a browser, open DevTools, check that `configMap` (visible via console after typing `configMap` if you expose it on `window` for debug, or via the network tab loading `config.public.csv` / `config.private.csv`) loads without 404s. The first run will see 404s for `config.public.csv` and `config.private.csv` if those files don't exist yet — that is expected and the load handler tolerates it (parses as empty).

- [ ] **Step 11: Commit**

```bash
git add src/budget_calculator.html
git commit -m "$(cat <<'EOF'
feat(html): shared config layer for public/private params

Adds loadConfigFromServer + persistConfig + setConfig backed by
configMap. Retirement, RA params, Investments marginalRate, and Debt
params now flow through this shared layer. The legacy retirement.csv
load and the inline param,* writes from RA/Investments/Debt are gone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5c: Refactor RA + Retirement init IIFEs into named loader functions

The test-mode toggle (Task 5d) needs to be able to re-run the RA and Retirement init logic. Right now they live inside anonymous IIFEs.

**Files:**
- Modify: `src/budget_calculator.html`

- [ ] **Step 1: Convert the RA auto-load IIFE into a named function**

Find the RA IIFE (around lines 1457–1471 — the one that calls `_parseRaCSV`). Replace:
```js
            (async () => {
                try {
                    const response = await fetch(dbPath('transactions/ra.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        const parsed = _parseRaCSV(text);
                        raTransactions = parsed.transactions;
                        raParams = {
                            tax_refund_rate_pct: configMap.tax_refund_rate_pct ?? 41,
                            nominal_return_pct:  configMap.nominal_return_pct  ?? 10,
                        };
                        renderRa();
                    } else {
                        console.warn('ra.csv fetch returned', response.status);
                    }
                } catch (err) {
                    console.error('Failed to auto-load ra.csv:', err);
                }
            })();
```
with:
```js
            const loadRaCSVFromServer = async () => {
                try {
                    const response = await fetch(dbPath('transactions/ra.csv'), { cache: 'no-store' });
                    if (response.ok) {
                        const text = await response.text();
                        const parsed = _parseRaCSV(text);
                        raTransactions = parsed.transactions;
                    } else {
                        raTransactions = [];
                    }
                } catch (err) {
                    console.error('Failed to load RA transactions:', err);
                    raTransactions = [];
                }
                raParams = {
                    tax_refund_rate_pct: configMap.tax_refund_rate_pct ?? 41,
                    nominal_return_pct:  configMap.nominal_return_pct  ?? 10,
                };
                renderRa();
            };
            // Note: do NOT call loadRaCSVFromServer() here. It depends on
            // configMap being loaded first; the init IIFE invokes it.
```

- [ ] **Step 2: Convert the Retirement auto-load IIFE into a named function**

Find the retirement IIFE (around line 2954, edited in Task 5b Step 4). Replace:
```js
            (async () => {
                retirementParams = { ..._getDefaultRetirementParams(), ...configMap };
                retApplyParamsToInputs();
                renderRetirement();
            })();
```
with:
```js
            const loadRetirementFromConfig = () => {
                retirementParams = { ..._getDefaultRetirementParams(), ...configMap };
                retApplyParamsToInputs();
                renderRetirement();
            };
            // Note: do NOT call loadRetirementFromConfig() here. It depends
            // on configMap being loaded; the init IIFE invokes it.
```

- [ ] **Step 3: Wire the new loaders into the init IIFE**

Find the init IIFE (the one beginning with `// --- INITIALIZATION ---` near line 2519, edited in Task 5b Step 9). Replace the trailing comment block:
```js
                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
                // Note: loadRaCSVFromServer and loadRetirementFromConfig
                // are introduced in Task 5c. Wire them in here at that
                // time (await loadRaCSVFromServer(); loadRetirementFromConfig();).
            })();
```
with:
```js
                await loadInvestmentCSVFromServer();
                await loadDebtCSVFromServer();
                await loadRaCSVFromServer();
                loadRetirementFromConfig();
            })();
```

- [ ] **Step 4: Smoke-test**

```bash
make restart
sleep 1
curl -s http://localhost:8000/ -o /dev/null -w "%{http_code}\n"
```
Expected: `200`. Open the page in a browser and confirm the Retirement and RA tabs still render with values from `configMap`.

- [ ] **Step 5: Commit**

```bash
git add src/budget_calculator.html
git commit -m "$(cat <<'EOF'
refactor(html): name the RA and Retirement loaders

Pull the auto-load IIFEs out into loadRaCSVFromServer and
loadRetirementFromConfig so the init IIFE controls ordering and the
test-mode toggle (next sub-task) can re-run them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5d: Extend the test-mode toggle to reload config + RA + Retirement

**Files:**
- Modify: `src/budget_calculator.html`

- [ ] **Step 1: Update the test-mode toggle handler**

Find (around lines 2502–2516):
```js
            document.getElementById('test-mode-btn').addEventListener('click', async () => {
                testMode = !testMode;
                updateTestModeUI();
                try {
                    await Promise.all([
                        loadBudgetCSVFromServer(),
                        loadInvestmentCSVFromServer(),
                        loadDebtCSVFromServer(),
                    ]);
                } catch (err) {
                    console.error('Test mode load failed, reverting:', err);
                    testMode = !testMode;
                    updateTestModeUI();
                }
            });
```

Replace with:
```js
            document.getElementById('test-mode-btn').addEventListener('click', async () => {
                testMode = !testMode;
                updateTestModeUI();
                try {
                    await loadConfigFromServer();           // configMap first — tabs read it
                    await Promise.all([
                        loadBudgetCSVFromServer(),
                        loadInvestmentCSVFromServer(),
                        loadDebtCSVFromServer(),
                        loadRaCSVFromServer(),
                    ]);
                    loadRetirementFromConfig();             // synchronous — uses configMap
                } catch (err) {
                    console.error('Test mode load failed, reverting:', err);
                    testMode = !testMode;
                    updateTestModeUI();
                }
            });
```

- [ ] **Step 2: Smoke-test**

```bash
make restart
sleep 1
curl -s http://localhost:8000/ -o /dev/null -w "%{http_code}\n"
```
Expected: `200`. Manual UI verification will happen in the migration runbook.

- [ ] **Step 3: Commit**

```bash
git add src/budget_calculator.html
git commit -m "$(cat <<'EOF'
feat(html): test-mode toggle reloads config + RA + Retirement

Without this, switching test mode left stale config-driven values on
the Retirement and RA sidebars. Now every tab reflects the test data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Write `db/examples/` in the new layout

The example data is committed to git. Both config files are tracked here (sample data, not real PII). Used to seed `db/test/` during the migration runbook.

**Files:**
- Create: `db/examples/config.public.csv`
- Create: `db/examples/config.private.csv`
- Create: `db/examples/transactions/budget.csv`
- Create: `db/examples/transactions/ra.csv`
- Create: `db/examples/transactions/investments.csv`
- Create: `db/examples/transactions/debt.csv`
- Remove: `db/examples/investments.csv` (legacy single-file example)

- [ ] **Step 1: Write `db/examples/config.public.csv`**

```
param,cpi_pct,5,
param,life_expectancy,95,
param,lump_sum_drawdown_return_pct,6,
param,nominal_return_pct,10,
param,offshore_discretionary_pct,0,
param,offshore_tfsa_pct,0,
param,ra_savings_component_pct,33,
param,return_crypto_pct,0,
param,return_discretionary_pct,10,
param,return_ra_pct,10,
param,return_tfsa_pct,10,
param,withdrawal_rate_pct,4,
param,zar_depreciation_pct,2,
```

- [ ] **Step 2: Write `db/examples/config.private.csv`**

Use sample (non-real) values:

```
param,current_balance,450000,
param,dob,1990-01-15,
param,effective_tax_rate_pct,18,
param,interest_rate,11.25,
param,loan_start,2020-01-01,
param,marginal_rate,41,
param,next_payment,2026-06-25,
param,opt_bond_balance,0,
param,opt_bond_enabled,0,
param,opt_dutch_age,68,
param,opt_dutch_enabled,0,
param,opt_dutch_eur_monthly,900,
param,opt_dutch_eur_zar,20,
param,opt_house_enabled,0,
param,opt_house_value,2000000,
param,opt_include_crypto,1,
param,opt_include_discretionary,1,
param,opt_include_tfsa,1,
param,opt_inheritance_enabled,0,
param,opt_inheritance_eur,0,
param,opt_ra_monthly_amount,10000,
param,opt_ra_monthly_enabled,0,
param,opt_savings_pot_withdrawal_annual,0,
param,opt_savings_pot_withdrawal_enabled,0,
param,opt_tfsa_enabled,0,
param,original_term,240,
param,principal,500000,
param,ra_commute_third,1,
param,ra_vested_balance,0,
param,repayment,4500,
param,retirement_age,65,
param,service_fee,69,
param,show_real_terms,0,
param,tax_refund_rate_pct,41,
```

- [ ] **Step 3: Write `db/examples/transactions/investments.csv`**

```
Date,Description,amount,account type,crypto_value
01-01-2025,Example ETF,5000,TFSA,
15-01-2025,Example Stock,2000,Discretionary,
20-01-2025,Example Crypto,1000,Crypto,0.025
current_value,Discretionary,2050.00,
current_value,TFSA,5100.00,
current_value,Crypto,950,
```

- [ ] **Step 4: Write `db/examples/transactions/ra.csv`**

```
2026-04-25,monthly,5000
2026-05-25,monthly,5000
```

- [ ] **Step 5: Write `db/examples/transactions/budget.csv`**

```
type,description,amount,date
savings,,15000,
debt,Sample loan,3000,
provision,Holiday fund,2000,2026-12-01
costfuturecost,Laptop,1500,2026-09-01
```

- [ ] **Step 6: Write `db/examples/transactions/debt.csv`**

```
Date,Description,Amount
2026-02-25,monthly repayment,4500
2026-03-25,monthly repayment,4500
```

- [ ] **Step 7: Remove the legacy `db/examples/investments.csv`**

```bash
rm db/examples/investments.csv
```

- [ ] **Step 8: Commit**

```bash
git add db/examples/
git commit -m "$(cat <<'EOF'
feat(examples): rebuild db/examples/ in the new layout

Adds config.public.csv (tracked), config.private.csv (sample-only,
also tracked here), and transactions/{budget,ra,investments,debt}.csv.
The legacy db/examples/investments.csv is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Replace the db-related rules**

Find the current block:
```
# Ignore database CSV files
db/*.csv
db/backups/
db/test/
```
Replace with:
```
# Ignore database CSV files
db/*.csv
db/transactions/*.csv
db/test/
db/backups/
!db/config.public.csv
!db/examples/
```

- [ ] **Step 2: Verify with `git check-ignore`**

```bash
git check-ignore -v db/config.public.csv db/config.private.csv db/transactions/ra.csv db/examples/config.private.csv db/examples/transactions/ra.csv 2>&1 | sed -n '1,10p'
```
Expected output:
- `db/config.public.csv` → not ignored (exit code 1, no line shown — or shown only with negation rule)
- `db/config.private.csv` → ignored (matches `db/*.csv`)
- `db/transactions/ra.csv` → ignored (matches `db/transactions/*.csv`)
- `db/examples/config.private.csv` → not ignored (matches `!db/examples/`)
- `db/examples/transactions/ra.csv` → not ignored

If any of the example files end up ignored, fix the negation rules and re-test.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(gitignore): track config.public.csv and examples; ignore transactions

Updates rules for the new db/ layout: config.public.csv is tracked,
db/transactions/*.csv is ignored (real data), and db/examples/* is
explicitly tracked (sample data).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `core-requirements.md` and `functional-requirements.md`

**Files:**
- Modify: `docs/specs/core-requirements.md`
- Modify: `docs/specs/functional-requirements.md`

The spec mandates that both documents are updated whenever feature behaviour changes. The relevant changes here are: file paths and ownership of params (RA, Retirement, Investments, Debt sections), plus any reference to `calulator_data.csv` or per-domain CSVs.

- [ ] **Step 1: Audit `core-requirements.md` for paths and param ownership**

```bash
grep -n -E "(calulator_data|db/retirement\.csv|db/ra\.csv|db/investments\.csv|db/debt\.csv|param,|marginal_rate|tax_refund_rate_pct|nominal_return_pct)" docs/specs/core-requirements.md
```
For each match, update the path (`db/calulator_data.csv` → `db/transactions/budget.csv`, `db/retirement.csv` → `db/config.public.csv` + `db/config.private.csv`, etc.) and clarify which file owns each param.

If there is a "data file layout" section, replace it with a description matching `docs/specs/2026-05-06-config-transactions-split-design.md` Section "File layout".

- [ ] **Step 2: Audit `functional-requirements.md` for the same**

```bash
grep -n -E "(calulator_data|db/retirement\.csv|db/ra\.csv|db/investments\.csv|db/debt\.csv|param,)" docs/specs/functional-requirements.md
```
Update each match the same way.

- [ ] **Step 3: Add a short "Data files" section to whichever document doesn't already have one**

Suggested wording (insert into the appropriate section in `core-requirements.md`):

```markdown
### Data files

Live data lives under `db/`:

- `db/transactions/{budget,ra,investments,debt}.csv` — date-stamped rows and `current_value` snapshots. All gitignored.
- `db/config.public.csv` — generic modelling assumptions (return rates, CPI, withdrawal rate, etc.). Tracked in git.
- `db/config.private.csv` — personal data (DOB, balances) and personal assumptions (tax rates, scenario toggles). Gitignored.

Test mode mirrors the same layout under `db/test/`. Sample seed data lives under `db/examples/`.

The visibility allowlist that decides which params go to `config.public.csv` vs `config.private.csv` lives in `src/calculations.js` as `PUBLIC_PARAMS`.
```

- [ ] **Step 4: Run tests one more time as a sanity check**

```bash
npm test && python3 -m unittest scripts.test_migrate_csv_layout
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/specs/core-requirements.md docs/specs/functional-requirements.md
git commit -m "$(cat <<'EOF'
docs(specs): reflect config/transactions split in core + functional reqs

Updates file paths and param ownership wherever the old single-file-per-
domain layout was referenced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification (manual, by user)

The implementation is complete. The user now executes the migration runbook from the spec (`docs/specs/2026-05-06-config-transactions-split-design.md` Section "Migration strategy"):

1. Snapshot real `db/` to `~/Documents/budget_backups/migration_<ts>`.
2. Seed test mode: `mkdir -p db/test && cp -R db/examples/* db/test/`.
3. Start server (`make restart`); toggle test mode; on every tab (Budget / Investments / Debt / RA / Retirement) confirm values render correctly and one round-trip edit lands in `db/test/*`.
4. Run `python3 scripts/migrate_csv_layout.py` against real `db/`.
5. With test mode OFF, confirm all real-data tabs render exactly as before the migration; round-trip one edit per tab.
6. `rm db/retirement.csv db/ra.csv db/investments.csv db/calulator_data.csv db/debt.csv`.

If any step fails, follow the rollback procedure in the spec.
