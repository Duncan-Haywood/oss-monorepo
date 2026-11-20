"""Tests for experiments/plating7r (milestone 7r): the probe band, the choice of the smallest passing multiplier, the
monotone/slope check, and a control that multiplier 1 reproduces 7p's probe rows."""
import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
D = EXP / "plating7r"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


R = _mod("plating7r_run", D / "run.py")


def _row(j, end, pl10=1.0, ok=True):
    pl = [[0.0] * 3 for _ in range(20)]
    pl[1] = [1.0, 0.0, 0.0]
    pl[9] = [pl10, 0.0, 0.0]
    return dict(j=j, ok=ok, ok_cycles=20, pl_node=pl, lost_mol=[0.0, 1.0] + [1.0] * 17 + [end])


class Probe(unittest.TestCase):
    def test_band_and_plating(self):
        n_li = {j: 100.0 for j in range(4)}
        self.assertTrue(R.passes(*R.probe_fade([_row(j, 5.0) for j in range(4)], n_li)))     # 0.04
        self.assertFalse(R.passes(*R.probe_fade([_row(j, 3.0) for j in range(4)], n_li)))    # 0.02, below
        self.assertFalse(R.passes(*R.probe_fade([_row(j, 30.0) for j in range(4)], n_li)))   # 0.29, above 0.20
        self.assertFalse(R.passes(*R.probe_fade([_row(j, 5.0, pl10=0.0) for j in range(4)], n_li)))
        self.assertFalse(R.passes(*R.probe_fade([_row(j, 5.0) for j in range(3)], n_li)))

    def test_choose_smallest_passing(self):
        good, bad = (4, True, 0.05), (4, True, 0.01)
        res = {(c, f): bad for c in R.CELLS for f in R.MULTS}
        res[("Mohtat2020@3x", 10.0)] = good
        res[("Mohtat2020@3x", 30.0)] = good
        self.assertEqual(R.choose(res), {"Mohtat2020@3x": 10.0})

    def test_monotone_slope(self):
        rising, slope = R.monotone_slope([(1.0, 0.005), (10.0, 0.05), (100.0, 0.5)])
        self.assertTrue(rising)
        self.assertAlmostEqual(slope, 1.0)
        self.assertFalse(R.monotone_slope([(1.0, 0.005), (10.0, 0.004), (100.0, 0.5)])[0])
        self.assertFalse(R.monotone_slope([(1.0, 0.005), (10.0, None)])[0])


class Control(unittest.TestCase):
    def test_multiplier_one_reproduces_7p(self):
        p = D / "control.json"
        if not p.exists():
            self.skipTest("control not run")
        rows = json.loads(p.read_text())
        self.assertEqual(len(rows), 2 * R.N_PROBE)
        for r in rows:
            self.assertTrue(r["ok"], r)
            self.assertLessEqual(r["max_rel"], 1e-9, r)

    def test_loss_rises_with_multiplier_on_every_design(self):
        p = D / "probe.jsonl"
        if not p.exists():
            self.skipTest("probe not run")
        rows = [json.loads(l) for l in p.open() if l.strip()]
        for c in R.CELLS:
            for j in range(R.N_PROBE):
                v = [next((r["lost_mol"][19] for r in rows if r["cond"] == c and r["j"] == j and r["mult"] == f
                           and r.get("ok")), math.nan) for f in R.MULTS]
                fin = [x for x in v if not math.isnan(x)]
                self.assertEqual(fin, sorted(fin), (c, j, v))


if __name__ == "__main__":
    unittest.main()
