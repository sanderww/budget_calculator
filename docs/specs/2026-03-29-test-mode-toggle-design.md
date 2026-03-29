# Test Mode Toggle — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

A subtle toggle in the top-right of the header switches the app between real data (`db/`) and example data (`db/test/`). All three data sources reload immediately on toggle, and all saves in test mode are redirected to `db/test/` — the real CSV files are never touched.

## Architecture

A single boolean `testMode` (default `false`) acts as the source of truth. Two helper functions derive path/key from it:

- `dbPath(filename)` → `db/test/<filename>` or `db/<filename>`
- `saveKey(name)` → `test_budget` / `test_investments` / `test_debt` or `budget` / `investments` / `debt`

All three load functions (`loadBudgetCSVFromServer`, `loadInvestmentCSVFromServer`, `loadDebtCSVFromServer`) use `dbPath()` for their fetch URLs. `saveToServer` uses `saveKey(name)` as the API endpoint name. No other logic changes.

## Components

### 1. UI Toggle (HTML)

Placed in the `<header>` using `flex` + `justify-between`. Right side: a small pill button reading "Test Mode" with a dot indicator. Visual states:

- **Off**: muted slate pill, subtle border — nearly invisible
- **On**: amber-tinted background (`bg-amber-50 border-amber-300 text-amber-700`), dot turns amber

A faint "SAMPLE DATA" label appears below the header subtitle when active, so it's always obvious.

### 2. JS — `testMode` flag and helpers

```js
let testMode = false;

const dbPath = (filename) =>
    testMode ? `db/test/${filename}` : `db/${filename}`;

const saveKey = (name) =>
    testMode ? `test_${name}` : name;
```

`saveToServer` changes `/api/save/${name}` → `/api/save/${saveKey(name)}`.

The three load functions replace hardcoded paths with `dbPath(...)`.

### 3. Toggle event handler

```js
testModeBtn.addEventListener('click', async () => {
    testMode = !testMode;
    updateTestModeUI();
    await Promise.all([
        loadBudgetCSVFromServer().catch(() => {}),
        loadInvestmentCSVFromServer(),
        loadDebtCSVFromServer(),
    ]);
});
```

Runs all three loads in parallel so the refresh is instant.

### 4. Server — `server.py` FILE_MAP additions

```python
FILE_MAP = {
    'budget':            'db/calulator_data.csv',
    'investments':       'db/investments.csv',
    'debt':              'db/debt.csv',
    'test_budget':       'db/test/calulator_data.csv',
    'test_investments':  'db/test/investments.csv',
    'test_debt':         'db/test/debt.csv',
}
```

No other server changes needed.

## Data Safety

- Real files (`db/*.csv`) are never written to in test mode — guaranteed by `saveKey()` routing to `test_*` keys.
- Auto-save (`debouncedSave`) calls `saveToServer` which calls `saveKey`, so it is automatically safe too.
- The server rejects unknown keys with a 400, so any misconfiguration fails loudly.

## Out of Scope

- Persisting test mode across page reload (in-memory only, resets on refresh)
- Per-tab test mode (all three tabs switch together)
