import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
import run


class T(unittest.TestCase):
    def test_null_near_chance(self):
        self.assertAlmostEqual(run.auc(150, run.REAL, ("raw", "gboost"), 0), 0.5, delta=0.12)

    def test_big_mismatch_detected_at_small_n(self):
        self.assertGreater(run.auc(150, dict(run.REAL, coul=0.0), ("raw", "gboost"), 0), 0.9)

    def test_twin_list_starts_with_null(self):
        self.assertEqual(run.TWINS[0][1], run.REAL)


if __name__ == "__main__":
    unittest.main()
