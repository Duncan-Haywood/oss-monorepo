"""Tests for experiments/sei7zc (milestone 7zc): the lever (7zb's plus SEI resistivity x 0) and the directory wiring."""
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


C = _mod("sei7zc_run", EXP / "sei7zc" / "run.py")


def _pv():
    return {C.B.PL_KEY: lambda c_e, c_Li, T: 3.0 * c_e, C.B.SEI_KEY: 2.5e-22, C.RHO_KEY: 2e5}


class TestLever(unittest.TestCase):
    def test_plating_off_sei_scaled_resistance_off(self):
        pv = C.scaled(_pv(), 1e4)
        self.assertEqual(pv[C.B.PL_KEY](2.0, 0.0, 298.0), 0.0)
        self.assertAlmostEqual(pv[C.B.SEI_KEY], 2.5e-18)
        self.assertEqual(pv[C.RHO_KEY], 0.0)

    def test_control_leaves_everything(self):
        pv = C.scaled(_pv(), C.B.CONTROL)
        self.assertEqual(pv[C.B.PL_KEY](2.0, 0.0, 298.0), 6.0)
        self.assertEqual(pv[C.B.SEI_KEY], 2.5e-22)
        self.assertEqual(pv[C.RHO_KEY], 2e5)

    def test_constant_plating_value(self):
        pv = _pv()
        pv[C.B.PL_KEY] = 1.5
        self.assertEqual(C.scaled(pv, 10.0)[C.B.PL_KEY], 0.0)


class TestWiring(unittest.TestCase):
    def test_7zb_code_points_here(self):
        self.assertEqual(C.B.HERE, EXP / "sei7zc")
        C.B._point_here()
        self.assertEqual(C.B.R.HERE, EXP / "sei7zc")

    def test_rho_fixed_in_plan(self):
        self.assertEqual(C.RHO, 0.0)
        self.assertEqual(C.B.LADDER, (10.0, 100.0, 1e3, 1e4, 1e5, 1e6))


class TestEightPooling(unittest.TestCase):
    def test_relabel_keeps_both_marquis_cells(self):
        S = C.B.R._s7p()
        za = [dict(set="Marquis2019", pool="p1", cycles=20.0, met=True)]
        mine = [dict(q, set=q["set"] + C.B.SET_TAG) for q in za]
        pr = S.paired(za + mine, za + mine)
        self.assertEqual(len(pr), 2)


if __name__ == "__main__":
    unittest.main()
