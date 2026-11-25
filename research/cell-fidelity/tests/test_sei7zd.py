"""Tests for experiments/sei7zd (milestone 7zd): the resistivity ladder's wiring, the shim and H372 to H376."""
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


Z = _mod("sei7zd_run", EXP / "sei7zd" / "run.py")


def _row(rho, kept=None, fade=0.03, tch=0.9, **kw):
    r = dict(rho=rho, kept=kept, fade_ref=fade, tch_ref=tch)
    r.update(kw)
    return r


class TestPlan(unittest.TestCase):
    def tearDown(self):                          # point() mutates 7zc's shared modules; put 7zc's wiring back
        Z.point(EXP / "sei7zc", 0.0)

    def test_ladder_fixed_in_plan(self):
        self.assertEqual(Z.RHOS, (1e-3, 1e-2, 1e-1))
        self.assertEqual(Z.G_REF, 1e5)

    def test_rung_dir_round_trips_rho(self):
        for r in Z.RHOS:
            self.assertEqual(Z.rho_of(Z.rung_dir(r)), r)

    def test_point_sets_lever_and_dirs(self):
        d = Z.rung_dir(1e-2)
        Z.point(d, 1e-2)
        self.assertEqual(Z.C.RHO, 1e-2)
        self.assertEqual(Z.B.HERE, d)
        self.assertEqual(Z.B.R.HERE, d)
        pv = {Z.B.PL_KEY: 1.0, Z.B.SEI_KEY: 2.5e-22, Z.C.RHO_KEY: 2e5}
        self.assertAlmostEqual(Z.C.scaled(pv, 10.0)[Z.C.RHO_KEY], 2e3)

    def test_shim_is_committed_for_every_rung(self):
        for r in Z.RHOS:
            p = Z.rung_dir(r) / "run.py"
            if p.exists():
                self.assertEqual(p.read_text(), Z.SHIM)


class TestJudge(unittest.TestCase):
    def test_monotone(self):
        self.assertTrue(Z.monotone_down([3, 2, 1]))
        self.assertFalse(Z.monotone_down([3, 3, 1]))

    def test_no_kept_middle(self):
        rows = [_row(0, 1e5, 0.04, 0.99, D=0.6, gD=5, pick="thetaH", d_DT=-39), _row(1e-3, fade=0.02, tch=0.8),
                _row(1, fade=0.01, tch=0.1)]
        V = Z.judge(rows)
        self.assertEqual(V["H372"], "refuted")
        self.assertEqual(V["H373"], "supported")
        self.assertTrue(V["H374"].startswith("not run"))

    def test_kept_middle_and_gate_disagreement(self):
        rows = [_row(0, 1e5, 0.04, 0.99, D=0.6, gD=5, pick="thetaH", d_DT=-39),
                _row(1e-2, 1e6, 0.03, 0.95, D=0.2, gD=1, pick="thetaH", d_DT=2.0),
                _row(1, fade=0.035, tch=0.1)]
        V = Z.judge(rows)
        self.assertEqual(V["H372"], "supported")
        self.assertEqual(V["H373"], "refuted")
        self.assertEqual(V["H374"], "supported")
        self.assertEqual(V["H375"], "refuted")
        self.assertEqual(V["H376"], "refuted")


if __name__ == "__main__":
    unittest.main()
