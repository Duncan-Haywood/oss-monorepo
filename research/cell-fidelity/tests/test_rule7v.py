"""Tests for experiments/rule7v (milestone 7v): the per-fold correction fit, the E[10] swap, and H336 to H339's
verdicts."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


V = _mod("rule7v_run", EXP / "rule7v" / "run.py")


class Fit(unittest.TestCase):
    def test_picks_the_observable_that_orders_m_and_fits_its_line(self):
        tr = [dict(m=1 + 0.5 * k, O1=(k * 7) % 5, O2=-(k % 3), O3=0.1 * k) for k in range(10)]
        best, beta = V.fit_c(tr)
        self.assertEqual(best, "O3")
        self.assertAlmostEqual(beta[0], 1.0, places=9)
        self.assertAlmostEqual(beta[1], 5.0, places=9)

    def test_picks_by_absolute_rank_correlation(self):
        tr = [dict(m=float(k), O1=-2.0 * k, O2=0.0 if k % 2 else 1.0, O3=(k * 3) % 7) for k in range(8)]
        self.assertEqual(V.fit_c(tr)[0], "O1")


class Swap(unittest.TestCase):
    def test_only_e10_changes(self):
        rows = [dict(set="A", j=1, E={10: 0.3, 15: 0.2, 50: 0.1}, mC=0.8),
                dict(set="A", j=2, E={10: 0.4, 15: 0.3, 50: 0.2}, mC=1.1)]
        new = V.with_e10(rows, {("A", 1): 0.05, ("A", 2): 0.06})
        self.assertEqual([r["E"][10] for r in new], [0.05, 0.06])
        self.assertEqual([r["E"][15] for r in new], [0.2, 0.3])
        self.assertEqual([r["mC"] for r in new], [0.8, 1.1])

    def test_original_rows_untouched(self):
        rows = [dict(set="A", j=1, E={10: 0.3, 50: 0.1})]
        V.with_e10(rows, {("A", 1): 0.0})
        self.assertEqual(rows[0]["E"][10], 0.3)


def _p(du, dt, duc):
    return {("thetaC", "U"): dict(mean=du), ("thetaC", "theta"): dict(mean=dt), ("thetaC", "UC"): dict(mean=duc)}


def _per(a, b):
    return {"X": {"thetaC": dict(met=a, n=5)}, "Y": {"thetaC": dict(met=b, n=5)}}


class Judge(unittest.TestCase):
    def test_all_supported(self):
        v = V.judge(_p(-10, -15, -1), _per(5, 4))
        self.assertEqual(set(v.values()), {"supported"})

    def test_all_refuted(self):
        v = V.judge(_p(2, 0, 3), _per(5, 2))
        self.assertEqual(v, dict(H336="refuted", H337="refuted", H338="refuted", H339="refuted"))

    def test_ties_are_inconclusive(self):
        v = V.judge(_p(0, -3, 0), _per(3, 5))
        self.assertEqual(set(v.values()), {"inconclusive"})


if __name__ == "__main__":
    unittest.main()
