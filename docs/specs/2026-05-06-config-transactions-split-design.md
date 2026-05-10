# Config / Transactions Split — Design

> Superseded by `docs/specs/2026-05-10-json-configs-design.md` for the JSON conversion. The `config.public.csv` / `config.private.csv` and `param,key,value,` references below predate that change.

**Date:** 2026-05-06
**Branch:** dev
**Status:** approved, pending implementation plan

## Goal

Separate transactional data from configuration values in `db/`, and split configuration into a public file (tracked in git) and a private file (gitignored). The existing per-save backup mechanism continues to cover all files.

## Classification rule

Three categories of values currently coexist in `db/*.csv`:

- **A — Personal/sensitive** — PII or financial state (`dob`, balances, house value).
- **B — Personal assumptions** — values specific to this user but not sensitive (`marginal_rate`, `effective_tax_rate_pct`, `opt_dutch_eur_monthly`).
- **C — Generic modelling assumptions** — sensible defaults any user could share (`return_ra_pct`, `cpi_pct`, `withdrawal_rate_pct`).

**Rule:** A and B are private. C is public.

## File layout

```
db/
  transactions/
    budget.csv          ← savings / debt / provision / costfuturecost rows (renamed from calulator_data.csv)
    ra.csv              ← Date,Description,amount rows
    investments.csv     ← Date rows + current_value snapshot rows
    debt.csv            ← repayment Date rows only
  config.public.csv     ← C-class params, TRACKED in git
  config.private.csv    ← A+B-class params, GITIGNORED

  examples/             tracked in git — sample/seed data
    transactions/
      budget.csv
      ra.csv
      investments.csv
      debt.csv
    config.public.csv
    config.private.csv  also tracked here (sample data, not real PII)

  test/                 gitignored, populated manually
    transactions/...
    config.public.csv
    config.private.csv
```

`db/test/` mirrors the new shape so the existing test mode toggle (which prefixes `db/test/` via `dbPath()`) continues to work without code changes beyond the new file names.

## Param classification

### `config.public.csv` (13 params, tracked in git)

| Param | Default |
|---|---|
| `life_expectancy` | 95 |
| `lump_sum_drawdown_return_pct` | 6 |
| `withdrawal_rate_pct` | 4 |
| `cpi_pct` | 5 |
| `return_discretionary_pct` | 10 |
| `return_tfsa_pct` | 10 |
| `return_crypto_pct` | 0 |
| `return_ra_pct` | 10 |
| `offshore_discretionary_pct` | 0 |
| `offshore_tfsa_pct` | 0 |
| `zar_depreciation_pct` | 2 |
| `ra_savings_component_pct` | 33 |
| `nominal_return_pct` | 10 |

### `config.private.csv` (gitignored)

All remaining params from `db/retirement.csv`, `db/ra.csv`, `db/investments.csv`, and `db/debt.csv`:

From retirement / ra / investments: `dob`, `retirement_age`, `effective_tax_rate_pct`, `tax_refund_rate_pct`, `marginal_rate`, `show_real_terms`, `opt_include_discretionary`, `opt_include_tfsa`, `opt_include_crypto`, `ra_commute_third`, `ra_vested_balance`, `opt_savings_pot_withdrawal_enabled`, `opt_savings_pot_withdrawal_annual`, `opt_dutch_enabled`, `opt_dutch_eur_zar`, `opt_dutch_age`, `opt_dutch_eur_monthly`, `opt_tfsa_enabled`, `opt_ra_monthly_enabled`, `opt_ra_monthly_amount`, `opt_house_enabled`, `opt_house_value`, `opt_inheritance_enabled`, `opt_inheritance_eur`, `opt_bond_enabled`, `opt_bond_balance`.

From debt (all A-class — your specific loan terms): `principal`, `current_balance`, `repayment`, `service_fee`, `interest_rate`, `next_payment`, `loan_start`, `original_term`.

### Dropped on migration

`future_years_to_project`, `assumed_future_monthly` — already removed from the UI in to_do.md refactor #3, silently dropped during migration.

## Server changes (`src/server.py`)

`FILE_MAP` becomes:

