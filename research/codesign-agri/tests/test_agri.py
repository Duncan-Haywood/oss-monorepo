import glob, json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_agri import agri as A


class AgriTests(unittest.TestCase):
    def test_softer_pad_grips_better(self):
        self.assertGreater(A._mu(0.05), A._mu(3.0))

    def test_cost_cap_marks_infeasible(self):
        r = A.evaluate([30, 0.05, 12, 90, 1.0])
        self.assertGreater(r["cost"], A.COST_CAP)
        self.assertFalse(r["feasible"])
        self.assertEqual(r["J"], -1.0)

    def test_deterministic_and_fruit_reproducible(self):
        x = [22, 0.3, 4, 55, 0.5]
        self.assertEqual(A.evaluate(x)["J"], A.evaluate(x)["J"])
        self.assertEqual(A.make_fruit(3), A.make_fruit(3))

    def test_weak_grip_drops_the_berry(self):
        f = {"d": 30, "ripe": 0.2, "ripe_hat": 0.2, "err": 0.0, "pull": 2.0, "clutter": 0.99}
        self.assertEqual(A.pick([20, 0.3, 0.5, 55, 0.5], (1.0, 0.0, 1.0), f)["out"], "dropped")

    def test_hard_squeeze_bruises(self):
        f = {"d": 30, "ripe": 1.0, "ripe_hat": 1.0, "err": 0.0, "pull": 2.0, "clutter": 0.99}
        self.assertEqual(A.pick([4, 0.3, 12, 55, 0.5], (1.0, 0.0, 1.0), f)["out"], "bruised")

    def test_narrow_opening_misses_large_berry(self):
        f = {"d": 40, "ripe": 0.2, "ripe_hat": 0.2, "err": 3.0, "pull": 2.0, "clutter": 0.99}
        self.assertEqual(A.pick([20, 0.3, 4, 42, 0.5], (1.0, 0.0, 1.0), f)["out"], "missed")

    def test_wide_opening_catches_neighbours(self):
        f = {"d": 25, "ripe": 0.2, "ripe_hat": 0.2, "err": 0.0, "pull": 2.0, "clutter": 0.0}
        self.assertEqual(A.pick([20, 0.3, 4, 90, 0.5], (1.0, 0.0, 1.0), f)["out"], "knocked")

    def test_faster_arm_picks_faster(self):
        f = A.make_fruit(1, 5)
        slow = sum(A.pick([20, 0.3, 4, 55, 0.2], (1, 0, 1), x)["t"] for x in f)
        fast = sum(A.pick([20, 0.3, 4, 55, 0.9], (1, 0, 1), x)["t"] for x in f)
        self.assertLess(fast, slow)

    def test_proposals_files_are_five_wide_and_in_bounds(self):
        for p in glob.glob(os.path.join(os.path.dirname(__file__), "..", "proposals", "round*.json")):
            for x in json.load(open(p))["designs"]:
                self.assertEqual(len(x), 5)
                for v, lo, hi in zip(x, A.LB, A.UB):
                    self.assertTrue(lo <= v <= hi)


if __name__ == "__main__":
    unittest.main()
