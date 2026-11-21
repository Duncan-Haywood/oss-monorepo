"""Tests for experiments/rule7w (milestone 7w): H340 to H343's verdicts, the per-fold E10 swap and the post-hoc gate."""
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


W = _mod("rule7w_run", EXP / "rule7w" / "run.py")


def _rows():
    return [dict(key=(f"c{k}", k, p), pool=p, E={10: 0.1 * (k + 1), 15: 0.05}) for k, p in
            enumerate(("a", "a", "b", "b", "c"))]


class Judge(unittest.TestCase):
    def test_all_supported(self):
        v = W.judge(-3.0, 16, 20, (-20.0, -2.0), -1.0)
        self.assertEqual(set(v.values()), {"supported"})

    def test_refuted_edges(self):
        v = W.judge(2.0, 11, 20, (1.0, 5.0), 0.5)
        self.assertEqual(set(v.values()), {"refuted"})

    def test_inconclusive_middle_and_ties(self):
        v = W.judge(0.0, 13, 20, (-1.0, 1.0), 0.0)
        self.assertEqual(set(v.values()), {"inconclusive"})


class Swap(unittest.TestCase):
    def test_only_e10_changes(self):
        rs = _rows()
        e10 = {r["key"]: 9.0 for r in rs}
        out = W.with_e10(rs, e10)
        self.assertTrue(all(r["E"][10] == 9.0 and r["E"][15] == 0.05 for r in out))
        self.assertTrue(all(r["E"][10] != 9.0 for r in rs))    # originals untouched

    def test_fold_fit_sees_training_pools_only(self):
        rs = _rows()
        inputs = {r["key"]: dict(m=1.0 + i, O1=float(i), O2=0.0, O3=0.0) for i, r in enumerate(rs)}
        seen = []

        def fit(tr):
            seen.append(len(tr))
            return "O1", [0.0, 1.0]
        best, e = W.fold_e10(rs, "c", inputs, lambda d, mh: mh, fit, lambda b, x: b[0] + b[1] * x[0])
        self.assertEqual(seen, [4])
        self.assertEqual(best, "O1")
        self.assertEqual(sorted(e.values()), [0.0, 1.0, 2.0, 3.0, 4.0])


class Gate(unittest.TestCase):
    def test_gate_uses_training_medians_only(self):
        rs = _rows()
        better = {r["key"]: 0.0 if r["pool"] != "c" else 99.0 for r in rs}
        worse = {r["key"]: 99.0 if r["pool"] != "c" else 0.0 for r in rs}
        self.assertTrue(W.gate(rs, "c", better))
        self.assertFalse(W.gate(rs, "c", worse))


if __name__ == "__main__":
    unittest.main()