```python
FILE_MAP = {
    'transactions_budget':      'db/transactions/budget.csv',
    'transactions_ra':          'db/transactions/ra.csv',
    'transactions_investments': 'db/transactions/investments.csv',
    'transactions_debt':        'db/transactions/debt.csv',
    'config_public':            'db/config.public.csv',
    'config_private':           'db/config.private.csv',
    'test_transactions_budget':      'db/test/transactions/budget.csv',
    'test_transactions_ra':           'db/test/transactions/ra.csv',
    'test_transactions_investments':  'db/test/transactions/investments.csv',
    'test_transactions_debt':         'db/test/transactions/debt.csv',
    'test_config_public':             'db/test/config.public.csv',
    'test_config_private':            'db/test/config.private.csv',
}
REAL_KEYS = {'transactions_budget', 'transactions_ra',
             'transactions_investments', 'transactions_debt',
             'config_public', 'config_private'}
```

Backup behaviour is unchanged: every POST to a real key triggers a timestamped copy in `~/Documents/budget_backups/` with filename `<save_key>_<ts>.csv`. Test-mode header still blocks writes to real keys.

The save-handler logic itself does not change beyond the new key list.

## Client changes (`src/budget_calculator.html`, `src/calculations.js`)

**Visibility allowlist lives client-side.** `calculations.js` exports a single `PUBLIC_PARAMS` Set listing the 13 public param names. Server is unaware of the public/private distinction — it just stores whatever each save endpoint receives.

**Config load** — at startup, the app reads `config.public.csv` and `config.private.csv` (via `dbPath()`) into a single keyed map. All existing param consumers (Retirement sidebar, RA sidebar, Investments sidebar) read from this merged map; nothing in the rest of the codebase needs to know which file a value came from.

**Config save** — on any param change, the existing debounced save fires twice (one for public, one for private). Each call regenerates the corresponding CSV from the in-memory map by partitioning keys against `PUBLIC_PARAMS`. Both saves use the same debounce token grouping so they batch together.

**Transaction load/save** — `loadBudgetCSVFromServer`, `loadInvestmentCSVFromServer`, `loadRaCSVFromServer`, `loadDebtCSVFromServer` are repointed to `db/transactions/<domain>.csv` via `dbPath()`. Their CSV row schemas are unchanged for budget / ra / investments. The `db/calulator_data.csv` filename is dropped in favour of `db/transactions/budget.csv`.

**Generators** — replaced as follows in `calculations.js`:
- `_generateRaCSV` and `_generateRetirementCSV` are removed.
- `generateBudgetCSV(data)` — unchanged shape; still emits `savings/debt/provision/costfuturecost` rows. (No params to strip.)
- `generateInvestmentCSV(data)` — drops the trailing `param,marginal_rate,...` row; emits only Date rows + `current_value` rows.
- `generateDebtCSV(repayments, params)` — drops the eight `param,*` header rows; emits header + repayment Date rows only.
- New `generateConfigCSV(map, allowlist)` — emits `param,<key>,<value>,` rows for keys in (or not in) the allowlist.

**Test mode** — `dbPath()` continues to prefix `db/test/` vs `db/` and the new sub-paths flow through unchanged. One small additional change: the test-mode toggle handler currently reloads only Budget / Investments / Debt. Extend it to also call the config loader plus the RA and Retirement loaders, so toggling test mode reflects test data on every tab without a page refresh. Without this, after the refactor toggling test mode would leave stale config-driven values (Retirement sidebar, RA sidebar, all assumption percentages) on screen.

## Migration strategy (existing untracked CSVs)

The live `db/*.csv` files contain real financial data and aren't in git. Migration is non-destructive and **test-mode first**: the new mechanism is verified end-to-end in test mode before any real data is touched. Real-data migration is a one-shot script run only after test-mode verification passes.

`db/examples/` is written by hand during implementation in the new layout and committed to git. The new example files (`config.public.csv`, `config.private.csv`, `transactions/budget.csv`, `transactions/ra.csv`, `transactions/investments.csv`, `transactions/debt.csv`) replace the old `db/examples/investments.csv`.

**Step 1 — Pre-migration snapshot (manual, by user)**

```sh
cp -R db ~/Documents/budget_backups/migration_$(date +%Y%m%d_%H%M%S)
```

