import itertools, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_capsequence import seq as S


class T(unittest.TestCase):
    def test_area_two_steps(self):
        # lathe (4 wk) then stamping (3 wk): closure holds from each finish time to the horizon
        o = ("lathe", "stamping")
        g = S.K.L.gains()
        a, b = S.K.gain({"lathe"}, "mass", g), S.K.gain({"lathe", "stamping"}, "mass", g)
        self.assertAlmostEqual(S.area(o, "mass", 20, g=g), a * 3 + b * 13)

    def test_horizon_before_first_step_is_zero(self):
        self.assertEqual(S.area(("lathe",), "mass", 3), 0.0)

    def test_dp_matches_brute_force_on_subset(self):
        costs = {k: S.CAPS[k] for k in ("lathe", "stamping", "winding", "heat-treat", "grinding")}
        g = S.K.L.gains()
        keys = sorted(costs)
        brute = max(S.area(o, "cost", 15, costs, g) for o in itertools.permutations(keys))
        _, v = S.best_orders_fast("cost", 15, costs, g)
        self.assertAlmostEqual(v, brute)

    def test_optimum_beats_or_ties_every_rule(self):
        for m in ("mass", "cost"):
            _, v = S.best_orders_fast(m, 40)
            for o in (S.greedy_next(m, 40), S.greedy_next(m, 40, rule="gain"), S.frontier_order(m)):
                self.assertLessEqual(S.area(o, m, 40), v + 1e-9)

    def test_orders_are_permutations(self):
        for o in (S.greedy_next("mass", 40), S.lookahead_order("mass"), S.frontier_order("cost"), S.best_orders_fast("mass", 40)[0]):
            self.assertEqual(sorted(o), sorted(S.CAPS))

    def test_longer_horizon_never_lowers_area(self):
        o = S.best_orders_fast("mass", 30)[0]
        self.assertLessEqual(S.area(o, "mass", 30), S.area(o, "mass", 40))


if __name__ == "__main__":
    unittest.main()
