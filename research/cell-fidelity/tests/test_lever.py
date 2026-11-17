import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "lever"
spec = importlib.util.spec_from_file_location("lever_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


class Lever(unittest.TestCase):
    def test_ratio_is_slope_through_origin(self):
        self.assertAlmostEqual(run.ratio([2.0, 4.0, 6.0], [1.0, 2.0, 3.0]), 2.0, places=12)
        self.assertAlmostEqual(run.ratio([1.0, 0.0], [1.0, 1.0]), 0.5, places=12)
        self.assertIsNone(run.ratio([1.0, 2.0], [0.0, 0.0]))

    def test_rises_are_from_cycle_two(self):
        u = [0.0, 0.10, 0.12, 0.15, 0.20]          # cycles 1..5
        lost = [0.0, 1.0, 2.0, 3.0, 4.0]
        ms, ds = run.rises(u, lambda l: 0.01 * l, lost, 5)
        self.assertEqual(len(ms), 3)
        for got, want in zip(ms, (0.02, 0.05, 0.10)):
            self.assertAlmostEqual(got, want, places=12)
        for got, want in zip(ds, (0.01, 0.02, 0.03)):
            self.assertAlmostEqual(got, want, places=12)

    def test_clamp_and_match(self):
        self.assertEqual(run.clamp(-3.0), 0.0)
        self.assertEqual(run.clamp(1e3), run.KMAX)
        self.assertTrue(run.match(30.0, 25.0))      # 20% off
        self.assertFalse(run.match(40.0, 25.0))     # 60% off
        self.assertFalse(run.match(1.0, 0.0))

    def test_verdict_thresholds(self):
        def pool(st, kp, ks, rin=0.5, e10=0.05, ep=0.1):
            return dict(set=st, k_path=kp, k_star=ks, rho_within=rin, err_10=e10, err_phys=ep)
        P = {f"c{i}": pool("Chen2020", 40.0, 41.0 + i) for i in range(12)}
        P |= {f"a{i}": pool("Ai2020", 22.0, 20.0 + 0.1 * i) for i in range(12)}
        V = run.verdicts(P)
        self.assertEqual(V["H182"], "supported")
        self.assertEqual(V["H183"], "supported")
        self.assertEqual(V["H185"], "supported")
        self.assertEqual(V["H186"], "supported")


if __name__ == "__main__":
    unittest.main()
