# Budget Calculator — Claude Instructions

## Git Workflow

**All changes must be made on the `dev` branch.**

- Never commit directly to `main`
- Work on `dev` for all features, fixes, and experiments
- Only merge to `main` when the user explicitly confirms they are happy with the changes
- After merging to local `main`, push to remote `main`

### Merge procedure (only when user approves)
```
git checkout main
git merge dev
git push origin main
git checkout dev
```

After merging, stay on `dev` for continued work.

## Protected Paths

**`/Users/sanderwiersma/Documents/budget_backups/`** is strictly off-limits.

- NEVER read, write, delete, list, or access any file in this directory
- NEVER use this path in any shell command (curl, cat, cp, rm, ls, etc.)
- NEVER modify server.py in a way that changes or removes the backup location or backup logic
- This directory contains critical financial data backups — it exists as a safety net and must remain untouched by Claude at all times

## Documentation

Whenever a new feature is added or existing functionality is changed, **both** spec documents must be updated before the work is considered complete:

- `docs/specs/core-requirements.md` — update goals, domain concepts, formulas, and hard requirements
- `docs/specs/functional-requirements.md` — update the detailed functional description to match the new behaviour

## Data Safety

- NEVER POST to real save endpoints (`/api/save/budget`, `/api/save/investments`, `/api/save/debt`) in any test, verification, or curl command
- Only use test keys (`test_budget`, `test_investments`, `test_debt`) for verification
- The `db/*.csv` files contain real financial data — treat them as sensitive
