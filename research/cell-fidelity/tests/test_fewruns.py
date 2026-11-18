import importlib.util
import random
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "fewruns"
spec = importlib.util.spec_from_file_location("fewruns_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


class FewRuns(unittest.TestCase):
    def test_interp_is_linear_between_grid_points(self):
        g = [float(i) for i in range(len(run.GRID))]   # error = grid index
        self.assertAlmostEqual(run.interp(g, 0.25 * 7 + 0.1), 7.4, places=9)
        self.assertEqual(run.interp(g, -5.0), 0.0)                   # clamped low
        self.assertEqual(run.interp(g, 1e6), float(len(g) - 1))       # clamped high
        g[8] = None
        self.assertIsNone(run.interp(g, 0.25 * 7 + 0.1))

    def test_pool_err_skips_failed_forecasts(self):
        a = [0.1] * len(run.GRID)
        b = [None] * len(run.GRID)
        c = [0.3] * len(run.GRID)
        self.assertAlmostEqual(run.pool_err([dict(egrid=a), dict(egrid=b), dict(egrid=c)], 30.0), 0.2, places=12)

    def test_draw_b_takes_one_pool(self):
        train = [dict(pool=f"p{i % 5}", k_star=float(i)) for i in range(160)]
        rng = random.Random(0)
        for _ in range(50):
            got = run.draw_b(rng, train, 10)
            self.assertEqual(len({r["pool"] for r in got}), 1)
            self.assertEqual(len({id(r) for r in got}), 10)

    def test_quantile_and_smallest_k(self):
        self.assertEqual(run.quantile(list(range(11)), 0.9), 9)
        P = {"x": dict(full=0.05, A={"1": dict(q90=0.2), "3": dict(q90=0.07), "5": dict(q90=0.055)})}
        self.assertEqual(run.smallest_k(P, (1, 3, 5)), 5)
        self.assertIsNone(run.smallest_k(P, (1, 3)))

    def test_verdicts(self):
        def pool(st, phys, full, a1, a10, b10, q):
            A = {str(k): dict(med=a10, q90=q) for k in run.KS_A}
            A["1"] = dict(med=a1, q90=a1 + 0.05)
            A["10"] = dict(med=a10, q90=a10 + 0.005)
            return dict(set=st, phys=phys, full=full, A=A, B={"10": dict(med=b10, q90=b10)})
        P = {f"{s}{i}": pool(s, 0.09, 0.05, 0.08, 0.055, 0.056, 0.055)
             for s in ("Chen2020", "OKane2022", "Ai2020", "NCA_Kim2011") for i in range(6)}
        v = run.verdicts(P)
        self.assertEqual({v[h] for h in ("H177", "H178", "H179", "H180", "H181")}, {"supported"})
        P = {k: pool(d["set"], 0.09, 0.05, 0.02, 0.09, 0.2, 0.2) for k, d in P.items()}
        v = run.verdicts(P)
        self.assertEqual({v[h] for h in ("H177", "H178", "H179", "H180", "H181")}, {"refuted"})


if __name__ == "__main__":
    unittest.main()
