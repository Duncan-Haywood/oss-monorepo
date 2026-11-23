"""Tests for experiments/sei7zb (milestone 7zb): the SEI probe rule, the ladder choice and H362 to H366's verdicts."""
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


B = _mod("sei7zb_run", EXP / "sei7zb" / "run.py")


def _row(j, lost20, pl20, lost2=0.0):
    lost = [0.0] * 20
    pl = [0.0] * 20
    lost[1], lost[19], pl[19] = lost2, lost20, pl20
    return dict(j=j, ok=True, ok_cycles=20, lost_mol=lost, pl_mol=pl)


class TestProbe(unittest.TestCase):
    def test_fade_and_no_plating(self):
        rows = [_row(j, 0.05 * (j + 1), 0.0) for j in range(4)]
        n, plates, f = B.probe_res(rows, {j: 1.0 for j in range(4)})
        self.assertEqual((n, plates), (4, False))
        self.assertAlmostEqual(f, 0.125)
        self.assertTrue(B.sei_passes(n, plates, f))

    def test_plating_share_fails(self):
        rows = [_row(j, 0.1, 0.002 if j == 2 else 0.0) for j in range(4)]
        n, plates, f = B.probe_res(rows, {j: 1.0 for j in range(4)})
        self.assertTrue(plates)
        self.assertFalse(B.sei_passes(n, plates, f))

    def test_unfinished_and_out_of_band(self):
        self.assertFalse(B.sei_passes(3, False, 0.1))
        self.assertFalse(B.sei_passes(4, False, 0.02))
        self.assertFalse(B.sei_passes(4, False, 0.25))


class TestDiag(unittest.TestCase):
    def test_sqrt_growth_and_choked_charge(self):
        r = dict(j=0, ok=True, ok_cycles=20, lost_mol=[0.5 * (k + 1) ** 0.5 for k in range(20)],
                 t_ch=[100.0] * 19 + [10.0])
        d = B.diag([r], {0: 10.0})
        self.assertAlmostEqual(d["slope"], 0.5)
        self.assertAlmostEqual(d["t_ch_ratio"], 0.1)
        self.assertAlmostEqual(d["lost_c1"], 0.05)

    def test_none_when_nothing_finished(self):
        self.assertIsNone(B.diag([dict(j=0, ok=False)], {0: 1.0}))


class TestChoose(unittest.TestCase):
    def test_smallest_on_ladder_and_g1_ignored(self):
        res = {1.0: (4, False, 0.1), 10.0: (4, False, 0.01), 100.0: (4, False, 0.05), 1e3: (4, False, 0.1)}
        self.assertEqual(B.choose(res), 100.0)

    def test_none(self):
        self.assertIsNone(B.choose({g: (4, False, 0.001) for g in B.LADDER}))


class TestJudge(unittest.TestCase):
    def test_all_supported(self):
        self.assertEqual(set(B.judge(1e4, (0.2, 0.2), -20.0, 4, "thetaH").values()), {"supported"})

    def test_all_refuted(self):
        v = B.judge(1e4, (0.03, 0.0), 3.0, 2, "theta")
        self.assertEqual({v[h] for h in ("H363", "H364", "H365", "H366")}, {"refuted"})
        self.assertEqual(v["H362"], "supported")

    def test_no_kept_cell(self):
        v = B.judge(None, None, None, None, None)
        self.assertEqual(v["H362"], "refuted")
        self.assertTrue(all(v[h].startswith("not run") for h in ("H363", "H364", "H365", "H366")))

    def test_h363_middle_and_one_sided(self):
        self.assertEqual(B.judge(10.0, (0.07, 0.07), -1, 4, "thetaH")["H363"], "inconclusive")
        self.assertEqual(B.judge(10.0, (0.2, 0.02), -1, 4, "thetaH")["H363"], "inconclusive")


if __name__ == "__main__":
    unittest.main()
