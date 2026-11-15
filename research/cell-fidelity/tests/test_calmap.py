import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "calmap"
spec = importlib.util.spec_from_file_location("calmap_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [k / 100 for k in range(101)]


def linear_cell(Qn=1.0, Qp=3.0, n_li=1.6):
    return dict(g=G, Un=[0.1 * (1 - x) for x in G], Up=[4.4 - y for y in G], Qn=Qn, Qp=Qp, n_li=n_li, vlo=3.5, vhi=4.1)


class CalMap(unittest.TestCase):
    def test_correction_inverts_the_fitted_line(self):
        a, s = 0.5, 0.6
        n_li = 2.0
        for l_true in (0.01, 0.05, 0.2):
            # build an l_law that the line says over-predicts l_true: ln(l_law / l_true) = a + s ln(l_law / n_li)
            l_law = math.exp((math.log(l_true) + a - s * math.log(n_li)) / (1 - s))
            self.assertAlmostEqual(run.corrected(l_law, n_li, a, s), l_true, places=12)

    def test_correction_shrinks_big_losses_more(self):
        n_li = 1.0
        r_small = run.corrected(0.01, n_li) / 0.01
        r_big = run.corrected(0.2, n_li) / 0.2
        self.assertLess(r_big, r_small)
        self.assertIsNone(run.corrected(None, n_li))

    def test_fit_correction_recovers_constants(self):
        a, s = 0.658, 0.577
        pairs = []
        for k in range(1, 30):
            l_law, n_li = 0.002 * k, 1.0 + 0.01 * k
            pairs.append((l_law, l_law / math.exp(a + s * math.log(l_law / n_li)), n_li))
        fa, fs = run.fit_correction(pairs)
        self.assertAlmostEqual(fa, a, places=9)
        self.assertAlmostEqual(fs, s, places=9)

    def test_map_energy_floors_at_the_cycle9_loss_and_falls_with_loss(self):
        cell = linear_cell()
        lost = [0.01] * 100
        self.assertAlmostEqual(run.map_energy(cell, lost, 5.0, 0.0), 5.0, places=12)
        self.assertLess(run.map_energy(cell, lost, 5.0, 0.2), run.map_energy(cell, lost, 5.0, 0.1))

    def test_frozen_constants_match_the_dev_fit(self):
        # the pooled fit on 5u's committed Ai2020 pools, as frozen in the 5v plan
        d = run.EXP / "freshlaw"
        if not (d / "bench.jsonl").exists():
            self.skipTest("5u bench not present")
        runs, bal, ocp = run._load(d)
        pairs = [(r["l_law"], r["l_true"], r["n_li"]) for c in run.FL.CONDITIONS if c.startswith("Ai2020")
                 for r in run.rows_of(c, runs, bal, ocp)[0]]
        a, s = run.fit_correction(pairs)
        self.assertAlmostEqual(a, run.A_FROZEN, places=3)
        self.assertAlmostEqual(s, run.S_FROZEN, places=3)


if __name__ == "__main__":
    unittest.main()
