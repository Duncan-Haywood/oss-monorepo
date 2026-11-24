"""Tests for experiments/dirgate7ze (milestone 7ze): the direction-aware drift gate's pure helpers and H377 to H381."""
import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


Z = _mod("dirgate7ze_run", EXP / "dirgate7ze" / "run.py")


class TestGate(unittest.TestCase):
    def test_thresholds_fixed_in_plan(self):
        self.assertEqual(Z.S_MIN, 0.80)
        self.assertEqual(Z.S_SENS, (0.70, 0.90))
        self.assertEqual(Z.D_MIN, 0.10)

    def test_share_ignores_exact_ones(self):
        self.assertEqual(Z.share([0.5, 0.6, 1.0, 1.4]), 2 / 3)
        self.assertTrue(math.isnan(Z.share([1.0, 1.0])))

    def test_two_way_drift_is_off_even_when_large(self):
        ms = [0.5, 0.6, 1.5, 1.6]                # median |m - 1| = 0.5, but half each way
        self.assertTrue(Z.gate_d(ms))
        self.assertFalse(Z.gate_s(ms))

    def test_one_way_large_drift_is_on(self):
        self.assertTrue(Z.gate_s([0.3, 0.4, 0.5, 0.6, 1.05]))     # s = 0.8, median |m - 1| = 0.5

    def test_one_way_small_drift_is_off(self):
        self.assertFalse(Z.gate_s([0.95, 0.96, 0.97, 0.98]))       # gD off

    def test_compose_and_set_on(self):
        fh = [dict(set="A", pool=p, cycles=10.0, met=True) for p in "abcde"]
        ft = [dict(set="A", pool=p, cycles=50.0, met=False) for p in "abcde"]
        on = {("A", p): p in "abc" for p in "abcde"}
        got = Z.compose(on, fh, ft)
        self.assertEqual([f["cycles"] for f in got], [10.0, 10.0, 10.0, 50.0, 50.0])
        self.assertEqual(Z.set_on(on), {"A": True})
        self.assertEqual(Z.set_on({("A", p): p == "a" for p in "abcde"}), {"A": False})


class TestJudge(unittest.TestCase):
    def test_all_supported(self):
        v = Z.judge(8, 38, (-28.0, -3.0), -15.0, (-25.0, -0.5), 0)
        self.assertEqual(set(v.values()), {"supported"})

    def test_edges(self):
        v = Z.judge(7, 36, (-28.0, 0.0), -15.0, (-25.0, 0.0), 1)
        self.assertEqual(v["H377"], "inconclusive")
        self.assertEqual(v["H378"], "inconclusive")
        self.assertEqual(v["H379"], "inconclusive")
        self.assertEqual(v["H380"], "inconclusive")
        self.assertEqual(v["H381"], "supported")

    def test_refuted(self):
        v = Z.judge(6, 35, (0.5, 3.0), -10.0, (0.1, 2.0), 2)
        self.assertEqual(set(v.values()), {"refuted"})

    def test_mean_above_thetaD_refutes_h379(self):
        self.assertEqual(Z.judge(8, 38, (-20.0, -1.0), -14.0, (-1, -0.1), 0)["H379"], "refuted")


if __name__ == "__main__":
    unittest.main()
