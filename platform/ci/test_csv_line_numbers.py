"""Run csv_line_numbers.mjs: every venture copy of the shared parseCsv names
each row's file line, and no row loop reports its table index instead
(red-team run 2026-11-16). The Node file holds the checks; this wrapper lets
unwired_checks.py run it on every pull request."""
import shutil
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class CsvLineNumbersTest(unittest.TestCase):
    @unittest.skipIf(shutil.which("node") is None, "node is not installed")
    def test_every_parser_copy_reports_file_lines(self):
        r = subprocess.run(["node", str(HERE / "csv_line_numbers.mjs")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
