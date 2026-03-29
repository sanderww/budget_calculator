# Folder Restructure Design

**Date:** 2026-03-29
**Scope:** Folder cleanup only (no code extraction from HTML)

## Goal

Organize the project from a flat root into a logical folder structure, making it easier to navigate and maintain.

## Current Structure (problems)

- Source files (`budget_calculator.html`, `calculations.js`, `server.py`) loose in root
- `docs/superpowers/` unnecessary nesting
- `prompts/` is a historical artifact that belongs in docs
- `db/backups/` and `db/test/` not in `.gitignore` (backups are runtime artifacts; test data is local-only)

## Target Structure

```
budget_calculator/
├── src/
│   ├── budget_calculator.html
│   ├── calculations.js
│   └── server.py
├── assets/
│   ├── favicon.png
│   └── UI.png
├── db/
│   ├── calulator_data.csv
│   ├── investments.csv
│   ├── debt.csv
│   └── test/                    (gitignored, used by UI test mode toggle)
├── tests/
│   └── calculations.test.js
├── docs/
│   ├── plans/
│   ├── specs/
│   └── prompts/
├── Makefile
├── package.json
├── readme.md
└── .gitignore
```

## File Moves

| From | To |
|------|-----|
| `budget_calculator.html` | `src/budget_calculator.html` |
| `calculations.js` | `src/calculations.js` |
| `server.py` | `src/server.py` |
| `docs/superpowers/plans/*` | `docs/plans/` |
| `docs/superpowers/specs/*` | `docs/specs/` |
| `prompts/*` | `docs/prompts/` |

After moves, remove empty `docs/superpowers/` and `prompts/` directories.

## Path Updates Required

### 1. `src/server.py` — serve `src/` files transparently

The server uses `SimpleHTTPRequestHandler` which serves files from CWD (project root via Makefile). After moving HTML/JS to `src/`, the server must also look there.

**Approach:** Override `translate_path()` so that if a requested file doesn't exist at the project root but does exist in `src/`, serve it from `src/`. This keeps URLs clean (`http://localhost:8000/budget_calculator.html`, no `src/` prefix) and works for any future files added to `src/`.

`FILE_MAP` paths (`db/*.csv`) are unchanged — they already resolve against CWD (project root).

Backup path is unchanged (absolute path).

### 2. `src/budget_calculator.html` — no changes needed

All paths in the HTML (`assets/favicon.png`, `db/*.csv`, `db/test/*.csv`, `/api/save/*`) are fetched from the server, which resolves them against the project root. The `calculations.js` import works because both files are in the same directory.

### 3. `Makefile`

`nohup python3 server.py` becomes `nohup python3 src/server.py`

### 4. `tests/calculations.test.js`

Import path: `../calculations.js` becomes `../src/calculations.js`

### 5. `.gitignore`

- Remove: `prompts/*.md` and `!prompts/requirement_spec_2026_01_11.md` (prompts moved to docs)
- Add: `db/backups/`
- Add: `db/test/`

## Testing Plan

All testing happens on `dev` branch before any merge to `main`:

1. Run `npm test` — verify test import path works
2. `make restart` — verify server starts
3. Open browser — verify HTML loads, CSS renders, favicon shows
4. Verify budget data loads from CSV
5. Toggle test mode — verify test CSV paths work
6. Make a change and verify auto-save works
7. Check all three tabs (Budget, Investments, Debt) load correctly

## Out of Scope

- Extracting JS from HTML (separate future task)
- Extracting CSS from HTML
- Adding build tools
- Renaming the typo in `calulator_data.csv`
