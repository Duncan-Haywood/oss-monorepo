import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "plateau"
spec = importlib.util.spec_from_file_location("plateau_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["plateau_run"] = run
spec.loader.exec_module(run)


class Plateau(unittest.TestCase):
    def test_inv_un_linear_and_clamped(self):
        g = [0.0, 0.5, 1.0]
        un = [1.0, 0.5, 0.0]
        self.assertAlmostEqual(run.inv_un(g, un, 0.25), 0.75)
        self.assertEqual(run.inv_un(g, un, 2.0), 0.0)
        self.assertEqual(run.inv_un(g, un, -1.0), 1.0)

    def test_inv_un_flat_step_takes_first_point(self):
        g = [0.0, 0.25, 0.5, 0.75, 1.0]
        un = [1.0, 0.5, 0.5, 0.5, 0.0]
        self.assertAlmostEqual(run.inv_un(g, un, 0.5), 0.25)
        self.assertAlmostEqual(run.inv_un(g, un, 0.25), 0.875)

    def test_inv_un_bump_uses_running_minimum(self):
        g = [0.0, 0.5, 1.0]
        un = [1.0, 0.4, 0.45]
        self.assertAlmostEqual(run.inv_un(g, un, 0.7), 0.25)

    def _b(self):
        bal, ocp = run.WL.SF._bal(run.EXP / "crossset")
        key = next(k for k in bal if run.SK.pset(k[0]) == "Chen2020")
        return run.CN._b(bal, ocp, key)

    def test_node_lever_at_window_top_is_the_law(self):
        b = self._b()
        eta, l2 = 0.02, 1e-4 * b["n_li"]
        x2 = run.CN.x_hi(b["n_li"] - l2, b, eta)
        du = run.node_lever(b, eta, [x2, x2], [0.5, 0.5], l2)
        for l in (0.0, l2, 0.01 * b["n_li"], 0.05 * b["n_li"]):
            self.assertAlmostEqual(du(l), run.CN.du_eta(l, b, eta), places=9)

    def test_with_du_keeps_tables(self):
        t = ([0.0, 1.0], [5.0, 6.0], [1.0, 1.1])
        self.assertEqual(run.with_du(t, lambda l: 2 * l), ([0.0, 1.0], [0.0, 2.0], [1.0, 1.1]))

    def test_sign_p(self):
        self.assertAlmostEqual(run.sign_p(0, 4), 1.0)
        self.assertAlmostEqual(run.sign_p(4, 4), 1 / 16)
        self.assertLess(run.sign_p(26, 40), 0.05)
        self.assertGreater(run.sign_p(25, 40), 0.05)

    def test_verdicts(self):
        S = {s: dict(lr99=0.1, lr10=0.2, eN=0.02, eA=0.05) for s in ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")}
        V = run.verdicts(S, 30, {s: 0.02 for s in S})
        self.assertEqual([V[h] for h in ("H204", "H205", "H206", "H207", "H208")], ["supported"] * 5)
        S = {s: dict(lr99=0.5, lr10=0.9, eN=0.1, eA=0.05) for s in S}
        V = run.verdicts(S, 15, {s: 0.02 for s in S})
        self.assertEqual([V[h] for h in ("H204", "H205", "H206", "H207", "H208")], ["refuted"] * 5)


if __name__ == "__main__":
    unittest.main()
