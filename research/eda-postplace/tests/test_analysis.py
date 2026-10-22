import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_postplace import analysis as A, flow as F  # noqa: E402

LOG = """[INFO] noise
STAGE netlist
Design area 100 u^2 40% utilization.
worst slack max -0.99
STAGE placed
Design area 100 u^2 40% utilization.
worst slack max -2.5
STAGE repaired
Design area 110 u^2 40% utilization.
worst slack max 0.25
"""


class Flow(unittest.TestCase):
    def test_parse_log_periods(self):
        o = F.parse_log(LOG, 5.0)
        self.assertEqual((o["netlist_period_ns"], o["placed_period_ns"], o["repaired_period_ns"]), (5.99, 7.5, 4.75))
        self.assertEqual(o["repaired_area"], 110.0)

    def test_parse_log_missing_stage(self):
        with self.assertRaises(RuntimeError):
            F.parse_log(LOG.split("STAGE repaired")[0], 5.0)


class Analysis(unittest.TestCase):
    rows = [{"cycles": 9, "a": 1, "p": 5.0, "x": 3}, {"cycles": 5, "a": 2, "p": 4.0, "x": 2},
            {"cycles": 2, "a": 3, "p": 6.0, "x": 1}, {"cycles": 4, "a": 4, "p": 4.5, "x": 0}]

    def test_meets(self):
        self.assertEqual(A.meets(self.rows, "p", 4.5), [1, 3])

    def test_front_drops_dominated(self):
        self.assertEqual(sorted(A.front(self.rows, [0, 1, 2, 3], "a")), [0, 1, 2])

    def test_best_shared_and_own_clock(self):
        self.assertEqual(A.best_area_latency(self.rows, [0, 1, 2, 3], "a", 5.0), 2)  # area x cycles: 9, 10, 6, 16
        self.assertEqual(A.best_own_clock(self.rows, "a", "p"), 2)  # a x cycles x p: 45, 40, 36, 72
        self.assertIsNone(A.best_area_latency(self.rows, [], "a", 5.0))

    def test_rho_perfect(self):
        self.assertAlmostEqual(A.rho(self.rows, "a", "a"), 1.0)
        self.assertAlmostEqual(A.rho(self.rows, "a", "x"), -1.0)

    def test_quantiles(self):
        self.assertEqual(A.quantiles([3, 1, 2]), (1, 2, 3))
        self.assertEqual(A.quantiles([4, 1, 2, 3]), (1, 2.5, 4))


if __name__ == "__main__":
    unittest.main()
