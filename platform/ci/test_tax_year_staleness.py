import tempfile
import unittest
from pathlib import Path

import tax_year_staleness as t


class Scan(unittest.TestCase):
    def mk(self, files):
        d = Path(tempfile.mkdtemp())
        for name, text in files.items():
            (d / name).write_text(text)
        return d

    def test_old_year_flagged(self):
        d = self.mk({"calc.mjs": "// IRS Rev. Proc. 2025-16 limits\n// IRS IRS tax limit for 2025\n"})
        newest, auth, _ = t.scan(d, 2026)
        self.assertEqual(newest, 2025)
        self.assertGreaterEqual(auth, 2)

    def test_current_year_wins(self):
        d = self.mk({"calc.mjs": "// tax limit 2025\n// tax limit 2026\n"})
        self.assertEqual(t.scan(d, 2026)[0], 2026)

    def test_tests_and_money_amounts_ignored(self):
        d = self.mk({"calc.test.mjs": "// tax 2026\n", "calc.mjs": "// tax rate $2,025 and 12025\n"})
        self.assertEqual(t.scan(d, 2026)[0], 0)


if __name__ == "__main__":
    unittest.main()
