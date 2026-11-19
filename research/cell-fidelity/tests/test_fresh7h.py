import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("fresh7h_run", ROOT / "fresh7h" / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["fresh7h_run"] = run
spec.loader.exec_module(run)


def rows(es, scs, pool="p"):
    """Synthetic designs: e at every k = es[i] * (60 - k) / 50, S_C = scs[i]."""
    return [dict(set="s", pool=pool, mC=1 + c, E={k: e * (60 - k) / 50 for k in run.KS}) for e, c in zip(es, scs)]


class Fresh7h(unittest.TestCase):
    def test_rel_scores_divide_by_own_pool_median(self):
        rs = rows([1, 1, 1], [0.1, 0.2, 0.3], "a") + rows([1, 1, 1], [1.0, 2.0, 3.0], "b")
        self.assertEqual([round(v, 9) for v in run.rel_scores(rs)], [0.5, 1, 1.5, 0.5, 1, 1.5])

    def test_relative_rule_is_scale_free(self):
        te = rows([1, 2, 3, 4], [0.1, 0.2, 0.3, 0.4])
        te10 = rows([1, 2, 3, 4], [1.0, 2.0, 3.0, 4.0])
        lab = ("R", 50, 1.2)
        self.assertEqual(run.apply(te, lab), run.apply(te10, lab))
        self.assertEqual(run.flag_share(te, lab), run.flag_share(te10, lab))
        # the absolute rule is not
        self.assertNotEqual(run.apply(te, ("TH", 50, 0.25)), run.apply(te10, ("TH", 50, 0.25)))

    def test_r50_flags_high_drift_designs(self):
        # designs with large e (bad at k=10) carry large S_C: the rule should flag them and meet the target cheaply
        pools = [rows([1, 1, 1, 1, 1, 8, 9, 10], [0.1, 0.1, 0.12, 0.1, 0.11, 0.9, 1.0, 1.1], p) for p in "abcd"]
        tr = [r for p in pools for r in p]
        lab = run.PICK["R50"](tr, 1.25)
        self.assertEqual(lab[0], "R")
        self.assertEqual(lab[1], 50)
        q, c = run.apply(pools[0], lab)
        self.assertLessEqual(q, run.target(pools[0]) + 1e-12)
        self.assertLess(c, 50)

    def test_choose_margin_permissive_when_all_meet(self):
        pools = [rows([1, 1, 1, 1], [0, 0, 0, 0], p) for p in "abcd"]
        m, ok = run.choose_margin(pools, "U")
        self.assertTrue(ok)
        self.assertEqual(m, run.TT[0])

    def test_theta_matches_7f_pick(self):
        tr = rows([1, 2, 3, 9, 5, 2], [0.1, 0.3, 0.2, 0.9, 0.5, 0.1])
        self.assertEqual(run.PICK["theta"](tr, 1.1), run.M7.pick_theta(tr, 1.1))

    def test_verdict_thresholds(self):
        mk = lambda met, cyc: dict(met=met, cycles=cyc)
        S = dict(frozen7f=mk(9, 40), refit=dict(R50=mk(3, 40), theta50=mk(2, 45), theta=mk(2, 40)),
                 drift=dict(R50=0.05, theta50=0.2), lopo5=dict(R50=mk(15, 40)))
        V = run.verdicts(S)
        self.assertEqual([V[h] for h in ("H285", "H286", "H287", "H288", "H289")], ["supported"] * 5)
        S = dict(frozen7f=mk(6, 40), refit=dict(R50=mk(1, 40), theta50=mk(1, 45), theta=mk(2, 40)),
                 drift=dict(R50=0.3, theta50=0.2), lopo5=dict(R50=mk(11, 40)))
        V = run.verdicts(S)
        self.assertEqual([V[h] for h in ("H285", "H286", "H287", "H288", "H289")], ["refuted"] * 5)

    def test_picks_disjoint_from_every_earlier_pool(self):
        J = run.jobs()
        self.assertEqual(len(J), 64)
        seen = set()
        for d in ("depth", "freshnode", "rangeline", "fresh7g"):
            seen |= {(json.loads(l)["cond"], json.loads(l)["j"]) for l in (ROOT / d / "bench.jsonl").open()}
        self.assertFalse({(c, j) for c, j, _ in J} & seen)
        self.assertEqual(len({(c, j) for c, j, _ in J}), 64)


if __name__ == "__main__":
    unittest.main()
