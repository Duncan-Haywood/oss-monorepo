import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("fresh7g_run", ROOT / "fresh7g" / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["fresh7g_run"] = run
spec.loader.exec_module(run)


def rows(es, scs, pool="p"):
    """Synthetic designs: e at every k = es[i] * (60 - k) / 50, S_C = scs[i]."""
    return [dict(set="s", pool=pool, mC=1 + c, E={k: e * (60 - k) / 50 for k in run.KS}) for e, c in zip(es, scs)]


def lstsq(X, y):
    n = len(y)
    xs = [r[1] for r in X]
    mx, my = sum(xs) / n, sum(y) / n
    b = sum((a - mx) * (c - my) for a, c in zip(xs, y)) / sum((a - mx) ** 2 for a in xs)
    return [my - b * mx, b]


def spearman(x, y):
    rk = lambda v: [sorted(v).index(a) for a in v]
    rx, ry = rk(x), rk(y)
    n = len(x)
    mx = my = (n - 1) / 2
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return num / (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5


class Fresh7g(unittest.TestCase):
    def test_fit_apply_picks_strongest_observable(self):
        obs = [dict(A=i, B=(i * 7) % 5) for i in range(6)]
        ms = [1 + 0.1 * i for i in range(6)]
        pick, m = run.fit_apply(ms, obs, dict(A=10, B=0), ("A", "B"), spearman, lstsq)
        self.assertEqual(pick, "A")
        self.assertAlmostEqual(m, 2.0)

    def test_choose_margin3_permissive_when_all_meet(self):
        pools = [rows([1, 1, 1, 1], [0, 0, 0, 0], p) for p in "abc"]
        m, ok = run.choose_margin3(pools, "U")
        self.assertTrue(ok)
        self.assertEqual(m, run.GRID["U"][0])

    def test_score_fallback_is_u50(self):
        te = rows([1, 2, 3, 4], [0.1, 0.2, 0.3, 0.4])
        s = run.score(te, None)
        self.assertTrue(s["met"])
        self.assertEqual(s["cycles"], 50.0)

    def test_verdict_thresholds(self):
        mk = lambda met, cyc: dict(met=met, cycles=cyc)
        S = dict(frozen=dict(theta=mk(9, 40.0), F=mk(10, 39.0)), refit=dict(theta=mk(3, 40.0)))
        V = run.verdicts(S)
        self.assertEqual((V["H281"], V["H282"], V["H283"], V["H284"]),
                         ("supported", "supported", "refuted", "supported"))
        S = dict(frozen=dict(theta=mk(6, 46.0), F=mk(6, 39.0)), refit=dict(theta=mk(1, 30.0)))
        V = run.verdicts(S)
        self.assertEqual((V["H281"], V["H282"], V["H283"], V["H284"]),
                         ("refuted", "refuted", "supported", "refuted"))

    def test_frozen_folds_reproduce_7f(self):
        rs = run.F7.load()
        d7 = json.loads((ROOT / "margin7f" / "summary.json").read_text())["folds"]["theta"]
        for f7 in d7:
            f = run.M7.fold(rs, f7["set"], f7["pool"], "theta", nested=True)
            self.assertEqual(f["met"], f7["met"])
            self.assertAlmostEqual(f["cycles"], f7["cycles"])
            self.assertEqual(run.lab_s(f["policy"]), f7["policy"])

    def test_picks_disjoint_from_earlier_pools(self):
        J = run.jobs()
        self.assertEqual(len(J), 32)
        seen = set()
        for d in ("depth", "freshnode", "rangeline"):
            seen |= {(json.loads(l)["cond"], json.loads(l)["j"]) for l in (ROOT / d / "bench.jsonl").open()}
        self.assertFalse({(c, j) for c, j, _ in J} & seen)


if __name__ == "__main__":
    unittest.main()
