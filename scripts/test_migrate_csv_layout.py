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
