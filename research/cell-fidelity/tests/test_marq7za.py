"""Tests for experiments/marq7za (milestone 7za): H358 to H361's verdicts and the post hoc oracle's pick."""
import importlib.util
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


Z = _mod("marq7za_run", EXP / "marq7za" / "run.py")


class TestJudge(unittest.TestCase):
    def test_all_supported(self):
        v = Z.judge(-30.0, 5, -30.0, (-12.0, -1.0))
        self.assertEqual(set(v.values()), {"supported"})

    def test_all_refuted(self):
        v = Z.judge(+2.0, 2, -5.0, (0.5, 3.0))
        self.assertEqual(set(v.values()), {"refuted"})

    def test_inconclusive_middle(self):
        v = Z.judge(0.0, 3, -15.0, (-3.0, +2.0))
        self.assertEqual(set(v.values()), {"inconclusive"})

    def test_h360_boundary(self):
        self.assertEqual(Z.judge(-1, 4, -25.0, (-1, -0.5))["H360"], "supported")
        self.assertEqual(Z.judge(-1, 4, -10.0, (-1, -0.5))["H360"], "inconclusive")


class TestOracle(unittest.TestCase):
    def test_more_met_wins(self):
        self.assertEqual(Z.oracle_pick(dict(met=4, cycles=40), dict(met=2, cycles=30)), "thetaH")

    def test_tie_goes_to_fewer_cycles_else_theta(self):
        self.assertEqual(Z.oracle_pick(dict(met=2, cycles=20), dict(met=2, cycles=30)), "thetaH")
        self.assertEqual(Z.oracle_pick(dict(met=2, cycles=30), dict(met=2, cycles=30)), "theta")


if __name__ == "__main__":
    unittest.main()
