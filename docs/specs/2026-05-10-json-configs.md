# JSON config migration — bundle handoff (2026-05-10)

Operational runbook for the one-off transition from the old all-CSV `db/` layout to the new layout (CSV transactions + JSON configs). Carries a git bundle from the source Mac to the remote laptop. Once both Macs are migrated, this file can be deleted.

The generic `docs/sync-via-bundle.md` covers bundle mechanics in the abstract; this doc is the **specific** runbook for this transition.

## Overview

**Both Macs share the same starting state:**
- `dev` branch carries the post-split CSV code (committed, untested in production).
- Real `db/` directory still has the old all-CSV layout: `calulator_data.csv`, `retirement.csv`, `ra.csv`, `investments.csv`, `debt.csv`. (May also contain stray `config.public.csv` / `config.private.csv` from earlier test work — these are ignored by the migration script and removed during cleanup.)

**End state on both Macs:**
- `db/transactions/{budget,ra,investments,debt}.csv` for transactional rows.
- `db/config.public.json` and `db/config.private.json` for params (flat JSON objects).
- Old all-CSV files removed.

**Order of operations:**
1. Source Mac (this one): code → test mode → real-data migration → verify → bundle.
2. Remote Mac: receive bundle → integrate → real-data migration → verify → push to origin.

---

## On the source Mac — what was already done before creating the bundle

(Recorded here for completeness; the user already executed these.)

1. Code committed on `dev` (JSON conversion + new migration script + this doc).
2. **Pre-migration snapshot** (user runs):
   ```sh
   cp -R db ~/Documents/budget_backups/migration_$(date +%Y%m%d_%H%M%S)
   ```
3. **Test-mode verification:**
   ```sh
   mkdir -p db/test
   cp -R db/examples/* db/test/
   ```
   Start the server (`python3 src/server.py`), toggle test mode on, click through Budget / Investments / Debt / RA / Retirement, edit one value on each tab, confirm round-trip into `db/test/`.
4. **Real-data migration:**
   ```sh
   python3 scripts/migrate_to_json_layout.py
   ```
5. **Real-data verification:** with test mode OFF, open every tab; values should render identically to before. Edit one value on each tab; confirm round-trip into the new files (`db/transactions/*.csv`, `db/config.public.json`, `db/config.private.json`).
6. **Cleanup of legacy files:**
   ```sh
   rm db/calulator_data.csv db/retirement.csv db/ra.csv db/investments.csv db/debt.csv
   rm -f db/config.public.csv db/config.private.csv   # remove any stray pre-migration CSV configs
   ```
7. **Create the bundle:**
   ```sh
   git bundle create /tmp/bc.bundle main dev --not origin/main
   git bundle verify /tmp/bc.bundle
   ```
8. Transfer `/tmp/bc.bundle` and this doc (`docs/migrations/2026-05-10-json-configs.md`) to the remote Mac.

---

## On the remote Mac

### 1. Pre-receive snapshot

User runs:
```sh
cp -R db ~/Documents/budget_backups/migration_$(date +%Y%m%d_%H%M%S)
```
This protects the remote's real data before any code or file change.

### 2. Refresh the clone and import the bundle

```sh
cd /path/to/budget_calculator
git fetch origin
git fetch /path/to/bc.bundle 'refs/heads/*:refs/heads/from-laptop/*'
```

This creates `from-laptop/main` and `from-laptop/dev` locally. Inspect what came across:

```sh
git log from-laptop/dev --oneline
git diff origin/dev..from-laptop/dev --stat
```

### 3. Fast-forward `dev`

```sh
git checkout dev
git merge --ff-only from-laptop/dev
```

If the merge isn't fast-forward, the remote has diverged. Stop and reconcile manually before continuing.

### 4. Test-mode verification (before touching real data)

```sh
mkdir -p db/test
cp -R db/examples/* db/test/
```

Start the server, toggle test mode on, click through every tab, edit one value, confirm round-trip into `db/test/`. If anything fails — stop, do not run the migration on real data, see Rollback.

### 5. Run the migration on real data

```sh
python3 scripts/migrate_to_json_layout.py
```

Expected output: the script prints param counts and row counts per output file. The script refuses to run if any of the six target files (`db/config.public.json`, `db/config.private.json`, the four `db/transactions/*.csv`) already exist.

### 6. Real-data verification

With test mode OFF, open every tab. Confirm every value renders identically to before the migration. Edit one value on each tab; confirm save and reload preserve the change.

### 7. Cleanup

```sh
rm db/calulator_data.csv db/retirement.csv db/ra.csv db/investments.csv db/debt.csv
rm -f db/config.public.csv db/config.private.csv
```

The pre-receive snapshot in `~/Documents/budget_backups/` remains as a safety net.

### 8. Push and merge

Per project workflow (`.claude/CLAUDE.md`):

```sh
git push origin dev
```

When the user is happy, merge to main:

```sh
git checkout main
git merge dev
git push origin main
git checkout dev
```

### 9. Tear down

```sh
git branch -D from-laptop/main from-laptop/dev
rm /path/to/bc.bundle
```

---

## Rollback

If anything fails on either Mac after the migration started, the user runs (Claude must not touch the protected backup path):

```sh
rm -rf db/transactions db/config.public.json db/config.private.json
cp -R ~/Documents/budget_backups/migration_<ts>/* db/
git checkout dev -- src/   # only if the code is the suspected cause
```

---

## Troubleshooting

- **`error: Repository lacks these prerequisite commits: <sha>`** — the destination clone is too old. Run `git fetch origin` first; if it still fails, regenerate the bundle on the source side with `--all`.
- **`ERROR: refusing to migrate — these target files already exist:`** — `db/transactions/` or one of the JSON config files is already present from a partial earlier attempt. Remove the stray targets (or restore the snapshot) before re-running.
- **Test-mode round-trip fails on any tab** — do NOT proceed to the real-data step. Restore `db/test/` from `db/examples/` and investigate. Common causes: server not restarted after `git pull`, browser cache holding old `.csv` URLs (hard reload).
- **`gh` CLI logged in as the wrong account on the remote** — irrelevant for this flow; `git push` over HTTPS uses the macOS keychain, SSH uses `~/.ssh`. Bundle transport doesn't depend on `gh`.
