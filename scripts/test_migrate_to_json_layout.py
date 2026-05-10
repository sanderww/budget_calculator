"""Unit tests for scripts/migrate_to_json_layout.py.

Run from repo root: python3 -m unittest scripts.test_migrate_to_json_layout
"""
import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import migrate_to_json_layout as m  # noqa: E402


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

    def _read_json(self, rel):
        return json.loads(self._read(rel))

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
            'param,next_payment,2026-06-25\n'
            '2026-02-15,Bonus,5000\n'
        )

        with redirect_stdout(io.StringIO()):
            m.migrate(self.db)

        public = self._read_json('config.public.json')
        self.assertEqual(public.get('life_expectancy'), 95)
        self.assertEqual(public.get('return_ra_pct'), 10)
        self.assertEqual(public.get('cpi_pct'), 5)
        self.assertEqual(public.get('nominal_return_pct'), 10)
        self.assertNotIn('dob', public)
        self.assertNotIn('marginal_rate', public)
        self.assertNotIn('principal', public)

        private = self._read_json('config.private.json')
        self.assertEqual(private.get('dob'), '1985-08-08')
        self.assertEqual(private.get('retirement_age'), 65)
        self.assertEqual(private.get('marginal_rate'), 41)
        self.assertEqual(private.get('tax_refund_rate_pct'), 41)
        self.assertEqual(private.get('principal'), 500000)
        self.assertEqual(private.get('interest_rate'), 11.25)
        self.assertEqual(private.get('next_payment'), '2026-06-25')

        # Legacy params dropped
        self.assertNotIn('future_years_to_project', private)
        self.assertNotIn('future_years_to_project', public)
        self.assertNotIn('assumed_future_monthly', private)
        self.assertNotIn('assumed_future_monthly', public)

        # Keys are sorted alphabetically in the on-disk JSON
        self.assertEqual(list(public.keys()), sorted(public.keys()))
        self.assertEqual(list(private.keys()), sorted(private.keys()))

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

        # Headers are emitted on transaction files whose JS parser slices(1).
        # RA's parser is content-tolerant and the example file has no header.
        self.assertTrue(self._read('transactions/budget.csv').startswith(
            'type,description,amount,date\n'))
        self.assertTrue(self._read('transactions/investments.csv').startswith(
            'Date,Description,amount,account type,crypto_value\n'))
        self.assertTrue(self._read('transactions/debt.csv').startswith(
            'Date,Description,Amount\n'))
        self.assertFalse(self._read('transactions/ra.csv').startswith(
            'Date,'))

        # Param rows must NOT leak into transaction files
        for rel in ('transactions/ra.csv', 'transactions/investments.csv',
                    'transactions/debt.csv', 'transactions/budget.csv'):
            self.assertNotIn('param,', self._read(rel))

        # Old files left in place (non-destructive)
        self.assertTrue((self.db / 'retirement.csv').exists())
        self.assertTrue((self.db / 'investments.csv').exists())

    def test_refuses_to_clobber_existing_targets(self):
        self._write('retirement.csv', 'param,dob,1985-08-08,\n')
        self._write('config.public.json', '{}')  # existing target

        with self.assertRaises(SystemExit):
            with redirect_stdout(io.StringIO()):
                m.migrate(self.db)

    def test_handles_missing_source_files(self):
        # Only retirement.csv exists; the others should be treated as empty.
        self._write('retirement.csv', 'param,return_ra_pct,9,\n')

        with redirect_stdout(io.StringIO()):
            m.migrate(self.db)

        self.assertEqual(self._read_json('config.public.json'),
                         {'return_ra_pct': 9})
        self.assertEqual(self._read('transactions/ra.csv'), '')
        self.assertEqual(self._read('transactions/budget.csv'), '')
        self.assertEqual(self._read('transactions/investments.csv'), '')
        self.assertEqual(self._read('transactions/debt.csv'), '')


if __name__ == '__main__':
    unittest.main()
