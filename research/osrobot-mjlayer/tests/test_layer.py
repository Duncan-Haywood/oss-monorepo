import math, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
import run  # noqa: E402


class T(unittest.TestCase):
    def test_thick_layer_is_hertz(self):
        # F = 4 E sqrt(R) d^1.5 / (3 (1-nu^2)); thick h -> chi -> 0
        d, r, e = 1e-4, 0.004, 1e4
        hertz = 4 * e * math.sqrt(r) * d ** 1.5 / (3 * 0.75)
        self.assertAlmostEqual(run.force(d, r, e, 100.0) / hertz, 1.0, places=3)

    def test_models_agree_at_first_order(self):
        self.assertEqual(run.DIMITRIADIS[0], run.GARCIA[0])
        self.assertAlmostEqual(run.poly(0.01, run.DIMITRIADIS), run.poly(0.01, run.GARCIA), places=3)

    def test_thinner_layer_is_stiffer(self):
        self.assertGreater(run.force(1e-3, 0.004, 1e4, 0.005), run.force(1e-3, 0.004, 1e4, 0.02))

    def test_depth_inverts_force(self):
        f = run.force(2e-3, 0.004, 1e4, 0.01)
        self.assertAlmostEqual(run.depth(f, 0.004, 1e4, 0.01), 2e-3, places=9)

    def test_trial_force_exceeds_budget(self):
        # 10 mm lip at 10 kPa, 4 mm tip: 53.3 N is far above the force that reaches 30 % of h
        self.assertGreater(53.3, 5 * run.budget(0.004, 1e4, 0.010))

    def test_monotone_in_modulus(self):
        self.assertLess(run.budget(0.004, 4e3, 0.01), run.budget(0.004, 45e3, 0.01))


if __name__ == "__main__":
    unittest.main()
