import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_dpgrid.model import Params, dp_solve, value, dp_policy, best_switch


class DpGrid(unittest.TestCase):
    def test_index_rule_matches_terminalmarket(self):
        from selfrep_terminalmarket.model import dp_solve as ref
        q = Params(k=0.1, c=5.0, horizon=20.0, dt=1.0)
        a = dp_solve(q, 3.0, n_points=60, u_levels=7, interp="index")[0]
        b = ref(q, 3.0, n_points=60, u_levels=7)[0]
        self.assertAlmostEqual(a, b, places=9)

    def test_zero_horizon_value_is_terminal_value_n_rule(self):
        q = Params(k=0.1, c=5.0, horizon=1.0, dt=1.0)
        v = dp_solve(q, 2.0, n_points=20, u_levels=3, interp="n")[0]
        self.assertGreaterEqual(v, 2.0 - 1e-9)

    def test_n_rule_table_value_not_above_simulated_policy_by_much(self):
        # with linear-in-n interpolation the terminal reward is exact, so the table should not
        # exceed the simulated value of its own policy by more than discretisation error
        q = Params(k=0.1, c=50.0, horizon=40.0, dt=1.0)
        vt, pol, grid = dp_solve(q, 5.0, n_points=300, u_levels=21, interp="n")
        j = value(q, dp_policy(q, pol, grid), 5.0)[0]
        self.assertLess(abs(vt - j) / j, 0.02)

    def test_policy_close_to_best_switch(self):
        q = Params(k=0.1, c=50.0, horizon=40.0, dt=1.0)
        vt, pol, grid = dp_solve(q, 5.0, n_points=300, u_levels=21, interp="n")
        j = value(q, dp_policy(q, pol, grid), 5.0)[0]
        self.assertGreater(j, 0.97 * best_switch(q, 5.0)[1])


if __name__ == "__main__":
    unittest.main()
