"""Tests for experiments/poles7q (milestone 7q): the PyBaMM Ramadass2004 cathode fit matches the table the programme
used, its poles, the running-maximum envelope, and the end-of-charge stoichiometry."""
import importlib.util
import json
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


Q = _mod("poles7q_run", EXP / "poles7q" / "run.py")


class Fit(unittest.TestCase):
    def test_table_is_pybamm_fit(self):
        o = json.loads((EXP / "sets7p" / "ocp.json").read_text())
        up = o["sets"]["Ramadass2004"]["Up"]
        self.assertLess(max(abs(Q.u_ramadass(y) - u) for y, u in zip(o["grid"], up)), 1e-6)

    def test_poles(self):
        poles = Q.zeros(lambda y: Q.even_poly(Q.DEN, Q.STRETCH * y), 0.0, 1.0)
        self.assertEqual([round(p, 3) for p in poles], [0.245, 0.374, 0.889])
        # without the stretch, the last pole sits just outside the stoichiometry range
        self.assertGreater(max(Q.zeros(lambda t: Q.even_poly(Q.DEN, t), 0.0, 1.2)), 1.0)


class Envelope(unittest.TestCase):
    def test_monotone_and_identity_on_monotone_tables(self):
        v = [5.0, 4.5, 4.2, 4.0, 3.9]
        self.assertEqual(Q.envelope_from_top(v), v)
        w = Q.envelope_from_top([5.0, 1.0, 9.0, 4.0, 3.9])
        self.assertEqual(w, [9.0, 9.0, 9.0, 4.0, 3.9])
        self.assertTrue(all(a >= b for a, b in zip(w, w[1:])))

    def test_turns(self):
        self.assertEqual(Q.turns([1, 2, 3, 2, 1, 2]), 2)
        self.assertEqual(Q.turns([3, 2, 1]), 0)


class Charge(unittest.TestCase):
    def test_y_end(self):
        b = dict(Qp=0.1)
        q_ah = 0.01 * Q.F / 3600.0          # 0.01 mol out of the positive electrode
        self.assertAlmostEqual(Q.y_end_charge(b, q_ah, 0.0, 0.2), 0.9)      # y0 capped at 1
        self.assertAlmostEqual(Q.y_end_charge(b, q_ah, 0.02, 0.1), 0.7)     # y0 = 0.08 / 0.1


if __name__ == "__main__":
    unittest.main()
