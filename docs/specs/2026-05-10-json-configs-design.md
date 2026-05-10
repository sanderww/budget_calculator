# JSON Config Files + Cross-Mac Migration — Design

**Date:** 2026-05-10
**Branch:** dev
**Status:** approved, pending implementation plan

## Goal

Convert `db/config.public.csv` and `db/config.private.csv` from the `param,key,value,` CSV format introduced in the 2026-05-06 split to flat JSON. Replace the unrun `scripts/migrate_csv_layout.py` with a single one-shot script that takes a Mac from the old all-CSV layout straight to the new layout (CSV transactions + JSON configs). Produce a self-contained operational doc that the user carries to the remote laptop alongside a git bundle, covering bundle receive + migration on that machine.

## Context

Per `docs/to_do.md` line 13: real-data migration is pending on both Macs. Neither machine has run `migrate_csv_layout.py`. Both still have the old all-CSV layout (`db/calulator_data.csv`, `db/retirement.csv`, `db/ra.csv`, `db/investments.csv`, `db/debt.csv`) under their gitignored `db/` directory. The post-split code is committed but operates against files that don't yet exist on disk.

Because no Mac is on the intermediate post-split-CSV state, there is no consumer for a two-stage CSV→CSV→JSON migration. A single script that goes old→final on both Macs is simpler.

## Scope

In scope:
- Replace CSV config files with JSON.
- Rewrite the migration script accordingly.
- Update server, client, examples, gitignore, specs.
- Write the operational MD doc for receiving the bundle + running the migration on the remote Mac.

Out of scope:
- Changing transaction file formats (`db/transactions/*.csv` stay as CSV).
- Changing the `BACKUP_DIR` location or retention policy.
- Reworking the public/private partition (the 13-key `PUBLIC_PARAMS` allowlist is unchanged).
- Converting 0/1 flags to JSON booleans (kept as-is to avoid touching every `opt_*` consumer).

## File layout (final state)

```
db/
  transactions/
    budget.csv
    ra.csv
    investments.csv
    debt.csv
  config.public.json     ← TRACKED in git, was config.public.csv
  config.private.json    ← GITIGNORED, was config.private.csv

  examples/              tracked in git
    transactions/
      budget.csv
      ra.csv
      investments.csv
      debt.csv
    config.public.json   ← was .csv
    config.private.json  ← was .csv (sample data, not real PII)

  test/                  gitignored, populated manually from examples
    transactions/...
    config.public.json
    config.private.json
```

## JSON shape

Flat object. Native types. Numbers are numbers. Existing 0/1 flags stay as 0/1 (no semantic change). Strings stay as strings (e.g. `dob`).

```json
{
  "cpi_pct": 5,
  "life_expectancy": 95,
  "lump_sum_drawdown_return_pct": 6,
  "withdrawal_rate_pct": 4
}
```

Files are written pretty-printed with 2-space indent and **keys sorted alphabetically** so diffs across saves are minimal. Both the client save path and the migration script follow this rule.

No top-level wrapper (no `schema_version`, no `params` envelope). If a future migration needs one, it can be added then.

## Server changes (`src/server.py`)

`FILE_MAP` paths change `.csv` → `.json` for the four config keys:

```python
FILE_MAP = {
    'transactions_budget':           'db/transactions/budget.csv',
    'transactions_ra':               'db/transactions/ra.csv',
    'transactions_investments':      'db/transactions/investments.csv',
    'transactions_debt':             'db/transactions/debt.csv',
    'config_public':                 'db/config.public.json',
    'config_private':                'db/config.private.json',
    'test_transactions_budget':      'db/test/transactions/budget.csv',
    'test_transactions_ra':          'db/test/transactions/ra.csv',
    'test_transactions_investments': 'db/test/transactions/investments.csv',
    'test_transactions_debt':        'db/test/transactions/debt.csv',
    'test_config_public':            'db/test/config.public.json',
    'test_config_private':           'db/test/config.private.json',
}
```

