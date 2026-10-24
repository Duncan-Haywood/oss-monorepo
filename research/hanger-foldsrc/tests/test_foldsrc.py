import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_foldsrc.foldsrc import FOLD_SOURCES, run, tables_for  # noqa: E402
from hanger_cell.model import Params, replicate  # noqa: E402


class T(unittest.TestCase):
    def test_default_matches_hanger_cell(self):
        a = run("assumed (hanger-cell)", 1, 1, reps=20)
        b = replicate(Params(), 20)
        self.assertAlmostEqual(a["per_hour"], b["per_hour"])

    def test_slower_fold_serves_fewer_dryers(self):
        d = [run(l, 1, 1, reps=20)["dryers"] for l in ("assumed (hanger-cell)", "SpeedFolding t-shirt", "prior work 3 FPH")]
        self.assertTrue(d[0] > d[1] > d[2])

    def test_more_tables_never_hurt(self):
        a = run("SpeedFolding t-shirt", 2, 1, reps=20)["per_hour"]
        b = run("SpeedFolding t-shirt", 2, 4, reps=20)["per_hour"]
        self.assertGreater(b, a)

    def test_table_one_hour_check(self):
        # analytic: one table at 116.9 s cannot clear faster than 3600/116.9 = 30.8 garments/h of folds
        r = run("SpeedFolding t-shirt", 2, 1, policy="always_fold", reps=20)
        self.assertLessEqual(r["per_hour"], 3600 / 116.9 * 1.25 + 1)

    def test_tables_for_monotone(self):
        self.assertLessEqual(tables_for("SpeedFolding towel", 2, 2.0, reps=10), tables_for("SpeedFolding t-shirt", 2, 2.0, reps=10))


if __name__ == "__main__":
    unittest.main()
