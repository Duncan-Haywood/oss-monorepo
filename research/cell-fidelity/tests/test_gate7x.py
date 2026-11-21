"""Tests for experiments/gate7x (milestone 7x): H344 to H348's verdicts, the out-of-fold corrector, the gate and the
nested refit's control (m_hat = 1 reproduces 7h's refit)."""
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


X = _mod("gate7x_run", EXP / "gate7x" / "run.py")
POOLS = ("a", "b", "c", "d", "e")


def _rows():
    out = []
    for i in range(30):
        p = POOLS[i % 5]
        o = (i * 7 % 11) / 10
        out.append(dict(k=i, pool=p, set="s", E={10: 0.02 + 0.03 * o, 15: 0.02, 20: 0.015, 25: 0.012, 30: 0.01,
                                                  40: 0.008, 50: 0.006},
                        cells=None))
    inp = {r["k"]: dict(m=1 + (i * 7 % 11) / 20, O1=(i * 7 % 11) / 10, O2=i % 3, O3=-(i % 4)) for i, r in
           enumerate(out)}
    return out, inp


def _fit(train):
    y = [t["m"] for t in train]
    x = [t["O1"] for t in train]
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxx = sum((a - mx) ** 2 for a in x) or 1.0
    b = sum((a - mx) * (c - my) for a, c in zip(x, y)) / sxx
    return "O1", [my - b * mx, b]


def _pred(beta, x):
    return beta[0] + beta[1] * x[0]


def _err(d, mh):
    return abs(d["m"] - mh) / 10


class Judge(unittest.TestCase):
    def test_all_supported(self):
        self.assertEqual(set(X.judge(19, -0.5, -30.0, 18, (-3.0, -0.1)).values()), {"supported"})

    def test_all_refuted(self):
        self.assertEqual(set(X.judge(16, 1.38, -9.0, 16, (0.1, 2.0)).values()), {"refuted"})

    def test_middle_inconclusive(self):
        self.assertEqual(set(X.judge(17, 0.5, -20.0, 17, (-1.0, 1.0)).values()), {"inconclusive"})


class Corrector(unittest.TestCase):
    def test_oof_uses_only_other_pools(self):
        rs, inp = _rows()
        cor = X.Corrector(rs, inp, _err, _fit, _pred)
        tr = X.oof(rs, ("a", "b", "c", "d"), cor)
        self.assertEqual({r["pool"] for r in tr}, {"a", "b", "c", "d"})
        for r in tr:
            self.assertEqual(r["E"][10], cor.e10({"a", "b", "c", "d"} - {r["pool"]})[r["k"]])
        self.assertNotIn(frozenset("abcde"), cor.cache)

    def test_ident_is_straight(self):
        rs, inp = _rows()
        idc = X.Corrector(rs, inp, _err, _fit, _pred, ident=True)
        self.assertEqual(idc.e10({"a"}), {r["k"]: r["E"][10] for r in rs})

    def test_gate_prefers_better_forecast(self):
        rs, inp = _rows()
        # the line fits m on O1 exactly, so out-of-fold corrected errors are ~0 and beat the straight E10
        self.assertTrue(X.gate(rs, "e", POOLS, X.Corrector(rs, inp, _err, _fit, _pred)))
        bad = lambda d, mh: 1.0
        self.assertFalse(X.gate(rs, "e", POOLS, X.Corrector(rs, inp, bad, _fit, _pred)))


class Nested(unittest.TestCase):
    def test_ident_reproduces_refit(self):
        H = X._h()
        W = X._w()
        rs = [r for r in W.rows() if r["set"] == "Ai2020"]     # 50 rows, real E windows
        for r in rs:
            r["k"] = r["key"]
        pools = H.ALL_POOLS
        idc = X.Corrector(rs, {}, None, None, None, ident=True)
        for rule in ("theta", "U"):
            for p in pools[:2]:
                a = X.nested_refit(rs, p, pools, rule, idc, H)
                b = H.refit([[r for r in rs if r["pool"] == q] for q in pools if q != p],
                            [r for r in rs if r["pool"] == p], rule)
                self.assertEqual((a["cycles"], a["met"], a["policy"]), (b["cycles"], b["met"], b["policy"]))


if __name__ == "__main__":
    unittest.main()
