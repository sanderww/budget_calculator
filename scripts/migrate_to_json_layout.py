"""Migrate legacy db/*.csv layout to db/transactions/ + db/config.{public,private}.json.

Usage (from repo root):
    python3 scripts/migrate_to_json_layout.py [db_dir]

`db_dir` defaults to ./db. The script is non-destructive: it reads the legacy
files and writes the new files alongside them. It refuses to run if any of the
six target files already exist.

Public params (sourced from any input file that contains them) go to
config.public.json. Everything else goes to config.private.json. Legacy params
`future_years_to_project` and `assumed_future_monthly` are dropped.

Param values are coerced int -> float -> str (matching the client's existing
flexibility). Date-shaped strings like "2026-06-25" stay as strings.
"""
import json
import sys
from pathlib import Path

# Source of truth: src/calculations.js (PUBLIC_PARAMS Set).
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
    'config.public.json',
    'config.private.json',
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


def _coerce(raw: str):
    """Coerce a raw CSV cell to int -> float -> str."""
    try:
        return int(raw)
    except (ValueError, TypeError):
        pass
    try:
        return float(raw)
    except (ValueError, TypeError):
        pass
    return raw


def _params_from(text: str) -> dict:
    out = {}
    for row in _split_rows(text):
        if not _is_param_row(row):
            continue
        key, val = _parse_param_row(row)
        if key and key not in DROPPED_LEGACY_PARAMS:
            out[key] = _coerce(val)
    return out


def _transactions_from(text: str) -> list:
    """Return non-param, non-header rows verbatim."""
    return [row for row in _split_rows(text)
            if not _is_param_row(row) and not _is_header(row)]


def _emit_config(d: dict) -> str:
    """Pretty-print JSON, keys sorted alphabetically, 2-space indent."""
    sorted_d = {k: d[k] for k in sorted(d.keys())}
    return json.dumps(sorted_d, indent=2)


def migrate(db_dir: Path) -> None:
    db_dir = Path(db_dir)
    existing = [t for t in TARGET_FILES if (db_dir / t).exists()]
    if existing:
        sys.stderr.write(
            'ERROR: refusing to migrate - these target files already exist:\n'
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

    (db_dir / 'transactions').mkdir(parents=True, exist_ok=True)
    (db_dir / 'config.public.json').write_text(_emit_config(public))
    (db_dir / 'config.private.json').write_text(_emit_config(private))

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
    print(f'  config.public.json:  {len(public)} params')
    print(f'  config.private.json: {len(private)} params')
    for rel in ('transactions/budget.csv', 'transactions/ra.csv',
                'transactions/investments.csv', 'transactions/debt.csv'):
        rows = _split_rows(_read(db_dir / rel))
        print(f'  {rel}: {len(rows)} rows')
    dropped_seen = sorted({
        k for src in (retirement, ra, investments, budget_legacy, debt)
        for row in _split_rows(src) if _is_param_row(row)
        for k, _ in [_parse_param_row(row)]
        if k in DROPPED_LEGACY_PARAMS
    })
    if dropped_seen:
        print(f'  dropped legacy params: {", ".join(dropped_seen)}')


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('db')
    migrate(target)
