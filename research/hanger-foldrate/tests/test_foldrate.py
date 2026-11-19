import re
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE.parent / "hanger-cell" / "src"))
from dataclasses import replace  # noqa: E402

from hanger_cell.model import Params, replicate  # noqa: E402


class FoldRate(unittest.TestCase):
    def test_source_arithmetic(self):
        # 30-40 folds/h (Avigal et al. 2022 abstract) -> 120 and 90 s per fold
        self.assertEqual(3600 / 40, 90.0)
        self.assertEqual(3600 / 30, 120.0)

    def test_hanger_cell_default_reproduced(self):
        r = replicate(Params(), 50)
        self.assertGreater(r["per_hour"], 150)      # hanger-cell's reported 169/h with 25 s fold

    def test_slow_fold_is_fold_bound_and_hanging_wins(self):
        p = replace(Params(), t_fold=120.0)
        fold = replicate(replace(p, policy="always_fold"), 50)["per_hour"]
        hang = replicate(replace(p, policy="always_hang"), 50)["per_hour"]
        self.assertGreater(hang, 2 * fold)
        self.assertLess(fold, 3600 / 120 * 1.05)    # one table cannot beat 30 items/h

    def test_results_file_has_crossover(self):
        txt = (HERE / "experiments" / "results.txt").read_text()
        self.assertTrue(re.search(r"crossover t_fold = [\d.]+ s", txt))

    def test_section_a_matches_utilisation_law(self):
        # Fold-bound cell: items/h ~ 3600 / (t_fold * folded per item); dryers = items/h * 45/60 / 25.
        txt = (HERE / "experiments" / "results.txt").read_text()
        for t in ("90", "120", "600"):
            row = re.search(r"^.{25} +%s +([\d.]+) +([\d.]+) +[\d.]+ +([\d.]+)" % t, txt, re.M)
            per_h, dryers, folded = map(float, row.groups())
            self.assertAlmostEqual(per_h, 3600 / (float(t) * folded / 25), delta=0.03 * per_h)
            self.assertAlmostEqual(dryers, per_h * 45 / 60 / 25, delta=0.051)


if __name__ == "__main__":
    unittest.main()