`REAL_KEYS` is unchanged (it's keyed by save name, not file extension).

Backup filenames inherit the source extension via the existing logic. Update `backup_file` so its target extension matches the source file's extension (so `config_public_<ts>.json` is written for the JSON files, while transaction backups remain `.csv`). The protected `BACKUP_DIR` constant and surrounding logic are unchanged.

The save handler is byte-stream-agnostic — no further logic change. Test-mode header behaviour is unchanged.

## Client changes (`src/calculations.js`, `src/budget_calculator.html`)

In `calculations.js`:
- Remove `_parseConfigCSV`. Add `_parseConfigJSON(text)` that returns `JSON.parse(text)` inside a try/catch returning `{}` on failure (preserves existing fallback when the file is missing or empty).
- Remove `_generateConfigCSV(map, allowlist)`. Add `_generateConfigJSON(map, allowlist)` that partitions `map` by `PUBLIC_PARAMS` membership (`{ public: true }` → keys ∈ allowlist; `{ public: false }` → keys ∉ allowlist), sorts keys, returns `JSON.stringify(filtered, null, 2)`.
- `PUBLIC_PARAMS` Set is unchanged (same 13 keys).

In `budget_calculator.html`:
- `loadConfigFromServer` fetches `config.public.json` and `config.private.json` via `dbPath()` and merges through `_parseConfigJSON`.
- `persistConfig` calls `_generateConfigJSON` instead of `_generateConfigCSV`. Save keys (`config_public`, `config_private`) are unchanged — server-side `FILE_MAP` handles the extension.
- All consumers of `configMap[key]` are unchanged (values remain numbers/strings as before).

## Migration script

New file: `scripts/migrate_to_json_layout.py`. The unrun `scripts/migrate_csv_layout.py` is deleted in the same commit.

**Inputs** (each optional; missing source = empty):
- `db/calulator_data.csv`
- `db/ra.csv`
- `db/investments.csv`
- `db/retirement.csv`
- `db/debt.csv`

**Outputs:**
- `db/transactions/budget.csv` — non-`param` rows from `calulator_data.csv`
- `db/transactions/ra.csv` — Date rows from `ra.csv`
- `db/transactions/investments.csv` — Date rows + `current_value` rows from `investments.csv`
- `db/transactions/debt.csv` — repayment Date rows from `debt.csv`
- `db/config.public.json` — params whose keys ∈ `PUBLIC_PARAMS`
- `db/config.private.json` — all other params (incl. the 8 debt params)

**Behaviour:**
- Refuses to run if any of the 6 target files exist (no double-migration).
- Drops `future_years_to_project` and `assumed_future_monthly` silently.
- Coerces param values: `int(v)` if it parses cleanly, else `float(v)` if it parses, else string. Matches the existing client-side coercion of CSV values.
- Writes JSON pretty-printed, keys sorted alphabetically, 2-space indent — same rule as `_generateConfigJSON`.
- Does NOT delete old source files. Cleanup is a manual user step after verification.
- Prints summary: row counts per output file + list of dropped legacy params.

**`PUBLIC_PARAMS` source of truth in Python:** hardcoded list at the top of the script with a comment pointing to `src/calculations.js`. The list almost never changes; parsing JS at script start is over-engineering.

**Tests** (`tests/` — unittest):
1. Fixture of old all-CSV layout produces correct outputs (six target files, JSON keys partitioned correctly, sorted, transactional rows preserved).
2. Refuses to clobber: pre-creates one target file and verifies the script exits non-zero without writing.
3. Drops legacy params: fixture containing `future_years_to_project` and `assumed_future_monthly` produces JSON without those keys, and the summary lists them.

The three existing tests for `migrate_csv_layout.py` are removed alongside that script.

## Operational doc (the bundle/migration runbook)

Path: `docs/migrations/2026-05-10-json-configs.md`. New `docs/migrations/` directory; tracked in git so the remote Mac receives the doc via the bundle.

The doc is scoped to this transition and references specific files and commits. After both Macs are migrated, it can be deleted.

The generic `docs/sync-via-bundle.md` stays as-is — this new doc supplements it for the one-off migration.

**Sections:**

1. **Overview** — current state both Macs share (post-split code on `dev`, real `db/` still all-CSV), end state, order of operations across machines.

2. **On the source Mac — record of what was already done:**
   - Code committed on `dev` (JSON conversion + new migration script).
   - Pre-migration snapshot: `cp -R db ~/Documents/budget_backups/migration_<ts>` (user runs).
   - Test-mode verification (seed `db/test/` from `db/examples/`, click through every tab, edit a value, confirm round-trip).
   - Run `python3 scripts/migrate_to_json_layout.py`.
   - Real-data verification across all tabs.
   - Cleanup: `rm db/calulator_data.csv db/ra.csv db/investments.csv db/retirement.csv db/debt.csv`.
   - Bundle: `git bundle create /tmp/bc.bundle main dev --not origin/main` and `git bundle verify /tmp/bc.bundle`.
   - Transfer bundle + this doc to the remote Mac.

3. **On the remote Mac:**
   - Pre-receive snapshot of `db/` to `~/Documents/budget_backups/migration_<ts>` (user runs).
   - `git fetch origin` to make sure the clone is current.
   - `git fetch /path/to/bc.bundle 'refs/heads/*:refs/heads/from-laptop/*'` — creates `from-laptop/main`, `from-laptop/dev`.
   - Inspect: `git log from-laptop/dev --oneline`, `git diff origin/dev..from-laptop/dev --stat`.
   - Fast-forward `dev`: `git checkout dev && git merge --ff-only from-laptop/dev`.
   - Test-mode verification first (seed `db/test/` from `db/examples/` if not already present, click through every tab, confirm round-trip on each).
   - Run `python3 scripts/migrate_to_json_layout.py` against the remote's real data.
   - Real-data verification across every tab.
   - Cleanup the old CSV source files (same `rm` command as source Mac).
   - Push to `origin`: `git push origin dev`. Merge `dev` → `main` per project workflow only after the user confirms they're happy.
   - Delete the bundle file and the `from-laptop/*` branches.

4. **Rollback** (applies on either Mac, after migration begins):
   ```sh
   rm -rf db/transactions db/config.public.json db/config.private.json
   cp -R ~/Documents/budget_backups/migration_<ts>/* db/
   git checkout dev -- src/   # only if code is the suspected cause
   ```
   User runs all rollback commands; `~/Documents/budget_backups/` is never touched by Claude.

5. **Troubleshooting:**
   - `error: Repository lacks these prerequisite commits` → run `git fetch origin` first; if still failing, regenerate bundle on source with `--all`.
   - Migration script refuses to run → check whether `db/transactions/` or the JSON config files already exist from a prior partial attempt.
   - Test-mode round-trip fails on any tab → do NOT proceed to the real-data step; rollback test/, investigate.

## `.gitignore` changes

Replace the existing un-ignore for `config.public.csv` with one for `config.public.json`. Add `db/*.json` to the ignore list so `config.private.json` stays gitignored.

Before:
```
db/*.csv
db/transactions/*.csv
db/test/
db/backups/
!db/config.public.csv
!db/examples/
```

After:
```
db/*.csv
db/*.json
db/transactions/*.csv
db/test/
db/backups/
!db/config.public.json
!db/examples/
```

## Spec doc updates

Per `.claude/CLAUDE.md`:
- `docs/specs/core-requirements.md` — replace any references to `config.public.csv` / `config.private.csv` and the `param,key,value,` row format with the JSON file names + flat-object shape.
- `docs/specs/functional-requirements.md` — same.

## Verification

- All existing vitest tests in `tests/` continue to pass after the JSON conversion.
- New unit tests for:
  - `_generateConfigJSON(map, allowlist)` partitioning correctly (parallel to the existing `generateConfigCSV` tests).
  - `_parseConfigJSON` round-trip with `_generateConfigJSON`.
  - `PUBLIC_PARAMS` allowlist completeness (every known param ends up in exactly one of public/private) — already exists; just retarget at the JSON helpers.
- Three new unittest cases for `migrate_to_json_layout.py` (replacing the three for `migrate_csv_layout.py`).
- Manual UI verification on the source Mac across every tab: load, edit one value, reload, confirm persistence. Repeat after the bundle is applied on the remote Mac.
