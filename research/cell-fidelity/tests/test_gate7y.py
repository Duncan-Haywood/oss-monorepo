"""Tests for experiments/gate7y (milestone 7y): H349 to H353's verdicts, the early plating share and the gates."""
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


Y = _mod("gate7y_run", EXP / "gate7y" / "run.py")


class TestPhi10(unittest.TestCase):
    def test_share_over_cycles_2_to_10(self):
        L = [float(n) for n in range(1, 101)]          # L_n = n: 8 lost over cycles 2..10
        P = [0.5 * n for n in range(1, 101)]           # half of it plated
        self.assertAlmostEqual(Y.phi10(P, L), 0.5)

    def test_uses_cycle_2_and_10_only(self):
        L = [0.0, 1.0] + [3.0] * 8 + [99.0] * 90
        P = [0.0, 0.0] + [1.5] * 8 + [0.0] * 90
        self.assertAlmostEqual(Y.phi10(P, L), 0.75)

    def test_no_loss_is_nan(self):
        self.assertTrue(math.isnan(Y.phi10([0.0] * 100, [1.0] * 100)))


class TestGate(unittest.TestCase):
    def test_median_at_threshold_is_on(self):
        self.assertTrue(Y.gate_on([0.05, 0.10, 0.20], 0.10))
        self.assertFalse(Y.gate_on([0.05, 0.09, 0.20], 0.10))

    def test_nan_dropped_and_empty_off(self):
        self.assertTrue(Y.gate_on([float("nan"), 0.95, 0.99], 0.9))
        self.assertFalse(Y.gate_on([float("nan")], 0.9))


class TestJudge(unittest.TestCase):
    def test_all_supported(self):
        v = Y.judge(3, 18, 0.0, -30.0, (-5.0, -1.0))
        self.assertEqual(set(v.values()), {"supported"})

    def test_refutation_lines(self):
        v = Y.judge(1, 16, 1.38, -9.0, (0.5, 2.0))
        self.assertEqual(set(v.values()), {"refuted"})

    def test_inconclusive_band(self):
        v = Y.judge(2, 17, 0.5, -20.0, (-1.0, 1.0))
        self.assertEqual(set(v.values()), {"inconclusive"})


if __name__ == "__main__":
    unittest.main()