Independent of the existing per-save backups; provides a single-timestamp rollback point covering all real CSVs.

**Step 2 — Seed test mode from examples (manual, by user)**

```sh
mkdir -p db/test
cp -R db/examples/* db/test/
```

This populates `db/test/` with sample data already in the new layout, so the toggle has something to read.

**Step 3 — Verify the new mechanism in test mode (manual, by user)**

Start the server with the new code, click the test-mode toggle, then on every tab (Budget / Investments / Debt / RA / Retirement):
1. Confirm every value renders correctly from the example data.
2. Edit one value on each tab.
3. Confirm the edit round-trips: the relevant `db/test/*.csv` file updates, and reloading the page shows the edited value.
4. Confirm toggling test mode off shows the (still-old-shape) real data unchanged.

If any step fails: rollback (see below) and do not proceed to Step 4.

**Step 4 — Run the migration script on real data**

```sh
python3 scripts/migrate_csv_layout.py
```

The script (`scripts/migrate_csv_layout.py`, checked in) does the following:
- Reads `db/retirement.csv`, `db/ra.csv`, `db/investments.csv`, `db/calulator_data.csv`, `db/debt.csv` (each optional — a missing source file is treated as empty so partial-state repos still migrate).
- Writes six target files:
  - `db/transactions/budget.csv` (from `calulator_data.csv` non-param rows)
  - `db/transactions/ra.csv` (Date rows from `ra.csv`)
  - `db/transactions/investments.csv` (Date rows + `current_value` rows from `investments.csv`)
  - `db/transactions/debt.csv` (repayment Date rows from `debt.csv`)
  - `db/config.public.csv` (params matching `PUBLIC_PARAMS`)
  - `db/config.private.csv` (everything else, including the eight debt params)
- Refuses to run if any of the six target files already exist (prevents double-migration).
- Does not delete old files.
- Drops `future_years_to_project` and `assumed_future_monthly` silently.
- Prints summary: row counts per output file, list of dropped legacy params.

**Step 5 — Verify real data (manual, by user)**

With test mode OFF, open every tab and confirm every value renders identically to before the migration. Edit one value on each tab to confirm round-trip save into the new real-data files.

**Step 6 — Cleanup (manual, by user)**

```sh
rm db/retirement.csv db/ra.csv db/investments.csv db/calulator_data.csv db/debt.csv
```

The Step 1 snapshot remains as a safety net.

**Rollback** (if anything breaks during Step 3 or Step 5):

```sh
rm -rf db/transactions db/config.public.csv db/config.private.csv
cp -R ~/Documents/budget_backups/migration_<ts>/* db/
git checkout -- src/
```

`~/Documents/budget_backups/` is a protected path; the user runs all rollback commands. The implementation will not read, write, or reference that directory beyond the existing `BACKUP_DIR` constant in `server.py`.

## `.gitignore` changes

Replace:

```
db/*.csv
db/backups/
db/test/
```

with:

```
db/*.csv
db/transactions/*.csv
db/test/
db/backups/
!db/config.public.csv
!db/examples/
```

`db/config.public.csv` is the only file that needs an explicit un-ignore. `db/examples/` is already not matched by `db/*.csv` (it's a directory) but the un-ignore is added defensively to make intent explicit.

## Spec & docs updates required

Per project convention, both spec documents must be updated alongside the code:

- `docs/specs/core-requirements.md` — wherever the data layout is referenced (file paths, param ownership), reflect the new public/private/transactions split.
- `docs/specs/functional-requirements.md` — same.

## Out of scope

- Any change to the `BACKUP_DIR` location, format, or retention policy.
- Anything beyond what this spec calls out — no broader UI refactor, no new tabs, no changes to calculations.

## Verification

- All existing tests in `tests/` continue to pass.
- New unit tests for:
  - `generateConfigCSV(map, allowlist)` partitioning correctly.
  - `PUBLIC_PARAMS` allowlist completeness (every known param ends up in exactly one of public/private).
  - Migration script: given a fixture of the current shape, produces correct target files and drops legacy params.
- Manual UI verification: every existing param round-trips through save → reload across all tabs.
