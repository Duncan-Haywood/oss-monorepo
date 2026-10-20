import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_repairlabour.model import Params, import_limit, labour_cap, simulate, summarise

P = dict(work_h=50, vit_cost=170, budget=40, life_h=2000)


class RepairLabour(unittest.TestCase):
    def test_labour_cap_formula(self):
        self.assertAlmostEqual(labour_cap(Params(**P, benches=2, repair_h=50)), 80.0)
        self.assertEqual(labour_cap(Params(**P)), math.inf)

    def test_import_limit_matches_repair_balance(self):
        p = Params(**P, repair_cost=0.2, repair_ok=0.9)
        self.assertAlmostEqual(import_limit(p), 40 * 2000 / (170 * 0.3))

    def test_deterministic_given_seed(self):
        p = Params(**P, benches=1)
        self.assertEqual(simulate(p, 1, 4000, 2), simulate(p, 1, 4000, 2))

    def test_queue_cap_zero_is_replace_only(self):
        # never queues, so no machine is ever down for repair
        w, d = simulate(Params(**P, benches=1, queue_cap=0), 1, 6000, 1)
        self.assertEqual(max(d), 0)

    def test_zero_repair_time_has_no_standing_queue(self):
        _, d = simulate(Params(**P, benches=None, repair_h=0.0), 1, 4000, 1)
        self.assertLessEqual(max(d), 2)  # repair events are instantaneous, so at most a sample-boundary tie

    def test_queue_never_exceeds_cap_plus_benches(self):
        _, d = simulate(Params(**P, benches=1, queue_cap=3), 1, 8000, 4)
        self.assertLessEqual(max(d), 4)

    def test_scarce_labour_unbounded_queue_beats_by_cap(self):
        a = summarise(Params(**P, benches=1), 1, 8000, 6)[0]
        b = summarise(Params(**P, benches=1, queue_cap=5), 1, 8000, 6)[0]
        self.assertGreater(b, a)


if __name__ == "__main__":
    unittest.main()
