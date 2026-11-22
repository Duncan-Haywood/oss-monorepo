"""Tests for experiments/plating7z (milestone 7z): the redirect of 7r's code, phi10, the pooling and H354 to H357."""
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


Z = _mod("plating7z_run", EXP / "plating7z" / "run.py")


class Redirect(unittest.TestCase):
    def test_points_7r_at_this_step(self):
        Z._point_here()
        self.assertEqual(Z.R.HERE, EXP / "plating7z")
        self.assertEqual(Z.R.CELLS, ("Marquis2019@2x",))
        self.assertEqual(Z.R.BASE_FADE, {"Marquis2019@2x": 0.0016})
        self.assertEqual(Z.R.MULTS, (3.0, 10.0, 30.0, 100.0))   # 7r's ladder, unchanged

    def test_choose_uses_this_cell(self):
        Z._point_here()
        res = {("Marquis2019@2x", 3.0): (4, True, 0.01), ("Marquis2019@2x", 10.0): (4, True, 0.05),
               ("Marquis2019@2x", 30.0): (4, True, 0.12), ("Marquis2019@2x", 100.0): (4, True, 0.3)}
        self.assertEqual(Z.R.choose(res), {"Marquis2019@2x": 10.0})


class Phi(unittest.TestCase):
    def test_share(self):
        P = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9.0]
        L = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10.0]
        self.assertAlmostEqual(Z.phi10(P, L), 8 / 8)
        self.assertIsNone(Z.phi10(P, [1.0] * 10))


class Pool(unittest.TestCase):
    def test_pairs(self):
        S = Z.R._s7p()
        a = [dict(set=s, pool=p, cycles=c, met=True) for s, p, c in (("A", 1, 10), ("A", 2, 20), ("B", 1, 30))]
        b = [dict(set=s, pool=p, cycles=c, met=m) for s, p, c, m in (("A", 1, 15, True), ("A", 2, 20, False),
                                                                    ("B", 1, 40, True))]
        d = Z.pool_pairs(S, a, b)
        self.assertEqual((d["n"], d["sets"], d["cheaper"], d["dearer"], d["met_a"], d["met_b"]), (3, 2, 2, 0, 3, 2))
        self.assertAlmostEqual(d["mean"], -5.0)
        self.assertEqual(d["per_set"], {"A": -2.5, "B": -10.0})


class Judge(unittest.TestCase):
    def test_supported(self):
        V = Z.judge({"Marquis2019@2x": 10.0}, 0.1, 5, dict(mean=-3.0, boot=[-6.0, -0.5]))
        self.assertEqual(set(V.values()), {"supported"})

    def test_refuted(self):
        V = Z.judge({"Marquis2019@2x": 10.0}, 1.5, 2, dict(mean=0.2, boot=[-2.0, 3.0]))
        self.assertEqual([V[h] for h in ("H355", "H356", "H357")], ["refuted"] * 3)

    def test_inconclusive(self):
        V = Z.judge({"Marquis2019@2x": 10.0}, 0.5, 3, dict(mean=-1.0, boot=[-3.0, 1.0]))
        self.assertEqual([V[h] for h in ("H355", "H356", "H357")], ["inconclusive"] * 3)

    def test_nothing_kept(self):
        V = Z.judge({}, None, None, None)
        self.assertEqual(V["H354"], "refuted")
        self.assertTrue(all(V[h].startswith("not run") for h in ("H355", "H356", "H357")))


if __name__ == "__main__":
    unittest.main()
