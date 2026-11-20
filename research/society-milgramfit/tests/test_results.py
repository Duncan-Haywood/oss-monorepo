"""Pin the headline numbers in experiments/results.txt (and so in the README) to the code.

Added by the 2026-11-20 quality audit: no test checked p* or the enforcer table, so a change in
the imported society-enforcers model, or a results.txt left stale after one, went unnoticed.
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_milgramfit import min_enforcers, p_star  # noqa: E402

TEXT = (ROOT / "experiments" / "results.txt").read_text()


class Results(unittest.TestCase):
    def test_p_star_rows_match_code(self):
        rows = re.findall(r"^M=\s*(\d+) p\*=([0-9.]+)$", TEXT, re.M)
        self.assertEqual([int(m) for m, _ in rows], [3, 5, 9, 15, 25])
        for m, printed in rows:
            self.assertAlmostEqual(p_star(int(m)), float(printed), delta=6e-4, msg=f"M={m}")

    def test_enforcer_table_corners_match_code(self):
        table = {}
        for line in TEXT.split("== B.")[1].split("== C.")[0].splitlines():
            parts = line.split()
            if parts and re.fullmatch(r"0\.\d", parts[0]):
                table[float(parts[0])] = [float(v) for v in parts[1:]]
        rhos = (0.0, 0.1, 0.2, 0.3)
        for p0, col in ((0.1, 0), (0.1, 3), (0.5, 0), (0.5, 3), (0.9, 3)):
            self.assertAlmostEqual(min_enforcers(rhos[col], 9, p0), table[p0][col], delta=6e-4,
                                   msg=f"p0={p0} rho={rhos[col]}")

    def test_readme_headline_numbers_are_in_results(self):
        readme = (ROOT / "README.md").read_text()
        for n in ("0.786", "0.075", "0.123", "0.092", "0.126", "0.054"):
            self.assertIn(n, TEXT)
        for pct in ("0.786", "7.5%", "12.3%", "9.2%", "12.6%", "5.4%"):
            self.assertIn(pct, readme)


if __name__ == "__main__":
    unittest.main()
