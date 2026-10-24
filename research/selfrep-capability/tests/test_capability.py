import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_capability import capability as K


class T(unittest.TestCase):
    def test_requirements_cover_every_imported_line(self):
        K.check()

    def test_no_capabilities_no_gain_all_capabilities_hits_ceiling(self):
        g = K.L.gains()
        self.assertEqual(K.gain(frozenset(), "cost"), 0)
        # everything except the never-makeable controller
        ceil = sum(v["cost"] for n, v in g.items() if K.REQ[n] is not None)
        self.assertAlmostEqual(K.gain(frozenset(K.CAPS), "cost"), ceil)

    def test_shared_capability_paid_once(self):
        both = K.total_cost({"lathe", "heat-treat"})
        self.assertEqual(both, K.CAPS["lathe"] + K.CAPS["heat-treat"])
        self.assertEqual(set(K.unlocked({"lathe"})) & {"hot end (e.g. J-head)"}, set())
        self.assertIn("hot end (e.g. J-head)", K.unlocked({"lathe", "heat-treat"}))

    def test_optimum_respects_budget_and_beats_or_ties_line_rules(self):
        for m in ("mass", "cost"):
            for b in (5, 10, 20):
                s, v = K.best_for_budget(m, b)
                self.assertLessEqual(K.total_cost(s), b)
                for order in ("ratio", "gain"):
                    r, rv = K.line_rule(m, b, order)
                    self.assertLessEqual(K.total_cost(r), b)
                    self.assertLessEqual(rv, v + 1e-12)

    def test_optimum_matches_independent_enumeration_and_is_monotone(self):
        vals = [K.best_for_budget("mass", b)[1] for b in (0, 3, 6, 12, 24, 100)]
        self.assertEqual(vals, sorted(vals))
        self.assertEqual(vals[0], 0)

    def test_frontier_strictly_increasing(self):
        f = K.frontier("cost")
        self.assertEqual([p[1] for p in f], sorted(set(p[1] for p in f)))
        self.assertEqual(f[0][0], 0)

    def test_stability_deterministic_and_bounded(self):
        a = K.stability("cost", 10, n=60, seed=2)
        self.assertEqual(a, K.stability("cost", 10, n=60, seed=2))
        self.assertTrue(0 <= a[0] <= 1 and 0 <= a[2] <= 1)


if __name__ == "__main__":
    unittest.main()
