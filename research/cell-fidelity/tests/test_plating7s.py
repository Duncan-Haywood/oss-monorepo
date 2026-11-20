"""Tests for experiments/plating7s (milestone 7s): the fixed multiplier, the choose file, H322 to H325's verdicts,
and that the redirect keeps 7r's probe rows."""
import importlib.util
import json
import sys
import tempfile
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


S = _mod("plating7s_run", EXP / "plating7s" / "run.py")


def _summary(q75=(0.1, 0.1), all_mean=-3.0, boot=(-6.0, -0.5), new_mean=-2.0, met=(5, 5)):
    sets = ("Mohtat2020", "Ecker2015")
    return dict(pools={s: dict(q75_10=q) for s, q in zip(sets, q75)},
                per_set={s: dict(theta=dict(met=m)) for s, m in zip(sets, met)},
                paired=dict(theta=dict(all=dict(mean=all_mean, boot=list(boot)), new=dict(mean=new_mean, boot=None))))


class Judge(unittest.TestCase):
    def test_all_supported(self):
        V, _ = S.judge(_summary(), _summary())
        self.assertEqual(set(V.values()), {"supported"})

    def test_refutations(self):
        V, _ = S.judge(_summary(q75=(0.1, 1.5), all_mean=0.5, boot=(-2, 3), new_mean=1.0, met=(2, 5)), _summary())
        self.assertEqual(set(V.values()), {"refuted"})

    def test_inconclusive_middle(self):
        V, _ = S.judge(_summary(q75=(0.1, 0.5), all_mean=-1.0, boot=(-4, 1), new_mean=0.0, met=(3, 5)), _summary())
        self.assertEqual(set(V.values()), {"inconclusive"})


class Setup(unittest.TestCase):
    def test_multiplier_is_one_that_passed_7r_probe(self):
        self.assertIn(S.MULT, S.R.MULTS)
        ch = json.loads((EXP / "plating7r" / "choose.json").read_text())
        for c in S.R.CELLS:
            self.assertGreaterEqual(S.MULT, ch["kept"][c])
            r = ch["results"][f"{c}*{S.MULT:g}"]
            self.assertTrue(S.R.passes(r["finished"], r["plates"], r["fade"]))

    def test_redirect_keeps_7r_probe(self):
        old_here, old_probe = S.R.HERE, S.R._probe_res
        try:
            S._point_here()
            self.assertEqual(S.R.HERE, S.HERE)
            res = S.R._probe_res()
            self.assertEqual(S.R.HERE, S.HERE)
            self.assertAlmostEqual(res[("Mohtat2020@3x", 30.0)][2], 0.1066, places=3)
        finally:
            S.R.HERE, S.R._probe_res = old_here, old_probe


if __name__ == "__main__":
    unittest.main()
